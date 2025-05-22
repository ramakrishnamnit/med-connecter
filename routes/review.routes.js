const express = require('express');
const { body, validationResult } = require('express-validator');
const Review = require('../models/review.model');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');
const { verifyToken } = require('../middleware/auth.middleware');

const router = express.Router();

// Validation middleware
const validateReview = [
  body('doctorId').notEmpty().withMessage('Doctor ID is required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').notEmpty().withMessage('Comment is required')
];

router.post('/', verifyToken, validateReview, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Check if user is a patient
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'patient') {
      return res.status(403).json({
        error: true,
        message: 'Only patients can submit reviews'
      });
    }

    // Check if doctor exists
    const doctor = await Doctor.findById(req.body.doctorId);
    if (!doctor) {
      return res.status(404).json({
        error: true,
        message: 'Doctor not found'
      });
    }

    // Check if user has already reviewed this doctor
    const existingReview = await Review.findOne({
      doctorId: req.body.doctorId,
      patientId: req.user.id
    });

    if (existingReview) {
      return res.status(400).json({
        error: true,
        message: 'You have already reviewed this doctor. You can update your existing review.'
      });
    }

    // Create new review
    const newReview = new Review({
      doctorId: req.body.doctorId,
      patientId: req.user.id,
      appointmentId: req.body.appointmentId,
      rating: req.body.rating,
      comment: req.body.comment
    });

    const savedReview = await newReview.save();

    // Get user data to send in response
    const { firstName, lastName } = user;

    res.status(201).json({
      id: savedReview._id,
      doctorId: savedReview.doctorId,
      patientId: savedReview.patientId,
      patientName: `${firstName} ${lastName}`,
      rating: savedReview.rating,
      comment: savedReview.comment,
      createdAt: savedReview.createdAt,
      updatedAt: savedReview.updatedAt
    });
  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({
      error: true,
      message: 'Server error while creating review'
    });
  }
});

router.put('/:reviewId', verifyToken, validateReview, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Find the review
    const review = await Review.findById(req.params.reviewId);
    if (!review) {
      return res.status(404).json({
        error: true,
        message: 'Review not found'
      });
    }

    // Check ownership
    if (review.patientId.toString() !== req.user.id) {
      return res.status(403).json({
        error: true,
        message: 'You can only update your own reviews'
      });
    }

    // Update the review
    review.rating = req.body.rating;
    review.comment = req.body.comment;
    review.updatedAt = Date.now();

    const updatedReview = await review.save();
    const user = await User.findById(req.user.id);

    res.json({
      id: updatedReview._id,
      doctorId: updatedReview.doctorId,
      patientId: updatedReview.patientId,
      patientName: `${user.firstName} ${user.lastName}`,
      rating: updatedReview.rating,
      comment: updatedReview.comment,
      createdAt: updatedReview.createdAt,
      updatedAt: updatedReview.updatedAt
    });
  } catch (error) {
    console.error('Update review error:', error);
    res.status(500).json({
      error: true,
      message: 'Server error while updating review'
    });
  }
});

router.delete('/:reviewId', verifyToken, async (req, res) => {
  try {
    // Find the review
    const review = await Review.findById(req.params.reviewId);
    if (!review) {
      return res.status(404).json({
        error: true,
        message: 'Review not found'
      });
    }

    // Check ownership or admin status
    const user = await User.findById(req.user.id);
    if (review.patientId.toString() !== req.user.id && user.role !== 'admin') {
      return res.status(403).json({
        error: true,
        message: 'You can only delete your own reviews'
      });
    }

    await review.remove();
    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({
      error: true,
      message: 'Server error while deleting review'
    });
  }
});

router.get('/doctor/:doctorId', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Check if doctor exists
    const doctor = await Doctor.findById(req.params.doctorId);
    if (!doctor) {
      return res.status(404).json({
        error: true,
        message: 'Doctor not found'
      });
    }

    // Get reviews with pagination
    const reviews = await Review.find({ doctorId: req.params.doctorId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const totalReviews = await Review.countDocuments({ doctorId: req.params.doctorId });

    // Fetch user data for each review
    const reviewsWithUserData = await Promise.all(reviews.map(async (review) => {
      const user = await User.findById(review.patientId).select('firstName lastName');
      return {
        id: review._id,
        doctorId: review.doctorId,
        patientId: review.patientId,
        patientName: user ? `${user.firstName} ${user.lastName}` : 'Anonymous User',
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt
      };
    }));

    res.json({
      reviews: reviewsWithUserData,
      pageInfo: {
        currentPage: page,
        totalPages: Math.ceil(totalReviews / limit),
        totalReviews
      },
      hasMore: skip + reviews.length < totalReviews
    });
  } catch (error) {
    console.error('Get doctor reviews error:', error);
    res.status(500).json({
      error: true,
      message: 'Server error while fetching doctor reviews'
    });
  }
});

router.get('/me', verifyToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get user's reviews with pagination
    const reviews = await Review.find({ patientId: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('doctorId', 'userId');

    // Get total count for pagination
    const totalReviews = await Review.countDocuments({ patientId: req.user.id });

    // Fetch doctor and user data for each review
    const reviewsWithData = await Promise.all(reviews.map(async (review) => {
      const doctor = review.doctorId;
      const doctorUser = doctor ? await User.findById(doctor.userId).select('firstName lastName') : null;
      const patient = await User.findById(review.patientId).select('firstName lastName');
      
      return {
        id: review._id,
        doctorId: review.doctorId._id,
        doctorName: doctorUser ? `Dr. ${doctorUser.firstName} ${doctorUser.lastName}` : 'Unknown Doctor',
        patientId: review.patientId,
        patientName: patient ? `${patient.firstName} ${patient.lastName}` : 'Anonymous User',
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt
      };
    }));

    res.json({
      reviews: reviewsWithData,
      pageInfo: {
        currentPage: page,
        totalPages: Math.ceil(totalReviews / limit),
        totalReviews
      },
      hasMore: skip + reviews.length < totalReviews
    });
  } catch (error) {
    console.error('Get user reviews error:', error);
    res.status(500).json({
      error: true,
      message: 'Server error while fetching your reviews'
    });
  }
});

module.exports = router;
