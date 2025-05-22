const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Notification = require('../models/notification.model');
const { verifyToken } = require('../middleware/auth.middleware');
const notificationService = require('../services/notification.service');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Notification management endpoints
 */

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     tags:
 *       - Notifications
 *     summary: Get user's notifications
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [appointment, payment, chat, system]
 *         description: Filter by notification type
 *       - in: query
 *         name: read
 *         schema:
 *           type: boolean
 *         description: Filter by read status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 notifications:
 *                   type: array
 *                   items:
 *                     $ref: '#/definitions/Notification'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 pages:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/notifications/{id}:
 *   get:
 *     tags:
 *       - Notifications
 *     summary: Get notification details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Notification'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   put:
 *     tags:
 *       - Notifications
 *     summary: Mark notification as read
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification marked as read successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/notifications/read-all:
 *   put:
 *     tags:
 *       - Notifications
 *     summary: Mark all notifications as read
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     tags:
 *       - Notifications
 *     summary: Delete a notification
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Server error
 */

/**
 * @route GET /api/notifications
 * @desc Get user notifications
 * @access Private
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const { limit = 20, skip = 0 } = req.query;
    
    const notifications = await notificationService.getUserNotifications(
      req.user.id,
      Number(limit),
      Number(skip)
    );
    
    res.json({ notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Server error fetching notifications' });
  }
});

/**
 * @route PUT /api/notifications/:id/read
 * @desc Mark a notification as read
 * @access Private
 */
router.put('/:id/read', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate notification ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid notification ID format' });
    }
    
    const notification = await notificationService.markNotificationAsRead(id, req.user.id);
    
    res.json({
      message: 'Notification marked as read',
      notification
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ message: 'Server error marking notification as read' });
  }
});

/**
 * @route PUT /api/notifications/read-all
 * @desc Mark all notifications as read
 * @access Private
 */
router.put('/read-all', verifyToken, async (req, res) => {
  try {
    // Update all unread notifications for this user
    const result = await Notification.updateMany(
      {
        userId: req.user.id,
        read: false
      },
      {
        $set: { read: true }
      }
    );
    
    res.json({
      message: 'All notifications marked as read',
      count: result.modifiedCount
    });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ message: 'Server error marking all notifications as read' });
  }
});

/**
 * @route DELETE /api/notifications/:id
 * @desc Delete a notification
 * @access Private
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate notification ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid notification ID format' });
    }
    
    // Find and delete the notification
    const notification = await Notification.findOne({
      _id: id,
      userId: req.user.id
    });
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found or unauthorized' });
    }
    
    await notification.remove();
    
    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ message: 'Server error deleting notification' });
  }
});

/**
 * @route POST /api/notifications/send-test
 * @desc Send a test notification (development only)
 * @access Private
 */
router.post('/send-test', verifyToken, [
  body('type').isIn(['email', 'sms', 'push']).withMessage('Valid notification type required')
], async (req, res) => {
  // This route should be disabled in production
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ message: 'Route not found' });
  }
  
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  try {
    const { type } = req.body;
    
    const notification = await notificationService.sendNotification(
      req.user.id,
      'Test Notification',
      'This is a test notification sent from the API.',
      type
    );
    
    res.json({
      message: 'Test notification sent',
      notification
    });
  } catch (error) {
    console.error('Send test notification error:', error);
    res.status(500).json({ message: 'Server error sending test notification' });
  }
});

module.exports = router;
