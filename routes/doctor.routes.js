const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const multer = require('multer');
const Doctor = require('../models/doctor.model');
const User = require('../models/user.model');
const { verifyToken, isDoctor, isAdmin } = require('../middleware/auth.middleware');
const { uploadToS3 } = require('../services/aws.service');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Doctor:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         userId:
 *           type: string
 *         specialties:
 *           type: array
 *           items:
 *             type: string
 *         bio:
 *           type: string
 *         licenseNumber:
 *           type: string
 *         consultationFee:
 *           type: number
 *         experience:
 *           type: number
 *         availability:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               day:
 *                 type: string
 *               slots:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     start:
 *                       type: string
 *                     end:
 *                       type: string
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
 *         ratings:
 *           type: object
 *           properties:
 *             average:
 *               type: number
 *             count:
 *               type: number
 *         acceptsInsurance:
 *           type: array
 *           items:
 *             type: string
 *         verified:
 *           type: boolean
 *         verificationStatus:
 *           type: string
 *           enum: [pending, verified, rejected]
 *         userDetails:
 *           type: object
 *           properties:
 *             firstName:
 *               type: string
 *             lastName:
 *               type: string
 *             avatarUrl:
 *               type: string
 *             languages:
 *               type: array
 *               items:
 *                 type: string
 *     DoctorProfile:
 *       type: object
 *       required:
 *         - specialties
 *         - licenseNumber
 *         - consultationFee
 *       properties:
 *         specialties:
 *           type: array
 *           items:
 *             type: string
 *         bio:
 *           type: string
 *         licenseNumber:
 *           type: string
 *         consultationFee:
 *           type: number
 *         experience:
 *           type: number
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
 *         acceptsInsurance:
 *           type: array
 *           items:
 *             type: string
 *         availability:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               day:
 *                 type: string
 *               slots:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     start:
 *                       type: string
 *                     end:
 *                       type: string
 */

// Configure multer for memory storage (we'll upload directly to S3)
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
 * /api/doctors:
 *   get:
 *     tags:
 *       - Doctors
 *     summary: Get all doctors with filtering options
 *     parameters:
 *       - in: query
 *         name: specialty
 *         schema:
 *           type: string
 *         description: Filter by specialty
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *         description: Filter by language
 *       - in: query
 *         name: availability
 *         schema:
 *           type: string
 *           enum: [today, tomorrow, this_week]
 *         description: Filter by availability
 *       - in: query
 *         name: minFee
 *         schema:
 *           type: number
 *         description: Minimum consultation fee
 *       - in: query
 *         name: maxFee
 *         schema:
 *           type: number
 *         description: Maximum consultation fee
 *       - in: query
 *         name: insurance
 *         schema:
 *           type: string
 *         description: Filter by accepted insurance
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
 *                     $ref: '#/definitions/Doctor'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 pages:
 *                   type: integer
 *       500:
 *         description: Server error
 */
router.get('/', async (req, res) => {
  try {
    const {
      specialty,
      language,
      availability,
      minFee,
      maxFee,
      insurance,
      page = 1,
      limit = 10
    } = req.query;
    
    // Start building the query
    let query = {};
    
    // Filter by specialty
    if (specialty) {
      query.specialties = { $in: specialty.split(',') };
    }
    
    // Filter by language
    if (language) {
      query.userDetails = { $elemMatch: { languages: { $in: language.split(',') } } };
    }
    
    // Filter by availability
    if (availability) {
      query.availability = {
        $elemMatch: {
          day: availability.split(',')[0],
          slots: {
            $elemMatch: {
              start: { $lte: availability.split(',')[1] },
              end: { $gte: availability.split(',')[2] }
            }
          }
        }
      };
    }
    
    // Filter by consultation fee range
    if (minFee || maxFee) {
      query.consultationFee = {};
      if (minFee) query.consultationFee.$gte = Number(minFee);
      if (maxFee) query.consultationFee.$lte = Number(maxFee);
    }
    
    // Filter by insurance accepted
    if (insurance) {
      query.acceptsInsurance = { $in: insurance.split(',') };
    }
    
    // Only show verified doctors
    query.verified = true;
    query.verificationStatus = 'verified';
    
    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit);
    
    // Get doctors with their user info
    const doctors = await Doctor.aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      { $unwind: '$userDetails' },
      {
        $project: {
          _id: 1,
          userId: 1,
          specialties: 1,
          bio: 1,
          consultationFee: 1,
          experience: 1,
          availability: 1,
          education: 1,
          ratings: 1,
          acceptsInsurance: 1,
          'userDetails.firstName': 1,
          'userDetails.lastName': 1,
          'userDetails.avatarUrl': 1,
          'userDetails.languages': 1
        }
      },
      { $skip: skip },
      { $limit: Number(limit) }
    ]);
    
    // Get total count for pagination
    const totalDoctors = await Doctor.countDocuments(query);
    
    res.json({
      doctors,
      total: totalDoctors,
      page: Number(page),
      pages: Math.ceil(totalDoctors / Number(limit))
    });
  } catch (error) {
    console.error('Get doctors error:', error);
    res.status(500).json({ message: 'Server error while fetching doctors' });
  }
});

/**
 * @swagger
 * /api/doctors/{id}:
 *   get:
 *     tags:
 *       - Doctors
 *     summary: Get a specific doctor by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Doctor ID
 *     responses:
 *       200:
 *         description: Doctor details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Doctor'
 *       404:
 *         description: Doctor not found
 *       500:
 *         description: Server error
 */
router.get('/:id', async (req, res) => {
  try {
    const doctorId = req.params.id;
    
    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ message: 'Invalid doctor ID' });
    }
    
    // Get doctor with user info
    const doctor = await Doctor.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(doctorId), verified: true } },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      { $unwind: '$userDetails' },
      {
        $project: {
          _id: 1,
          userId: 1,
          specialties: 1,
          bio: 1,
          consultationFee: 1,
          experience: 1,
          availability: 1,
          education: 1,
          ratings: 1,
          acceptsInsurance: 1,
          'userDetails.firstName': 1,
          'userDetails.lastName': 1,
          'userDetails.avatarUrl': 1,
          'userDetails.languages': 1
        }
      }
    ]);
    
    if (!doctor || doctor.length === 0) {
      return res.status(404).json({ message: 'Doctor not found' });
    }
    
    res.json(doctor[0]);
  } catch (error) {
    console.error('Get doctor error:', error);
    res.status(500).json({ message: 'Server error while fetching doctor details' });
  }
});

/**
 * @swagger
 * /api/doctors/profile:
 *   post:
 *     tags:
 *       - Doctors
 *     summary: Create or update doctor profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/definitions/DoctorProfile'
 *     responses:
 *       200:
 *         description: Doctor profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Doctor'
 *       201:
 *         description: Doctor profile created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Doctor'
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/profile', verifyToken, isDoctor, [
  body('specialties').isArray().withMessage('Specialties must be an array'),
  body('bio').optional().isString().withMessage('Bio must be a string'),
  body('licenseNumber').isString().withMessage('License number is required'),
  body('consultationFee').isNumeric().withMessage('Consultation fee must be a number'),
  body('experience').optional().isNumeric().withMessage('Experience must be a number'),
  body('education').optional().isArray().withMessage('Education must be an array'),
  body('acceptsInsurance').optional().isArray().withMessage('Accepts insurance must be an array')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { 
      specialties, 
      bio, 
      licenseNumber, 
      consultationFee, 
      experience, 
      education, 
      acceptsInsurance,
      availability
    } = req.body;
    
    // Check if profile already exists
    let doctor = await Doctor.findOne({ userId: req.user.id });
    
    if (doctor) {
      // Update existing profile
      doctor.specialties = specialties || doctor.specialties;
      doctor.bio = bio || doctor.bio;
      doctor.licenseNumber = licenseNumber || doctor.licenseNumber;
      doctor.consultationFee = consultationFee || doctor.consultationFee;
      doctor.experience = experience || doctor.experience;
      doctor.education = education || doctor.education;
      doctor.acceptsInsurance = acceptsInsurance || doctor.acceptsInsurance;
      doctor.availability = availability || doctor.availability;
      doctor.updatedAt = Date.now();
    } else {
      // Create new profile
      doctor = new Doctor({
        userId: req.user.id,
        specialties,
        bio,
        licenseNumber,
        consultationFee,
        experience,
        education,
        acceptsInsurance,
        availability
      });
    }
    
    await doctor.save();
    
    res.json({
      message: doctor ? 'Doctor profile updated successfully' : 'Doctor profile created successfully',
      doctor
    });
  } catch (error) {
    console.error('Doctor profile update error:', error);
    res.status(500).json({ message: 'Server error while updating doctor profile' });
  }
});

/**
 * @swagger
 * /api/doctors/availability:
 *   post:
 *     tags:
 *       - Doctors
 *     summary: Update doctor availability
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
 *                     slots:
 *                       type: array
 *                       items:
 *                         type: object
 *                         required:
 *                           - start
 *                           - end
 *                         properties:
 *                           start:
 *                             type: string
 *                             format: time
 *                           end:
 *                             type: string
 *                             format: time
 *     responses:
 *       200:
 *         description: Availability updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/availability', verifyToken, isDoctor, [
  body('availability').isArray().withMessage('Availability must be an array')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { availability } = req.body;
    
    // Find doctor profile
    const doctor = await Doctor.findOne({ userId: req.user.id });
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor profile not found' });
    }
    
    // Update availability
    doctor.availability = availability;
    doctor.updatedAt = Date.now();
    
    await doctor.save();
    
    res.json({
      message: 'Availability updated successfully',
      availability: doctor.availability
    });
  } catch (error) {
    console.error('Doctor availability update error:', error);
    res.status(500).json({ message: 'Server error while updating doctor availability' });
  }
});

/**
 * @swagger
 * /api/doctors/profile-picture:
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
router.put('/profile-picture', verifyToken, isDoctor, upload.single('profilePicture'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    // Upload to S3
    const imageUrl = await uploadToS3(
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
});

/**
 * @swagger
 * /api/doctors/verify/{id}:
 *   put:
 *     tags:
 *       - Doctors
 *     summary: Verify a doctor (admin only)
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
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Doctor not found
 *       500:
 *         description: Server error
 */
router.put('/verify/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const doctorId = req.params.id;
    const { status } = req.body;
    
    // Validate status
    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be either verified or rejected' });
    }
    
    // Find doctor
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }
    
    // Update verification status
    doctor.verificationStatus = status;
    doctor.verified = status === 'verified';
    doctor.updatedAt = Date.now();
    
    await doctor.save();
    
    res.json({
      message: `Doctor ${status === 'verified' ? 'verified' : 'rejected'} successfully`,
      doctor
    });
  } catch (error) {
    console.error('Doctor verification error:', error);
    res.status(500).json({ message: 'Server error while verifying doctor' });
  }
});

/**
 * @swagger
 * /api/doctors/specialties:
 *   get:
 *     tags:
 *       - Doctors
 *     summary: Get all available specialties
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
router.get('/specialties', async (req, res) => {
  try {
    // Get all unique specialties from doctors
    const specialties = await Doctor.distinct('specialties');
    res.json(specialties);
  } catch (error) {
    console.error('Get specialties error:', error);
    res.status(500).json({ message: 'Server error while fetching specialties' });
  }
});

module.exports = router;
