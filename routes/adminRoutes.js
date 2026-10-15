const express = require('express');
const { getDashboard, getPatients } = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect, authorize('admin'));
router.get('/dashboard', getDashboard);
router.get('/patients', getPatients);

module.exports = router;
