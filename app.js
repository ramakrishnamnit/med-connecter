const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Zorg Connect API',
      version: '1.0.0',
      description: 'API documentation for Zorg Connect',
      contact: {
        name: 'API Support',
        email: 'support@zorgconnect.nl'
      }
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production' 
          ? 'https://api.zorgconnect.nl' 
          : 'http://localhost:8080',
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
      }
    ],
    tags: [
      { name: 'Auth', description: 'Authentication and authorization endpoints' },
      { name: 'Users', description: 'User management endpoints' },
      { name: 'Doctors', description: 'Doctor management endpoints' },
      { name: 'Appointments', description: 'Appointment management endpoints' },
      { name: 'Reviews', description: 'Doctor review management endpoints' },
      { name: 'Recommendations', description: 'Doctor recommendation and search endpoints' },
      { name: 'Payments', description: 'Payment processing endpoints' },
      { name: 'Notifications', description: 'Notification management endpoints' },
      { name: 'Admin', description: 'Admin management endpoints' }
    ]
  },
  apis: ['./docs/swagger.js'] // Path to the API docs
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Serve Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Zorg Connect API Documentation'
}));

// ... rest of your app.js code ... 