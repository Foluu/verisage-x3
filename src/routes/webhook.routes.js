
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
 * Main webhook endpoint for receiving events from Indigo HMS via Svix
 */
router.post('/indigo', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Get raw body as string for Svix verification
    const rawBody = req.body.toString('utf-8');
    
    // Extract Svix headers
    const headers = {
      'svix-id': req.get('svix-id'),
      'svix-timestamp': req.get('svix-timestamp'),
      'svix-signature': req.get('svix-signature')
    };
    
    // Verify webhook signature using Svix
    const verified = verifyWebhookSignature(rawBody, headers);
    
    if (!verified) {
      logger.webhook.warn('Webhook signature verification failed', {
        ip: req.ip,
        hasSvixId: !!headers['svix-id']
      });
      
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook signature'
      });
    }
    
    // Use verified payload (already parsed by Svix)
    const payload = verified;
    
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
    const eventCategory = eventType.split('.')[0].toUpperCase();
    const featureKey = `ENABLE_${eventCategory}_EVENTS`;
    
    if (process.env[featureKey] === 'false') {
      logger.webhook.info(`Event type disabled: ${eventType}`);
      
      return res.status(200).json({
        success: true,
        message: 'Event type currently disabled',
        eventType
      });
    }
    
    // Get Svix ID for idempotency
    const svixId = headers['svix-id'];
    
    // Generate internal event ID (using Svix ID for idempotency)
    const eventId = generateEventId(payload, svixId);
    
    // Check for duplicate events using both internal ID and Svix ID
    if (await isDuplicateEvent(Event, eventId, svixId)) {
      logger.webhook.warn('Duplicate event detected (idempotency check)', {
        eventType,
        eventId,
        svixId
      });
      
      // Return 200 for duplicates (idempotent response)
      return res.status(200).json({
        success: true,
        message: 'Duplicate event ignored (idempotency)',
        eventType,
        eventId,
        svixId
      });
    }
    
    // Create event record
    const event = new Event({
      eventId,
      eventType,
      rawPayload: payload,
      status: 'received',
      webhookSignature: headers['svix-signature'],
      webhookTimestamp: new Date(parseInt(headers['svix-timestamp']) * 1000),
      sourceIp: req.ip,
      metadata: {
        ...payload.metadata,
        svixId,
        svixTimestamp: headers['svix-timestamp']
      }
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
        svixId,
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
      svixId,
      duration: Date.now() - startTime
    });
    
    // Return 200 success immediately (Svix expects 2xx response quickly)
    res.status(200).json({
      success: true,
      message: 'Event received and queued for processing',
      eventId,
      eventType,
      svixId
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
    
    // Return 500 on errors (Svix will retry)
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