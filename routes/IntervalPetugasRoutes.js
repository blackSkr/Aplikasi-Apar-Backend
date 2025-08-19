// routes/IntervalPetugasRoutes.js
const express = require('express');
const router = express.Router();
const { poolPromise, sql } = require('../ConfigDB');

// GET - Semua interval petugas (plus RolesCount)
router.get('/', async (_req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .query(`
        SELECT 
          i.Id, 
          i.NamaInterval, 
          i.Bulan,
          CASE 
            WHEN i.Bulan = 0 THEN 'Interval Khusus'
            ELSE CONCAT('Setiap ', i.Bulan, ' bulan')
          END as Deskripsi,
          ISNULL(rc.RolesCount, 0) AS RolesCount
        FROM IntervalPetugas i
        OUTER APPLY (
          SELECT COUNT(1) AS RolesCount
          FROM RolePetugas r
          WHERE r.IntervalPetugasId = i.Id
        ) rc
        ORDER BY i.Bulan ASC, i.NamaInterval ASC
      `);
    
    res.json(result.recordset);
  } catch (err) {
    console.error('Error get interval petugas:', err);
    res.status(500).json({ message: 'Gagal mengambil data interval petugas' });
  }
});

// GET - Detail interval petugas
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          i.*,
          ISNULL(rc.RolesCount, 0) AS RolesCount
        FROM IntervalPetugas i
        OUTER APPLY (
          SELECT COUNT(1) AS RolesCount
          FROM RolePetugas r
          WHERE r.IntervalPetugasId = i.Id
        ) rc
        WHERE i.Id = @id
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Interval petugas tidak ditemukan' });
    }
    
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('Error get interval petugas by id:', err);
    res.status(500).json({ message: 'Gagal mengambil detail interval petugas' });
  }
});

// POST - Tambah interval petugas
router.post('/', async (req, res) => {
  try {
    const { NamaInterval, Bulan } = req.body;
    
    if (!NamaInterval) {
      return res.status(400).json({ message: 'Nama interval harus diisi' });
    }
    
    if (Bulan !== null && (Bulan < 0 || Bulan > 12)) {
      return res.status(400).json({ message: 'Bulan harus antara 0-12' });
    }
    
    const pool = await poolPromise;
    
    // Check duplicate
    const checkResult = await pool.request()
      .input('namaInterval', sql.NVarChar, NamaInterval)
      .query('SELECT Id FROM IntervalPetugas WHERE NamaInterval = @namaInterval');
    
    if (checkResult.recordset.length > 0) {
      return res.status(400).json({ message: 'Nama interval sudah ada' });
    }
    
    const result = await pool.request()
      .input('namaInterval', sql.NVarChar, NamaInterval)
      .input('bulan', sql.Int, Bulan)
      .query(`
        INSERT INTO IntervalPetugas (NamaInterval, Bulan) 
        VALUES (@namaInterval, @bulan);
        SELECT SCOPE_IDENTITY() as Id;
      `);
    
    const newId = result.recordset[0].Id;
    
    const newRecord = await pool.request()
      .input('id', sql.Int, newId)
      .query(`
        SELECT 
          i.*,
          CASE WHEN i.Bulan = 0 THEN 'Interval Khusus' ELSE CONCAT('Setiap ', i.Bulan, ' bulan') END AS Deskripsi,
          ISNULL(rc.RolesCount, 0) AS RolesCount
        FROM IntervalPetugas i
        OUTER APPLY (
          SELECT COUNT(1) AS RolesCount
          FROM RolePetugas r
          WHERE r.IntervalPetugasId = i.Id
        ) rc
        WHERE i.Id = @id
      `);
    
    res.status(201).json(newRecord.recordset[0]);
  } catch (err) {
    console.error('Error create interval petugas:', err);
    res.status(500).json({ message: 'Gagal menambah interval petugas' });
  }
});

// PUT - Update interval petugas
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { NamaInterval, Bulan } = req.body;
    
    if (!NamaInterval) {
      return res.status(400).json({ message: 'Nama interval harus diisi' });
    }
    if (Bulan !== null && (Bulan < 0 || Bulan > 12)) {
      return res.status(400).json({ message: 'Bulan harus antara 0-12' });
    }
    
    const pool = await poolPromise;
    
    const checkExist = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT Id FROM IntervalPetugas WHERE Id = @id');
    
    if (checkExist.recordset.length === 0) {
      return res.status(404).json({ message: 'Interval petugas tidak ditemukan' });
    }
    
    const checkDuplicate = await pool.request()
      .input('namaInterval', sql.NVarChar, NamaInterval)
      .input('id', sql.Int, id)
      .query('SELECT Id FROM IntervalPetugas WHERE NamaInterval = @namaInterval AND Id != @id');
    
    if (checkDuplicate.recordset.length > 0) {
      return res.status(400).json({ message: 'Nama interval sudah ada' });
    }
    
    await pool.request()
      .input('id', sql.Int, id)
      .input('namaInterval', sql.NVarChar, NamaInterval)
      .input('bulan', sql.Int, Bulan)
      .query(`
        UPDATE IntervalPetugas 
        SET NamaInterval = @namaInterval, Bulan = @bulan
        WHERE Id = @id
      `);
    
    const updatedRecord = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          i.*,
          CASE WHEN i.Bulan = 0 THEN 'Interval Khusus' ELSE CONCAT('Setiap ', i.Bulan, ' bulan') END AS Deskripsi,
          ISNULL(rc.RolesCount, 0) AS RolesCount
        FROM IntervalPetugas i
        OUTER APPLY (
          SELECT COUNT(1) AS RolesCount
          FROM RolePetugas r
          WHERE r.IntervalPetugasId = i.Id
        ) rc
        WHERE i.Id = @id
      `);
    
    res.json(updatedRecord.recordset[0]);
  } catch (err) {
    console.error('Error update interval petugas:', err);
    res.status(500).json({ message: 'Gagal update interval petugas' });
  }
});

// DELETE - Hapus interval petugas
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    
    // Cek jika dipakai Petugas
    const checkUsagePetugas = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT COUNT(*) as count FROM Petugas WHERE IntervalPetugasId = @id');
    
    if (checkUsagePetugas.recordset[0].count > 0) {
      return res.status(400).json({ 
        message: 'Interval petugas tidak dapat dihapus karena sedang digunakan oleh petugas' 
      });
    }

    // Cek jika dipakai RolePetugas
    const checkUsageRole = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT COUNT(*) as count FROM RolePetugas WHERE IntervalPetugasId = @id');

    if (checkUsageRole.recordset[0].count > 0) {
      return res.status(400).json({
        message: 'Interval petugas tidak dapat dihapus karena terpasang pada RolePetugas'
      });
    }
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM IntervalPetugas WHERE Id = @id');
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Interval petugas tidak ditemukan' });
    }
    
    res.json({ message: 'Interval petugas berhasil dihapus' });
  } catch (err) {
    console.error('Error delete interval petugas:', err);
    res.status(500).json({ message: 'Gagal menghapus interval petugas' });
  }
});

module.exports = router;
