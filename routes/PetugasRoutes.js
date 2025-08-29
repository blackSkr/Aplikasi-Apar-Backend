// routes/PetugasRoutes.js (RoleId-first, dinamis untuk FE)
const express = require('express');
const router  = express.Router();
const { poolPromise, sql } = require('../ConfigDB');

// Debug (opsional)
router.use((req, _res, next) => {
  console.log('>>> [PetugasRoutes]', req.method, req.originalUrl);
  console.log('    query :', req.query);
  console.log('    body  :', req.body);
  next();
});

/** Normalisasi badge (trim + uppercase, tapi JANGAN di-cast ke int biar leading zero aman) */
function normBadge(b) {
  return String(b || '').trim().toUpperCase();
}

// Helpers
const ALLOWED_SORT = new Set(['Id','BadgeNumber','RoleNama','EmployeeNama','LokasiNama','IntervalBulan']);
const safeSort = (s='BadgeNumber') => ALLOWED_SORT.has(s) ? s : 'BadgeNumber';
const safeDir  = (d='ASC') => (String(d||'').toUpperCase()==='DESC'?'DESC':'ASC');
const pick = (...vals) => { for (const v of vals) if (v!==undefined && v!=='') return v; };

function normalize(body={}) {
  return {
    employeeId:    pick(body.employeeId, body.EmployeeId, body.empId, body.EmpId),
    employeeBadge: pick(body.employeeBadge, body.employee_badge, body.badgeEmployee, body.BadgeEmployee),
    badgeNumber:   pick(body.badgeNumber, body.BadgeNumber, body.badge), // legacy

    rolePetugasId: pick(body.rolePetugasId, body.RolePetugasId, body.roleId, body.RoleId),
    roleName:      pick(body.roleName, body.NamaRole, body.role, body.Role),

    lokasiId:      pick(body.lokasiId, body.LokasiId),
  };
}

async function resolveEmployee(pool, { employeeId, employeeBadge, badgeNumber }) {
  if (employeeId) {
    const r = await pool.request().input('id', sql.Int, employeeId).query(`
      SELECT Id, BadgeNumber, Nama, Divisi, Departemen FROM Employee WHERE Id = @id
    `);
    return r.recordset[0] || null;
  }
  const badge = employeeBadge || badgeNumber;
  if (badge) {
    const r = await pool.request().input('badge', sql.NVarChar, badge).query(`
      SELECT Id, BadgeNumber, Nama, Divisi, Departemen FROM Employee WHERE BadgeNumber = @badge
    `);
    return r.recordset[0] || null;
  }
  return null;
}

async function resolveRole(pool, { rolePetugasId, roleName }) {
  if (rolePetugasId) {
    const r = await pool.request().input('id', sql.Int, rolePetugasId).query(`
      SELECT r.Id, r.NamaRole, r.IntervalPetugasId, i.NamaInterval AS IntervalNama, i.Bulan AS IntervalBulan
      FROM RolePetugas r
      LEFT JOIN IntervalPetugas i ON i.Id = r.IntervalPetugasId
      WHERE r.Id = @id
    `);
    return r.recordset[0] || null;
  }
  if (roleName) {
    const r = await pool.request().input('name', sql.NVarChar, roleName).query(`
      SELECT TOP 1 r.Id, r.NamaRole, r.IntervalPetugasId, i.NamaInterval AS IntervalNama, i.Bulan AS IntervalBulan
      FROM RolePetugas r
      LEFT JOIN IntervalPetugas i ON i.Id = r.IntervalPetugasId
      WHERE r.NamaRole = @name
      ORDER BY r.Id ASC
    `);
    return r.recordset[0] || null;
  }
  return null;
}


function shapeRow(row) {
  return {
    Id: row.Id,
    EmployeeId: row.EmployeeId,
    BadgeNumber: row.BadgeNumber,
    RolePetugasId: row.RolePetugasId,
    LokasiId: row.LokasiId,

    RoleNama: row.RoleNama,
    IntervalPetugasId: row.IntervalPetugasId,
    IntervalNama: row.IntervalNama,
    IntervalBulan: row.IntervalBulan,
    LokasiNama: row.LokasiNama,
    EmployeeNama: row.EmployeeNama,
    EmployeeDivisi: row.EmployeeDivisi,
    EmployeeDepartemen: row.EmployeeDepartemen,

    refs: {
      role: {
        Id: row.RolePetugasId,
        NamaRole: row.RoleNama,
        Interval: row.IntervalPetugasId ? {
          Id: row.IntervalPetugasId,
          NamaInterval: row.IntervalNama,
          Bulan: row.IntervalBulan
        } : null
      },
      lokasi: row.LokasiId ? { Id: row.LokasiId, Nama: row.LokasiNama } : null,
      employee: row.EmployeeId ? {
        Id: row.EmployeeId,
        BadgeNumber: row.BadgeNumber,
        Nama: row.EmployeeNama,
        Divisi: row.EmployeeDivisi,
        Departemen: row.EmployeeDepartemen
      } : null
    }
  };
}

// =======================
// LIST
// q, roleId, lokasiId, intervalId, page, pageSize, sortBy, sortDir
// =======================
router.get('/', async (req, res) => {
  try {
    const q = (req.query.q||'').trim();
    const page = Math.max(parseInt(req.query.page||'1',10),1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize||'25',10),1),200);
    const sortBy = safeSort(req.query.sortBy);
    const sortDir = safeDir(req.query.sortDir);
    const roleId = req.query.roleId ? parseInt(req.query.roleId,10) : null;
    const lokasiId = req.query.lokasiId ? parseInt(req.query.lokasiId,10) : null;
    const intervalId = req.query.intervalId ? parseInt(req.query.intervalId,10) : null;

    const pool = await poolPromise;

    let where = 'WHERE 1=1';
    const r1 = pool.request().input('offset', sql.Int, (page-1)*pageSize).input('limit', sql.Int, pageSize);
    if (q) {
      r1.input('q', sql.NVarChar, `%${q}%`);
      where += ` AND (
        p.BadgeNumber LIKE @q
        OR e.Nama LIKE @q
        OR r.NamaRole LIKE @q
        OR l.Nama LIKE @q
        OR i.NamaInterval LIKE @q
      )`;
    }
    if (roleId)    { r1.input('roleId', sql.Int, roleId);     where += ` AND p.RolePetugasId = @roleId`; }
    if (lokasiId)  { r1.input('lokasiId', sql.Int, lokasiId); where += ` AND p.LokasiId = @lokasiId`; }
    if (intervalId){ r1.input('intervalId', sql.Int, intervalId); where += ` AND r.IntervalPetugasId = @intervalId`; }

    const totalSql = `
      SELECT COUNT(1) AS Total
      FROM Petugas p
      LEFT JOIN RolePetugas r   ON p.RolePetugasId = r.Id
      LEFT JOIN IntervalPetugas i ON r.IntervalPetugasId = i.Id
      LEFT JOIN Lokasi l        ON p.LokasiId = l.Id
      LEFT JOIN Employee e      ON p.EmployeeId = e.Id
      ${where}
    `;
    const total = (await r1.query(totalSql)).recordset[0]?.Total || 0;

    const orderExpr = ({
      Id:'p.Id', BadgeNumber:'p.BadgeNumber', RoleNama:'r.NamaRole',
      EmployeeNama:'e.Nama', LokasiNama:'l.Nama', IntervalBulan:'i.Bulan'
    }[sortBy] || 'p.BadgeNumber') + ` ${sortDir}, p.Id ASC`;

    const r2 = pool.request().input('offset', sql.Int, (page-1)*pageSize).input('limit', sql.Int, pageSize);
    if (q) r2.input('q', sql.NVarChar, `%${q}%`);
    if (roleId) r2.input('roleId', sql.Int, roleId);
    if (lokasiId) r2.input('lokasiId', sql.Int, lokasiId);
    if (intervalId) r2.input('intervalId', sql.Int, intervalId);

    const dataSql = `
      SELECT
        p.Id, p.EmployeeId, p.BadgeNumber, p.RolePetugasId, p.LokasiId,
        r.NamaRole AS RoleNama, r.IntervalPetugasId,
        i.NamaInterval AS IntervalNama, i.Bulan AS IntervalBulan,
        l.Nama AS LokasiNama,
        e.Nama AS EmployeeNama, e.Divisi AS EmployeeDivisi, e.Departemen AS EmployeeDepartemen
      FROM Petugas p
      LEFT JOIN RolePetugas r     ON p.RolePetugasId = r.Id
      LEFT JOIN IntervalPetugas i ON r.IntervalPetugasId = i.Id
      LEFT JOIN Lokasi l          ON p.LokasiId = l.Id
      LEFT JOIN Employee e        ON p.EmployeeId = e.Id
      ${where}
      ORDER BY ${orderExpr}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
    `;
    const rows = (await r2.query(dataSql)).recordset.map(shapeRow);

    res.json({ page, pageSize, total, items: rows });
  } catch (err) {
    console.error('Error list petugas:', err);
    res.status(500).json({ message: 'Gagal mengambil data petugas' });
  }
});

// =======================
// LOKASI by BADGE (PIC) — ditempatkan SEBELUM '/:id' agar tidak ketabrak
// =======================
router.get('/lokasi/:badge', async (req, res) => {
  try {
    const pool = await poolPromise;
    const r = await pool.request().input('badge', sql.NVarChar, req.params.badge).query(`
      SELECT l.Nama AS LokasiNama
      FROM Lokasi l
      JOIN Petugas p ON l.PIC_PetugasId = p.Id
      WHERE p.BadgeNumber = @badge
    `);
    if (!r.recordset.length) return res.status(404).json({ message: 'Petugas/lokasi tidak ditemukan' });
    res.json({ lokasi: r.recordset[0].LokasiNama });
  } catch (err) {
    console.error('Error get lokasi by badge:', err);
    res.status(500).json({ message: 'Gagal mengambil lokasi petugas' });
  }
});

// =======================
// GET BY BADGE (full row dengan join)
// =======================
router.get('/by-badge/:badge', async (req, res) => {
  const raw = req.params.badge ?? '';
  const badge = String(raw).trim(); // jangan cast ke int, biar leading zero aman

  try {
    const pool = await poolPromise;
    const r = await pool.request()
      .input('badge', sql.NVarChar(50), badge)
      .query(`
        SELECT
          p.Id, p.EmployeeId, p.BadgeNumber, p.RolePetugasId, p.LokasiId,
          r.NamaRole AS RoleNama, r.IntervalPetugasId,
          i.NamaInterval AS IntervalNama, i.Bulan AS IntervalBulan,
          l.Nama AS LokasiNama,
          e.Nama AS EmployeeNama, e.Divisi AS EmployeeDivisi, e.Departemen AS EmployeeDepartemen
        FROM Petugas p
        LEFT JOIN RolePetugas r     ON p.RolePetugasId = r.Id
        LEFT JOIN IntervalPetugas i ON r.IntervalPetugasId = i.Id
        LEFT JOIN Lokasi l          ON p.LokasiId = l.Id
        LEFT JOIN Employee e        ON p.EmployeeId = e.Id
        WHERE LTRIM(RTRIM(p.BadgeNumber)) = LTRIM(RTRIM(@badge))
      `);

    if (!r.recordset.length) return res.status(404).json({ message: 'Petugas tidak ditemukan' });
    return res.json(shapeRow(r.recordset[0]));
  } catch (err) {
    console.error('GET /api/petugas/by-badge error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});


// =======================
// DETAIL
// =======================
router.get('/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const r = await pool.request().input('id', sql.Int, req.params.id).query(`
      SELECT
        p.Id, p.EmployeeId, p.BadgeNumber, p.RolePetugasId, p.LokasiId,
        r.NamaRole AS RoleNama, r.IntervalPetugasId,
        i.NamaInterval AS IntervalNama, i.Bulan AS IntervalBulan,
        l.Nama AS LokasiNama,
        e.Nama AS EmployeeNama, e.Divisi AS EmployeeDivisi, e.Departemen AS EmployeeDepartemen
      FROM Petugas p
      LEFT JOIN RolePetugas r     ON p.RolePetugasId = r.Id
      LEFT JOIN IntervalPetugas i ON r.IntervalPetugasId = i.Id
      LEFT JOIN Lokasi l          ON p.LokasiId = l.Id
      LEFT JOIN Employee e        ON p.EmployeeId = e.Id
      WHERE p.Id = @id
    `);
    if (!r.recordset.length) return res.status(404).json({ message: 'Petugas tidak ditemukan' });
    res.json(shapeRow(r.recordset[0]));
  } catch (err) {
    console.error('Error get petugas by id:', err);
    res.status(500).json({ message: 'Gagal mengambil detail petugas' });
  }
});

// =======================
// CREATE
// =======================
router.post('/', async (req, res) => {
  try {
    const p = normalize(req.body);
    const pool = await poolPromise;

    const emp  = await resolveEmployee(pool, p);
    if (!emp)  return res.status(400).json({ message: 'Employee tidak valid.' });

    const role = await resolveRole(pool, p);
    if (!role) return res.status(400).json({ message: 'Role tidak valid.' });

    const dup = await pool.request().input('badge', sql.NVarChar, emp.BadgeNumber)
      .query('SELECT 1 FROM Petugas WHERE BadgeNumber = @badge');
    if (dup.recordset.length) return res.status(400).json({ message: 'BadgeNumber sudah terdaftar pada Petugas lain.' });

    const ins = await pool.request()
      .input('EmployeeId',    sql.Int, emp.Id)
      .input('BadgeNumber',   sql.NVarChar, emp.BadgeNumber)
      .input('RolePetugasId', sql.Int, role.Id)
      .input('LokasiId',      sql.Int, p.lokasiId || null)
      .query(`
        INSERT INTO Petugas (EmployeeId, BadgeNumber, RolePetugasId, LokasiId)
        VALUES (@EmployeeId, @BadgeNumber, @RolePetugasId, @LokasiId);
        SELECT CONVERT(INT, SCOPE_IDENTITY()) AS Id;
      `);

    const rec = await pool.request().input('id', sql.Int, ins.recordset[0].Id).query(`
      SELECT
        p.Id, p.EmployeeId, p.BadgeNumber, p.RolePetugasId, p.LokasiId,
        r.NamaRole AS RoleNama, r.IntervalPetugasId,
        i.NamaInterval AS IntervalNama, i.Bulan AS IntervalBulan,
        l.Nama AS LokasiNama,
        e.Nama AS EmployeeNama, e.Divisi AS EmployeeDivisi, e.Departemen AS EmployeeDepartemen
      FROM Petugas p
      LEFT JOIN RolePetugas r     ON p.RolePetugasId = r.Id
      LEFT JOIN IntervalPetugas i ON r.IntervalPetugasId = i.Id
      LEFT JOIN Lokasi l          ON p.LokasiId = l.Id
      LEFT JOIN Employee e        ON p.EmployeeId = e.Id
      WHERE p.Id = @id
    `);
    res.status(201).json(shapeRow(rec.recordset[0]));
  } catch (err) {
    console.error('Error create petugas:', err);
    res.status(500).json({ message: 'Gagal menambah petugas' });
  }
});

// =======================
// PUT (full)
// =======================
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const p = normalize(req.body);
    const pool = await poolPromise;

    const exist = await pool.request().input('id', sql.Int, id).query('SELECT 1 FROM Petugas WHERE Id = @id');
    if (!exist.recordset.length) return res.status(404).json({ message: 'Petugas tidak ditemukan' });

    const emp  = await resolveEmployee(pool, p);
    if (!emp)  return res.status(400).json({ message: 'Employee tidak valid.' });

    const role = await resolveRole(pool, p);
    if (!role) return res.status(400).json({ message: 'Role tidak valid.' });

    const dup = await pool.request().input('badge', sql.NVarChar, emp.BadgeNumber).input('id', sql.Int, id)
      .query('SELECT 1 FROM Petugas WHERE BadgeNumber = @badge AND Id != @id');
    if (dup.recordset.length) return res.status(400).json({ message: 'BadgeNumber sudah dipakai petugas lain.' });

    await pool.request()
      .input('id', sql.Int, id)
      .input('EmployeeId',    sql.Int, emp.Id)
      .input('BadgeNumber',   sql.NVarChar, emp.BadgeNumber)
      .input('RolePetugasId', sql.Int, role.Id)
      .input('LokasiId',      sql.Int, p.lokasiId || null)
      .query(`
        UPDATE Petugas
           SET EmployeeId = @EmployeeId,
               BadgeNumber = @BadgeNumber,
               RolePetugasId = @RolePetugasId,
               LokasiId = @LokasiId
         WHERE Id = @id
      `);

    const rec = await pool.request().input('id', sql.Int, id).query(`
      SELECT
        p.Id, p.EmployeeId, p.BadgeNumber, p.RolePetugasId, p.LokasiId,
        r.NamaRole AS RoleNama, r.IntervalPetugasId,
        i.NamaInterval AS IntervalNama, i.Bulan AS IntervalBulan,
        l.Nama AS LokasiNama,
        e.Nama AS EmployeeNama, e.Divisi AS EmployeeDivisi, e.Departemen AS EmployeeDepartemen
      FROM Petugas p
      LEFT JOIN RolePetugas r     ON p.RolePetugasId = r.Id
      LEFT JOIN IntervalPetugas i ON r.IntervalPetugasId = i.Id
      LEFT JOIN Lokasi l          ON p.LokasiId = l.Id
      LEFT JOIN Employee e        ON p.EmployeeId = e.Id
      WHERE p.Id = @id
    `);
    res.json(shapeRow(rec.recordset[0]));
  } catch (err) {
    console.error('Error update petugas:', err);
    res.status(500).json({ message: 'Gagal update petugas' });
  }
});

// =======================
// PATCH (partial)
// =======================
router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const p = normalize(req.body);
    const pool = await poolPromise;

    const exist = await pool.request().input('id', sql.Int, id).query('SELECT 1 FROM Petugas WHERE Id = @id');
    if (!exist.recordset.length) return res.status(404).json({ message: 'Petugas tidak ditemukan' });

    const set = [];
    const rq = pool.request().input('id', sql.Int, id);

    // Role?
    if (p.rolePetugasId !== undefined || p.roleName !== undefined) {
      const role = await resolveRole(pool, p);
      if (!role) return res.status(400).json({ message: 'Role tidak valid.' });
      set.push('RolePetugasId = @RolePetugasId'); rq.input('RolePetugasId', sql.Int, role.Id);
    }

    // Lokasi?
    if (p.lokasiId !== undefined) { set.push('LokasiId = @LokasiId'); rq.input('LokasiId', sql.Int, p.lokasiId || null); }

    // Employee?
    if (p.employeeId !== undefined || p.employeeBadge !== undefined || p.badgeNumber !== undefined) {
      const emp = await resolveEmployee(pool, p);
      if (!emp) return res.status(400).json({ message: 'Employee tidak valid.' });

      const dup = await pool.request().input('badge', sql.NVarChar, emp.BadgeNumber).input('id', sql.Int, id)
        .query('SELECT 1 FROM Petugas WHERE BadgeNumber = @badge AND Id != @id');
      if (dup.recordset.length) return res.status(400).json({ message: 'BadgeNumber sudah dipakai petugas lain.' });

      set.push('EmployeeId = @EmployeeId'); rq.input('EmployeeId', sql.Int, emp.Id);
      set.push('BadgeNumber = @BadgeNumber'); rq.input('BadgeNumber', sql.NVarChar, emp.BadgeNumber);
    }

    if (!set.length) return res.status(400).json({ message: 'Tidak ada field yang diubah' });

    await rq.query(`UPDATE Petugas SET ${set.join(', ')} WHERE Id = @id;`);

    const rec = await pool.request().input('id', sql.Int, id).query(`
      SELECT
        p.Id, p.EmployeeId, p.BadgeNumber, p.RolePetugasId, p.LokasiId,
        r.NamaRole AS RoleNama, r.IntervalPetugasId,
        i.NamaInterval AS IntervalNama, i.Bulan AS IntervalBulan,
        l.Nama AS LokasiNama,
        e.Nama AS EmployeeNama, e.Divisi AS EmployeeDivisi, e.Departemen AS EmployeeDepartemen
      FROM Petugas p
      LEFT JOIN RolePetugas r     ON p.RolePetugasId = r.Id
      LEFT JOIN IntervalPetugas i ON r.IntervalPetugasId = i.Id
      LEFT JOIN Lokasi l          ON p.LokasiId = l.Id
      LEFT JOIN Employee e        ON p.EmployeeId = e.Id
      WHERE p.Id = @id
    `);
    res.json(shapeRow(rec.recordset[0]));
  } catch (err) {
    console.error('Error patch petugas:', err);
    res.status(500).json({ message: 'Gagal update sebagian petugas' });
  }
});

// =======================
// PROFILE by BADGE (nama + lokasi) — HARUS di atas '/:id'
// =======================
router.get('/profile/:badge', async (req, res) => {
  const raw = req.params.badge ?? '';
  const badge = String(raw).trim(); // JANGAN cast ke int

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('badge', sql.NVarChar(50), badge)
      .query(`
        SELECT 
          p.BadgeNumber,
          ISNULL(e.Nama, '') AS Nama,
          LTRIM(RTRIM(ISNULL(l.Nama, ''))) AS Lokasi
        FROM Petugas p
        LEFT JOIN Employee e ON e.Id = p.EmployeeId
        LEFT JOIN Lokasi   l ON l.Id = p.LokasiId
        WHERE LTRIM(RTRIM(p.BadgeNumber)) = LTRIM(RTRIM(@badge));
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ message: 'Petugas tidak ditemukan' });
    }
    const row = result.recordset[0];
    return res.json({
      badgeNumber: row.BadgeNumber,
      nama: row.Nama || '',
      lokasi: row.Lokasi || ''
    });
  } catch (err) {
    console.error('GET /api/petugas/profile error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});


// =======================
// DELETE
// =======================
router.delete('/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const del = await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM Petugas WHERE Id = @id');
    if (!del.rowsAffected[0]) return res.status(404).json({ message: 'Petugas tidak ditemukan' });
    res.json({ message: 'Petugas berhasil dihapus' });
  } catch (err) {
    console.error('Error delete petugas:', err);
    res.status(500).json({ message: 'Gagal menghapus petugas' });
  }
});

// =======================
// FORM-META (dropdown untuk FE)
// =======================
router.get('/form-meta', async (_req, res) => {
  try {
    const pool = await poolPromise;
    const [roles, lokasi, intervals] = await Promise.all([
      pool.request().query(`
        SELECT r.Id, r.NamaRole, r.IntervalPetugasId,
               i.NamaInterval AS IntervalNama, i.Bulan AS IntervalBulan
        FROM RolePetugas r
        LEFT JOIN IntervalPetugas i ON i.Id = r.IntervalPetugasId
        WHERE r.IsActive = 1
        ORDER BY r.NamaRole ASC
      `),
      pool.request().query(`SELECT Id, Nama FROM Lokasi ORDER BY Nama ASC`),
      pool.request().query(`SELECT Id, NamaInterval AS IntervalNama, Bulan AS IntervalBulan
                            FROM IntervalPetugas ORDER BY Bulan ASC, NamaInterval ASC`)
    ]);
  res.json({ roles: roles.recordset, lokasi: lokasi.recordset, intervals: intervals.recordset });
  } catch (err) {
    console.error('Error form-meta petugas:', err);
    res.status(500).json({ message: 'Gagal mengambil data form meta' });
  }
});




module.exports = router;
// Ekspor helper (opsional)
module.exports._helpers = { normalize, resolveEmployee, resolveRole, shapeRow };
