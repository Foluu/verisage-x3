
const Joi = require('joi');


// ============================================================================
// COMMON SCHEMAS - UPDATED TO MATCH ACTUAL PAYLOADS
// ============================================================================

const operatorSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required()
});

const patientSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  mrn: Joi.string().required(),
  phoneNumber: Joi.string().allow('', null).optional(),
  email: Joi.string().email().allow('', null).optional(),
  gender: Joi.string().allow('', null).optional(),
  owing: Joi.number().allow(null).optional(),
  sponsors: Joi.array().optional(),
  admission: Joi.object().optional()
});

// Consultant schema (appears in items)
const consultantSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  email: Joi.string().email().allow('', null).optional(),
  phoneNumber: Joi.string().allow('', null).optional(),
  avatar: Joi.string().allow('', null).optional()
});

// Category schema
const categorySchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required()
});

// UPDATED: Item schema to match actual structure (NO variant requirement)
const itemSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  quantity: Joi.number().min(0).required(),
  price: Joi.number().min(0).required(),
  total: Joi.number().min(0).optional(),
  type: Joi.string().optional(), // 'service' or 'product'
  
  // Optional fields that may be present
  categories: Joi.array().items(categorySchema).optional(),
  consultant: consultantSchema.optional(),
  basePrice: Joi.number().min(0).optional(),
  billItemId: Joi.string().optional(),
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
  
  // Variant is OPTIONAL (not always present)
  variant: Joi.object({
    id: Joi.string().required(),
    title: Joi.string().required(),
    sku: Joi.string().optional()
  }).optional()
});

const locationSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required()
});

const stockItemSchema = Joi.object({
  code: Joi.string().required(),
  batchId: Joi.string().required(),
  quantity: Joi.number().min(0).required()
});

// ============================================================================
// INVOICE VALIDATION SCHEMAS - FIXED
// ============================================================================

const invoiceCreatedSchema = Joi.object({
  event: Joi.string().valid('invoice.created').required(),
  data: Joi.object({
    id: Joi.string().required(),
    proforma: Joi.boolean().optional(), // FIXED: Made optional
    items: Joi.array().items(itemSchema).min(1).required(),
    patient: patientSchema.required(),
    operator: operatorSchema.required(),
    timestamp: Joi.string().optional() // Added timestamp
  }).required(),
  metadata: Joi.object().optional()
});

const invoiceUpdatedSchema = Joi.object({
  event: Joi.string().valid('invoice.updated').required(),
  data: Joi.object({
    id: Joi.string().required(),
    proforma: Joi.boolean().optional(),
    items: Joi.array().items(itemSchema).min(1).required(),
    patient: patientSchema.required(),
    operator: operatorSchema.required(),
    timestamp: Joi.string().optional()
  }).required(),
  metadata: Joi.object().optional()
});

const invoiceCancelledSchema = Joi.object({
  event: Joi.string().valid('invoice.cancelled').required(),
  data: Joi.object({
    id: Joi.string().required(),
    reason: Joi.string().required(),
    operator: operatorSchema.required(),
    timestamp: Joi.string().optional()
  }).required(),
  metadata: Joi.object().optional()
});

// ============================================================================
// PAYMENT VALIDATION SCHEMAS - FIXED FOR ACTUAL STRUCTURE
// ============================================================================

const paymentCreatedSchema = Joi.object({
  event: Joi.string().valid('payment.created').required(),
  data: Joi.object({
    id: Joi.string().required(),
    timestamp: Joi.string().optional(),
    claims: Joi.array().optional(),
    
    // FIXED: 'invoice' not 'bill'
    invoice: Joi.object({
      id: Joi.string().required(),
      proforma: Joi.boolean().optional(), // Made optional
      items: Joi.array().items(itemSchema).min(1).required(),
      patient: patientSchema.required(),
      operator: operatorSchema.required()
    }).required(),
    
    // FIXED: payments is an ARRAY
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
    operator: operatorSchema.required(),
    timestamp: Joi.string().optional()
  }).required(),
  metadata: Joi.object().optional()
});

// ============================================================================
// ITEM VALIDATION SCHEMAS
// ============================================================================

const itemCreatedSchema = Joi.object({
  event: Joi.string().valid('item.created').required(),
  data: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required(),
    categories: Joi.array().items(categorySchema).optional(),
    type: Joi.string().valid('product', 'service').optional(),
    unitOfSale: Joi.string().optional(),
    unitOfPurchase: Joi.string().optional(),
    attributes: Joi.object().optional(),
    variants: Joi.array().optional(),
    pricing: Joi.array().optional(),
    operator: operatorSchema.optional(),
    timestamp: Joi.string().optional()
  }).required(),
  metadata: Joi.object().optional()
});

const itemUpdatedSchema = Joi.object({
  event: Joi.string().valid('item.updated').required(),
  data: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().optional(),
    categories: Joi.array().items(categorySchema).optional(),
    type: Joi.string().valid('product', 'service').optional(),
    attributes: Joi.object().optional(),
    variants: Joi.array().optional(),
    pricing: Joi.array().optional(),
    operator: operatorSchema.optional(),
    timestamp: Joi.string().optional()
  }).required(),
  metadata: Joi.object().optional()
});

const itemArchivedSchema = Joi.object({
  event: Joi.string().valid('item.archived').required(),
  data: Joi.object({
    id: Joi.string().required(),
    reason: Joi.string().optional(),
    operator: operatorSchema.optional(),
    timestamp: Joi.string().optional()
  }).required(),
  metadata: Joi.object().optional()
});

// ============================================================================
// STOCK VALIDATION SCHEMAS - FIXED FOR ACTUAL STRUCTURE
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
    
    // FIXED: item is an OBJECT not a string
    item: Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required()
    }).required(),
    
    // Supplier object
    supplier: Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required()
    }).required(),
    
    // Variant is optional (not always present)
    variant: Joi.object({
      id: Joi.string(),
      title: Joi.string(),
      sku: Joi.string()
    }).optional(),
    
    operator: operatorSchema.optional()
  }).required(),
  metadata: Joi.object().optional()
});

const stockUpdatedSchema = Joi.object({
  event: Joi.string().valid('stock.updated').required(),
  data: Joi.object({
    id: Joi.string().required(),
    quantity: Joi.number().min(0).optional(),
    costPrice: Joi.number().min(0).optional(),
    expiryDate: Joi.string().allow(null).optional(),
    operator: operatorSchema.optional(),
    timestamp: Joi.string().optional()
  }).required(),
  metadata: Joi.object().optional()
});

const stockIncrementedSchema = Joi.object({
  event: Joi.string().valid('stock.incremented').required(),
  data: Joi.object({
    id: Joi.string().required(),
    quantityAdded: Joi.number().min(0).required(),
    newQuantity: Joi.number().min(0).required(),
    operator: operatorSchema.optional(),
    timestamp: Joi.string().optional()
  }).required(),
  metadata: Joi.object().optional()
});

const stockTransferredSchema = Joi.object({
  event: Joi.string().valid('stock.transferred').required(),
  data: Joi.object({
    from: locationSchema.required(),
    to: locationSchema.required(),
    comment: Joi.string().allow('', null).optional(),
    stocks: Joi.array().items(stockItemSchema).min(1).required(),
    operator: operatorSchema.optional(),
    timestamp: Joi.string().optional()
  }).required(),
  metadata: Joi.object().optional()
});

const stockRecalledSchema = Joi.object({
  event: Joi.string().valid('stock.recalled').required(),
  data: Joi.object({
    id: Joi.string().required(),
    reason: Joi.string().required(),
    operator: operatorSchema.optional(),
    timestamp: Joi.string().optional()
  }).required(),
  metadata: Joi.object().optional()
});

const stockArchivedSchema = Joi.object({
  event: Joi.string().valid('stock.archived').required(),
  data: Joi.object({
    id: Joi.string().required(),
    reason: Joi.string().optional(),
    operator: operatorSchema.optional(),
    timestamp: Joi.string().optional()
  }).required(),
  metadata: Joi.object().optional()
});

const stockDispensedSchema = Joi.object({
  event: Joi.string().valid('stock.dispensed').required(),
  data: Joi.object({
    id: Joi.string().required(),
    bill: Joi.string().optional(),
    purpose: Joi.string().optional(),
    to: Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required(),
      type: Joi.string().optional(),
      mrn: Joi.string().optional()
    }).required(),
    from: locationSchema.required(),
    stocks: Joi.array().items(stockItemSchema).min(1).required(),
    operator: operatorSchema.optional(),
    timestamp: Joi.string().optional()
  }).required(),
  metadata: Joi.object().optional()
});

const stockSoldSchema = Joi.object({
  event: Joi.string().valid('stock.sold').required(),
  data: Joi.object({
    id: Joi.string().required(),
    bill: Joi.string().required(),
    from: locationSchema.required(),
    stocks: Joi.array().items(stockItemSchema).min(1).required(),
    operator: operatorSchema.optional(),
    timestamp: Joi.string().optional()
  }).required(),
  metadata: Joi.object().optional()
});

const stockReturnedSchema = Joi.object({
  event: Joi.string().valid('stock.returned').required(),
  data: Joi.object({
    id: Joi.string().required(),
    reason: Joi.string().required(),
    from: locationSchema.required(),
    to: locationSchema.required(),
    stocks: Joi.array().items(stockItemSchema).min(1).required(),
    operator: operatorSchema.optional(),
    timestamp: Joi.string().optional()
  }).required(),
  metadata: Joi.object().optional()
});

// ============================================================================
// EXPORT VALIDATION SCHEMAS
// ============================================================================

const validationSchemas = {
  // Invoice events
  'invoice.created': invoiceCreatedSchema,
  'invoice.updated': invoiceUpdatedSchema,
  'invoice.cancelled': invoiceCancelledSchema,
  
  // Payment events
  'payment.created': paymentCreatedSchema,
  'payment.cancelled': paymentCancelledSchema,
  
  // Item events
  'item.created': itemCreatedSchema,
  'item.updated': itemUpdatedSchema,
  'item.archived': itemArchivedSchema,
  
  // Stock events
  'stock.created': stockCreatedSchema,
  'stock.updated': stockUpdatedSchema,
  'stock.incremented': stockIncrementedSchema,
  'stock.transferred': stockTransferredSchema,
  'stock.recalled': stockRecalledSchema,
  'stock.archived': stockArchivedSchema,
  'stock.dispensed': stockDispensedSchema,
  'stock.sold': stockSoldSchema,
  'stock.returned': stockReturnedSchema
};

module.exports = validationSchemas;