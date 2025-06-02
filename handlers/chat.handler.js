const Chat = require('../models/chat.model');
const Message = require('../models/message.model');
const Appointment = require('../models/appointment.model');
const AWSService = require('../services/aws.service');

const ChatHandler = {
  async getChatMessages(req, res) {
    try {
      const { appointmentId } = req.params;
      const messages = await Message.find({ chatId: appointmentId })
        .populate('senderId', 'firstName lastName avatar')
        .sort({ createdAt: 1 });

      res.json(messages);
    } catch (error) {
      console.error('getChatMessages error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  async sendMessage(req, res) {
    try {
      const { appointmentId } = req.params;
      const { content, type } = req.body;
      const senderId = req.user.id;

      // Create message
      const message = new Message({
        chatId: appointmentId,
        senderId,
        content,
        type
      });

      await message.save();

      // Populate sender info
      await message.populate('senderId', 'firstName lastName avatar');

      res.status(201).json(message);
    } catch (error) {
      console.error('sendMessage error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  async uploadFile(req, res) {
    try {
      const { appointmentId } = req.params;
      const senderId = req.user.id;

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Upload file to S3
      const fileUrl = await AWSService.uploadFile(req.file, 'chat-files');

      // Create message
      const message = new Message({
        chatId: appointmentId,
        senderId,
        content: fileUrl,
        type: 'file',
        fileName: req.file.originalname,
        fileType: req.file.mimetype
      });

      await message.save();

      // Populate sender info
      await message.populate('senderId', 'firstName lastName avatar');

      res.status(201).json(message);
    } catch (error) {
      console.error('uploadFile error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  async getUnreadCount(req, res) {
    try {
      const userId = req.user.id;

      // Get all chats where user is a participant
      const chats = await Chat.find({
        participants: userId
      });

      // Get unread message count for each chat
      const unreadCounts = await Promise.all(
        chats.map(async (chat) => {
          const count = await Message.countDocuments({
            chatId: chat._id,
            senderId: { $ne: userId },
            readBy: { $ne: userId }
          });
          return { chatId: chat._id, unreadCount: count };
        })
      );

      res.json(unreadCounts);
    } catch (error) {
      console.error('getUnreadCount error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
};

module.exports = ChatHandler; 