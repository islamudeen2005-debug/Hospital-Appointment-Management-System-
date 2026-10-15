const express = require('express');
const {
  getDoctors,
  getDoctorById,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  getDoctorSlots,
} = require('../controllers/doctorController');
const { protect, authorize } = require('../middleware/authMiddleware');
const imageUpload = require('../middleware/doctorImageUpload');
const { uploadDoctorImage } = require('../controllers/doctorImageController');

const router = express.Router();

router.get('/', getDoctors);
router.post('/upload-image', protect, authorize('admin'), imageUpload.single('image'), uploadDoctorImage);
router.get('/manage', protect, authorize('admin'), getDoctors);
router.get('/:id/slots', getDoctorSlots);
router.get('/:id', getDoctorById);
router.post('/', protect, authorize('admin'), createDoctor);
router.put('/:id', protect, authorize('admin'), updateDoctor);
router.delete('/:id', protect, authorize('admin'), deleteDoctor);

module.exports = router;
