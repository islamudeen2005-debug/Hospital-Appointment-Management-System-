const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const User = require('../models/User');

const getDoctorForUser = async (userId) => {
  return Doctor.findOne({ user: userId });
};

const isVisibleToUser = (appointment, user) => {
  if (!appointment) return false;

  if (user.role === 'admin') return true;
  if (user.role === 'patient') {
    const patientId = appointment.patient?._id || appointment.patient;
    return patientId?.toString() === user._id.toString();
  }
  if (user.role === 'doctor') {
    const doctorUser = appointment.doctor?.user?._id || appointment.doctor?.user;
    return doctorUser?.toString() === user._id.toString();
  }

  return false;
};

const buildAppointmentQuery = async (user, query = {}) => {
  const baseQuery = { ...query };

  if (user.role === 'patient') {
    baseQuery.patient = user._id;
  }

  if (user.role === 'doctor') {
    const doctorProfile = await getDoctorForUser(user._id);
    if (!doctorProfile) {
      return { patient: null, doctor: null, __empty: true };
    }
    baseQuery.doctor = doctorProfile._id;
  }

  return baseQuery;
};

const getAppointments = async (req, res) => {
  try {
    const { status, doctorId, patientId, dateFrom, dateTo } = req.query;
    const baseQuery = await buildAppointmentQuery(req.user, {});

    if (baseQuery.__empty) {
      return res.json({ appointments: [] });
    }

    if (status) baseQuery.status = status;
    if (doctorId && req.user.role === 'admin') baseQuery.doctor = doctorId;
    if (patientId && req.user.role === 'admin') baseQuery.patient = patientId;

    if (dateFrom || dateTo) {
      baseQuery.date = {};
      if (dateFrom) {
        baseQuery.date.$gte = new Date(dateFrom);
        if (Number.isNaN(baseQuery.date.$gte.getTime())) {
          return res.status(400).json({ message: 'Invalid start date filter.' });
        }
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        if (Number.isNaN(endDate.getTime())) {
          return res.status(400).json({ message: 'Invalid end date filter.' });
        }
        endDate.setHours(23, 59, 59, 999);
        baseQuery.date.$lte = endDate;
      }
    }

    const appointments = await Appointment.find(baseQuery)
      .sort({ date: 1, createdAt: -1 })
      .populate('patient', 'name email phone')
      .populate({
        path: 'doctor',
        populate: { path: 'user', select: 'name email phone' },
      });

    return res.json({ appointments });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to fetch appointments.' });
  }
};

const getAppointmentById = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate('patient', 'name email phone')
      .populate({
        path: 'doctor',
        populate: { path: 'user', select: 'name email phone' },
      });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    if (!isVisibleToUser(appointment, req.user)) {
      return res.status(403).json({ message: 'You are not allowed to view this appointment.' });
    }

    return res.json({ appointment });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to fetch appointment.' });
  }
};

const createAppointment = async (req, res) => {
  try {
    const { doctorId, date, timeSlot } = req.body;

    if (!doctorId || !date || !timeSlot) {
      return res.status(400).json({ message: 'Doctor, date and time slot are required.' });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found.' });
    }
    if (doctor.isActive === false) {
      return res.status(400).json({ message: 'This doctor is not currently accepting appointments.' });
    }

    const selectedDate = new Date(date);
    if (Number.isNaN(selectedDate.getTime())) {
      return res.status(400).json({ message: 'Invalid appointment date.' });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (selectedDate < todayStart) {
      return res.status(400).json({ message: 'Appointments cannot be scheduled in the past.' });
    }

    const selectedDay = selectedDate.toLocaleDateString('en-US', { weekday: 'long' });
    if (doctor.availableDays.length && !doctor.availableDays.includes(selectedDay)) {
      return res.status(400).json({ message: `This doctor is not available on ${selectedDay}.` });
    }

    if (!doctor.availableSlots.includes(timeSlot)) {
      return res.status(400).json({ message: 'Selected time slot is not available for this doctor.' });
    }

    const existingAppointment = await Appointment.findOne({
      doctor: doctorId,
      date: selectedDate,
      timeSlot,
      status: { $ne: 'cancelled' },
    });

    if (existingAppointment) {
      return res.status(409).json({ message: 'This time slot has already been booked.' });
    }

    const appointment = await Appointment.create({
      patient: req.user._id,
      doctor: doctorId,
      date: selectedDate,
      timeSlot,
      status: 'pending',
      fee: Number(doctor.fee) || 0,
      currency: 'INR',
    });

    const populatedAppointment = await Appointment.findById(appointment._id)
      .populate('patient', 'name email phone')
      .populate({
        path: 'doctor',
        populate: { path: 'user', select: 'name email phone' },
      });

    return res.status(201).json({
      message: 'Appointment booked successfully.',
      appointment: populatedAppointment,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This appointment slot is no longer available.' });
    }
    return res.status(500).json({ message: error.message || 'Appointment booking failed.' });
  }
};

const updateAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    if (req.user.role === 'admin') {
      // admin can update any appointment
    } else if (req.user.role === 'patient' && appointment.patient.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You are not allowed to update this appointment.' });
    } else if (req.user.role === 'doctor') {
      const doctorProfile = await getDoctorForUser(req.user._id);
      if (!doctorProfile || appointment.doctor.toString() !== doctorProfile._id.toString()) {
        return res.status(403).json({ message: 'You can only update your own appointments.' });
      }
    }

    const { date, timeSlot } = req.body;

    if (appointment.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending appointments can be rescheduled.' });
    }

    if (date) {
      const selectedDate = new Date(date);
      if (Number.isNaN(selectedDate.getTime())) {
        return res.status(400).json({ message: 'Invalid appointment date.' });
      }
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      if (selectedDate < todayStart) {
        return res.status(400).json({ message: 'Appointments cannot be scheduled in the past.' });
      }
      appointment.date = selectedDate;
    }

    if (timeSlot) {
      const doctor = await Doctor.findById(appointment.doctor);
      if (!doctor || doctor.isActive === false) {
        return res.status(400).json({ message: 'This doctor is not currently accepting appointments.' });
      }
      if (!doctor.availableSlots.includes(timeSlot)) {
        return res.status(400).json({ message: 'Selected time slot is not available for this doctor.' });
      }
      appointment.timeSlot = timeSlot;
    }

    const duplicateAppointment = await Appointment.findOne({
      _id: { $ne: appointment._id },
      doctor: appointment.doctor,
      date: appointment.date,
      timeSlot: appointment.timeSlot,
      status: { $ne: 'cancelled' },
    });

    if (duplicateAppointment) {
      return res.status(409).json({ message: 'This appointment slot is no longer available.' });
    }

    await appointment.save();

    const populatedAppointment = await Appointment.findById(appointment._id)
      .populate('patient', 'name email phone')
      .populate({
        path: 'doctor',
        populate: { path: 'user', select: 'name email phone' },
      });

    return res.json({
      message: 'Appointment updated successfully.',
      appointment: populatedAppointment,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to update appointment.' });
  }
};

const deleteAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    if (req.user.role === 'patient' && appointment.patient.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You are not allowed to cancel this appointment.' });
    }

    if (req.user.role === 'doctor') {
      const doctorProfile = await getDoctorForUser(req.user._id);
      if (!doctorProfile || appointment.doctor.toString() !== doctorProfile._id.toString()) {
        return res.status(403).json({ message: 'You can only cancel your own appointments.' });
      }
    }

    if (appointment.status === 'completed' || appointment.status === 'cancelled') {
      return res.status(400).json({ message: 'This appointment cannot be cancelled.' });
    }

    appointment.status = 'cancelled';
    await appointment.save();

    return res.json({ message: 'Appointment cancelled successfully.', appointment });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to cancel appointment.' });
  }
};

const getMyAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find({ patient: req.user._id })
      .sort({ date: 1, createdAt: -1 })
      .populate('patient', 'name email phone')
      .populate({
        path: 'doctor',
        populate: { path: 'user', select: 'name email phone' },
      });

    return res.json({ appointments });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to fetch appointment history.' });
  }
};

const updateAppointmentStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    const allowedStatusTransitions = {
      pending: ['confirmed', 'cancelled', 'rejected'],
      confirmed: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    if (req.user.role === 'patient') {
      if (appointment.patient.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'You are not allowed to update this appointment.' });
      }
      if (status !== 'cancelled') {
        return res.status(400).json({ message: 'Patients can only cancel an appointment.' });
      }
    }

    if (req.user.role === 'doctor') {
      const doctorProfile = await getDoctorForUser(req.user._id);
      if (!doctorProfile || appointment.doctor.toString() !== doctorProfile._id.toString()) {
        return res.status(403).json({ message: 'You can only update your own appointments.' });
      }
    }

    if (req.user.role === 'admin') {
      if (!['pending', 'confirmed', 'completed', 'cancelled', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'Invalid appointment status.' });
      }
    } else if (status === 'rejected') {
      return res.status(403).json({ message: 'Only an admin can reject an appointment.' });
    } else if (!allowedStatusTransitions[appointment.status]?.includes(status)) {
      return res.status(400).json({ message: `Status cannot change from ${appointment.status} to ${status}.` });
    }

    appointment.status = status;
    await appointment.save();

    const populatedAppointment = await Appointment.findById(appointment._id)
      .populate('patient', 'name email phone')
      .populate({
        path: 'doctor',
        populate: { path: 'user', select: 'name email phone' },
      });

    return res.json({
      message: 'Appointment status updated successfully.',
      appointment: populatedAppointment,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to update appointment status.' });
  }
};

module.exports = {
  getAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  getMyAppointments,
  updateAppointmentStatus,
};
