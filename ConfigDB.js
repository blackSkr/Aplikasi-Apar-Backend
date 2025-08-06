// backend/ConfigDB.js
require('dotenv').config();

const sql = require('mssql');

// Konfigurasi pool koneksi
const poolPromise = new sql.ConnectionPool({
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT),
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: true,
  },
}).connect();

module.exports = { poolPromise, sql };
