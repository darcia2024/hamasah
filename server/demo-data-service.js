'use strict';
// Tombol "Data demo" di dashboard super admin. Mengisi, mengganti kata sandi, dan
// menghapus data demo dari browser, tanpa terminal dan tanpa menyalin DATABASE_URL.
//
// Pengisian dijalankan per langkah (LANGKAH_DEMO) oleh browser, satu permintaan per
// langkah, supaya tidak ada permintaan yang mendekati batas waktu fungsi Vercel. Kata
// sandi akun demo dibuat acak di server dan hanya dikirim sekali, di jawaban langkah
// yang membuat akunnya.

const demo = require('./demo-data.js');

const KONFIRMASI_HAPUS = 'HAPUS';
const SENYAP = Object.freeze({ log() {} });

function createDemoDataService({ database, storage = null } = {}) {
  if (!database) throw new Error('createDemoDataService membutuhkan database.');

  // Jarak ke database menentukan apakah setiap langkah selesai jauh di bawah batas
  // waktu. Diukur tiga kali dan diambil yang tercepat supaya koneksi pertama yang
  // lambat tidak ikut terhitung.
  async function latensiDatabase() {
    let terbaik = Infinity;
    for (let i = 0; i < 3; i += 1) {
      const mulai = process.hrtime.bigint();
      await database.query('SELECT 1');
      terbaik = Math.min(terbaik, Number(process.hrtime.bigint() - mulai) / 1e6);
    }
    return Math.round(terbaik);
  }

  async function status() {
    const [ringkasan, latensiMs] = await Promise.all([demo.statusDataDemo(database), latensiDatabase()]);
    return {
      ...ringkasan,
      latensiMs,
      langkah: demo.LANGKAH_DEMO,
      akunDemo: demo.DEMO_ACCOUNTS.map((akun) => ({ email: akun.email, nama: akun.name, peran: akun.peran }))
    };
  }

  async function bungkus(kerja) {
    try {
      return { ok: true, value: await kerja() };
    } catch (error) {
      if (error instanceof demo.KesalahanDemo) return { ok: false, status: 422, error: error.message };
      throw error;
    }
  }

  function jalankanLangkah(langkah) {
    return bungkus(() => demo.jalankanLangkahDemo({
      database,
      langkah: String(langkah || ''),
      kataSandi: langkah === 'akun' ? demo.kataSandiAcak() : undefined
    }));
  }

  async function gantiSandi() {
    if (!(await demo.adaDataDemo(database))) return { ok: false, status: 422, error: 'Belum ada akun demo.' };
    const kataSandi = demo.kataSandiAcak();
    const hasil = await demo.gantiSandiDemo({ database, kataSandi });
    return { ok: true, value: { kataSandi, pendaftar: hasil.pendaftar } };
  }

  async function hapus(konfirmasi) {
    if (konfirmasi !== KONFIRMASI_HAPUS) return { ok: false, status: 422, error: `Ketik ${KONFIRMASI_HAPUS} untuk menghapus data demo.` };
    const data = await demo.temukanDataDemo(database);
    const jumlah = {
      akun: data.akun.length, santri: data.santri.length, pendaftar: data.pendaftaran.length,
      tagihan: data.invoice.length, berkas: data.berkas.length
    };
    if (!demo.totalBaris(data)) return { ok: true, value: { dihapus: jumlah, dilewati: [] } };
    await demo.hapusDataDemo({ database, data, storage: data.berkas.length ? storage : null, logger: SENYAP });
    const dilewati = [
      ...data.asramaDilewati.map((row) => `${row.name} masih dihuni santri yang bukan data demo.`),
      ...data.inventarisDilewati.map((row) => `${row.name} (${row.location}) sudah diubah akun lain.`)
    ];
    return { ok: true, value: { dihapus: jumlah, dilewati } };
  }

  return Object.freeze({ status, jalankanLangkah, gantiSandi, hapus });
}

module.exports = { KONFIRMASI_HAPUS, createDemoDataService };
