require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const MAX_PORT_ATTEMPTS = 10;
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Hospital API is running.' });
});

app.use("/api/auth", authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/admin', adminRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || err.status || 500).json({
    message: err.message || 'Server error',
  });
});

const startServer = async () => {
  try {
    const jwtSecret = process.env.JWT_SECRET || '';
    if (jwtSecret.length < 32 || /replace|dev-secret|changeme|your[_-]?secret/i.test(jwtSecret)) {
      throw new Error('JWT_SECRET must be a unique random value of at least 32 characters.');
    }

    await connectDB();

    const listenOnPort = (port, attempt = 1) => {
      const server = app.listen(port, () => {
        console.log(`Server is running on ${process.env.MONGODB_URI}`);
        console.log(`Server is running on port ${port}`);
      });

      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS) {
          const nextPort = port + 1;
          console.warn(`Port ${port} is already in use. Trying ${nextPort} instead...`);
          listenOnPort(nextPort, attempt + 1);
          return;
        }

        console.error(`Failed to start server on port ${port}:`, error.message);
        process.exit(1);
      });
    };

    listenOnPort(PORT);
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
