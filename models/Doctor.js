const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    specialization: {
      type: String,
      required: [true, 'Specialization is required'],
      trim: true,
    },
    image: {
      type: String,
      trim: true,
      default: '',
    },
    qualification: {
      type: String,
      trim: true,
      default: '',
    },
    department: {
      type: String,
      trim: true,
      default: '',
    },
    city: {
      type: String,
      trim: true,
      default: '',
    },
    availableDays: {
      type: [String],
      default: [],
    },
    biography: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    experience: {
      type: Number,
      default: 0,
      min: 0,
    },
    fee: {
      type: Number,
      required: [true, 'Consultation fee is required'],
      min: 0,
    },
    availableSlots: {
      type: [String],
      default: ['09:00 AM', '10:00 AM', '11:00 AM', '01:00 PM', '03:00 PM', '04:00 PM'],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Doctor', doctorSchema);
