const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

const verifyToken = (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Add user from payload
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Admin privileges required.' });
  }
};

// Middleware to check if user is a doctor
const isDoctor = (req, res, next) => {
  if (req.user && req.user.role === 'doctor') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Doctor privileges required.' });
  }
};

// Middleware to check if user is either admin or doctor
const isAdminOrDoctor = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'doctor')) {
    next();
  } else {
    res.status(403).json({ message: 'Access denied. Admin or doctor privileges required.' });
  }
};

module.exports = {
  verifyToken,
  isAdmin,
  isDoctor,
  isAdminOrDoctor
};
