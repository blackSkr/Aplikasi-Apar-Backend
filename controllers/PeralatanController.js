// controllers/PeralatanController.js
const PeralatanModel = require('../models/Peralatan');
const { poolPromise, sql } = require('../ConfigDB');
const { v4: uuidv4 } = require('uuid');

const PeralatanController = {
  // ROUTE 1 (WEB/MOBILE): Daftar peralatan dasar
  async index(req, res) {
    try {
      const data = await PeralatanModel.getAll();
      res.json(data);
    } catch (error) {
      console.error('Error fetch peralatan:', error);
      res.status(500).json({ message: 'Terjadi kesalahan saat mengambil data peralatan.' });
    }
  },

  // ROUTE 1B (MOBILE): Daftar peralatan + inspeksi terakhir & next due (default jenis)
  async withInspection(req, res) {
    try {
      const data = await PeralatanModel.getWithInspection();
      res.json(data);
    } catch (error) {
      console.error('Error fetch with inspection:', error);
      res.status(500).json({ message: 'Gagal mengambil data peralatan + inspeksi.' });
    }
  },

  // ROUTE STORE (WEB ADMIN): Tambah peralatan baru
  async store(req, res) {
    try {
      const data = req.body;
      data.TokenQR = uuidv4();
      await PeralatanModel.create(data);
      res.status(201).json({ message: 'Data peralatan berhasil ditambahkan.' });
    } catch (error) {
      console.error('Error insert peralatan:', error);
      res.status(500).json({ message: 'Gagal menyimpan data peralatan.' });
    }
  },

  // ROUTE ENHANCED (MOBILE): peralatan + interval petugas + next due per petugas
  async enhanced(req, res) {
    try {
      let { badge } = req.query;
      if (typeof badge === 'string') badge = badge.trim();
      if (!badge) return res.status(400).json({ message: 'Parameter badge wajib disertakan' });

      const pool = await poolPromise;
      const sqlText = `
WITH LastCheck AS (
  SELECT PeralatanId, MAX(TanggalPemeriksaan) AS TglTerakhir
  FROM HasilPemeriksaan
  GROUP BY PeralatanId
), PetugasInfo AS (
  SELECT t.Id AS PetugasId, t.LokasiId AS PetugasLokasiId,
         t.IntervalPetugasId, ip.Bulan AS IntervalBulan
  FROM Petugas t
  LEFT JOIN IntervalPetugas ip ON t.IntervalPetugasId = ip.Id
  WHERE LTRIM(RTRIM(t.BadgeNumber)) = @badge
)
SELECT
  p.Id                    AS id_apar,
  p.Kode                  AS no_apar,
  l.Nama                  AS lokasi_apar,
  jp.Nama                 AS jenis_apar,
  CASE WHEN lc.TglTerakhir IS NULL THEN 'Belum' ELSE 'Sudah' END AS statusMaintenance,
  lc.TglTerakhir          AS tgl_terakhir_maintenance,
  pi.IntervalBulan        AS interval_petugas_bulan,
  CASE 
    WHEN lc.TglTerakhir IS NULL THEN NULL
    WHEN pi.IntervalBulan IS NOT NULL THEN DATEADD(DAY, pi.IntervalBulan*30, lc.TglTerakhir)
    ELSE DATEADD(DAY, jp.IntervalPemeriksaanBulan*30, lc.TglTerakhir)
  END                      AS nextDueDate,
  COALESCE(pi.IntervalBulan*30, jp.IntervalPemeriksaanBulan*30) AS interval_maintenance
FROM Peralatan p
JOIN JenisPeralatan jp ON p.JenisId = jp.Id
JOIN Lokasi l          ON p.LokasiId = l.Id
LEFT JOIN LastCheck lc  ON p.Id = lc.PeralatanId
CROSS JOIN PetugasInfo pi
WHERE p.LokasiId = pi.PetugasLokasiId
   OR p.LokasiId IN (SELECT Id FROM Lokasi WHERE PIC_PetugasId = pi.PetugasId)
ORDER BY
  CASE
    WHEN lc.TglTerakhir IS NULL THEN 3
    WHEN DATEADD(DAY, COALESCE(pi.IntervalBulan, jp.IntervalPemeriksaanBulan)*30, lc.TglTerakhir) < GETDATE() THEN 1
    WHEN DATEADD(DAY, COALESCE(pi.IntervalBulan, jp.IntervalPemeriksaanBulan)*30, lc.TglTerakhir) <= DATEADD(DAY,7,GETDATE()) THEN 2
    ELSE 4
  END,
  p.Kode;
      `;
      const result = await pool.request()
        .input('badge', sql.NVarChar, badge)
        .query(sqlText);
      res.json(result.recordset);
    } catch (err) {
      console.error('SQL Error (enhanced):', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  },

  // ROUTE WITH-CHECKLIST (MOBILE): detail peralatan + checklist + interval petugas
  async withChecklist(req, res) {
    try {
      let { id, badge } = req.query;
      if (!id) return res.status(400).json({ message: 'Parameter id wajib disertakan' });
      badge = (badge||'').trim();

      const pool = await poolPromise;
      const sqlText = `
WITH PetugasInfo AS (
  SELECT t.Id AS PetugasId, t.IntervalPetugasId, ip.Bulan AS IntervalBulan
  FROM Petugas t
  LEFT JOIN IntervalPetugas ip ON t.IntervalPetugasId = ip.Id
  WHERE (@badge = '' OR LTRIM(RTRIM(t.BadgeNumber)) = @badge)
), LastInspection AS (
  SELECT PeralatanId, MAX(TanggalPemeriksaan) AS LastDate
  FROM HasilPemeriksaan
  WHERE PeralatanId = @id
  GROUP BY PeralatanId
)
SELECT 
  p.Id                             AS id_apar,
  p.Kode                           AS no_apar,
  l.Nama                           AS lokasi_apar,
  jp.Nama                          AS jenis_apar,
  pi.PetugasId                     AS current_petugas_id,
  pi.IntervalPetugasId             AS intervalPetugasId,
  pi.IntervalBulan                 AS bulanIntervalPetugas,
  jp.IntervalPemeriksaanBulan      AS defaultIntervalBulan,
  li.LastDate                      AS last_inspection_date,
  CASE 
    WHEN li.LastDate IS NULL THEN NULL
    WHEN pi.IntervalBulan IS NOT NULL THEN DATEADD(DAY, pi.IntervalBulan*30, li.LastDate)
    ELSE DATEADD(DAY, jp.IntervalPemeriksaanBulan*30, li.LastDate)
  END                              AS nextDueDate,
  jp.IntervalPemeriksaanBulan * 30 AS interval_maintenance,
  (
    SELECT JSON_QUERY('[' +
      STRING_AGG(
        '{"checklistId":'+CAST(c.Id AS varchar(10))+
        ',"Pertanyaan":"'+REPLACE(c.Pertanyaan, '"','\\"')+'"}', ','
      ) + ']'
    )
    FROM Checklist c
    WHERE c.JenisId = p.JenisId
  )                                AS keperluan_check
FROM Peralatan p
JOIN JenisPeralatan jp ON p.JenisId = jp.Id
JOIN Lokasi l          ON p.LokasiId = l.Id
LEFT JOIN LastInspection li ON p.Id = li.PeralatanId
CROSS JOIN PetugasInfo pi;
      `;
      const result = await pool.request()
        .input('id',    sql.Int,      id)
        .input('badge', sql.NVarChar, badge)
        .query(sqlText);
      if (result.recordset.length === 0) {
        return res.status(404).json({ message: 'Peralatan tidak ditemukan' });
      }
      res.json(result.recordset[0]);
    } catch (err) {
      console.error('SQL Error (withChecklist):', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  },
  // SCAN TOKEN QR (MOBILE): detail peralatan + checklist + interval petugas
  async withChecklistByToken(req, res) {
    try {
      let { token, badge } = req.query;
      if (!token) return res.status(400).json({ message: 'Parameter token wajib' });
      badge = (badge || '').trim();

      const pool = await poolPromise;
      const sqlText = `
  WITH Target AS (
    SELECT * FROM Peralatan WHERE TokenQR = @token
  ), PetugasInfo AS (
    SELECT t.Id AS PetugasId, t.IntervalPetugasId, ip.Bulan AS IntervalBulan
    FROM Petugas t
    LEFT JOIN IntervalPetugas ip ON t.IntervalPetugasId = ip.Id
    WHERE (@badge = '' OR LTRIM(RTRIM(t.BadgeNumber)) = @badge)
  ), LastInspection AS (
    SELECT PeralatanId, MAX(TanggalPemeriksaan) AS LastDate
    FROM HasilPemeriksaan
    WHERE PeralatanId = (SELECT Id FROM Target)
    GROUP BY PeralatanId
  )
  SELECT 
    p.Id                             AS id_apar,
    p.Kode                           AS no_apar,
    l.Nama                           AS lokasi_apar,
    jp.Nama                          AS jenis_apar,
    pi.PetugasId                     AS current_petugas_id,
    pi.IntervalPetugasId             AS intervalPetugasId,
    pi.IntervalBulan                 AS bulanIntervalPetugas,
    jp.IntervalPemeriksaanBulan      AS defaultIntervalBulan,
    li.LastDate                      AS last_inspection_date,
    CASE 
      WHEN li.LastDate IS NULL THEN NULL
      WHEN pi.IntervalBulan IS NOT NULL THEN DATEADD(DAY, pi.IntervalBulan*30, li.LastDate)
      ELSE DATEADD(DAY, jp.IntervalPemeriksaanBulan*30, li.LastDate)
    END                              AS nextDueDate,
    jp.IntervalPemeriksaanBulan * 30 AS interval_maintenance,
    (
      SELECT JSON_QUERY('[' +
        STRING_AGG(
          '{"checklistId":'+CAST(c.Id AS varchar(10))+',"Pertanyaan":"'+REPLACE(c.Pertanyaan,'"','\\"')+'"}',
          ','
        ) + ']'
      )
      FROM Checklist c
      WHERE c.JenisId = jp.Id
    )                                AS keperluan_check
  FROM Target p
  JOIN JenisPeralatan jp ON p.JenisId = jp.Id
  JOIN Lokasi l          ON p.LokasiId = l.Id
  LEFT JOIN LastInspection li ON p.Id = li.PeralatanId
  CROSS JOIN PetugasInfo pi;
      `;

      const result = await pool.request()
        .input('token', sql.UniqueIdentifier, token)
        .input('badge', sql.NVarChar, badge)
        .query(sqlText);

      if (result.recordset.length === 0) {
        return res.status(404).json({ message: 'Peralatan tidak ditemukan berdasarkan TokenQR' });
      }

      res.json(result.recordset[0]);
    } catch (err) {
      console.error('SQL Error (withChecklistByToken):', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  },

  status: async (req, res) => {
    const aparId = parseInt(req.params.aparId, 10);
    const badge  = (req.query.badge||'').trim().toUpperCase();
    if (isNaN(aparId) || !badge) {
      return res.status(400).json({
        success: false,
        message: 'Parameter aparId dan badge wajib valid'
      });
    }

    try {
      const pool = await poolPromise;
      const { recordset } = await pool.request()
        .input('aparId', sql.Int, aparId)
        .input('badge',  sql.NVarChar, badge)
        .query(`
  WITH PetugasInfo AS (
    SELECT ip.Bulan AS IntervalPetugasBln
    FROM Petugas p
    LEFT JOIN IntervalPetugas ip ON p.IntervalPetugasId = ip.Id
    WHERE LTRIM(RTRIM(UPPER(p.BadgeNumber))) = @badge
  ),
  LastIns AS (
    SELECT TOP 1 *
    FROM HasilPemeriksaan
    WHERE PeralatanId = @aparId
    ORDER BY TanggalPemeriksaan DESC
  )
  SELECT
    li.Id,
    li.TanggalPemeriksaan,
    li.Kondisi,
    p.Kode                     AS AparKode,
    l.Nama                     AS LokasiNama,
    jp.Nama                    AS JenisNama,
    pi.IntervalPetugasBln      AS kuota_petugas,
    jp.IntervalPemeriksaanBulan AS interval_default,
    CASE
      WHEN pi.IntervalPetugasBln IS NOT NULL
        THEN DATEADD(MONTH, pi.IntervalPetugasBln, li.TanggalPemeriksaan)
      ELSE DATEADD(MONTH, jp.IntervalPemeriksaanBulan, li.TanggalPemeriksaan)
    END                         AS next_due_date
  FROM LastIns li
  CROSS JOIN PetugasInfo pi
  JOIN Peralatan p       ON li.PeralatanId = p.Id
  JOIN Lokasi l          ON p.LokasiId    = l.Id
  JOIN JenisPeralatan jp ON p.JenisId     = jp.Id;
        `);

      res.json({ success: true, data: recordset[0] || null });
    } catch (err) {
      console.error('🔥 SQL Error (status):', err);
      res.status(500).json({
        success: false,
        message: 'Gagal mengambil status maintenance',
        error: err.message
      });
    }
  },


};

module.exports = PeralatanController;
