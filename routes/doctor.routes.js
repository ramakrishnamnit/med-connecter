const express = require('express');
const { body, validationResult, query } = require('express-validator');
const mongoose = require('mongoose');
const multer = require('multer');
const Doctor = require('../models/doctor.model');
const User = require('../models/user.model');
const AuthMiddleware = require('../middleware/auth.middleware');
const DoctorHandler = require('../handlers/doctor.handler');
const AWSService = require('../services/aws.service');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Doctor:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: The doctor ID
 *         userId:
 *           type: string
 *           description: Associated user ID
 *         specialization:
 *           type: string
 *           description: Doctor's specialization
 *         experience:
 *           type: number
 *           description: Years of experience
 *         qualification:
 *           type: string
 *           description: Doctor's qualifications
 *         isVerified:
 *           type: boolean
 *           description: Whether the doctor is verified
 *         rating:
 *           type: number
 *           description: Average rating
 *         totalReviews:
 *           type: number
 *           description: Total number of reviews
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: When the doctor profile was created
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: When the doctor profile was last updated
 *     DoctorProfile:
 *       type: object
 *       properties:
 *         registrationNumber:
 *           type: string
 *         specializations:
 *           type: array
 *           items:
 *             type: string
 *         experience:
 *           type: number
 *         consultationFee:
 *           type: number
 *         currency:
 *           type: string
 *         about:
 *           type: string
 *         education:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               degree:
 *                 type: string
 *               institution:
 *                 type: string
 *               year:
 *                 type: number
 *         training:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               institution:
 *                 type: string
 *               year:
 *                 type: number
 *         awards:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               year:
 *                 type: number
 *         publications:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               journal:
 *                 type: string
 *               year:
 *                 type: number
 *         services:
 *           type: array
 *           items:
 *             type: string
 *         clinicLocation:
 *           type: object
 *           properties:
 *             address:
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

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

/**
 * @swagger
 * tags:
 *   name: Doctors
 *   description: Doctor management endpoints
 */

/**
 * @swagger
 * /api/v1/doctors:
 *   get:
 *     tags:
 *       - Doctors
 *     summary: Get all doctors
 *     description: Retrieve a list of all doctors with optional filtering
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: specialization
 *         schema:
 *           type: string
 *         description: Filter by specialization
 *       - in: query
 *         name: verified
 *         schema:
 *           type: boolean
 *         description: Filter by verification status
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
 *         description: List of doctors retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 doctors:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Doctor'
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
router.get('/', DoctorHandler.getDoctors);

/**
 * @swagger
 * /api/v1/doctors/profile:
 *   get:
 *     tags:
 *       - Doctors
 *     summary: Get doctor profile
 *     description: Get the authenticated doctor's profile information
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Doctor profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 doctor:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     registrationNumber:
 *                       type: string
 *                     verificationStatus:
 *                       type: string
 *                       enum: [pending, verified, rejected]
 *                     status:
 *                       type: string
 *                       enum: [pending, active, inactive, suspended]
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - User is not a doctor
 *       404:
 *         description: Doctor profile not found
 *       500:
 *         description: Server error
 */
router.get('/profile', AuthMiddleware.authenticate, DoctorHandler.getDoctorProfile);

/**
 * @swagger
 * /api/v1/doctors/profile:
 *   post:
 *     tags:
 *       - Doctors
 *     summary: Create or update doctor profile
 *     description: Create a new doctor profile or update an existing one with all required details
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - registrationNumber
 *               - specializations
 *               - experience
 *               - consultationFee
 *               - about
 *               - education
 *               - clinicLocation
 *             properties:
 *               registrationNumber:
 *                 type: string
 *                 description: Doctor's registration number (9 digits)
 *                 example: "123456789"
 *               specializations:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of doctor's specializations
 *               experience:
 *                 type: number
 *                 minimum: 0
 *                 description: Years of experience
 *               consultationFee:
 *                 type: number
 *                 minimum: 0
 *                 description: Consultation fee amount
 *               currency:
 *                 type: string
 *                 default: EUR
 *                 description: Currency for consultation fee
 *               about:
 *                 type: string
 *                 description: Doctor's bio or description
 *               education:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - degree
 *                     - institution
 *                     - year
 *                   properties:
 *                     degree:
 *                       type: string
 *                       description: Degree name
 *                     institution:
 *                       type: string
 *                       description: Institution name
 *                     year:
 *                       type: number
 *                       description: Year of completion
 *               training:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                     - institution
 *                     - year
 *                   properties:
 *                     name:
 *                       type: string
 *                       description: Training name
 *                     institution:
 *                       type: string
 *                       description: Institution name
 *                     year:
 *                       type: number
 *                       description: Year of completion
 *               awards:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                     - year
 *                   properties:
 *                     name:
 *                       type: string
 *                       description: Award name
 *                     year:
 *                       type: number
 *                       description: Year received
 *               publications:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - title
 *                     - journal
 *                     - year
 *                   properties:
 *                     title:
 *                       type: string
 *                       description: Publication title
 *                     journal:
 *                       type: string
 *                       description: Journal name
 *                     year:
 *                       type: number
 *                       description: Year of publication
 *                     url:
 *                       type: string
 *                       format: uri
 *                       description: URL to publication
 *               services:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                     - price
 *                   properties:
 *                     name:
 *                       type: string
 *                       description: Service name
 *                     description:
 *                       type: string
 *                       description: Service description
 *                     price:
 *                       type: number
 *                       minimum: 0
 *                       description: Service price
 *               clinicLocation:
 *                 type: object
 *                 required:
 *                   - address
 *                   - city
 *                   - postalCode
 *                 properties:
 *                   address:
 *                     type: string
 *                     description: Street address
 *                   city:
 *                     type: string
 *                     description: City name
 *                   postalCode:
 *                     type: string
 *                     description: Postal code
 *                   country:
 *                     type: string
 *                     default: Netherlands
 *                     description: Country name
 *               availability:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - day
 *                     - slots
 *                   properties:
 *                     day:
 *                       type: string
 *                       enum: [monday, tuesday, wednesday, thursday, friday, saturday, sunday]
 *                       description: Day of the week
 *                     slots:
 *                       type: array
 *                       items:
 *                         type: object
 *                         required:
 *                           - startTime
 *                           - endTime
 *                         properties:
 *                           startTime:
 *                             type: string
 *                             format: time
 *                             description: Slot start time (HH:mm)
 *                           endTime:
 *                             type: string
 *                             format: time
 *                             description: Slot end time (HH:mm)
 *     responses:
 *       200:
 *         description: Doctor profile created/updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Doctor profile created/updated successfully. Waiting for admin approval.
 *                 doctor:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     registrationNumber:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [pending, active, inactive, suspended]
 *                     specializations:
 *                       type: array
 *                       items:
 *                         type: string
 *                     experience:
 *                       type: number
 *                     consultationFee:
 *                       type: number
 *                     currency:
 *                       type: string
 *                     about:
 *                       type: string
 *                     education:
 *                       type: array
 *                       items:
 *                         type: object
 *                     training:
 *                       type: array
 *                       items:
 *                         type: object
 *                     awards:
 *                       type: array
 *                       items:
 *                         type: object
 *                     publications:
 *                       type: array
 *                       items:
 *                         type: object
 *                     services:
 *                       type: array
 *                       items:
 *                         type: object
 *                     clinicLocation:
 *                       type: object
 *                     availability:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Bad request - Invalid input data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *       403:
 *         description: Forbidden - User is not a doctor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Only doctors can create/update doctor profiles
 *       404:
 *         description: Not found - Doctor profile not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Doctor profile not found. Please verify registration number first.
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Failed to update doctor profile
 */
router.post('/profile', AuthMiddleware.authenticate, DoctorHandler.createOrUpdateProfile);

/**
 * @swagger
 * /api/v1/doctors/{id}:
 *   get:
 *     tags:
 *       - Doctors
 *     summary: Get doctor by ID
 *     description: Retrieve a specific doctor's profile by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Doctor ID
 *     responses:
 *       200:
 *         description: Doctor profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Doctor'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Doctor not found
 *       500:
 *         description: Server error
 */
router.get('/:id', DoctorHandler.getDoctorById);

/**
 * @swagger
 * /api/v1/doctors/verify/{id}:
 *   put:
 *     tags:
 *       - Doctors
 *     summary: Verify a doctor
 *     description: Mark a doctor as verified (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Doctor ID
 *     responses:
 *       200:
 *         description: Doctor verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Doctor'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Doctor not found
 *       500:
 *         description: Server error
 */
router.post('/:id/verify', AuthMiddleware.authenticate, AuthMiddleware.authorize(['admin']), DoctorHandler.verifyDoctor);

/**
 * @swagger
 * /api/v1/doctors/reviews:
 *   get:
 *     tags:
 *       - Doctors
 *     summary: Get doctor's reviews
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reviews retrieved successfully
 */
router.get('/reviews', AuthMiddleware.authenticate, DoctorHandler.getDoctorReviews);

/**
 * @swagger
 * /api/v1/doctors/appointments:
 *   get:
 *     tags:
 *       - Doctors
 *     summary: Get doctor's appointments
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Appointments retrieved successfully
 */
router.get('/appointments', AuthMiddleware.authenticate, DoctorHandler.getAppointments);

/**
 * @swagger
 * /api/v1/doctors/appointments/{id}:
 *   put:
 *     tags:
 *       - Doctors
 *     summary: Update appointment status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [confirmed, cancelled, completed]
 *     responses:
 *       200:
 *         description: Appointment status updated successfully
 */
router.put('/appointments/:id', AuthMiddleware.authenticate, DoctorHandler.updateAppointmentStatus);

/**
 * @swagger
 * /api/v1/doctors/profile-picture:
 *   put:
 *     tags:
 *       - Doctors
 *     summary: Upload doctor profile picture
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - profilePicture
 *             properties:
 *               profilePicture:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Profile picture uploaded successfully
 *       400:
 *         description: Invalid file
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.put('/profile-picture', 
  AuthMiddleware.authenticate, 
  AuthMiddleware.authorize(['doctor']), 
  upload.single('profilePicture'), 
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      // Upload to S3
      const imageUrl = await AWSService.uploadToS3(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );
      
      // Update user profile
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      user.avatarUrl = imageUrl;
      await user.save();
      
      res.json({
        message: 'Profile picture uploaded successfully',
        avatarUrl: imageUrl
      });
    } catch (error) {
      console.error('Profile picture upload error:', error);
      res.status(500).json({ message: 'Server error while uploading profile picture' });
    }
  }
);

/**
 * @swagger
 * /api/v1/doctors/specialties:
 *   get:
 *     tags:
 *       - Doctors
 *     summary: Get all specialties
 *     description: Retrieve a list of all available medical specialties
 *     responses:
 *       200:
 *         description: List of specialties retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *       500:
 *         description: Server error
 */
router.get('/specialties', DoctorHandler.getSpecialties);

/**
 * @swagger
 * /api/v1/doctors/availability:
 *   get:
 *     tags:
 *       - Doctors
 *     summary: Get doctor's availability
 *     description: Get the availability schedule for a specific doctor
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: doctorId
 *         required: true
 *         schema:
 *           type: string
 *         description: Doctor ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for availability check
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for availability check
 *     responses:
 *       200:
 *         description: Availability schedule retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 availability:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       day:
 *                         type: string
 *                         enum: [Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday]
 *                       slots:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             start:
 *                               type: string
 *                               format: time
 *                             end:
 *                               type: string
 *                               format: time
 *                             isBooked:
 *                               type: boolean
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Doctor not found
 *       500:
 *         description: Server error
 */
router.get('/:id/availability', DoctorHandler.getAvailability);

/**
 * @swagger
 * /api/v1/doctors/availability:
 *   put:
 *     tags:
 *       - Doctors
 *     summary: Update doctor availability
 *     description: Update the authenticated doctor's availability schedule
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - availability
 *             properties:
 *               availability:
 *                 type: object
 *                 properties:
 *                   monday:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           format: time
 *                         end:
 *                           type: string
 *                           format: time
 *                   tuesday:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           format: time
 *                         end:
 *                           type: string
 *                           format: time
 *                   wednesday:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           format: time
 *                         end:
 *                           type: string
 *                           format: time
 *                   thursday:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           format: time
 *                         end:
 *                           type: string
 *                           format: time
 *                   friday:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           format: time
 *                         end:
 *                           type: string
 *                           format: time
 *                   saturday:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           format: time
 *                         end:
 *                           type: string
 *                           format: time
 *                   sunday:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           format: time
 *                         end:
 *                           type: string
 *                           format: time
 *     responses:
 *       200:
 *         description: Availability updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Doctor'
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - User is not a doctor
 *       500:
 *         description: Server error
 */
router.put('/profile/availability', AuthMiddleware.authenticate, AuthMiddleware.authorize(['doctor']), DoctorHandler.updateAvailability);

/**
 * @swagger
 * /api/v1/doctors/verify-registration:
 *   post:
 *     tags:
 *       - Doctors
 *     summary: Verify doctor registration number
 *     description: |
 *       Verify a doctor's registration number with the medical board and update their profile.
 *       The user ID is automatically obtained from the authentication token.
 *       Users can only verify their own registration number.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - registrationNumber
 *             properties:
 *               registrationNumber:
 *                 type: string
 *                 description: Doctor's registration number (9 digits)
 *                 example: "123456789"
 *     responses:
 *       200:
 *         description: Registration number verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 isVerified:
 *                   type: boolean
 *                 doctor:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     registrationNumber:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [pending, approved, rejected]
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Invalid registration number format"
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       403:
 *         description: Forbidden - User is not authorized to verify this registration number
 *       500:
 *         description: Server error
 */
router.post('/verify-registration', AuthMiddleware.authenticate, DoctorHandler.verifyRegistrationNumber);

/**
 * @swagger
 * /api/v1/doctors/profile:
 *   post:
 *     tags:
 *       - Doctors
 *     summary: Create or update doctor profile
 *     description: Create a new doctor profile or update an existing one with registration number
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - registrationNumber
 *             properties:
 *               registrationNumber:
 *                 type: string
 *                 description: Doctor's registration number (9 digits)
 *                 example: "123456789"
 *     responses:
 *       200:
 *         description: Doctor profile created/updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 doctor:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     registrationNumber:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [pending, approved, rejected]
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - User is not a doctor
 *       500:
 *         description: Server error
 */
router.post('/register', AuthMiddleware.authenticate, DoctorHandler.registerDoctor);

module.exports = router;
