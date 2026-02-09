const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  // Event identification
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
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
  
  // Event payload
  rawPayload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Processing status
  status: {
    type: String,
    enum: ['received', 'validated', 'transformed', 'synced', 'failed', 'reversed'],
    default: 'received',
    index: true
  },
  
  // Validation
  validationResult: {
    isValid: { type: Boolean, default: false },
    errors: [String],
    validatedAt: Date
  },
  
  // Transformation
  transformedPayload: {
    type: mongoose.Schema.Types.Mixed
  },
  transformedAt: Date,
  
  // Sage X3 sync details
  sageX3Transaction: {
    documentReference: String,
    documentType: String,
    syncedAt: Date,
    response: mongoose.Schema.Types.Mixed
  },
  
  // Error handling
  errors: [{
    type: {
      type: String,
      enum: ['validation', 'business_rule', 'sage_api', 'network', 'system']
    },
    message: String,
    details: mongoose.Schema.Types.Mixed,
    occurredAt: { type: Date, default: Date.now }
  }],
  
  // Retry tracking
  retryCount: {
    type: Number,
    default: 0
  },
  lastRetryAt: Date,
  nextRetryAt: Date,
  
  // Reversal tracking
  reversed: {
    type: Boolean,
    default: false
  },
  reversalReason: String,
  reversalTransactionId: String,
  reversedAt: Date,
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Webhook metadata
  webhookSignature: String,
  webhookTimestamp: Date,
  sourceIp: String,
  
  // Audit trail
  processedBy: String,
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

// Indexes for common queries
eventSchema.index({ eventType: 1, status: 1 });
eventSchema.index({ createdAt: -1 });
eventSchema.index({ 'sageX3Transaction.documentReference': 1 });
eventSchema.index({ status: 1, nextRetryAt: 1 });

// Pre-save middleware
eventSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Instance methods
eventSchema.methods.markAsValidated = function(isValid, errors = []) {
  this.validationResult = {
    isValid,
    errors,
    validatedAt: new Date()
  };
  this.status = isValid ? 'validated' : 'failed';
  return this.save();
};

eventSchema.methods.markAsTransformed = function(transformedData) {
  this.transformedPayload = transformedData;
  this.transformedAt = new Date();
  this.status = 'transformed';
  return this.save();
};

eventSchema.methods.markAsSynced = function(sageResponse) {
  this.sageX3Transaction = {
    ...sageResponse,
    syncedAt: new Date()
  };
  this.status = 'synced';
  return this.save();
};

eventSchema.methods.markAsFailed = function(errorType, errorMessage, errorDetails) {
  this.errors.push({
    type: errorType,
    message: errorMessage,
    details: errorDetails,
    occurredAt: new Date()
  });
  this.status = 'failed';
  return this.save();
};

eventSchema.methods.incrementRetry = function(delayMs) {
  this.retryCount += 1;
  this.lastRetryAt = new Date();
  this.nextRetryAt = new Date(Date.now() + delayMs);
  return this.save();
};

eventSchema.methods.markAsReversed = function(reason, reversalTxnId) {
  this.reversed = true;
  this.reversalReason = reason;
  this.reversalTransactionId = reversalTxnId;
  this.reversedAt = new Date();
  this.status = 'reversed';
  return this.save();
};

// Static methods
eventSchema.statics.findByEventId = function(eventId) {
  return this.findOne({ eventId });
};

eventSchema.statics.findPendingRetries = function() {
  return this.find({
    status: 'failed',
    retryCount: { $lt: parseInt(process.env.MAX_RETRY_ATTEMPTS || 3) },
    nextRetryAt: { $lte: new Date() }
  });
};

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

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;
