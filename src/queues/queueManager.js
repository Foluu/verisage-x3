
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
// loop fixed

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
 * Sync Event to SageX3
 */
async function syncToSageX3(event) {
  try {
    // Get the transformed data from the event
    const transformedData = event.transformedPayload;
    
    if (!transformedData) {
      throw new Error('No transformed payload found for event');
    }
    
    logger.queue.info(`Syncing to Sage X3: ${event.eventId}`, {
      eventType: event.eventType
    });
    
    // Map event types to valid document type enum values
    const documentTypeEnumMap = {
      'payment.created': 'payment',
      'payment.cancelled': 'payment',
      'invoice.created': 'invoice',
      'invoice.updated': 'invoice',
      'invoice.cancelled': 'invoice',
      'stock.created': 'stock_movement',
      'stock.updated': 'stock_movement',
      'stock.incremented': 'stock_movement',
      'stock.transferred': 'stock_movement',
      'stock.recalled': 'stock_movement',
      'stock.archived': 'stock_movement',
      'stock.dispensed': 'stock_movement',
      'stock.sold': 'stock_movement',
      'stock.returned': 'stock_movement',
      'item.created': 'item',
      'item.updated': 'item',
      'item.archived': 'item'
    };
    
    const documentType = documentTypeEnumMap[event.eventType] || 'general';
    
    // Create transaction record with ALL required fields
    const transaction = new Transaction({
      eventId: event.eventId,
      eventType: event.eventType,
      status: 'synced',
      sageX3Payload: transformedData,
      attempts: 0,
      transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sageX3Details: {
        documentType: documentType,
        documentReference: event.eventId
      }
    });
    
    await transaction.save();
    
    // Call appropriate Sage X3 method based on event type
    let response;
    
    // Payment events
    if (event.eventType.startsWith('payment.')) {
      if (event.eventType === 'payment.created') {
        response = await sageX3Client.postPayment(transformedData);
      } else {
        // For payment cancelled, you might want to post a credit note or reversal
        response = {
          success: true,
          documentReference: event.eventId,
          documentType: 'payment_reversal',
          message: 'Payment cancellation recorded'
        };
      }
    }
    // Invoice events
    else if (event.eventType.startsWith('invoice.')) {
      if (event.eventType === 'invoice.created' || event.eventType === 'invoice.updated') {
        response = await sageX3Client.postInvoice(transformedData);
      } else {
        // For invoice cancelled, post credit note
        response = {
          success: true,
          documentReference: event.eventId,
          documentType: 'credit_note',
          message: 'Invoice cancellation recorded'
        };
      }
    }
    // Stock events
    else if (event.eventType.startsWith('stock.')) {
      if (['stock.created', 'stock.updated', 'stock.incremented'].includes(event.eventType)) {
        response = await sageX3Client.postStockMovement(transformedData);
      } else if (event.eventType === 'stock.transferred') {
        response = await sageX3Client.postStockMovement(transformedData);
      } else if (event.eventType === 'stock.dispensed' || event.eventType === 'stock.sold') {
        response = await sageX3Client.postStockMovement(transformedData);
      } else if (event.eventType === 'stock.returned') {
        response = await sageX3Client.postStockMovement(transformedData);
      } else {
        // For other stock events like recalled, archived
        response = {
          success: true,
          documentReference: event.eventId,
          documentType: 'stock_adjustment',
          message: 'Stock adjustment recorded'
        };
      }
    }
    // Item events
    else if (event.eventType.startsWith('item.')) {
      // Item events might not sync directly to Sage X3, or might go to item master
      response = {
        success: true,
        documentReference: event.eventId,
        documentType: 'item_update',
        message: 'Item update recorded'
      };
    }
    else {
      throw new Error(`Unsupported event type for Sage X3 sync: ${event.eventType}`);
    }
    
    // Update transaction with success
    transaction.status = 'synced';
    transaction.response = response;
    transaction.completedAt = new Date();
    transaction.sageX3Details = {
      documentType: documentType,
      documentReference: response.documentReference || event.eventId,
      sageResponse: response
    };
    await transaction.save();
    
    // Mark event as synced
    await event.markAsSynced(response);
    
    await AuditLog.logAction({
      action: 'event.synced',
      eventId: event.eventId,
      actor: { type: 'system' },
      details: { 
        eventType: event.eventType,
        sageResponse: response 
      },
      result: { status: 'success', message: 'Successfully synced to Sage X3' },
      category: 'processing',
      severity: 'info'
    });
    
    logger.queue.info(`Event synced to Sage X3: ${event.eventId}`, {
      response: response
    });
    
  } catch (error) {
    // Update transaction with failure
    try {
      const transaction = await Transaction.findOne({ eventId: event.eventId });
      if (transaction) {
        transaction.status = 'failed';
        transaction.errorMessage = error.message;
        transaction.errorDetails = {
          stack: error.stack,
          response: error.response?.data
        };
        transaction.attempts += 1;
        transaction.sageX3Details = {
          documentType: documentTypeEnumMap[event.eventType] || 'general',
          documentReference: event.eventId
        };
        await transaction.save();
      }
    } catch (transactionError) {
      logger.queue.error('Failed to update transaction record:', transactionError);
    }
    
    // Use 'sage_api' which is a valid enum value
    await event.markAsFailed('sage_api', error.message, { 
      stack: error.stack,
      sageResponse: error.response?.data 
    });
    
    await AuditLog.logAction({
      action: 'event.synced',
      eventId: event.eventId,
      actor: { type: 'system' },
      details: { 
        eventType: event.eventType,
        error: error.message 
      },
      result: { status: 'failure', message: 'Failed to sync to Sage X3' },
      category: 'processing',
      severity: 'error'
    });
    
    logger.queue.error(`Sage X3 sync failed for ${event.eventId}:`, { 
      error: error.message,
      response: error.response?.data
    });
    
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