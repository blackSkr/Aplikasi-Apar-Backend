// routes/PeralatanRoutes.js
const express = require('express');
const router = express.Router();
const { poolPromise, sql } = require('../ConfigDB');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

/* =========================
   Upload Config (Multi Foto)
   ========================= */
const UP_BASE = path.join(__dirname, '..', 'uploads', 'peralatan');
if (!fs.existsSync(UP_BASE)) fs.mkdirSync(UP_BASE, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UP_BASE),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname || '');
    const base = path.basename(file.originalname || 'file', ext).replace(/[^\w\-]+/g, '_');
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2,8)}_${base}${ext}`);
  }
});
const upload = multer({ storage, limits: { files: 20, fileSize: 10 * 1024 * 1024 } }); // 20 files, 10MB each

// Helpers join/split "FotoPath" (string) <-> array
const joinPaths = (arr) => (arr || []).filter(Boolean).join(';');
const splitPaths = (str) => (str && str.trim()) ? str.split(';').map(s => s.trim()).filter(Boolean) : [];

// Build absolute URL dari path relatif "/uploads/..."
const toAbsoluteUrl = (req, p) => {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p; // sudah absolute
  const base = `${req.protocol}://${req.get('host')}`;
  return p.startsWith('/') ? `${base}${p}` : `${base}/${p}`;
};
const toAbsoluteUrls = (req, list) => (list || []).map(p => toAbsoluteUrl(req, p)).filter(Boolean);

/* ============================================================
   ROUTE 1: Daftar Peralatan (mobile) + next due + kuota petugas
   ============================================================ */
  // ROUTE 1: Daftar Peralatan (mobile)
router.get('/', async (req, res) => {
  const badge = (req.query.badge || '').trim().toUpperCase();
  if (!badge) return res.json([]);
  try {
    const pool = await poolPromise;

    // pastikan petugas ada
    const cekPet = await pool.request()
      .input('badge', sql.NVarChar, badge)
      .query(`
        SELECT TOP 1 p.Id AS PetugasId, p.LokasiId
        FROM Petugas p
        WHERE UPPER(LTRIM(RTRIM(p.BadgeNumber))) = @badge
      `);
    if (!cekPet.recordset.length) return res.json([]);

    const { recordset } = await pool.request()
      .input('badge', sql.NVarChar, badge)
      .query(`
WITH PetugasInfo AS (
  SELECT 
    p.Id           AS PetugasId,
    p.LokasiId     AS PetugasLokasiId,
    ip.Bulan       AS IntervalBulanPetugas
  FROM Petugas p
  LEFT JOIN RolePetugas rp ON rp.Id = p.RolePetugasId
  LEFT JOIN IntervalPetugas ip ON ip.Id = rp.IntervalPetugasId
  WHERE UPPER(LTRIM(RTRIM(p.BadgeNumber))) = @badge
),
LastCheck AS (
  SELECT
    hp.PeralatanId,
    hp.TanggalPemeriksaan AS last_inspection,
    hp.BadgeNumber        AS badge_petugas,
    ROW_NUMBER() OVER(PARTITION BY hp.PeralatanId ORDER BY hp.TanggalPemeriksaan DESC) AS rn
  FROM HasilPemeriksaan hp
),
InspeksiBlnIni AS (
  SELECT hp.BadgeNumber, COUNT(*) AS TotalInspeksi
  FROM HasilPemeriksaan hp
  WHERE MONTH(hp.TanggalPemeriksaan) = MONTH(GETDATE())
    AND YEAR(hp.TanggalPemeriksaan) = YEAR(GETDATE())
  GROUP BY hp.BadgeNumber
)
SELECT
  a.Id                        AS id_apar,
  a.Kode                      AS no_apar,
  l.Nama                      AS lokasi_apar,
  j.Nama                      AS jenis_apar,
  pi.IntervalBulanPetugas     AS kuota_per_bulan,
  lc.last_inspection,
  CASE
    WHEN lc.last_inspection IS NULL THEN NULL
    WHEN pi.IntervalBulanPetugas IS NOT NULL THEN DATEADD(MONTH, pi.IntervalBulanPetugas, lc.last_inspection)
    ELSE DATEADD(MONTH, j.IntervalPemeriksaanBulan, lc.last_inspection)
  END                         AS next_due_date,
  lc.badge_petugas,
  ISNULL(ib.TotalInspeksi, 0) AS sudah_inspeksi,
  (pi.IntervalBulanPetugas - ISNULL(ib.TotalInspeksi, 0)) AS sisa_kuota
FROM Peralatan a
CROSS JOIN PetugasInfo pi
LEFT JOIN LastCheck lc ON lc.PeralatanId = a.Id AND lc.rn = 1
LEFT JOIN InspeksiBlnIni ib ON ib.BadgeNumber = @badge
JOIN JenisPeralatan j ON a.JenisId = j.Id
JOIN Lokasi l ON a.LokasiId = l.Id
WHERE a.LokasiId = pi.PetugasLokasiId
   OR a.LokasiId IN (SELECT Id FROM Lokasi WHERE PIC_PetugasId = pi.PetugasId)
ORDER BY a.Kode;
      `);

    res.json(recordset);
  } catch (err) {
    console.error('🔥 SQL Error (peralatan):', err);
    res.status(500).json({ message: 'Gagal load peralatan' });
  }
});


/* ==================================
   ROUTE 1B: Enhanced (placeholder)
   ================================== */
router.get('/enhanced', async (req, res) => {
  try {
    let { badge } = req.query;
    badge = (badge || '').trim().toUpperCase();
    if (!badge) return res.json([]);

    const pool = await poolPromise;
    const sqlText = `/* … sama seperti sebelumnya … */`;
    const enhanced = await pool.request().input('badge', sql.NVarChar, badge).query(sqlText);
    res.json(enhanced.recordset);
  } catch (err) {
    console.error('🔥 SQL Error (peralatan enhanced):', err);
    res.json([]);
  }
});

/* ==================================================================
   ROUTE 2: Peralatan + checklist + interval petugas (detail mobile)
   ================================================================== */
router.get('/with-checklist', async (req, res) => {
  try {
    let { id, badge } = req.query;
    badge = (badge || '').trim().toUpperCase();
    const aparId = parseInt(id, 10);
    if (isNaN(aparId)) return res.status(400).json({ message: 'Parameter id wajib angka valid' });

    const pool = await poolPromise;

    const result = await pool.request()
      .input('id', sql.Int, aparId)
      .input('badge', sql.NVarChar, badge)
      .query(`
DECLARE @earlyWindow INT = 7;

WITH PetugasInfo AS (
  SELECT 
    p.Id                AS PetugasId,
    rp.Id               AS RolePetugasId,
    rp.NamaRole         AS NamaRole,
    rp.IntervalPetugasId,
    ip.NamaInterval     AS NamaIntervalPetugas,
    ip.Bulan            AS BulanIntervalPetugas
  FROM Petugas p
  LEFT JOIN RolePetugas rp     ON rp.Id = p.RolePetugasId
  LEFT JOIN IntervalPetugas ip ON ip.Id = rp.IntervalPetugasId
  WHERE LTRIM(RTRIM(UPPER(p.BadgeNumber))) = @badge
),
LastInspection AS (
  SELECT PeralatanId, MAX(TanggalPemeriksaan) AS LastDate
  FROM HasilPemeriksaan
  WHERE PeralatanId = @id
  GROUP BY PeralatanId
)
SELECT 
  p.Id                        AS id_apar,
  p.Kode                      AS no_apar,
  l.Nama                      AS lokasi_apar,
  jp.Nama                     AS jenis_apar,

  -- interval dari ROLE
  pi.IntervalPetugasId        AS intervalPetugasId,
  pi.NamaIntervalPetugas      AS namaIntervalPetugas,
  pi.BulanIntervalPetugas     AS bulanIntervalPetugas,

  -- interval default
  jp.IntervalPemeriksaanBulan AS defaultIntervalBulan,

  li.LastDate                 AS last_inspection_date,
  CASE
    WHEN li.LastDate IS NULL THEN NULL
    ELSE DATEADD(MONTH, COALESCE(pi.BulanIntervalPetugas, jp.IntervalPemeriksaanBulan), li.LastDate)
  END                         AS nextDueDate,

  COALESCE(pi.BulanIntervalPetugas, jp.IntervalPemeriksaanBulan) AS effectiveIntervalBulan,
  DATEDIFF(DAY, GETDATE(),
           CASE WHEN li.LastDate IS NULL THEN GETDATE()
                ELSE DATEADD(MONTH, COALESCE(pi.BulanIntervalPetugas, jp.IntervalPemeriksaanBulan), li.LastDate)
           END)               AS daysUntilDue,
  CASE
    WHEN li.LastDate IS NULL THEN 1
    WHEN DATEDIFF(DAY, GETDATE(),
         DATEADD(MONTH, COALESCE(pi.BulanIntervalPetugas, jp.IntervalPemeriksaanBulan), li.LastDate)
       ) <= @earlyWindow THEN 1
    ELSE 0
  END                         AS canInspect,

  (
    SELECT JSON_QUERY('[' +
      STRING_AGG(
        '{"checklistId":'+CAST(c.Id AS varchar(10))+',"Pertanyaan":"'+REPLACE(c.Pertanyaan,'"','\\"')+'"}',
        ','
      ) + ']'
    )
    FROM Checklist c
    WHERE c.JenisId = p.JenisId
  )                           AS keperluan_check
FROM Peralatan p
JOIN JenisPeralatan jp ON p.JenisId = jp.Id
JOIN Lokasi l          ON p.LokasiId = l.Id
CROSS JOIN PetugasInfo pi
LEFT JOIN LastInspection li ON p.Id = li.PeralatanId
WHERE p.Id = @id;
      `);

    if (!result.recordset.length) return res.status(404).json({ message: 'Peralatan tidak ditemukan' });
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('🔥 SQL Error (with-checklist):', err);
    res.status(500).json({ message: 'Server error' });
  }
});


/* ==========================================
   ROUTE 3: List peralatan (WEB ADMIN)
   ========================================== */
router.get('/admin', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        p.Id, p.Kode, p.Spesifikasi, p.TokenQR, p.FotoPath,
        l.Nama AS LokasiNama, l.Id AS LokasiId,
        jp.Nama AS JenisNama, jp.Id AS JenisId,
        jp.IntervalPemeriksaanBulan,
        CASE WHEN p.FotoPath IS NULL OR LTRIM(RTRIM(p.FotoPath)) = ''
             THEN '[]'
             ELSE '["' + REPLACE(p.FotoPath, ';', '","') + '"]'
        END AS FotoPaths
      FROM Peralatan p
      JOIN Lokasi l ON p.LokasiId = l.Id
      JOIN JenisPeralatan jp ON p.JenisId = jp.Id
      ORDER BY p.Kode
    `);

    // Tambahkan FotoUrls sebagai quality-of-life (tanpa mengubah field lama)
    const withUrls = result.recordset.map(row => {
      let arr = [];
      try { arr = JSON.parse(row.FotoPaths || '[]'); } catch(_) {}
      return {
        ...row,
        FotoUrls: toAbsoluteUrls(req, arr)
      };
    });

    res.json(withUrls);
  } catch (err) {
    console.error('Error fetch peralatan admin:', err);
    res.status(500).json({ message: 'Gagal mengambil data peralatan', error: err.message });
  }
});

// Get data peralatan untuk sinkron offline
router.get('/tokens-by-badge/:badge', async (req, res) => {
  try {
    const badge = String(req.params.badge || '').trim();
    const pool = await poolPromise;
    const r = await pool.request()
      .input('badge', sql.NVarChar(50), badge)
      .query(`
        SELECT 
          per.Id        AS id_apar,
          per.TokenQR   AS token_qr,
          per.Kode      AS kode,
          l.Nama        AS lokasi_nama,
          jp.Nama       AS jenis_nama
        FROM Petugas p
        JOIN Peralatan per ON per.LokasiId = p.LokasiId
        LEFT JOIN Lokasi l ON l.Id = per.LokasiId
        LEFT JOIN JenisPeralatan jp ON jp.Id = per.JenisId
        WHERE LTRIM(RTRIM(p.BadgeNumber)) = LTRIM(RTRIM(@badge))
        ORDER BY per.Id ASC;
      `);

    return res.json(r.recordset || []);
  } catch (err) {
    console.error('GET /api/peralatan/tokens-by-badge error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});



/* ==========================================
   ROUTE 4: Detail peralatan (WEB ADMIN)
   ========================================== */
router.get('/admin/:id', async (req, res) => {
  try {
    const idParam = parseInt(req.params.id, 10);
    if (isNaN(idParam)) return res.status(400).json({ message: 'Parameter id harus angka yang valid' });

    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, idParam)
      .query(`
        SELECT 
          p.Id, p.Kode, p.Spesifikasi, p.TokenQR, p.LokasiId, p.JenisId, p.FotoPath,
          l.Nama AS LokasiNama,
          jp.Nama AS JenisNama,
          CASE WHEN p.FotoPath IS NULL OR LTRIM(RTRIM(p.FotoPath)) = ''
               THEN '[]'
               ELSE '["' + REPLACE(p.FotoPath, ';', '","') + '"]'
          END AS FotoPaths
        FROM Peralatan p
        JOIN Lokasi l ON p.LokasiId = l.Id
        JOIN JenisPeralatan jp ON p.JenisId = jp.Id
        WHERE p.Id = @id
      `);
    if (!result.recordset.length) return res.status(404).json({ message: 'Peralatan tidak ditemukan' });

    const row = result.recordset[0];
    let arr = [];
    try { arr = JSON.parse(row.FotoPaths || '[]'); } catch(_) {}
    row.FotoUrls = toAbsoluteUrls(req, arr);

    res.json(row);
  } catch (err) {
    console.error('Error fetch peralatan by ID:', err);
    res.status(500).json({ message: 'Gagal mengambil data peralatan' });
  }
});

/* ==========================================
   ROUTE 5: Create peralatan (WEB ADMIN)
   - JSON: { FotoPath: "a;b", atau FotoPaths: ["a","b"] }
   - multipart/form-data: files (multiple)
   ========================================== */
router.post('/admin', upload.array('files', 20), async (req, res) => {
  try {
    const body = req.body || {};
    const { Kode, JenisId, LokasiId, Spesifikasi } = body;
    if (!Kode || !JenisId || !LokasiId || !Spesifikasi) {
      return res.status(400).json({ message: 'Field wajib tidak boleh kosong' });
    }

    const uploaded = (req.files || []).map(f => `/uploads/peralatan/${f.filename}`);
    const fromBodyArr = Array.isArray(body.FotoPaths) ? body.FotoPaths : [];
    const fromBodySingle = body.FotoPath ? splitPaths(body.FotoPath) : [];
    const fotoList = [...fromBodyArr, ...fromBodySingle, ...uploaded].filter(Boolean);
    const fotoForDb = fotoList.length ? joinPaths(fotoList) : null;

    const pool = await poolPromise;
    const checkExist = await pool.request().input('Kode', sql.NVarChar, Kode)
      .query('SELECT COUNT(*) AS count FROM Peralatan WHERE Kode = @Kode');
    if (checkExist.recordset[0].count > 0) {
      return res.status(400).json({ message: 'Kode peralatan sudah digunakan' });
    }

    const tokenQR = uuidv4();
    await pool.request()
      .input('Kode', sql.NVarChar, Kode)
      .input('JenisId', sql.Int, JenisId)
      .input('LokasiId', sql.Int, LokasiId)
      .input('Spesifikasi', sql.NVarChar, Spesifikasi)
      .input('TokenQR', sql.UniqueIdentifier, tokenQR)
      .input('FotoPath', sql.NVarChar, fotoForDb)
      .query(`
        INSERT INTO Peralatan (Kode, JenisId, LokasiId, Spesifikasi, TokenQR, FotoPath)
        VALUES (@Kode, @JenisId, @LokasiId, @Spesifikasi, @TokenQR, @FotoPath)
      `);

    res.status(201).json({
      message: 'Peralatan berhasil ditambahkan',
      tokenQR,
      fotoPaths: fotoList,
      fotoUrls: toAbsoluteUrls(req, fotoList)
    });
  } catch (err) {
    console.error('Error create peralatan:', err);
    res.status(500).json({ message: 'Gagal menyimpan peralatan', error: err.message });
  }
});

/* ==========================================
   ROUTE 6: Update peralatan (WEB ADMIN)
   - default: APPEND foto baru ke yang lama
   - set body replacePhotos=true untuk REPLACE total
   ========================================== */
router.put('/admin/:id', upload.array('files', 20), async (req, res) => {
  try {
    const idParam = parseInt(req.params.id, 10);
    if (isNaN(idParam)) return res.status(400).json({ message: 'Parameter id harus angka yang valid' });

    const body = req.body || {};
    const { Kode, JenisId, LokasiId, Spesifikasi } = body;
    if (!Kode || !JenisId || !LokasiId || !Spesifikasi) {
      return res.status(400).json({ message: 'Field wajib tidak boleh kosong' });
    }

    const pool = await poolPromise;
    const checkExist = await pool.request()
      .input('Kode', sql.NVarChar, Kode)
      .input('id', sql.Int, idParam)
      .query('SELECT COUNT(*) AS count FROM Peralatan WHERE Kode = @Kode AND Id != @id');
    if (checkExist.recordset[0].count > 0) {
      return res.status(400).json({ message: 'Kode peralatan sudah digunakan' });
    }

    const cur = await pool.request().input('id', sql.Int, idParam)
      .query('SELECT FotoPath FROM Peralatan WHERE Id = @id');
    if (!cur.recordset.length) return res.status(404).json({ message: 'Peralatan tidak ditemukan' });
    const current = splitPaths(cur.recordset[0].FotoPath);

    const uploaded = (req.files || []).map(f => `/uploads/peralatan/${f.filename}`);
    const fromBodyArr = Array.isArray(body.FotoPaths) ? body.FotoPaths : [];
    const fromBodySingle = body.FotoPath ? splitPaths(body.FotoPath) : [];
    const isReplace = String(body.replacePhotos || '').toLowerCase() === 'true';

    let merged = isReplace ? [] : current;
    merged = [...merged, ...fromBodyArr, ...fromBodySingle, ...uploaded];

    // de‑dupe sambil preserve order
    const seen = new Set();
    const finalList = merged.filter(p => (p && !seen.has(p) && seen.add(p)));

    const result = await pool.request()
      .input('id', sql.Int, idParam)
      .input('Kode', sql.NVarChar, Kode)
      .input('JenisId', sql.Int, JenisId)
      .input('LokasiId', sql.Int, LokasiId)
      .input('Spesifikasi', sql.NVarChar, Spesifikasi)
      .input('FotoPath', sql.NVarChar, finalList.length ? joinPaths(finalList) : null)
      .query(`
        UPDATE Peralatan 
        SET Kode = @Kode, JenisId = @JenisId, LokasiId = @LokasiId, Spesifikasi = @Spesifikasi, FotoPath = @FotoPath
        WHERE Id = @id
      `);

    if (result.rowsAffected[0] === 0) return res.status(404).json({ message: 'Peralatan tidak ditemukan' });

    res.json({
      message: 'Peralatan berhasil diupdate',
      fotoPaths: finalList,
      fotoUrls: toAbsoluteUrls(req, finalList)
    });
  } catch (err) {
    console.error('❌ Error update peralatan:', err);
    res.status(500).json({ message: 'Gagal update peralatan', error: err.message });
  }
});

/* ==========================================
   ROUTE 7: Delete peralatan (WEB ADMIN)
   ========================================== */
router.delete('/admin/:id', async (req, res) => {
  try {
    const idParam = parseInt(req.params.id, 10);
    if (isNaN(idParam)) return res.status(400).json({ message: 'Parameter id harus angka yang valid' });

    const pool = await poolPromise;
    const checkUsage = await pool.request().input('id', sql.Int, idParam)
      .query('SELECT COUNT(*) AS count FROM HasilPemeriksaan WHERE PeralatanId = @id');
    if (checkUsage.recordset[0].count > 0) {
      return res.status(400).json({ message: 'Peralatan tidak dapat dihapus karena sudah memiliki riwayat pemeriksaan' });
    }

    const result = await pool.request().input('id', sql.Int, idParam)
      .query('DELETE FROM Peralatan WHERE Id = @id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ message: 'Peralatan tidak ditemukan' });

    res.json({ message: 'Peralatan berhasil dihapus' });
  } catch (err) {
    console.error('Error delete peralatan:', err);
    res.status(500).json({ message: 'Gagal menghapus peralatan', error: err.message });
  }
});

/* ==========================================
   ROUTE 8: Generate QR (WEB ADMIN)
   ========================================== */
router.get('/admin/:id/qr', async (req, res) => {
  try {
    const idParam = parseInt(req.params.id, 10);
    if (isNaN(idParam)) return res.status(400).json({ message: 'Parameter id harus angka yang valid' });

    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, idParam)
      .query(`
        SELECT p.TokenQR, p.Kode, l.Nama AS LokasiNama, jp.Nama AS JenisNama
        FROM Peralatan p
        JOIN Lokasi l ON p.LokasiId = l.Id
        JOIN JenisPeralatan jp ON p.JenisId = jp.Id
        WHERE p.Id = @id
      `);
    if (!result.recordset.length) return res.status(404).json({ message: 'Peralatan tidak ditemukan' });

    const { TokenQR, Kode, LokasiNama, JenisNama } = result.recordset[0];
    const qrData = JSON.stringify({
      id: TokenQR, kode: Kode, type: "equipment",
      lokasi: LokasiNama, jenis: JenisNama, timestamp: new Date().toISOString()
    });
    const encodedData = encodeURIComponent(qrData);
    res.json({
      tokenQR: TokenQR,
      kode: Kode,
      qrData,
      qrUrls: {
        small:  `https://api.qrserver.com/v1/create-qr-code/?size=200x200&ecc=M&format=png&data=${encodedData}`,
        medium: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&ecc=M&format=png&data=${encodedData}`,
        large:  `https://api.qrserver.com/v1/create-qr-code/?size=400x400&ecc=H&format=png&data=${encodedData}`
      },
      metadata: { lokasi: LokasiNama, jenis: JenisNama, generated: new Date().toISOString() }
    });
  } catch (err) {
    console.error('Error get QR:', err);
    res.status(500).json({ message: 'Gagal mengambil QR Code', error: err.message });
  }
});

/* ==========================================================
   (Opsional) Endpoint khusus foto: append & delete by path
   ========================================================== */
router.post('/admin/:id/photos', upload.array('files', 20), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: 'Id tidak valid' });

    const pool = await poolPromise;
    const cur = await pool.request().input('id', sql.Int, id)
      .query('SELECT FotoPath FROM Peralatan WHERE Id = @id');
    if (!cur.recordset.length) return res.status(404).json({ message: 'Peralatan tidak ditemukan' });

    const current = splitPaths(cur.recordset[0].FotoPath);
    const uploaded = (req.files || []).map(f => `/uploads/peralatan/${f.filename}`);
    const updated = [...current, ...uploaded];

    await pool.request()
      .input('id', sql.Int, id)
      .input('FotoPath', sql.NVarChar, joinPaths(updated))
      .query('UPDATE Peralatan SET FotoPath = @FotoPath WHERE Id = @id');

    res.json({ message: 'Foto ditambahkan', fotoPaths: updated, fotoUrls: toAbsoluteUrls(req, updated) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal menambah foto' });
  }
});

router.delete('/admin/:id/photos', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { path: target } = req.body || {};
    if (isNaN(id) || !target) return res.status(400).json({ message: 'Parameter tidak valid' });

    const pool = await poolPromise;
    const cur = await pool.request().input('id', sql.Int, id)
      .query('SELECT FotoPath FROM Peralatan WHERE Id = @id');
    if (!cur.recordset.length) return res.status(404).json({ message: 'Peralatan tidak ditemukan' });

    const filtered = splitPaths(cur.recordset[0].FotoPath).filter(p => p !== target);
    await pool.request()
      .input('id', sql.Int, id)
      .input('FotoPath', sql.NVarChar, filtered.length ? joinPaths(filtered) : null)
      .query('UPDATE Peralatan SET FotoPath = @FotoPath WHERE Id = @id');

    // Hapus file fisik (aman: hanya by filename yang ada di UP_BASE)
    const filename = path.basename(target);
    const physical = path.join(UP_BASE, filename);
    if (fs.existsSync(physical)) {
      try { fs.unlinkSync(physical); } catch (_) {}
    }

    res.json({ message: 'Foto dihapus', fotoPaths: filtered, fotoUrls: toAbsoluteUrls(req, filtered) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Gagal menghapus foto' });
  }
});

// DEBUG: lihat lokasi yang dipakai & contoh alat
router.get('/debug/by-badge/:badge', async (req, res) => {
  try {
    const badge = String(req.params.badge || '').trim().toUpperCase();
    const pool  = await poolPromise;

    // petugas
    const pet = await pool.request()
      .input('badge', sql.NVarChar, badge)
      .query(`
        SELECT TOP 1 p.Id AS PetugasId, p.BadgeNumber, p.Role, p.IntervalPetugasId, p.LokasiId
        FROM dbo.Petugas p
        WHERE UPPER(LTRIM(RTRIM(p.BadgeNumber))) = @badge
      `);

    const petugas = pet.recordset[0] || null;
    if (!petugas) {
      return res.json({ inputBadge: badge, petugas: null, lokasiIds: [], perLokasiCounts: {}, sampleItems: [] });
    }

    // lokasi yang di-PIC
    const lokPIC = await pool.request()
      .input('pid', sql.Int, petugas.PetugasId)
      .query(`SELECT l.Id, l.Nama FROM dbo.Lokasi l WHERE l.PIC_PetugasId = @pid`);

    // kumpulkan kandidat lokasi
    const set = new Set();
    if (petugas.LokasiId != null) set.add(Number(petugas.LokasiId));
    for (const r of lokPIC.recordset) set.add(Number(r.Id));
    const lokasiIds = Array.from(set);

    // hitung jumlah peralatan per lokasi
    const perLokasiCounts = {};
    for (const lid of lokasiIds) {
      const c = await pool.request()
        .input('lid', sql.Int, lid)
        .query(`SELECT COUNT(*) AS n FROM dbo.Peralatan WHERE LokasiId = @lid`);
      perLokasiCounts[lid] = c.recordset[0]?.n || 0;
    }

    // ambil sampel alat dari lokasi pertama (max 10)
    let sampleItems = [];
    if (lokasiIds.length) {
      const top = lokasiIds[0];
      const samp = await pool.request()
        .input('lid', sql.Int, top)
        .query(`
          SELECT TOP 10 a.Id, COALESCE(a.NoApar, a.Kode) AS NoApar, a.LokasiId, l.Nama AS NamaLokasi
          FROM dbo.Peralatan a LEFT JOIN dbo.Lokasi l ON l.Id = a.LokasiId
          WHERE a.LokasiId = @lid
          ORDER BY a.Id DESC
        `);
      sampleItems = samp.recordset;
    }

    res.json({ inputBadge: badge, petugas, lokasiIds, perLokasiCounts, sampleItems });
  } catch (err) {
    console.error('[debug/by-badge] error', err);
    res.status(500).json({ message: 'debug error' });
  }
});

/* ===============================================================
   OFFLINE MANIFEST — daftar token untuk disiapkan offline
   GET /api/peralatan/offline/manifest?badge=BN-01&daysAhead=7&page=1&pageSize=300
   Opsional:
     - daysAhead (default 0) : ambil yang due/overdue <= today+N hari
     - page (default 1), pageSize (default 300, max 500)
     - lokasiId, jenisId : filter opsional
     - fields=minimal | default (default)
   Logika:
     - Jika badge punya role 'rescue' => cakupan global (semua lokasi)
     - Selain itu => batasi by LokasiId petugas &/atau lokasi di mana dia PIC
   =============================================================== */
router.get('/offline/manifest', async (req, res) => {
  try {
    const pool = await poolPromise;

    const badge     = String(req.query.badge || '').trim();
    const daysAhead = Math.max(0, parseInt(req.query.daysAhead ?? '0', 10) || 0);
    const page      = Math.max(1, parseInt(req.query.page ?? '1', 10) || 1);
    const pageSize  = Math.min(500, Math.max(1, parseInt(req.query.pageSize ?? '300', 10) || 300));
    const lokasiId  = req.query.lokasiId ? parseInt(req.query.lokasiId, 10) : null;
    const jenisId   = req.query.jenisId  ? parseInt(req.query.jenisId, 10)  : null;
    const fields    = (String(req.query.fields || 'default').toLowerCase());

    // Deteksi mode rescue/non-rescue
    const pet = await pool.request()
      .input('badge', sql.NVarChar, badge)
      .query(`
        SELECT TOP 1 p.Id AS PetugasId, p.LokasiId,
               COALESCE(LOWER(rp.NamaRole),'') AS RoleName
        FROM Petugas p
        LEFT JOIN RolePetugas rp ON rp.Id = p.RolePetugasId
        WHERE LTRIM(RTRIM(p.BadgeNumber)) = @badge
      `);
    const petRow   = pet.recordset[0] || null;
    const isRescue = !!(petRow && petRow.RoleName.includes('rescue'));
    const petLokId = petRow?.LokasiId ?? null;

    // Paging
    const offset = (page - 1) * pageSize;

    // Query inti:
    // - Ambil peralatan dengan last inspection & next due (pakai interval default jenis)
    // - Filter due <= today+daysAhead
    // - Filter cakupan (rescue = global; non-rescue = lokasi petugas atau PICnya)
    const q = await pool.request()
      .input('days', sql.Int, daysAhead)
      .input('lokasiId', sql.Int, lokasiId || 0)
      .input('jenisId',  sql.Int, jenisId  || 0)
      .input('petLok',   sql.Int, petLokId || 0)
      .input('badge',    sql.NVarChar, badge)
      .query(`
DECLARE @TodayPlus DATE = CAST(DATEADD(DAY, @days, GETDATE()) AS DATE);

WITH ScopeLokasi AS (
  SELECT l.Id
  FROM Lokasi l
  WHERE 1=1
    AND (
      @badge = '' OR EXISTS (
        SELECT 1 FROM Petugas p
        WHERE p.LokasiId = l.Id AND LTRIM(RTRIM(p.BadgeNumber)) = @badge
      )
      OR EXISTS (
        SELECT 1 FROM Lokasi lx
        JOIN Petugas px ON lx.PIC_PetugasId = px.Id
        WHERE lx.Id = l.Id AND LTRIM(RTRIM(px.BadgeNumber)) = @badge
      )
    )
),
Filtered AS (
  SELECT p.Id, p.Kode, p.TokenQR, p.LokasiId, p.JenisId, l.Nama AS LokasiNama, j.Nama AS JenisNama,
         li.LastDate,
         CASE WHEN li.LastDate IS NULL THEN NULL
              ELSE DATEADD(MONTH, j.IntervalPemeriksaanBulan, li.LastDate)
         END AS NextDueDate
  FROM Peralatan p
  JOIN JenisPeralatan j ON j.Id = p.JenisId
  JOIN Lokasi l          ON l.Id = p.LokasiId
  OUTER APPLY (
    SELECT MAX(hp.TanggalPemeriksaan) AS LastDate
    FROM HasilPemeriksaan hp
    WHERE hp.PeralatanId = p.Id
  ) li
  WHERE
    (@jenisId = 0 OR p.JenisId = @jenisId)
    AND (@lokasiId = 0 OR p.LokasiId = @lokasiId)
    AND (
      @badge = '' OR
      ${isRescue ? '1=1' : ' (p.LokasiId = @petLok OR p.LokasiId IN (SELECT Id FROM ScopeLokasi)) '}
    )
)
SELECT *
FROM (
  SELECT
    f.Id           AS id_apar,
    f.TokenQR      AS token_qr,
    f.Kode         AS kode,
    ${fields === 'minimal' ? `
      NULL AS lokasi_nama, NULL AS jenis_nama,
    ` : `
      f.LokasiNama  AS lokasi_nama,
      f.JenisNama   AS jenis_nama,
    `}
    f.LastDate     AS last_inspection,
    f.NextDueDate  AS next_due_date
  FROM Filtered f
  WHERE
    (f.NextDueDate IS NULL) OR
    (CAST(f.NextDueDate AS DATE) <= @TodayPlus)
) z
ORDER BY z.kode
OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY;
      `);

    res.json(q.recordset || []);
  } catch (err) {
    console.error('GET /api/peralatan/offline/manifest error', err);
    res.status(500).json({ message: 'Server error' });
  }
});


/* ===============================================================
   OFFLINE DETAILS (BULK) — detail minimal + checklist per token
   POST /api/peralatan/offline/details
   Body: { tokens: ["uuid-qr-1", "uuid-qr-2", ...] }
   Output (array):
     - id_apar, token_qr, kode, lokasi_nama, jenis_nama
     - defaultIntervalBulan, last_inspection_date, nextDueDate, daysUntilDue
     - checklist: [{ checklistId, Pertanyaan }]
   =============================================================== */
router.post('/offline/details', async (req, res) => {
  try {
    const pool = await poolPromise;
    const tokens = Array.isArray(req.body?.tokens) ? req.body.tokens : [];

    if (!tokens.length) return res.json([]);

    const jsonTokens = JSON.stringify(tokens.map(String));

    const r = await pool.request()
      .input('tokens', sql.NVarChar(sql.MAX), jsonTokens)
      .query(`
DECLARE @t TABLE (Token UNIQUEIDENTIFIER);
INSERT INTO @t(Token)
SELECT TRY_CONVERT(uniqueidentifier, value)
FROM OPENJSON(@tokens)
WHERE TRY_CONVERT(uniqueidentifier, value) IS NOT NULL;

WITH Target AS (
  SELECT p.Id, p.Kode, p.TokenQR, p.JenisId, p.LokasiId
  FROM Peralatan p
  WHERE p.TokenQR IN (SELECT Token FROM @t)
),
LastInspect AS (
  SELECT hp.PeralatanId, MAX(hp.TanggalPemeriksaan) AS LastDate
  FROM HasilPemeriksaan hp
  WHERE hp.PeralatanId IN (SELECT Id FROM Target)
  GROUP BY hp.PeralatanId
)
SELECT 
  tg.Id                        AS id_apar,
  tg.TokenQR                   AS token_qr,
  tg.Kode                      AS kode,
  l.Nama                       AS lokasi_nama,
  jp.Nama                      AS jenis_nama,
  jp.IntervalPemeriksaanBulan AS defaultIntervalBulan,
  li.LastDate                  AS last_inspection_date,
  CASE WHEN li.LastDate IS NULL THEN NULL
       ELSE DATEADD(MONTH, jp.IntervalPemeriksaanBulan, li.LastDate)
  END                          AS nextDueDate,
  DATEDIFF(DAY, GETDATE(),
           CASE WHEN li.LastDate IS NULL THEN GETDATE()
                ELSE DATEADD(MONTH, jp.IntervalPemeriksaanBulan, li.LastDate)
           END)                AS daysUntilDue,
  (
    SELECT JSON_QUERY('[' +
      STRING_AGG(
        '{"checklistId":'+CAST(c.Id AS varchar(10))+',"Pertanyaan":"'+REPLACE(c.Pertanyaan,'"','\\"')+'"}',
        ','
      ) + ']'
    )
    FROM Checklist c WHERE c.JenisId = jp.Id
  )                            AS checklist
FROM Target tg
JOIN JenisPeralatan jp ON jp.Id = tg.JenisId
JOIN Lokasi l          ON l.Id = tg.LokasiId
LEFT JOIN LastInspect li ON li.PeralatanId = tg.Id
ORDER BY tg.Kode ASC;
      `);

    // Kembalikan sebagai array obyek
    const rows = (r.recordset || []).map(row => {
      let checklist = [];
      try { checklist = JSON.parse(row.checklist || '[]'); } catch(_) {}
      return { ...row, checklist };
    });

    res.json(rows);
  } catch (err) {
    console.error('POST /api/peralatan/offline/details error', err);
    res.status(500).json({ message: 'Server error' });
  }
});


/* ===============================================================
   FALLBACK paging ringan — bila perlu iterasi semua
   GET /api/peralatan/tokens-page?page=1&pageSize=500
   =============================================================== */
router.get('/tokens-page', async (req, res) => {
  try {
    const pool = await poolPromise;
    const page     = Math.max(1, parseInt(req.query.page ?? '1', 10) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize ?? '500', 10) || 500));
    const offset   = (page - 1) * pageSize;

    const q = await pool.request().query(`
      SELECT Id AS id_apar, TokenQR AS token_qr, Kode AS kode
      FROM Peralatan
      ORDER BY Kode
      OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY;
    `);

    res.json(q.recordset || []);
  } catch (err) {
    console.error('GET /api/peralatan/tokens-page error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
