const express = require('express');
const { registerUser, loginUser, logoutUser, getProfile, updateProfile, getUsers } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/logout', protect, logoutUser);
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.get('/users', protect, authorize('admin'), getUsers);

module.exports = router;
