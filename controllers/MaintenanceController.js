// // controllers/Maintenance.js
// const maintenanceModel = require('../models/Maintenance');

// // GET all
// const getAllMaintenance = async (req, res) => {
//   try {
//     const data = await maintenanceModel.getAllMaintenance();
//     res.status(200).json(data);
//   } catch (err) {
//     res.status(500).json({ message: 'Error: ' + err.message });
//   }
// };

// // GET by id
// const getMaintenanceById = async (req, res) => {
//   const { id_maintenance } = req.params;
//   try {
//     const data = await maintenanceModel.getMaintenanceById(id_maintenance);
//     if (!data) return res.status(404).json({ message: 'Tidak ditemukan.' });
//     res.status(200).json(data);
//   } catch (err) {
//     res.status(500).json({ message: 'Error: ' + err.message });
//   }
// };

// // CREATE
// const createMaintenance = async (req, res) => {
//   const {
//     id_maintenance,
//     id_petugas,
//     id_apar,
//     checklist_kondisi,
//     foto_apar,
//     status_apar,
//     tgl_maintenance,
//     keterangan
//   } = req.body;

//   // validasi sederhana
//   if (
//     !id_maintenance ||
//     !id_petugas ||
//     !id_apar ||
//     !checklist_kondisi ||
//     !foto_apar ||
//     !status_apar ||
//     !tgl_maintenance
//   ) {
//     return res.status(400).json({ message: 'Field wajib diisi.' });
//   }

//   try {
//     await maintenanceModel.createMaintenance(
//       id_maintenance,
//       id_petugas,
//       id_apar,
//       checklist_kondisi,
//       foto_apar,
//       status_apar,
//       tgl_maintenance,
//       keterangan
//     );
//     res.status(201).json({ message: 'Maintenance berhasil ditambahkan.' });
//   } catch (err) {
//     res.status(500).json({ message: 'Error: ' + err.message });
//   }
// };

// // UPDATE
// const updateMaintenance = async (req, res) => {
//   const {
//     id_maintenance,
//     id_petugas,
//     id_apar,
//     checklist_kondisi,
//     foto_apar,
//     status_apar,
//     tgl_maintenance,
//     keterangan
//   } = req.body;

//   if (
//     !id_maintenance ||
//     !id_petugas ||
//     !id_apar ||
//     !checklist_kondisi ||
//     !foto_apar ||
//     !status_apar ||
//     !tgl_maintenance
//   ) {
//     return res.status(400).json({ message: 'Field wajib diisi.' });
//   }

//   try {
//     await maintenanceModel.updateMaintenance(
//       id_maintenance,
//       id_petugas,
//       id_apar,
//       checklist_kondisi,
//       foto_apar,
//       status_apar,
//       tgl_maintenance,
//       keterangan
//     );
//     res.status(200).json({ message: 'Maintenance berhasil diupdate.' });
//   } catch (err) {
//     res.status(500).json({ message: 'Error: ' + err.message });
//   }
// };

// // DELETE
// const deleteMaintenance = async (req, res) => {
//   const { id_maintenance } = req.params;
//   try {
//     await maintenanceModel.deleteMaintenance(id_maintenance);
//     res.status(200).json({ message: 'Maintenance berhasil dihapus.' });
//   } catch (err) {
//     res.status(500).json({ message: 'Error: ' + err.message });
//   }
// };

// module.exports = {
//   getAllMaintenance,
//   getMaintenanceById,
//   createMaintenance,
//   updateMaintenance,
//   deleteMaintenance
// };
