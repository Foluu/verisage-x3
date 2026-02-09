const mongoose = require('mongoose');

const configurationSchema = new mongoose.Schema({
  // Configuration key (unique identifier)
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Configuration category
  category: {
    type: String,
    required: true,
    enum: ['sage_x3', 'webhook', 'retry', 'mapping', 'feature', 'security', 'system'],
    index: true
  },
  
  // Configuration value
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Value type for validation
  valueType: {
    type: String,
    enum: ['string', 'number', 'boolean', 'object', 'array'],
    required: true
  },
  
  // Description
  description: {
    type: String,
    required: true
  },
  
  // Validation rules
  validation: {
    required: { type: Boolean, default: false },
    min: Number,
    max: Number,
    pattern: String,
    enum: [String]
  },
  
  // Environment-specific
  environment: {
    type: String,
    enum: ['all', 'development', 'staging', 'production'],
    default: 'all'
  },
  
  // Security
  sensitive: {
    type: Boolean,
    default: false
  },
  encrypted: {
    type: Boolean,
    default: false
  },
  
  // Change tracking
  lastModified: {
    by: String,
    at: Date,
    reason: String
  },
  
  // Versioning
  version: {
    type: Number,
    default: 1
  },
  previousValues: [{
    value: mongoose.Schema.Types.Mixed,
    changedBy: String,
    changedAt: Date
  }],
  
  // Status
  active: {
    type: Boolean,
    default: true
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'configurations'
});

// Indexes
configurationSchema.index({ category: 1, active: 1 });
configurationSchema.index({ environment: 1, active: 1 });

// Pre-save middleware
configurationSchema.pre('save', function(next) {
  if (this.isModified('value')) {
    // Store previous value in history
    if (this._previousValue !== undefined) {
      this.previousValues.push({
        value: this._previousValue,
        changedBy: this.lastModified?.by || 'system',
        changedAt: new Date()
      });
    }
    this.version += 1;
  }
  next();
});

// Instance methods
configurationSchema.methods.updateValue = function(newValue, userId, reason) {
  this._previousValue = this.value;
  this.value = newValue;
  this.lastModified = {
    by: userId,
    at: new Date(),
    reason
  };
  return this.save();
};

// Static methods
configurationSchema.statics.getConfig = async function(key, defaultValue = null) {
  const config = await this.findOne({ key, active: true });
  return config ? config.value : defaultValue;
};

configurationSchema.statics.setConfig = async function(key, value, userId, reason) {
  const config = await this.findOne({ key });
  if (config) {
    return config.updateValue(value, userId, reason);
  }
  return null;
};

configurationSchema.statics.getConfigsByCategory = function(category) {
  return this.find({ category, active: true }).sort({ key: 1 });
};

configurationSchema.statics.getAllActiveConfigs = function() {
  return this.find({ active: true }).sort({ category: 1, key: 1 });
};

configurationSchema.statics.getConfigHistory = function(key) {
  return this.findOne({ key }).select('key value version previousValues lastModified');
};

// Default configurations seed data
configurationSchema.statics.seedDefaults = async function() {
  const defaults = [
    {
      key: 'retry.maxAttempts',
      category: 'retry',
      value: 3,
      valueType: 'number',
      description: 'Maximum number of retry attempts for failed events',
      validation: { required: true, min: 0, max: 10 }
    },
    {
      key: 'retry.delayMs',
      category: 'retry',
      value: 5000,
      valueType: 'number',
      description: 'Initial retry delay in milliseconds',
      validation: { required: true, min: 1000, max: 60000 }
    },
    {
      key: 'retry.exponentialBackoff',
      category: 'retry',
      value: true,
      valueType: 'boolean',
      description: 'Enable exponential backoff for retries'
    },
    {
      key: 'feature.invoiceEvents',
      category: 'feature',
      value: true,
      valueType: 'boolean',
      description: 'Enable processing of invoice events'
    },
    {
      key: 'feature.paymentEvents',
      category: 'feature',
      value: true,
      valueType: 'boolean',
      description: 'Enable processing of payment events'
    },
    {
      key: 'feature.inventoryEvents',
      category: 'feature',
      value: true,
      valueType: 'boolean',
      description: 'Enable processing of inventory events'
    },
    {
      key: 'feature.autoRetry',
      category: 'feature',
      value: true,
      valueType: 'boolean',
      description: 'Enable automatic retry of failed events'
    },
    {
      key: 'webhook.timestampTolerance',
      category: 'webhook',
      value: 300,
      valueType: 'number',
      description: 'Webhook timestamp tolerance in seconds',
      validation: { required: true, min: 60, max: 600 }
    },
    {
      key: 'sage.currencyDivisor',
      category: 'sage_x3',
      value: 100,
      valueType: 'number',
      description: 'Divisor to convert subunits to base currency (kobo to naira)',
      validation: { required: true, min: 1 }
    },
    {
      key: 'system.dataRetentionDays',
      category: 'system',
      value: 90,
      valueType: 'number',
      description: 'Number of days to retain event data',
      validation: { required: true, min: 30, max: 365 }
    }
  ];
  
  const promises = defaults.map(async (config) => {
    const existing = await this.findOne({ key: config.key });
    if (!existing) {
      return this.create(config);
    }
  });
  
  return Promise.all(promises);
};

const Configuration = mongoose.model('Configuration', configurationSchema);

module.exports = Configuration;
