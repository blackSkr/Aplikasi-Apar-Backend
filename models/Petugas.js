// // models/Petugas.js
// const bcrypt = require('bcrypt');
// const { poolPromise, sql } = require('../ConfigDB');

// // Fungsi untuk menambah petugas
// async function createPetugas(id_petugas, badge_number, nama_petugas, departemen, password) {
//   try {
//     const hashedPassword = await bcrypt.hash(password, 10);
//     const pool = await poolPromise;
//     const query = `
//       INSERT INTO dbo.petugas
//         (id_petugas, badge_number, nama_petugas, departemen, password)
//       VALUES
//         (@id_petugas, @badge_number, @nama_petugas, @departemen, @password)
//     `;
//     await pool.request()
//       .input('id_petugas',  sql.VarChar(26),  id_petugas)
//       .input('badge_number', sql.VarChar(26),  badge_number)
//       .input('nama_petugas', sql.VarChar(25),  nama_petugas)
//       .input('departemen',   sql.VarChar(50),  departemen)
//       .input('password',     sql.VarChar(255), hashedPassword)
//       .query(query);

//     return { success: true };
//   } catch (err) {
//     throw new Error('Error saat menyimpan data petugas: ' + err.message);
//   }
// }

// // Fungsi untuk mendapatkan semua petugas
// async function getAllPetugas() {
//   try {
//     const pool = await poolPromise;
//     const result = await pool.request()
//       .query('SELECT * FROM dbo.petugas');
//     return result.recordset;
//   } catch (err) {
//     throw new Error('Error saat mengambil data petugas: ' + err.message);
//   }
// }

// // Fungsi untuk mengupdate petugas
// async function updatePetugas(id_petugas, badge_number, nama_petugas, departemen, password) {
//   try {
//     const hashedPassword = await bcrypt.hash(password, 10);
//     const pool = await poolPromise;
//     const query = `
//       UPDATE dbo.petugas
//       SET badge_number = @badge_number,
//           nama_petugas = @nama_petugas,
//           departemen   = @departemen,
//           password     = @password
//       WHERE id_petugas = @id_petugas
//     `;
//     await pool.request()
//       .input('id_petugas',  sql.VarChar(26),  id_petugas)
//       .input('badge_number', sql.VarChar(26),  badge_number)
//       .input('nama_petugas', sql.VarChar(25),  nama_petugas)
//       .input('departemen',   sql.VarChar(50),  departemen)
//       .input('password',     sql.VarChar(255), hashedPassword)
//       .query(query);

//     return { success: true };
//   } catch (err) {
//     throw new Error('Error saat mengupdate data petugas: ' + err.message);
//   }
// }

// // Fungsi untuk menghapus petugas
// async function deletePetugas(id_petugas) {
//   try {
//     const pool = await poolPromise;
//     await pool.request()
//       .input('id_petugas', sql.VarChar(26), id_petugas)
//       .query('DELETE FROM dbo.petugas WHERE id_petugas = @id_petugas');
//     return { success: true };
//   } catch (err) {
//     throw new Error('Error saat menghapus data petugas: ' + err.message);
//   }
// }

// module.exports = {
//   createPetugas,
//   getAllPetugas,
//   updatePetugas,
//   deletePetugas
// };
