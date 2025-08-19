// routes/DashboardRoutes.js
const express = require('express');
const router = express.Router();
const { poolPromise, sql } = require('../ConfigDB'); // SAMA seperti di PeralatanRoutes

router.get('/summary', async (req, res) => {
  try {
    const pool = await poolPromise; // <<< INI WAJIB: JANGAN sql.connect() TANPA CONFIG

    const [peralatanRes, checklistRes, lokasiRes, petugasRes] = await Promise.all([
      pool.request().query('SELECT COUNT_BIG(1) AS Peralatan FROM Peralatan WITH (NOLOCK)'),
      pool.request().query('SELECT COUNT_BIG(1) AS Checklist FROM Checklist WITH (NOLOCK)'),
      pool.request().query('SELECT COUNT_BIG(1) AS Lokasi FROM Lokasi WITH (NOLOCK)'),
      pool.request().query('SELECT COUNT_BIG(1) AS Petugas FROM Petugas WITH (NOLOCK)'),
    ]);

    const Peralatan = Number(peralatanRes.recordset[0]?.Peralatan ?? 0);
    const Checklist = Number(checklistRes.recordset[0]?.Checklist ?? 0);
    const Lokasi    = Number(lokasiRes.recordset[0]?.Lokasi ?? 0);
    const Petugas   = Number(petugasRes.recordset[0]?.Petugas ?? 0);

    res.json({ peralatan: Peralatan, checklist: Checklist, lokasi: Lokasi, petugas: Petugas });
  } catch (e) {
    console.error('Dashboard summary error:', e);
    res.status(500).json({ error: e.message || 'Unknown error' });
  }
});

module.exports = router;
