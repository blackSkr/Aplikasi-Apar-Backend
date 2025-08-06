// // backend/controllers/AparController.js
// const aparModel = require('../models/Apar');

// // CREATE
// const createApar = async (req, res) => {
//   const {
//     id_apar, no_apar, lokasi_apar, jenis_apar,
//     keperluan_check, qr_code_apar, status_apar,
//     tgl_exp, tgl_terakhir_maintenance,
//     interval_maintenance, keterangan
//   } = req.body;

//   if (
//     !id_apar || !no_apar || !lokasi_apar || !jenis_apar ||
//     !keperluan_check || !status_apar ||
//     !tgl_exp || !tgl_terakhir_maintenance ||
//     interval_maintenance == null
//   ) {
//     return res.status(400).json({ message: 'Semua field wajib diisi.' });
//   }

//   try {
//     const result = await aparModel.createApar({
//       id_apar, no_apar, lokasi_apar, jenis_apar,
//       keperluan_check, qr_code_apar, status_apar,
//       tgl_exp, tgl_terakhir_maintenance,
//       interval_maintenance, keterangan
//     });
//     return res.status(201).json({ message: 'Data APAR berhasil ditambahkan.' });
//   } catch (err) {
//     return res.status(500).json({ message: 'Error: ' + err.message });
//   }
// };

// // READ ALL
// const getAllApar = async (req, res) => {
//   try {
//     const apars = await aparModel.getAllApar();
//     return res.status(200).json(apars);
//   } catch (err) {
//     return res.status(500).json({ message: 'Error: ' + err.message });
//   }
// };

// // READ ONE
// const getAparById = async (req, res) => {
//   const { id_apar } = req.params;
//   if (!id_apar) {
//     return res.status(400).json({ message: 'ID APAR wajib disertakan.' });
//   }
//   try {
//     const apar = await aparModel.getAparById(id_apar);
//     if (!apar) {
//       return res.status(404).json({ message: 'Data APAR tidak ditemukan.' });
//     }
//     return res.status(200).json(apar);
//   } catch (err) {
//     return res.status(500).json({ message: 'Error: ' + err.message });
//   }
// };

// // UPDATE
// const updateApar = async (req, res) => {
//   const origId = req.params.orig_id;   // <-- id lama di URL
//   const {
//     id_apar, no_apar, lokasi_apar, jenis_apar,
//     keperluan_check, qr_code_apar, status_apar,
//     tgl_exp, tgl_terakhir_maintenance,
//     interval_maintenance, keterangan
//   } = req.body;

//   if (
//     !id_apar || !no_apar || !lokasi_apar || !jenis_apar ||
//     !keperluan_check || !status_apar ||
//     !tgl_exp || !tgl_terakhir_maintenance ||
//     interval_maintenance == null
//   ) {
//     return res.status(400).json({ message: 'Semua field wajib diisi.' });
//   }

//   try {
//     await aparModel.updateApar(origId, {
//       id_apar, no_apar, lokasi_apar, jenis_apar,
//       keperluan_check, qr_code_apar, status_apar,
//       tgl_exp, tgl_terakhir_maintenance,
//       interval_maintenance, keterangan
//     });
//     return res.status(200).json({ message: 'Data APAR berhasil diupdate.' });
//   } catch (err) {
//     return res.status(500).json({ message: 'Error: ' + err.message });
//   }
// };

// // DELETE
// const deleteApar = async (req, res) => {
//   const { id_apar } = req.params;
//   if (!id_apar) {
//     return res.status(400).json({ message: 'ID APAR wajib disertakan.' });
//   }
//   try {
//     await aparModel.deleteApar(id_apar);
//     return res.status(200).json({ message: 'Data APAR berhasil dihapus.' });
//   } catch (err) {
//     return res.status(500).json({ message: 'Error: ' + err.message });
//   }
// };

// module.exports = {
//   createApar,
//   getAllApar,
//   getAparById,
//   updateApar,
//   deleteApar
// };
