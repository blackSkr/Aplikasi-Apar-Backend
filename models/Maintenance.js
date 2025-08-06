// // backend/models/Maintenenace.js
// const { poolPromise, sql } = require('../ConfigDB');

// // Fungsi untuk menambah data maintenance
// async function createMaintenance(
//   id_maintenance,
//   id_petugas,
//   id_apar,
//   checklist_kondisi,
//   foto_apar,
//   status_apar,
//   tgl_maintenance,
//   keterangan
// ) {
//   try {
//     const pool = await poolPromise;
//     const query = `
//       INSERT INTO dbo.maintenance_apar
//         (id_maintenance, id_petugas, id_apar,
//          checklist_kondisi, foto_apar, status_apar,
//          tgl_maintenance, keterangan)
//       VALUES
//         (@id_maintenance, @id_petugas, @id_apar,
//          @checklist_kondisi, @foto_apar, @status_apar,
//          @tgl_maintenance, @keterangan)
//     `;
//     await pool.request()
//       .input('id_maintenance',   sql.VarChar(26), id_maintenance)
//       .input('id_petugas',       sql.VarChar(26), id_petugas)
//       .input('id_apar',          sql.VarChar(26), id_apar)
//       .input('checklist_kondisi', sql.NVarChar(sql.MAX), checklist_kondisi)
//       .input('foto_apar',        sql.NVarChar(sql.MAX), foto_apar)
//       .input('status_apar',      sql.NVarChar(20),      status_apar)
//       .input('tgl_maintenance',  sql.Date,              tgl_maintenance)
//       .input('keterangan',       sql.NVarChar(sql.MAX), keterangan)
//       .query(query);

//     return { success: true };
//   } catch (err) {
//     throw new Error('Error saat menyimpan data maintenance: ' + err.message);
//   }
// }

// // Fungsi untuk mendapatkan semua data maintenance
// async function getAllMaintenance() {
//   try {
//     const pool = await poolPromise;
//     const result = await pool.request()
//       .query('SELECT * FROM dbo.maintenance_apar');
//     return result.recordset;
//   } catch (err) {
//     throw new Error('Error saat mengambil data maintenance: ' + err.message);
//   }
// }

// // Fungsi untuk mendapatkan 1 record maintenance by id
// async function getMaintenanceById(id_maintenance) {
//   try {
//     const pool = await poolPromise;
//     const result = await pool.request()
//       .input('id_maintenance', sql.VarChar(26), id_maintenance)
//       .query('SELECT * FROM dbo.maintenance_apar WHERE id_maintenance = @id_maintenance');
//     return result.recordset[0];
//   } catch (err) {
//     throw new Error('Error saat mengambil data maintenance: ' + err.message);
//   }
// }

// // Fungsi untuk mengupdate data maintenance
// async function updateMaintenance(
//   id_maintenance,
//   id_petugas,
//   id_apar,
//   checklist_kondisi,
//   foto_apar,
//   status_apar,
//   tgl_maintenance,
//   keterangan
// ) {
//   try {
//     const pool = await poolPromise;
//     const query = `
//       UPDATE dbo.maintenance_apar
//       SET id_petugas       = @id_petugas,
//           id_apar          = @id_apar,
//           checklist_kondisi = @checklist_kondisi,
//           foto_apar        = @foto_apar,
//           status_apar      = @status_apar,
//           tgl_maintenance  = @tgl_maintenance,
//           keterangan       = @keterangan
//       WHERE id_maintenance = @id_maintenance
//     `;
//     await pool.request()
//       .input('id_maintenance',   sql.VarChar(26), id_maintenance)
//       .input('id_petugas',       sql.VarChar(26), id_petugas)
//       .input('id_apar',          sql.VarChar(26), id_apar)
//       .input('checklist_kondisi', sql.NVarChar(sql.MAX), checklist_kondisi)
//       .input('foto_apar',        sql.NVarChar(sql.MAX), foto_apar)
//       .input('status_apar',      sql.NVarChar(20),      status_apar)
//       .input('tgl_maintenance',  sql.Date,              tgl_maintenance)
//       .input('keterangan',       sql.NVarChar(sql.MAX), keterangan)
//       .query(query);

//     return { success: true };
//   } catch (err) {
//     throw new Error('Error saat mengupdate data maintenance: ' + err.message);
//   }
// }

// // Fungsi untuk menghapus data maintenance
// async function deleteMaintenance(id_maintenance) {
//   try {
//     const pool = await poolPromise;
//     await pool.request()
//       .input('id_maintenance', sql.VarChar(26), id_maintenance)
//       .query('DELETE FROM dbo.maintenance_apar WHERE id_maintenance = @id_maintenance');
//     return { success: true };
//   } catch (err) {
//     throw new Error('Error saat menghapus data maintenance: ' + err.message);
//   }
// }

// module.exports = {
//   createMaintenance,
//   getMaintenanceById,
//   getAllMaintenance,
//   updateMaintenance,
//   deleteMaintenance
// };
