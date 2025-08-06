const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ========== AUTO LOAD ROUTES ==========
// Daftar route yang mau dipakai
const routes = [
  { path: './routes/PeralatanRoutes',       routePath: '/api/peralatan' },
  { path: './routes/PerawatanRoutes',       routePath: '/api/perawatan' },
  { path: './routes/LokasiRoutes',          routePath: '/api/lokasi' },
  { path: './routes/JenisPeralatanRoutes',  routePath: '/api/jenis-peralatan' },
  { path: './routes/PetugasRoutes',         routePath: '/api/petugas' },
  { path: './routes/ChecklistRoutes',       routePath: '/api/checklist' },
  { path: './routes/IntervalPetugasRoutes', routePath: '/api/interval-petugas' },
  // Tambah sesuai kebutuhan...
];

routes.forEach(r => {
  try {
    const route = require(r.path);
    app.use(r.routePath, route);
    console.log(`✅ Route loaded: ${r.routePath}`);
  } catch (err) {
    console.log(`❌ Route failed: ${r.routePath} |`, err.message);
  }
});

// ========== END AUTO LOAD ROUTES ==========

// Run di semua IP
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend running at: http://0.0.0.0:${PORT}`);
});
