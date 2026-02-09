const winston = require('winston');
const path = require('path');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let metaString = '';
        if (Object.keys(meta).length > 0) {
          metaString = '\n' + JSON.stringify(meta, null, 2);
        }
        return `${timestamp} [${level}]: ${message}${metaString}`;
      })
    )
  })
];

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  const logDir = process.env.LOG_FILE_PATH || './logs';
  
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: logFormat
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: logFormat
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports,
  exitOnError: false
});

// Create specialized loggers for different components
logger.webhook = logger.child({ component: 'webhook' });
logger.sageX3 = logger.child({ component: 'sage-x3' });
logger.transformation = logger.child({ component: 'transformation' });
logger.queue = logger.child({ component: 'queue' });
logger.audit = logger.child({ component: 'audit' });

module.exports = logger;
