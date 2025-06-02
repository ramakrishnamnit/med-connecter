const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  rejectionReason: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
reviewSchema.index({ doctorId: 1, createdAt: -1 });
reviewSchema.index({ patientId: 1, createdAt: -1 });
reviewSchema.index({ status: 1 });

// Ensure one review per appointment
reviewSchema.pre('save', async function(next) {
  if (this.isNew) {
    const existingReview = await this.constructor.findOne({ appointmentId: this.appointmentId });
    if (existingReview) {
      throw new Error('A review already exists for this appointment');
    }
  }
  next();
});

// Update the updatedAt field before saving
reviewSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for calculating average rating
reviewSchema.statics.calculateAverageRating = async function(doctorId) {
  const result = await this.aggregate([
    {
      $match: { doctorId: mongoose.Types.ObjectId(doctorId) }
    },
    {
      $group: {
        _id: '$doctorId',
        averageRating: { $avg: '$rating' },
        count: { $sum: 1 }
      }
    }
  ]);

  // Update doctor model with new rating data
  if (result.length > 0) {
    try {
      await mongoose.model('Doctor').findByIdAndUpdate(doctorId, {
        'ratings.average': result[0].averageRating,
        'ratings.count': result[0].count
      });
    } catch (error) {
      console.error('Error updating doctor ratings:', error);
    }
  }
};

// After saving a review, calculate new average rating
reviewSchema.post('save', function() {
  this.constructor.calculateAverageRating(this.doctorId);
});

// After removing a review, calculate new average rating
reviewSchema.post('remove', function() {
  this.constructor.calculateAverageRating(this.doctorId);
});

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
