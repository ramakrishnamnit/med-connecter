const jwt = require('jsonwebtoken');

/**
 * Generate email verification token
 * @param {string} userId - User ID
 * @returns {string} JWT token
 */
const generateVerificationToken = (userId) => {
  return jwt.sign(
    { userId, type: 'verification' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

/**
 * Generate password reset token
 * @param {string} userId - User ID
 * @returns {string} JWT token
 */
const generatePasswordResetToken = (userId) => {
  return jwt.sign(
    { userId, type: 'password_reset' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

module.exports = {
  generateVerificationToken,
  generatePasswordResetToken
}; 