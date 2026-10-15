require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const { ask, askHidden } = require('./securePrompts');

const createAdmin = async () => {
  const jwtSecret = process.env.JWT_SECRET || '';
  if (jwtSecret.length < 32 || /replace|dev-secret|changeme|your[_-]?secret/i.test(jwtSecret)) {
    throw new Error('Set JWT_SECRET to a unique random value of at least 32 characters before creating an admin.');
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const name = await ask(rl, 'Admin full name: ');
    const email = (await ask(rl, 'Admin email: ')).toLowerCase();
    rl.close();
    const password = await askHidden('Admin password (input hidden): ');

    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('A name and valid email address are required.');
    }
    if (password.length < 12) {
      throw new Error('Admin password must be at least 12 characters long.');
    }

    await connectDB();
    if (await User.exists({ role: 'admin' })) {
      throw new Error('An admin account already exists; refusing to create another bootstrap admin.');
    }
    if (await User.exists({ email })) {
      throw new Error('That email is already registered to another account.');
    }

    await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 12),
      role: 'admin',
    });
    console.log(`Admin account created for ${email}.`);
  } finally {
    rl.close();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
};

createAdmin().catch((error) => {
  console.error(`Admin creation failed: ${error.message}`);
  process.exitCode = 1;
});
