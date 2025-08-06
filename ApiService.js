// ApiService.js - Debug version untuk menemukan route yang bermasalah
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const methodOverride = require('method-override');
require('dotenv').config();

const app = express();

// =======================
// Middleware
// =======================
// 1. Parse JSON bodies
app.use(bodyParser.json());
// 2. Parse URL-encoded bodies (dari <form method="post">…</form>)
app.use(bodyParser.urlencoded({ extended: true }));
// 3. Override HTTP methods via query/value _method (untuk PUT/DELETE lewat form)
app.use(methodOverride('_method'));
// 4. Enable CORS
app.use(cors());

// =======================
// Root & Health Check
// =======================
app.get('/', (req, res) => {
  res.json({
    message: 'AparApps Backend API is running.',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString()
  });
});

// =======================
// Load Routes
// =======================
const loadRoute = (path, routePath, routeName) => {
  try {
    console.log(`Loading ${routeName}...`);
    const route = require(path);
    app.use(routePath, route);
    console.log(`✅ ${routeName} loaded successfully`);
  } catch (error) {
    console.error(`❌ Error loading ${routeName}:`, error.message);
    return false;
  }
  return true;
};

const routes = [
  { path: './routes/PeralatanRoutes',       routePath: '/api/peralatan',       name: 'PeralatanRoutes' },
  { path: './routes/PerawatanRoutes',       routePath: '/api/perawatan',       name: 'PerawatanRoutes' },
  { path: './routes/LokasiRoutes',          routePath: '/api/lokasi',          name: 'LokasiRoutes' },
  { path: './routes/JenisPeralatanRoutes',  routePath: '/api/jenis-peralatan', name: 'JenisPeralatanRoutes' },
  { path: './routes/PetugasRoutes',         routePath: '/api/petugas',         name: 'PetugasRoutes' },
  { path: './routes/ChecklistRoutes',       routePath: '/api/checklist',       name: 'ChecklistRoutes' },
  { path: './routes/IntervalPetugasRoutes', routePath: '/api/interval-petugas',name: 'IntervalPetugasRoutes' },
  // { path: './routes/DropdownRoutes',        routePath: '/api/dropdown',       name: 'DropdownRoutes' }

];

let successCount = 0;
routes.forEach(route => {
  if (loadRoute(route.path, route.routePath, route.name)) {
    successCount++;
  }
});
console.log(`\n📊 Routes loaded: ${successCount}/${routes.length}`);

// =======================
// Mulai Server
// =======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
