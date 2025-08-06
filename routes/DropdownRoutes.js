// routes/DropdownRoutes.js
const express = require('express');
const router = express.Router();
const { poolPromise } = require('../ConfigDB');

// API GET Roles
router.get('/roles', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT DISTINCT Role FROM Petugas WHERE Role IS NOT NULL ORDER BY Role');
    res.json(result.recordset.map(r => r.Role));
  } catch (err) {
    res.status(500).json([]);
  }
});

// API GET Interval
router.get('/intervals', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT Id, NamaInterval AS Nama FROM IntervalPetugas ORDER BY Nama');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json([]);
  }
});

// API GET Lokasi
router.get('/lokasi', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT Id, Nama FROM Lokasi ORDER BY Nama');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json([]);
  }
});

module.exports = router;
