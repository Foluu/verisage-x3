const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Event = require('../models/Event');
const AuditLog = require('../models/AuditLog');
const sageX3Client = require('../services/sageX3Client');
const logger = require('../utils/logger');

/**
 * GET /api/v1/transactions
 * Get list of synced transactions
 */
router.get('/', async (req, res) => {
  try {
    const {
      status,
      eventType,
      startDate,
      endDate,
      limit = 50,
      skip = 0
    } = req.query;
    
    const query = {};
    
    if (status) query.status = status;
    if (eventType) query.eventType = eventType;
    
    if (startDate || endDate) {
      query.syncedAt = {};
      if (startDate) query.syncedAt.$gte = new Date(startDate);
      if (endDate) query.syncedAt.$lte = new Date(endDate);
    }
    
    const transactions = await Transaction.find(query)
      .sort({ syncedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    const total = await Transaction.countDocuments(query);
    
    res.json({
      success: true,
      data: transactions,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: (parseInt(skip) + parseInt(limit)) < total
      }
    });
    
  } catch (error) {
    logger.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transactions'
    });
  }
});

/**
 * GET /api/v1/transactions/:transactionId
 * Get single transaction details
 */
router.get('/:transactionId', async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      transactionId: req.params.transactionId
    });
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }
    
    // Get related event
    const event = await Event.findByEventId(transaction.eventId);
    
    // Get audit trail
    const auditTrail = await AuditLog.find({
      $or: [
        { eventId: transaction.eventId },
        { transactionId: transaction.transactionId }
      ]
    }).sort({ timestamp: 1 });
    
    res.json({
      success: true,
      data: {
        transaction,
        event,
        auditTrail
      }
    });
    
  } catch (error) {
    logger.error('Error fetching transaction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transaction'
    });
  }
});

/**
 * POST /api/v1/transactions/:transactionId/reverse
 * Reverse a synced transaction
 */
router.post('/:transactionId/reverse', async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      transactionId: req.params.transactionId
    });
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }
    
    if (transaction.reversed) {
      return res.status(400).json({
        success: false,
        error: 'Transaction already reversed'
      });
    }
    
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Reversal reason is required'
      });
    }
    
    // Post credit note to Sage X3
    const creditNoteData = {
      originalReference: transaction.sageX3Details.documentReference,
      reason,
      reversalDate: new Date().toISOString(),
      amount: transaction.financialData?.amount || 0,
      currency: transaction.financialData?.currency || 'NGN'
    };
    
    const result = await sageX3Client.postCreditNote(creditNoteData);
    
    // Mark transaction as reversed
    await transaction.markAsReversed(
      reason,
      result.documentReference,
      req.user?.id || 'admin'
    );
    
    // Mark original event as reversed
    const event = await Event.findByEventId(transaction.eventId);
    if (event) {
      await event.markAsReversed(reason, transaction.transactionId);
    }
    
    // Log reversal
    await AuditLog.logAction({
      action: 'transaction.reversed',
      eventId: transaction.eventId,
      transactionId: transaction.transactionId,
      actor: {
        type: 'user',
        userId: req.user?.id || 'admin',
        ipAddress: req.ip
      },
      details: {
        reason,
        originalDocRef: transaction.sageX3Details.documentReference,
        reversalDocRef: result.documentReference
      },
      result: {
        status: 'success',
        message: 'Transaction reversed successfully'
      },
      category: 'reversal',
      severity: 'warning'
    });
    
    logger.info('Transaction reversed', {
      transactionId: transaction.transactionId,
      reason
    });
    
    res.json({
      success: true,
      message: 'Transaction reversed successfully',
      data: {
        transactionId: transaction.transactionId,
        reversalDocumentReference: result.documentReference
      }
    });
    
  } catch (error) {
    logger.error('Error reversing transaction:', error);
    
    await AuditLog.logAction({
      action: 'transaction.reversed',
      transactionId: req.params.transactionId,
      actor: {
        type: 'user',
        userId: req.user?.id || 'admin',
        ipAddress: req.ip
      },
      details: {
        error: error.message
      },
      result: {
        status: 'failure',
        message: 'Transaction reversal failed',
        errorDetails: error.message
      },
      category: 'reversal',
      severity: 'error'
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to reverse transaction',
      details: error.message
    });
  }
});

/**
 * POST /api/v1/transactions/:transactionId/verify
 * Mark transaction as verified
 */
router.post('/:transactionId/verify', async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      transactionId: req.params.transactionId
    });
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }
    
    if (transaction.verified) {
      return res.status(400).json({
        success: false,
        error: 'Transaction already verified'
      });
    }
    
    await transaction.markAsVerified(req.user?.id || 'admin');
    
    await AuditLog.logAction({
      action: 'transaction.verified',
      transactionId: transaction.transactionId,
      actor: {
        type: 'user',
        userId: req.user?.id || 'admin',
        ipAddress: req.ip
      },
      details: {
        documentReference: transaction.sageX3Details.documentReference
      },
      result: {
        status: 'success',
        message: 'Transaction verified'
      },
      category: 'admin',
      severity: 'info'
    });
    
    res.json({
      success: true,
      message: 'Transaction verified successfully'
    });
    
  } catch (error) {
    logger.error('Error verifying transaction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify transaction'
    });
  }
});

/**
 * GET /api/v1/transactions/stats/summary
 * Get transaction statistics
 */
router.get('/stats/summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    
    const stats = await Transaction.getTransactionStats(start, end);
    
    // Get unverified count
    const unverifiedCount = await Transaction.countDocuments({
      verified: false,
      status: 'synced'
    });
    
    // Get reversed count
    const reversedCount = await Transaction.countDocuments({
      reversed: true
    });
    
    res.json({
      success: true,
      data: {
        periodStats: stats,
        unverifiedCount,
        reversedCount,
        period: { start, end }
      }
    });
    
  } catch (error) {
    logger.error('Error fetching transaction stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

/**
 * GET /api/v1/transactions/reversed/list
 * Get all reversed transactions
 */
router.get('/reversed/list', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    
    const reversed = await Transaction.find({ reversed: true })
      .sort({ 'reversalDetails.reversedAt': -1 })
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      data: reversed,
      total: reversed.length
    });
    
  } catch (error) {
    logger.error('Error fetching reversed transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reversed transactions'
    });
  }
});

module.exports = router;
