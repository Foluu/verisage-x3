const express = require('express');
const router = express.Router();
const Configuration = require('../models/Configuration');
const AuditLog = require('../models/AuditLog');
const sageX3Client = require('../services/sageX3Client');
const logger = require('../utils/logger');

/**
 * GET /api/v1/admin/status
 * Get system status and health
 */
router.get('/status', async (req, res) => {
  try {
    // Check Sage X3 connection
    const sageStatus = await sageX3Client.checkConnection();
    
    // Check database connection
    const mongoose = require('mongoose');
    const dbStatus = {
      connected: mongoose.connection.readyState === 1,
      status: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState]
    };
    
    // Get queue health
    const Event = require('../models/Event');
    const pendingEvents = await Event.countDocuments({ status: { $in: ['received', 'validated', 'transformed'] } });
    const failedEvents = await Event.countDocuments({ status: 'failed' });
    
    res.json({
      success: true,
      status: {
        overall: sageStatus.connected && dbStatus.connected ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        components: {
          sageX3: sageStatus,
          database: dbStatus,
          queue: {
            pending: pendingEvents,
            failed: failedEvents
          }
        }
      }
    });
    
  } catch (error) {
    logger.error('Error fetching system status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system status'
    });
  }
});

/**
 * GET /api/v1/admin/config
 * Get all configurations
 */
router.get('/config', async (req, res) => {
  try {
    const { category } = req.query;
    
    let configs;
    if (category) {
      configs = await Configuration.getConfigsByCategory(category);
    } else {
      configs = await Configuration.getAllActiveConfigs();
    }
    
    res.json({
      success: true,
      data: configs
    });
    
  } catch (error) {
    logger.error('Error fetching configurations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch configurations'
    });
  }
});

/**
 * PUT /api/v1/admin/config/:key
 * Update configuration value
 */
router.put('/config/:key', async (req, res) => {
  try {
    const { value, reason } = req.body;
    const userId = req.user?.id || 'admin';
    
    const config = await Configuration.setConfig(
      req.params.key,
      value,
      userId,
      reason || 'Configuration updated via API'
    );
    
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }
    
    await AuditLog.logAction({
      action: 'config.updated',
      actor: {
        type: 'user',
        userId,
        ipAddress: req.ip
      },
      details: {
        key: req.params.key,
        reason
      },
      changeTracking: {
        before: config.previousValues[config.previousValues.length - 1]?.value,
        after: value
      },
      result: {
        status: 'success',
        message: 'Configuration updated'
      },
      category: 'admin',
      severity: 'warning'
    });
    
    res.json({
      success: true,
      message: 'Configuration updated successfully',
      data: config
    });
    
  } catch (error) {
    logger.error('Error updating configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update configuration'
    });
  }
});

/**
 * GET /api/v1/admin/audit
 * Get audit logs
 */
router.get('/audit', async (req, res) => {
  try {
    const {
      action,
      category,
      severity,
      userId,
      startDate,
      endDate,
      limit = 100
    } = req.query;
    
    const filters = {};
    if (action) filters.action = action;
    if (category) filters.category = category;
    if (severity) filters.severity = severity;
    if (userId) filters.userId = userId;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    
    const logs = await AuditLog.getActivityLog(filters, parseInt(limit));
    
    res.json({
      success: true,
      data: logs,
      total: logs.length
    });
    
  } catch (error) {
    logger.error('Error fetching audit logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit logs'
    });
  }
});

/**
 * GET /api/v1/admin/audit/critical
 * Get critical events from audit log
 */
router.get('/audit/critical', async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    
    const criticalEvents = await AuditLog.getCriticalEvents(parseInt(hours));
    
    res.json({
      success: true,
      data: criticalEvents,
      total: criticalEvents.length,
      period: `Last ${hours} hours`
    });
    
  } catch (error) {
    logger.error('Error fetching critical events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch critical events'
    });
  }
});

/**
 * POST /api/v1/admin/sage/authorize
 * Get Sage X3 authorization URL
 */
router.post('/sage/authorize', (req, res) => {
  try {
    const authUrl = sageX3Client.getAuthorizationUrl();
    
    res.json({
      success: true,
      authorizationUrl: authUrl,
      message: 'Visit this URL to authorize the application'
    });
    
  } catch (error) {
    logger.error('Error generating authorization URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate authorization URL'
    });
  }
});

/**
 * POST /api/v1/admin/sage/token
 * Exchange authorization code for tokens
 */
router.post('/sage/token', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code is required'
      });
    }
    
    const tokens = await sageX3Client.exchangeCodeForTokens(code);
    
    // Store tokens securely (in production, encrypt these)
    await Configuration.setConfig(
      'sage.accessToken',
      tokens.accessToken,
      req.user?.id || 'admin',
      'OAuth2 authorization completed'
    );
    
    await Configuration.setConfig(
      'sage.refreshToken',
      tokens.refreshToken,
      req.user?.id || 'admin',
      'OAuth2 authorization completed'
    );
    
    await AuditLog.logAction({
      action: 'config.updated',
      actor: {
        type: 'user',
        userId: req.user?.id || 'admin',
        ipAddress: req.ip
      },
      details: {
        action: 'sage_x3_authorization',
        message: 'Sage X3 OAuth2 tokens obtained'
      },
      result: {
        status: 'success',
        message: 'Sage X3 authorization completed'
      },
      category: 'admin',
      severity: 'warning'
    });
    
    res.json({
      success: true,
      message: 'Sage X3 authorization successful'
    });
    
  } catch (error) {
    logger.error('Error exchanging authorization code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete authorization'
    });
  }
});

module.exports = router;
