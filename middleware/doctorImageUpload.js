const multer = require('multer');

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) {
      const error = new Error('Upload a JPEG, PNG, or WebP image.');
      error.statusCode = 400;
      callback(error);
      return;
    }
    callback(null, true);
  },
});
