

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

// Raw body parser for webhook signature verification
app.use('/api/v1/webhooks', express.raw({ type: 'application/json' }));

// JSON body parser for other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
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
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    logger.info('Connected to MongoDB');
    
    // Initialize Bull queues after DB connection
    initializeQueues()
      .then(() => {
        logger.info('Job queues initialized');
      })
      .catch(err => {
        logger.error('Failed to initialize queues:', err);
      });
  })
  .catch(err => {
    logger.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  logger.info('Received shutdown signal, closing server gracefully...');
  
  mongoose.connection.close(false)
    .then(() => {
      logger.info('MongoDB connection closed');
      process.exit(0);
    })
    .catch(err => {
      logger.error('Error during shutdown:', err);
      process.exit(1);
    });
}

// Start server
app.listen(PORT, () => {
  logger.info(`VeriSage X3 server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});

module.exports = app;
