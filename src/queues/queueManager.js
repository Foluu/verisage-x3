const Bull = require('bull');
const logger = require('../utils/logger');
const Event = require('../models/Event');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const validationSchemas = require('../validators/webhookSchemas');
const transformationService = require('../services/transformationService');
const sageX3Client = require('../services/sageX3Client');

// Queue instances
let eventProcessingQueue;
let retryQueue;

/**
 * Initialize Bull queues
 */
async function initializeQueues() {
  const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  };
  
  // Event processing queue
  eventProcessingQueue = new Bull('event-processing', {
    redis: redisConfig,
    defaultJobOptions: {
      attempts: 1, // Single attempt, retries handled separately
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: false // Keep failed jobs for analysis
    }
  });
  
  // Retry queue for failed events
  retryQueue = new Bull('event-retry', {
    redis: redisConfig,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: 50,
      removeOnFail: false
    }
  });
  
  // Process event processing queue
  eventProcessingQueue.process(async (job) => {
    return await processEvent(job.data.eventId);
  });
  
  // Process retry queue
  retryQueue.process(async (job) => {
    return await retryFailedEvent(job.data.eventId);
  });
  
  // Queue event handlers
  eventProcessingQueue.on('completed', (job, result) => {
    logger.queue.info(`Event processing completed: ${job.data.eventId}`, result);
  });
  
  eventProcessingQueue.on('failed', (job, error) => {
    logger.queue.error(`Event processing failed: ${job.data.eventId}`, {
      error: error.message,
      stack: error.stack
    });
  });
  
  retryQueue.on('completed', (job, result) => {
    logger.queue.info(`Retry completed: ${job.data.eventId}`, result);
  });
  
  retryQueue.on('failed', (job, error) => {
    logger.queue.error(`Retry failed: ${job.data.eventId}`, {
      error: error.message
    });
  });
  
  logger.queue.info('Queues initialized successfully');
}

/**
 * Add event to processing queue
 */
async function queueEvent(eventId) {
  await eventProcessingQueue.add({ eventId }, {
    priority: 1,
    timeout: 60000 // 1 minute timeout
  });
  
  logger.queue.info(`Event queued for processing: ${eventId}`);
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
    
    // Step 3: Sync to Sage X3
    if (event.status === 'transformed') {
      await syncToSageX3(event);
    }
    
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
    
    // Queue for retry if enabled
    if (process.env.ENABLE_AUTO_RETRY === 'true' && 
        event.retryCount < parseInt(process.env.MAX_RETRY_ATTEMPTS || 3)) {
      await scheduleRetry(event);
    }
    
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
    await event.markAsFailed('business_rule', error.message, { stack: error.stack });
    
    await AuditLog.logAction({
      action: 'event.transformed',
      eventId: event.eventId,
      actor: { type: 'system' },
      details: { eventType: event.eventType },
      result: { status: 'failure', message: error.message },
      category: 'processing',
      severity: 'error'
    });
    
    throw error;
  }
}

/**
 * Sync transformed event to Sage X3
 */
async function syncToSageX3(event) {
  try {
    let result;
    const transformed = event.transformedPayload;
    
    // Route to appropriate Sage X3 API based on document type
    switch (transformed.documentType) {
      case 'SI': // Sales Invoice
        result = await sageX3Client.postInvoice(transformed);
        break;
      case 'PAY': // Payment
        result = await sageX3Client.postPayment(transformed);
        break;
      case 'CN': // Credit Note
        result = await sageX3Client.postCreditNote(transformed);
        break;
      case 'STK_IN':
      case 'STK_OUT':
      case 'STK_TRF':
      case 'STK_RET':
        result = await sageX3Client.postStockMovement(transformed);
        break;
      default:
        throw new Error(`Unsupported document type: ${transformed.documentType}`);
    }
    
    // Mark event as synced
    await event.markAsSynced(result);
    
    // Create transaction record
    const transaction = new Transaction({
      transactionId: `TXN-${event.eventId}`,
      eventId: event.eventId,
      eventType: event.eventType,
      sageX3Details: {
        documentReference: result.documentReference,
        documentType: result.documentType,
        folder: process.env.SAGE_X3_FOLDER,
        company: process.env.SAGE_X3_COMPANY,
        postingDate: new Date(),
        apiResponse: result.response
      },
      financialData: transformed.financialData || {},
      inventoryData: transformed.inventoryData || {},
      status: 'synced',
      syncedAt: new Date(),
      syncedBy: 'system'
    });
    
    await transaction.save();
    
    await AuditLog.logAction({
      action: 'event.synced',
      eventId: event.eventId,
      transactionId: transaction.transactionId,
      actor: { type: 'system' },
      details: {
        documentReference: result.documentReference,
        documentType: result.documentType
      },
      result: { status: 'success', message: 'Synced to Sage X3' },
      category: 'sync',
      severity: 'info'
    });
    
    logger.queue.info(`Event synced to Sage X3: ${event.eventId}`, {
      documentReference: result.documentReference
    });
    
  } catch (error) {
    await event.markAsFailed('sage_api', error.message, {
      stack: error.stack,
      response: error.response?.data
    });
    
    await AuditLog.logAction({
      action: 'event.failed',
      eventId: event.eventId,
      actor: { type: 'system' },
      details: { error: error.message },
      result: { status: 'failure', message: 'Sage X3 sync failed' },
      category: 'sync',
      severity: 'error'
    });
    
    throw error;
  }
}

/**
 * Schedule retry for failed event
 */
async function scheduleRetry(event) {
  const retryDelay = calculateRetryDelay(event.retryCount);
  
  await retryQueue.add(
    { eventId: event.eventId },
    { delay: retryDelay }
  );
  
  await event.incrementRetry(retryDelay);
  
  logger.queue.info(`Retry scheduled for event: ${event.eventId}`, {
    retryCount: event.retryCount,
    delayMs: retryDelay
  });
}

/**
 * Calculate retry delay with exponential backoff
 */
function calculateRetryDelay(retryCount) {
  const baseDelay = parseInt(process.env.RETRY_DELAY_MS || 5000);
  const useExponential = process.env.RETRY_EXPONENTIAL_BACKOFF === 'true';
  
  if (useExponential) {
    return baseDelay * Math.pow(2, retryCount);
  }
  
  return baseDelay;
}

/**
 * Retry a failed event
 */
async function retryFailedEvent(eventId) {
  logger.queue.info(`Retrying failed event: ${eventId}`);
  
  const event = await Event.findByEventId(eventId);
  
  if (!event) {
    throw new Error(`Event not found: ${eventId}`);
  }
  
  // Reset status to last successful step
  if (event.transformedPayload) {
    event.status = 'transformed';
  } else if (event.validationResult?.isValid) {
    event.status = 'validated';
  } else {
    event.status = 'received';
  }
  
  await event.save();
  
  await AuditLog.logAction({
    action: 'event.retried',
    eventId: event.eventId,
    actor: { type: 'system' },
    details: { retryCount: event.retryCount },
    result: { status: 'success', message: 'Retry initiated' },
    category: 'processing',
    severity: 'info'
  });
  
  // Process the event again
  return await processEvent(eventId);
}

module.exports = {
  initializeQueues,
  queueEvent,
  processEvent,
  retryFailedEvent,
  eventProcessingQueue,
  retryQueue
};
