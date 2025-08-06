const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../Storage/FotoPemeriksaanAlat');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const { kode_apar, tanggal } = req.body;
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const formattedTanggal = tanggal?.split('T')[0].replace(/-/g, '') || 'tgl';
    const safeName = `${kode_apar || 'apar'}_${formattedTanggal}_${timestamp}${ext}`;
    console.log('Generated filename:', safeName); // 🔍 Debug
    cb(null, safeName);
  },
});

const upload = multer({ storage });
module.exports = upload;
