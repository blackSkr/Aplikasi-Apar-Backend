// routes/PerawatanRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const PerawatanController = require('../controllers/PerawatanController');

// siapkan folder upload
const uploadDir = 'uploads/maintenance/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// konfigurasi multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(file.originalname)}`;
    cb(null, unique);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only images allowed'));
    }
    cb(null, true);
  }
});

// wrapper untuk menangani error multer -> kirim JSON
function handleUpload(req, res, next) {
  upload.array('fotos', 10)(req, res, err => {
    if (err) {
      if (req.files) req.files.forEach(f=>{try{fs.unlinkSync(f.path)}catch{}});
      return res.status(400).json({
        success:false,
        message: err instanceof multer.MulterError ? err.message : 'Upload error'
      });
    }
    next();
  });
}

// routes
router.post('/submit', handleUpload, PerawatanController.submit);

// status butuh badge di query: /status/:aparId?badge=BN-02
router.get('/status/:aparId',   PerawatanController.status);
router.get('/history/:aparId',  PerawatanController.history);
router.get('/details/:id',      PerawatanController.details);
router.get('/all', PerawatanController.all); // NEW route
router.get('/with-checklist/by-token', PerawatanController.withChecklistByToken);

module.exports = router;
