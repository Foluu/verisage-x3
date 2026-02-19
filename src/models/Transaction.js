const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // Transaction identification
  transactionId: {
    type: String,
    required: false,
    unique: true,
    index: true
  },
  
  // Link to original event
  eventId: {
    type: String,
    required: true,
    ref: 'Event',
    index: true
  },
  
  eventType: {
    type: String,
    required: true
  },
  
  // Sage X3 details
  sageX3Details: {
    documentReference: {
      type: String,
      // required: true,
      index: true
    },
    documentType: {
      type: String,
      // required: true,
      enum: ['invoice', 'payment', 'credit_note', 'stock_movement', 'purchase_order']
    },
    folder: String,
    company: String,
    postingDate: Date,
    apiResponse: mongoose.Schema.Types.Mixed
  },
  
  // Financial details (if applicable)
  financialData: {
    amount: Number, // In base currency units
    currency: String,
    customerReference: String,
    invoiceNumber: String,
    paymentMethod: String
  },
  
  // Inventory details (if applicable)
  inventoryData: {
    items: [{
      itemId: String,
      variantId: String,
      sku: String,
      quantity: Number,
      unitPrice: Number
    }],
    stockCodes: [String],
    movementType: String,
    fromLocation: String,
    toLocation: String
  },
  
  // Transaction status
  status: {
    type: String,
    enum: ['pending', 'synced', 'reversed', 'failed'],
    default: 'pending',
    index: true
  },
  
  // Reversal tracking
  reversed: {
    type: Boolean,
    default: false,
    index: true
  },
  reversalDetails: {
    reason: String,
    reversalDocumentReference: String,
    reversedBy: String,
    reversedAt: Date
  },
  
  // Audit trail
  syncedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  syncedBy: String,
  
  // Verification
  verified: {
    type: Boolean,
    default: false
  },
  verifiedAt: Date,
  verifiedBy: String,
  
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
  collection: 'transactions'
});

// Indexes for common queries
transactionSchema.index({ eventType: 1, status: 1 });
transactionSchema.index({ syncedAt: -1 });
transactionSchema.index({ 'sageX3Details.documentReference': 1 });
transactionSchema.index({ 'sageX3Details.documentType': 1 });
transactionSchema.index({ 'financialData.invoiceNumber': 1 });

// Pre-save middleware
transactionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Instance methods
transactionSchema.methods.markAsReversed = function(reason, reversalDocRef, userId) {
  this.reversed = true;
  this.status = 'reversed';
  this.reversalDetails = {
    reason,
    reversalDocumentReference: reversalDocRef,
    reversedBy: userId,
    reversedAt: new Date()
  };
  return this.save();
};

transactionSchema.methods.markAsVerified = function(userId) {
  this.verified = true;
  this.verifiedAt = new Date();
  this.verifiedBy = userId;
  return this.save();
};

// Static methods
transactionSchema.statics.findByDocumentReference = function(docRef) {
  return this.findOne({ 'sageX3Details.documentReference': docRef });
};

transactionSchema.statics.findByEventId = function(eventId) {
  return this.findOne({ eventId });
};

transactionSchema.statics.getTransactionStats = function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        syncedAt: {
          $gte: startDate,
          $lte: endDate
        }
      }
    },
    {
      $group: {
        _id: {
          eventType: '$eventType',
          documentType: '$sageX3Details.documentType',
          status: '$status'
        },
        count: { $sum: 1 },
        totalAmount: { $sum: '$financialData.amount' }
      }
    },
    {
      $sort: { '_id.eventType': 1 }
    }
  ]);
};

transactionSchema.statics.findUnverifiedTransactions = function(olderThanDays = 1) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
  
  return this.find({
    verified: false,
    syncedAt: { $lte: cutoffDate },
    status: 'synced'
  }).sort({ syncedAt: 1 });
};

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
