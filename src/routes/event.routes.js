
const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const AuditLog = require('../models/AuditLog');
const { retryFailedEvent } = require('../queues/queueManager');
const logger = require('../utils/logger');



/**
 * GET /api/v1/events
 * Get list of events with filtering
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
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const events = await Event.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .select('-rawPayload -transformedPayload'); // Exclude large payloads
    
    const total = await Event.countDocuments(query);
    
    res.json({
      success: true,
      data: events,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: (parseInt(skip) + parseInt(limit)) < total
      }
    });
    
  } catch (error) {
    logger.error('Error fetching events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch events'
    });
  }
});



/**
 * GET /api/v1/events/:eventId
 * Get single event details
 */
router.get('/:eventId', async (req, res) => {
  try {
    const event = await Event.findByEventId(req.params.eventId);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    // Get audit trail for this event
    const auditTrail = await AuditLog.getAuditTrail(event.eventId);
    
    res.json({
      success: true,
      data: {
        event,
        auditTrail
      }
    });
    
  } catch (error) {
    logger.error('Error fetching event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch event'
    });
  }
});



/**
 * POST /api/v1/events/:eventId/retry
 * Manually retry a failed event
 */
router.post('/:eventId/retry', async (req, res) => {
  try {
    const event = await Event.findByEventId(req.params.eventId);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }
    
    if (event.status !== 'failed') {
      return res.status(400).json({
        success: false,
        error: 'Only failed events can be retried'
      });
    }
    
    // Log manual retry action
    await AuditLog.logAction({
      action: 'manual.intervention',
      eventId: event.eventId,
      actor: {
        type: 'user',
        userId: req.user?.id || 'admin',
        ipAddress: req.ip
      },
      details: {
        action: 'manual_retry',
        reason: req.body.reason || 'Manual retry requested'
      },
      result: {
        status: 'success',
        message: 'Manual retry initiated'
      },
      category: 'admin',
      severity: 'info'
    });
    
    // Retry the event
    await retryFailedEvent(event.eventId);
    
    res.json({
      success: true,
      message: 'Event retry initiated',
      eventId: event.eventId
    });
    
  } catch (error) {
    logger.error('Error retrying event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retry event',
      details: error.message
    });
  }
});



/**
 * GET /api/v1/events/stats/summary
 * Get event statistics
 */
router.get('/stats/summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    
    const stats = await Event.getEventStats(start, end);
    
    // Get current counts by status
    const statusCounts = await Event.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        periodStats: stats,
        currentStatus: statusCounts,
        period: { start, end }
      }
    });
    
  } catch (error) {
    logger.error('Error fetching event stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});



/**
 * GET /api/v1/events/failed/queue
 * Get all failed events (error queue)
 */
router.get('/failed/queue', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    
    const failedEvents = await Event.find({ status: 'failed' })
      .sort({ updatedAt: -1 })
      .limit(parseInt(limit))
      .select('-transformedPayload');
    
    res.json({
      success: true,
      data: failedEvents,
      total: failedEvents.length
    });
    
  } catch (error) {
    logger.error('Error fetching failed events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch error queue'
    });
  }
});




module.exports = router;
