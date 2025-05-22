// Commented out AWS SDK imports for now
// const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
// const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
// const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
// const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { v4: uuidv4 } = require('uuid');

// Mock AWS configuration
const awsConfig = {
  region: process.env.AWS_REGION || 'mock-region',
  credentials: {
    accessKeyId: 'mock-key',
    secretAccessKey: 'mock-secret'
  }
};

// Initialize mock clients
const mockResponse = async () => ({ 
  success: true, 
  message: 'Mock AWS service response',
  id: uuidv4()
});

/**
 * Upload a file to S3 (mock implementation)
 * @param {Buffer} fileBuffer - File buffer to upload
 * @param {string} key - S3 object key
 * @param {string} contentType - File content type
 * @returns {Promise<Object>} - Mock S3 response
 */
const uploadToS3 = async (fileBuffer, key, contentType) => {
  console.log('Mock S3 upload:', { key, contentType });
  return mockResponse();
};

/**
 * Send an email using AWS SES (mock implementation)
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} htmlBody - HTML content of the email
 * @param {string} textBody - Plain text content of the email
 * @returns {Promise<Object>} - Mock SES response
 */
const sendEmail = async (to, subject, htmlBody, textBody) => {
  console.log('Mock email sent:', { to, subject });
  return mockResponse();
};

/**
 * Send an SMS using AWS SNS (mock implementation)
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} message - SMS message content
 * @returns {Promise<Object>} - Mock SNS response
 */
const sendSMS = async (phoneNumber, message) => {
  console.log('Mock SMS sent:', { phoneNumber });
  return mockResponse();
};

/**
 * Queue a job for asynchronous processing (mock implementation)
 * @param {string} queueUrl - SQS queue URL
 * @param {object} payload - Job payload
 * @returns {Promise<object>} - Mock SQS response
 */
const queueJob = async (queueUrl, payload) => {
  console.log('Mock job queued:', { queueUrl, payload });
  return mockResponse();
};

// Export mock services
module.exports = {
  uploadToS3,
  sendEmail,
  sendSMS,
  queueJob,
  // Export mock clients for compatibility
  s3Client: { send: mockResponse },
  sesClient: { send: mockResponse },
  snsClient: { send: mockResponse },
  sqsClient: { send: mockResponse }
};
