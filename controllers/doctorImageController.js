const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const detectImageExtension = (buffer) => {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return '.jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (
    buffer.subarray(0, 4).toString() === 'RIFF'
    && buffer.subarray(8, 12).toString() === 'WEBP'
  ) return '.webp';
  return null;
};

const uploadDoctorImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Select a doctor image to upload.' });
  }

  const extension = detectImageExtension(req.file.buffer);
  if (!extension) {
    return res.status(400).json({ message: 'The uploaded file is not a valid JPEG, PNG, or WebP image.' });
  }

  try {
    const uploadDirectory = path.join(__dirname, '..', 'uploads', 'doctors');
    const fileName = `${crypto.randomUUID()}${extension}`;
    await fs.mkdir(uploadDirectory, { recursive: true });
    await fs.writeFile(path.join(uploadDirectory, fileName), req.file.buffer, { flag: 'wx' });

    return res.status(201).json({ image: `/uploads/doctors/${fileName}` });
  } catch (error) {
    console.error('Doctor image upload failed:', error);
    return res.status(500).json({ message: 'Unable to save the uploaded doctor image.' });
  }
};

module.exports = { uploadDoctorImage };
