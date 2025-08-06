// backend/server-sql.js
require('dotenv').config();  // Memuat .env

const express = require('express');
const cors    = require('cors');

// Ambil poolPromise dari ConfigDB
const { poolPromise } = require('./ConfigDB');

// Import routes
const petugasRoutes = require('./routes/PetugasRoutes');
const aparRoutes    = require('./routes/AparRoutes');
// Jika nanti ada MaintenanceRoutes, uncomment baris ini:
// const maintenanceRoutes = require('./routes/MaintenanceRoutes');

const app  = express();
const port = process.env.PORT || 3000;

// Setup CORS (sesuaikan origin dengan Expo-mu)
app.use(cors({
  origin: 'exp://172.20.10.5:8081',
  methods: ['GET','POST','PUT','DELETE'],
  allowedHeaders: ['Content-Type'],
}));

// JSON body parser
app.use(express.json());

// Tes koneksi DB
poolPromise
  .then(() => console.log('✔️  Terhubung ke SQL Server'))
  .catch(err => {
    console.error('❌  Gagal koneksi ke DB:', err);
    process.exit(1);
  });

// Mount semua route di /api
app.use('/api', petugasRoutes);      // → /api/petugas...
app.use('/api', aparRoutes);         // → /api/apar...
// app.use('/api', maintenanceRoutes); // → /api/maintenance...

// Root (opsional)
app.get('/', (req, res) => res.send('API is running!'));

// Start server
app.listen(port, () => {
  console.log(`🚀  Server berjalan di http://localhost:${port}`);
});
