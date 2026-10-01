'use strict';

// Pembaruan database dari halaman Pengaturan, supaya super admin tidak perlu membuka
// terminal setiap kali rilis membawa file migrasi baru (database/NNN_*.sql).
//
// Memakai fungsi yang sama dengan `npm run migrate`: setiap file berjalan dalam satu
// transaksi dengan kunci advisory, lalu dicatat di schema_migrations. Migrasi di repo ini
// selalu menambah (tabel atau kolom baru), jadi aman diterapkan saat aplikasi berjalan.
// Yang tidak ditangani di sini: database yang belum punya catatan migrasi sama sekali
// (butuh `npm run migrate -- --baseline` dari terminal, lihat RUNBOOK bagian 4).

const { DEFAULT_MIGRATIONS_DIRECTORY, listMigrations } = require('../database/migrations.js');
const { applyMigration, assertLedgerMatchesFiles, readLedger, tableExists } = require('../database/migrate.js');

const TANPA_CATATAN = 'Database ini belum memakai catatan migrasi. Pembaruan pertama dijalankan dari terminal dengan npm run migrate (RUNBOOK bagian 4).';

function createDatabaseUpdateService({ database, migrationsDirectory = DEFAULT_MIGRATIONS_DIRECTORY } = {}) {
  if (!database) throw new Error('createDatabaseUpdateService membutuhkan database.');

  async function periksa() {
    const migrations = listMigrations(migrationsDirectory);
    if (!(await tableExists(database, 'schema_migrations'))) {
      return { migrations, ledger: null, masalah: TANPA_CATATAN };
    }
    const ledger = await readLedger(database);
    let masalah = null;
    try {
      assertLedgerMatchesFiles(ledger, migrations);
    } catch (error) {
      masalah = error.message;
    }
    return { migrations, ledger, masalah };
  }

  async function status() {
    const { migrations, ledger, masalah } = await periksa();
    const tertunda = ledger ? migrations.filter((migration) => !ledger.has(migration.version)) : [];
    return {
      total: migrations.length,
      diterapkan: ledger ? ledger.size : 0,
      tertunda: tertunda.map((migration) => ({ versi: migration.version, berkas: migration.file })),
      masalah
    };
  }

  async function terapkan() {
    const { migrations, ledger, masalah } = await periksa();
    if (masalah) return { ok: false, status: 409, error: masalah };

    const diterapkan = [];
    for (const migration of migrations) {
      if (ledger.has(migration.version)) continue;
      try {
        if (await applyMigration(database, migration)) diterapkan.push(migration.file);
      } catch (error) {
        // File yang gagal tidak tercatat (transaksinya dibatalkan); yang sebelumnya tetap tersimpan.
        const sebelumnya = diterapkan.length ? ` ${diterapkan.length} pembaruan sebelumnya sudah tersimpan.` : '';
        return {
          ok: false,
          status: 500,
          error: `Pembaruan ${migration.file} gagal: ${error.message}.${sebelumnya} Hubungi pengembang sebelum mencoba lagi.`,
          diterapkan
        };
      }
    }
    return { ok: true, value: { diterapkan, status: await status() } };
  }

  return Object.freeze({ status, terapkan });
}

module.exports = { createDatabaseUpdateService };
