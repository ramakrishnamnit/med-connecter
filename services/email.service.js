const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const sns = new AWS.SNS();

/**
 * Send verification email to user
 * @param {string} email - User's email address
 * @param {string} token - Verification token
 */
const sendVerificationEmail = async (email, token) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  
  const message = `
    Welcome to Zorg Connect!
    
    Please click the link below to verify your email address:
    ${verificationUrl}
    
    If you did not create an account, please ignore this email.
  `;

  const params = {
    Protocol: 'email',
    TopicArn: process.env.AWS_SNS_TOPIC_ARN,
    Endpoint: email,
    Message: message,
    Subject: 'Verify your email address',
    MessageAttributes: {
      'emailType': {
        DataType: 'String',
        StringValue: 'verification'
      }
    }
  };

  try {
    await sns.publish(params).promise();
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw new Error('Failed to send verification email');
  }
};

/**
 * Send password reset email to user
 * @param {string} email - User's email address
 * @param {string} token - Password reset token
 */
const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  
  const message = `
    Password Reset Request
    
    You requested to reset your password. Click the link below to proceed:
    ${resetUrl}
    
    If you did not request a password reset, please ignore this email.
    This link will expire in 1 hour.
  `;

  const params = {
    Protocol: 'email',
    TopicArn: process.env.AWS_SNS_TOPIC_ARN,
    Endpoint: email,
    Message: message,
    Subject: 'Reset your password',
    MessageAttributes: {
      'emailType': {
        DataType: 'String',
        StringValue: 'password_reset'
      }
    }
  };

  try {
    await sns.publish(params).promise();
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
}; 