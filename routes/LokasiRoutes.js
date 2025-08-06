// routes/LokasiRoutes.js
const express = require('express');
const router  = express.Router();
const { poolPromise, sql } = require('../ConfigDB');

// GET all lokasi
router.get('/', async (req, res) => {
  try {
    const pool   = await poolPromise;
    const result = await pool.request().query(`
      SELECT
        l.Id,
        l.Nama,
        l.lat,
        l.long,
        l.PIC_PetugasId AS PICPetugasId,
        p.BadgeNumber   AS PIC_BadgeNumber,
        p.Role          AS PIC_Jabatan
      FROM Lokasi l
      LEFT JOIN Petugas p
        ON l.PIC_PetugasId = p.Id
      ORDER BY l.Nama DESC;
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetch lokasi:', err);
    res.status(500).json({ message: 'Gagal mengambil data lokasi' });
  }
});

// GET by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool   = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          l.Id,
          l.Nama,
          l.lat,
          l.long,
          l.PIC_PetugasId AS PICPetugasId,
          p.BadgeNumber   AS PIC_BadgeNumber,
          p.Role          AS PIC_Jabatan
        FROM Lokasi l
        LEFT JOIN Petugas p
          ON l.PIC_PetugasId = p.Id
        WHERE l.Id = @id;
      `);
    if (!result.recordset.length) {
      return res.status(404).json({ message: 'Lokasi tidak ditemukan' });
    }
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('Error fetch lokasi by ID:', err);
    res.status(500).json({ message: 'Gagal mengambil data lokasi' });
  }
});

// POST (Create)
router.post('/', async (req, res) => {
  // **LOG req.body untuk debugging**
  console.log('🚀 [LokasiRoutes POST] req.body:', req.body);

  try {
    const { nama, picPetugasId, lat, long } = req.body;
    if (!nama) {
      return res.status(400).json({ message: 'Nama lokasi wajib diisi' });
    }

    const pool = await poolPromise;
    const insert = await pool.request()
      .input('Nama',           sql.NVarChar,      nama)
      .input('PIC_PetugasId',  sql.Int,           picPetugasId || null)
      .input('lat',            sql.Decimal(10, 6),lat || null)
      .input('long',           sql.Decimal(10, 6),long || null)
      .query(`
        INSERT INTO Lokasi (Nama, PIC_PetugasId, lat, long)
        VALUES (@Nama, @PIC_PetugasId, @lat, @long);
        SELECT SCOPE_IDENTITY() AS Id;
      `);

    const newId = insert.recordset[0].Id;
    const newRec = await pool.request()
      .input('id', sql.Int, newId)
      .query(`
        SELECT
          l.Id,
          l.Nama,
          l.lat,
          l.long,
          l.PIC_PetugasId AS PICPetugasId,
          p.BadgeNumber   AS PIC_BadgeNumber,
          p.Role          AS PIC_Jabatan
        FROM Lokasi l
        LEFT JOIN Petugas p
          ON l.PIC_PetugasId = p.Id
        WHERE l.Id = @id;
      `);

    res.status(201).json(newRec.recordset[0]);
  } catch (err) {
    console.error('Error create lokasi:', err);
    res.status(500).json({ message: 'Gagal menyimpan lokasi' });
  }
});

// PUT (Update)
router.put('/:id', async (req, res) => {
  // **LOG req.body untuk debugging**
  console.log(`🚀 [LokasiRoutes PUT id=${req.params.id}] req.body:`, req.body);

  try {
    const { id } = req.params;
    const { nama, picPetugasId, lat, long } = req.body;
    if (!nama) {
      return res.status(400).json({ message: 'Nama lokasi wajib diisi' });
    }

    const pool  = await poolPromise;
    const exist = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT Id FROM Lokasi WHERE Id = @id');
    if (!exist.recordset.length) {
      return res.status(404).json({ message: 'Lokasi tidak ditemukan' });
    }

    await pool.request()
      .input('id',             sql.Int,           id)
      .input('Nama',           sql.NVarChar,      nama)
      .input('PIC_PetugasId',  sql.Int,           picPetugasId || null)
      .input('lat',            sql.Decimal(10, 6),lat || null)
      .input('long',           sql.Decimal(10, 6),long || null)
      .query(`
        UPDATE Lokasi
        SET
          Nama           = @Nama,
          PIC_PetugasId  = @PIC_PetugasId,
          lat            = @lat,
          long           = @long
        WHERE Id = @id;
      `);

    const updated = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          l.Id,
          l.Nama,
          l.lat,
          l.long,
          l.PIC_PetugasId AS PICPetugasId,
          p.BadgeNumber   AS PIC_BadgeNumber,
          p.Role          AS PIC_Jabatan
        FROM Lokasi l
        LEFT JOIN Petugas p
          ON l.PIC_PetugasId = p.Id
        WHERE l.Id = @id;
      `);

    res.json(updated.recordset[0]);
  } catch (err) {
    console.error('Error update lokasi:', err);
    res.status(500).json({ message: 'Gagal update lokasi' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;

    const usage = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT COUNT(*) AS count FROM Peralatan WHERE LokasiId = @id');
    if (usage.recordset[0].count > 0) {
      return res.status(400).json({
        message: 'Lokasi tidak dapat dihapus karena masih digunakan oleh peralatan'
      });
    }

    const del = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM Lokasi WHERE Id = @id');
    if (del.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Lokasi tidak ditemukan' });
    }
    res.json({ message: 'Lokasi berhasil dihapus' });
  } catch (err) {
    console.error('Error delete lokasi:', err);
    res.status(500).json({ message: 'Gagal menghapus lokasi' });
  }
});

module.exports = router;
