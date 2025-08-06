// controllers/PerawatanController.js
const { poolPromise, sql } = require('../ConfigDB');
const fs = require('fs');

const PerawatanController = {
  // 1) Submit maintenance data
  submit: async (req, res) => {
    let transaction;
    try {
      // parse & validasi aparId
      const aparIdRaw = req.body.aparId;
      const aparId = parseInt(aparIdRaw, 10);
      if (isNaN(aparId)) {
        return res.status(400).json({
          success: false,
          message: 'aparId harus berupa angka yang valid'
        });
      }

      const {
        tanggal,
        badgeNumber,
        intervalPetugasId: rawIntervalPetugasId,
        kondisi,
        catatanMasalah,
        rekomendasi,
        tindakLanjut,
        tekanan,
        jumlahMasalah,
        checklist
      } = req.body;

      if (!tanggal || !badgeNumber) {
        return res.status(400).json({
          success: false,
          message: 'Data wajib tidak lengkap (tanggal, badgeNumber)'
        });
      }

      const pool = await poolPromise;
      transaction = pool.transaction();
      await transaction.begin();

      // Ambil petugas
      const petugasRes = await transaction.request()
        .input('badge', sql.NVarChar, badgeNumber.trim())
        .query(`
          SELECT Id, IntervalPetugasId
          FROM Petugas
          WHERE LTRIM(RTRIM(BadgeNumber)) = @badge
        `);
      if (petugasRes.recordset.length === 0) {
        await transaction.rollback();
        return res
          .status(404)
          .json({ success: false, message: 'Petugas tidak ditemukan' });
      }
      const petugas = petugasRes.recordset[0];

      // Tentukan intervalPetugasId
      const intervalPetugasId = (rawIntervalPetugasId && rawIntervalPetugasId !== 'null')
        ? parseInt(rawIntervalPetugasId, 10)
        : petugas.IntervalPetugasId;

      // INSERT HasilPemeriksaan
      const insertRes = await transaction.request()
        .input('PeralatanId',        sql.Int,      aparId)
        .input('BadgeNumber',        sql.NVarChar, badgeNumber.trim())
        .input('TanggalPemeriksaan', sql.DateTime, new Date(tanggal))
        .input('IntervalPetugasId',  sql.Int,      intervalPetugasId)
        .input('Kondisi',            sql.NVarChar, kondisi || '')
        .input('CatatanMasalah',     sql.NVarChar, catatanMasalah || '')
        .input('Rekomendasi',        sql.NVarChar, rekomendasi || '')
        .input('TindakLanjut',       sql.NVarChar, tindakLanjut || '')
        .input('Tekanan',            sql.Float,    tekanan ? parseFloat(tekanan) : null)
        .input('JumlahMasalah',      sql.Int,      jumlahMasalah ? parseInt(jumlahMasalah, 10) : null)
        .query(`
          INSERT INTO HasilPemeriksaan (
            PeralatanId, BadgeNumber, TanggalPemeriksaan,
            IntervalPetugasId, Kondisi, CatatanMasalah,
            Rekomendasi, TindakLanjut, Tekanan, JumlahMasalah
          )
          OUTPUT INSERTED.Id
          VALUES (
            @PeralatanId, @BadgeNumber, @TanggalPemeriksaan,
            @IntervalPetugasId, @Kondisi, @CatatanMasalah,
            @Rekomendasi, @TindakLanjut, @Tekanan, @JumlahMasalah
          )
        `);
      const hasilPemeriksaanId = insertRes.recordset[0].Id;

      // INSERT ChecklistJawaban
      if (checklist) {
        let arr;
        try { arr = typeof checklist === 'string' ? JSON.parse(checklist) : checklist; }
        catch { arr = []; }

        for (const item of arr) {
          if (item.checklistId != null && item.condition != null) {
            const dicentang = item.condition === 'Baik' ? 1 : 0;
            await transaction.request()
              .input('pemeriksaanId', sql.Int, hasilPemeriksaanId)
              .input('checklistId',   sql.Int, item.checklistId)
              .input('dicentang',     sql.Bit, dicentang)
              .input('keterangan',    sql.NVarChar, item.alasan || '')
              .query(`
                INSERT INTO ChecklistJawaban
                  (PemeriksaanId, ChecklistId, Dicentang, Keterangan)
                VALUES
                  (@pemeriksaanId, @checklistId, @dicentang, @keterangan)
              `);
          }
        }
      }

      // INSERT FotoPemeriksaan
      const uploaded = [];
      if (req.files && req.files.length > 0) {
        for (const f of req.files) {
          await transaction.request()
            .input('pemeriksaanId', sql.Int, hasilPemeriksaanId)
            .input('fotoPath',      sql.NVarChar, f.path)
            .query(`
              INSERT INTO FotoPemeriksaan (PemeriksaanId, FotoPath)
              VALUES (@pemeriksaanId, @fotoPath)
            `);
          uploaded.push(f.path);
        }
      }

      await transaction.commit();
      return res.json({
        success: true,
        message: 'Maintenance berhasil disimpan',
        data: {
          hasilPemeriksaanId,
          intervalPetugasIdUsed: intervalPetugasId,
          photosUploaded: uploaded.length,
          photos: uploaded
        }
      });

    } catch (err) {
      if (transaction) await transaction.rollback();
      if (req.files) req.files.forEach(f => {
        try { fs.unlinkSync(f.path) } catch {}
      });
      console.error(err);
      return res.status(500).json({
        success: false,
        message: 'Gagal menyimpan data maintenance',
        error: err.message
      });
    }
  },

  // 2) Get latest status dengan badge
  status: async (req, res) => {
    try {
      // parse & validate aparId
      const aparId = parseInt(req.params.aparId, 10);
      if (isNaN(aparId)) {
        return res.status(400).json({
          success: false,
          message: 'Parameter aparId harus berupa angka yang valid'
        });
      }

      const badge = (req.query.badge || '').trim();
      if (!badge) {
        return res.status(400).json({
          success: false,
          message: 'badge query param wajib diisi'
        });
      }

      const pool = await poolPromise;

      // cari interval petugas
      const petugasRes = await pool.request()
        .input('badge', sql.NVarChar, badge)
        .query(`
          SELECT IntervalPetugasId
          FROM Petugas
          WHERE LTRIM(RTRIM(BadgeNumber)) = @badge
        `);
      if (!petugasRes.recordset.length) {
        return res.status(404).json({
          success: false,
          message: 'Petugas tidak ditemukan'
        });
      }
      const intervalPetugasId = petugasRes.recordset[0].IntervalPetugasId;

      // ambil last pemeriksaan + hitung next due
      const statusRes = await pool.request()
        .input('aparId', sql.Int, aparId)
        .input('intervalPetugasId', sql.Int, intervalPetugasId)
        .query(`
          SELECT TOP 1
            hp.Id,
            hp.TanggalPemeriksaan,
            hp.Kondisi,
            p.Kode         AS AparKode,
            l.Nama         AS LokasiNama,
            jp.Nama        AS JenisNama,
            hp.BadgeNumber AS PetugasBadge,
            ip.NamaInterval,
            ip.Bulan       AS IntervalBulan,
            DATEADD(DAY, ip.Bulan*30, hp.TanggalPemeriksaan) AS NextDueDate
          FROM HasilPemeriksaan hp
          JOIN Peralatan p       ON hp.PeralatanId = p.Id
          JOIN Lokasi l          ON p.LokasiId = l.Id
          JOIN JenisPeralatan jp ON p.JenisId = jp.Id
          JOIN IntervalPetugas ip ON ip.Id = @intervalPetugasId
          WHERE hp.PeralatanId = @aparId
          ORDER BY hp.TanggalPemeriksaan DESC
        `);

      return res.json({
        success: true,
        data: statusRes.recordset[0] || null
      });

    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: 'Gagal mengambil status maintenance',
        error: err.message
      });
    }
  },

  // 3) Riwayat maintenance
  history: async (req, res) => {
    try {
      // parse & validate aparId
      const aparId = parseInt(req.params.aparId, 10);
      if (isNaN(aparId)) {
        return res.status(400).json({
          success: false,
          message: 'Parameter aparId harus berupa angka yang valid'
        });
      }

      const pool = await poolPromise;
      const histRes = await pool.request()
        .input('aparId', sql.Int, aparId)
        .query(`
          SELECT
            hp.Id, hp.TanggalPemeriksaan, hp.Kondisi,
            hp.CatatanMasalah, hp.Rekomendasi, hp.TindakLanjut,
            hp.Tekanan, hp.JumlahMasalah,
            hp.BadgeNumber AS PetugasBadge,
            pt.Role        AS PetugasRole,
            ip.NamaInterval, ip.Bulan AS IntervalBulan,
            DATEADD(DAY, COALESCE(ip.Bulan, jp.IntervalPemeriksaanBulan)*30, hp.TanggalPemeriksaan) AS NextDueDateAtTime,
            p.Kode AS AparKode, l.Nama AS LokasiNama, jp.Nama AS JenisNama
          FROM HasilPemeriksaan hp
          JOIN Peralatan p       ON hp.PeralatanId = p.Id
          JOIN Lokasi l          ON p.LokasiId = l.Id
          JOIN JenisPeralatan jp ON p.JenisId = jp.Id
          LEFT JOIN Petugas pt   ON hp.BadgeNumber = pt.BadgeNumber
          LEFT JOIN IntervalPetugas ip ON hp.IntervalPetugasId = ip.Id
          WHERE hp.PeralatanId = @aparId
          ORDER BY hp.TanggalPemeriksaan DESC
        `);

      return res.json({
        success: true,
        data: histRes.recordset
      });

    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: 'Gagal mengambil riwayat maintenance',
        error: err.message
      });
    }
  },

  // 4) Detail maintenance (checklist + photos)
  details: async (req, res) => {
    try {
      // parse & validate pemeriksaan id
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          message: 'Parameter id harus berupa angka yang valid'
        });
      }

      const pool = await poolPromise;
      const mainRes = await pool.request()
        .input('id', sql.Int, id)
        .query(`
          SELECT
            hp.*, p.Kode AS AparKode, l.Nama AS LokasiNama,
            jp.Nama AS JenisNama, hp.BadgeNumber AS PetugasBadge,
            ip.NamaInterval, ip.Bulan AS IntervalBulan
          FROM HasilPemeriksaan hp
          JOIN Peralatan p       ON hp.PeralatanId = p.Id
          JOIN Lokasi l          ON p.LokasiId = l.Id
          JOIN JenisPeralatan jp ON p.JenisId = jp.Id
          LEFT JOIN IntervalPetugas ip ON hp.IntervalPetugasId = ip.Id
          WHERE hp.Id = @id
        `);

      if (!mainRes.recordset[0]) {
        return res.status(404).json({
          success: false,
          message: 'Data tidak ditemukan'
        });
      }

      const checklistRes = await pool.request()
        .input('id', sql.Int, id)
        .query(`
          SELECT cj.ChecklistId, cj.Dicentang, cj.Keterangan, c.Pertanyaan
          FROM ChecklistJawaban cj
          JOIN Checklist c ON cj.ChecklistId = c.Id
          WHERE cj.PemeriksaanId = @id
        `);

      const photosRes = await pool.request()
        .input('id', sql.Int, id)
        .query(`
          SELECT FotoPath, UploadedAt
          FROM FotoPemeriksaan
          WHERE PemeriksaanId = @id
          ORDER BY UploadedAt
        `);

      return res.json({
        success: true,
        data: {
          ...mainRes.recordset[0],
          checklist: checklistRes.recordset,
          photos: photosRes.recordset
        }
      });

    } catch (err) {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: 'Gagal mengambil detail maintenance',
        error: err.message
      });
    }
  },

  // 5) Ambil seluruh data hasil pemeriksaan
all: async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT
        hp.Id, hp.TanggalPemeriksaan, hp.Kondisi,
        hp.CatatanMasalah, hp.Rekomendasi, hp.TindakLanjut,
        hp.Tekanan, hp.JumlahMasalah,
        hp.BadgeNumber AS PetugasBadge,
        pt.Role        AS PetugasRole,
        ip.NamaInterval, ip.Bulan AS IntervalBulan,
        DATEADD(DAY, COALESCE(ip.Bulan, jp.IntervalPemeriksaanBulan)*30, hp.TanggalPemeriksaan) AS NextDueDateAtTime,
        p.Kode AS AparKode, l.Nama AS LokasiNama, jp.Nama AS JenisNama
      FROM HasilPemeriksaan hp
      JOIN Peralatan p       ON hp.PeralatanId = p.Id
      JOIN Lokasi l          ON p.LokasiId = l.Id
      JOIN JenisPeralatan jp ON p.JenisId = jp.Id
      LEFT JOIN Petugas pt   ON hp.BadgeNumber = pt.BadgeNumber
      LEFT JOIN IntervalPetugas ip ON hp.IntervalPetugasId = ip.Id
      ORDER BY hp.TanggalPemeriksaan DESC
    `);

    return res.json({
      success: true,
      data: result.recordset
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil seluruh riwayat maintenance',
      error: err.message
    });
  }
},
  // 6) Ambil detail apar + checklist berdasarkan token QR
  withChecklistByToken: async (req, res) => {
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
  }

  
};




module.exports = PerawatanController;
