// // backend/models/Apar.js
// const { poolPromise, sql } = require('../ConfigDB');

// /**
//  * Ambil semua APAR
//  */
// async function getAllApar() {
//   const pool = await poolPromise;
//   const result = await pool.request()
//     .query('SELECT * FROM dbo.data_apar');
//   return result.recordset;
// }

// /**
//  * Ambil 1 APAR berdasarkan id_apar
//  */
// async function getAparById(id_apar) {
//   const pool = await poolPromise;
//   const result = await pool.request()
//     .input('id_apar', sql.VarChar(26), id_apar)
//     .query('SELECT * FROM dbo.data_apar WHERE id_apar = @id_apar');
//   return result.recordset[0];
// }

// /**
//  * Tambah APAR baru
//  */
// async function createApar({
//   id_apar, no_apar, lokasi_apar, jenis_apar,
//   keperluan_check, qr_code_apar, status_apar,
//   tgl_exp, tgl_terakhir_maintenance,
//   interval_maintenance, keterangan
// }) {
//   const pool = await poolPromise;
//   const query = `
//     INSERT INTO dbo.data_apar
//       (id_apar, no_apar, lokasi_apar, jenis_apar,
//        keperluan_check, qr_code_apar, status_apar,
//        tgl_exp, tgl_terakhir_maintenance,
//        interval_maintenance, keterangan)
//     VALUES
//       (@id_apar, @no_apar, @lokasi_apar, @jenis_apar,
//        @keperluan_check, @qr_code_apar, @status_apar,
//        @tgl_exp, @tgl_terakhir_maintenance,
//        @interval_maintenance, @keterangan)
//   `;

//   await pool.request()
//     .input('id_apar',                 sql.VarChar(26),      id_apar)
//     .input('no_apar',                 sql.NVarChar(50),     no_apar)
//     .input('lokasi_apar',             sql.NVarChar(255),    lokasi_apar)
//     .input('jenis_apar',              sql.NVarChar(100),    jenis_apar)
//     .input('keperluan_check',         sql.NVarChar(sql.MAX),keperluan_check)
//     .input('qr_code_apar',            sql.NVarChar(sql.MAX),qr_code_apar)
//     .input('status_apar',             sql.NVarChar(50),     status_apar)
//     .input('tgl_exp',                 sql.Date,             tgl_exp)
//     .input('tgl_terakhir_maintenance',sql.Date,             tgl_terakhir_maintenance)
//     .input('interval_maintenance',    sql.Int,              interval_maintenance)
//     .input('keterangan',              sql.NVarChar(sql.MAX),keterangan)
//     .query(query);

//   return { success: true };
// }

// /**
//  * Update APAR
//  * @param {string} origId  id_apar lama (dari URL)
//  * @param {object} data    data baru, termasuk id_apar baru
//  */
// async function updateApar(origId, {
//   id_apar, no_apar, lokasi_apar, jenis_apar,
//   keperluan_check, qr_code_apar, status_apar,
//   tgl_exp, tgl_terakhir_maintenance,
//   interval_maintenance, keterangan
// }) {
//   const pool = await poolPromise;
//   const query = `
//     UPDATE dbo.data_apar
//     SET
//       id_apar                  = @new_id_apar,
//       no_apar                  = @no_apar,
//       lokasi_apar              = @lokasi_apar,
//       jenis_apar               = @jenis_apar,
//       keperluan_check          = @keperluan_check,
//       qr_code_apar             = @qr_code_apar,
//       status_apar              = @status_apar,
//       tgl_exp                  = @tgl_exp,
//       tgl_terakhir_maintenance = @tgl_terakhir_maintenance,
//       interval_maintenance     = @interval_maintenance,
//       keterangan               = @keterangan
//     WHERE id_apar = @orig_id
//   `;
//   await pool.request()
//     .input('orig_id',                 sql.VarChar(26),      origId)
//     .input('new_id_apar',             sql.VarChar(26),      id_apar)
//     .input('no_apar',                 sql.NVarChar(50),     no_apar)
//     .input('lokasi_apar',             sql.NVarChar(255),    lokasi_apar)
//     .input('jenis_apar',              sql.NVarChar(100),    jenis_apar)
//     .input('keperluan_check',         sql.NVarChar(sql.MAX),keperluan_check)
//     .input('qr_code_apar',            sql.NVarChar(sql.MAX),qr_code_apar)
//     .input('status_apar',             sql.NVarChar(50),     status_apar)
//     .input('tgl_exp',                 sql.Date,             tgl_exp)
//     .input('tgl_terakhir_maintenance',sql.Date,             tgl_terakhir_maintenance)
//     .input('interval_maintenance',    sql.Int,              interval_maintenance)
//     .input('keterangan',              sql.NVarChar(sql.MAX),keterangan)
//     .query(query);

//   return { success: true };
// }

// /**
//  * Hapus APAR
//  */
// async function deleteApar(id_apar) {
//   const pool = await poolPromise;
//   await pool.request()
//     .input('id_apar', sql.VarChar(26), id_apar)
//     .query('DELETE FROM dbo.data_apar WHERE id_apar = @id_apar');
//   return { success: true };
// }

// module.exports = {
//   getAllApar,
//   getAparById,
//   createApar,
//   updateApar,
//   deleteApar
// };
