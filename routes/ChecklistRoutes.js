// routes/ChecklistRoutes.js - Cek dan fix query yang join dengan Petugas
const express = require('express');
const router = express.Router();
const { poolPromise, sql } = require('../ConfigDB');

// GET - Semua checklist
router.get('/', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .query(`
        SELECT 
          c.Id,
          c.Pertanyaan,
          c.JenisId,
          jp.Nama as JenisNama
        FROM Checklist c
        JOIN JenisPeralatan jp ON c.JenisId = jp.Id
        ORDER BY jp.Nama ASC, c.Id ASC
      `);
    
    res.json(result.recordset);
  } catch (err) {
    console.error('Error get checklist:', err);
    res.status(500).json({ message: 'Gagal mengambil data checklist' });
  }
});

// GET - Checklist by jenis
router.get('/jenis/:jenisId', async (req, res) => {
  try {
    const { jenisId } = req.params;
    const pool = await poolPromise;
    
    const result = await pool.request()
      .input('jenisId', sql.Int, jenisId)
      .query(`
        SELECT 
          c.Id,
          c.Pertanyaan,
          c.JenisId,
          jp.Nama as JenisNama
        FROM Checklist c
        JOIN JenisPeralatan jp ON c.JenisId = jp.Id
        WHERE c.JenisId = @jenisId
        ORDER BY c.Id ASC
      `);
    
    res.json(result.recordset);
  } catch (err) {
    console.error('Error get checklist by jenis:', err);
    res.status(500).json({ message: 'Gagal mengambil checklist by jenis' });
  }
});

// GET - Detail checklist
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          c.*,
          jp.Nama as JenisNama
        FROM Checklist c
        JOIN JenisPeralatan jp ON c.JenisId = jp.Id
        WHERE c.Id = @id
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Checklist tidak ditemukan' });
    }
    
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('Error get checklist by id:', err);
    res.status(500).json({ message: 'Gagal mengambil detail checklist' });
  }
});

// POST - Tambah checklist
router.post('/', async (req, res) => {
  try {
    const { Pertanyaan, JenisId } = req.body;
    
    if (!Pertanyaan || !JenisId) {
      return res.status(400).json({ message: 'Pertanyaan dan Jenis Peralatan harus diisi' });
    }
    
    const pool = await poolPromise;
    
    // Check if JenisPeralatan exists
    const checkJenis = await pool.request()
      .input('jenisId', sql.Int, JenisId)
      .query('SELECT Id FROM JenisPeralatan WHERE Id = @jenisId');
    
    if (checkJenis.recordset.length === 0) {
      return res.status(400).json({ message: 'Jenis Peralatan tidak ditemukan' });
    }
    
    const result = await pool.request()
      .input('pertanyaan', sql.NVarChar, Pertanyaan)
      .input('jenisId', sql.Int, JenisId)
      .query(`
        INSERT INTO Checklist (Pertanyaan, JenisId) 
        VALUES (@pertanyaan, @jenisId);
        SELECT SCOPE_IDENTITY() as Id;
      `);
    
    const newId = result.recordset[0].Id;
    
    // Return created record
    const newRecord = await pool.request()
      .input('id', sql.Int, newId)
      .query(`
        SELECT 
          c.*,
          jp.Nama as JenisNama
        FROM Checklist c
        JOIN JenisPeralatan jp ON c.JenisId = jp.Id
        WHERE c.Id = @id
      `);
    
    res.status(201).json(newRecord.recordset[0]);
  } catch (err) {
    console.error('Error create checklist:', err);
    res.status(500).json({ message: 'Gagal menambah checklist' });
  }
});

// POST - Bulk create checklist
router.post('/bulk', async (req, res) => {
  try {
    const { JenisId, Pertanyaan } = req.body;
    
    if (!JenisId || !Pertanyaan || !Array.isArray(Pertanyaan) || Pertanyaan.length === 0) {
      return res.status(400).json({ message: 'JenisId dan array Pertanyaan harus diisi' });
    }
    
    const pool = await poolPromise;
    
    // Check if JenisPeralatan exists
    const checkJenis = await pool.request()
      .input('jenisId', sql.Int, JenisId)
      .query('SELECT Id FROM JenisPeralatan WHERE Id = @jenisId');
    
    if (checkJenis.recordset.length === 0) {
      return res.status(400).json({ message: 'Jenis Peralatan tidak ditemukan' });
    }
    
    // Insert multiple checklist items
    const insertPromises = Pertanyaan.map(async (pertanyaan) => {
      return pool.request()
        .input('pertanyaan', sql.NVarChar, pertanyaan)
        .input('jenisId', sql.Int, JenisId)
        .query(`
          INSERT INTO Checklist (Pertanyaan, JenisId) 
          VALUES (@pertanyaan, @jenisId);
          SELECT SCOPE_IDENTITY() as Id;
        `);
    });
    
    const results = await Promise.all(insertPromises);
    const createdIds = results.map(result => result.recordset[0].Id);
    
    // Return created records
    const createdRecords = await pool.request()
      .query(`
        SELECT 
          c.*,
          jp.Nama as JenisNama
        FROM Checklist c
        JOIN JenisPeralatan jp ON c.JenisId = jp.Id
        WHERE c.Id IN (${createdIds.join(',')})
        ORDER BY c.Id ASC
      `);
    
    res.status(201).json({
      message: `${createdIds.length} checklist berhasil ditambahkan`,
      data: createdRecords.recordset
    });
  } catch (err) {
    console.error('Error bulk create checklist:', err);
    res.status(500).json({ message: 'Gagal bulk create checklist' });
  }
});

// PUT - Update checklist
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { Pertanyaan, JenisId } = req.body;
    
    if (!Pertanyaan || !JenisId) {
      return res.status(400).json({ message: 'Pertanyaan dan Jenis Peralatan harus diisi' });
    }
    
    const pool = await poolPromise;
    
    // Check if exists
    const checkExist = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT Id FROM Checklist WHERE Id = @id');
    
    if (checkExist.recordset.length === 0) {
      return res.status(404).json({ message: 'Checklist tidak ditemukan' });
    }
    
    // Check if JenisPeralatan exists
    const checkJenis = await pool.request()
      .input('jenisId', sql.Int, JenisId)
      .query('SELECT Id FROM JenisPeralatan WHERE Id = @jenisId');
    
    if (checkJenis.recordset.length === 0) {
      return res.status(400).json({ message: 'Jenis Peralatan tidak ditemukan' });
    }
    
    await pool.request()
      .input('id', sql.Int, id)
      .input('pertanyaan', sql.NVarChar, Pertanyaan)
      .input('jenisId', sql.Int, JenisId)
      .query(`
        UPDATE Checklist 
        SET Pertanyaan = @pertanyaan, JenisId = @jenisId
        WHERE Id = @id
      `);
    
    // Return updated record
    const updatedRecord = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          c.*,
          jp.Nama as JenisNama
        FROM Checklist c
        JOIN JenisPeralatan jp ON c.JenisId = jp.Id
        WHERE c.Id = @id
      `);
    
    res.json(updatedRecord.recordset[0]);
  } catch (err) {
    console.error('Error update checklist:', err);
    res.status(500).json({ message: 'Gagal update checklist' });
  }
});

// DELETE - Hapus checklist
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    
    // Check if being used in ChecklistJawaban
    const checkUsage = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT COUNT(*) as count FROM ChecklistJawaban WHERE ChecklistId = @id');
    
    if (checkUsage.recordset[0].count > 0) {
      return res.status(400).json({ 
        message: 'Checklist tidak dapat dihapus karena sudah memiliki jawaban/riwayat pemeriksaan' 
      });
    }
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM Checklist WHERE Id = @id');
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Checklist tidak ditemukan' });
    }
    
    res.json({ message: 'Checklist berhasil dihapus' });
  } catch (err) {
    console.error('Error delete checklist:', err);
    res.status(500).json({ message: 'Gagal menghapus checklist' });
  }
});

module.exports = router;