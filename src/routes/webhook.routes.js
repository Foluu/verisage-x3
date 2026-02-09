const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const AuditLog = require('../models/AuditLog');
const { queueEvent } = require('../queues/queueManager');
const {
  verifyWebhookSignature,
  generateEventId,
  extractEventType,
  isDuplicateEvent,
  sanitizePayload
} = require('../utils/webhookHelper');
const logger = require('../utils/logger');

/**
 * POST /api/v1/webhooks/indigo
 * Main webhook endpoint for receiving events from Indigo HMS
 */
router.post('/indigo', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Extract headers
    const signature = req.get(process.env.INDIGO_WEBHOOK_SIGNATURE_HEADER || 'X-Indigo-Signature');
    const timestamp = req.get(process.env.INDIGO_WEBHOOK_TIMESTAMP_HEADER || 'X-Indigo-Timestamp');
    
    // Get raw body for signature verification
    const rawBody = req.body;
    
    // Verify signature
    if (!verifyWebhookSignature(rawBody, signature, timestamp)) {
      logger.webhook.warn('Webhook signature verification failed', {
        ip: req.ip
      });
      
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook signature'
      });
    }
    
    // Parse payload
    const payload = JSON.parse(rawBody.toString());
    
    // Extract event type
    const eventType = extractEventType(payload);
    
    if (!eventType) {
      logger.webhook.warn('Invalid event type received', {
        payload: sanitizePayload(payload)
      });
      
      return res.status(400).json({
        success: false,
        error: 'Invalid or unsupported event type'
      });
    }
    
    // Check if event type is enabled
    const featureKey = `ENABLE_${eventType.split('.')[0].toUpperCase()}_EVENTS`;
    if (process.env[featureKey] === 'false') {
      logger.webhook.info(`Event type disabled: ${eventType}`);
      
      return res.status(200).json({
        success: true,
        message: 'Event type currently disabled',
        eventType
      });
    }
    
    // Check for duplicate events
    const indigoEventId = payload.data?.id;
    if (indigoEventId && await isDuplicateEvent(Event, indigoEventId)) {
      logger.webhook.warn('Duplicate event detected', {
        eventType,
        indigoEventId
      });
      
      return res.status(200).json({
        success: true,
        message: 'Duplicate event ignored',
        eventType,
        indigoEventId
      });
    }
    
    // Generate internal event ID
    const eventId = generateEventId(payload);
    
    // Create event record
    const event = new Event({
      eventId,
      eventType,
      rawPayload: payload,
      status: 'received',
      webhookSignature: signature,
      webhookTimestamp: new Date(parseInt(timestamp) * 1000),
      sourceIp: req.ip,
      metadata: payload.metadata || {}
    });
    
    await event.save();
    
    // Log audit trail
    await AuditLog.logAction({
      action: 'event.received',
      eventId,
      actor: {
        type: 'webhook',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      },
      details: {
        eventType,
        indigoEventId,
        payloadSize: rawBody.length
      },
      result: {
        status: 'success',
        message: 'Webhook received and persisted'
      },
      category: 'webhook',
      severity: 'info',
      duration: Date.now() - startTime
    });
    
    // Queue event for processing
    await queueEvent(eventId);
    
    logger.webhook.info('Webhook received successfully', {
      eventId,
      eventType,
      duration: Date.now() - startTime
    });
    
    // Return success response immediately
    res.status(202).json({
      success: true,
      message: 'Event received and queued for processing',
      eventId,
      eventType
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.webhook.error('Webhook processing error:', {
      error: error.message,
      stack: error.stack,
      duration
    });
    
    await AuditLog.logAction({
      action: 'event.received',
      eventId: null,
      actor: {
        type: 'webhook',
        ipAddress: req.ip
      },
      details: {
        error: error.message
      },
      result: {
        status: 'failure',
        message: 'Webhook processing failed',
        errorDetails: error.message
      },
      category: 'webhook',
      severity: 'error',
      duration
    });
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to process webhook'
    });
  }
});

/**
 * GET /api/v1/webhooks/health
 * Health check endpoint for webhook service
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'webhook',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
