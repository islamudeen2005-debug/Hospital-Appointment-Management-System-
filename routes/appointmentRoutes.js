const express = require('express');
const {
  getAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  getMyAppointments,
  updateAppointmentStatus,
} = require('../controllers/appointmentController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/my', protect, authorize('patient'), getMyAppointments);
router.get('/', protect, getAppointments);
router.post('/', protect, authorize('patient'), createAppointment);
router.get('/:id', protect, getAppointmentById);
router.put('/:id', protect, updateAppointment);
router.delete('/:id', protect, deleteAppointment);
router.put('/:id/status', protect, updateAppointmentStatus);

module.exports = router;
