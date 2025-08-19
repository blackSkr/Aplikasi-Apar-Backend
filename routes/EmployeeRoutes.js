// routes/EmployeeRoutes.js
const express = require('express');
const router  = express.Router();
const { poolPromise, sql } = require('../ConfigDB');

// =======================
// Debug middleware (opsional)
// =======================
router.use((req, res, next) => {
  console.log('>>> [EmployeeRoutes]', req.method, req.originalUrl);
  console.log('    headers:', req.headers['content-type']);
  console.log('    params :', req.params);
  console.log('    query  :', req.query);
  console.log('    body   :', req.body);
  next();
});

// =======================
// Helpers
// =======================

// Normalisasi payload agar fleksibel untuk banyak gaya casing nama field.
// Prioritas: body camelCase → fallback ke variasi lain.
function normalizeEmployeePayload(body = {}) {
  // Terima variasi nama field:
  // nama / Nama / name, badgeNumber / BadgeNumber, Divisi / Divisi,
  // Departemen / Departemen / department
  const get = (...keys) => {
    for (const k of keys) {
      if (body[k] !== undefined && body[k] !== '') return body[k];
    }
    return null;
  };

  return {
    Nama:         get('nama', 'Nama', 'name', 'Name'),
    BadgeNumber:  get('badgeNumber', 'BadgeNumber', 'badge_number', 'badge'),
    Divisi:     get('Divisi', 'Divisi'),
    // Skema kamu pakai "Departemen" (ejaan dgn 't'), kita dukung beberapa varian
    Departemen:  get('Departemen', 'Departemen', 'department', 'Department')
  };
}

// Validasi input minimal
function validateRequired({ BadgeNumber }) {
  const errors = [];
  if (!BadgeNumber) errors.push('BadgeNumber harus diisi.');
  return errors;
}

// Amanin nama kolom buat ORDER BY
const ALLOWED_SORT = new Set(['Id', 'Nama', 'BadgeNumber', 'Divisi', 'Departemen']);
function safeSort(sortBy = 'Id') {
  return ALLOWED_SORT.has(sortBy) ? sortBy : 'Id';
}
function safeDir(dir = 'ASC') {
  const d = String(dir || '').toUpperCase();
  return (d === 'DESC') ? 'DESC' : 'ASC';
}

// =======================
// GET /api/employee
// List + search + pagination + sorting
// =======================
//
// Query params:
// q         : string (cari di Nama, BadgeNumber, Divisi, Departemen)
// page      : default 1
// pageSize  : default 25
// sortBy    : Id|Nama|BadgeNumber|Divisi|Departemen
// sortDir   : ASC|DESC
//
router.get('/', async (req, res) => {
  try {
    const q        = (req.query.q || '').trim();
    const page     = Math.max(parseInt(req.query.page || '1', 10), 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '25', 10), 1), 200);
    const sortBy   = safeSort(req.query.sortBy);
    const sortDir  = safeDir(req.query.sortDir);

    const pool = await poolPromise;
    const request = pool.request()
      .input('offset', sql.Int, (page - 1) * pageSize)
      .input('limit',  sql.Int, pageSize);

    let where = '';
    if (q) {
      // gunakan NVARCHAR untuk dukung karakter lokal
      request.input('q', sql.NVarChar, `%${q}%`);
      where = `
        WHERE
          (e.Nama        LIKE @q OR
           e.BadgeNumber LIKE @q OR
           e.Divisi    LIKE @q OR
           e.Departemen LIKE @q)
      `;
    }

    // Total
    const totalSql = `
      SELECT COUNT(1) AS Total
      FROM Employee e
      ${where}
    `;
    const totalRes = await request.query(totalSql);
    const total = totalRes.recordset[0]?.Total || 0;

    // Data (paging)
    const dataSql = `
      SELECT
        e.Id,
        e.Nama,
        e.BadgeNumber,
        e.Divisi,
        e.Departemen
      FROM Employee e
      ${where}
      ORDER BY ${sortBy} ${sortDir}
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY;
    `;
    // Harus bikin request baru untuk query kedua (request tidak reusable setelah dieksekusi)
    const request2 = pool.request()
      .input('offset', sql.Int, (page - 1) * pageSize)
      .input('limit',  sql.Int, pageSize);

    if (q) request2.input('q', sql.NVarChar, `%${q}%`);

    const listRes = await request2.query(dataSql);

    res.json({
      page,
      pageSize,
      total,
      items: listRes.recordset
    });
  } catch (err) {
    console.error('Error get employees:', err);
    res.status(500).json({ message: 'Gagal mengambil data employee' });
  }
});

// =======================
// GET /api/employee/dropdown
// Untuk kebutuhan dropdown ringan (misal select di MVC)
// =======================
router.get('/dropdown', async (_req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT
        e.Id,
        e.Nama,
        e.BadgeNumber
      FROM Employee e
      ORDER BY e.Nama ASC, e.BadgeNumber ASC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Error employee dropdown:', err);
    res.status(500).json({ message: 'Gagal mengambil dropdown employee' });
  }
});

// =======================
// GET /api/employee/:id
// =======================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          e.Id,
          e.Nama,
          e.BadgeNumber,
          e.Divisi,
          e.Departemen
        FROM Employee e
        WHERE e.Id = @id
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ message: 'Employee tidak ditemukan' });
    }
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('Error get employee by id:', err);
    res.status(500).json({ message: 'Gagal mengambil detail employee' });
  }
});

// =======================
// POST /api/employee
// CREATE
// =======================
router.post('/', async (req, res) => {
  try {
    const payload = normalizeEmployeePayload(req.body);
    const errors = validateRequired(payload);
    if (errors.length) {
      return res.status(400).json({ message: errors.join(' ') });
    }

    const pool = await poolPromise;

    // Cek duplikat BadgeNumber
    const dup = await pool.request()
      .input('badge', sql.NVarChar, payload.BadgeNumber)
      .query('SELECT 1 FROM Employee WHERE BadgeNumber = @badge');
    if (dup.recordset.length) {
      return res.status(400).json({ message: 'BadgeNumber sudah ada' });
    }

    const insertRes = await pool.request()
      .input('Nama',        sql.NVarChar, payload.Nama || null)
      .input('BadgeNumber', sql.NVarChar, payload.BadgeNumber)
      .input('Divisi',    sql.NVarChar, payload.Divisi || null)
      .input('Departemen', sql.NVarChar, payload.Departemen || null)
      .query(`
        INSERT INTO Employee (Nama, BadgeNumber, Divisi, Departemen)
        VALUES (@Nama, @BadgeNumber, @Divisi, @Departemen);
        SELECT SCOPE_IDENTITY() AS Id;
      `);

    const newId = insertRes.recordset[0].Id;
    const newRec = await pool.request()
      .input('id', sql.Int, newId)
      .query(`
        SELECT
          e.Id,
          e.Nama,
          e.BadgeNumber,
          e.Divisi,
          e.Departemen
        FROM Employee e
        WHERE e.Id = @id
      `);

    res.status(201).json(newRec.recordset[0]);
  } catch (err) {
    console.error('Error create employee:', err);
    res.status(500).json({ message: 'Gagal menambah employee' });
  }
});

// =======================
// PUT /api/employee/:id
// UPDATE (full replace style)
// =======================
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const payload = normalizeEmployeePayload(req.body);
    const errors = validateRequired(payload);
    if (errors.length) {
      return res.status(400).json({ message: errors.join(' ') });
    }

    const pool = await poolPromise;

    // Pastikan ada
    const exists = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT 1 FROM Employee WHERE Id = @id');
    if (!exists.recordset.length) {
      return res.status(404).json({ message: 'Employee tidak ditemukan' });
    }

    // Cek duplikat BadgeNumber selain diri sendiri
    const dup = await pool.request()
      .input('badge', sql.NVarChar, payload.BadgeNumber)
      .input('id',    sql.Int, id)
      .query('SELECT 1 FROM Employee WHERE BadgeNumber = @badge AND Id != @id');
    if (dup.recordset.length) {
      return res.status(400).json({ message: 'BadgeNumber sudah ada' });
    }

    // Update
    await pool.request()
      .input('id',          sql.Int, id)
      .input('Nama',        sql.NVarChar, payload.Nama || null)
      .input('BadgeNumber', sql.NVarChar, payload.BadgeNumber)
      .input('Divisi',    sql.NVarChar, payload.Divisi || null)
      .input('Departemen', sql.NVarChar, payload.Departemen || null)
      .query(`
        UPDATE Employee
           SET Nama        = @Nama,
               BadgeNumber = @BadgeNumber,
               Divisi    = @Divisi,
               Departemen = @Departemen
         WHERE Id = @id;
      `);

    const updated = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          e.Id,
          e.Nama,
          e.BadgeNumber,
          e.Divisi,
          e.Departemen
        FROM Employee e
        WHERE e.Id = @id
      `);

    res.json(updated.recordset[0]);
  } catch (err) {
    console.error('Error update employee:', err);
    res.status(500).json({ message: 'Gagal update employee' });
  }
});

// =======================
// PATCH /api/employee/:id
// UPDATE sebagian (partial)
// =======================
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Ambil payload mentah (boleh sebagian)
    const raw = req.body || {};
    const p = normalizeEmployeePayload(raw);

    const pool = await poolPromise;

    // Pastikan ada
    const exists = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT 1 FROM Employee WHERE Id = @id');
    if (!exists.recordset.length) {
      return res.status(404).json({ message: 'Employee tidak ditemukan' });
    }

    // Kalau user mengubah BadgeNumber, cek duplikat
    if (p.BadgeNumber) {
      const dup = await pool.request()
        .input('badge', sql.NVarChar, p.BadgeNumber)
        .input('id',    sql.Int, id)
        .query('SELECT 1 FROM Employee WHERE BadgeNumber = @badge AND Id != @id');
      if (dup.recordset.length) {
        return res.status(400).json({ message: 'BadgeNumber sudah ada' });
      }
    }

    // Bangun SET clause dinamis
    const fields = [];
    const reqst  = pool.request().input('id', sql.Int, id);

    if (p.Nama !== null)        { fields.push('Nama = @Nama'); reqst.input('Nama', sql.NVarChar, p.Nama); }
    if (p.BadgeNumber !== null) { fields.push('BadgeNumber = @BadgeNumber'); reqst.input('BadgeNumber', sql.NVarChar, p.BadgeNumber); }
    if (p.Divisi !== null)    { fields.push('Divisi = @Divisi'); reqst.input('Divisi', sql.NVarChar, p.Divisi); }
    if (p.Departemen !== null) { fields.push('Departemen = @Departemen'); reqst.input('Departemen', sql.NVarChar, p.Departemen); }

    if (!fields.length) {
      return res.status(400).json({ message: 'Tidak ada field yang diubah' });
    }

    await reqst.query(`
      UPDATE Employee
         SET ${fields.join(', ')}
       WHERE Id = @id;
    `);

    const updated = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          e.Id,
          e.Nama,
          e.BadgeNumber,
          e.Divisi,
          e.Departemen
        FROM Employee e
        WHERE e.Id = @id
      `);

    res.json(updated.recordset[0]);
  } catch (err) {
    console.error('Error patch employee:', err);
    res.status(500).json({ message: 'Gagal update sebagian employee' });
  }
});

// =======================
// DELETE /api/employee/:id
// =======================
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool   = await poolPromise;

    const del = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM Employee WHERE Id = @id');

    if (!del.rowsAffected[0]) {
      return res.status(404).json({ message: 'Employee tidak ditemukan' });
    }
    res.json({ message: 'Employee berhasil dihapus' });
  } catch (err) {
    console.error('Error delete employee:', err);
    res.status(500).json({ message: 'Gagal menghapus employee' });
  }
});
// =======================
// GET /api/employee/by-badge/:badge
// Ambil 1 employee berdasarkan BadgeNumber
// =======================
router.get('/by-badge/:badge', async (req, res) => {
  try {
    const { badge } = req.params;
    const pool = await poolPromise;

    const result = await pool.request()
      .input('BadgeNumber', sql.NVarChar, String(badge).trim())
      .query(`
        SELECT TOP 1
          e.Id,
          e.Nama,
          e.BadgeNumber,
          e.Divisi,
          e.Departemen
        FROM Employee e
        WHERE e.BadgeNumber = @BadgeNumber
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ message: 'Employee tidak ditemukan' });
    }
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('Error get employee by badge:', err);
    res.status(500).json({ message: 'Gagal mengambil employee by badge' });
  }
});

// =======================
// GET /api/employee/find?BadgeNumber=XXXX
// Opsional: dukung juga ?badge=XXXX sebagai alias
// =======================
router.get('/find', async (req, res) => {
  try {
    const badge =
      (req.query.BadgeNumber ?? req.query.badge ?? '').toString().trim();

    if (!badge) {
      return res.status(400).json({ message: 'Parameter BadgeNumber wajib diisi' });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input('BadgeNumber', sql.NVarChar, badge)
      .query(`
        SELECT TOP 1
          e.Id,
          e.Nama,
          e.BadgeNumber,
          e.Divisi,
          e.Departemen
        FROM Employee e
        WHERE e.BadgeNumber = @BadgeNumber
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ message: 'Employee tidak ditemukan' });
    }
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('Error find employee by badge:', err);
    res.status(500).json({ message: 'Gagal mencari employee' });
  }
});


// =======================
// POST /api/employee/bulk
// Terima array JSON [{Nama, BadgeNumber, Divisi, Departemen}, ...]
// Akan skip record yang badge duplikat (idempotent-ish)
// =======================
router.post('/bulk', async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : req.body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Kirim array employee pada body.' });
  }

  const pool = await poolPromise;
  const created = [];
  const skipped = [];

  // Jalankan sebagai transaksi agar rapi
  const connection = await poolPromise;
  const transaction = new sql.Transaction(connection);
  try {
    await transaction.begin();

    for (const raw of items) {
      const p = normalizeEmployeePayload(raw);
      if (!p.BadgeNumber) {
        skipped.push({ reason: 'BadgeNumber kosong', item: raw });
        continue;
      }

      const reqDup = new sql.Request(transaction);
      const dup = await reqDup
        .input('badge', sql.NVarChar, p.BadgeNumber)
        .query('SELECT 1 FROM Employee WHERE BadgeNumber = @badge');
      if (dup.recordset.length) {
        skipped.push({ reason: 'BadgeNumber duplikat', item: raw });
        continue;
      }

      const reqIns = new sql.Request(transaction);
      const inserted = await reqIns
        .input('Nama',        sql.NVarChar, p.Nama || null)
        .input('BadgeNumber', sql.NVarChar, p.BadgeNumber)
        .input('Divisi',    sql.NVarChar, p.Divisi || null)
        .input('Departemen', sql.NVarChar, p.Departemen || null)
        .query(`
          INSERT INTO Employee (Nama, BadgeNumber, Divisi, Departemen)
          VALUES (@Nama, @BadgeNumber, @Divisi, @Departemen);
          SELECT SCOPE_IDENTITY() AS Id;
        `);

      created.push({
        Id: inserted.recordset[0].Id,
        ...p
      });
    }

    await transaction.commit();
    res.status(201).json({ createdCount: created.length, skippedCount: skipped.length, created, skipped });
  } catch (err) {
    console.error('Error bulk employee:', err);
    try { await transaction.rollback(); } catch (e) { /* noop */ }
    res.status(500).json({ message: 'Gagal bulk insert employee' });
  }
});

module.exports = router;
