const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Review = require('../models/review.model');
const Appointment = require('../models/appointment.model');
const AuthMiddleware = require('../middleware/auth.middleware');
const ReviewHandler = require('../handlers/review.handler');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Review:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: The review ID
 *         doctorId:
 *           type: string
 *           description: ID of the doctor being reviewed
 *         patientId:
 *           type: string
 *           description: ID of the patient writing the review
 *         rating:
 *           type: number
 *           minimum: 1
 *           maximum: 5
 *           description: Rating given (1-5)
 *         comment:
 *           type: string
 *           description: Review comment
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: When the review was created
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: When the review was last updated
 */

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Review management endpoints
 */

/**
 * @swagger
 * /api/v1/reviews:
 *   post:
 *     tags:
 *       - Reviews
 *     summary: Create a new review
 *     description: Create a new review for a doctor
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - doctorId
 *               - rating
 *             properties:
 *               doctorId:
 *                 type: string
 *                 description: ID of the doctor being reviewed
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Rating given (1-5)
 *               comment:
 *                 type: string
 *                 description: Review comment
 *     responses:
 *       201:
 *         description: Review created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Review'
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not authorized to review
 *       404:
 *         description: Doctor not found
 *       500:
 *         description: Server error
 */
router.post('/', 
  AuthMiddleware.authenticate,
  AuthMiddleware.authorize(['user']),
  [
    body('doctorId').isMongoId().withMessage('Invalid doctor ID'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('comment').optional().isString().withMessage('Comment must be a string')
  ],
  async (req, res, next) => {
    try {
      logger.info('Creating new review', {
        userId: req.user.id,
        doctorId: req.body.doctorId,
        rating: req.body.rating
      });
      await ReviewHandler.createReview(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/reviews/{id}:
 *   put:
 *     tags:
 *       - Reviews
 *     summary: Update a review
 *     description: Update an existing review
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Review ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Updated rating (1-5)
 *               comment:
 *                 type: string
 *                 description: Updated review comment
 *     responses:
 *       200:
 *         description: Review updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Review'
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not authorized to update review
 *       404:
 *         description: Review not found
 *       500:
 *         description: Server error
 */
router.put('/:id', 
  AuthMiddleware.authenticate,
  [
    body('rating').optional().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('comment').optional().isString().withMessage('Comment must be a string')
  ],
  async (req, res, next) => {
    try {
      logger.info('Updating review', {
        userId: req.user.id,
        reviewId: req.params.id,
        updates: req.body
      });
      await ReviewHandler.updateReview(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/reviews/{id}:
 *   delete:
 *     tags:
 *       - Reviews
 *     summary: Delete a review
 *     description: Delete an existing review
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Review ID
 *     responses:
 *       200:
 *         description: Review deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not authorized to delete review
 *       404:
 *         description: Review not found
 *       500:
 *         description: Server error
 */
router.delete('/:id', 
  AuthMiddleware.authenticate,
  async (req, res, next) => {
    try {
      logger.info('Deleting review', {
        userId: req.user.id,
        reviewId: req.params.id
      });
      await ReviewHandler.deleteReview(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/reviews/doctor/{doctorId}:
 *   get:
 *     tags:
 *       - Reviews
 *     summary: Get doctor's reviews
 *     description: Get all reviews for a specific doctor
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: doctorId
 *         required: true
 *         schema:
 *           type: string
 *         description: Doctor ID
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
 *         description: Reviews retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reviews:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Review'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 pages:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Doctor not found
 *       500:
 *         description: Server error
 */
router.get('/doctor/:doctorId', 
  AuthMiddleware.authenticate,
  async (req, res, next) => {
    try {
      logger.info('Fetching doctor reviews', {
        userId: req.user.id,
        doctorId: req.params.doctorId,
        query: req.query
      });
      await ReviewHandler.getDoctorReviews(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/reviews/my-reviews:
 *   get:
 *     tags:
 *       - Reviews
 *     summary: Get user's reviews
 *     description: Get all reviews written by the authenticated user
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: Reviews retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reviews:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Review'
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
router.get('/my-reviews', 
  AuthMiddleware.authenticate,
  async (req, res, next) => {
    try {
      logger.info('Fetching user reviews', {
        userId: req.user.id,
        query: req.query
      });
      await ReviewHandler.getMyReviews(req, res);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
