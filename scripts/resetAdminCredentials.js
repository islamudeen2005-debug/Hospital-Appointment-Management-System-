require('dotenv').config();
const readline = require('readline');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const { ask, askHidden } = require('./securePrompts');
const { isValidEmail, isStrongPassword, resetExistingAdminCredentials } = require('./adminRecovery');

const assertRecoveryAllowed = () => {
  if (process.env.ADMIN_RECOVERY_ENABLED !== 'true') {
    throw new Error('Admin recovery is disabled by default. Set ADMIN_RECOVERY_ENABLED=true for this interactive invocation.');
  }
  if (process.env.NODE_ENV === 'production' && process.env.ADMIN_RECOVERY_AUTHORIZED !== 'true') {
    throw new Error(
      'Production recovery also requires ADMIN_RECOVERY_AUTHORIZED=true from the separately authorized recovery procedure.'
    );
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Credential recovery must be run from an interactive local terminal.');
  }
};

const resetAdminCredentials = async () => {
  assertRecoveryAllowed();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    await connectDB();
    const admins = await User.find({ role: 'admin' }).select('email role').sort({ email: 1 }).lean();
    if (admins.length === 0) {
      throw new Error('No existing admin account was found. Use the secure create-admin setup if appropriate.');
    }

    process.stdout.write('Existing admin accounts:\n');
    for (const { email, role } of admins) {
      process.stdout.write(`${email} ${role}\n`);
    }

    const currentEmail = (await ask(rl, 'Enter the existing admin email to reset: ')).toLowerCase();
    const admin = await User.findOne({ email: currentEmail, role: 'admin' }).select('_id email role');
    if (!admin) {
      throw new Error('No admin account matches that email; no changes were made.');
    }

    const enteredNewEmail = await ask(rl, 'New admin email (press Enter to keep the current email): ');
    const newEmail = (enteredNewEmail || admin.email).toLowerCase();
    if (!isValidEmail(newEmail)) {
      throw new Error('Enter a valid email address; no changes were made.');
    }

    const newPassword = await askHidden('New password (hidden; at least 14 characters, 3 character classes): ');
    if (!isStrongPassword(newPassword)) {
      throw new Error('Password must be 14-128 characters and include at least 3 of lowercase, uppercase, number, and symbol.');
    }
    const confirmedPassword = await askHidden('Re-enter the new password (hidden): ');
    if (newPassword !== confirmedPassword) {
      throw new Error('Passwords do not match; no changes were made.');
    }

    const confirmation = await ask(
      rl,
      `Type RESET ${admin.email} to update this existing admin account: `
    );
    if (confirmation !== `RESET ${admin.email}`) {
      throw new Error('Confirmation did not match; no changes were made.');
    }

    const updatedAdmin = await resetExistingAdminCredentials({ currentEmail, newEmail, password: newPassword });
    console.log(`Admin credentials updated for ${updatedAdmin.email}. Existing admin role preserved; active sessions revoked.`);
  } finally {
    rl.close();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
};

resetAdminCredentials().catch((error) => {
  console.error(`Admin credential reset failed: ${error.message}`);
  process.exitCode = 1;
});
