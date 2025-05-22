const express = require('express');
const { body, validationResult } = require('express-validator');
const { verifyToken } = require('../middleware/auth.middleware');
const videoService = require('../services/video.service');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Video
 *   description: Video consultation endpoints
 */

/**
 * @swagger
 * /api/video/sessions:
 *   get:
 *     tags:
 *       - Video
 *     summary: Get user's video sessions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [scheduled, active, completed, cancelled]
 *         description: Filter by session status
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
 *         description: Video sessions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessions:
 *                   type: array
 *                   items:
 *                     $ref: '#/definitions/VideoSession'
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
 * /api/video/sessions:
 *   post:
 *     tags:
 *       - Video
 *     summary: Create a new video session
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - appointmentId
 *             properties:
 *               appointmentId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Video session created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/VideoSession'
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Appointment not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/video/sessions/{id}:
 *   get:
 *     tags:
 *       - Video
 *     summary: Get video session details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Video session details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/VideoSession'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Video session not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/video/sessions/{id}/join:
 *   post:
 *     tags:
 *       - Video
 *     summary: Join a video session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Successfully joined video session
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 roomName:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not authorized to join this session
 *       404:
 *         description: Video session not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/video/sessions/{id}/end:
 *   post:
 *     tags:
 *       - Video
 *     summary: End a video session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Video session ended successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not authorized to end this session
 *       404:
 *         description: Video session not found
 *       500:
 *         description: Server error
 */

/**
 * @route POST /api/video/session
 * @desc Create a new video session
 * @access Private
 */
router.post('/session', verifyToken, [
  body('doctorId').notEmpty().withMessage('Doctor ID is required'),
  body('patientId').notEmpty().withMessage('Patient ID is required'),
  body('scheduledAt').isISO8601().withMessage('Valid scheduled time is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { doctorId, patientId, scheduledAt } = req.body;
    const session = await videoService.createVideoSession(doctorId, patientId, new Date(scheduledAt));

    res.status(201).json({
      message: 'Video session created successfully',
      session
    });
  } catch (error) {
    console.error('Create video session error:', error);
    res.status(500).json({ 
      message: 'Error creating video session',
      error: error.message
    });
  }
});

/**
 * @route POST /api/video/join/:sessionId
 * @desc Join a video session
 * @access Private
 */
router.post('/join/:sessionId', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const sessionDetails = await videoService.joinVideoSession(sessionId, userId);

    res.json({
      message: 'Successfully joined video session',
      ...sessionDetails
    });
  } catch (error) {
    console.error('Join video session error:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      message: 'Error joining video session',
      error: error.message
    });
  }
});

/**
 * @route POST /api/video/end/:sessionId
 * @desc End a video session
 * @access Private
 */
router.post('/end/:sessionId', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await videoService.endVideoSession(sessionId);

    res.json({
      message: 'Video session ended successfully',
      ...result
    });
  } catch (error) {
    console.error('End video session error:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      message: 'Error ending video session',
      error: error.message
    });
  }
});

module.exports = router;
