const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const User = require('../models/User');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getDashboard = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const firstMonth = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const firstDay = new Date(todayStart);
    firstDay.setDate(firstDay.getDate() - 6);

    const [
      totalDoctors,
      totalPatients,
      totalAppointments,
      todayAppointments,
      pendingAppointments,
      confirmedAppointments,
      completedAppointments,
      cancelledAppointments,
      rejectedAppointments,
      monthlyCounts,
      dailyCounts,
      doctorCounts,
      recentAppointments,
    ] = await Promise.all([
      Doctor.countDocuments(),
      User.countDocuments({ role: 'patient' }),
      Appointment.countDocuments(),
      Appointment.countDocuments({ date: { $gte: todayStart, $lt: tomorrowStart } }),
      Appointment.countDocuments({ status: 'pending' }),
      Appointment.countDocuments({ status: 'confirmed' }),
      Appointment.countDocuments({ status: 'completed' }),
      Appointment.countDocuments({ status: 'cancelled' }),
      Appointment.countDocuments({ status: 'rejected' }),
      Appointment.aggregate([
        { $match: { date: { $gte: firstMonth, $lt: nextMonth } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
            count: { $sum: 1 },
          },
        },
      ]),
      Appointment.aggregate([
        { $match: { date: { $gte: firstDay, $lt: tomorrowStart } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$date',
                timezone: 'Asia/Kolkata',
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      Appointment.aggregate([
        {
          $group: {
            _id: '$doctor',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      Appointment.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('patient', 'name email phone')
        .populate({
          path: 'doctor',
          select: 'image specialization city fee',
          populate: { path: 'user', select: 'name' },
        }),
    ]);

    const countByMonth = new Map(monthlyCounts.map(({ _id, count }) => [_id, count]));
    const monthlyAppointments = [];
    for (let offset = 0; offset < 12; offset += 1) {
      const month = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + offset, 1);
      const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      monthlyAppointments.push({ month: key, count: countByMonth.get(key) || 0 });
    }

    const countByDay = new Map(dailyCounts.map(({ _id, count }) => [_id, count]));
    const dailyAppointments = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const day = new Date(firstDay);
      day.setDate(firstDay.getDate() + offset);
      const key = [
        day.getFullYear(),
        String(day.getMonth() + 1).padStart(2, '0'),
        String(day.getDate()).padStart(2, '0'),
      ].join('-');
      dailyAppointments.push({ date: key, count: countByDay.get(key) || 0 });
    }

    const doctors = await Doctor.find({
      _id: { $in: doctorCounts.map(({ _id }) => _id).filter(Boolean) },
    })
      .select('image specialization')
      .populate('user', 'name');
    const doctorsById = new Map(doctors.map((doctor) => [doctor._id.toString(), doctor]));
    const doctorAppointments = doctorCounts.map(({ _id, count }) => {
      const doctor = doctorsById.get(_id.toString());
      return {
        doctorId: _id,
        name: doctor?.user?.name || 'Doctor profile unavailable',
        image: doctor?.image || '',
        specialization: doctor?.specialization || '',
        count,
      };
    });

    return res.json({
      statistics: {
        totalDoctors,
        totalPatients,
        totalAppointments,
        todayAppointments,
        pendingAppointments,
        confirmedAppointments,
        completedAppointments,
        cancelledAppointments,
        rejectedAppointments,
      },
      appointmentStatusCounts: [
        { status: 'pending', count: pendingAppointments },
        { status: 'confirmed', count: confirmedAppointments },
        { status: 'completed', count: completedAppointments },
        { status: 'cancelled', count: cancelledAppointments },
        { status: 'rejected', count: rejectedAppointments },
      ],
      dailyAppointments,
      monthlyAppointments,
      doctorAppointments,
      recentAppointments,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to load admin dashboard.' });
  }
};

const getPatients = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const filter = { role: 'patient' };

    if (req.query.search) {
      const term = new RegExp(escapeRegex(String(req.query.search)), 'i');
      filter.$or = [{ name: term }, { email: term }, { phone: term }];
    }
    if (req.query.registeredFrom || req.query.registeredTo) {
      filter.createdAt = {};
      if (req.query.registeredFrom) {
        filter.createdAt.$gte = new Date(req.query.registeredFrom);
        if (Number.isNaN(filter.createdAt.$gte.getTime())) {
          return res.status(400).json({ message: 'Invalid registration start date.' });
        }
      }
      if (req.query.registeredTo) {
        const registeredTo = new Date(req.query.registeredTo);
        if (Number.isNaN(registeredTo.getTime())) {
          return res.status(400).json({ message: 'Invalid registration end date.' });
        }
        registeredTo.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = registeredTo;
      }
    }

    const [patients, total] = await Promise.all([
      User.find(filter)
        .select('name email phone createdAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);
    const appointments = await Appointment.find({ patient: { $in: patients.map(({ _id }) => _id) } })
      .sort({ date: -1 })
      .populate({ path: 'doctor', populate: { path: 'user', select: 'name' } })
      .lean();
    const appointmentsByPatient = new Map();

    for (const appointment of appointments) {
      const key = appointment.patient.toString();
      const history = appointmentsByPatient.get(key) || [];
      history.push(appointment);
      appointmentsByPatient.set(key, history);
    }

    return res.json({
      patients: patients.map((patient) => ({
        ...patient,
        appointmentHistory: appointmentsByPatient.get(patient._id.toString()) || [],
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to load patients.' });
  }
};

module.exports = { getDashboard, getPatients };
