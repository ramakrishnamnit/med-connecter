require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const config = require('config');

const logger = require('./utils/logger');
const { errorHandler } = require('./utils/error.handler');
const versionMiddleware = require('./middleware/version.middleware');
const sessionMiddleware = require('./middleware/session.middleware');

// Debug environment variables
logger.info('Environment variables:', {
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
  MONGODB_URI: process.env.MONGODB_URI ? '***' : undefined,
  CONFIG_PORT: config.get('port')
});

// Import routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const doctorRoutes = require('./routes/doctor.routes');
const appointmentRoutes = require('./routes/appointment.routes');
const reviewRoutes = require('./routes/review.routes');
const notificationRoutes = require('./routes/notification.routes');
const paymentRoutes = require('./routes/payment.routes');
const chatRoutes = require('./routes/chat.routes');
const videoRoutes = require('./routes/video.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

// Debug middleware to log all requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

// Connect to MongoDB
const connectDB = async () => {
  try {
    // Log the masked connection string for debugging
    const maskedUri = process.env.MONGODB_URI.replace(/(mongodb(\+srv)?:\/\/[^:]+:)([^@]+)(@.*)/, '$1****$4');
    logger.info('Attempting to connect to MongoDB:', { uri: maskedUri });

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000, // Increased timeout
      socketTimeoutMS: 45000,
      family: 4,  // Force IPv4
      retryWrites: true,
      w: 'majority'
    });
    logger.info('Connected to MongoDB');
  } catch (err) {
    logger.error('MongoDB connection error:', err);
    // Log more details about the error
    if (err.name === 'MongoServerSelectionError') {
      logger.error('Server selection error details:', {
        message: err.message,
        reason: err.reason,
        topology: err.topology?.description
      });
    }
  }
};

// Call the connection function
connectDB();

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Disable Helmet for development
if (process.env.NODE_ENV === 'production') {
  app.use(helmet());
} else {
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false
  }));
}

app.use(compression());

// CORS configuration
const corsOptions = {
  origin: ['http://localhost:8085', 'http://127.0.0.1:8085'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'x-session-id'],
  credentials: true,
  maxAge: 86400 // 24 hours
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Med Connecter API',
      version: '1.0.0',
      description: 'API documentation for Med Connecter',
      contact: {
        name: 'API Support',
        email: 'support@medconnecter.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:8085',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token in the format: Bearer <token>'
        },
        sessionId: {
          type: 'apiKey',
          in: 'header',
          name: 'x-session-id',
          description: 'Enter your session ID'
        }
      }
    },
    security: [
      {
        bearerAuth: [],
        sessionId: []
      }
    ]
  },
  apis: ['./routes/*.js'] // Path to the API docs
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Add custom operation filter to ensure both headers are included
Object.keys(swaggerSpec.paths).forEach(path => {
  Object.keys(swaggerSpec.paths[path]).forEach(method => {
    const operation = swaggerSpec.paths[path][method];
    operation.security = [{
      bearerAuth: [],
      sessionId: []
    }];
  });
});

// Swagger documentation with custom options
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "Med Connecter API Documentation",
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: true
  }
}));

// Add endpoint to get Swagger JSON
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug middleware to log API routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    logger.info(`API Request: ${req.method} ${req.path}`);
  }
  next();
});

// API routes with version middleware
app.use('/api/v1', versionMiddleware);

// Apply session middleware to all API routes
app.use('/api/v1', sessionMiddleware);

// Mount routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/doctors', doctorRoutes);
app.use('/api/v1/appointments', appointmentRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/video', videoRoutes);
app.use('/api/v1/admin', adminRoutes);

// Error handling middleware
app.use(errorHandler);

// Handle 404 errors
app.use((req, res, next) => {
  logger.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    status: 'error',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Start server
const PORT = process.env.PORT || 8085;
logger.info(`Attempting to start server on port ${PORT}`);
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Rejection:', error);
  process.exit(1);
});

module.exports = app; 