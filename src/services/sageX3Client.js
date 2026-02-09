const axios = require('axios');
const logger = require('../utils/logger');

class SageX3Client {
  constructor() {
    this.baseUrl = process.env.SAGE_X3_BASE_URL;
    this.clientId = process.env.SAGE_X3_CLIENT_ID;
    this.clientSecret = process.env.SAGE_X3_CLIENT_SECRET;
    this.redirectUri = process.env.SAGE_X3_REDIRECT_URI;
    this.folder = process.env.SAGE_X3_FOLDER;
    this.company = process.env.SAGE_X3_COMPANY;
    
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    // Add request interceptor for authentication
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        await this.ensureValidToken();
        config.headers.Authorization = `Bearer ${this.accessToken}`;
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
    
    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 && !error.config._retry) {
          error.config._retry = true;
          await this.refreshAccessToken();
          return this.axiosInstance(error.config);
        }
        return Promise.reject(error);
      }
    );
  }
  
  /**
   * Initialize OAuth2 authorization (one-time setup)
   * This generates an authorization URL that needs to be visited by a user
   */
  getAuthorizationUrl(state = '1234') {
    const params = new URLSearchParams({
      client_id: this.clientId,
      scope: 'api.dataDelivery',
      customer: this.baseUrl.replace('/v1', ''),
      redirect_uri: this.redirectUri,
      state: state
    });
    
    return `${this.baseUrl}/token/authorise?${params.toString()}`;
  }
  
  /**
   * Exchange authorization code for tokens
   * @param {string} authorizationCode - Code received from authorization callback
   */
  async exchangeCodeForTokens(authorizationCode) {
    try {
      const response = await axios.post(`${this.baseUrl}/token`, {
        code: authorizationCode,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri
      });
      
      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
      
      // Access token expires in 5 minutes
      this.tokenExpiry = Date.now() + (5 * 60 * 1000);
      
      logger.sageX3.info('Successfully exchanged authorization code for tokens');
      
      return {
        accessToken: this.accessToken,
        refreshToken: this.refreshToken
      };
    } catch (error) {
      logger.sageX3.error('Failed to exchange authorization code:', error.response?.data || error.message);
      throw new Error('Failed to obtain access tokens from Sage X3');
    }
  }
  
  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken() {
    try {
      if (!this.refreshToken) {
        throw new Error('No refresh token available');
      }
      
      const response = await axios.post(`${this.baseUrl}/token`, {
        refresh_token: this.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token'
      });
      
      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
      this.tokenExpiry = Date.now() + (5 * 60 * 1000);
      
      logger.sageX3.info('Successfully refreshed access token');
      
      return this.accessToken;
    } catch (error) {
      logger.sageX3.error('Failed to refresh access token:', error.response?.data || error.message);
      throw new Error('Failed to refresh access token');
    }
  }
  
  /**
   * Ensure we have a valid access token
   */
  async ensureValidToken() {
    const bufferTime = 60 * 1000; // 1 minute buffer
    
    if (!this.accessToken || !this.tokenExpiry || Date.now() >= (this.tokenExpiry - bufferTime)) {
      await this.refreshAccessToken();
    }
  }
  
  /**
   * Set tokens manually (useful for loading from storage)
   */
  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.tokenExpiry = Date.now() + (5 * 60 * 1000);
  }
  
  /**
   * Get available folders
   */
  async getFolders() {
    try {
      const response = await this.axiosInstance.get('/folders');
      logger.sageX3.info('Retrieved folders from Sage X3');
      return response.data;
    } catch (error) {
      logger.sageX3.error('Failed to get folders:', error.response?.data || error.message);
      throw error;
    }
  }
  
  /**
   * Post invoice to Sage X3
   * @param {object} invoiceData - Transformed invoice data
   */
  async postInvoice(invoiceData) {
    try {
      const endpoint = `/dataingestion/${this.folder}/invoices`;
      
      logger.sageX3.info('Posting invoice to Sage X3', {
        endpoint,
        invoiceId: invoiceData.invoiceId
      });
      
      const response = await this.axiosInstance.post(endpoint, invoiceData);
      
      logger.sageX3.info('Successfully posted invoice to Sage X3', {
        invoiceId: invoiceData.invoiceId,
        documentReference: response.data.documentReference
      });
      
      return {
        success: true,
        documentReference: response.data.documentReference || response.data.id,
        documentType: 'invoice',
        response: response.data
      };
    } catch (error) {
      logger.sageX3.error('Failed to post invoice:', {
        error: error.response?.data || error.message,
        invoiceId: invoiceData.invoiceId
      });
      throw error;
    }
  }
  
  /**
   * Post payment to Sage X3
   * @param {object} paymentData - Transformed payment data
   */
  async postPayment(paymentData) {
    try {
      const endpoint = `/dataingestion/${this.folder}/payments`;
      
      logger.sageX3.info('Posting payment to Sage X3', {
        endpoint,
        paymentId: paymentData.paymentId
      });
      
      const response = await this.axiosInstance.post(endpoint, paymentData);
      
      logger.sageX3.info('Successfully posted payment to Sage X3', {
        paymentId: paymentData.paymentId,
        documentReference: response.data.documentReference
      });
      
      return {
        success: true,
        documentReference: response.data.documentReference || response.data.id,
        documentType: 'payment',
        response: response.data
      };
    } catch (error) {
      logger.sageX3.error('Failed to post payment:', {
        error: error.response?.data || error.message,
        paymentId: paymentData.paymentId
      });
      throw error;
    }
  }
  
  /**
   * Post stock movement to Sage X3
   * @param {object} stockData - Transformed stock data
   */
  async postStockMovement(stockData) {
    try {
      const endpoint = `/dataingestion/${this.folder}/stock-movements`;
      
      logger.sageX3.info('Posting stock movement to Sage X3', {
        endpoint,
        movementType: stockData.movementType
      });
      
      const response = await this.axiosInstance.post(endpoint, stockData);
      
      logger.sageX3.info('Successfully posted stock movement to Sage X3', {
        documentReference: response.data.documentReference
      });
      
      return {
        success: true,
        documentReference: response.data.documentReference || response.data.id,
        documentType: 'stock_movement',
        response: response.data
      };
    } catch (error) {
      logger.sageX3.error('Failed to post stock movement:', {
        error: error.response?.data || error.message
      });
      throw error;
    }
  }
  
  /**
   * Post credit note (for reversals) to Sage X3
   * @param {object} creditNoteData - Credit note data
   */
  async postCreditNote(creditNoteData) {
    try {
      const endpoint = `/dataingestion/${this.folder}/credit-notes`;
      
      logger.sageX3.info('Posting credit note to Sage X3', {
        endpoint,
        originalReference: creditNoteData.originalReference
      });
      
      const response = await this.axiosInstance.post(endpoint, creditNoteData);
      
      logger.sageX3.info('Successfully posted credit note to Sage X3', {
        documentReference: response.data.documentReference
      });
      
      return {
        success: true,
        documentReference: response.data.documentReference || response.data.id,
        documentType: 'credit_note',
        response: response.data
      };
    } catch (error) {
      logger.sageX3.error('Failed to post credit note:', {
        error: error.response?.data || error.message
      });
      throw error;
    }
  }
  
  /**
   * Get document details from Sage X3
   * @param {string} documentReference - Sage X3 document reference
   */
  async getDocument(documentReference) {
    try {
      const endpoint = `/datadelivery/${this.folder}/documents/${documentReference}`;
      
      const response = await this.axiosInstance.get(endpoint);
      
      logger.sageX3.info('Retrieved document from Sage X3', {
        documentReference
      });
      
      return response.data;
    } catch (error) {
      logger.sageX3.error('Failed to get document:', {
        error: error.response?.data || error.message,
        documentReference
      });
      throw error;
    }
  }
  
  /**
   * Check Sage X3 connection status
   */
  async checkConnection() {
    try {
      await this.getFolders();
      return {
        connected: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Export singleton instance
const sageX3Client = new SageX3Client();
module.exports = sageX3Client;
