
const logger = require('../utils/logger');

class TransformationService {
  constructor() {
    this.currencyDivisor = parseInt(process.env.SAGE_CURRENCY_DIVISOR || '100');
  }
  
  convertCurrency(amount) {
    return amount / this.currencyDivisor;
  }
  
  transformInvoiceCreated(payload) {
    const { data } = payload;
    const lineItems = data.items.map((item, index) => ({
      lineNumber: index + 1,
      itemCode: item.variant?.sku || item.id,
      itemDescription: item.name,
      quantity: item.quantity,
      unitPrice: this.convertCurrency(item.price),
      lineTotal: this.convertCurrency(item.total || (item.price * item.quantity)),
      itemId: item.id,
      itemType: item.type || 'unknown',
      ...(item.variant && {
        variantId: item.variant.id,
        variantTitle: item.variant.title,
        variantSku: item.variant.sku
      }),
      ...(item.consultant && {
        consultantId: item.consultant.id,
        consultantName: item.consultant.name
      })
    }));
    
    const totalAmount = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    
    return {
      documentType: 'SI',
      invoiceId: data.id,
      invoiceNumber: data.id,
      isProforma: data.proforma || false,
      invoiceDate: data.timestamp || new Date().toISOString(),
      customerReference: data.patient.mrn,
      customerName: data.patient.name,
      customerId: data.patient.id,
      customerPhone: data.patient.phoneNumber || '',
      customerEmail: data.patient.email || '',
      lineItems,
      subtotal: totalAmount,
      taxAmount: 0,
      totalAmount,
      currency: 'NGN',
      operator: data.operator,
      metadata: payload.metadata || {}
    };
  }
  
  transformInvoiceUpdated(payload) {
    return this.transformInvoiceCreated({
      event: 'invoice.created',
      data: { ...payload.data, proforma: true },
      metadata: payload.metadata
    });
  }
  
  transformInvoiceCancelled(payload) {
    return {
      documentType: 'CN',
      originalInvoiceId: payload.data.id,
      cancellationReason: payload.data.reason,
      cancellationDate: payload.data.timestamp || new Date().toISOString(),
      operator: payload.data.operator,
      metadata: payload.metadata || {}
    };
  }
  
  // CORRECTED: Payment transformation for actual payload structure
  transformPaymentCreated(payload) {
    const { data } = payload;
    
    // Items, patient, operator are directly in data (NOT in invoice object)
    const lineItems = data.items.map((item, index) => ({
      lineNumber: index + 1,
      itemCode: item.variant?.sku || item.id,
      itemDescription: item.name,
      quantity: item.quantity,
      unitPrice: this.convertCurrency(item.price),
      lineTotal: this.convertCurrency(item.total || (item.price * item.quantity)),
      itemId: item.id,
      itemType: item.type || 'unknown'
    }));
    
    const primaryPayment = data.payments[0];
    const totalPaid = data.payments.reduce((sum, p) => sum + p.amount, 0);
    
    return {
      documentType: 'PAY',
      paymentId: data.id,
      paymentDate: data.timestamp || new Date().toISOString(),
      amount: this.convertCurrency(totalPaid),
      currency: 'NGN',
      paymentMethod: this.mapPaymentMethod(primaryPayment.method),
      paymentReference: primaryPayment.paymentReference || '',
      provider: primaryPayment.provider || '',
      
      // Customer details from data.patient (not data.invoice.patient)
      customerReference: data.patient.mrn,
      customerName: data.patient.name,
      customerId: data.patient.id,
      customerEmail: data.patient.email || '',
      customerPhone: data.patient.phoneNumber || '',
      
      lineItems,
      
      allPayments: data.payments.map(p => ({
        id: p.id,
        amount: this.convertCurrency(p.amount),
        method: this.mapPaymentMethod(p.method),
        reference: p.paymentReference || '',
        operator: p.operator || data.operator
      })),
      
      operator: primaryPayment.operator || data.operator,
      metadata: { 
        ...payload.metadata, 
        claims: data.claims || [], 
        timestamp: data.timestamp 
      }
    };
  }
  
  mapPaymentMethod(hmsMethod) {
    const map = {
      'wallet': 'WALLET', 'cash': 'CASH', 'pos': 'CARD',
      'transfer': 'BANK_TRANSFER', 'cheque': 'CHEQUE',
      'direct-lodgement': 'DIRECT_DEPOSIT'
    };
    return map[hmsMethod] || 'OTHER';
  }
  
  transformPaymentCancelled(payload) {
    return {
      documentType: 'PAY_REV',
      originalPaymentId: payload.data.id,
      cancellationReason: payload.data.reason,
      cancellationDate: payload.data.timestamp || new Date().toISOString(),
      operator: payload.data.operator,
      metadata: payload.metadata || {}
    };
  }
  
  transformItemCreated(payload) {
    const { data } = payload;
    return {
      documentType: 'ITEM',
      itemId: data.id,
      itemName: data.name,
      itemType: data.type === 'product' ? 'STOCK' : 'SERVICE',
      categories: (data.categories || []).map(cat => ({ id: cat.id, name: cat.name })),
      unitOfSale: data.unitOfSale || '',
      unitOfPurchase: data.unitOfPurchase || '',
      attributes: data.attributes || {},
      createdDate: data.timestamp || new Date().toISOString(),
      operator: data.operator || { id: 'system', name: 'System' },
      metadata: payload.metadata || {}
    };
  }
  
  transformStockCreated(payload) {
    const { data } = payload;
    return {
      documentType: 'STK_IN',
      stockId: data.id,
      batchId: data.batchId,
      stockCode: data.code,
      itemId: data.item.id,
      itemName: data.item.name,
      quantity: data.quantity,
      costPrice: this.convertCurrency(data.costPrice),
      totalValue: this.convertCurrency(data.costPrice * data.quantity),
      expiryDate: data.expiryDate,
      supplierId: data.supplier.id,
      supplierName: data.supplier.name,
      ...(data.variant && {
        variantId: data.variant.id,
        variantTitle: data.variant.title,
        variantSku: data.variant.sku
      }),
      receiptDate: data.timestamp || new Date().toISOString(),
      operator: data.operator || { id: 'system', name: 'System' },
      metadata: { ...payload.metadata, timestamp: data.timestamp }
    };
  }
  
  transformStockTransferred(payload) {
    return {
      documentType: 'STK_TRF',
      fromLocation: payload.data.from,
      toLocation: payload.data.to,
      comment: payload.data.comment || '',
      transferDate: payload.data.timestamp || new Date().toISOString(),
      items: payload.data.stocks.map(s => ({ stockCode: s.code, batchId: s.batchId, quantity: s.quantity })),
      operator: payload.data.operator || { id: 'system', name: 'System' },
      metadata: payload.metadata || {}
    };
  }
  
  transformStockSold(payload) {
    return {
      documentType: 'STK_OUT',
      issueType: 'SALE',
      issueId: payload.data.id,
      billId: payload.data.bill,
      fromLocation: payload.data.from,
      issueDate: payload.data.timestamp || new Date().toISOString(),
      items: payload.data.stocks.map(s => ({ stockCode: s.code, batchId: s.batchId, quantity: s.quantity })),
      operator: payload.data.operator || { id: 'system', name: 'System' },
      metadata: payload.metadata || {}
    };
  }
  
  transformStockDispensed(payload) {
    return {
      documentType: 'STK_OUT',
      issueType: payload.data.purpose?.toUpperCase() || 'DISPENSED',
      issueId: payload.data.id,
      billId: payload.data.bill || '',
      toRecipient: { ...payload.data.to, mrn: payload.data.to.mrn || '' },
      fromLocation: payload.data.from,
      issueDate: payload.data.timestamp || new Date().toISOString(),
      items: payload.data.stocks.map(s => ({ stockCode: s.code, batchId: s.batchId, quantity: s.quantity })),
      operator: payload.data.operator || { id: 'system', name: 'System' },
      metadata: payload.metadata || {}
    };
  }
  
  transformStockReturned(payload) {
    return {
      documentType: 'STK_RET',
      returnId: payload.data.id,
      reason: payload.data.reason,
      fromLocation: payload.data.from,
      toLocation: payload.data.to,
      returnDate: payload.data.timestamp || new Date().toISOString(),
      items: payload.data.stocks.map(s => ({ stockCode: s.code, batchId: s.batchId, quantity: s.quantity })),
      operator: payload.data.operator || { id: 'system', name: 'System' },
      metadata: payload.metadata || {}
    };
  }
  
  transform(eventType, payload) {
    logger.transformation.info(`Transforming event: ${eventType}`);
    
    try {
      const transformers = {
        'invoice.created': this.transformInvoiceCreated,
        'invoice.updated': this.transformInvoiceUpdated,
        'invoice.cancelled': this.transformInvoiceCancelled,
        'payment.created': this.transformPaymentCreated,
        'payment.cancelled': this.transformPaymentCancelled,
        'item.created': this.transformItemCreated,
        'stock.created': this.transformStockCreated,
        'stock.transferred': this.transformStockTransferred,
        'stock.sold': this.transformStockSold,
        'stock.dispensed': this.transformStockDispensed,
        'stock.returned': this.transformStockReturned
      };
      
      const transformer = transformers[eventType];
      if (!transformer) {
        throw new Error(`Unsupported event type: ${eventType}`);
      }
      
      const transformed = transformer.call(this, payload);
      logger.transformation.info(`Successfully transformed event: ${eventType}`);
      return transformed;
      
    } catch (error) {
      logger.transformation.error(`Transformation failed for ${eventType}:`, error);
      throw error;
    }
  }
}

module.exports = new TransformationService();