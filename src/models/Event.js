
const mongoose = require('mongoose');


const eventSchema = new mongoose.Schema({
  // Event identification
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Event type
  eventType: {
    type: String,
    required: true,
    enum: [
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
    ],
    index: true
  },
  
  // Raw webhook payload
  rawPayload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Processing status
  status: {
    type: String,
    enum: ['received', 'validated', 'transformed', 'synced', 'failed', 'reversed'],
    default: 'received',
    required: true,
    index: true
  },
  
  // Validation result
  validationResult: {
    isValid: Boolean,
    errors: [String],
    validatedAt: Date
  },
  
  // Transformed payload (ready for Sage X3)
  transformedPayload: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Sync result
  syncResult: {
    success: Boolean,
    documentReference: String,
    syncedAt: Date,
    response: mongoose.Schema.Types.Mixed
  },
  
  // Error tracking
  errors: [{
    type: {
      type: String,
      enum: ['validation', 'transformation', 'sage_api', 'business_rule', 'system']
    },
    message: String,
    details: mongoose.Schema.Types.Mixed,
    occurredAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Retry mechanism
  retryCount: {
    type: Number,
    default: 0
  },
  retryScheduledFor: Date,
  
  // Reversal tracking
  reversed: {
    type: Boolean,
    default: false,
    index: true
  },
  reversalReason: String,
  reversalTransactionId: String,
  reversedAt: Date,
  
  // Webhook metadata
  webhookSignature: String,
  webhookTimestamp: Date,
  sourceIp: String,
  
  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'events'
});

// Indexes for efficient querying
eventSchema.index({ eventType: 1, status: 1 });
eventSchema.index({ createdAt: -1 });
eventSchema.index({ status: 1, createdAt: -1 });
eventSchema.index({ 'metadata.svixId': 1 });

// Pre-save middleware to update timestamp
eventSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Instance methods

/**
 * Mark event as validated
 */
eventSchema.methods.markAsValidated = function(isValid, errors = []) {
  this.status = isValid ? 'validated' : 'failed';
  this.validationResult = {
    isValid,
    errors,
    validatedAt: new Date()
  };
  
  if (!isValid) {
    this.errors.push({
      type: 'validation',
      message: 'Validation failed',
      details: { errors },
      occurredAt: new Date()
    });
  }
  
  return this.save();
};

/**
 * Mark event as transformed
 */
eventSchema.methods.markAsTransformed = function(transformedPayload) {
  this.status = 'transformed';
  this.transformedPayload = transformedPayload;
  return this.save();
};

/**
 * Mark event as synced
 */
eventSchema.methods.markAsSynced = function(syncResult) {
  this.status = 'synced';
  this.syncResult = {
    success: true,
    documentReference: syncResult.documentReference,
    syncedAt: new Date(),
    response: syncResult.response
  };
  return this.save();
};

/**
 * Mark event as failed
 */
eventSchema.methods.markAsFailed = function(errorType, message, details = {}) {
  this.status = 'failed';
  this.errors.push({
    type: errorType,
    message,
    details,
    occurredAt: new Date()
  });
  return this.save();
};

/**
 * Mark event as reversed
 */
eventSchema.methods.markAsReversed = function(reason, transactionId) {
  this.reversed = true;
  this.status = 'reversed';
  this.reversalReason = reason;
  this.reversalTransactionId = transactionId;
  this.reversedAt = new Date();
  return this.save();
};

/**
 * Increment retry count
 */
eventSchema.methods.incrementRetry = function(delayMs) {
  this.retryCount += 1;
  this.retryScheduledFor = new Date(Date.now() + delayMs);
  return this.save();
};

// Static methods

/**
 * Find event by eventId
 */
eventSchema.statics.findByEventId = function(eventId) {
  return this.findOne({ eventId });
};

/**
 * Find events by status
 */
eventSchema.statics.findByStatus = function(status, limit = 100) {
  return this.find({ status })
    .sort({ createdAt: -1 })
    .limit(limit);
};

/**
 * Find failed events ready for retry
 */
eventSchema.statics.findRetryableEvents = function() {
  const now = new Date();
  return this.find({
    status: 'failed',
    retryScheduledFor: { $lte: now },
    retryCount: { $lt: parseInt(process.env.MAX_RETRY_ATTEMPTS || 3) }
  }).sort({ retryScheduledFor: 1 });
};

/**
 * Get event statistics
 */
eventSchema.statics.getEventStats = function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        createdAt: {
          $gte: startDate,
          $lte: endDate
        }
      }
    },
    {
      $group: {
        _id: {
          eventType: '$eventType',
          status: '$status'
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.eventType': 1, '_id.status': 1 }
    }
  ]);
};

/**
 * Get failed events count
 */
eventSchema.statics.getFailedCount = function() {
  return this.countDocuments({ status: 'failed' });
};

/**
 * Get pending events count
 */
eventSchema.statics.getPendingCount = function() {
  return this.countDocuments({ 
    status: { $in: ['received', 'validated', 'transformed'] } 
  });
};

/**
 * Clean up old events
 */
eventSchema.statics.cleanupOldEvents = function(daysToRetain = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToRetain);
  
  return this.deleteMany({
    createdAt: { $lt: cutoffDate },
    status: { $in: ['synced', 'reversed'] }
  });
};

const Event = mongoose.model('Event', eventSchema);



module.exports = Event;