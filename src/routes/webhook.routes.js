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
 * 
 * ENHANCED VERSION WITH COMPREHENSIVE DIAGNOSTICS
 */
router.post('/indigo', async (req, res) => {
  const startTime = Date.now();
  
  // ============================================================================
  // DIAGNOSTIC LOGGING - Phase 1: Request Receipt
  // ============================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔵 WEBHOOK REQUEST RECEIVED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Method:', req.method);
  console.log('Path:', req.path);
  console.log('Full URL:', req.originalUrl);
  console.log('IP:', req.ip);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body type:', typeof req.body);
  console.log('Body constructor:', req.body?.constructor?.name);
  console.log('Body is Buffer:', Buffer.isBuffer(req.body));
  console.log('Body length:', req.body?.length || 0);
  
  try {
    // ============================================================================
    // PHASE 2: Body Parsing
    // ============================================================================
    console.log('\n📦 PARSING REQUEST BODY');
    console.log('─────────────────────────────────────────────────────────────────────');
    
    let rawBody;
    let payload;
    
    // Handle different body types
    if (Buffer.isBuffer(req.body)) {
      console.log('✓ Body is Buffer (expected from express.raw())');
      rawBody = req.body.toString('utf-8');
      console.log('Raw body length:', rawBody.length);
      console.log('Raw body preview:', rawBody.substring(0, 200));
      
      try {
        payload = JSON.parse(rawBody);
        console.log('✓ Successfully parsed JSON from buffer');
      } catch (parseError) {
        console.error('✗ JSON parse error:', parseError.message);
        throw new Error('Invalid JSON payload');
      }
    } else if (typeof req.body === 'string') {
      console.log('⚠ Body is string (unexpected but handling)');
      rawBody = req.body;
      payload = JSON.parse(rawBody);
    } else if (typeof req.body === 'object') {
      console.log('⚠ Body is already parsed object (middleware issue)');
      payload = req.body;
      rawBody = JSON.stringify(payload);
    } else {
      console.error('✗ Unexpected body type:', typeof req.body);
      throw new Error('Invalid request body format');
    }
    
    console.log('Payload keys:', Object.keys(payload || {}));
    console.log('Payload event:', payload?.event);
    console.log('Payload data:', payload?.data ? 'present' : 'missing');
    
    // ============================================================================
    // PHASE 3: Header Extraction
    // ============================================================================
    console.log('\n🔐 EXTRACTING SVIX HEADERS');
    console.log('─────────────────────────────────────────────────────────────────────');
    
    const headers = {
      'svix-id': req.get('svix-id'),
      'svix-timestamp': req.get('svix-timestamp'),
      'svix-signature': req.get('svix-signature')
    };
    
    console.log('Svix ID:', headers['svix-id'] || 'MISSING');
    console.log('Svix Timestamp:', headers['svix-timestamp'] || 'MISSING');
    console.log('Svix Signature:', headers['svix-signature'] ? 'present' : 'MISSING');
    
    // ============================================================================
    // PHASE 4: Signature Verification
    // ============================================================================
    console.log('\n🔒 VERIFYING WEBHOOK SIGNATURE');
    console.log('─────────────────────────────────────────────────────────────────────');
    
    const verified = verifyWebhookSignature(rawBody, headers);
    
    if (!verified) {
      console.error('✗ Signature verification FAILED');
      logger.webhook.warn('Webhook signature verification failed', {
        ip: req.ip,
        hasSvixId: !!headers['svix-id'],
        hasSvixTimestamp: !!headers['svix-timestamp'],
        hasSvixSignature: !!headers['svix-signature']
      });
      
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook signature',
        debug: {
          hasSvixId: !!headers['svix-id'],
          hasSvixTimestamp: !!headers['svix-timestamp'],
          hasSvixSignature: !!headers['svix-signature']
        }
      });
    }
    
    console.log('✓ Signature verification PASSED');
    console.log('Verified payload event:', verified?.event);
    
    // Use verified payload
    payload = verified;
    
    // ============================================================================
    // PHASE 5: Event Type Extraction
    // ============================================================================
    console.log('\n📋 EXTRACTING EVENT TYPE');
    console.log('─────────────────────────────────────────────────────────────────────');
    
   const eventType = extractEventType(payload);
    console.log('Event type:', eventType || 'INVALID');
    
    if (!eventType) {
      console.error('✗ Invalid or unsupported event type');
      logger.webhook.warn('Invalid event type received', {
        payload: sanitizePayload(payload),
        event: payload?.event
      });
      
      return res.status(400).json({
        success: false,
        error: 'Invalid or unsupported event type',
        receivedEvent: payload?.event
      });
    }
    
    console.log('✓ Event type is valid:', eventType);
    
    // ============================================================================
    // PHASE 6: Feature Flag Check
    // ============================================================================
    console.log('\n🚩 CHECKING FEATURE FLAGS');
    console.log('─────────────────────────────────────────────────────────────────────');
    
    const eventCategory = eventType.split('.')[0].toUpperCase();
    const featureKey = `ENABLE_${eventCategory}_EVENTS`;
    const isEnabled = process.env[featureKey];
    
    console.log('Event category:', eventCategory);
    console.log('Feature key:', featureKey);
    console.log('Feature value:', isEnabled);
    console.log('Is enabled:', isEnabled !== 'false');
    
    if (process.env[featureKey] === 'false') {
      console.log('⚠ Event type is DISABLED by feature flag');
      logger.webhook.info(`Event type disabled: ${eventType}`);
      
      return res.status(200).json({
        success: true,
        message: 'Event type currently disabled',
        eventType,
        featureFlag: featureKey
      });
    }
    
    console.log('✓ Event type is enabled');
    
    // ============================================================================
    // PHASE 7: Event ID Generation
    // ============================================================================
    console.log('\n🆔 GENERATING EVENT ID');
    console.log('─────────────────────────────────────────────────────────────────────');
    
    const svixId = headers['svix-id'];
    const eventId = generateEventId(payload, svixId);
    
    console.log('Svix ID:', svixId);
    console.log('Generated Event ID:', eventId);
    
    // ============================================================================
    // PHASE 8: Duplicate Check
    // ============================================================================
    console.log('\n🔍 CHECKING FOR DUPLICATES');
    console.log('─────────────────────────────────────────────────────────────────────');
    
    const isDuplicate = await isDuplicateEvent(Event, eventId, svixId);
    console.log('Is duplicate:', isDuplicate);
    
    if (isDuplicate) {
      console.log('⚠ DUPLICATE EVENT - Returning idempotent response');
      logger.webhook.warn('Duplicate event detected (idempotency check)', {
        eventType,
        eventId,
        svixId
      });
      
      return res.status(200).json({
        success: true,
        message: 'Duplicate event ignored (idempotency)',
        eventType,
        eventId,
        svixId
      });
    }
    
    console.log('✓ Not a duplicate - proceeding to save');
    
    // ============================================================================
    // PHASE 9: Database Persistence
    // ============================================================================
    console.log('\n💾 SAVING TO DATABASE');
    console.log('─────────────────────────────────────────────────────────────────────');
    
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
    
    console.log('Event object created:', {
      eventId: event.eventId,
      eventType: event.eventType,
      status: event.status,
      hasPayload: !!event.rawPayload,
      hasMetadata: !!event.metadata
    });
    
    console.log('Attempting to save to MongoDB...');
    const savedEvent = await event.save();
    console.log('✓ Event SAVED to database successfully');
    console.log('Saved event _id:', savedEvent._id);
    console.log('Saved event eventId:', savedEvent.eventId);
    
    // ============================================================================
    // PHASE 10: Audit Log
    // ============================================================================
    console.log('\n📝 CREATING AUDIT LOG');
    console.log('─────────────────────────────────────────────────────────────────────');
    
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
    
    console.log('✓ Audit log created');
    
    // ============================================================================
    // PHASE 11: Queue for Processing
    // ============================================================================
    console.log('\n⚡ QUEUEING FOR PROCESSING');
    console.log('─────────────────────────────────────────────────────────────────────');
    
    await queueEvent(eventId);
    console.log('✓ Event queued for processing');
    
    // ============================================================================
    // PHASE 12: Success Response
    // ============================================================================
    const duration = Date.now() - startTime;
    console.log('\n✅ WEBHOOK PROCESSED SUCCESSFULLY');
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('Event ID:', eventId);
    console.log('Event Type:', eventType);
    console.log('Duration:', duration, 'ms');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    logger.webhook.info('Webhook received successfully', {
      eventId,
      eventType,
      svixId,
      duration
    });
    
    res.status(200).json({
      success: true,
      message: 'Event received and queued for processing',
      eventId,
      eventType,
      svixId,
      duration
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // ============================================================================
    // ERROR HANDLING
    // ============================================================================
    console.error('\n❌ WEBHOOK PROCESSING ERROR');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Duration:', duration, 'ms');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    logger.webhook.error('Webhook processing error:', {
      error: error.message,
      stack: error.stack,
      duration,
      bodyType: typeof req.body,
      bodyIsBuffer: Buffer.isBuffer(req.body)
    });
    
    try {
      await AuditLog.logAction({
        action: 'event.received',
        eventId: null,
        actor: {
          type: 'webhook',
          ipAddress: req.ip
        },
        details: {
          error: error.message,
          stack: error.stack
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
    } catch (auditError) {
      console.error('Failed to create audit log:', auditError.message);
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to process webhook',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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

/**
 * POST /api/v1/webhooks/test
 * Test endpoint to verify webhook endpoint is reachable
 */
router.post('/test', (req, res) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST WEBHOOK ENDPOINT HIT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Method:', req.method);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('Body type:', typeof req.body);
  console.log('Body is Buffer:', Buffer.isBuffer(req.body));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  res.json({
    success: true,
    message: 'Test endpoint reached',
    receivedBody: Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : req.body,
    timestamp: new Date().toISOString()
  });
});




module.exports = router;