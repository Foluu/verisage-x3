

const Joi = require('joi');


// Item schema - corrected to match actual payload
const itemSchema = Joi.object({
  basePrice: Joi.number().required(),
  billItemId: Joi.string().required(),
  categories: Joi.array().optional(), // Made optional
  consultant: Joi.object({            // Added consultant object
    id: Joi.string().required(),
    name: Joi.string().required()
  }).optional(),
  date: Joi.string().isoDate().required(),
  dispenseCompleted: Joi.boolean().required(),
  dispenseLog: Joi.array().required(),
  id: Joi.string().required(),
  name: Joi.string().required(),
  operator: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required()
  }).required(),
  posClassifications: Joi.array().required(),
  price: Joi.number().required(),
  quantity: Joi.number().required(),
  returnCompleted: Joi.boolean().required(),
  returnLog: Joi.array().required(),
  source: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required()
  }).optional(),
  total: Joi.number().required(),     // Added required total
  type: Joi.string().required(),  
  variant: Joi.string().optional()    // Made optional
}).unknown(true); // Allow additional fields

// Patient schema
const patientSchema = Joi.object({
  address: Joi.object({
    city: Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required()
    }).required(),
    country: Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required()
    }).required(),
    googleAddress: Joi.string().optional(),
    state: Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required()
    }).required()
  }).required(),
  admission: Joi.object({
    booked: Joi.string().isoDate().required(),
    emergency: Joi.boolean().required(),
    id: Joi.string().required()
  }).required(),
  email: Joi.string().email().optional(),
  gender: Joi.string().required(),
  id: Joi.string().required(),
  mrn: Joi.string().required(),
  name: Joi.string().required(),
  owing: Joi.number().required(),
  phoneNumber: Joi.string().required(),
  sponsors: Joi.array().items(Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required(),
    plan: Joi.string().required(),
    planProviderId: Joi.string().required()
  })).required()
}).required();

// Invoice schema - corrected
const invoiceSchema = Joi.object({
  id: Joi.string().required(),
  items: Joi.array().items(itemSchema).required(),
  operator: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required()
  }).required(),
  patient: patientSchema.required(),
  proforma: Joi.boolean().optional() 
}).required();

// Payment schema
const paymentSchema = Joi.object({
  amount: Joi.number().required(),
  id: Joi.string().required(),
  method: Joi.string().required(),
  operator: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required()
  }).required()
}).required();

// Main event schemas
const eventSchemas = {
  'payment.created': Joi.object({
    data: Joi.object({
      claims: Joi.array().required(),
      id: Joi.string().required(),
      invoice: invoiceSchema,
      payments: Joi.array().items(paymentSchema).required(),
      timestamp: Joi.string().isoDate().required() 
    }).required(),
    event: Joi.string().valid('payment.created').required()
  }).required(),

  'invoice.created': Joi.object({
    data: Joi.object({
      id: Joi.string().required(),
      invoice: invoiceSchema,
      timestamp: Joi.string().isoDate().required() 
    }).required(),
    event: Joi.string().valid('invoice.created').required()
  }).required()
};

module.exports = eventSchemas;
