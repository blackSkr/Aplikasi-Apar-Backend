// routes/PerawatanRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const PerawatanController = require('../controllers/PerawatanController');

/* =========================================
   UPLOAD CONFIG (Foto Pemeriksaan)
   - Folder: /uploads/perawatan
   - Static: diserve oleh ApiService.js -> app.use('/uploads', express.static(...))
   ========================================= */
const UP_DIR = path.join(process.cwd(), 'uploads', 'perawatan');
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UP_DIR),
  filename:    (_, file, cb) => {
    const ext  = path.extname(file.originalname || '');
    const base = path.basename(file.originalname || 'file', ext).replace(/[^\w\-]+/g, '_');
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2,8)}_${base}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { files: 20, fileSize: 10 * 1024 * 1024 }, // ≤20 file, max 10MB/berkas
  fileFilter: (_req, file, cb) => {
    if (!String(file.mimetype || '').toLowerCase().startsWith('image/')) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only images are allowed'));
    }
    cb(null, true);
  }
});

/**
 * Wrapper untuk menerima 2 nama field:
 * - "photos" (baru, disarankan)
 * - "fotos"  (lama; tetap didukung)
 * Setelah upload, req.files dinormalisasi menjadi array of file (bukan object per-field).
 * Kalau error, bersihkan file dan balas JSON 400.
 */
function handleUpload(req, res, next) {
  const mw = upload.fields([
    { name: 'photos', maxCount: 20 },
    { name: 'fotos',  maxCount: 20 },
  ]);
  mw(req, res, (err) => {
    if (err) {
      // hapus file yang sudah sempat tersimpan
      const all = [];
      try {
        if (Array.isArray(req.files)) all.push(...req.files);
        else if (req.files && typeof req.files === 'object') {
          for (const k of Object.keys(req.files)) all.push(...(req.files[k] || []));
        }
      } catch {}
      all.forEach(f => { try { if (f.path) fs.unlinkSync(f.path); } catch {} });

      return res.status(400).json({
        success: false,
        message: err instanceof multer.MulterError ? err.message : 'Upload error',
      });
    }

    // Normalisasi: jadikan req.files = array of files (gabungan photos+fotos)
    if (req.files && !Array.isArray(req.files)) {
      const merged = [];
      for (const k of Object.keys(req.files)) merged.push(...(req.files[k] || []));
      req.files = merged;
    } else if (!req.files) {
      req.files = [];
    }

    next();
  });
}

/* =========================
   ROUTES
   ========================= */

// Submit pemeriksaan + foto (foto opsional)
router.post('/submit', handleUpload, PerawatanController.submit);

// status butuh badge di query: /status/:aparId?badge=BN-02
router.get('/status/:aparId',  PerawatanController.status);

// riwayat per APAR
router.get('/history/:aparId', PerawatanController.history);

// detail pemeriksaan (checklist + foto)
router.get('/details/:id',     PerawatanController.details);

// semua hasil pemeriksaan (admin)
router.get('/all',             PerawatanController.all);

// ambil detail APAR + checklist by token QR (mobile)
router.get('/with-checklist/by-token', PerawatanController.withChecklistByToken);
router.get('/with-checklist/by-token-safe', PerawatanController.withChecklistByTokenSafe);

//verifikasi notifikasi
router.get('/upcoming', PerawatanController.upcoming);
router.get('/due-h2', PerawatanController.dueH2);

/* ===============================================================
   STATUS-LITE tanpa badge (cocok rescue)
   GET /api/perawatan/status-lite/:aparId
   Menggunakan interval default jenis bila tidak ada data role/badge.
   =============================================================== */
router.get('/status-lite/:aparId', async (req, res) => {
  try {
    const aparId = parseInt(req.params.aparId, 10);
    if (isNaN(aparId)) return res.status(400).json({ success:false, message:'aparId invalid' });

    const pool = await poolPromise;
    const q = await pool.request()
      .input('aparId', sql.Int, aparId)
      .query(`
SELECT TOP 1
  hp.Id,
  hp.TanggalPemeriksaan,
  hp.Kondisi,
  p.Kode         AS AparKode,
  l.Nama         AS LokasiNama,
  jp.Nama        AS JenisNama,
  NULL           AS PetugasBadge,
  NULL           AS NamaInterval,
  jp.IntervalPemeriksaanBulan AS IntervalBulan,
  CASE
    WHEN hp.TanggalPemeriksaan IS NULL THEN NULL
    ELSE DATEADD(MONTH, jp.IntervalPemeriksaanBulan, hp.TanggalPemeriksaan)
  END AS NextDueDate
FROM HasilPemeriksaan hp
JOIN Peralatan p       ON hp.PeralatanId = p.Id
JOIN Lokasi l          ON p.LokasiId = l.Id
JOIN JenisPeralatan jp ON p.JenisId = jp.Id
WHERE hp.PeralatanId = @aparId
ORDER BY hp.TanggalPemeriksaan DESC
      `);
    return res.json({ success:true, data: q.recordset[0] || null });
  } catch (err) {
    console.error('status-lite error', err);
    return res.status(500).json({ success:false, message:'Server error' });
  }
});


/* ===============================================================
   STATUS-LITE BATCH — by ids (comma-separated)
   GET /api/perawatan/status-lite-batch?ids=1,2,3
   =============================================================== */
// REPLACE existing status-lite-batch with this version
router.get('/status-lite-batch', async (req, res) => {
  try {
    const idsRaw = String(req.query.ids || '').trim();
    if (!idsRaw) return res.json([]);

    const ids = idsRaw
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isFinite(n));

    if (!ids.length) return res.json([]);

    const pool = await poolPromise;
    // ❗ gunakan nama parameter yang beda dengan table variable
    const idsJson = JSON.stringify(ids);

    const r = await pool.request()
      .input('ids_json', sql.NVarChar(sql.MAX), idsJson)
      .query(`
DECLARE @idlist TABLE (Id INT PRIMARY KEY);

INSERT INTO @idlist(Id)
SELECT TRY_CONVERT(int, value)
FROM OPENJSON(@ids_json)
WHERE TRY_CONVERT(int, value) IS NOT NULL;

WITH Lasts AS (
  SELECT hp.PeralatanId, MAX(hp.TanggalPemeriksaan) AS LastDate
  FROM HasilPemeriksaan hp
  WHERE hp.PeralatanId IN (SELECT Id FROM @idlist)
  GROUP BY hp.PeralatanId
)
SELECT 
  p.Id                 AS aparId,
  p.Kode               AS AparKode,
  l.Nama               AS LokasiNama,
  jp.Nama              AS JenisNama,
  li.LastDate          AS TanggalPemeriksaan,
  jp.IntervalPemeriksaanBulan AS IntervalBulan,
  CASE WHEN li.LastDate IS NULL THEN NULL
       ELSE DATEADD(MONTH, jp.IntervalPemeriksaanBulan, li.LastDate)
  END                  AS NextDueDate
FROM Peralatan p
JOIN JenisPeralatan jp ON jp.Id = p.JenisId
JOIN Lokasi l          ON l.Id = p.LokasiId
LEFT JOIN Lasts li     ON li.PeralatanId = p.Id
WHERE p.Id IN (SELECT Id FROM @idlist)
ORDER BY p.Kode;
      `);

    return res.json(r.recordset || []);
  } catch (err) {
    console.error('status-lite-batch error', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});
;

module.exports = router;
