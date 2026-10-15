const test = require('node:test');
const assert = require('node:assert/strict');
const dotenv = require('dotenv');
const fs = require('node:fs/promises');
const path = require('node:path');
dotenv.config();
const databaseUrl = new URL(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hospital_appointment');
databaseUrl.pathname = `${databaseUrl.pathname.replace(/\/+$/, '')}_test`;
process.env.MONGO_URI = databaseUrl.toString();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { app } = require('../server');
const connectDB = require('../config/db');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const { isStrongPassword, isValidEmail, resetExistingAdminCredentials } = require('../scripts/adminRecovery');

let server;
let baseUrl;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : null,
  };
}

test.before(async () => {
  await connectDB();
  await User.deleteMany({});
  await Doctor.deleteMany({});
  await Appointment.deleteMany({});

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  const address = server.address();
  baseUrl = `http://localhost:${address.port}`;

  const adminHash = await bcrypt.hash('Admin@123', 10);
  await User.create({
    name: 'System Admin',
    email: 'admin.test@example.com',
    password: adminHash,
    role: 'admin',
  });
});

test.after(async () => {
  await User.deleteMany({});
  await Doctor.deleteMany({});
  await Appointment.deleteMany({});
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await mongoose.disconnect();
});

test('register, login, and profile access work for a patient', async () => {
  const patientEmail = `patient-${Date.now()}@example.com`;
  const registerResponse = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Patient',
      email: patientEmail,
      password: 'secret123',
      phone: '1234567890',
    }),
  });

  assert.equal(registerResponse.status, 201);
  assert.ok(registerResponse.data.token);
  assert.equal(registerResponse.data.user.role, 'patient');
  assert.equal(Object.hasOwn(registerResponse.data.user, 'password'), false);

  const storedPatient = await User.findOne({ email: patientEmail });
  assert.ok(storedPatient.password.startsWith('$2'));
  assert.equal(await bcrypt.compare('secret123', storedPatient.password), true);

  const patientImageUpload = await request('/api/doctors/upload-image', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + registerResponse.data.token },
    body: new FormData(),
  });
  assert.equal(patientImageUpload.status, 403);

  const loginResponse = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: patientEmail, password: 'secret123' }),
  });

  assert.equal(loginResponse.status, 200);
  assert.equal(loginResponse.data.user.email, patientEmail);
  assert.equal(loginResponse.data.user.role, 'patient');
  assert.ok(loginResponse.data.token);
  assert.equal(Object.hasOwn(loginResponse.data.user, 'password'), false);

  const invalidPatientLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: patientEmail, password: 'incorrect-password' }),
  });
  assert.equal(invalidPatientLogin.status, 401);
  assert.equal(invalidPatientLogin.data.message, 'Invalid email or password.');

  const profileResponse = await request('/api/auth/profile', {
    headers: {
      Authorization: `Bearer ${loginResponse.data.token}`,
    },
  });

  assert.equal(profileResponse.status, 200);
  assert.equal(profileResponse.data.user.email, patientEmail);

  const ownAppointmentsResponse = await request('/api/appointments/my', {
    headers: { Authorization: 'Bearer ' + registerResponse.data.token },
  });
  assert.equal(ownAppointmentsResponse.status, 200);
  assert.deepEqual(ownAppointmentsResponse.data.appointments, []);

  const adminDashboardResponse = await request('/api/admin/dashboard', {
    headers: { Authorization: `Bearer ${loginResponse.data.token}` },
  });
  assert.equal(adminDashboardResponse.status, 403);

  const logoutResponse = await request('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + loginResponse.data.token },
  });
  assert.equal(logoutResponse.status, 200);

  const revokedLoginToken = await request('/api/auth/profile', {
    headers: { Authorization: 'Bearer ' + loginResponse.data.token },
  });
  assert.equal(revokedLoginToken.status, 401);

  const revokedRegistrationToken = await request('/api/auth/profile', {
    headers: { Authorization: 'Bearer ' + registerResponse.data.token },
  });
  assert.equal(revokedRegistrationToken.status, 401);

  const reloginResponse = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: patientEmail, password: 'secret123' }),
  });
  assert.equal(reloginResponse.status, 200);

  const refreshedProfileResponse = await request('/api/auth/profile', {
    headers: { Authorization: 'Bearer ' + reloginResponse.data.token },
  });
  assert.equal(refreshedProfileResponse.status, 200);
});

test('admin can create doctors and retrieve patient lists', async () => {
  const invalidLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin.test@example.com', password: 'incorrect-password' }),
  });
  assert.equal(invalidLogin.status, 401);
  assert.equal(invalidLogin.data.message, 'Invalid email or password.');

  const adminLoginResponse = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin.test@example.com', password: 'Admin@123' }),
  });

  assert.equal(adminLoginResponse.status, 200);
  assert.equal(adminLoginResponse.data.user.role, 'admin');
  assert.equal(Object.hasOwn(adminLoginResponse.data.user, 'password'), false);
  assert.ok(adminLoginResponse.data.token);
  const adminToken = adminLoginResponse.data.token;

  const imageForm = new FormData();
  imageForm.append(
    'image',
    new Blob([Buffer.from('89504e470d0a1a0a00000000', 'hex')], { type: 'image/png' }),
    'demo.png'
  );
  const imageUploadResponse = await request('/api/doctors/upload-image', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + adminToken },
    body: imageForm,
  });
  assert.equal(imageUploadResponse.status, 201);
  assert.match(imageUploadResponse.data.image, /^\/uploads\/doctors\/.+\.png$/);
  const savedImageResponse = await fetch(`${baseUrl}${imageUploadResponse.data.image}`);
  assert.equal(savedImageResponse.status, 200);
  assert.match(savedImageResponse.headers.get('content-type'), /image\/png/);
  await fs.unlink(path.join(__dirname, '..', imageUploadResponse.data.image.replaceAll('/', path.sep)));

  const doctorEmail = `doctor-${Date.now()}@example.com`;
  const doctorResponse = await request('/api/doctors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: 'Dr. Test',
      email: doctorEmail,
      password: 'Doctor@123',
      phone: '5551237890',
      specialization: 'Neurology',
      image: 'https://example.com/doctor.jpg',
      qualification: 'MD',
      department: 'Neurology',
      availableDays: ['Monday', 'Wednesday'],
      biography: 'Experienced neurologist.',
      experience: 10,
      fee: 200,
      availableSlots: ['09:00 AM', '10:00 AM'],
    }),
  });

  assert.equal(doctorResponse.status, 201);
  assert.equal(doctorResponse.data.doctor.specialization, 'Neurology');
  assert.equal(doctorResponse.data.doctor.image, 'https://example.com/doctor.jpg');
  assert.deepEqual(doctorResponse.data.doctor.availableDays, ['Monday', 'Wednesday']);

  const patientListResponse = await request('/api/auth/users?role=patient', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  assert.equal(patientListResponse.status, 200);
  assert.ok(Array.isArray(patientListResponse.data.users));

  const patientManagementResponse = await request('/api/admin/patients?search=Test', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(patientManagementResponse.status, 200);
  assert.ok(patientManagementResponse.data.patients.some((patient) => patient.email.includes('patient-')));

  const dashboardResponse = await request('/api/admin/dashboard', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(dashboardResponse.status, 200);
  assert.equal(dashboardResponse.data.statistics.totalDoctors, 1);
  assert.equal(dashboardResponse.data.statistics.totalPatients, 1);
  assert.equal(typeof dashboardResponse.data.statistics.completedAppointments, 'number');
  assert.equal(dashboardResponse.data.dailyAppointments.length, 7);
  assert.equal(dashboardResponse.data.monthlyAppointments.length, 12);
  assert.ok(Array.isArray(dashboardResponse.data.appointmentStatusCounts));
  assert.ok(Array.isArray(dashboardResponse.data.doctorAppointments));

  const doctorListResponse = await request('/api/doctors', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(doctorListResponse.status, 200);
  assert.ok(Array.isArray(doctorListResponse.data));

  const doctorId = doctorResponse.data.doctor._id;
  const doctorUpdateResponse = await request(`/api/doctors/${doctorId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ biography: 'Updated biography.', isActive: true }),
  });
  assert.equal(doctorUpdateResponse.status, 200);
  assert.equal(doctorUpdateResponse.data.doctor.biography, 'Updated biography.');

  const doctorDeactivateResponse = await request(`/api/doctors/${doctorId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(doctorDeactivateResponse.status, 200);
  assert.equal(doctorDeactivateResponse.data.message, 'Doctor deactivated successfully.');
  const publicDoctorsAfterDeactivation = await request('/api/doctors');
  assert.equal(publicDoctorsAfterDeactivation.data.length, 0);
  const managedDoctorsAfterDeactivation = await request('/api/doctors/manage', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(managedDoctorsAfterDeactivation.data[0].isActive, false);
});

test('patient appointment creation prevents duplicate booking and supports doctor status updates', async () => {
  const patientEmail = `patient-appointment-${Date.now()}@example.com`;
  const patientRegister = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Booking Patient',
      email: patientEmail,
      password: 'secret123',
      phone: '9800000000',
    }),
  });

  assert.equal(patientRegister.status, 201);
  const patientToken = patientRegister.data.token;

  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin.test@example.com', password: 'Admin@123' }),
  });

  const doctorEmail = `doctor-appointment-${Date.now()}@example.com`;
  const doctorCreate = await request('/api/doctors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminLogin.data.token}`,
    },
    body: JSON.stringify({
      name: 'Dr. Booking',
      email: doctorEmail,
      password: 'Doctor@123',
      phone: '7777777777',
      specialization: 'Dermatology',
      experience: 7,
      fee: 120,
      availableSlots: ['03:00 PM'],
    }),
  });

  assert.equal(doctorCreate.status, 201);
  const doctorId = doctorCreate.data.doctor._id;

  const appointmentCreate = await request('/api/appointments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${patientToken}`,
    },
    body: JSON.stringify({
      doctorId,
      date: '2030-12-15',
      timeSlot: '03:00 PM',
    }),
  });

  assert.equal(appointmentCreate.status, 201);
  assert.equal(appointmentCreate.data.appointment.status, 'pending');
  const ownAppointment = await request(`/api/appointments/${appointmentCreate.data.appointment._id}`, {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  assert.equal(ownAppointment.status, 200);

  const otherPatientEmail = `other-patient-${Date.now()}@example.com`;
  const otherPatientRegister = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Other Test Patient',
      email: otherPatientEmail,
      password: 'other-secret123',
    }),
  });
  assert.equal(otherPatientRegister.status, 201);

  const otherPatientAppointments = await request('/api/appointments/my', {
    headers: { Authorization: 'Bearer ' + otherPatientRegister.data.token },
  });
  assert.equal(otherPatientAppointments.status, 200);
  assert.deepEqual(otherPatientAppointments.data.appointments, []);

  const otherPatientAppointmentAccess = await request(
    `/api/appointments/${appointmentCreate.data.appointment._id}`,
    { headers: { Authorization: 'Bearer ' + otherPatientRegister.data.token } }
  );
  assert.equal(otherPatientAppointmentAccess.status, 403);

  const otherDoctorEmail = `other-doctor-${Date.now()}@example.com`;
  const otherDoctorCreate = await request('/api/doctors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminLogin.data.token}`,
    },
    body: JSON.stringify({
      name: 'Dr. Other',
      email: otherDoctorEmail,
      password: 'Doctor@456',
      specialization: 'Cardiology',
      fee: 100,
      availableSlots: ['03:00 PM'],
    }),
  });
  assert.equal(otherDoctorCreate.status, 201);
  const appointmentForAdminRejection = await request('/api/appointments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${patientToken}`,
    },
    body: JSON.stringify({
      doctorId: otherDoctorCreate.data.doctor._id,
      date: '2030-12-15',
      timeSlot: '03:00 PM',
    }),
  });
  assert.equal(appointmentForAdminRejection.status, 201);
  const rejectResponse = await request(
    `/api/appointments/${appointmentForAdminRejection.data.appointment._id}/status`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminLogin.data.token}`,
      },
      body: JSON.stringify({ status: 'rejected' }),
    }
  );
  assert.equal(rejectResponse.status, 200);
  assert.equal(rejectResponse.data.appointment.status, 'rejected');

  const analyticsResponse = await request('/api/admin/dashboard', {
    headers: { Authorization: 'Bearer ' + adminLogin.data.token },
  });
  assert.equal(analyticsResponse.status, 200);
  assert.equal(analyticsResponse.data.statistics.totalAppointments, 2);
  assert.equal(analyticsResponse.data.statistics.pendingAppointments, 1);
  assert.equal(analyticsResponse.data.statistics.rejectedAppointments, 1);
  assert.equal(
    analyticsResponse.data.appointmentStatusCounts.reduce((total, item) => total + item.count, 0),
    2
  );
  assert.equal(analyticsResponse.data.doctorAppointments.length, 2);

  const otherDoctorLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: otherDoctorEmail, password: 'Doctor@456' }),
  });
  const otherDoctorAppointmentAccess = await request(
    `/api/appointments/${appointmentCreate.data.appointment._id}`,
    { headers: { Authorization: `Bearer ${otherDoctorLogin.data.token}` } }
  );
  assert.equal(otherDoctorAppointmentAccess.status, 403);

  const pastAppointment = await request('/api/appointments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${patientToken}`,
    },
    body: JSON.stringify({ doctorId, date: '2000-01-01', timeSlot: '03:00 PM' }),
  });
  assert.equal(pastAppointment.status, 400);

  const duplicateResponse = await request('/api/appointments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${patientToken}`,
    },
    body: JSON.stringify({
      doctorId,
      date: '2030-12-15',
      timeSlot: '03:00 PM',
    }),
  });

  assert.equal(duplicateResponse.status, 409);

  const doctorLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: doctorEmail, password: 'Doctor@123' }),
  });

  const appointmentsResponse = await request('/api/appointments', {
    headers: { Authorization: `Bearer ${doctorLogin.data.token}` },
  });

  assert.equal(appointmentsResponse.status, 200);
  const appointmentId = appointmentsResponse.data.appointments[0]._id;

  const statusUpdate = await request(`/api/appointments/${appointmentId}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${doctorLogin.data.token}`,
    },
    body: JSON.stringify({ status: 'confirmed' }),
  });

  assert.equal(statusUpdate.status, 200);
  assert.equal(statusUpdate.data.appointment.status, 'confirmed');

  const completedUpdate = await request(`/api/appointments/${appointmentId}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + adminLogin.data.token,
    },
    body: JSON.stringify({ status: 'completed' }),
  });
  assert.equal(completedUpdate.status, 200);
  assert.equal(completedUpdate.data.appointment.status, 'completed');

  const cancelledUpdate = await request(
    `/api/appointments/${appointmentForAdminRejection.data.appointment._id}/status`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + adminLogin.data.token,
      },
      body: JSON.stringify({ status: 'cancelled' }),
    }
  );
  assert.equal(cancelledUpdate.status, 200);
  assert.equal(cancelledUpdate.data.appointment.status, 'cancelled');

  assert.equal(isValidEmail('new-admin@example.com'), true);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isStrongPassword('short1!A'), false);
  assert.equal(isStrongPassword('Long-Enough!Password42'), true);

  const beforeCredentialReset = {
    patients: await User.countDocuments({ role: 'patient' }),
    doctors: await Doctor.countDocuments({}),
    appointments: await Appointment.countDocuments({}),
  };
  const oldAdminToken = adminLogin.data.token;
  const updatedAdmin = await resetExistingAdminCredentials({
    currentEmail: 'admin.test@example.com',
    newEmail: 'recovered-admin@example.com',
    password: 'Recovered-Admin-Password-2026!',
  });
  assert.deepEqual(updatedAdmin, { email: 'recovered-admin@example.com', role: 'admin' });

  const recoveredAdmin = await User.findOne({ email: updatedAdmin.email }).select('+tokenVersion');
  assert.equal(recoveredAdmin.role, 'admin');
  assert.equal(await bcrypt.compare('Recovered-Admin-Password-2026!', recoveredAdmin.password), true);

  const revokedAdminSession = await request('/api/admin/dashboard', {
    headers: { Authorization: 'Bearer ' + oldAdminToken },
  });
  assert.equal(revokedAdminSession.status, 401);

  const recoveredAdminLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'recovered-admin@example.com',
      password: 'Recovered-Admin-Password-2026!',
    }),
  });
  assert.equal(recoveredAdminLogin.status, 200);
  assert.equal(recoveredAdminLogin.data.user.role, 'admin');
  const recoveredAdminToken = recoveredAdminLogin.data.token;

  const recoveredDashboard = await request('/api/admin/dashboard', {
    headers: { Authorization: 'Bearer ' + recoveredAdminToken },
  });
  assert.equal(recoveredDashboard.status, 200);

  const recoveredDoctorManagement = await request('/api/doctors/manage', {
    headers: { Authorization: 'Bearer ' + recoveredAdminToken },
  });
  assert.equal(recoveredDoctorManagement.status, 200);

  const recoveredAppointmentManagement = await request('/api/appointments', {
    headers: { Authorization: 'Bearer ' + recoveredAdminToken },
  });
  assert.equal(recoveredAppointmentManagement.status, 200);

  const afterCredentialReset = {
    patients: await User.countDocuments({ role: 'patient' }),
    doctors: await Doctor.countDocuments({}),
    appointments: await Appointment.countDocuments({}),
  };
  assert.deepEqual(afterCredentialReset, beforeCredentialReset);
});
