const Joi = require('joi');

// Common schemas
const operatorSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required()
});

const patientSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  mrn: Joi.string().required(),
  phoneNumber: Joi.string().allow('', null)
});

const variantSchema = Joi.object({
  id: Joi.string().required(),
  title: Joi.string().required(),
  sku: Joi.string().required()
});

const itemSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  quantity: Joi.number().min(0).required(),
  price: Joi.number().min(0).required(),
  variant: variantSchema.required()
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

// Invoice validation schemas
const invoiceCreatedSchema = Joi.object({
  event: Joi.string().valid('invoice.created').required(),
  data: Joi.object({
    id: Joi.string().required(),
    proforma: Joi.boolean().required(),
    items: Joi.array().items(itemSchema).min(1).required(),
    patient: patientSchema.required(),
    operator: operatorSchema.required()
  }).required(),
  metadata: Joi.object().optional()
});

const invoiceUpdatedSchema = Joi.object({
  event: Joi.string().valid('invoice.updated').required(),
  data: Joi.object({
    id: Joi.string().required(),
    items: Joi.array().items(itemSchema).min(1).required(),
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

// Payment validation schemas
const paymentCreatedSchema = Joi.object({
  event: Joi.string().valid('payment.created').required(),
  data: Joi.object({
    id: Joi.string().required(),
    amount: Joi.number().min(0).required(),
    method: Joi.string().valid('wallet', 'cash', 'pos', 'transfer', 'cheque', 'direct-lodgement').required(),
    paymentReference: Joi.string().allow('', null),
    provider: Joi.string().allow('', null),
    bill: Joi.object({
      id: Joi.string().required(),
      proforma: Joi.boolean().required(),
      items: Joi.array().items(itemSchema).min(1).required(),
      patient: patientSchema.required()
    }).required(),
    operator: operatorSchema.required()
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

// Item validation schemas
const itemCreatedSchema = Joi.object({
  event: Joi.string().valid('item.created').required(),
  data: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required(),
    categories: Joi.array().items(Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required()
    })).min(1).required(),
    type: Joi.string().valid('product', 'service').required(),
    unitOfSale: Joi.string().required(),
    unitOfPurchase: Joi.string().required(),
    attributes: Joi.object().optional(),
    variants: Joi.array().optional(),
    pricing: Joi.array().optional(),
    operator: operatorSchema.required()
  }).required(),
  metadata: Joi.object().optional()
});

const itemUpdatedSchema = Joi.object({
  event: Joi.string().valid('item.updated').required(),
  data: Joi.object({
    id: Joi.string().required(),
    operator: operatorSchema.required()
  }).required(),
  metadata: Joi.object().optional()
});

const itemArchivedSchema = Joi.object({
  event: Joi.string().valid('item.archived').required(),
  data: Joi.object({
    id: Joi.string().required(),
    operator: operatorSchema.required()
  }).required(),
  metadata: Joi.object().optional()
});

// Stock validation schemas
const stockCreatedSchema = Joi.object({
  event: Joi.string().valid('stock.created').required(),
  data: Joi.object({
    id: Joi.string().required(),
    batchId: Joi.string().required(),
    barcode: Joi.string().allow('', null),
    upc: Joi.string().allow('', null),
    code: Joi.string().required(),
    expiryDate: Joi.date().allow(null),
    quantity: Joi.number().min(0).required(),
    variant: variantSchema.required(),
    costPrice: Joi.number().min(0).required(),
    item: Joi.string().required(),
    supplier: Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required()
    }).required(),
    operator: operatorSchema.required()
  }).required(),
  metadata: Joi.object().optional()
});

const stockUpdatedSchema = Joi.object({
  event: Joi.string().valid('stock.updated').required(),
  data: Joi.object({
    id: Joi.string().required(),
    batchId: Joi.string().required(),
    barcode: Joi.string().allow('', null),
    upc: Joi.string().allow('', null),
    expiryDate: Joi.date().allow(null),
    variant: variantSchema.required(),
    costPrice: Joi.number().min(0).required(),
    supplier: Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required()
    }).required(),
    operator: operatorSchema.required()
  }).required(),
  metadata: Joi.object().optional()
});

const stockIncrementedSchema = Joi.object({
  event: Joi.string().valid('stock.incremented').required(),
  data: Joi.object({
    id: Joi.string().required(),
    quantity: Joi.number().min(0).required(),
    operator: operatorSchema.required()
  }).required(),
  metadata: Joi.object().optional()
});

const stockTransferredSchema = Joi.object({
  event: Joi.string().valid('stock.transferred').required(),
  data: Joi.object({
    from: locationSchema.required(),
    to: locationSchema.required(),
    comment: Joi.string().allow('', null),
    stocks: Joi.array().items(stockItemSchema).min(1).required(),
    operator: operatorSchema.required()
  }).required(),
  metadata: Joi.object().optional()
});

const stockRecalledSchema = Joi.object({
  event: Joi.string().valid('stock.recalled').required(),
  data: Joi.object({
    id: Joi.string().required(),
    from: locationSchema.required(),
    to: locationSchema.required(),
    stocks: Joi.array().items(stockItemSchema).min(1).required(),
    operator: operatorSchema.required()
  }).required(),
  metadata: Joi.object().optional()
});

const stockArchivedSchema = Joi.object({
  event: Joi.string().valid('stock.archived').required(),
  data: Joi.object({
    id: Joi.string().required(),
    reason: Joi.string().required(),
    quantity: Joi.number().min(0).required(),
    operator: operatorSchema.required(),
    from: locationSchema.required()
  }).required(),
  metadata: Joi.object().optional()
});

const stockDispensedSchema = Joi.object({
  event: Joi.string().valid('stock.dispensed').required(),
  data: Joi.object({
    id: Joi.string().required(),
    to: Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required(),
      type: Joi.string().required(),
      mrn: Joi.string().allow('', null)
    }).required(),
    purpose: Joi.string().valid('consumables', 'sale').required(),
    bill: Joi.string().allow('', null),
    stocks: Joi.array().items(stockItemSchema).min(1).required(),
    operator: operatorSchema.required(),
    from: locationSchema.required()
  }).required(),
  metadata: Joi.object().optional()
});

const stockSoldSchema = Joi.object({
  event: Joi.string().valid('stock.sold').required(),
  data: Joi.object({
    id: Joi.string().required(),
    stocks: Joi.array().items(stockItemSchema).min(1).required(),
    bill: Joi.string().required(),
    operator: operatorSchema.required(),
    from: locationSchema.required()
  }).required(),
  metadata: Joi.object().optional()
});

const stockReturnedSchema = Joi.object({
  event: Joi.string().valid('stock.returned').required(),
  data: Joi.object({
    id: Joi.string().required(),
    reason: Joi.string().required(),
    stocks: Joi.array().items(stockItemSchema).min(1).required(),
    from: locationSchema.required(),
    to: locationSchema.required(),
    operator: operatorSchema.required()
  }).required(),
  metadata: Joi.object().optional()
});

// Export validation schemas mapped by event type
const validationSchemas = {
  'invoice.created': invoiceCreatedSchema,
  'invoice.updated': invoiceUpdatedSchema,
  'invoice.cancelled': invoiceCancelledSchema,
  'payment.created': paymentCreatedSchema,
  'payment.cancelled': paymentCancelledSchema,
  'item.created': itemCreatedSchema,
  'item.updated': itemUpdatedSchema,
  'item.archived': itemArchivedSchema,
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
