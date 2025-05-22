const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
// const { createMollieClient } = require('@mollie/api-client');
const Payment = require('../models/payment.model');
const Appointment = require('../models/appointment.model');
const Doctor = require('../models/doctor.model');
const { verifyToken } = require('../middleware/auth.middleware');
const { sendEmail } = require('../services/aws.service');

// Initialize Mollie client
// const mollieClient = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY });

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Payment processing endpoints
 */

/**
 * @swagger
 * /api/payments:
 *   get:
 *     tags:
 *       - Payments
 *     summary: Get user's payment history
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, completed, failed, refunded]
 *         description: Filter by payment status
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for payment history
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for payment history
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
 *         description: Payment history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 payments:
 *                   type: array
 *                   items:
 *                     $ref: '#/definitions/Payment'
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
 * /api/payments:
 *   post:
 *     tags:
 *       - Payments
 *     summary: Create a new payment
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
 *               - amount
 *               - currency
 *               - paymentMethod
 *             properties:
 *               appointmentId:
 *                 type: string
 *               amount:
 *                 type: number
 *               currency:
 *                 type: string
 *                 default: EUR
 *               paymentMethod:
 *                 type: string
 *                 enum: [card, ideal, bank_transfer]
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Payment initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Payment'
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
 * /api/payments/{id}:
 *   get:
 *     tags:
 *       - Payments
 *     summary: Get payment details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     responses:
 *       200:
 *         description: Payment details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Payment'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Payment not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/payments/{id}/refund:
 *   post:
 *     tags:
 *       - Payments
 *     summary: Request a refund
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *               amount:
 *                 type: number
 *                 description: Partial refund amount (optional)
 *     responses:
 *       200:
 *         description: Refund request submitted successfully
 *       400:
 *         description: Invalid input or refund not possible
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not authorized to request refund
 *       404:
 *         description: Payment not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/payments/webhook:
 *   post:
 *     tags:
 *       - Payments
 *     summary: Payment webhook handler
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - event
 *               - data
 *             properties:
 *               event:
 *                 type: string
 *                 enum: [payment.succeeded, payment.failed, refund.succeeded]
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid webhook payload
 *       500:
 *         description: Server error
 */

/**
 * @route POST /api/payments/initiate
 * @desc Initiate payment for an appointment
 * @access Private
 */
router.post('/initiate', verifyToken, [
  body('appointmentId').notEmpty().withMessage('Appointment ID is required'),
  body('method').isIn(['iDEAL', 'card', 'paypal']).withMessage('Valid payment method is required')
], async (req, res) => {
  // Temporary response until payment provider is decided
  res.status(200).json({
    message: 'Payment functionality is currently under development',
    status: 'pending',
    mockPaymentUrl: 'https://example.com/payment',
    paymentId: 'mock-payment-id'
  });
});

/**
 * @route GET /api/payments/:id
 * @desc Get payment status by ID
 * @access Private
 */
router.get('/:id', verifyToken, async (req, res) => {
  // Temporary response until payment provider is decided
  res.status(200).json({
    message: 'Payment functionality is currently under development',
    payment: {
      status: 'pending',
      amount: 0,
      currency: 'EUR'
    }
  });
});

/**
 * @route POST /api/payments/webhook
 * @desc Handle payment webhooks
 * @access Public
 */
router.post('/webhook', async (req, res) => {
  // Temporary response until payment provider is decided
  res.status(200).json({
    message: 'Payment webhook functionality is currently under development'
  });
});

module.exports = router;
