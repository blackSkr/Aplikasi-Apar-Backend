// controllers/PerawatanController.js
const { poolPromise, sql } = require('../ConfigDB');
const fs = require('fs');
const path = require('path');

const toUrlPath = (p) =>
  ('/' + String(p || '').replace(/\\/g, '/').replace(/^\/+/, '')).replace(/\/{2,}/g, '/');

const toAbsoluteUrl = (req, p) => {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  const base = `${req.protocol}://${req.get('host')}`;
  return p.startsWith('/') ? `${base}${p}` : `${base}/${p}`;
};

/** Konversi ke BIT dari berbagai representasi */
const toBit = (v) => {
  if (v === 1 || v === true) return 1;
  if (v === 0 || v === false) return 0;
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return 0;
  // Positif (Baik/lulus)
  if (['1','true','ya','ok','baik','pass','lulus'].includes(s)) return 1;
  // Negatif (Tidak/gagal/buruk)
  if (['0','false','tidak','no','ng','gagal','rusak','buruk','tdk','tidak baik','tbaik'].includes(s)) return 0;
  // Default: 0 (tidak)
  return 0;
};

const PerawatanController = {
  // ========================= 1) Submit maintenance data =========================
  submit: async (req, res) => {
    let transaction;
    const path = require('path');
    const { poolPromise, sql } = require('../ConfigDB');

    const toUrlPath = (p) =>
      ('/' + String(p || '').replace(/\\/g, '/').replace(/^\/+/, '')).replace(/\/{2,}/g, '/');
    const toAbsoluteUrl = (req, p) => {
      if (!p) return null;
      if (/^https?:\/\//i.test(p)) return p;
      const base = `${req.protocol}://${req.get('host')}`;
      return p.startsWith('/') ? `${base}${p}` : `${base}/${p}`;
    };
    const toBit = (v) => {
      if (v === 1 || v === true) return 1;
      if (v === 0 || v === false) return 0;
      const s = String(v ?? '').trim().toLowerCase();
      if (!s) return 0;
      if (['1','true','ya','ok','baik','pass','lulus'].includes(s)) return 1;
      if (['0','false','tidak','no','ng','gagal','rusak','buruk','tdk','tidak baik','tbaik'].includes(s)) return 0;
      return 0;
    };

    try {
      const aparId = parseInt(req.body.aparId, 10);
      if (isNaN(aparId)) return res.status(400).json({ success:false, message:'aparId harus angka' });

      const {
        tanggal, badgeNumber, intervalPetugasId: rawIntervalPetugasId,
        kondisi, catatanMasalah, rekomendasi, tindakLanjut, tekanan, jumlahMasalah, checklist
      } = req.body;

      if (!tanggal || !badgeNumber) {
        return res.status(400).json({ success:false, message:'Data wajib tidak lengkap (tanggal, badgeNumber)' });
      }

      // ==== NEW (opsional, tidak memaksa FE): koordinat
      const latRaw  = req.body.latitude  ?? req.body.lat  ?? req.body.Latitude  ?? null;
      const longRaw = req.body.longitude ?? req.body.long ?? req.body.Longitude ?? null;
      const toNum = (v) => {
        if (v == null || v === '' || typeof v === 'boolean') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      let latVal  = toNum(latRaw);
      let longVal = toNum(longRaw);
      if (!(latVal  >= -90  && latVal  <= 90))  latVal  = null;
      if (!(longVal >= -180 && longVal <= 180)) longVal = null;

      // opt: isi otomatis yang tidak dikirim sebagai Baik(1) jika true
      const fillMissingBaik = String(req.query.fillMissingBaik || '').toLowerCase() === 'true';

      const pool = await poolPromise;
      transaction = pool.transaction();
      await transaction.begin();

      // Petugas + interval role
      const petugasRes = await transaction.request()
        .input('badge', sql.NVarChar, badgeNumber.trim())
        .query(`
          SELECT TOP 1 p.Id AS PetugasId, p.RolePetugasId, rp.IntervalPetugasId
          FROM Petugas p
          LEFT JOIN RolePetugas rp ON rp.Id = p.RolePetugasId
          WHERE LTRIM(RTRIM(p.BadgeNumber)) = @badge
        `);
      if (!petugasRes.recordset.length) {
        await transaction.rollback();
        return res.status(404).json({ success:false, message:'Petugas tidak ditemukan' });
      }
      const petugas = petugasRes.recordset[0];
      const intervalPetugasIdUsed =
        rawIntervalPetugasId && rawIntervalPetugasId !== 'null'
          ? parseInt(rawIntervalPetugasId, 10)
          : (petugas.IntervalPetugasId || null);

      // Insert HasilPemeriksaan (TAMBAH kolom Latitude/Longitude — opsional)
      const ins = await transaction.request()
        .input('PeralatanId',        sql.Int,      aparId)
        .input('BadgeNumber',        sql.NVarChar, badgeNumber.trim())
        .input('TanggalPemeriksaan', sql.DateTime, new Date(tanggal))
        .input('IntervalPetugasId',  sql.Int,      intervalPetugasIdUsed)
        .input('Kondisi',            sql.NVarChar, kondisi || '')
        .input('CatatanMasalah',     sql.NVarChar, catatanMasalah || '')
        .input('Rekomendasi',        sql.NVarChar, rekomendasi || '')
        .input('TindakLanjut',       sql.NVarChar, tindakLanjut || '')
        .input('Tekanan',            sql.Float,    tekanan ? parseFloat(tekanan) : null)
        .input('JumlahMasalah',      sql.Int,      jumlahMasalah ? parseInt(jumlahMasalah, 10) : null)
        .input('Latitude',           sql.Decimal(9, 6), latVal)   // NEW
        .input('Longitude',          sql.Decimal(9, 6), longVal)  // NEW
        .query(`
          INSERT INTO HasilPemeriksaan (
            PeralatanId, BadgeNumber, TanggalPemeriksaan,
            IntervalPetugasId, Kondisi, CatatanMasalah,
            Rekomendasi, TindakLanjut, Tekanan, JumlahMasalah,
            Latitude, Longitude
          )
          OUTPUT INSERTED.Id
          VALUES (
            @PeralatanId, @BadgeNumber, @TanggalPemeriksaan,
            @IntervalPetugasId, @Kondisi, @CatatanMasalah,
            @Rekomendasi, @TindakLanjut, @Tekanan, @JumlahMasalah,
            @Latitude, @Longitude
          )
        `);
      const pemeriksaanId = ins.recordset[0].Id;

      // ===== Checklist: terima Dicentang/Keterangan ATAU condition/alasan =====
      let rawArr = [];
      try {
        if (typeof checklist === 'string') rawArr = JSON.parse(checklist);
        else if (Array.isArray(checklist)) rawArr = checklist;
      } catch { rawArr = []; }

      const normalized = (Array.isArray(rawArr) ? rawArr : [])
        .map((x) => {
          const cid = Number(x?.ChecklistId ?? x?.checklistId ?? x?.Id ?? x?.id) || 0;

          // sumber nilai:
          // 1) Dicentang/dicentang/checked/value/status
          // 2) condition: 'Baik' | 'Tidak Baik'
          let dicRaw = x?.Dicentang ?? x?.dicentang ?? x?.checked ?? x?.value ?? x?.status ?? x?.isBaik ?? x?.isOK;
          if (dicRaw == null && typeof x?.condition === 'string') {
            dicRaw = x.condition.trim().toLowerCase() === 'baik' ? 1 : 0;
          }
          const dic = toBit(dicRaw);

          // keterangan:
          const ketRaw = (x?.Keterangan ?? x?.keterangan ?? x?.alasan ?? x?.note ?? x?.notes ?? '').toString().trim();
          const ket = ketRaw || (String(x?.condition || '').toLowerCase() === 'tidak baik' ? (x?.alasan || '') : '');

          return { ChecklistId: cid, Dicentang: dic, Keterangan: ket.trim() };
        })
        .filter(r => r.ChecklistId > 0);

      if (!fillMissingBaik) {
        if (normalized.length) {
          await transaction.request()
            .input('pid',  sql.Int, pemeriksaanId)
            .input('aid',  sql.Int, aparId)
            .input('json', sql.NVarChar(sql.MAX), JSON.stringify(normalized))
            .query(`
              INSERT INTO ChecklistJawaban (PemeriksaanId, ChecklistId, Dicentang, Keterangan)
              SELECT @pid, j.ChecklistId, j.Dicentang, NULLIF(j.Keterangan,'')
              FROM OPENJSON(@json)
              WITH (
                ChecklistId INT           '$.ChecklistId',
                Dicentang   BIT           '$.Dicentang',
                Keterangan  NVARCHAR(500) '$.Keterangan'
              ) AS j
              JOIN Peralatan p ON p.Id = @aid
              JOIN Checklist c ON c.Id = j.ChecklistId AND c.JenisId = p.JenisId;
            `);
        }
      } else {
        await transaction.request()
          .input('pid',  sql.Int, pemeriksaanId)
          .input('aid',  sql.Int, aparId)
          .input('json', sql.NVarChar(sql.MAX), JSON.stringify(normalized))
          .query(`
            WITH InputJ AS (
              SELECT * FROM OPENJSON(@json)
              WITH (
                ChecklistId INT           '$.ChecklistId',
                Dicentang   BIT           '$.Dicentang',
                Keterangan  NVARCHAR(500) '$.Keterangan'
              )
            )
            INSERT INTO ChecklistJawaban (PemeriksaanId, ChecklistId, Dicentang, Keterangan)
            SELECT 
              @pid,
              c.Id,
              COALESCE(j.Dicentang, 1) AS Dicentang,
              NULLIF(j.Keterangan,'')
            FROM Peralatan p
            JOIN Checklist c ON c.JenisId = p.JenisId
            LEFT JOIN InputJ j ON j.ChecklistId = c.Id
            WHERE p.Id = @aid
              AND NOT EXISTS (
                SELECT 1 FROM ChecklistJawaban x WHERE x.PemeriksaanId = @pid AND x.ChecklistId = c.Id
              );
          `);
      }

      // ===== Foto =====
      const uploaded = (req.files || []).map((f) => {
        const fn = f.filename || path.basename(f.path || '');
        if (f.path && /uploads[\\/]/i.test(f.path)) {
          const after = f.path.split(/uploads[\\/]/i).pop();
          return toUrlPath(`uploads/${after}`);
        }
        return toUrlPath(`uploads/perawatan/${fn}`);
      });
      if (uploaded.length) {
        await transaction.request()
          .input('pid',  sql.Int, pemeriksaanId)
          .input('json', sql.NVarChar(sql.MAX), JSON.stringify(uploaded))
          .query(`
            INSERT INTO FotoPemeriksaan (PemeriksaanId, FotoPath, UploadedAt)
            SELECT @pid, j.path, GETDATE()
            FROM OPENJSON(@json) WITH (path NVARCHAR(400) '$') j;
          `);
      }

      await transaction.commit();
      return res.json({
        success: true,
        message: 'Maintenance berhasil disimpan',
        data: {
          hasilPemeriksaanId: pemeriksaanId,
          intervalPetugasIdUsed: intervalPetugasIdUsed || null,
          photosUploaded: uploaded.length,
          photos: uploaded,
          photoUrls: uploaded.map(p => toAbsoluteUrl(req, p)),
          fillMissingBaik
          // tidak menambahkan field baru di response agar kontrak lama aman
        }
      });
    } catch (err) {
      if (transaction) { try { await transaction.rollback(); } catch {} }
      if (req.files) req.files.forEach(f => { try { if (f.path) fs.unlinkSync(f.path) } catch {} });
      console.error(err);
      return res.status(500).json({ success:false, message:'Gagal menyimpan data maintenance', error: err.message });
    }
  },

  // ========================= 2) Get latest status =========================
  status: async (req, res) => {
    try {
      const aparId = parseInt(req.params.aparId, 10);
      if (isNaN(aparId)) return res.status(400).json({ success:false, message:'aparId invalid' });

      const badge = (req.query.badge || '').trim();
      if (!badge) return res.status(400).json({ success:false, message:'badge wajib' });

      const pool = await poolPromise;
      const statusRes = await pool.request()
        .input('aparId', sql.Int, aparId)
        .input('badge',  sql.NVarChar, badge)
        .query(`
WITH PI AS (
  SELECT ip.Id AS IntervalId, ip.NamaInterval, ip.Bulan AS IntervalBulan
  FROM Petugas p
  LEFT JOIN RolePetugas rp ON rp.Id = p.RolePetugasId
  LEFT JOIN IntervalPetugas ip ON ip.Id = rp.IntervalPetugasId
  WHERE LTRIM(RTRIM(p.BadgeNumber)) = @badge
)
SELECT TOP 1
  hp.Id,
  hp.TanggalPemeriksaan,
  hp.Kondisi,
  p.Kode         AS AparKode,
  l.Nama         AS LokasiNama,
  jp.Nama        AS JenisNama,
  hp.BadgeNumber AS PetugasBadge,
  pi.NamaInterval,
  pi.IntervalBulan,
  DATEADD(MONTH, COALESCE(pi.IntervalBulan, jp.IntervalPemeriksaanBulan), hp.TanggalPemeriksaan) AS NextDueDate
FROM HasilPemeriksaan hp
JOIN Peralatan p       ON hp.PeralatanId = p.Id
JOIN Lokasi l          ON p.LokasiId = l.Id
JOIN JenisPeralatan jp ON p.JenisId = jp.Id
LEFT JOIN PI           AS pi ON 1=1
WHERE hp.PeralatanId = @aparId
ORDER BY hp.TanggalPemeriksaan DESC
        `);

      return res.json({ success:true, data: statusRes.recordset[0] || null });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success:false, message:'Gagal mengambil status maintenance', error: err.message });
    }
  },

  // ========================= 3) Riwayat maintenance =========================
  history: async (req, res) => {
    try {
      const aparId = parseInt(req.params.aparId, 10);
      if (isNaN(aparId)) {
        return res.status(400).json({ success: false, message: 'Parameter aparId harus valid' });
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
            -- sengaja tidak expose Latitude/Longitude agar kontrak lama tetap sama
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

      return res.json({ success: true, data: histRes.recordset });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Gagal mengambil riwayat maintenance', error: err.message });
    }
  },

  // ========================= 4) Detail maintenance (checklist + photos) =========================
  details: async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ success: false, message: 'Parameter id harus valid' });

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
        return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });
      }

      const checklistRes = await pool.request()
        .input('id', sql.Int, id)
        .query(`
          SELECT cj.ChecklistId, cj.Dicentang, cj.Keterangan, c.Pertanyaan
          FROM ChecklistJawaban cj
          JOIN Checklist c ON cj.ChecklistId = c.Id
          WHERE cj.PemeriksaanId = @id
          ORDER BY cj.ChecklistId
        `);

      const photosRes = await pool.request()
        .input('id', sql.Int, id)
        .query(`
          SELECT FotoPath, UploadedAt
          FROM FotoPemeriksaan
          WHERE PemeriksaanId = @id
          ORDER BY UploadedAt
        `);

      const photos = photosRes.recordset.map(r => ({
        ...r,
        FotoUrl: toAbsoluteUrl(req, r.FotoPath)
      }));

      return res.json({
        success: true,
        data: {
          ...mainRes.recordset[0],
          checklist: checklistRes.recordset,
          photos
        }
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Gagal mengambil detail maintenance', error: err.message });
    }
  },

  // ========================= 5) Ambil seluruh data =========================
  all: async (_req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`
        SELECT
          hp.Id, hp.TanggalPemeriksaan, hp.Kondisi,
          hp.CatatanMasalah, hp.Rekomendasi, hp.TindakLanjut,
          hp.Tekanan, hp.JumlahMasalah,
          hp.BadgeNumber AS PetugasBadge,
          -- sengaja tidak expose Latitude/Longitude agar kontrak lama tetap sama
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

      return res.json({ success: true, data: result.recordset });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Gagal mengambil seluruh riwayat maintenance', error: err.message });
    }
  },

  // ========================= 6) Ambil detail APAR + checklist via Token QR =========================
  withChecklistByToken: async (req, res) => {
    try {
      let { token, badge } = req.query;
      if (!token) return res.status(400).json({ message:'Parameter token wajib' });
      badge = (badge || '').trim();

      const pool = await poolPromise;
      const sqlText = `
DECLARE @earlyWindow INT = 7;

WITH Target AS ( SELECT * FROM Peralatan WHERE TokenQR = @token ),
PetugasInfo AS (
  SELECT 
    t.Id            AS PetugasId,
    rp.Id           AS RolePetugasId,
    rp.NamaRole     AS NamaRole,
    rp.IntervalPetugasId,
    ip.NamaInterval AS NamaIntervalPetugas,
    ip.Bulan        AS BulanIntervalPetugas
  FROM Petugas t
  LEFT JOIN RolePetugas rp     ON rp.Id = t.RolePetugasId
  LEFT JOIN IntervalPetugas ip ON ip.Id = rp.IntervalPetugasId
  WHERE (@badge = '' OR LTRIM(RTRIM(t.BadgeNumber)) = @badge)
),
LastInspection AS (
  SELECT PeralatanId, MAX(TanggalPemeriksaan) AS LastDate
  FROM HasilPemeriksaan
  WHERE PeralatanId = (SELECT Id FROM Target)
  GROUP BY PeralatanId
)
SELECT 
  p.Id                        AS id_apar,
  p.Kode                      AS no_apar,
  l.Nama                      AS lokasi_apar,
  jp.Nama                     AS jenis_apar,

  pi.IntervalPetugasId,
  pi.NamaIntervalPetugas      AS namaIntervalPetugas,
  pi.BulanIntervalPetugas     AS bulanIntervalPetugas,
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
    FROM Checklist c WHERE c.JenisId = jp.Id
  )                           AS keperluan_check
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

      if (!result.recordset.length) return res.status(404).json({ message:'Peralatan tidak ditemukan berdasarkan TokenQR' });
      res.json(result.recordset[0]);
    } catch (err) {
      console.error('SQL Error (withChecklistByToken):', err);
      res.status(500).json({ message:'Server error', error: err.message });
    }
  },

  // ========================= 7) Safe version (dipakai mobile) =========================
  withChecklistByTokenSafe: async (req, res) => {
    try {
      let { token, badge } = req.query;
      if (!token) return res.status(400).json({ success:false, message:'Parameter token wajib' });
      badge = (badge || '').trim();

      const pool = await poolPromise;

      const sqlText = `
DECLARE @earlyWindow INT = 7;

WITH Target AS (
  SELECT * FROM Peralatan 
  WHERE TokenQR = TRY_CONVERT(uniqueidentifier, @token)
),
PetugasInfo AS (
  SELECT TOP 1
    t.Id            AS PetugasId,
    rp.Id           AS RolePetugasId,
    rp.NamaRole     AS NamaRole,
    rp.IntervalPetugasId,
    ip.NamaInterval AS NamaIntervalPetugas,
    ip.Bulan        AS BulanIntervalPetugas
  FROM Petugas t
  LEFT JOIN RolePetugas rp     ON rp.Id = t.RolePetugasId
  LEFT JOIN IntervalPetugas ip ON ip.Id = rp.IntervalPetugasId
  WHERE (@badge = '' OR LTRIM(RTRIM(t.BadgeNumber)) = @badge)
),
LastInspection AS (
  SELECT PeralatanId, MAX(TanggalPemeriksaan) AS LastDate
  FROM HasilPemeriksaan
  WHERE PeralatanId = (SELECT Id FROM Target)
  GROUP BY PeralatanId
)
SELECT 
  p.Id                        AS id_apar,
  p.Kode                      AS no_apar,
  l.Nama                      AS lokasi_apar,
  jp.Nama                     AS jenis_apar,

  pi.IntervalPetugasId,
  pi.NamaIntervalPetugas      AS namaIntervalPetugas,
  pi.BulanIntervalPetugas     AS bulanIntervalPetugas,
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
    FROM Checklist c WHERE c.JenisId = jp.Id
  )                           AS keperluan_check
FROM Target p
JOIN JenisPeralatan jp ON p.JenisId = jp.Id
JOIN Lokasi l          ON p.LokasiId = l.Id
LEFT JOIN PetugasInfo pi ON 1=1
LEFT JOIN LastInspection li ON p.Id = li.PeralatanId;
    `;

      const result = await pool.request()
        .input('token', sql.NVarChar, String(token))
        .input('badge', sql.NVarChar, badge)
        .query(sqlText);

      if (!result.recordset.length) {
        return res.status(404).json({ success:false, message:'Peralatan tidak ditemukan berdasarkan TokenQR' });
      }
      return res.json({ success:true, data: result.recordset[0] });
    } catch (err) {
      console.error('withChecklistByTokenSafe error:', err);
      return res.status(500).json({ success:false, message:'Server error', error: err.message });
    }
  },
};

module.exports = PerawatanController;
