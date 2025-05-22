const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/email.service');
const { generateVerificationToken, generatePasswordResetToken } = require('../utils/token.utils');
const { verifyToken } = require('../middleware/auth.middleware');

// Register new user
router.post('/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('firstName').trim().notEmpty(),
    body('lastName').trim().notEmpty(),
    body('role').isIn(['patient', 'doctor'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: true, message: errors.array() });
      }

      const { email, password, firstName, lastName, role } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ error: true, message: 'User already exists' });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create user
      const user = new User({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role
      });

      await user.save();

      // If user is a doctor, create doctor profile
      if (role === 'doctor') {
        const doctor = new Doctor({
          userId: user._id,
          verificationStatus: 'pending'
        });
        await doctor.save();
      }

      // Generate verification token
      const verificationToken = generateVerificationToken(user._id);

      // Send verification email
      await sendVerificationEmail(user.email, verificationToken);

      res.status(201).json({
        message: 'User registered successfully. Please check your email for verification.',
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: true, message: 'Server error' });
    }
  }
);

// Login user
router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').exists()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: true, message: errors.array() });
      }

      const { email, password } = req.body;

      // Check if user exists
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ error: true, message: 'Invalid credentials' });
      }

      // Check if user is verified
      if (!user.isVerified) {
        return res.status(401).json({ error: true, message: 'Please verify your email first' });
      }

      // Check password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: true, message: 'Invalid credentials' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: true, message: 'Server error' });
    }
  }
);

// Verify email
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.userId) {
      return res.status(400).json({ error: true, message: 'Invalid verification token' });
    }

    // Update user verification status
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ error: true, message: 'Email already verified' });
    }

    user.isVerified = true;
    await user.save();

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: true, message: 'Server error' });
  }
});

// Request password reset
router.post('/forgot-password',
  [
    body('email').isEmail().normalizeEmail()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: true, message: errors.array() });
      }

      const { email } = req.body;

      // Check if user exists
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({ error: true, message: 'User not found' });
      }

      // Generate password reset token
      const resetToken = generatePasswordResetToken(user._id);

      // Send password reset email
      await sendPasswordResetEmail(user.email, resetToken);

      res.json({ message: 'Password reset instructions sent to your email' });
    } catch (error) {
      console.error('Password reset request error:', error);
      res.status(500).json({ error: true, message: 'Server error' });
    }
  }
);

// Reset password
router.post('/reset-password',
  [
    body('token').notEmpty(),
    body('password').isLength({ min: 6 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: true, message: errors.array() });
      }

      const { token, password } = req.body;

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded || !decoded.userId) {
        return res.status(400).json({ error: true, message: 'Invalid reset token' });
      }

      // Update user password
      const user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(404).json({ error: true, message: 'User not found' });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      user.password = hashedPassword;
      await user.save();

      res.json({ message: 'Password reset successfully' });
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ error: true, message: 'Server error' });
    }
  }
);

// Get current user
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: true, message: 'Server error' });
  }
});

module.exports = router;
