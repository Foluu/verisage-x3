
const { Webhook } = require('svix');
const logger = require('./logger');



/**
 * Verify webhook signature from Indigo HMS via Svix
 * @param {string} payload - Stringified JSON payload
 * @param {object} headers - Request headers containing svix-id, svix-timestamp, svix-signature
 * @returns {object|null} - Verified payload object or null if invalid
 */
function verifyWebhookSignature(payload, headers) {
  try {
    const secret = process.env.SVIX_WEBHOOK_SECRET;
    
    if (!secret) {
      logger.webhook.error('SVIX_WEBHOOK_SECRET not configured');
      return null;
    }
    
    if (!secret.startsWith('whsec_')) {
      logger.webhook.warn('SVIX_WEBHOOK_SECRET should start with "whsec_"');
    }
    
    // Extract Svix headers
    const svixId = headers['svix-id'];
    const svixTimestamp = headers['svix-timestamp'];
    const svixSignature = headers['svix-signature'];
    
    // Validate headers are present
    if (!svixId || !svixTimestamp || !svixSignature) {
      logger.webhook.warn('Missing required Svix headers', {
        hasSvixId: !!svixId,
        hasSvixTimestamp: !!svixTimestamp,
        hasSvixSignature: !!svixSignature
      });
      return null;
    }
    
    // Create Svix webhook verifier
    const wh = new Webhook(secret);
    
    // Verify the webhook signature
    const verified = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature
    });
    
    logger.webhook.info('Webhook signature verified successfully', {
      svixId,
      eventType: verified.event
    });
    
    return verified;
    
  } catch (error) {
    // Svix throws an error if verification fails
    logger.webhook.error('Webhook signature verification failed:', {
      error: error.message,
      type: error.constructor.name
    });
    return null;
  }
}

/**
 * Generate a unique event ID from webhook payload
 * Uses Svix message ID for idempotency if available
 * @param {object} payload - Webhook payload
 * @param {string} svixId - Svix message ID from headers
 * @returns {string} - Unique event ID
 */
function generateEventId(payload, svixId = null) {
  // Prefer Svix ID for true idempotency
  if (svixId) {
    return `svix-${svixId}`;
  }
  
  // Fallback to payload-based ID
  const eventType = payload.event;
  const dataId = payload.data?.id || 'unknown';
  const timestamp = Date.now();
  
  return `${eventType}-${dataId}-${timestamp}`;
}

/**
 * Extract event type from webhook payload
 * @param {object} payload - Webhook payload
 * @returns {string|null} - Event type or null if invalid
 */
function extractEventType(payload) {
  if (!payload || !payload.event) {
    return null;
  }
  
  const validEventTypes = [
    'invoice.created',
    'invoice.updated',
    'invoice.cancelled',
    'payment.created',
    'payment.cancelled',
    'item.created',
    'item.updated',
    'item.archived',
    'stock.created',
    'stock.updated',
    'stock.incremented',
    'stock.transferred',
    'stock.recalled',
    'stock.archived',
    'stock.dispensed',
    'stock.sold',
    'stock.returned'
  ];
  
  return validEventTypes.includes(payload.event) ? payload.event : null;
}

/**
 * Check if event is a duplicate based on Event ID or Svix ID
 * @param {object} Event - Event model
 * @param {string} eventId - Internal event ID
 * @param {string} svixId - Svix message ID (for idempotency)
 * @returns {Promise<boolean>} - True if duplicate exists
 */
async function isDuplicateEvent(Event, eventId, svixId = null) {
  try {
    const query = {
      $or: [
        { eventId },
        // Check by Svix ID if provided (primary idempotency check)
        ...(svixId ? [{ eventId: `svix-${svixId}` }] : [])
      ]
    };
    
    const existing = await Event.findOne(query);
    
    if (existing) {
      logger.webhook.info('Duplicate event detected', {
        eventId,
        svixId,
        existingEventId: existing.eventId
      });
    }
    
    return !!existing;
  } catch (error) {
    logger.webhook.error('Error checking for duplicate event:', error);
    return false;
  }
}

/**
 * Sanitize webhook payload for logging (remove sensitive data)
 * @param {object} payload - Webhook payload
 * @returns {object} - Sanitized payload
 */
function sanitizePayload(payload) {
  const sanitized = JSON.parse(JSON.stringify(payload));
  
  // Remove or mask sensitive fields
  if (sanitized.data?.patient?.phoneNumber) {
    sanitized.data.patient.phoneNumber = '***REDACTED***';
  }
  
  if (sanitized.metadata) {
    sanitized.metadata = '***METADATA_OMITTED***';
  }
  
  return sanitized;
}



module.exports = {
  verifyWebhookSignature,
  generateEventId,
  extractEventType,
  isDuplicateEvent,
  sanitizePayload
};