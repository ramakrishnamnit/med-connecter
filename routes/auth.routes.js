const express = require('express');
const router = express.Router();
const AuthHandler = require('../handlers/auth.handler');
const AuthMiddleware = require('../middleware/auth.middleware');
const sessionMiddleware = require('../middleware/session.middleware');
const Session = require('../models/session.model');
const logger = require('../utils/logger');

/**
 * @swagger
 * components:
 *   schemas:
 *     RegisterRequest:
 *       type: object
 *       required:
 *         - email
 *         - phone
 *         - firstName
 *         - lastName
 *         - role
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         phone:
 *           type: object
 *           properties:
 *             countryCode:
 *               type: string
 *             number:
 *               type: string
 *         firstName:
 *           type: string
 *         lastName:
 *           type: string
 *         role:
 *           type: string
 *           enum: [patient, doctor]
 *         address:
 *           type: object
 *           properties:
 *             street:
 *               type: string
 *             city:
 *               type: string
 *             state:
 *               type: string
 *             country:
 *               type: string
 *             postalCode:
 *               type: string
 */

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Invalid input data
 */
router.post('/register', AuthHandler.register);

/**
 * @swagger
 * /api/v1/auth/login/initiate:
 *   post:
 *     summary: Initiate login process
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - identifier
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Email or phone number
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       404:
 *         description: User not found
 */
router.post('/login/initiate', AuthHandler.initiateLogin);

/**
 * @swagger
 * /api/v1/auth/login/verify:
 *   post:
 *     summary: Verify login OTP
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - identifier
 *               - otp
 *               - type
 *               - deviceInfo
 *             properties:
 *               identifier:
 *                 type: string
 *               otp:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [email, phone]
 *               deviceInfo:
 *                 type: object
 *                 properties:
 *                   deviceId:
 *                     type: string
 *                   deviceType:
 *                     type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Invalid OTP
 */
router.post('/login/verify', AuthHandler.verifyLogin);

/**
 * @swagger
 * /api/v1/auth/verify/email:
 *   post:
 *     summary: Verify email address
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid OTP
 */
router.post('/verify/email', AuthHandler.verifyEmail);

/**
 * @swagger
 * /api/v1/auth/verify/phone:
 *   post:
 *     summary: Verify phone number
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - otp
 *             properties:
 *               phone:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: Phone verified successfully
 *       400:
 *         description: Invalid OTP
 */
router.post('/verify/phone', AuthHandler.verifyPhone);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout from current device
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post('/logout', AuthMiddleware.authenticate, AuthHandler.logout);

/**
 * @swagger
 * /api/v1/auth/logout/all:
 *   post:
 *     summary: Logout from all devices
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out from all devices
 */
router.post('/logout/all', AuthMiddleware.authenticate, AuthHandler.logoutAll);

/**
 * @swagger
 * /api/v1/auth/refresh-session:
 *   post:
 *     tags: [Authentication]
 *     summary: Refresh user session
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Session refreshed successfully
 *       401:
 *         description: Invalid or expired session
 */
router.post('/refresh-session', AuthMiddleware.authenticate, async (req, res) => {
  try {
    const session = req.session;
    
    if (!session) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid session'
      });
    }

    // Update last activity
    session.lastActivity = Date.now();
    await session.save();

    res.json({
      status: 'success',
      message: 'Session refreshed successfully',
      session: {
        id: session._id,
        lastActivity: session.lastActivity
      }
    });
  } catch (error) {
    logger.error('Session refresh error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error refreshing session'
    });
  }
});

/**
 * @swagger
 * /api/v1/auth/verify/status:
 *   post:
 *     summary: Check verification status
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - identifier
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Email or phone number
 *     responses:
 *       200:
 *         description: Verification status retrieved successfully
 *       404:
 *         description: User not found
 */
router.post('/verify/status', AuthHandler.checkVerificationStatus);

/**
 * @swagger
 * /api/v1/auth/verify/resend:
 *   post:
 *     summary: Resend verification OTP
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - identifier
 *               - type
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Email or phone number
 *               type:
 *                 type: string
 *                 enum: [email, phone]
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       400:
 *         description: Already verified or invalid request
 *       404:
 *         description: User not found
 */
router.post('/verify/resend', AuthHandler.resendVerificationOTP);

module.exports = router; 