const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const multer = require('multer');
const Chat = require('../models/chat.model');
const Appointment = require('../models/appointment.model');
const { verifyToken } = require('../middleware/auth.middleware');
const { uploadToS3 } = require('../services/aws.service');
const chatService = require('../services/chat.service');

const router = express.Router();

// Configure multer for memory storage (we'll upload directly to S3)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

/**
 * @route GET /api/chats/:appointmentId
 * @desc Get chat messages for an appointment
 * @access Private
 */
router.get('/:appointmentId', verifyToken, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { limit = 50, skip = 0 } = req.query;
    
    // Validate appointment ID
    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment ID format' });
    }
    
    // Verify user has access to this appointment
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    
    const isParticipant = 
      appointment.patientId.toString() === req.user.id ||
      appointment.doctorId.toString() === req.user.id;
    
    if (!isParticipant) {
      return res.status(403).json({ message: 'Access denied: Not your appointment' });
    }
    
    // Get chat messages
    const messages = await chatService.getMessages(
      appointmentId,
      req.user.id,
      Number(limit),
      Number(skip)
    );
    
    // Mark messages as read
    await chatService.markMessagesAsRead(appointmentId, req.user.id);
    
    res.json({ messages });
  } catch (error) {
    console.error('Get chat messages error:', error);
    res.status(500).json({ message: 'Server error fetching chat messages' });
  }
});

/**
 * @route POST /api/chats/:appointmentId/message
 * @desc Send a text message
 * @access Private
 */
router.post('/:appointmentId/message', verifyToken, [
  body('content').trim().notEmpty().withMessage('Message content cannot be empty')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { appointmentId } = req.params;
    const { content } = req.body;
    
    // Validate appointment ID
    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment ID format' });
    }
    
    // Verify appointment and chat existence
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    
    // Check if user is part of this appointment
    const isParticipant = 
      appointment.patientId.toString() === req.user.id ||
      appointment.doctorId.toString() === req.user.id;
    
    if (!isParticipant) {
      return res.status(403).json({ message: 'Access denied: Not your appointment' });
    }
    
    // Add message
    const message = await chatService.saveMessage(
      appointmentId,
      req.user.id,
      content
    );
    
    // In production, we would emit a socket event here
    
    res.status(201).json({ message });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Server error sending message' });
  }
});

/**
 * @route POST /api/chats/:appointmentId/file
 * @desc Upload a file to chat
 * @access Private
 */
router.post('/:appointmentId/file', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const { appointmentId } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    // Validate appointment ID
    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment ID format' });
    }
    
    // Verify appointment and chat existence
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    
    // Check if user is part of this appointment
    const isParticipant = 
      appointment.patientId.toString() === req.user.id ||
      appointment.doctorId.toString() === req.user.id;
    
    if (!isParticipant) {
      return res.status(403).json({ message: 'Access denied: Not your appointment' });
    }
    
    // Determine file type
    const isImage = req.file.mimetype.startsWith('image/');
    const fileType = isImage ? 'image' : 'file';
    
    // Upload to S3
    const fileUrl = await uploadToS3(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    
    // Add message with file
    const message = await chatService.saveMessage(
      appointmentId,
      req.user.id,
      req.file.originalname,
      fileType,
      fileUrl
    );
    
    // In production, we would emit a socket event here
    
    res.status(201).json({
      message,
      fileUrl
    });
  } catch (error) {
    console.error('Upload chat file error:', error);
    res.status(500).json({ message: 'Server error uploading file' });
  }
});

/**
 * @route GET /api/chats/unread-count
 * @desc Get count of unread messages across all chats
 * @access Private
 */
router.get('/unread-count', verifyToken, async (req, res) => {
  try {
    // Find all chats where user is a participant
    const chats = await Chat.find({
      participants: req.user.id
    });
    
    // Count unread messages
    let unreadCount = 0;
    chats.forEach(chat => {
      chat.messages.forEach(message => {
        if (!message.read && message.senderId.toString() !== req.user.id) {
          unreadCount++;
        }
      });
    });
    
    res.json({ unreadCount });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ message: 'Server error counting unread messages' });
  }
});

module.exports = router;
