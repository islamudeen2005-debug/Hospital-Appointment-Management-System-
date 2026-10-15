require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const listAdmins = async () => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Admin account lookup is disabled in production.');
  }

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not configured.');
  }

  await mongoose.connect(process.env.MONGO_URI);
  try {
    const admins = await User.find({ role: 'admin' }).select('email role').sort({ email: 1 }).lean();
    if (admins.length === 0) {
      console.log('No admin accounts found.');
      return;
    }

    for (const { email, role } of admins) {
      console.log(`${email} ${role}`);
    }
  } finally {
    await mongoose.disconnect();
  }
};

listAdmins().catch((error) => {
  console.error(`Admin lookup failed: ${error.message}`);
  process.exitCode = 1;
});
