// routes/PeralatanRoutes.js

const express        = require('express');
const router         = express.Router();
const { poolPromise, sql } = require('../ConfigDB');
const { v4: uuidv4 } = require('uuid');

// ─── ROUTE 1: Peralatan dasar (mobile), filter by badge → lokasi kerja petugas ───
// ─── ROUTE: Daftar peralatan + next due + kuota petugas ─────────────────────────
router.get('/', async (req, res) => {
  const badge = (req.query.badge||'').trim().toUpperCase();
  if (!badge) return res.json([]);

  try {
    const pool = await poolPromise;
    const { recordset } = await pool.request()
      .input('badge', sql.NVarChar, badge)
      .query(`
WITH PetugasInfo AS (
  SELECT 
    p.Id           AS PetugasId,
    p.LokasiId     AS PetugasLokasiId,
    ip.Bulan       AS IntervalBulanPetugas
  FROM Petugas p
  LEFT JOIN IntervalPetugas ip 
    ON p.IntervalPetugasId = ip.Id
  WHERE UPPER(LTRIM(RTRIM(p.BadgeNumber))) = @badge
),
LastCheck AS (
  SELECT
    hp.PeralatanId,
    hp.TanggalPemeriksaan    AS last_inspection,
    hp.BadgeNumber           AS badge_petugas,
    ROW_NUMBER() OVER(
      PARTITION BY hp.PeralatanId 
      ORDER BY hp.TanggalPemeriksaan DESC
    ) AS rn
  FROM HasilPemeriksaan hp
),
InspeksiBlnIni AS (
  SELECT 
    hp.BadgeNumber, 
    COUNT(*) AS TotalInspeksi
  FROM HasilPemeriksaan hp
  WHERE 
    MONTH(hp.TanggalPemeriksaan) = MONTH(GETDATE())
    AND YEAR(hp.TanggalPemeriksaan) = YEAR(GETDATE())
  GROUP BY hp.BadgeNumber
)
SELECT
  a.Id                      AS id_apar,
  a.Kode                    AS no_apar,
  l.Nama                    AS lokasi_apar,
  j.Nama                    AS jenis_apar,
  pi.IntervalBulanPetugas   AS kuota_per_bulan,
  lc.last_inspection,
  CASE
    WHEN lc.last_inspection IS NULL THEN NULL
    WHEN pi.IntervalBulanPetugas IS NOT NULL
      THEN DATEADD(MONTH, pi.IntervalBulanPetugas, lc.last_inspection)
    ELSE DATEADD(MONTH, j.IntervalPemeriksaanBulan, lc.last_inspection)
  END                        AS next_due_date,
  lc.badge_petugas,
  ISNULL(ib.TotalInspeksi, 0)       AS sudah_inspeksi,
  (pi.IntervalBulanPetugas - ISNULL(ib.TotalInspeksi, 0)) AS sisa_kuota
FROM Peralatan a
CROSS JOIN PetugasInfo pi
LEFT JOIN LastCheck lc 
  ON lc.PeralatanId = a.Id 
  AND lc.rn = 1           -- hanya pemeriksaan terakhir
LEFT JOIN InspeksiBlnIni ib 
  ON ib.BadgeNumber = @badge
JOIN JenisPeralatan j 
  ON a.JenisId = j.Id
JOIN Lokasi l 
  ON a.LokasiId = l.Id
WHERE 
  a.LokasiId = pi.PetugasLokasiId
  OR a.LokasiId IN (
    SELECT Id FROM Lokasi WHERE PIC_PetugasId = pi.PetugasId
  )
ORDER BY a.Kode;

      `);

    res.json(recordset);
  } catch (err) {
    console.error('🔥 SQL Error (peralatan):', err);
    res.status(500).json({ message: 'Gagal load peralatan' });
  }
});


// ─── ROUTE 1B: ENHANCED VERSION ───────────────────────────────────────────────────
router.get('/enhanced', async (req, res) => {
  try {
    let { badge } = req.query;
    badge = (badge || '').trim().toUpperCase();
    if (!badge) {
      return res.json([]);
    }

    const pool = await poolPromise;
    const sqlText = `/* … sama seperti sebelumnya … */`;
    const enhanced = await pool.request()
      .input('badge', sql.NVarChar, badge)
      .query(sqlText);

    res.json(enhanced.recordset);
  } catch (err) {
    console.error('🔥 SQL Error (peralatan enhanced):', err);
    res.json([]);
  }
});

// ─── ROUTE 2: Peralatan + checklist + petugas-interval (mobile) ────────────────────
router.get('/with-checklist', async (req, res) => {
  try {
    let { id, badge } = req.query;
    badge = (badge || '').trim().toUpperCase();
    const aparId = parseInt(id, 10);

    if (isNaN(aparId)) {
      return res.status(400).json({ message: 'Parameter id wajib angka valid' });
    }

    const pool = await poolPromise;

    // Petugas Info
    const petugasRes = await pool.request()
      .input('badge', sql.NVarChar, badge)
      .query(`
        SELECT p.Id, p.LokasiId, p.IntervalPetugasId, ip.NamaInterval, ip.Bulan AS IntervalBulan
        FROM Petugas p
        LEFT JOIN IntervalPetugas ip ON p.IntervalPetugasId = ip.Id
        WHERE LTRIM(RTRIM(UPPER(p.BadgeNumber))) = @badge
      `);
    if (!petugasRes.recordset.length) {
      return res.status(404).json({ message: 'Petugas tidak ditemukan' });
    }
    const petugas = petugasRes.recordset[0];

    const result = await pool.request()
      .input('id', sql.Int, aparId)
      .input('intervalBulan', petugas.IntervalBulan)
      .query(`
        WITH LastInspection AS (
          SELECT PeralatanId, MAX(TanggalPemeriksaan) AS LastDate
          FROM HasilPemeriksaan WHERE PeralatanId = @id GROUP BY PeralatanId
        )
        SELECT 
          p.Id                             AS id_apar,
          p.Kode                           AS no_apar,
          l.Nama                           AS lokasi_apar,
          jp.Nama                          AS jenis_apar,
          @intervalBulan                   AS intervalPetugasId,
          ip.NamaInterval                  AS namaIntervalPetugas,
          @intervalBulan                   AS bulanIntervalPetugas,
          jp.IntervalPemeriksaanBulan      AS defaultIntervalBulan,
          li.LastDate                      AS last_inspection_date,
          CASE
            WHEN li.LastDate IS NULL THEN NULL
            WHEN @intervalBulan IS NOT NULL THEN DATEADD(MONTH, @intervalBulan, li.LastDate)
            ELSE DATEADD(MONTH, jp.IntervalPemeriksaanBulan, li.LastDate)
          END                              AS nextDueDate,
          jp.IntervalPemeriksaanBulan * 30 AS interval_maintenance,
          (
            SELECT JSON_QUERY('[' +
              STRING_AGG(
                '{"checklistId":'+CAST(c.Id AS varchar(10))+',"Pertanyaan":"'+REPLACE(c.Pertanyaan,'\"','\\\"')+'"}'
              , ',') + ']'
            )
            FROM Checklist c WHERE c.JenisId = p.JenisId
          ) AS keperluan_check
        FROM Peralatan p
        JOIN JenisPeralatan jp ON p.JenisId = jp.Id
        JOIN Lokasi l         ON p.LokasiId = l.Id
        LEFT JOIN LastInspection li ON p.Id = li.PeralatanId
        LEFT JOIN IntervalPetugas ip ON ip.Id = @intervalBulan
        WHERE p.Id = @id
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ message: 'Peralatan tidak ditemukan' });
    }
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('🔥 SQL Error (with-checklist):', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── ROUTE 3: List peralatan untuk WEB ADMIN ───────────────────────────────────────
router.get('/admin', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        p.Id, p.Kode, p.Spesifikasi, p.TokenQR,
        l.Nama AS LokasiNama, l.Id AS LokasiId,
        jp.Nama AS JenisNama, jp.Id AS JenisId,
        jp.IntervalPemeriksaanBulan
      FROM Peralatan p
      JOIN Lokasi l ON p.LokasiId = l.Id
      JOIN JenisPeralatan jp ON p.JenisId = jp.Id
      ORDER BY p.Kode
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetch peralatan admin:', err);
    res.status(500).json({ message: 'Gagal mengambil data peralatan', error: err.message });
  }
});

// ─── ROUTE 4: Get peralatan by ID untuk WEB ADMIN ─────────────────────────────────
router.get('/admin/:id', async (req, res) => {
  try {
    const idParam = parseInt(req.params.id, 10);
    if (isNaN(idParam)) {
      return res.status(400).json({ message: 'Parameter id harus angka yang valid' });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, idParam)
      .query(`
        SELECT 
          p.Id, p.Kode, p.Spesifikasi, p.TokenQR, p.LokasiId, p.JenisId,
          l.Nama AS LokasiNama,
          jp.Nama AS JenisNama
        FROM Peralatan p
        JOIN Lokasi l ON p.LokasiId = l.Id
        JOIN JenisPeralatan jp ON p.JenisId = jp.Id
        WHERE p.Id = @id
      `);
    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Peralatan tidak ditemukan' });
    }
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('Error fetch peralatan by ID:', err);
    res.status(500).json({ message: 'Gagal mengambil data peralatan' });
  }
});

// ─── ROUTE 5: Create peralatan untuk WEB ADMIN ────────────────────────────────────
router.post('/admin', async (req, res) => {
  try {
    const { Kode, JenisId, LokasiId, Spesifikasi } = req.body;
    if (!Kode || !JenisId || !LokasiId || !Spesifikasi) {
      return res.status(400).json({ message: 'Field wajib tidak boleh kosong' });
    }
    const pool = await poolPromise;
    const checkExist = await pool.request()
      .input('Kode', sql.NVarChar, Kode)
      .query('SELECT COUNT(*) as count FROM Peralatan WHERE Kode = @Kode');
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
      .query(`
        INSERT INTO Peralatan (Kode, JenisId, LokasiId, Spesifikasi, TokenQR)
        VALUES (@Kode, @JenisId, @LokasiId, @Spesifikasi, @TokenQR)
      `);
    res.status(201).json({ message: 'Peralatan berhasil ditambahkan', tokenQR });
  } catch (err) {
    console.error('Error create peralatan:', err);
    res.status(500).json({ message: 'Gagal menyimpan peralatan', error: err.message });
  }
});

// ─── ROUTE 6: Update peralatan untuk WEB ADMIN ────────────────────────────────────
router.put('/admin/:id', async (req, res) => {
  try {
    const idParam = parseInt(req.params.id, 10);
    if (isNaN(idParam)) {
      return res.status(400).json({ message: 'Parameter id harus angka yang valid' });
    }
    const { Kode, JenisId, LokasiId, Spesifikasi } = req.body;
    if (!Kode || !JenisId || !LokasiId || !Spesifikasi) {
      return res.status(400).json({ message: 'Field wajib tidak boleh kosong' });
    }
    const pool = await poolPromise;
    const checkExist = await pool.request()
      .input('Kode', sql.NVarChar, Kode)
      .input('id', sql.Int, idParam)
      .query('SELECT COUNT(*) as count FROM Peralatan WHERE Kode = @Kode AND Id != @id');
    if (checkExist.recordset[0].count > 0) {
      return res.status(400).json({ message: 'Kode peralatan sudah digunakan' });
    }
    const result = await pool.request()
      .input('id', sql.Int, idParam)
      .input('Kode', sql.NVarChar, Kode)
      .input('JenisId', sql.Int, JenisId)
      .input('LokasiId', sql.Int, LokasiId)
      .input('Spesifikasi', sql.NVarChar, Spesifikasi)
      .query(`
        UPDATE Peralatan 
        SET Kode = @Kode, JenisId = @JenisId, LokasiId = @LokasiId, Spesifikasi = @Spesifikasi
        WHERE Id = @id
      `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Peralatan tidak ditemukan' });
    }
    res.json({ message: 'Peralatan berhasil diupdate' });
  } catch (err) {
    console.error('❌ Error update peralatan:', err);
    res.status(500).json({ message: 'Gagal update peralatan', error: err.message });
  }
});

// ─── ROUTE 7: Delete peralatan untuk WEB ADMIN ────────────────────────────────────
router.delete('/admin/:id', async (req, res) => {
  try {
    const idParam = parseInt(req.params.id, 10);
    if (isNaN(idParam)) {
      return res.status(400).json({ message: 'Parameter id harus angka yang valid' });
    }
    const pool = await poolPromise;
    const checkUsage = await pool.request()
      .input('id', sql.Int, idParam)
      .query('SELECT COUNT(*) as count FROM HasilPemeriksaan WHERE PeralatanId = @id');
    if (checkUsage.recordset[0].count > 0) {
      return res.status(400).json({ message: 'Peralatan tidak dapat dihapus karena sudah memiliki riwayat pemeriksaan' });
    }
    const result = await pool.request()
      .input('id', sql.Int, idParam)
      .query('DELETE FROM Peralatan WHERE Id = @id');
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Peralatan tidak ditemukan' });
    }
    res.json({ message: 'Peralatan berhasil dihapus' });
  } catch (err) {
    console.error('Error delete peralatan:', err);
    res.status(500).json({ message: 'Gagal menghapus peralatan', error: err.message });
  }
});

// ─── ROUTE 8: Generate QR untuk WEB ADMIN ────────────────────────────────────────
router.get('/admin/:id/qr', async (req, res) => {
  try {
    const idParam = parseInt(req.params.id, 10);
    if (isNaN(idParam)) {
      return res.status(400).json({ message: 'Parameter id harus angka yang valid' });
    }
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
    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Peralatan tidak ditemukan' });
    }
    const { TokenQR, Kode, LokasiNama, JenisNama } = result.recordset[0];
    const qrData = JSON.stringify({
      id: TokenQR,
      kode: Kode,
      type: "equipment",
      lokasi: LokasiNama,
      jenis: JenisNama,
      timestamp: new Date().toISOString()
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

module.exports = router;
