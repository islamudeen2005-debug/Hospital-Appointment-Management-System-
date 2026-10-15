const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isValidImageValue = (value) => {
  if (typeof value !== 'string') return false;

  const trimmedValue = value.trim();
  if (!trimmedValue) return true;

  return (
    trimmedValue.startsWith('/') ||
    trimmedValue.startsWith('data:image/') ||
    /^https?:\/\//i.test(trimmedValue)
  );
};

const sanitizeUser = (user) => {
  if (!user) return null;
  const userObject = user.toObject ? user.toObject() : user;
  const { password, ...safeUser } = userObject;
  return safeUser;
};

const getDoctors = async (req, res) => {
  try {
    const { search, specialization, city, minFee, maxFee } = req.query;
    const filter = {};

    if (specialization) {
      filter.specialization = { $regex: escapeRegex(String(specialization)), $options: 'i' };
    }
    if (city) {
      filter.city = { $regex: escapeRegex(String(city)), $options: 'i' };
    }
    if (minFee !== undefined || maxFee !== undefined) {
      filter.fee = {};
      if (minFee !== undefined && minFee !== '') {
        filter.fee.$gte = Number(minFee);
      }
      if (maxFee !== undefined && maxFee !== '') {
        filter.fee.$lte = Number(maxFee);
      }
    }
    if (req.user?.role !== 'admin' || req.query.activeOnly === 'true') {
      filter.isActive = { $ne: false };
    }

    let doctors = await Doctor.find(filter)
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 });

    if (search) {
      const term = new RegExp(escapeRegex(String(search)), 'i');
      doctors = doctors.filter((doctor) =>
        term.test(doctor.user?.name || '')
        || term.test(doctor.specialization || '')
        || term.test(doctor.city || '')
        || term.test(doctor.qualification || '')
      );
    }

    const formattedDoctors = doctors.map((doctor) => ({
      ...doctor.toObject(),
      user: sanitizeUser(doctor.user),
    }));

    return res.json(formattedDoctors);
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to fetch doctors.' });
  }
};

const getDoctorById = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id).populate('user', 'name email phone');

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found.' });
    }
    if (doctor.isActive === false && req.user?.role !== 'admin') {
      return res.status(404).json({ message: 'Doctor not found.' });
    }

    return res.json({
      ...doctor.toObject(),
      user: sanitizeUser(doctor.user),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to fetch doctor.' });
  }
};

const createDoctor = async (req, res) => {
  try {
    const {
      name, email, password, phone, specialization, image, experience, fee, availableSlots,
      qualification, department, city, availableDays, biography,
    } = req.body;

    if (!name || !email || !password || !specialization || fee === undefined || fee === null || fee === '') {
      return res.status(400).json({ message: 'Name, email, password, specialization and fee are required.' });
    }
    if (city !== undefined && String(city).trim() === '') {
      return res.status(400).json({ message: 'City is required for doctor profiles.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'A valid email address is required.' });
    }
    if (Number(experience || 0) < 0 || Number(fee) < 0 || Number.isNaN(Number(fee))) {
      return res.status(400).json({ message: 'Experience and consultation fee must be valid non-negative numbers.' });
    }
    if (image && !isValidImageValue(image)) {
      return res.status(400).json({ message: 'Profile image must be a valid local image path, data URL, or HTTP/HTTPS URL.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'A user with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      phone,
      role: 'doctor',
    });

    let doctor;
    try {
      doctor = await Doctor.create({
        user: user._id,
        specialization,
        image: image || '',
        qualification: qualification || '',
        department: department || '',
        city: city || '',
        biography: biography || '',
        availableDays: Array.isArray(availableDays) ? availableDays : [],
        experience: Number(experience) || 0,
        fee: Number(fee),
        availableSlots: Array.isArray(availableSlots) ? availableSlots : undefined,
      });
    } catch (error) {
      await User.findByIdAndDelete(user._id);
      throw error;
    }

    const populatedDoctor = await Doctor.findById(doctor._id).populate('user', 'name email phone');

    return res.status(201).json({
      message: 'Doctor created successfully.',
      doctor: {
        ...populatedDoctor.toObject(),
        user: sanitizeUser(populatedDoctor.user),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to create doctor.' });
  }
};

const updateDoctor = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id).populate('user', 'name email phone');

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found.' });
    }

    const {
      name, email, phone, specialization, image, experience, fee, availableSlots,
      qualification, department, city, availableDays, biography, isActive,
    } = req.body;

    if (name) doctor.user.name = name;
    if (phone !== undefined) doctor.user.phone = phone;
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: 'A valid email address is required.' });
      }
      const emailExists = await User.findOne({ email: email.toLowerCase(), _id: { $ne: doctor.user._id } });
      if (emailExists) {
        return res.status(400).json({ message: 'Another user with this email already exists.' });
      }
      doctor.user.email = email.toLowerCase();
    }

    if (specialization) doctor.specialization = specialization;
    if (image !== undefined) {
      if (image && !isValidImageValue(image)) {
        return res.status(400).json({ message: 'Profile image must be a valid local image path, data URL, or HTTP/HTTPS URL.' });
      }
      doctor.image = image || '';
    }
    if (experience !== undefined) {
      if (!Number.isFinite(Number(experience)) || Number(experience) < 0) {
        return res.status(400).json({ message: 'Experience must be a valid non-negative number.' });
      }
      doctor.experience = Number(experience);
    }
    if (fee !== undefined) {
      if (!Number.isFinite(Number(fee)) || Number(fee) < 0) {
        return res.status(400).json({ message: 'Consultation fee must be a valid non-negative number.' });
      }
      doctor.fee = Number(fee);
    }
    if (qualification !== undefined) doctor.qualification = qualification;
    if (department !== undefined) doctor.department = department;
    if (city !== undefined) doctor.city = city || '';
    if (biography !== undefined) doctor.biography = biography;
    if (Array.isArray(availableDays)) doctor.availableDays = availableDays;
    if (Array.isArray(availableSlots)) doctor.availableSlots = availableSlots;
    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ message: 'isActive must be a boolean.' });
      }
      doctor.isActive = isActive;
    }

    await doctor.user.save();
    await doctor.save();

    return res.json({
      message: 'Doctor updated successfully.',
      doctor: {
        ...doctor.toObject(),
        user: sanitizeUser(doctor.user),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to update doctor.' });
  }
};

const deleteDoctor = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id).populate('user', 'name email phone');

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found.' });
    }

    doctor.isActive = false;
    await doctor.save();
    await Appointment.updateMany(
      { doctor: doctor._id, status: { $in: ['pending', 'confirmed'] } },
      { $set: { status: 'cancelled' } }
    );

    return res.json({ message: 'Doctor deactivated successfully.', doctorId: doctor._id });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to delete doctor.' });
  }
};

const getDoctorSlots = async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    if (!date) {
      const doctor = await Doctor.findById(id);
      if (!doctor) {
        return res.status(404).json({ message: 'Doctor not found.' });
      }
      if (doctor.isActive === false) {
        return res.status(404).json({ message: 'Doctor is not currently accepting appointments.' });
      }
      return res.json({ slots: doctor.availableSlots || [] });
    }

    const doctor = await Doctor.findById(id);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found.' });
    }
    if (doctor.isActive === false) {
      return res.status(404).json({ message: 'Doctor is not currently accepting appointments.' });
    }

    const selectedDate = new Date(date);
    if (Number.isNaN(selectedDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date provided.' });
    }
    const selectedDay = selectedDate.toLocaleDateString('en-US', { weekday: 'long' });
    if (doctor.availableDays.length && !doctor.availableDays.includes(selectedDay)) {
      return res.json({ date: selectedDate.toISOString(), slots: [] });
    }

    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);

    const bookedAppointments = await Appointment.find({
      doctor: id,
      date: { $gte: start, $lte: end },
      status: { $ne: 'cancelled' },
    }).select('timeSlot');

    const bookedSlots = new Set(bookedAppointments.map((appointment) => appointment.timeSlot));
    const availableSlots = (doctor.availableSlots || []).filter((slot) => !bookedSlots.has(slot));

    return res.json({ date: selectedDate.toISOString(), slots: availableSlots });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to fetch doctor slots.' });
  }
};

module.exports = {
  getDoctors,
  getDoctorById,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  getDoctorSlots,
};
