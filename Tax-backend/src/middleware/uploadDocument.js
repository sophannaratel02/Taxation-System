const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadsDirectory = path.resolve(__dirname, '../../uploads/documents');
fs.mkdirSync(uploadsDirectory, { recursive: true });

const acceptedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDirectory,
    filename(req, file, callback) {
      const extension = path.extname(path.basename(file.originalname)).toLowerCase();
      callback(null, `${crypto.randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    if (!acceptedMimeTypes.has(file.mimetype)) {
      callback(new Error('Upload a PDF, image, text, Word, or Excel document.'));
      return;
    }
    callback(null, true);
  },
});

function uploadSingleDocument(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ message: error.message || 'Unable to upload this file.' });
  });
}

module.exports = { uploadsDirectory, uploadSingleDocument };
