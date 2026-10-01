'use strict';
// Pengisian dan penghapusan data demo dari terminal. Isinya ada di server/demo-data.js;
// cara yang lebih mudah untuk situs live adalah tombol "Data demo" di dashboard super
// admin (Portal).
//
// Di laptop (hentikan preview dulu: database lokal hanya boleh dibuka satu proses):
//   npm run demo:isi                                  mengisi data demo
//   npm run demo:hapus                                laporan saja, tidak menghapus
//   CONFIRM_DELETE=I_UNDERSTAND npm run demo:hapus    menghapus semua data demo
//   npm run demo:isi -- --sandi-baru                  kata sandi dan kode akses baru
//
// Ke database production, dari terminal yang sama (lihat RUNBOOK.md):
//   APP_ENV=production ALLOW_PRODUCTION_WRITE=I_UNDERSTAND DATABASE_URL=... node scripts/demo-data.js

const path = require('node:path');
const { createDatabase } = require('../server/db.js');
const { assertDatabaseWriteAllowed } = require('../server/environment.js');
const demo = require('../server/demo-data.js');

const {
  LOCAL_DEMO_PASSWORD, adaDataDemo, gantiSandiDemo, hapusDataDemo, isiDataDemo, temukanDataDemo, totalBaris, cetakLaporan
} = demo;
const LOCAL_DATABASE_URL = `pglite:${path.join(__dirname, '..', 'data', 'dev-db')}`;
const CONFIRM_DELETE = 'I_UNDERSTAND';
// ---------------------------------------------------------------------------
// Baris perintah

function tentukanTarget(env) {
  const url = String(env.DATABASE_URL || '').trim();
  if (!url) {
    return { url: LOCAL_DATABASE_URL, lingkungan: 'development', lokal: true };
  }
  // Ke database selain lokal harus jelas lingkungannya, dan production wajib
  // ALLOW_PRODUCTION_WRITE=I_UNDERSTAND seperti skrip penulis database lainnya.
  const lingkungan = assertDatabaseWriteAllowed(env);
  return { url, lingkungan, lokal: false };
}

function pilihKataSandi(env, lingkungan) {
  if (env.DEMO_PASSWORD) return env.DEMO_PASSWORD;
  if (lingkungan === 'development' || lingkungan === 'test') return LOCAL_DEMO_PASSWORD;
  return demo.kataSandiAcak();
}

function buatStorage(env, target) {
  if (target.lokal) {
    const { createLocalStorage } = require('../server/storage/local.js');
    return createLocalStorage({ rootDirectory: path.join(__dirname, '..', 'data', 'dev-storage') });
  }
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createSupabaseStorage } = require('../server/storage/supabase.js');
    return createSupabaseStorage({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
  }
  return null;
}

const LABEL_STATUS = Object.freeze({
  submitted: 'Baru masuk',
  'document-review': 'Pemeriksaan berkas',
  'needs-revision': 'Perlu perbaikan',
  'academic-preparation': 'Persiapan akademik',
  'ready-for-departure': 'Siap berangkat',
  completed: 'Selesai',
  cancelled: 'Dibatalkan'
});

function cetakPendaftar(pendaftar) {
  console.log('Pendaftar demo. Cek status di /cek-status.html dengan nomor dan kode akses:');
  for (const p of pendaftar) {
    console.log(`  ${p.nomor}  ${(p.kode || '(kode lama)').padEnd(11)}  ${(LABEL_STATUS[p.status] || p.status).padEnd(19)} ${p.nama}`);
  }
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const modeHapus = argv.includes('--hapus');
  const modeSandi = argv.includes('--sandi-baru');
  const target = tentukanTarget(env);
  const database = createDatabase({ connectionString: target.url });
  try {
    if (target.lokal) {
      const { migrate } = require('../database/migrate.js');
      await migrate({
        environment: { APP_ENV: 'development', DATABASE_URL: target.url },
        database,
        envFilePath: null,
        logger: { log() {} }
      });
    }

    if (modeHapus) {
      const data = await temukanDataDemo(database);
      cetakLaporan(data);
      if (totalBaris(data) === 0) {
        console.log('Tidak ada data demo.');
        return;
      }
      if (env.CONFIRM_DELETE !== CONFIRM_DELETE) {
        console.log(`Ini baru LAPORAN, belum ada yang dihapus dari ${target.lingkungan}.`);
        console.log('Kalau daftar di atas sudah benar, jalankan ulang dengan CONFIRM_DELETE=I_UNDERSTAND.');
        return;
      }
      await hapusDataDemo({ database, data, storage: data.berkas.length ? buatStorage(env, target) : null });
      console.log(`Selesai. Semua data demo di ${target.lingkungan} sudah dihapus.`);
      return;
    }

    const kataSandi = pilihKataSandi(env, target.lingkungan);
    if (modeSandi) {
      if (!(await adaDataDemo(database))) {
        console.log('Belum ada data demo. Jalankan tanpa --sandi-baru untuk mengisinya.');
        return;
      }
      const hasil = await gantiSandiDemo({ database, kataSandi });
      console.log(`\nKata sandi baru untuk SEMUA akun demo: ${kataSandi}`);
      console.log('Sesi login akun demo yang lama sudah diakhiri.\n');
      cetakPendaftar(hasil.pendaftar);
      return;
    }

    const hasil = await isiDataDemo({ database, kataSandi });
    if (hasil.sudahAda) {
      console.log('Data demo sudah ada, tidak ada yang ditambahkan.');
      console.log('Lupa kata sandi atau kode akses? Jalankan lagi dengan --sandi-baru.');
      console.log('Ingin mengisi ulang dari awal? Hapus dulu dengan --hapus.');
      return;
    }
    const j = hasil.jumlah;
    console.log(`\nData demo siap di ${target.lingkungan}.`);
    if (hasil.kataSandi) {
      console.log(`\nKata sandi SEMUA akun demo: ${hasil.kataSandi}`);
      if (!target.lokal) console.log('Kata sandi ini hanya ditampilkan sekali. Simpan sekarang.');
    } else {
      console.log('\nAkun demo sudah ada dari pengisian sebelumnya; kata sandinya tidak berubah. Lupa? Jalankan dengan --sandi-baru.');
    }
    console.log('\nAkun demo (masuk lewat /portal.html):');
    for (const akun of hasil.akun) {
      console.log(`  ${akun.email.padEnd(30)} ${akun.peran} (${akun.nama})`);
    }
    console.log('');
    cetakPendaftar(hasil.pendaftar);
    console.log(`\nIsi lain: ${j.asrama} asrama, ${j.santri} santri dengan catatan harian, ${j.tagihan} tagihan (${j.tagihanLunas} lunas), ${j.visa} data visa, ${j.inventaris} barang inventaris, ${j.kloter} kloter, ${j.pesan} pesan konsultasi, ${j.maddah} maddah.`);
    console.log('Hapus semua data demo sebelum aplikasi dipakai untuk data sungguhan (lihat --hapus).');
  } finally {
    await database.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[demo] Gagal: ${error.message}`);
    console.error('[demo] Bila data demo sempat terisi sebagian, hapus dulu dengan --hapus lalu ulangi.');
    process.exitCode = 1;
  });
}

module.exports = demo;
