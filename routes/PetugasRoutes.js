// routes/PetugasRoutes.js
const express = require('express');
const router  = express.Router();
const { poolPromise, sql } = require('../ConfigDB');

// debug middleware (opsional) untuk lihat apa yang datang
router.use((req, res, next) => {
  console.log('>>> [PetugasRoutes]', req.method, req.originalUrl);
  console.log('    headers:', req.headers['content-type']);
  console.log('    params :', req.params);
  console.log('    body   :', req.body);
  next();
});

// GET ALL
router.get('/', async (req, res) => {
  try {
    const pool   = await poolPromise;
    const result = await pool.request().query(`
      SELECT
        p.Id,
        p.BadgeNumber,
        p.Role             AS Role,
        p.IntervalPetugasId,
        p.LokasiId,
        ip.NamaInterval    AS IntervalNama,
        ip.Bulan           AS IntervalBulan,
        l.Nama             AS LokasiNama
      FROM Petugas p
      LEFT JOIN IntervalPetugas ip ON p.IntervalPetugasId = ip.Id
      LEFT JOIN Lokasi           l  ON p.LokasiId        = l.Id
      ORDER BY p.BadgeNumber ASC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Error get petugas:', err);
    res.status(500).json({ message: 'Gagal mengambil data petugas' });
  }
});
// GET lokasi dari badge petugas (PIC lokasi)
router.get('/lokasi/:badge', async (req, res) => {
  try {
    const { badge } = req.params;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('badge', sql.NVarChar, badge)
      .query(`
        SELECT l.Nama AS LokasiNama
        FROM Lokasi l
        JOIN Petugas p ON l.PIC_PetugasId = p.Id
        WHERE p.BadgeNumber = @badge
      `);
    if (!result.recordset.length) {
      return res.status(404).json({ message: 'Petugas/lokasi tidak ditemukan' });
    }
    res.json({ lokasi: result.recordset[0].LokasiNama });
  } catch (err) {
    console.error('Error get lokasi by badge:', err);
    res.status(500).json({ message: 'Gagal mengambil lokasi petugas' });
  }
});


// GET BY ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool   = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          p.Id,
          p.BadgeNumber,
          p.Role             AS Role,
          p.IntervalPetugasId,
          p.LokasiId,
          ip.NamaInterval    AS IntervalNama,
          ip.Bulan           AS IntervalBulan,
          l.Nama             AS LokasiNama
        FROM Petugas p
        LEFT JOIN IntervalPetugas ip ON p.IntervalPetugasId = ip.Id
        LEFT JOIN Lokasi           l  ON p.LokasiId        = l.Id
        WHERE p.Id = @id
      `);
    if (!result.recordset.length) {
      return res.status(404).json({ message: 'Petugas tidak ditemukan' });
    }
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('Error get petugas by id:', err);
    res.status(500).json({ message: 'Gagal mengambil detail petugas' });
  }
});

// CREATE
router.post('/', async (req, res) => {
  try {
    const { badgeNumber, role, intervalPetugasId, lokasiId } = req.body;
    if (!badgeNumber) {
      return res.status(400).json({ message: 'BadgeNumber harus diisi' });
    }

    const pool = await poolPromise;
    // cek duplikat
    const dup = await pool.request()
      .input('badgeNumber', sql.NVarChar, badgeNumber)
      .query('SELECT 1 FROM Petugas WHERE BadgeNumber = @badgeNumber');
    if (dup.recordset.length) {
      return res.status(400).json({ message: 'BadgeNumber sudah ada' });
    }

    // insert
    const insert = await pool.request()
      .input('badgeNumber',       sql.NVarChar, badgeNumber)
      .input('role',              sql.NVarChar, role         || null)
      .input('intervalPetugasId', sql.Int,      intervalPetugasId || null)
      .input('lokasiId',          sql.Int,      lokasiId         || null)
      .query(`
        INSERT INTO Petugas (BadgeNumber, Role, IntervalPetugasId, LokasiId)
        VALUES (@badgeNumber, @role, @intervalPetugasId, @lokasiId);
        SELECT SCOPE_IDENTITY() AS Id;
      `);

    const newId = insert.recordset[0].Id;
    const newRec = await pool.request()
      .input('id', sql.Int, newId)
      .query(`
        SELECT
          p.Id,
          p.BadgeNumber,
          p.Role             AS Role,
          p.IntervalPetugasId,
          p.LokasiId,
          ip.NamaInterval    AS IntervalNama,
          ip.Bulan           AS IntervalBulan,
          l.Nama             AS LokasiNama
        FROM Petugas p
        LEFT JOIN IntervalPetugas ip ON p.IntervalPetugasId = ip.Id
        LEFT JOIN Lokasi           l  ON p.LokasiId        = l.Id
        WHERE p.Id = @id
      `);

    res.status(201).json(newRec.recordset[0]);
  } catch (err) {
    console.error('Error create petugas:', err);
    res.status(500).json({ message: 'Gagal menambah petugas' });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { badgeNumber, role, intervalPetugasId, lokasiId } = req.body;
    if (!badgeNumber) {
      return res.status(400).json({ message: 'BadgeNumber harus diisi' });
    }

    const pool  = await poolPromise;
    const exist = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT 1 FROM Petugas WHERE Id = @id');
    if (!exist.recordset.length) {
      return res.status(404).json({ message: 'Petugas tidak ditemukan' });
    }

    // cek duplikat kecuali diri sendiri
    const dup = await pool.request()
      .input('badgeNumber', sql.NVarChar, badgeNumber)
      .input('id',          sql.Int,     id)
      .query('SELECT 1 FROM Petugas WHERE BadgeNumber = @badgeNumber AND Id != @id');
    if (dup.recordset.length) {
      return res.status(400).json({ message: 'BadgeNumber sudah ada' });
    }

    // jalankan update
    await pool.request()
      .input('id',                sql.Int,    id)
      .input('badgeNumber',       sql.NVarChar, badgeNumber)
      .input('role',              sql.NVarChar, role         || null)
      .input('intervalPetugasId', sql.Int,      intervalPetugasId || null)
      .input('lokasiId',          sql.Int,      lokasiId         || null)
      .query(`
        UPDATE Petugas
        SET
          BadgeNumber       = @badgeNumber,
          Role              = @role,
          IntervalPetugasId = @intervalPetugasId,
          LokasiId          = @lokasiId
        WHERE Id = @id;
      `);

    // kirim data yang ter‐update
    const updated = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          p.Id,
          p.BadgeNumber,
          p.Role             AS Role,
          p.IntervalPetugasId,
          p.LokasiId,
          ip.NamaInterval    AS IntervalNama,
          ip.Bulan           AS IntervalBulan,
          l.Nama             AS LokasiNama
        FROM Petugas p
        LEFT JOIN IntervalPetugas ip ON p.IntervalPetugasId = ip.Id
        LEFT JOIN Lokasi           l  ON p.LokasiId        = l.Id
        WHERE p.Id = @id
      `);

    res.json(updated.recordset[0]);
  } catch (err) {
    console.error('Error update petugas:', err);
    res.status(500).json({ message: 'Gagal update petugas' });
  }
});

// DELETE (langsung hapus tanpa cek FK lain)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool   = await poolPromise;

    // langsung hapus
    const del = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM Petugas WHERE Id = @id');

    if (!del.rowsAffected[0]) {
      return res.status(404).json({ message: 'Petugas tidak ditemukan' });
    }

    res.json({ message: 'Petugas berhasil dihapus' });
  } catch (err) {
    console.error('Error delete petugas:', err);
    res.status(500).json({ message: 'Gagal menghapus petugas' });
  }
});

module.exports = router;
