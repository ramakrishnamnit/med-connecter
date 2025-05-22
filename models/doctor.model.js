
const mongoose = require('mongoose');

const availabilitySchema = new mongoose.Schema({
  day: {
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    required: true
  },
  slots: [{
    start: {
      type: String,
      required: true
    },
    end: {
      type: String,
      required: true
    },
    isBooked: {
      type: Boolean,
      default: false
    }
  }]
});

const doctorSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  specialties: {
    type: [String],
    required: true
  },
  bio: {
    type: String
  },
  licenseNumber: {
    type: String,
    required: true,
    unique: true
  },
  verified: {
    type: Boolean,
    default: false
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  consultationFee: {
    type: Number,
    required: true
  },
  experience: {
    type: Number, // in years
    default: 0
  },
  availability: {
    type: [availabilitySchema],
    default: []
  },
  education: [{
    degree: String,
    institution: String,
    year: Number
  }],
  ratings: {
    average: {
      type: Number,
      default: 0
    },
    count: {
      type: Number,
      default: 0
    }
  },
  acceptsInsurance: {
    type: [String],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Doctor', doctorSchema);
