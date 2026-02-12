const logger = require('../utils/logger');

class TransformationService {
  constructor() {
    // Currency conversion: kobo to naira (divide by 100)
    this.currencyDivisor = parseInt(process.env.SAGE_CURRENCY_DIVISOR || '100');
  }
  
  /**
   * Convert subunits to base currency
   * @param {number} amount - Amount in subunits (kobo)
   * @returns {number} - Amount in base currency (naira)
   */
  convertCurrency(amount) {
    return amount / this.currencyDivisor;
  }
  
  /**
   * Transform invoice.created event
   */
  transformInvoiceCreated(payload) {
    const { data } = payload;
    
    const lineItems = data.items.map((item, index) => ({
      lineNumber: index + 1,
      itemCode: item.id, // Use item ID since no SKU/variant in actual payload
      itemDescription: item.name,
      quantity: item.quantity,
      unitPrice: this.convertCurrency(item.price),
      lineTotal: this.convertCurrency(item.total || (item.price * item.quantity)),
      itemId: item.id,
      type: item.type || 'unknown'
    }));
    
    const totalAmount = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    
    return {
      documentType: 'SI', // Sales Invoice
      invoiceId: data.id,
      invoiceNumber: data.id,
      isProforma: data.proforma,
      invoiceDate: new Date().toISOString(),
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
      operator: {
        id: data.operator.id,
        name: data.operator.name
      },
      metadata: payload.metadata || {}
    };
  }
  
  /**
   * Transform invoice.updated event (proforma only)
   */
  transformInvoiceUpdated(payload) {
    return this.transformInvoiceCreated({
      event: 'invoice.created',
      data: {
        ...payload.data,
        proforma: true
      },
      metadata: payload.metadata
    });
  }
  
  /**
   * Transform invoice.cancelled event
   */
  transformInvoiceCancelled(payload) {
    const { data } = payload;
    
    return {
      documentType: 'CN', // Credit Note
      originalInvoiceId: data.id,
      cancellationReason: data.reason,
      cancellationDate: new Date().toISOString(),
      operator: {
        id: data.operator.id,
        name: data.operator.name
      },
      metadata: payload.metadata || {}
    };
  }
  
  /**
   * Transform payment.created event - UPDATED FOR ACTUAL PAYLOAD
   */
  transformPaymentCreated(payload) {
    const { data } = payload;
    
    // Transform invoice items
    const lineItems = data.invoice.items.map((item, index) => ({
      lineNumber: index + 1,
      itemCode: item.id,
      itemDescription: item.name,
      quantity: item.quantity,
      unitPrice: this.convertCurrency(item.price),
      lineTotal: this.convertCurrency(item.total || (item.price * item.quantity)),
      itemId: item.id,
      type: item.type || 'unknown'
    }));
    
    // Get primary payment (first payment in array)
    const primaryPayment = data.payments[0];
    
    // Calculate total from all payments
    const totalPaid = data.payments.reduce((sum, p) => sum + p.amount, 0);
    
    return {
      documentType: 'PAY', // Payment
      paymentId: data.id,
      paymentDate: data.timestamp || new Date().toISOString(),
      amount: this.convertCurrency(totalPaid),
      currency: 'NGN',
      
      // Primary payment details
      paymentMethod: this.mapPaymentMethod(primaryPayment.method),
      paymentReference: primaryPayment.paymentReference || '',
      provider: primaryPayment.provider || '',
      
      // Invoice details (using 'invoice' not 'bill')
      billId: data.invoice.id,
      isProforma: data.invoice.proforma,
      
      // Customer details
      customerReference: data.invoice.patient.mrn,
      customerName: data.invoice.patient.name,
      customerId: data.invoice.patient.id,
      customerEmail: data.invoice.patient.email || '',
      customerPhone: data.invoice.patient.phoneNumber || '',
      
      // Line items
      lineItems,
      
      // All payments (for reference)
      allPayments: data.payments.map(p => ({
        id: p.id,
        amount: this.convertCurrency(p.amount),
        method: this.mapPaymentMethod(p.method),
        reference: p.paymentReference || '',
        operator: p.operator || data.invoice.operator
      })),
      
      // Operator
      operator: primaryPayment.operator || data.invoice.operator,
      
      metadata: {
        ...payload.metadata,
        claims: data.claims || [],
        timestamp: data.timestamp
      }
    };
  }
  
  /**
   * Map HMS payment method to Sage X3 payment method
   */
  mapPaymentMethod(hmsMethod) {
    const methodMap = {
      'wallet': 'WALLET',
      'cash': 'CASH',
      'pos': 'CARD',
      'transfer': 'BANK_TRANSFER',
      'cheque': 'CHEQUE',
      'direct-lodgement': 'DIRECT_DEPOSIT'
    };
    
    return methodMap[hmsMethod] || 'OTHER';
  }
  
  /**
   * Transform payment.cancelled event
   */
  transformPaymentCancelled(payload) {
    const { data } = payload;
    
    return {
      documentType: 'PAY_REV', // Payment Reversal
      originalPaymentId: data.id,
      cancellationReason: data.reason,
      cancellationDate: new Date().toISOString(),
      operator: {
        id: data.operator.id,
        name: data.operator.name
      },
      metadata: payload.metadata || {}
    };
  }
  
  /**
   * Transform item.created event
   */
  transformItemCreated(payload) {
    const { data } = payload;
    
    return {
      documentType: 'ITEM', // Item Master
      itemId: data.id,
      itemName: data.name,
      itemType: data.type === 'product' ? 'STOCK' : 'SERVICE',
      categories: (data.categories || []).map(cat => ({
        id: cat.id,
        name: cat.name
      })),
      unitOfSale: data.unitOfSale || '',
      unitOfPurchase: data.unitOfPurchase || '',
      attributes: data.attributes || {},
      createdDate: new Date().toISOString(),
      operator: data.operator || { id: 'system', name: 'System' },
      metadata: payload.metadata || {}
    };
  }
  
  /**
   * Transform stock.created event - UPDATED FOR ACTUAL PAYLOAD
   */
  transformStockCreated(payload) {
    const { data } = payload;
    
    return {
      documentType: 'STK_IN', // Stock Receipt
      stockId: data.id,
      batchId: data.batchId,
      stockCode: data.code,
      
      // Item details from nested object
      itemId: data.item.id,
      itemName: data.item.name,
      
      quantity: data.quantity,
      costPrice: this.convertCurrency(data.costPrice),
      totalValue: this.convertCurrency(data.costPrice * data.quantity),
      expiryDate: data.expiryDate,
      
      // Supplier details
      supplierId: data.supplier.id,
      supplierName: data.supplier.name,
      
      receiptDate: data.timestamp || new Date().toISOString(),
      operator: data.operator || { id: 'system', name: 'System' },
      
      metadata: {
        ...payload.metadata,
        timestamp: data.timestamp
      }
    };
  }
  
  /**
   * Transform stock.transferred event
   */
  transformStockTransferred(payload) {
    const { data } = payload;
    
    return {
      documentType: 'STK_TRF', // Stock Transfer
      fromLocation: {
        id: data.from.id,
        name: data.from.name
      },
      toLocation: {
        id: data.to.id,
        name: data.to.name
      },
      comment: data.comment || '',
      transferDate: data.timestamp || new Date().toISOString(),
      items: data.stocks.map(stock => ({
        stockCode: stock.code,
        batchId: stock.batchId,
        quantity: stock.quantity
      })),
      operator: data.operator || { id: 'system', name: 'System' },
      metadata: payload.metadata || {}
    };
  }
  
  /**
   * Transform stock.sold event
   */
  transformStockSold(payload) {
    const { data } = payload;
    
    return {
      documentType: 'STK_OUT', // Stock Issue/Sale
      issueType: 'SALE',
      issueId: data.id,
      billId: data.bill,
      fromLocation: {
        id: data.from.id,
        name: data.from.name
      },
      issueDate: data.timestamp || new Date().toISOString(),
      items: data.stocks.map(stock => ({
        stockCode: stock.code,
        batchId: stock.batchId,
        quantity: stock.quantity
      })),
      operator: data.operator || { id: 'system', name: 'System' },
      metadata: payload.metadata || {}
    };
  }
  
  /**
   * Transform stock.dispensed event
   */
  transformStockDispensed(payload) {
    const { data } = payload;
    
    return {
      documentType: 'STK_OUT', // Stock Issue
      issueType: data.purpose ? data.purpose.toUpperCase() : 'DISPENSED',
      issueId: data.id,
      billId: data.bill || '',
      toRecipient: {
        id: data.to.id,
        name: data.to.name,
        type: data.to.type,
        mrn: data.to.mrn || ''
      },
      fromLocation: {
        id: data.from.id,
        name: data.from.name
      },
      issueDate: data.timestamp || new Date().toISOString(),
      items: data.stocks.map(stock => ({
        stockCode: stock.code,
        batchId: stock.batchId,
        quantity: stock.quantity
      })),
      operator: data.operator || { id: 'system', name: 'System' },
      metadata: payload.metadata || {}
    };
  }
  
  /**
   * Transform stock.returned event
   */
  transformStockReturned(payload) {
    const { data } = payload;
    
    return {
      documentType: 'STK_RET', // Stock Return
      returnId: data.id,
      reason: data.reason,
      fromLocation: {
        id: data.from.id,
        name: data.from.name
      },
      toLocation: {
        id: data.to.id,
        name: data.to.name
      },
      returnDate: data.timestamp || new Date().toISOString(),
      items: data.stocks.map(stock => ({
        stockCode: stock.code,
        batchId: stock.batchId,
        quantity: stock.quantity
      })),
      operator: data.operator || { id: 'system', name: 'System' },
      metadata: payload.metadata || {}
    };
  }
  
  /**
   * Main transform method - routes to appropriate transformer
   */
  transform(eventType, payload) {
    logger.transformation.info(`Transforming event: ${eventType}`);
    
    try {
      let transformed;
      
      switch (eventType) {
        case 'invoice.created':
          transformed = this.transformInvoiceCreated(payload);
          break;
        case 'invoice.updated':
          transformed = this.transformInvoiceUpdated(payload);
          break;
        case 'invoice.cancelled':
          transformed = this.transformInvoiceCancelled(payload);
          break;
        case 'payment.created':
          transformed = this.transformPaymentCreated(payload);
          break;
        case 'payment.cancelled':
          transformed = this.transformPaymentCancelled(payload);
          break;
        case 'item.created':
          transformed = this.transformItemCreated(payload);
          break;
        case 'stock.created':
          transformed = this.transformStockCreated(payload);
          break;
        case 'stock.transferred':
          transformed = this.transformStockTransferred(payload);
          break;
        case 'stock.sold':
          transformed = this.transformStockSold(payload);
          break;
        case 'stock.dispensed':
          transformed = this.transformStockDispensed(payload);
          break;
        case 'stock.returned':
          transformed = this.transformStockReturned(payload);
          break;
        default:
          throw new Error(`Unsupported event type: ${eventType}`);
      }
      
      logger.transformation.info(`Successfully transformed event: ${eventType}`);
      return transformed;
      
    } catch (error) {
      logger.transformation.error(`Transformation failed for ${eventType}:`, error);
      throw error;
    }
  }
}

module.exports = new TransformationService();