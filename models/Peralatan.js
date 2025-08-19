// models/Peralatan.js
const { poolPromise, sql } = require('../ConfigDB');

const PeralatanModel = {
  async getAll() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT p.Id, p.Kode, jp.Nama AS Jenis, l.Nama AS Lokasi, p.Spesifikasi, p.FotoPath
      FROM Peralatan p
      JOIN JenisPeralatan jp ON p.JenisId = jp.Id
      JOIN Lokasi l ON p.LokasiId = l.Id
    `);
    return result.recordset;
  },

  async getWithInspection() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        p.Id, p.Kode, p.Spesifikasi, p.FotoPath,
        l.Nama AS Lokasi, jp.Nama AS Jenis,
        h.Kondisi, h.TanggalPemeriksaan
      FROM Peralatan p
      JOIN Lokasi l ON p.LokasiId = l.Id
      JOIN JenisPeralatan jp ON p.JenisId = jp.Id
      LEFT JOIN HasilPemeriksaan h ON h.PeralatanId = p.Id
    `);
    return result.recordset;
  },

  async create(data) {
    if (!data.Kode || !data.JenisId || !data.LokasiId || !data.Spesifikasi) {
      throw new Error('Field wajib tidak boleh kosong');
    }
    const pool = await poolPromise;
    await pool.request()
      .input('Kode', sql.NVarChar, data.Kode)
      .input('JenisId', sql.Int, data.JenisId)
      .input('LokasiId', sql.Int, data.LokasiId)
      .input('Spesifikasi', sql.NVarChar, data.Spesifikasi)
      .input('TokenQR', sql.UniqueIdentifier, data.TokenQR)
      .input('FotoPath', sql.NVarChar, data.FotoPath || null) // NEW
      .query(`
        INSERT INTO Peralatan (Kode, JenisId, LokasiId, Spesifikasi, TokenQR, FotoPath)
        VALUES (@Kode, @JenisId, @LokasiId, @Spesifikasi, @TokenQR, @FotoPath)
      `);
  },

  async getByTokenQR(tokenQR) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('TokenQR', sql.UniqueIdentifier, tokenQR)
      .query('SELECT * FROM Peralatan WHERE TokenQR = @TokenQR');
    return result.recordset[0];
  }
};

module.exports = PeralatanModel;
