const Joi = require('joi');

// ============================================================================
// INDIGO HMS PAYLOAD STRUCTURE
// ============================================================================

// Common schemas
const operatorSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required()
});

const patientSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  mrn: Joi.string().required(),
  phoneNumber: Joi.string().allow('', null),
  email: Joi.string().email().allow('', null),
  gender: Joi.string().allow('', null),
  owing: Joi.number().allow(null),
  sponsors: Joi.array().optional(),
  admission: Joi.object().optional()
});

// Item schema for actual payload
const actualItemSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  quantity: Joi.number().min(0).required(),
  price: Joi.number().min(0).required(),
  basePrice: Joi.number().min(0).optional(),
  total: Joi.number().min(0).optional(),
  billItemId: Joi.string().optional(),
  type: Joi.string().optional(),
  categories: Joi.array().optional(),
  date: Joi.string().optional(),
  dispenseCompleted: Joi.boolean().optional(),
  dispenseLog: Joi.array().optional(),
  returnCompleted: Joi.boolean().optional(),
  returnLog: Joi.array().optional(),
  posClassifications: Joi.array().optional(),
  operator: operatorSchema.optional(),
  source: Joi.object({
    id: Joi.string(),
    name: Joi.string()
  }).optional(),
  // Note: NO variant in actual payload!
});

// ============================================================================
// PAYMENT EVENTS - ACTUAL STRUCTURE
// ============================================================================

const paymentCreatedSchema = Joi.object({
  event: Joi.string().valid('payment.created').required(),
  data: Joi.object({
    id: Joi.string().required(),
    timestamp: Joi.string().optional(),
    claims: Joi.array().optional(),
    
    // Invoice object (not "bill"!)
    invoice: Joi.object({
      id: Joi.string().required(),
      proforma: Joi.boolean().required(),
      items: Joi.array().items(actualItemSchema).min(1).required(),
      patient: patientSchema.required(),
      operator: operatorSchema.required()
    }).required(),
    
    // Payments array (not single payment object!)
    payments: Joi.array().items(Joi.object({
      id: Joi.string().required(),
      amount: Joi.number().min(0).required(),
      method: Joi.string().valid('wallet', 'cash', 'pos', 'transfer', 'cheque', 'direct-lodgement').required(),
      paymentReference: Joi.string().allow('', null).optional(),
      provider: Joi.string().allow('', null).optional(),
      operator: operatorSchema.optional()
    })).min(1).required()
  }).required(),
  metadata: Joi.object().optional()
});

const paymentCancelledSchema = Joi.object({
  event: Joi.string().valid('payment.cancelled').required(),
  data: Joi.object({
    id: Joi.string().required(),
    reason: Joi.string().required(),
    operator: operatorSchema.required()
  }).required(),
  metadata: Joi.object().optional()
});

// ============================================================================
// STOCK EVENTS - ACTUAL STRUCTURE
// ============================================================================

const stockCreatedSchema = Joi.object({
  event: Joi.string().valid('stock.created').required(),
  data: Joi.object({
    id: Joi.string().required(),
    batchId: Joi.string().required(),
    code: Joi.string().required(),
    quantity: Joi.number().min(0).required(),
    costPrice: Joi.number().min(0).required(),
    expiryDate: Joi.string().allow(null).optional(),
    timestamp: Joi.string().optional(),
    
    // Item object (not separate fields)
    item: Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required()
    }).required(),
    
    // Supplier object
    supplier: Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required()
    }).required(),
    
    // Note: NO variant in actual payload!
    // Note: NO barcode, upc in this payload
    operator: operatorSchema.optional()
  }).required(),
  metadata: Joi.object().optional()
});

// ============================================================================
// INVOICE EVENTS - KEEP EXISTING (assumed correct based on payment structure)
// ============================================================================

const invoiceCreatedSchema = Joi.object({
  event: Joi.string().valid('invoice.created').required(),
  data: Joi.object({
    id: Joi.string().required(),
    proforma: Joi.boolean().required(),
    items: Joi.array().items(actualItemSchema).min(1).required(),
    patient: patientSchema.required(),
    operator: operatorSchema.required()
  }).required(),
  metadata: Joi.object().optional()
});

const invoiceUpdatedSchema = Joi.object({
  event: Joi.string().valid('invoice.updated').required(),
  data: Joi.object({
    id: Joi.string().required(),
    items: Joi.array().items(actualItemSchema).min(1).required(),
    patient: patientSchema.required(),
    operator: operatorSchema.required()
  }).required(),
  metadata: Joi.object().optional()
});

const invoiceCancelledSchema = Joi.object({
  event: Joi.string().valid('invoice.cancelled').required(),
  data: Joi.object({
    id: Joi.string().required(),
    reason: Joi.string().required(),
    operator: operatorSchema.required()
  }).required(),
  metadata: Joi.object().optional()
});

// ============================================================================
// ITEM EVENTS - Keep existing (need actual payload to verify)
// ============================================================================

const itemCreatedSchema = Joi.object({
  event: Joi.string().valid('item.created').required(),
  data: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required(),
    categories: Joi.array().items(Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required()
    })).optional(),
    type: Joi.string().valid('product', 'service').optional(),
    unitOfSale: Joi.string().optional(),
    unitOfPurchase: Joi.string().optional(),
    attributes: Joi.object().optional(),
    variants: Joi.array().optional(),
    pricing: Joi.array().optional(),
    operator: operatorSchema.optional()
  }).required(),
  metadata: Joi.object().optional()
});

// Simplified/flexible schemas for other events until we see actual payloads
const genericEventSchema = Joi.object({
  event: Joi.string().required(),
  data: Joi.object().required(),
  metadata: Joi.object().optional()
});

// ============================================================================
// EXPORT VALIDATION SCHEMAS
// ============================================================================

const validationSchemas = {
  // Payment events - UPDATED
  'payment.created': paymentCreatedSchema,
  'payment.cancelled': paymentCancelledSchema,
  
  // Stock events - UPDATED
  'stock.created': stockCreatedSchema,
  
  // Invoice events - UPDATED
  'invoice.created': invoiceCreatedSchema,
  'invoice.updated': invoiceUpdatedSchema,
  'invoice.cancelled': invoiceCancelledSchema,
  
  // Item events - Keep flexible for now
  'item.created': itemCreatedSchema,
  'item.updated': genericEventSchema,
  'item.archived': genericEventSchema,
  
  // Stock events - Keep flexible until we see actual payloads
  'stock.updated': genericEventSchema,
  'stock.incremented': genericEventSchema,
  'stock.transferred': genericEventSchema,
  'stock.recalled': genericEventSchema,
  'stock.archived': genericEventSchema,
  'stock.dispensed': genericEventSchema,
  'stock.sold': genericEventSchema,
  'stock.returned': genericEventSchema
};

module.exports = validationSchemas;