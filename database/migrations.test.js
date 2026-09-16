const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checksumOf, listMigrations, normalizeSql, tablesCreatedBy, tablesWithRowLevelSecurity } = require('./migrations.js');

function createTemporaryDirectory(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hamasah-migrations-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(directory, name), content);
  }
  return directory;
}

function run() {
  // Migrasi asli repo terbaca berurutan beserta tabelnya.
  const migrations = listMigrations();
  const versions = migrations.map((migration) => migration.version);
  assert.deepEqual(versions, [...versions].sort(), 'Migrasi harus terurut menurut nomor.');
  assert.equal(new Set(versions).size, versions.length, 'Nomor migrasi harus unik.');
  assert.ok(versions.includes('001') && versions.includes('002'));
  assert.equal(migrations[0].name, 'initial_schema');
  assert.ok(migrations[0].tables.includes('accounts'));
  assert.ok(migrations[0].tables.includes('inventory_items'));
  assert.deepEqual(migrations[1].tables, ['account_sessions']);
  assert.match(migrations[0].checksum, /^[a-f0-9]{64}$/);

  // Setiap tabel yang dibuat migrasi harus punya perintah ENABLE ROW LEVEL SECURITY di suatu migrasi.
  const created = new Set(migrations.flatMap((migration) => migration.tables));
  const protectedTables = new Set(migrations.flatMap((migration) => migration.tablesWithRls));
  assert.deepEqual([...created].filter((table) => !protectedTables.has(table)), []);
  assert.equal(protectedTables.size, created.size);

  assert.deepEqual(
    tablesWithRowLevelSecurity('ALTER TABLE satu ENABLE ROW LEVEL SECURITY;\nALTER TABLE dua ENABLE ROW LEVEL SECURITY;'),
    ['satu', 'dua']
  );

  // Akhiran baris CRLF tidak mengubah checksum.
  const lf = 'CREATE TABLE contoh (id INT);\nCREATE INDEX contoh_idx ON contoh (id);\n';
  assert.equal(checksumOf(lf), checksumOf(lf.replace(/\n/g, '\r\n')));
  assert.equal(normalizeSql(`﻿${lf.replace(/\n/g, '\r\n')}`), lf);

  assert.deepEqual(tablesCreatedBy('CREATE TABLE satu (id INT); CREATE TABLE IF NOT EXISTS dua (id INT);'), ['satu', 'dua']);

  // Nama file yang tidak sesuai pola ditolak, supaya tidak ada migrasi yang diam-diam terlewat.
  const badName = createTemporaryDirectory({ '001_awal.sql': 'SELECT 1;', 'tambahan.sql': 'SELECT 1;' });
  assert.throws(() => listMigrations(badName), /Nama file migrasi tidak valid/);
  fs.rmSync(badName, { recursive: true, force: true });

  const duplicate = createTemporaryDirectory({ '003_satu.sql': 'SELECT 1;', '003_dua.sql': 'SELECT 1;' });
  assert.throws(() => listMigrations(duplicate), /dipakai dua kali/);
  fs.rmSync(duplicate, { recursive: true, force: true });

  console.log('migration file reader tests passed');
}

run();
