require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoose = require('mongoose');
const logger = require('./utils/logger');
const webhookRoutes = require('./routes/webhook.routes');
const adminRoutes = require('./routes/admin.routes');
const eventRoutes = require('./routes/event.routes');
const transactionRoutes = require('./routes/transaction.routes');
const errorHandler = require('./middleware/errorHandler');
const { initializeQueues } = require('./queues/queueManager');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  credentials: true
}));

// ============================================================================
// Body parsing middleware order
// ============================================================================

// 1. Raw body parser for webhook signature verification
app.use('/api/v1/webhooks', express.raw({ type: 'application/json' }));

// 2. JSON body parser for other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.API_VERSION || 'v1'
  });
});

// API routes 
app.use('/api/v1/webhooks', webhookRoutes); 
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/events', eventRoutes);
app.use('/api/v1/transactions', transactionRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use(errorHandler);

// MongoDB connection
console.log('Connecting to MongoDB...');
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log('✅ Connected to MongoDB successfully');
    logger.info('Connected to MongoDB');
    
    // Initialize Bull queues after DB connection
    initializeQueues()
      .then(() => {
        console.log('✅ Job queues initialized');
        logger.info('Job queues initialized');
      })
      .catch(err => {
        console.error('❌ Failed to initialize queues:', err);
        logger.error('Failed to initialize queues:', err);
      });
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    logger.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  console.log('Received shutdown signal, closing server gracefully...');
  logger.info('Received shutdown signal, closing server gracefully...');
  
  mongoose.connection.close(false)
    .then(() => {
      console.log('MongoDB connection closed');
      logger.info('MongoDB connection closed');
      process.exit(0);
    })
    .catch(err => {
      console.error('Error during shutdown:', err);
      logger.error('Error during shutdown:', err);
      process.exit(1);
    });
}

// Start server
app.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  VERISAGE X3 SERVER STARTED`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Port: ${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Webhook endpoint: http://localhost:${PORT}/api/v1/webhooks/indigo`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info(`VeriSage X3 server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});



module.exports = app;