const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Appointment = require('../models/appointment.model');
const Doctor = require('../models/doctor.model');
const User = require('../models/user.model');
const Chat = require('../models/chat.model');
const VideoSession = require('../models/video.model');
const { verifyToken, isDoctor } = require('../middleware/auth.middleware');
const { sendEmail, sendSMS, queueJob } = require('../services/aws.service');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Appointments
 *   description: Appointment management endpoints
 */

/**
 * @swagger
 * /api/appointments:
 *   get:
 *     tags:
 *       - Appointments
 *     summary: Get user's appointments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [scheduled, completed, cancelled]
 *         description: Filter by appointment status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [in-person, video]
 *         description: Filter by appointment type
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
 *         description: List of appointments retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 appointments:
 *                   type: array
 *                   items:
 *                     $ref: '#/definitions/Appointment'
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
 * /api/appointments:
 *   post:
 *     tags:
 *       - Appointments
 *     summary: Create a new appointment
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
 *               - date
 *               - time
 *               - type
 *             properties:
 *               doctorId:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *               time:
 *                 type: string
 *                 format: time
 *               type:
 *                 type: string
 *                 enum: [in-person, video]
 *               reason:
 *                 type: string
 *               symptoms:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Appointment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Appointment'
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Doctor not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/appointments/{id}:
 *   get:
 *     tags:
 *       - Appointments
 *     summary: Get appointment details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Appointment ID
 *     responses:
 *       200:
 *         description: Appointment details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/definitions/Appointment'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Appointment not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/appointments/{id}:
 *   put:
 *     tags:
 *       - Appointments
 *     summary: Update appointment status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Appointment ID
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
 *                 enum: [scheduled, completed, cancelled]
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Appointment status updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not authorized to update this appointment
 *       404:
 *         description: Appointment not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/appointments/{id}/reschedule:
 *   post:
 *     tags:
 *       - Appointments
 *     summary: Reschedule an appointment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Appointment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - date
 *               - time
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *               time:
 *                 type: string
 *                 format: time
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Appointment rescheduled successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not authorized to reschedule this appointment
 *       404:
 *         description: Appointment not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/appointments/{id}/notes:
 *   post:
 *     tags:
 *       - Appointments
 *     summary: Add consultation notes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Appointment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - notes
 *             properties:
 *               notes:
 *                 type: string
 *               diagnosis:
 *                 type: string
 *               prescription:
 *                 type: string
 *     responses:
 *       200:
 *         description: Consultation notes added successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not authorized to add notes
 *       404:
 *         description: Appointment not found
 *       500:
 *         description: Server error
 */

/**
 * @route POST /api/appointments
 * @desc Create a new appointment
 * @access Private
 */
router.post('/', verifyToken, [
  body('doctorId').notEmpty().withMessage('Doctor ID is required'),
  body('scheduledAt').isISO8601().withMessage('Valid appointment date is required'),
  body('mode').isIn(['video', 'in-person']).withMessage('Valid appointment mode is required'),
  body('secondOpinion').optional().isBoolean().withMessage('Second opinion must be boolean')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { doctorId, scheduledAt, mode, secondOpinion, symptoms, notes } = req.body;
    
    // Validate doctor ID
    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ message: 'Invalid doctor ID format' });
    }
    
    // Check if doctor exists and is verified
    const doctor = await Doctor.findOne({ 
      _id: doctorId,
      verified: true,
      verificationStatus: 'verified'
    });
    
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found or not verified' });
    }
    
    // Convert scheduled time to Date object
    const appointmentDate = new Date(scheduledAt);
    
    // Calculate end time (default 30 min appointment)
    const endTime = new Date(appointmentDate);
    endTime.setMinutes(endTime.getMinutes() + 30);
    
    // Check if the time slot is available
    const isTimeSlotAvailable = await checkTimeSlotAvailability(doctor, appointmentDate);
    if (!isTimeSlotAvailable) {
      return res.status(400).json({ message: 'The selected time slot is not available' });
    }
    
    // Create the appointment
    const appointment = new Appointment({
      patientId: req.user.id,
      doctorId: doctor._id,
      scheduledAt: appointmentDate,
      endTime,
      mode,
      secondOpinion: secondOpinion || false,
      symptoms: symptoms || [],
      notes: notes || ''
    });
    
    await appointment.save();
    
    // Create a chat room for the appointment
    const chat = new Chat({
      appointmentId: appointment._id,
      participants: [req.user.id, doctor.userId]
    });
    
    await chat.save();
    
    // Queue notification jobs
    await queueJob('appointment-notifications', {
      jobType: 'appointment-created',
      appointmentId: appointment._id,
      patientId: req.user.id,
      doctorId: doctor._id
    });
    
    res.status(201).json({
      message: 'Appointment created successfully. Payment required to confirm.',
      appointment
    });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ message: 'Server error while creating appointment' });
  }
});

/**
 * @route GET /api/appointments
 * @desc Get all appointments for the logged in user (patient or doctor)
 * @access Private
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const { status, from, to, page = 1, limit = 10 } = req.query;
    
    // Build query based on user role
    const user = await User.findById(req.user.id);
    let query = {};
    
    if (user.role === 'patient') {
      query.patientId = req.user.id;
    } else if (user.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: req.user.id });
      if (!doctor) {
        return res.status(404).json({ message: 'Doctor profile not found' });
      }
      query.doctorId = doctor._id;
    }
    
    // Filter by status if provided
    if (status && ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'].includes(status)) {
      query.status = status;
    }
    
    // Filter by date range if provided
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
      { $unwind: '$patient' },
      { $unwind: '$doctor' },
      { $unwind: '$doctorUser' },
      {
        $project: {
          _id: 1,
          scheduledAt: 1,
          endTime: 1,
          status: 1,
          paymentStatus: 1,
          mode: 1,
          secondOpinion: 1,
          symptoms: 1,
          notes: 1,
          createdAt: 1,
          'patient._id': 1,
          'patient.firstName': 1,
          'patient.lastName': 1,
          'patient.avatarUrl': 1,
          'doctor._id': 1,
          'doctor.specialties': 1,
          'doctor.consultationFee': 1,
          'doctorUser.firstName': 1,
          'doctorUser.lastName': 1,
          'doctorUser.avatarUrl': 1
        }
      },
      { $sort: { scheduledAt: -1 } },
      { $skip: skip },
      { $limit: Number(limit) }
    ]);
    
    // Get total count for pagination
    const totalAppointments = await Appointment.countDocuments(query);
    
    res.json({
      appointments,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(totalAppointments / Number(limit)),
      totalAppointments
    });
  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({ message: 'Server error while fetching appointments' });
  }
});

/**
 * @route GET /api/appointments/:id
 * @desc Get appointment by ID
 * @access Private
 */
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const appointmentId = req.params.id;
    
    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment ID format' });
    }
    
    // Get appointment with related info
    const appointment = await Appointment.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(appointmentId) } },
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
          endTime: 1,
          status: 1,
          paymentStatus: 1,
          mode: 1,
          secondOpinion: 1,
          symptoms: 1,
          notes: 1,
          createdAt: 1,
          'patient._id': 1,
          'patient.firstName': 1,
          'patient.lastName': 1,
          'patient.avatarUrl': 1,
          'patient.email': 1,
          'patient.phone': 1,
          'doctor._id': 1,
          'doctor.specialties': 1,
          'doctor.consultationFee': 1,
          'doctor.bio': 1,
          'doctorUser.firstName': 1,
          'doctorUser.lastName': 1,
          'doctorUser.avatarUrl': 1,
          'doctorUser.email': 1,
          payment: { $arrayElemAt: ['$payment', 0] }
        }
      }
    ]);
    
    if (!appointment || appointment.length === 0) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    
    // Check if user has access to this appointment
    const user = await User.findById(req.user.id);
    
    if (user.role === 'patient' && appointment[0].patient._id.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: Not your appointment' });
    } else if (user.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: req.user.id });
      if (!doctor || appointment[0].doctor._id.toString() !== doctor._id.toString()) {
        return res.status(403).json({ message: 'Access denied: Not your patient' });
      }
    }
    
    // Get video session if exists and appointment is upcoming
    if (appointment[0].mode === 'video' && appointment[0].status === 'confirmed') {
      const now = new Date();
      const appointmentTime = new Date(appointment[0].scheduledAt);
      const timeDiff = (appointmentTime - now) / (1000 * 60); // difference in minutes
      
      if (timeDiff <= 15 && timeDiff >= -30) {
        // Within the allowed window (15 min before to 30 min after)
        const videoSession = await VideoSession.findOne({ appointmentId: appointmentId });
        if (videoSession) {
          appointment[0].videoSession = {
            id: videoSession._id,
            roomId: videoSession.roomId,
            status: videoSession.status
          };
        }
      }
    }
    
    res.json(appointment[0]);
  } catch (error) {
    console.error('Get appointment error:', error);
    res.status(500).json({ message: 'Server error while fetching appointment details' });
  }
});

/**
 * @route PUT /api/appointments/:id/status
 * @desc Update appointment status
 * @access Private
 */
router.put('/:id/status', verifyToken, [
  body('status').isIn(['confirmed', 'cancelled', 'completed', 'no-show']).withMessage('Invalid status value')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const appointmentId = req.params.id;
    const { status } = req.body;
    
    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({ message: 'Invalid appointment ID format' });
    }
    
    // Find the appointment
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    
    // Check authorization
    const user = await User.findById(req.user.id);
    if (user.role === 'patient' && appointment.patientId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied: Not your appointment' });
    } else if (user.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: req.user.id });
      if (!doctor || appointment.doctorId.toString() !== doctor._id.toString()) {
        return res.status(403).json({ message: 'Access denied: Not your patient' });
      }
    }
    
    // Apply validations based on current status and user role
    if (status === 'cancelled') {
      // Only allow cancellation if status is pending or confirmed
      if (!['pending', 'confirmed'].includes(appointment.status)) {
        return res.status(400).json({
          message: `Cannot cancel an appointment that is already ${appointment.status}`
        });
      }
    } else if (status === 'completed' || status === 'no-show') {
      // Only doctors can mark as completed or no-show
      if (user.role !== 'doctor') {
        return res.status(403).json({
          message: `Only doctors can mark appointments as ${status}`
        });
      }
      // Can only mark confirmed appointments
      if (appointment.status !== 'confirmed') {
        return res.status(400).json({
          message: `Cannot mark as ${status} when status is ${appointment.status}`
        });
      }
    }
    
    // Update the status
    appointment.status = status;
    appointment.updatedAt = Date.now();
    
    await appointment.save();
    
    // Queue notification for status update
    await queueJob('appointment-notifications', {
      jobType: 'appointment-status-changed',
      appointmentId: appointment._id,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      status
    });
    
    res.json({
      message: `Appointment status updated to ${status}`,
      appointment
    });
  } catch (error) {
    console.error('Update appointment status error:', error);
    res.status(500).json({ message: 'Server error while updating appointment status' });
  }
});

/**
 * @route PUT /api/appointments/:id/notes
 * @desc Update appointment notes (doctor only)
 * @access Private (Doctor only)
 */
router.put('/:id/notes', verifyToken, isDoctor, [
  body('notes').notEmpty().withMessage('Notes cannot be empty')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const appointmentId = req.params.id;
    const { notes } = req.body;
    
    // Find the doctor profile
    const doctor = await Doctor.findOne({ userId: req.user.id });
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor profile not found' });
    }
    
    // Find the appointment
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      doctorId: doctor._id
    });
    
    if (!appointment) {
      return res.status(404).json({
        message: 'Appointment not found or you do not have permission'
      });
    }
    
    // Update notes
    appointment.notes = notes;
    appointment.updatedAt = Date.now();
    
    await appointment.save();
    
    res.json({
      message: 'Appointment notes updated successfully',
      appointment
    });
  } catch (error) {
    console.error('Update appointment notes error:', error);
    res.status(500).json({ message: 'Server error while updating appointment notes' });
  }
});

// Helper function to check time slot availability
async function checkTimeSlotAvailability(doctor, appointmentTime) {
  const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][appointmentTime.getDay()];
  const time = appointmentTime.getHours() + ':' + (appointmentTime.getMinutes() < 10 ? '0' : '') + appointmentTime.getMinutes();
  
  // Check if day is in doctor's availability
  const daySchedule = doctor.availability.find(schedule => schedule.day === day);
  if (!daySchedule) return false;
  
  // Check if time is within any slot
  const isTimeInSlot = daySchedule.slots.some(slot => {
    const [startHour, startMinute] = slot.start.split(':').map(Number);
    const [endHour, endMinute] = slot.end.split(':').map(Number);
    
    const slotStart = new Date(appointmentTime);
    slotStart.setHours(startHour, startMinute, 0, 0);
    
    const slotEnd = new Date(appointmentTime);
    slotEnd.setHours(endHour, endMinute, 0, 0);
    
    return appointmentTime >= slotStart && appointmentTime < slotEnd && !slot.isBooked;
  });
  
  if (!isTimeInSlot) return false;
  
  // Check for existing appointments at this time
  const appointmentEnd = new Date(appointmentTime);
  appointmentEnd.setMinutes(appointmentEnd.getMinutes() + 30);
  
  const existingAppointment = await Appointment.findOne({
    doctorId: doctor._id,
    status: { $nin: ['cancelled'] },
    $or: [
      // New appointment starts during an existing one
      {
        scheduledAt: { $lte: appointmentTime },
        endTime: { $gt: appointmentTime }
      },
      // New appointment ends during an existing one
      {
        scheduledAt: { $lt: appointmentEnd },
        endTime: { $gte: appointmentEnd }
      },
      // New appointment fully contains an existing one
      {
        scheduledAt: { $gte: appointmentTime },
        endTime: { $lte: appointmentEnd }
      }
    ]
  });
  
  return !existingAppointment;
}

module.exports = router;
