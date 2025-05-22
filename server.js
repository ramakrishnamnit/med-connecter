const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const doctorRoutes = require('./routes/doctor.routes');
const appointmentRoutes = require('./routes/appointment.routes');
const paymentRoutes = require('./routes/payment.routes');
const chatRoutes = require('./routes/chat.routes');
const videoRoutes = require('./routes/video.routes');
const notificationRoutes = require('./routes/notification.routes');
const adminRoutes = require('./routes/admin.routes');
const recommendationRoutes = require('./routes/recommendation.routes');
const reviewRoutes = require('./routes/review.routes');

const { verifyToken } = require('./middleware/auth.middleware');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

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
        url: process.env.NODE_ENV === 'production' 
          ? 'https://api.medconnecter.com' 
          : 'http://localhost:8080',
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
      }
    ]
  },
  apis: ['./docs/swagger.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "Med Connecter API Documentation",
}));

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI;

// Mongoose connection options
const mongooseOptions = {
  retryWrites: true,
  w: 'majority',
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  ssl: false,
  authSource: 'admin'
};

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('Successfully connected to MongoDB');
  console.log(`Connected to database`);
})
.catch((err) => {
  console.error('MongoDB connection error:', err);
  if (!process.env.MONGODB_URI) {
    console.error('\nERROR: MONGODB_URI environment variable is not set!');
    console.error('Please create a .env file in the root directory with the following content:');
    console.error('\nFor MongoDB Atlas standard connection (recommended):');
    console.error('MONGODB_URI=mongodb://<username>:<password>@<primary-node>.mongodb.net:27017,<secondary-node-1>.mongodb.net:27017,<secondary-node-2>.mongodb.net:27017/<dbname>');
    console.error('\nFor local MongoDB:');
    console.error('MONGODB_URI=mongodb://localhost:27017/zorgconnect\n');
  }
  process.exit(1);
});

// Socket.io for real-time chat
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('New client connected');
  
  socket.on('register', (userId) => {
    connectedUsers.set(userId, socket.id);
    console.log(`User ${userId} registered`);
  });
  
  socket.on('chat message', ({ to, from, message, appointmentId }) => {
    const receiverSocketId = connectedUsers.get(to);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('chat message', {
        from,
        message,
        appointmentId,
        timestamp: new Date()
      });
    }
    
    // Save message to database
    require('./services/chat.service').saveMessage(appointmentId, from, message);
  });
  
  socket.on('disconnect', () => {
    // Remove user from connected users
    for (let [userId, socketId] of connectedUsers.entries()) {
      if (socketId === socket.id) {
        connectedUsers.delete(userId);
        break;
      }
    }
    console.log('Client disconnected');
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', verifyToken, userRoutes);
app.use('/api/doctors', doctorRoutes); // Some endpoints may not require auth
app.use('/api/appointments', verifyToken, appointmentRoutes);
app.use('/api/payments', verifyToken, paymentRoutes);
app.use('/api/chats', verifyToken, chatRoutes);
app.use('/api/video', verifyToken, videoRoutes);
app.use('/api/notifications', verifyToken, notificationRoutes);
app.use('/api/admin', verifyToken, adminRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/reviews', reviewRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: true,
    message: process.env.NODE_ENV === 'production' ? 'Server error' : err.message
  });
});

// Function to find an available port
const findAvailablePort = (startPort, maxAttempts = 10) => {
  return new Promise((resolve, reject) => {
    let currentPort = startPort;
    let attempts = 0;

    const tryPort = () => {
      const testServer = http.createServer();
      testServer.listen(currentPort, () => {
        testServer.once('close', () => {
          resolve(currentPort);
        });
        testServer.close();
      });

      testServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          attempts++;
          if (attempts >= maxAttempts) {
            reject(new Error('Could not find an available port'));
            return;
          }
          currentPort++;
          tryPort();
        } else {
          reject(err);
        }
      });
    };

    tryPort();
  });
};

// Start the server
const PORT = process.env.PORT || 8080;
findAvailablePort(PORT)
  .then(availablePort => {
    server.listen(availablePort, () => {
      console.log(`Server running on port ${availablePort}`);
    });
  })
  .catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });

module.exports = { app, server, io }; 