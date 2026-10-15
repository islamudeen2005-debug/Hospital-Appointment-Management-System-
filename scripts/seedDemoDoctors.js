require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const connectDB = require('../config/db');

const demoDoctors = [
  {
    name: 'Dr. Arjun Kumar',
    email: 'arjun.kumar@careconnect.demo',
    phone: '9000000001',
    specialization: 'Cardiologist',
    qualification: 'MBBS, MD (Cardiology)',
    department: 'Cardiology',
    city: 'Coimbatore',
    experience: 14,
    fee: 1200,
    biography: 'Demo doctor profile for college project use only. Dr. Arjun Kumar is a cardiology specialist focused on preventive heart care and cardiac risk assessment in Coimbatore.',
    image: '/images/doctors/dr-arjun-kumar.jpg',
    availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'],
    availableSlots: ['09:00 AM', '10:00 AM', '11:00 AM', '02:00 PM'],
  },
  {
    name: 'Dr. Priya Raman',
    email: 'priya.raman@careconnect.demo',
    phone: '9000000002',
    specialization: 'Dermatologist',
    qualification: 'MBBS, MD (Dermatology)',
    department: 'Dermatology',
    city: 'Chennai',
    experience: 11,
    fee: 950,
    biography: 'Demo doctor profile for college project use only. Dr. Priya Raman treats skin allergies, pigmentation, acne, and aesthetic dermatology concerns with a personalized approach.',
    image: '/images/doctors/dr-priya-raman.jpg',
    availableDays: ['Monday', 'Wednesday', 'Friday', 'Saturday'],
    availableSlots: ['09:30 AM', '11:30 AM', '01:30 PM', '04:00 PM'],
  },
  {
    name: 'Dr. Karthik Raj',
    email: 'karthik.raj@careconnect.demo',
    phone: '9000000003',
    specialization: 'Neurologist',
    qualification: 'MBBS, DM (Neurology)',
    department: 'Neurology',
    city: 'Madurai',
    experience: 16,
    fee: 1400,
    biography: 'Demo doctor profile for college project use only. Dr. Karthik Raj manages headaches, seizures, stroke follow-up, and nerve-related disorders.',
    image: '/images/doctors/dr-karthik-raj.jpg',
    availableDays: ['Tuesday', 'Thursday', 'Friday', 'Saturday'],
    availableSlots: ['08:30 AM', '10:30 AM', '12:00 PM', '03:30 PM'],
  },
  {
    name: 'Dr. Meena Lakshmi',
    email: 'meena.lakshmi@careconnect.demo',
    phone: '9000000004',
    specialization: 'Pediatrician',
    qualification: 'MBBS, MD (Pediatrics)',
    department: 'Pediatrics',
    city: 'Salem',
    experience: 9,
    fee: 800,
    biography: 'Demo doctor profile for college project use only. Dr. Meena Lakshmi supports child wellness, vaccinations, growth monitoring, and pediatric chronic care.',
    image: '/images/doctors/dr-meena-lakshmi.jpg',
    availableDays: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
    availableSlots: ['09:00 AM', '10:00 AM', '01:00 PM', '02:30 PM'],
  },
  {
    name: 'Dr. Vignesh Iyer',
    email: 'vignesh.iyer@careconnect.demo',
    phone: '9000000005',
    specialization: 'Orthopedic Specialist',
    qualification: 'MBBS, MS (Orthopedics)',
    department: 'Orthopedics',
    city: 'Tiruchirappalli',
    experience: 13,
    fee: 1250,
    biography: 'Demo doctor profile for college project use only. Dr. Vignesh Iyer specializes in fracture rehabilitation, sports injuries, and joint pain management.',
    image: '/images/doctors/dr-vignesh-iyer.jpg',
    availableDays: ['Monday', 'Wednesday', 'Thursday', 'Saturday'],
    availableSlots: ['08:00 AM', '09:30 AM', '12:30 PM', '04:00 PM'],
  },
  {
    name: 'Dr. Nandhini Selvam',
    email: 'nandhini.selvam@careconnect.demo',
    phone: '9000000006',
    specialization: 'Gynecologist',
    qualification: 'MBBS, DGO, MD (Obstetrics & Gynecology)',
    department: 'Gynecology',
    city: 'Erode',
    experience: 12,
    fee: 1100,
    biography: 'Demo doctor profile for college project use only. Dr. Nandhini Selvam offers women’s health consultations, prenatal care, and preventive reproductive wellness.',
    image: '/images/doctors/dr-nandhini-selvam.jpg',
    availableDays: ['Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    availableSlots: ['09:00 AM', '10:30 AM', '01:00 PM', '03:00 PM'],
  },
  {
    name: 'Dr. Rahul Natarajan',
    email: 'rahul.natarajan@careconnect.demo',
    phone: '9000000007',
    specialization: 'General Physician',
    qualification: 'MBBS, MD (General Medicine)',
    department: 'General Medicine',
    city: 'Tiruppur',
    experience: 15,
    fee: 450,
    biography: 'Demo doctor profile for college project use only. Dr. Rahul Natarajan focuses on preventive care, chronic disease management, and general wellness consultations.',
    image: '/images/doctors/dr-rahul-natarajan.jpg',
    availableDays: ['Monday', 'Tuesday', 'Friday', 'Saturday'],
    availableSlots: ['08:30 AM', '10:00 AM', '11:30 AM', '02:00 PM'],
  },
  {
    name: 'Dr. Kavya Srinivasan',
    email: 'kavya.srinivasan@careconnect.demo',
    phone: '9000000008',
    specialization: 'Dentist',
    qualification: 'BDS, MDS (Prosthodontics)',
    department: 'Dentistry',
    city: 'Vellore',
    experience: 10,
    fee: 700,
    biography: 'Demo doctor profile for college project use only. Dr. Kavya Srinivasan offers restorative care, preventive hygiene guidance, and smile design consultations.',
    image: '/images/doctors/dr-kavya-srinivasan.jpg',
    availableDays: ['Monday', 'Wednesday', 'Thursday', 'Friday'],
    availableSlots: ['09:30 AM', '11:00 AM', '12:30 PM', '03:30 PM'],
  },
  {
    name: 'Dr. Suresh Muthukumar',
    email: 'suresh.muthukumar@careconnect.demo',
    phone: '9000000009',
    specialization: 'Ophthalmologist',
    qualification: 'MBBS, MS (Ophthalmology)',
    department: 'Ophthalmology',
    city: 'Thanjavur',
    experience: 12,
    fee: 650,
    biography: 'Demo doctor profile for college project use only. Dr. Suresh Muthukumar provides eye care consultations, refractive evaluations, and routine vision screening.',
    image: '/images/doctors/dr-suresh-muthukumar.jpg',
    availableDays: ['Tuesday', 'Wednesday', 'Friday', 'Saturday'],
    availableSlots: ['09:00 AM', '10:00 AM', '12:00 PM', '02:30 PM'],
  },
  {
    name: 'Dr. Aishwarya Ponnusamy',
    email: 'aishwarya.ponnusamy@careconnect.demo',
    phone: '9000000010',
    specialization: 'ENT Specialist',
    qualification: 'MBBS, MS (ENT)',
    department: 'ENT',
    city: 'Tirunelveli',
    experience: 8,
    fee: 600,
    biography: 'Demo doctor profile for college project use only. Dr. Aishwarya Ponnusamy treats ear, nose, and throat symptoms with modern ENT evaluation techniques.',
    image: '/images/doctors/dr-aishwarya-ponnusamy.jpg',
    availableDays: ['Monday', 'Thursday', 'Friday', 'Saturday'],
    availableSlots: ['09:30 AM', '11:00 AM', '01:30 PM', '03:00 PM'],
  },
  {
    name: 'Dr. Deepak Balaji',
    email: 'deepak.balaji@careconnect.demo',
    phone: '9000000011',
    specialization: 'Psychiatrist',
    qualification: 'MBBS, MD (Psychiatry)',
    department: 'Psychiatry',
    city: 'Hosur',
    experience: 10,
    fee: 1200,
    biography: 'Demo doctor profile for college project use only. Dr. Deepak Balaji supports mental wellness, counseling, and behavioral health assessment with empathy and expertise.',
    image: '/images/doctors/dr-deepak-balaji.jpg',
    availableDays: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
    availableSlots: ['09:00 AM', '10:30 AM', '12:30 PM', '04:00 PM'],
  },
  {
    name: 'Dr. Harini Subramanian',
    email: 'harini.subramanian@careconnect.demo',
    phone: '9000000012',
    specialization: 'Gastroenterologist',
    qualification: 'MBBS, MD (Gastroenterology)',
    department: 'Gastroenterology',
    city: 'Dindigul',
    experience: 11,
    fee: 950,
    biography: 'Demo doctor profile for college project use only. Dr. Harini Subramanian offers digestive health consultations, GI evaluation, and care planning for common stomach concerns.',
    image: '/images/doctors/dr-harini-subramanian.jpg',
    availableDays: ['Monday', 'Wednesday', 'Thursday', 'Saturday'],
    availableSlots: ['09:00 AM', '10:30 AM', '01:00 PM', '03:30 PM'],
  },
];

const seedDemoDoctors = async () => {
  await connectDB();

  const demoDoctorUsers = await User.find({ role: 'doctor', email: /@careconnect\.demo$/i }).select('_id email').lean();
  if (demoDoctorUsers.length) {
    const demoDoctorUserIds = demoDoctorUsers.map((user) => user._id);
    await Doctor.deleteMany({ user: { $in: demoDoctorUserIds } });
    await User.deleteMany({ _id: { $in: demoDoctorUserIds } });
    console.log(`Removed ${demoDoctorUserIds.length} legacy demo doctor records.`);
  }

  const existingDoctorEmails = new Set(
    (await User.find({ role: 'doctor' }).select('email').lean()).map((user) => String(user.email).toLowerCase())
  );

  const createdDoctors = [];
  for (const doctorData of demoDoctors) {
    const lookupEmail = doctorData.email.toLowerCase();
    if (existingDoctorEmails.has(lookupEmail)) {
      console.log(`Skipping existing doctor user: ${doctorData.email}`);
      continue;
    }

    const user = await User.create({
      name: doctorData.name,
      email: lookupEmail,
      password: await bcrypt.hash('Demo@123', 10),
      phone: doctorData.phone,
      role: 'doctor',
    });

    const doctor = await Doctor.create({
      user: user._id,
      specialization: doctorData.specialization,
      image: doctorData.image,
      qualification: doctorData.qualification,
      department: doctorData.department,
      city: doctorData.city,
      biography: doctorData.biography,
      availableDays: doctorData.availableDays,
      experience: doctorData.experience,
      fee: doctorData.fee,
      availableSlots: doctorData.availableSlots,
      isActive: true,
    });

    createdDoctors.push(doctor._id);
    existingDoctorEmails.add(lookupEmail);
  }

  const totalDoctorCount = await Doctor.countDocuments();
  console.log(`Demo seed complete. Total doctor records: ${totalDoctorCount}. Created ${createdDoctors.length} new doctor records.`);
  await mongoose.disconnect();
};

seedDemoDoctors().catch((error) => {
  console.error('Demo doctor seed failed:', error.message);
  process.exitCode = 1;
  mongoose.disconnect().catch(() => {});
});
