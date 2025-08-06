// // backend/controllers/PetugasController.js
// const petugasModel = require('../models/Petugas');

// // Menambah petugas
// const createPetugas = async (req, res) => {
//   const { id_petugas, badge_number, nama_petugas, departemen, password } = req.body;

//   if (!id_petugas || !badge_number || !nama_petugas || !departemen || !password) {
//     return res.status(400).json({ message: 'Semua field wajib diisi.' });
//   }

//   try {
//     const result = await petugasModel.createPetugas(id_petugas, badge_number, nama_petugas, departemen, password);
//     if (result.success) {
//       res.status(201).json({ message: 'Data petugas berhasil ditambahkan.' });
//     }
//   } catch (err) {
//     res.status(500).json({ message: 'Error: ' + err.message });
//   }
// };

// // Mendapatkan semua petugas
// const getAllPetugas = async (req, res) => {
//   try {
//     const petugas = await petugasModel.getAllPetugas();
//     res.status(200).json(petugas);
//   } catch (err) {
//     res.status(500).json({ message: 'Error: ' + err.message });
//   }
// };

// // Mengupdate petugas
// const updatePetugas = async (req, res) => {
//   const { id_petugas, badge_number, nama_petugas, departemen, password } = req.body;

//   if (!id_petugas || !badge_number || !nama_petugas || !departemen || !password) {
//     return res.status(400).json({ message: 'Semua field wajib diisi.' });
//   }

//   try {
//     const result = await petugasModel.updatePetugas(id_petugas, badge_number, nama_petugas, departemen, password);
//     if (result.success) {
//       res.status(200).json({ message: 'Data petugas berhasil diupdate.' });
//     }
//   } catch (err) {
//     res.status(500).json({ message: 'Error: ' + err.message });
//   }
// };

// // Menghapus petugas
// const deletePetugas = async (req, res) => {
//   const { id_petugas } = req.params;

//   try {
//     const result = await petugasModel.deletePetugas(id_petugas);
//     if (result.success) {
//       res.status(200).json({ message: 'Data petugas berhasil dihapus.' });
//     }
//   } catch (err) {
//     res.status(500).json({ message: 'Error: ' + err.message });
//   }
// };

// module.exports = {
//   createPetugas,
//   getAllPetugas,
//   updatePetugas,
//   deletePetugas,
// };
