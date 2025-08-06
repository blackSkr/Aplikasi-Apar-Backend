// routes/PeralatanRoutes.js

const express        = require('express');
const router         = express.Router();
const { poolPromise, sql } = require('../ConfigDB');
const { v4: uuidv4 } = require('uuid');

// ─── ROUTE 1: Peralatan dasar (mobile), filter by badge → lokasi kerja petugas ───
router.get('/', async (req, res) => {
  try {
    let { badge } = req.query;
    if (typeof badge === 'string') badge = badge.trim().toUpperCase();
    if (!badge) return res.json([]);

    const pool = await poolPromise;

    // Ambil data petugas + interval
    const petugasRes = await pool.request()
      .input('badge', sql.NVarChar, badge)
      .query(`
        SELECT p.Id, p.LokasiId, p.IntervalPetugasId, ip.NamaInterval, ip.Bulan AS IntervalBulan
        FROM Petugas p
        LEFT JOIN IntervalPetugas ip ON p.IntervalPetugasId = ip.Id
        WHERE LTRIM(RTRIM(UPPER(p.BadgeNumber))) = @badge
      `);
    if (!petugasRes.recordset.length) return res.json([]);
    const petugas = petugasRes.recordset[0];

    // 🚩 Peralatan + last maintenance (petugas)
    const result = await pool.request()
      .input('PetugasId', sql.Int, petugas.Id)
      .input('PetugasLokasiId', sql.Int, petugas.LokasiId)
      .input('IntervalBulan', sql.Int, petugas.IntervalBulan)
      .query(`
        WITH LastCheck AS (
          SELECT PeralatanId, MAX(TanggalPemeriksaan) AS TglTerakhir
          FROM HasilPemeriksaan GROUP BY PeralatanId
        )
        SELECT
          alat.Id AS id_apar,
          alat.Kode AS no_apar,
          lokasi.Nama AS lokasi_apar,
          jenis.Nama AS jenis_apar,
          COALESCE(lastcheck.TglTerakhir, NULL) AS tgl_terakhir_maintenance,
          hasil.BadgeNumber AS last_petugas_badge,
          CASE WHEN lastcheck.TglTerakhir IS NULL THEN 'Belum' ELSE 'Sudah' END AS statusMaintenance,
          CASE
            WHEN lastcheck.TglTerakhir IS NULL THEN NULL
            WHEN @IntervalBulan IS NOT NULL THEN DATEADD(MONTH, @IntervalBulan, lastcheck.TglTerakhir)
            ELSE DATEADD(MONTH, jenis.IntervalPemeriksaanBulan, lastcheck.TglTerakhir)
          END AS nextDueDate,
          COALESCE(@IntervalBulan, jenis.IntervalPemeriksaanBulan) * 30 AS interval_maintenance,
          @IntervalBulan AS interval_bulan_petugas,
          jenis.IntervalPemeriksaanBulan AS interval_bulan_default_jenis
        FROM Peralatan alat
        JOIN JenisPeralatan jenis ON alat.JenisId = jenis.Id
        JOIN Lokasi lokasi ON alat.LokasiId = lokasi.Id
        LEFT JOIN LastCheck lastcheck ON alat.Id = lastcheck.PeralatanId
        LEFT JOIN HasilPemeriksaan hasil
          ON alat.Id = hasil.PeralatanId AND hasil.TanggalPemeriksaan = lastcheck.TglTerakhir
        WHERE
          (alat.LokasiId = @PetugasLokasiId
           OR alat.LokasiId IN (SELECT Id FROM Lokasi WHERE PIC_PetugasId = @PetugasId))
        ORDER BY alat.Kode;
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('🔥 SQL Error (peralatan):', err);
    res.json([]);
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
