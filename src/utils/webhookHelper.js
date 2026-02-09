const crypto = require('crypto');
const logger = require('./logger');

/**
 * Verify webhook signature from Indigo HMS
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signature - Signature from request header
 * @param {string} timestamp - Timestamp from request header
 * @returns {boolean} - True if signature is valid
 */
function verifyWebhookSignature(rawBody, signature, timestamp) {
  try {
    // Check if timestamp is within tolerance
    const timestampToleranceSeconds = parseInt(
      process.env.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS || '300'
    );
    const currentTime = Math.floor(Date.now() / 1000);
    const webhookTime = parseInt(timestamp);
    
    if (Math.abs(currentTime - webhookTime) > timestampToleranceSeconds) {
      logger.webhook.warn('Webhook timestamp outside tolerance window', {
        currentTime,
        webhookTime,
        difference: currentTime - webhookTime
      });
      return false;
    }
    
    // Generate expected signature
    const secret = process.env.INDIGO_WEBHOOK_SECRET;
    if (!secret) {
      logger.webhook.error('INDIGO_WEBHOOK_SECRET not configured');
      return false;
    }
    
    // Create signature: HMAC-SHA256(timestamp + "." + rawBody)
    const payload = `${timestamp}.${rawBody}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    // Compare signatures using timing-safe comparison
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
    
    if (!isValid) {
      logger.webhook.warn('Webhook signature verification failed');
    }
    
    return isValid;
  } catch (error) {
    logger.webhook.error('Error verifying webhook signature:', error);
    return false;
  }
}

/**
 * Generate a unique event ID from webhook payload
 * @param {object} payload - Webhook payload
 * @returns {string} - Unique event ID
 */
function generateEventId(payload) {
  const eventType = payload.event;
  const dataId = payload.data?.id || 'unknown';
  const timestamp = Date.now();
  
  // Create deterministic ID: eventType-dataId-timestamp
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
 * Check if event is a duplicate based on Indigo HMS event ID
 * @param {object} Event - Event model
 * @param {string} indigoEventId - Event ID from Indigo HMS
 * @returns {Promise<boolean>} - True if duplicate exists
 */
async function isDuplicateEvent(Event, indigoEventId) {
  try {
    const existing = await Event.findOne({
      'rawPayload.data.id': indigoEventId
    });
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
