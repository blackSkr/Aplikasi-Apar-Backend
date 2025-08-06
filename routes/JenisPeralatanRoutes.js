// routes/JenisPeralatanRoutes.js
const express = require('express');
const router = express.Router();
const { poolPromise, sql } = require('../ConfigDB');

// GET all jenis peralatan
router.get('/', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT Id, Nama, IntervalPemeriksaanBulan 
      FROM JenisPeralatan 
      ORDER BY Nama
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetch jenis peralatan:', err);
    res.status(500).json({ message: 'Gagal mengambil data jenis peralatan', error: err.message });
  }
});

// GET jenis peralatan by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔍 Getting jenis peralatan ID: ${id}`);
    
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT Id, Nama, IntervalPemeriksaanBulan FROM JenisPeralatan WHERE Id = @id');
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Jenis peralatan tidak ditemukan' });
    }
    
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('Error fetch jenis peralatan by ID:', err);
    res.status(500).json({ message: 'Gagal mengambil data jenis peralatan' });
  }
});

// POST new jenis peralatan
router.post('/', async (req, res) => {
  try {
    const { Nama, IntervalPemeriksaanBulan } = req.body;
    console.log(`🔍 Creating jenis peralatan:`, req.body);
    
    if (!Nama) {
      return res.status(400).json({ message: 'Nama jenis peralatan wajib diisi' });
    }
    
    if (!IntervalPemeriksaanBulan || IntervalPemeriksaanBulan <= 0) {
      return res.status(400).json({ message: 'Interval pemeriksaan harus lebih dari 0 bulan' });
    }
    
    const pool = await poolPromise;
    await pool.request()
      .input('Nama', sql.NVarChar, Nama)
      .input('IntervalPemeriksaanBulan', sql.Int, IntervalPemeriksaanBulan)
      .query(`
        INSERT INTO JenisPeralatan (Nama, IntervalPemeriksaanBulan)
        VALUES (@Nama, @IntervalPemeriksaanBulan)
      `);
    
    res.status(201).json({ message: 'Jenis peralatan berhasil ditambahkan' });
  } catch (err) {
    console.error('Error create jenis peralatan:', err);
    res.status(500).json({ message: 'Gagal menyimpan jenis peralatan' });
  }
});

// PUT update jenis peralatan
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔍 Updating jenis peralatan ID: ${id}`);
    console.log(`🔍 Request body:`, req.body);
    
    const { Nama, IntervalPemeriksaanBulan } = req.body;
    
    if (!Nama) {
      return res.status(400).json({ message: 'Nama jenis peralatan wajib diisi' });
    }
    
    if (!IntervalPemeriksaanBulan || IntervalPemeriksaanBulan <= 0) {
      return res.status(400).json({ message: 'Interval pemeriksaan harus lebih dari 0 bulan' });
    }
    
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('Nama', sql.NVarChar, Nama)
      .input('IntervalPemeriksaanBulan', sql.Int, IntervalPemeriksaanBulan)
      .query(`
        UPDATE JenisPeralatan 
        SET Nama = @Nama, IntervalPemeriksaanBulan = @IntervalPemeriksaanBulan
        WHERE Id = @id
      `);
    
    console.log(`🔍 Update result:`, result);
    console.log(`🔍 Rows affected:`, result.rowsAffected);
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Jenis peralatan tidak ditemukan' });
    }
    
    res.json({ message: 'Jenis peralatan berhasil diupdate' });
  } catch (err) {
    console.error('❌ Error update jenis peralatan:', err);
    res.status(500).json({ message: 'Gagal update jenis peralatan', error: err.message });
  }
});

// DELETE jenis peralatan
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    
    // Check if jenis peralatan is being used
    const checkUsage = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT COUNT(*) as count FROM Peralatan WHERE JenisId = @id');
    
    if (checkUsage.recordset[0].count > 0) {
      return res.status(400).json({ 
        message: 'Jenis peralatan tidak dapat dihapus karena masih digunakan oleh peralatan' 
      });
    }
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM JenisPeralatan WHERE Id = @id');
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Jenis peralatan tidak ditemukan' });
    }
    
    res.json({ message: 'Jenis peralatan berhasil dihapus' });
  } catch (err) {
    console.error('Error delete jenis peralatan:', err);
    res.status(500).json({ message: 'Gagal menghapus jenis peralatan' });
  }
});

module.exports = router;