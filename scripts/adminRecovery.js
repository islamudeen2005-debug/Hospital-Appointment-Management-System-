const bcrypt = require('bcryptjs');
const User = require('../models/User');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isValidEmail = (email) => EMAIL_PATTERN.test(email);

const isStrongPassword = (password) => {
  if (password.length < 14 || password.length > 128) return false;
  const characterClasses = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  return characterClasses.filter(Boolean).length >= 3;
};

const resetExistingAdminCredentials = async ({ currentEmail, newEmail, password }) => {
  const normalizedCurrentEmail = currentEmail.trim().toLowerCase();
  const normalizedNewEmail = newEmail.trim().toLowerCase();
  if (!isValidEmail(normalizedCurrentEmail) || !isValidEmail(normalizedNewEmail)) {
    throw new Error('Enter a valid email address; no changes were made.');
  }
  if (!isStrongPassword(password)) {
    throw new Error('Password must be 14-128 characters and include at least 3 of lowercase, uppercase, number, and symbol.');
  }

  const admin = await User.findOne({ email: normalizedCurrentEmail, role: 'admin' }).select('_id');
  if (!admin) {
    throw new Error('No admin account matches that email; no changes were made.');
  }
  if (await User.exists({ email: normalizedNewEmail, _id: { $ne: admin._id } })) {
    throw new Error('That email is already assigned to another account; no changes were made.');
  }

  try {
    const updatedAdmin = await User.findOneAndUpdate(
      { _id: admin._id, role: 'admin' },
      {
        $set: {
          email: normalizedNewEmail,
          password: await bcrypt.hash(password, 12),
        },
        $inc: { tokenVersion: 1 },
      },
      { new: true, runValidators: true }
    ).select('email role');

    if (!updatedAdmin) {
      throw new Error('The selected admin account changed before it could be updated; no credentials were changed.');
    }
    return { email: updatedAdmin.email, role: updatedAdmin.role };
  } catch (error) {
    if (error.code === 11000) {
      throw new Error('That email is already assigned to another account; no credentials were changed.');
    }
    throw error;
  }
};

module.exports = { isValidEmail, isStrongPassword, resetExistingAdminCredentials };
