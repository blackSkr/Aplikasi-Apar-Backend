// routes/RolePetugasRoutes.js
const express = require('express');
const router  = express.Router();
const { poolPromise, sql } = require('../ConfigDB');

// =======================
// Debug middleware (opsional)
// =======================
router.use((req, _res, next) => {
  console.log('>>> [RolePetugasRoutes]', req.method, req.originalUrl);
  console.log('    query :', req.query);
  console.log('    body  :', req.body);
  next();
});

// =======================
// Helpers
// =======================
const ALLOWED_SORT = new Set(['Id', 'NamaRole', 'IsActive', 'Bulan', 'NamaInterval']);

function safeSort(sortBy = 'NamaRole') {
  return ALLOWED_SORT.has(sortBy) ? sortBy : 'NamaRole';
}
function safeDir(dir = 'ASC') {
  const d = String(dir || '').toUpperCase();
  return (d === 'DESC') ? 'DESC' : 'ASC';
}

function normalizePayload(body = {}) {
  const pick = (...keys) => {
    for (const k of keys) if (body[k] !== undefined) return body[k];
    return undefined;
  };
  return {
    NamaRole:          pick('NamaRole', 'namaRole', 'Nama', 'name', 'roleName'),
    IntervalPetugasId: pick('IntervalPetugasId', 'IdInterval', 'intervalId', 'idInterval'),
    Deskripsi:         pick('Deskripsi', 'deskripsi', 'description'),
    IsActive:          pick('IsActive', 'isActive')
  };
}

async function ensureIntervalExists(pool, id) {
  if (id === null || id === undefined || id === '') return true;
  const r = await pool.request().input('id', sql.Int, id)
    .query('SELECT 1 FROM IntervalPetugas WHERE Id = @id');
  return r.recordset.length > 0;
}

// =======================
// GET /api/role-petugas
// List + search + pagination + sort
// q: cari di NamaRole/Deskripsi/NamaInterval
// onlyActive: (0|1)
// includeInterval: (0|1) - (saat ini selalu kirim kolom interval)
// =======================
router.get('/', async (req, res) => {
  try {
    const q        = (req.query.q || '').trim();
    const page     = Math.max(parseInt(req.query.page || '1', 10), 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '25', 10), 1), 200);
    const sortBy   = safeSort(req.query.sortBy);
    const sortDir  = safeDir(req.query.sortDir);
    const onlyAct  = (req.query.onlyActive === '1' || req.query.onlyActive === 1);
    const incInt   = (req.query.includeInterval === '1' || req.query.includeInterval === 1);

    const pool = await poolPromise;

    let where = 'WHERE 1=1';
    const baseReq = pool.request()
      .input('offset', sql.Int, (page - 1) * pageSize)
      .input('limit',  sql.Int, pageSize);

    if (q) {
      baseReq.input('q', sql.NVarChar, `%${q}%`);
      where += ` AND (r.NamaRole LIKE @q OR r.Deskripsi LIKE @q OR i.NamaInterval LIKE @q)`;
    }
    if (onlyAct) {
      where += ` AND r.IsActive = 1`;
    }

    // Total
    const totalSql = `
      SELECT COUNT(1) AS Total
      FROM RolePetugas r
      LEFT JOIN IntervalPetugas i ON r.IntervalPetugasId = i.Id
      ${where}
    `;
    const totalRes = await baseReq.query(totalSql);
    const total = totalRes.recordset[0]?.Total || 0;

    // Data
    const orderExpr = (sortBy === 'Bulan' || sortBy === 'NamaInterval')
      ? `${sortBy} ${sortDir}, r.NamaRole ASC`
      : `r.${sortBy} ${sortDir}`;

    const req2 = pool.request()
      .input('offset', sql.Int, (page - 1) * pageSize)
      .input('limit',  sql.Int, pageSize);
    if (q) req2.input('q', sql.NVarChar, `%${q}%`);

    const dataSql = `
      SELECT
        r.Id,
        r.NamaRole,
        r.IntervalPetugasId,
        r.Deskripsi,
        r.IsActive,
        r.CreatedAt,
        r.UpdatedAt,
        i.NamaInterval,
        i.Bulan
      FROM RolePetugas r
      LEFT JOIN IntervalPetugas i ON r.IntervalPetugasId = i.Id
      ${where}
      ORDER BY ${orderExpr}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
    `;
    const listRes = await req2.query(dataSql);

    res.json({
      page, pageSize, total,
      items: listRes.recordset,
      includeInterval: incInt
    });
  } catch (err) {
    console.error('Error get role-petugas:', err);
    res.status(500).json({ message: 'Gagal mengambil data role petugas' });
  }
});

// =======================
// GET /api/role-petugas/dropdown?onlyActive=1
// Mengembalikan label interval siap tampil: IntervalLabel
// =======================
router.get('/dropdown', async (req, res) => {
  try {
    const onlyAct  = (req.query.onlyActive === '1' || req.query.onlyActive === 1);
    const pool = await poolPromise;
    const request = pool.request();

    const where = onlyAct ? 'WHERE r.IsActive = 1' : '';
    const result = await request.query(`
      SELECT
        r.Id,
        r.NamaRole,
        r.IntervalPetugasId,
        i.NamaInterval,
        i.Bulan,
        CASE
          WHEN i.NamaInterval IS NULL THEN NULL
          WHEN i.Bulan IS NULL THEN i.NamaInterval
          ELSE CONCAT(i.NamaInterval, ' (', i.Bulan, ' bulan)')
        END AS IntervalLabel
      FROM RolePetugas r
      LEFT JOIN IntervalPetugas i ON r.IntervalPetugasId = i.Id
      ${where}
      ORDER BY r.NamaRole ASC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Error dropdown role-petugas:', err);
    res.status(500).json({ message: 'Gagal mengambil dropdown role petugas' });
  }
});

// =======================
// GET /api/role-petugas/:id
// =======================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          r.Id,
          r.NamaRole,
          r.IntervalPetugasId,
          r.Deskripsi,
          r.IsActive,
          r.CreatedAt,
          r.UpdatedAt,
          i.NamaInterval,
          i.Bulan
        FROM RolePetugas r
        LEFT JOIN IntervalPetugas i ON r.IntervalPetugasId = i.Id
        WHERE r.Id = @id
      `);
    if (!result.recordset.length) {
      return res.status(404).json({ message: 'Role petugas tidak ditemukan' });
    }
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('Error get role-petugas by id:', err);
    res.status(500).json({ message: 'Gagal mengambil detail role petugas' });
  }
});

// =======================
// POST /api/role-petugas
// =======================
router.post('/', async (req, res) => {
  try {
    const p = normalizePayload(req.body);
    if (!p.NamaRole) {
      return res.status(400).json({ message: 'NamaRole harus diisi' });
    }

    const pool = await poolPromise;

    // Cek duplikat nama
    const dup = await pool.request()
      .input('nama', sql.NVarChar, p.NamaRole)
      .query('SELECT 1 FROM RolePetugas WHERE NamaRole = @nama');
    if (dup.recordset.length) {
      return res.status(400).json({ message: 'NamaRole sudah ada' });
    }

    // Validasi interval jika diisi
    if (!(await ensureIntervalExists(pool, p.IntervalPetugasId))) {
      return res.status(400).json({ message: 'IntervalPetugasId tidak valid' });
    }

    const insert = await pool.request()
      .input('NamaRole',          sql.NVarChar, p.NamaRole)
      .input('IntervalPetugasId', sql.Int,      p.IntervalPetugasId || null)
      .input('Deskripsi',         sql.NVarChar, p.Deskripsi || null)
      .input('IsActive',          sql.Bit,      (p.IsActive === undefined ? 1 : (p.IsActive ? 1 : 0)))
      .query(`
        INSERT INTO RolePetugas (NamaRole, IntervalPetugasId, Deskripsi, IsActive)
        VALUES (@NamaRole, @IntervalPetugasId, @Deskripsi, @IsActive);
        SELECT CONVERT(INT, SCOPE_IDENTITY()) AS Id;
      `);

    const newId = insert.recordset[0].Id;
    const created = await pool.request().input('id', sql.Int, newId).query(`
      SELECT
        r.Id, r.NamaRole, r.IntervalPetugasId, r.Deskripsi, r.IsActive, r.CreatedAt, r.UpdatedAt,
        i.NamaInterval, i.Bulan
      FROM RolePetugas r
      LEFT JOIN IntervalPetugas i ON r.IntervalPetugasId = i.Id
      WHERE r.Id = @id
    `);

    res.status(201).json(created.recordset[0]);
  } catch (err) {
    console.error('Error create role-petugas:', err);
    res.status(500).json({ message: 'Gagal menambah role petugas' });
  }
});

// =======================
// PUT /api/role-petugas/:id  (full update)
// =======================
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const p = normalizePayload(req.body);

    if (!p.NamaRole) {
      return res.status(400).json({ message: 'NamaRole harus diisi' });
    }
    const pool = await poolPromise;

    const exist = await pool.request().input('id', sql.Int, id)
      .query('SELECT 1 FROM RolePetugas WHERE Id = @id');
    if (!exist.recordset.length) {
      return res.status(404).json({ message: 'Role petugas tidak ditemukan' });
    }

    // Cek duplikat nama selain diri sendiri
    const dup = await pool.request()
      .input('nama', sql.NVarChar, p.NamaRole)
      .input('id',   sql.Int, id)
      .query('SELECT 1 FROM RolePetugas WHERE NamaRole = @nama AND Id != @id');
    if (dup.recordset.length) {
      return res.status(400).json({ message: 'NamaRole sudah ada' });
    }

    // Validasi interval jika diisi
    if (!(await ensureIntervalExists(pool, p.IntervalPetugasId))) {
      return res.status(400).json({ message: 'IntervalPetugasId tidak valid' });
    }

    await pool.request()
      .input('id',                sql.Int, id)
      .input('NamaRole',          sql.NVarChar, p.NamaRole)
      .input('IntervalPetugasId', sql.Int,      p.IntervalPetugasId || null)
      .input('Deskripsi',         sql.NVarChar, p.Deskripsi || null)
      .input('IsActive',          sql.Bit,      (p.IsActive === undefined ? 1 : (p.IsActive ? 1 : 0)))
      .query(`
        UPDATE RolePetugas
           SET NamaRole          = @NamaRole,
               IntervalPetugasId = @IntervalPetugasId,
               Deskripsi         = @Deskripsi,
               IsActive          = @IsActive
         WHERE Id = @id;
      `);

    const updated = await pool.request().input('id', sql.Int, id).query(`
      SELECT
        r.Id, r.NamaRole, r.IntervalPetugasId, r.Deskripsi, r.IsActive, r.CreatedAt, r.UpdatedAt,
        i.NamaInterval, i.Bulan
      FROM RolePetugas r
      LEFT JOIN IntervalPetugas i ON r.IntervalPetugasId = i.Id
      WHERE r.Id = @id
    `);

    res.json(updated.recordset[0]);
  } catch (err) {
    console.error('Error update role-petugas:', err);
    res.status(500).json({ message: 'Gagal update role petugas' });
  }
});

// =======================
// PATCH /api/role-petugas/:id (partial update)
// =======================
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const p = normalizePayload(req.body);

    const pool = await poolPromise;

    const exist = await pool.request().input('id', sql.Int, id)
      .query('SELECT 1 FROM RolePetugas WHERE Id = @id');
    if (!exist.recordset.length) {
      return res.status(404).json({ message: 'Role petugas tidak ditemukan' });
    }

    // Kalau mengubah nama → cek duplikat
    if (p.NamaRole !== undefined) {
      if (!p.NamaRole) return res.status(400).json({ message: 'NamaRole tidak boleh kosong' });
      const dup = await pool.request()
        .input('nama', sql.NVarChar, p.NamaRole)
        .input('id',   sql.Int, id)
        .query('SELECT 1 FROM RolePetugas WHERE NamaRole = @nama AND Id != @id');
      if (dup.recordset.length) {
        return res.status(400).json({ message: 'NamaRole sudah ada' });
      }
    }

    // Kalau mengubah interval → validasi
    if (p.IntervalPetugasId !== undefined) {
      if (!(await ensureIntervalExists(pool, p.IntervalPetugasId))) {
        return res.status(400).json({ message: 'IntervalPetugasId tidak valid' });
      }
    }

    // Build SET dinamis
    const fields = [];
    const reqst = pool.request().input('id', sql.Int, id);
    if (p.NamaRole !== undefined)          { fields.push('NamaRole = @NamaRole'); reqst.input('NamaRole', sql.NVarChar, p.NamaRole); }
    if (p.IntervalPetugasId !== undefined) { fields.push('IntervalPetugasId = @IntervalPetugasId'); reqst.input('IntervalPetugasId', sql.Int, (p.IntervalPetugasId || null)); }
    if (p.Deskripsi !== undefined)         { fields.push('Deskripsi = @Deskripsi'); reqst.input('Deskripsi', sql.NVarChar, (p.Deskripsi || null)); }
    if (p.IsActive !== undefined)          { fields.push('IsActive = @IsActive'); reqst.input('IsActive', sql.Bit, (p.IsActive ? 1 : 0)); }

    if (!fields.length) {
      return res.status(400).json({ message: 'Tidak ada field yang diubah' });
    }

    await reqst.query(`UPDATE RolePetugas SET ${fields.join(', ')} WHERE Id = @id;`);

    const updated = await pool.request().input('id', sql.Int, id).query(`
      SELECT
        r.Id, r.NamaRole, r.IntervalPetugasId, r.Deskripsi, r.IsActive, r.CreatedAt, r.UpdatedAt,
        i.NamaInterval, i.Bulan
      FROM RolePetugas r
      LEFT JOIN IntervalPetugas i ON r.IntervalPetugasId = i.Id
      WHERE r.Id = @id
    `);

    res.json(updated.recordset[0]);
  } catch (err) {
    console.error('Error patch role-petugas:', err);
    res.status(500).json({ message: 'Gagal update sebagian role petugas' });
  }
});

// =======================
// DELETE /api/role-petugas/:id
// (Jika nanti Petugas.RolePetugasId dipakai, tambahkan cek referensi di sini)
// =======================
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool   = await poolPromise;

    // (Opsional) Jika kolom Petugas.RolePetugasId sudah ada, cegah delete saat dipakai
    let inUseCount = 0;
    const colCheck = await pool.request().query(`
      SELECT COUNT(1) AS Cnt FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.Petugas') AND name = 'RolePetugasId'
    `);
    if (colCheck.recordset[0].Cnt > 0) {
      const useRes = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT COUNT(*) AS C FROM Petugas WHERE RolePetugasId = @id');
      inUseCount = useRes.recordset[0].C || 0;
    }

    if (inUseCount > 0) {
      return res.status(400).json({ message: 'Role tidak dapat dihapus karena sedang digunakan oleh Petugas' });
    }

    const del = await pool.request().input('id', sql.Int, id)
      .query('DELETE FROM RolePetugas WHERE Id = @id');

    if (!del.rowsAffected[0]) {
      return res.status(404).json({ message: 'Role petugas tidak ditemukan' });
    }

    res.json({ message: 'Role petugas berhasil dihapus' });
  } catch (err) {
    console.error('Error delete role-petugas:', err);
    res.status(500).json({ message: 'Gagal menghapus role petugas' });
  }
});

module.exports = router;
