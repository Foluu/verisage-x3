
const logger = require('../utils/logger');
const Event = require('../models/Event');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const validationSchemas = require('../validators/webhookSchemas');
const transformationService = require('../services/transformationService');
const sageX3Client = require('../services/sageX3Client');

// TEMPORARY: Process events synchronously without Redis/Bull
// This is a workaround until Redis is properly configured


/**
 * Initialize queues - NO-OP when Redis unavailable
 */
async function initializeQueues() {
  logger.queue.info('Queue system disabled - processing events synchronously');
  return Promise.resolve();
}

/**
 * Queue event for processing - Process immediately instead
 */
async function queueEvent(eventId) {
  logger.queue.info(`Processing event immediately (no queue): ${eventId}`);
  
  // Process synchronously instead of queueing
  try {
    await processEvent(eventId);
  } catch (error) {
    logger.queue.error(`Immediate processing failed for ${eventId}:`, {
      error: error.message,
      stack: error.stack
    });
  }
}


/**
 * Process a single event through the pipeline
 */
async function processEvent(eventId) {
  const event = await Event.findByEventId(eventId);
  
  if (!event) {
    throw new Error(`Event not found: ${eventId}`);
  }
  
  logger.queue.info(`Processing event: ${eventId}`, {
    eventType: event.eventType,
    status: event.status
  });
  
  try {
    // Step 1: Validation
    if (event.status === 'received') {
      await validateEvent(event);
    }
    
    // Step 2: Transformation
    if (event.status === 'validated') {
      await transformEvent(event);
    }
    
    // Step 3: Sync to Sage X3 (skip for now)
    // if (event.status === 'transformed') {
    //   await syncToSageX3(event);
    // }
    
    return {
      success: true,
      eventId,
      status: event.status
    };
    
  } catch (error) {
    logger.queue.error(`Event processing error: ${eventId}`, {
      error: error.message,
      status: event.status
    });
    
    // Mark event as failed
    await event.markAsFailed('system', error.message, {
      stack: error.stack,
      processingStep: event.status
    });
    
    throw error;
  }
}


/**
 * Validate event against schema
 */
async function validateEvent(event) {
  const schema = validationSchemas[event.eventType];
  
  if (!schema) {
    await event.markAsFailed('validation', `No validation schema for ${event.eventType}`, {});
    throw new Error(`No validation schema for ${event.eventType}`);
  }
  
  const { error, value } = schema.validate(event.rawPayload, {
    abortEarly: false,
    stripUnknown: true
  });
  
  if (error) {
    const errors = error.details.map(d => d.message);
    await event.markAsValidated(false, errors);
    
    await AuditLog.logAction({
      action: 'event.validated',
      eventId: event.eventId,
      actor: { type: 'system' },
      details: { errors },
      result: { status: 'failure', message: 'Validation failed' },
      category: 'processing',
      severity: 'error'
    });
    
    logger.queue.error(`Validation failed for ${event.eventId}:`, { errors });
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }
  
  await event.markAsValidated(true, []);
  
  await AuditLog.logAction({
    action: 'event.validated',
    eventId: event.eventId,
    actor: { type: 'system' },
    details: { eventType: event.eventType },
    result: { status: 'success', message: 'Validation passed' },
    category: 'processing',
    severity: 'info'
  });
  
  logger.queue.info(`Event validated: ${event.eventId}`);
}


/**
 * Transform event to Sage X3 format
 */
async function transformEvent(event) {
  try {
    const transformed = transformationService.transform(event.eventType, event.rawPayload);
    
    await event.markAsTransformed(transformed);
    
    await AuditLog.logAction({
      action: 'event.transformed',
      eventId: event.eventId,
      actor: { type: 'system' },
      details: { eventType: event.eventType },
      result: { status: 'success', message: 'Transformation completed' },
      category: 'processing',
      severity: 'info'
    });
    
    logger.queue.info(`Event transformed: ${event.eventId}`);
    
  } catch (error) {
    await event.markAsFailed('transformation', error.message, { stack: error.stack });
    
    await AuditLog.logAction({
      action: 'event.transformed',
      eventId: event.eventId,
      actor: { type: 'system' },
      details: { eventType: event.eventType },
      result: { status: 'failure', message: error.message },
      category: 'processing',
      severity: 'error'
    });
    
    logger.queue.error(`Transformation failed for ${event.eventId}:`, { error: error.message });
    throw error;
  }
}


/**
 * Manually retry a failed event
 */
async function retryFailedEvent(eventId) {
  logger.queue.info(`Manual retry requested: ${eventId}`);
  
  const event = await Event.findByEventId(eventId);
  
  if (!event) {
    throw new Error('Event not found');
  }
  
  if (event.status !== 'failed') {
    throw new Error(`Event is not in failed status (current: ${event.status})`);
  }
  
  // Reset to received status
  event.status = 'received';
  event.retryCount += 1;
  await event.save();
  
  // Process immediately
  return await processEvent(eventId);
}


/**
 * Get queue statistics - Return empty stats
 */
async function getQueueStats() {
  return {
    processing: { waiting: 0, active: 0, completed: 0, failed: 0 },
    retry: { waiting: 0, active: 0, completed: 0, failed: 0 }
  };
}



module.exports = {
  initializeQueues,
  queueEvent,
  processEvent,
  retryFailedEvent,
  getQueueStats
};