const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const sanitizeUser = (user) => {
  const userObject = user.toObject ? user.toObject() : user;
  const { password, tokenVersion, ...safeUser } = userObject;
  return safeUser;
};

const generateToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }
  return jwt.sign(
    { id: user._id, role: user.role, tokenVersion: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const registerUser = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'A user with this email already exists.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone,
      role: 'patient',
    });

    const token = generateToken(user);

    return res.status(201).json({
      message: 'User registered successfully.',
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A user with this email already exists.' });
    }
    return res.status(500).json({ message: error.message || 'Registration failed.' });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+tokenVersion');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = generateToken(user);

    return res.json({
      message: 'Login successful.',
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Login failed.' });
  }
};

const logoutUser = async (req, res) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    return res.json({ message: 'Logout successful.' });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Logout failed.' });
  }
};

const getProfile = async (req, res) => {
  return res.json({ user: sanitizeUser(req.user) });
};

const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const { name, phone, email } = req.body;

    if (name) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (email) {
      const emailExists = await User.findOne({ email: email.toLowerCase(), _id: { $ne: user._id } });
      if (emailExists) {
        return res.status(400).json({ message: 'This email is already in use.' });
      }
      user.email = email.toLowerCase();
    }

    await user.save();
    return res.json({ message: 'Profile updated successfully.', user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to update profile.' });
  }
};

const getUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const filter = role ? { role } : {};
    const users = await User.find(filter).select('-password').sort({ createdAt: -1 });
    return res.json({ users });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to fetch users.' });
  }
};

module.exports = { registerUser, loginUser, logoutUser, getProfile, updateProfile, getUsers, sanitizeUser };
