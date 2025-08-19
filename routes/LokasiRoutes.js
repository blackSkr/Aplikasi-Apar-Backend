// routes/LokasiRoutes.js
const express = require('express');
const router  = express.Router();
const { poolPromise, sql } = require('../ConfigDB');

// Ambil helper dari PetugasRoutes untuk reuse logika (tanpa ubah kontrak lama)
const petugasHelpers   = require('./PetugasRoutes')._helpers || {};
const normalizePetugas = petugasHelpers.normalize        || ((b)=>b);
const resolveEmployee  = petugasHelpers.resolveEmployee  || (async ()=>null);
const resolveRole      = petugasHelpers.resolveRole      || (async ()=>null);
const shapePetugasRow  = petugasHelpers.shapeRow         || ((x)=>x);

// =====================
// ===== Utilities =====
// =====================
function toNullableDecimal(val) {
  if (val === undefined || val === null || val === '') return null;
  const num = typeof val === 'string' ? Number(val.replace(',', '.')) : Number(val);
  return Number.isFinite(num) ? num : null;
}

function shapeLokasiRow(row) {
  return {
    Id:              row.Id,
    Nama:            row.Nama,
    lat:             row.lat,
    long:            row.long,
    PICPetugasId:    row.PICPetugasId,
    PIC_BadgeNumber: row.PIC_BadgeNumber || null,
    PIC_Jabatan:     row.PIC_Jabatan || null,
    PIC_Nama:        row.PIC_Nama || null,
  };
}

async function getLokasiById(pool, id) {
  const r = await pool.request()
    .input('id', sql.Int, id)
    .query(`
      SELECT
        l.Id, l.Nama, l.lat, l.long,
        l.PIC_PetugasId AS PICPetugasId,
        p.BadgeNumber   AS PIC_BadgeNumber,
        rp.NamaRole     AS PIC_Jabatan,
        e.Nama          AS PIC_Nama
      FROM Lokasi l
      LEFT JOIN Petugas p      ON l.PIC_PetugasId = p.Id
      LEFT JOIN RolePetugas rp ON p.RolePetugasId = rp.Id
      LEFT JOIN Employee e     ON p.EmployeeId = e.Id
      WHERE l.Id = @id;
    `);
  return r.recordset[0] ? shapeLokasiRow(r.recordset[0]) : null;
}

async function listPetugasInLokasi(pool, lokasiId) {
  const r = await pool.request()
    .input('lokasiId', sql.Int, lokasiId)
    .query(`
      SELECT
        p.Id,
        p.EmployeeId,
        p.BadgeNumber,
        p.RolePetugasId,
        p.LokasiId,
        -- ⬇⬇⬇ FIX PENTING: interval ambil dari Petugas.IntervalPetugasId (bukan Role)
        p.IntervalPetugasId,
        rp.NamaRole AS RoleNama,
        i.NamaInterval,
        i.Bulan AS IntervalBulan,
        l.Nama AS LokasiNama,
        e.Nama AS EmployeeNama,
        e.Divisi AS EmployeeDivisi,
        e.Departemen AS EmployeeDepartemen
      FROM Petugas p
      LEFT JOIN RolePetugas     rp ON p.RolePetugasId = rp.Id
      LEFT JOIN IntervalPetugas i  ON p.IntervalPetugasId = i.Id
      LEFT JOIN Lokasi           l  ON p.LokasiId = l.Id
      LEFT JOIN Employee         e  ON p.EmployeeId = e.Id
      WHERE p.LokasiId = @lokasiId
      ORDER BY e.Nama ASC, p.BadgeNumber ASC, p.Id ASC;
    `);
  return r.recordset.map(shapePetugasRow);
}

// Assign existing Petugas ke lokasi (utility dipakai di POST/PUT/POST :id/petugas)
async function assignExistingPetugasToLokasi(rq, petugasId, lokasiId) {
  await rq
    .input('petugasId', sql.Int, petugasId)
    .input('lokasiId',  sql.Int, lokasiId)
    .query(`UPDATE Petugas SET LokasiId = @lokasiId WHERE Id = @petugasId;`);
}

// Pastikan PIC juga ter-assign ke lokasi (sinkronisasi satu arah yang aman)
async function ensurePICAssignedToLokasi(rq, lokasiId, picId) {
  if (!picId) return;
  await rq
    .input('lokasiId', sql.Int, lokasiId)
    .input('pid',      sql.Int, picId)
    .query(`UPDATE Petugas SET LokasiId = @lokasiId WHERE Id = @pid;`);
}

// =====================
// ======== GET ========
// =====================

// GET all lokasi
router.get('/', async (_req, res) => {
  try {
    const pool   = await poolPromise;
    const result = await pool.request().query(`
      SELECT
        l.Id, l.Nama, l.lat, l.long,
        l.PIC_PetugasId AS PICPetugasId,
        p.BadgeNumber   AS PIC_BadgeNumber,
        rp.NamaRole     AS PIC_Jabatan,
        e.Nama          AS PIC_Nama
      FROM Lokasi l
      LEFT JOIN Petugas     p  ON l.PIC_PetugasId = p.Id
      LEFT JOIN RolePetugas rp ON p.RolePetugasId = rp.Id
      LEFT JOIN Employee    e  ON p.EmployeeId = e.Id
      ORDER BY l.Nama ASC;
    `);
    res.json(result.recordset.map(shapeLokasiRow));
  } catch (err) {
    console.error('Error fetch lokasi:', err);
    res.status(500).json({ message: 'Gagal mengambil data lokasi' });
  }
});

// FORM-META (roles, employees, petugas tanpa lokasi)
router.get('/form-meta', async (_req, res) => {
  try {
    const pool = await poolPromise;
    const [roles, employees, petugasNoLokasi] = await Promise.all([
      pool.request().query(`
        SELECT r.Id, r.NamaRole, r.IntervalPetugasId, i.NamaInterval, i.Bulan
        FROM RolePetugas r
        LEFT JOIN IntervalPetugas i ON i.Id = r.IntervalPetugasId
        WHERE r.IsActive = 1
        ORDER BY r.NamaRole ASC
      `),
      pool.request().query(`
        SELECT Id, BadgeNumber, Nama, Divisi, Departemen
        FROM Employee
        ORDER BY Nama ASC, BadgeNumber ASC
      `),
      pool.request().query(`
        SELECT p.Id, p.BadgeNumber, e.Nama AS EmployeeNama, rp.NamaRole AS RoleNama
        FROM Petugas p
        LEFT JOIN Employee e     ON e.Id = p.EmployeeId
        LEFT JOIN RolePetugas rp ON rp.Id = p.RolePetugasId
        WHERE p.LokasiId IS NULL
        ORDER BY e.Nama ASC, p.BadgeNumber ASC
      `),
    ]);
    res.json({
      roles: roles.recordset,
      employees: employees.recordset,
      petugasTanpaLokasi: petugasNoLokasi.recordset,
    });
  } catch (err) {
    console.error('Error lokasi form-meta:', err);
    res.status(500).json({ message: 'Gagal mengambil data form meta lokasi' });
  }
});

// GET by ID
router.get('/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const lokasi = await getLokasiById(pool, req.params.id);
    if (!lokasi) return res.status(404).json({ message: 'Lokasi tidak ditemukan' });
    res.json(lokasi);
  } catch (err) {
    console.error('Error fetch lokasi by ID:', err);
    res.status(500).json({ message: 'Gagal mengambil data lokasi' });
  }
});

// GET petugas pada lokasi
router.get('/:id/petugas', async (req, res) => {
  try {
    const pool = await poolPromise;
    const lokasi = await getLokasiById(pool, req.params.id);
    if (!lokasi) return res.status(404).json({ message: 'Lokasi tidak ditemukan' });
    const items = await listPetugasInLokasi(pool, req.params.id);
    res.json({ lokasi, items });
  } catch (err) {
    console.error('Error list petugas by lokasi:', err);
    res.status(500).json({ message: 'Gagal mengambil petugas pada lokasi' });
  }
});

// =====================
// ======== POST =======
// =====================

/**
 * POST /api/lokasi
 * Body:
 *  { nama, lat, long, picPetugasId?, petugas?: [{ petugasId, isPIC? } | { employeeId|employeeBadge|badgeNumber, rolePetugasId|roleName, isPIC? }] }
 */
router.post('/', async (req, res) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    const { nama, picPetugasId, petugas } = req.body || {};
    let { lat, long } = req.body || {};

    if (!nama) return res.status(400).json({ message: 'Nama lokasi wajib diisi' });
    lat  = toNullableDecimal(lat);
    long = toNullableDecimal(long);

    await transaction.begin();
    const rq = new sql.Request(transaction);

    // 1) Insert Lokasi
    const ins = await rq
      .input('Nama',          sql.NVarChar,       nama)
      .input('PIC_PetugasId', sql.Int,            picPetugasId || null)
      .input('lat',           sql.Decimal(10, 6), lat)
      .input('long',          sql.Decimal(10, 6), long)
      .query(`
        INSERT INTO Lokasi (Nama, PIC_PetugasId, lat, long)
        VALUES (@Nama, @PIC_PetugasId, @lat, @long);
        SELECT CAST(SCOPE_IDENTITY() AS INT) AS Id;
      `);
    const lokasiId = ins.recordset[0].Id;

    let selectedPICId = picPetugasId || null;

    // 2) Opsional proses petugas (link / create+link)
    if (Array.isArray(petugas) && petugas.length) {
      for (const raw of petugas) {
        // link-only existing
        if (raw && raw.petugasId) {
          await assignExistingPetugasToLokasi(rq, raw.petugasId, lokasiId);
          if (raw.isPIC) selectedPICId = raw.petugasId;
          continue;
        }

        // create Petugas baru dari Employee + Role
        const p   = normalizePetugas(raw || {});
        const emp = await resolveEmployee(pool, p);
        if (!emp) { const e = new Error('Employee tidak valid (create Lokasi.petugas).'); e.status = 400; throw e; }

        const role = await resolveRole(pool, p);
        if (!role) { const e = new Error('Role tidak valid (create Lokasi.petugas).'); e.status = 400; throw e; }

        // cegah duplikasi BadgeNumber di tabel Petugas
        const dup = await rq.input('badge', sql.NVarChar, emp.BadgeNumber)
          .query('SELECT 1 FROM Petugas WHERE BadgeNumber = @badge;');
        if (dup.recordset.length) {
          const err = new Error(`BadgeNumber ${emp.BadgeNumber} sudah terdaftar pada Petugas lain.`);
          err.status = 409; throw err;
        }

        const insP = await rq
          .input('EmployeeId',        sql.Int,      emp.Id)
          .input('BadgeNumber',       sql.NVarChar, emp.BadgeNumber)
          .input('RolePetugasId',     sql.Int,      role.Id)
          .input('IntervalPetugasId', sql.Int,      p.IntervalPetugasId || null) // aman bila ada
          .input('LokasiId',          sql.Int,      lokasiId)
          .query(`
            INSERT INTO Petugas (EmployeeId, BadgeNumber, RolePetugasId, IntervalPetugasId, LokasiId)
            VALUES (@EmployeeId, @BadgeNumber, @RolePetugasId, @IntervalPetugasId, @LokasiId);
            SELECT CAST(SCOPE_IDENTITY() AS INT) AS Id;
          `);
        const newPetugasId = insP.recordset[0].Id;
        if (raw.isPIC) selectedPICId = newPetugasId;
      }
    }

    // 3) Terapkan PIC bila ada override dari array
    if (selectedPICId && selectedPICId !== picPetugasId) {
      await rq.input('id', sql.Int, lokasiId).input('pic', sql.Int, selectedPICId)
        .query(`UPDATE Lokasi SET PIC_PetugasId = @pic WHERE Id = @id;`);
    }

    // 3b) **Penguatan**: apapun asalnya selectedPICId, pastikan Petugas.LokasiId sinkron
    if (selectedPICId) await ensurePICAssignedToLokasi(rq, lokasiId, selectedPICId);

    await transaction.commit();

    const lokasi = await getLokasiById(pool, lokasiId);
    const items  = await listPetugasInLokasi(pool, lokasiId);
    res.status(201).json({ ...lokasi, petugas: items });

  } catch (err) {
    console.error('Error create lokasi (txn):', err);
    try { await transaction.rollback(); } catch {}
    const status = err.status || 500;
    res.status(status).json({ message: err.message || 'Gagal menyimpan lokasi' });
  }
});

// =====================
// ========= PUT ========
// =====================

/**
 * PUT /api/lokasi/:id
 * Body sama seperti POST. Tidak menghapus petugas existing; hanya update data lokasi + bisa tambah link petugas.
 */
router.put('/:id', async (req, res) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    const { id } = req.params;
    const { nama, picPetugasId, petugas } = req.body || {};
    let { lat, long } = req.body || {};

    const exist = await pool.request().input('id', sql.Int, id).query('SELECT Id FROM Lokasi WHERE Id = @id;');
    if (!exist.recordset.length) return res.status(404).json({ message: 'Lokasi tidak ditemukan' });

    if (!nama) return res.status(400).json({ message: 'Nama lokasi wajib diisi' });
    lat  = toNullableDecimal(lat);
    long = toNullableDecimal(long);

    await transaction.begin();
    const rq = new sql.Request(transaction);

    // 1) Update kolom dasar
    await rq
      .input('id',             sql.Int,            id)
      .input('Nama',           sql.NVarChar,       nama)
      .input('PIC_PetugasId',  sql.Int,            picPetugasId || null)
      .input('lat',            sql.Decimal(10, 6), lat)
      .input('long',           sql.Decimal(10, 6), long)
      .query(`
        UPDATE Lokasi
          SET Nama=@Nama, PIC_PetugasId=@PIC_PetugasId, lat=@lat, long=@long
        WHERE Id=@id;
      `);

    let selectedPICId = picPetugasId || null;

    // 2) Tambahkan assignment petugas (opsional)
    if (Array.isArray(petugas) && petugas.length) {
      for (const raw of petugas) {
        if (raw && raw.petugasId) {
          await assignExistingPetugasToLokasi(rq, raw.petugasId, id);
          if (raw.isPIC) selectedPICId = raw.petugasId;
          continue;
        }

        const p   = normalizePetugas(raw || {});
        const emp = await resolveEmployee(pool, p);
        if (!emp) { const e = new Error('Employee tidak valid (update Lokasi.petugas).'); e.status = 400; throw e; }

        const role = await resolveRole(pool, p);
        if (!role) { const e = new Error('Role tidak valid (update Lokasi.petugas).'); e.status = 400; throw e; }

        const dup = await rq.input('badge', sql.NVarChar, emp.BadgeNumber)
          .query('SELECT 1 FROM Petugas WHERE BadgeNumber = @badge;');
        if (dup.recordset.length) {
          const err = new Error(`BadgeNumber ${emp.BadgeNumber} sudah terdaftar pada Petugas lain.`);
          err.status = 409; throw err;
        }

        const insP = await rq
          .input('EmployeeId',        sql.Int,      emp.Id)
          .input('BadgeNumber',       sql.NVarChar, emp.BadgeNumber)
          .input('RolePetugasId',     sql.Int,      role.Id)
          .input('IntervalPetugasId', sql.Int,      p.IntervalPetugasId || null)
          .input('LokasiId',          sql.Int,      id)
          .query(`
            INSERT INTO Petugas (EmployeeId, BadgeNumber, RolePetugasId, IntervalPetugasId, LokasiId)
            VALUES (@EmployeeId, @BadgeNumber, @RolePetugasId, @IntervalPetugasId, @LokasiId);
            SELECT CAST(SCOPE_IDENTITY() AS INT) AS Id;
          `);
        const newPetugasId = insP.recordset[0].Id;
        if (raw.isPIC) selectedPICId = newPetugasId;
      }
    }

    // 3) Override PIC bila ada flag di array
    if (selectedPICId && selectedPICId !== picPetugasId) {
      await rq.input('id', sql.Int, id).input('pic', sql.Int, selectedPICId)
        .query(`UPDATE Lokasi SET PIC_PetugasId = @pic WHERE Id = @id;`);
    }

    // 3b) **Penguatan**: pastikan Petugas.LokasiId sinkron dengan PIC final
    if (selectedPICId) await ensurePICAssignedToLokasi(rq, id, selectedPICId);

    await transaction.commit();

    const lokasi = await getLokasiById(pool, id);
    const items  = await listPetugasInLokasi(pool, id);
    res.json({ ...lokasi, petugas: items });

  } catch (err) {
    console.error('Error update lokasi (txn):', err);
    try { await transaction.rollback(); } catch {}
    const status = err.status || 500;
    res.status(status).json({ message: err.message || 'Gagal update lokasi' });
  }
});

// ===============================
// === Tambah/Unlink Petugas =====
// ===============================

// POST /:id/petugas — link existing atau create+link; opsional isPIC
router.post('/:id/petugas', async (req, res) => {
  try {
    const pool = await poolPromise;
    const { id } = req.params;

    const lokasi = await getLokasiById(pool, id);
    if (!lokasi) return res.status(404).json({ message: 'Lokasi tidak ditemukan' });

    const { petugasId, isPIC } = req.body || {};
    const p = normalizePetugas(req.body || {});

    if (petugasId) {
      await pool.request().input('petugasId', sql.Int, petugasId).input('lokasiId', sql.Int, id)
        .query(`UPDATE Petugas SET LokasiId = @lokasiId WHERE Id = @petugasId;`);
      if (isPIC) {
        await pool.request().input('id', sql.Int, id).input('pic', sql.Int, petugasId)
          .query(`UPDATE Lokasi SET PIC_PetugasId = @pic WHERE Id = @id;`);
      }
    } else {
      const emp = await resolveEmployee(pool, p);
      if (!emp) return res.status(400).json({ message: 'Employee tidak valid.' });

      const role = await resolveRole(pool, p);
      if (!role) return res.status(400).json({ message: 'Role tidak valid.' });

      const dup = await pool.request().input('badge', sql.NVarChar, emp.BadgeNumber)
        .query(`SELECT 1 FROM Petugas WHERE BadgeNumber = @badge;`);
      if (dup.recordset.length) {
        return res.status(409).json({ message: `BadgeNumber ${emp.BadgeNumber} sudah terdaftar pada Petugas lain.` });
      }

      const ins = await pool.request()
        .input('EmployeeId',        sql.Int,      emp.Id)
        .input('BadgeNumber',       sql.NVarChar, emp.BadgeNumber)
        .input('RolePetugasId',     sql.Int,      role.Id)
        .input('IntervalPetugasId', sql.Int,      p.IntervalPetugasId || null)
        .input('LokasiId',          sql.Int,      id)
        .query(`
          INSERT INTO Petugas (EmployeeId, BadgeNumber, RolePetugasId, IntervalPetugasId, LokasiId)
          VALUES (@EmployeeId, @BadgeNumber, @RolePetugasId, @IntervalPetugasId, @LokasiId);
          SELECT CAST(SCOPE_IDENTITY() AS INT) AS Id;
        `);

      if (isPIC) {
        await pool.request().input('id', sql.Int, id).input('pic', sql.Int, ins.recordset[0].Id)
          .query(`UPDATE Lokasi SET PIC_PetugasId = @pic WHERE Id = @id;`);
      }
    }

    // **Penguatan**: bila PIC di lokasi ini ditetapkan, sinkronkan LokasiId
    const refreshed = await getLokasiById(pool, id);
    if (refreshed?.PICPetugasId) {
      await pool.request()
        .input('lokasiId', sql.Int, id)
        .input('pid',      sql.Int, refreshed.PICPetugasId)
        .query(`UPDATE Petugas SET LokasiId = @lokasiId WHERE Id = @pid;`);
    }

    const items = await listPetugasInLokasi(pool, id);
    res.status(201).json({ lokasi: refreshed, items });

  } catch (err) {
    console.error('Error add petugas to lokasi:', err);
    res.status(500).json({ message: 'Gagal menambah petugas ke lokasi' });
  }
});

// DELETE /:id/petugas/:petugasId — unlink; reset PIC bila perlu
router.delete('/:id/petugas/:petugasId', async (req, res) => {
  try {
    const pool = await poolPromise;
    const { id, petugasId } = req.params;

    await pool.request().input('pid', sql.Int, petugasId)
      .query(`UPDATE Petugas SET LokasiId = NULL WHERE Id = @pid;`);

    await pool.request().input('id', sql.Int, id).input('pid', sql.Int, petugasId)
      .query(`
        UPDATE Lokasi
          SET PIC_PetugasId = CASE WHEN PIC_PetugasId = @pid THEN NULL ELSE PIC_PetugasId END
        WHERE Id = @id;
      `);

    const items = await listPetugasInLokasi(pool, id);
    res.json({ message: 'Petugas di-unlink dari lokasi', items });

  } catch (err) {
    console.error('Error unlink petugas from lokasi:', err);
    res.status(500).json({ message: 'Gagal melepas petugas dari lokasi' });
  }
});

// =====================
// ======= DELETE ======
// =====================

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;

    const usage = await pool.request().input('id', sql.Int, id)
      .query('SELECT COUNT(*) AS count FROM Peralatan WHERE LokasiId = @id;');
    if (usage.recordset[0].count > 0) {
      return res.status(400).json({ message: 'Lokasi tidak dapat dihapus karena masih digunakan oleh peralatan' });
    }

    // Putuskan relasi Petugas agar aman hapus lokasi
    await pool.request().input('id', sql.Int, id)
      .query('UPDATE Petugas SET LokasiId = NULL WHERE LokasiId = @id;');

    const del = await pool.request().input('id', sql.Int, id)
      .query('DELETE FROM Lokasi WHERE Id = @id;');

    if (del.rowsAffected[0] === 0) return res.status(404).json({ message: 'Lokasi tidak ditemukan' });

    res.json({ message: 'Lokasi berhasil dihapus' });

  } catch (err) {
    console.error('Error delete lokasi:', err);
    res.status(500).json({ message: 'Gagal menghapus lokasi' });
  }
});

// ===========================================
// ====== (BARU) Debug/Helper: mode badge =====
// ===========================================
// Non-breaking helper untuk cek cepat apakah badge eligible offline.
// Tidak wajib dipakai aplikasi; aman dibiarkan.
router.get('/by-badge/:badge/mode', async (req, res) => {
  try {
    const pool = await poolPromise;
    const { badge } = req.params;

    const q = await pool.request()
      .input('badge', sql.NVarChar, badge)
      .query(`
        SELECT
          p.Id,
          p.BadgeNumber,
          p.RolePetugasId,
          rp.NamaRole,
          p.LokasiId,
          l.Nama AS LokasiNama,
          p.IntervalPetugasId,
          i.NamaInterval,
          i.Bulan AS IntervalBulan
        FROM Petugas p
        LEFT JOIN RolePetugas     rp ON rp.Id = p.RolePetugasId
        LEFT JOIN Lokasi           l ON l.Id = p.LokasiId
        LEFT JOIN IntervalPetugas  i ON i.Id = p.IntervalPetugasId
        WHERE p.BadgeNumber = @badge;
      `);

    if (!q.recordset.length) {
      return res.status(404).json({ message: 'Petugas dengan badge tersebut tidak ditemukan' });
    }

    const row = q.recordset[0];
    const roleName = (row.NamaRole || '').toLowerCase();
    const isRescue = roleName.includes('rescue'); // konsisten dgn aturan app kamu

    // Rule dari konteks proyek:
    // - Jika role = rescue → offline/online OK (akses penuh)
    // - Jika role ≠ rescue:
    //     - bila LokasiId terisi → offline/online OK (dibatasi lokasi)
    //     - bila LokasiId null → online only
    const offlineAllowed = isRescue || (!!row.LokasiId);

    res.json({
      badge: row.BadgeNumber,
      role: row.NamaRole,
      lokasiId: row.LokasiId,
      lokasiNama: row.LokasiNama || null,
      intervalId: row.IntervalPetugasId || null,
      intervalNama: row.NamaInterval || null,
      intervalBulan: row.IntervalBulan || null,
      mode: offlineAllowed ? 'offline-online' : 'online-only',
      reason: offlineAllowed
        ? (isRescue ? 'Role rescue' : 'Petugas memiliki LokasiId')
        : 'Petugas belum ter-assign ke lokasi (LokasiId NULL)',
    });
  } catch (err) {
    console.error('Error resolve badge mode:', err);
    res.status(500).json({ message: 'Gagal mengecek mode badge' });
  }
});

module.exports = router;
