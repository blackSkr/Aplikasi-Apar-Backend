// ApiService.js - Debug version + static uploads
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const methodOverride = require('method-override');
const path = require('path');
require('dotenv').config();

const app = express();

/* =======================
   Middleware
   ======================= */
// 1) CORS (boleh sesuaikan origin jika perlu)
app.use(cors());
// 2) Parsers
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// 3) _method override (kalau kirim PUT/DELETE dari form)
app.use(methodOverride('_method'));

/* =======================
   Static: /uploads
   ======================= */
// NOTE: gunakan root project sebagai anchor agar konsisten dengan routes upload
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    // beberapa browser ketat soal CORP; ini aman untuk cross-origin render gambar
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  })
);
console.log('📁 Static mounted at /uploads ->', UPLOADS_DIR);

/* =======================
   Root & Health Check
   ======================= */
app.get('/', (req, res) => {
  res.json({
    message: 'AparApps Backend API is running.',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
  });
});

/* =======================
   Load Routes
   ======================= */
const loadRoute = (pathStr, routePath, routeName) => {
  try {
    console.log(`Loading ${routeName}...`);
    const route = require(pathStr);
    app.use(routePath, route);
    console.log(`✅ ${routeName} loaded at ${routePath}`);
  } catch (error) {
    console.error(`❌ Error loading ${routeName}:`, error.message);
    return false;
  }
  return true;
};

const routes = [
  { path: './routes/PeralatanRoutes',       routePath: '/api/peralatan',        name: 'PeralatanRoutes' },
  { path: './routes/PerawatanRoutes',       routePath: '/api/perawatan',        name: 'PerawatanRoutes' },
  { path: './routes/LokasiRoutes',          routePath: '/api/lokasi',           name: 'LokasiRoutes' },
  { path: './routes/JenisPeralatanRoutes',  routePath: '/api/jenis-peralatan',  name: 'JenisPeralatanRoutes' },
  { path: './routes/PetugasRoutes',         routePath: '/api/petugas',          name: 'PetugasRoutes' },
  { path: './routes/ChecklistRoutes',       routePath: '/api/checklist',        name: 'ChecklistRoutes' },
  { path: './routes/IntervalPetugasRoutes', routePath: '/api/interval-petugas', name: 'IntervalPetugasRoutes' },
  { path: './routes/EmployeeRoutes',        routePath: '/api/employee',         name: 'EmployeeRoutes' },
  { path: './routes/RolePetugasRoutes',     routePath: '/api/role-petugas',     name: 'RolePetugasRoutes' },
  { path: './routes/DashboardRoutes',      routePath: '/api/dashboard',        name: 'DashboardRoutes' },
];

let successCount = 0;
routes.forEach((r) => { if (loadRoute(r.path, r.routePath, r.name)) successCount++; });
console.log(`\n📊 Routes loaded: ${successCount}/${routes.length}`);

/* =======================
   404 handler sederhana
   ======================= */
app.use((req, res) => {
  if (req.path.startsWith('/uploads/')) {
    return res.status(404).send('File not found in /uploads (check path and disk file).');
  }
  res.status(404).json({ message: 'Endpoint not found', path: req.path });
});

/* =======================
   Start Server
   ======================= */
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`\n🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`🔎 Try opening: http://localhost:${PORT}/api/health`);
  console.log(`🖼️  Static test : http://localhost:${PORT}/uploads/peralatan/sample.jpg`);
});
