const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');
const Appointment = require('../models/appointment.model');
const Payment = require('../models/payment.model');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin management endpoints
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     AdminStats:
 *       type: object
 *       properties:
 *         totalUsers:
 *           type: integer
 *         totalDoctors:
 *           type: integer
 *         totalAppointments:
 *           type: integer
 *         totalRevenue:
 *           type: number
 *         recentRegistrations:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/User'
 *         pendingVerifications:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Doctor'
 */

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get admin dashboard statistics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminStats'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Server error
 */

/**
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [patient, doctor, admin]
 *         description: Filter by user role
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, suspended]
 *         description: Filter by user status
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
 *         description: Users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/definitions/User'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 pages:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/admin/users/{id}:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get user details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/User'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/admin/users/{id}:
 *   put:
 *     tags:
 *       - Admin
 *     summary: Update user status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
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
 *                 enum: [active, inactive, suspended]
 *     responses:
 *       200:
 *         description: User status updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/admin/doctors:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get all doctors
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, verified, rejected]
 *         description: Filter by verification status
 *       - in: query
 *         name: specialty
 *         schema:
 *           type: string
 *         description: Filter by specialty
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
 *         description: Doctors retrieved successfully
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
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/admin/doctors/{id}/verify:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Verify a doctor
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Doctor ID
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
 *                 enum: [verified, rejected]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Doctor verification status updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Doctor not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/admin/reports:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get system reports
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [users, appointments, payments, reviews]
 *         description: Report type
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for report
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for report
 *     responses:
 *       200:
 *         description: Reports retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                 summary:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 *       500:
 *         description: Server error
 */

/**
 * @route GET /api/admin/doctors
 * @desc Get all doctors with filter options
 * @access Private (Admin only)
 */
router.get('/doctors', async (req, res) => {
  try {
    const { 
      verificationStatus, 
      specialty, 
      name,
      page = 1, 
      limit = 10 
    } = req.query;
    
    // Build query for doctors
    let doctorQuery = {};
    
    // Filter by verification status
    if (verificationStatus && ['pending', 'verified', 'rejected'].includes(verificationStatus)) {
      doctorQuery.verificationStatus = verificationStatus;
    }
    
    // Filter by specialty
    if (specialty) {
      doctorQuery.specialties = { $in: specialty.split(',') };
    }
    
    // If name is provided, first find matching users
    let userIds = [];
    if (name) {
      const nameRegex = new RegExp(name, 'i');
      const users = await User.find({
        $or: [
          { firstName: nameRegex },
          { lastName: nameRegex }
        ],
        role: 'doctor'
      }).select('_id');
      
      userIds = users.map(u => u._id);
      doctorQuery.userId = { $in: userIds };
    }
    
    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit);
    
    // Get doctors with user details
    const doctors = await Doctor.aggregate([
      { $match: doctorQuery },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 1,
          userId: 1,
          specialties: 1,
          bio: 1,
          licenseNumber: 1,
          verified: 1,
          verificationStatus: 1,
          consultationFee: 1,
          experience: 1,
          education: 1,
          createdAt: 1,
          'user.firstName': 1,
          'user.lastName': 1,
          'user.email': 1,
          'user.phone': 1,
          'user.avatarUrl': 1
        }
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: Number(limit) }
    ]);
    
    // Get total count
    const totalDoctors = await Doctor.countDocuments(doctorQuery);
    
    res.json({
      doctors,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(totalDoctors / Number(limit)),
      totalDoctors
    });
  } catch (error) {
    console.error('Admin get doctors error:', error);
    res.status(500).json({ message: 'Server error retrieving doctors' });
  }
});

/**
 * @route GET /api/admin/doctors/:id
 * @desc Get specific doctor details
 * @access Private (Admin only)
 */
router.get('/doctors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate doctor ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid doctor ID format' });
    }
    
    // Get doctor with user details
    const doctor = await Doctor.findById(id).populate('userId', 'firstName lastName email phone avatarUrl');
    
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }
    
    res.json(doctor);
  } catch (error) {
    console.error('Admin get doctor error:', error);
    res.status(500).json({ message: 'Server error retrieving doctor details' });
  }
});

/**
 * @route PUT /api/admin/doctors/:id/verify
 * @desc Verify a doctor
 * @access Private (Admin only)
 */
router.put('/doctors/:id/verify', [
  body('status').isIn(['verified', 'rejected']).withMessage('Status must be either verified or rejected'),
  body('notes').optional().isString().withMessage('Notes must be a string')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    // Validate doctor ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid doctor ID format' });
    }
    
    // Find the doctor
    const doctor = await Doctor.findById(id);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }
    
    // Update verification status
    doctor.verificationStatus = status;
    doctor.verified = status === 'verified';
    doctor.verificationNotes = notes;
    doctor.updatedAt = Date.now();
    
    await doctor.save();
    
    // Get the user for notification
    const user = await User.findById(doctor.userId);
    
    // Send notification about verification status
    if (user) {
      // In production, we would send email/notification here
      console.log(`Doctor ${user.firstName} ${user.lastName} (${user.email}) verification status updated to ${status}`);
    }
    
    res.json({
      message: `Doctor verification status updated to ${status}`,
      doctor
    });
  } catch (error) {
    console.error('Admin verify doctor error:', error);
    res.status(500).json({ message: 'Server error updating doctor verification' });
  }
});

/**
 * @route GET /api/admin/dashboard
 * @desc Get admin dashboard statistics
 * @access Private (Admin only)
 */
router.get('/dashboard', async (req, res) => {
  try {
    // Get date range for filtering
    const { startDate, endDate } = req.query;
    let dateFilter = {};
    
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }
    
    // Stats collection - using aggregation and Promise.all for parallel execution
    const [
      totalDoctors,
      pendingDoctors,
      totalAppointments,
      totalPatients,
      appointmentStats,
      revenueStats
    ] = await Promise.all([
      Doctor.countDocuments({ verified: true }),
      Doctor.countDocuments({ verificationStatus: 'pending' }),
      Appointment.countDocuments(dateFilter),
      User.countDocuments({ role: 'patient', ...dateFilter }),
      Appointment.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      Payment.aggregate([
        { $match: { status: 'success', ...dateFilter } },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ])
    ]);
    
    // Format appointment stats
    const appointmentByStatus = {};
    appointmentStats.forEach(item => {
      appointmentByStatus[item._id] = item.count;
    });
    
    const revenue = revenueStats.length > 0 ? revenueStats[0].totalAmount : 0;
    const successfulPayments = revenueStats.length > 0 ? revenueStats[0].count : 0;
    
    res.json({
      doctors: {
        total: totalDoctors,
        pending: pendingDoctors
      },
      appointments: {
        total: totalAppointments,
        byStatus: appointmentByStatus
      },
      patients: totalPatients,
      payments: {
        successful: successfulPayments,
        revenue
      }
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ message: 'Server error retrieving dashboard statistics' });
  }
});

/**
 * @route GET /api/admin/appointments
 * @desc Get all appointments with filter options
 * @access Private (Admin only)
 */
router.get('/appointments', async (req, res) => {
  try {
    const { 
      status, 
      from, 
      to,
      page = 1, 
      limit = 10 
    } = req.query;
    
    // Build query
    let query = {};
    
    // Filter by status
    if (status && ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'].includes(status)) {
      query.status = status;
    }
    
    // Filter by date range
    if (from || to) {
      query.scheduledAt = {};
      if (from) query.scheduledAt.$gte = new Date(from);
      if (to) query.scheduledAt.$lte = new Date(to);
    }
    
    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit);
    
    // Get appointments with patient/doctor info
    const appointments = await Appointment.aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'users',
          localField: 'patientId',
          foreignField: '_id',
          as: 'patient'
        }
      },
      {
        $lookup: {
          from: 'doctors',
          localField: 'doctorId',
          foreignField: '_id',
          as: 'doctor'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'doctor.userId',
          foreignField: '_id',
          as: 'doctorUser'
        }
      },
      {
        $lookup: {
          from: 'payments',
          localField: '_id',
          foreignField: 'appointmentId',
          as: 'payment'
        }
      },
      { $unwind: '$patient' },
      { $unwind: '$doctor' },
      { $unwind: '$doctorUser' },
      {
        $project: {
          _id: 1,
          scheduledAt: 1,
          status: 1,
          paymentStatus: 1,
          mode: 1,
          secondOpinion: 1,
          createdAt: 1,
          'patient._id': 1,
          'patient.firstName': 1,
          'patient.lastName': 1,
          'patient.email': 1,
          'doctor._id': 1,
          'doctor.specialties': 1,
          'doctor.consultationFee': 1,
          'doctorUser.firstName': 1,
          'doctorUser.lastName': 1,
          'doctorUser.email': 1,
          payment: { $arrayElemAt: ['$payment', 0] }
        }
      },
      { $sort: { scheduledAt: -1 } },
      { $skip: skip },
      { $limit: Number(limit) }
    ]);
    
    // Get total count
    const totalAppointments = await Appointment.countDocuments(query);
    
    res.json({
      appointments,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(totalAppointments / Number(limit)),
      totalAppointments
    });
  } catch (error) {
    console.error('Admin get appointments error:', error);
    res.status(500).json({ message: 'Server error retrieving appointments' });
  }
});

/**
 * @route GET /api/admin/patients
 * @desc Get all patients
 * @access Private (Admin only)
 */
router.get('/patients', async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    
    // Build query
    let query = { role: 'patient' };
    
    // Add search if provided
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex }
      ];
    }
    
    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit);
    
    // Get patients
    const patients = await User.find(query)
      .select('firstName lastName email phone avatarUrl createdAt lastLogin')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));
    
    // Get total count
    const totalPatients = await User.countDocuments(query);
    
    res.json({
      patients,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(totalPatients / Number(limit)),
      totalPatients
    });
  } catch (error) {
    console.error('Admin get patients error:', error);
    res.status(500).json({ message: 'Server error retrieving patients' });
  }
});

module.exports = router;
