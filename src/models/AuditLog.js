const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  // Action identification
  action: {
    type: String,
    required: true,
    enum: [
      'event.received',
      'event.validated',
      'event.transformed',
      'event.synced',
      'event.failed',
      'event.retried',
      'event.reversed',
      'transaction.created',
      'transaction.reversed',
      'transaction.verified',
      'config.updated',
      'user.login',
      'user.action',
      'system.error',
      'manual.intervention'
    ],
    index: true
  },
  
  // Entity references
  eventId: {
    type: String,
    index: true
  },
  transactionId: {
    type: String,
    index: true
  },
  
  // Actor information
  actor: {
    type: {
      type: String,
      enum: ['system', 'user', 'webhook', 'scheduler'],
      required: true
    },
    userId: String,
    userName: String,
    ipAddress: String,
    userAgent: String
  },
  
  // Action details
  details: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Before/After state for changes
  changeTracking: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },
  
  // Result
  result: {
    status: {
      type: String,
      enum: ['success', 'failure', 'warning'],
      required: true
    },
    message: String,
    errorDetails: mongoose.Schema.Types.Mixed
  },
  
  // Timing
  duration: Number, // in milliseconds
  
  // Environment
  environment: {
    type: String,
    enum: ['development', 'staging', 'production'],
    default: process.env.NODE_ENV || 'development'
  },
  
  // Categorization
  category: {
    type: String,
    enum: ['webhook', 'processing', 'sync', 'reversal', 'admin', 'security', 'system'],
    required: true,
    index: true
  },
  
  // Severity
  severity: {
    type: String,
    enum: ['info', 'warning', 'error', 'critical'],
    default: 'info',
    index: true
  },
  
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false, // We use timestamp field instead
  collection: 'audit_logs'
});

// Indexes for efficient querying
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ category: 1, timestamp: -1 });
auditLogSchema.index({ severity: 1, timestamp: -1 });
auditLogSchema.index({ 'actor.userId': 1, timestamp: -1 });
auditLogSchema.index({ eventId: 1, timestamp: -1 });

// Static methods
auditLogSchema.statics.logAction = async function(data) {
  const log = new this({
    action: data.action,
    eventId: data.eventId,
    transactionId: data.transactionId,
    actor: data.actor,
    details: data.details,
    changeTracking: data.changeTracking,
    result: data.result,
    duration: data.duration,
    category: data.category,
    severity: data.severity || 'info'
  });
  
  return log.save();
};

auditLogSchema.statics.getActivityLog = function(filters = {}, limit = 100) {
  const query = {};
  
  if (filters.eventId) query.eventId = filters.eventId;
  if (filters.transactionId) query.transactionId = filters.transactionId;
  if (filters.action) query.action = filters.action;
  if (filters.category) query.category = filters.category;
  if (filters.severity) query.severity = filters.severity;
  if (filters.userId) query['actor.userId'] = filters.userId;
  
  if (filters.startDate || filters.endDate) {
    query.timestamp = {};
    if (filters.startDate) query.timestamp.$gte = filters.startDate;
    if (filters.endDate) query.timestamp.$lte = filters.endDate;
  }
  
  return this.find(query)
    .sort({ timestamp: -1 })
    .limit(limit);
};

auditLogSchema.statics.getAuditTrail = function(eventId) {
  return this.find({ eventId })
    .sort({ timestamp: 1 });
};

auditLogSchema.statics.getUserActivity = function(userId, startDate, endDate) {
  return this.find({
    'actor.userId': userId,
    timestamp: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ timestamp: -1 });
};

auditLogSchema.statics.getCriticalEvents = function(hours = 24) {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hours);
  
  return this.find({
    severity: { $in: ['error', 'critical'] },
    timestamp: { $gte: cutoffDate }
  }).sort({ timestamp: -1 });
};

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
