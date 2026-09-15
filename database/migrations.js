const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Pembaca file migrasi. Dipakai bersama oleh migrate.js, verify.js, dan validate-schema.js.

const DEFAULT_MIGRATIONS_DIRECTORY = __dirname;
const MIGRATION_FILE_PATTERN = /^(\d{3})_([a-z0-9_]+)\.sql$/;

// Checksum dihitung dari isi yang sudah dinormalkan supaya file yang sama tidak dianggap
// berubah hanya karena akhiran baris berbeda antara Windows (CRLF) dan Linux (LF).
function normalizeSql(content) {
  return String(content).replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

function checksumOf(content) {
  return crypto.createHash('sha256').update(normalizeSql(content), 'utf8').digest('hex');
}

function tablesCreatedBy(sql) {
  const matches = normalizeSql(sql).matchAll(/CREATE TABLE (?:IF NOT EXISTS )?([a-z0-9_]+)/gi);
  return [...new Set([...matches].map((match) => match[1].toLowerCase()))];
}

function listMigrations(directory = DEFAULT_MIGRATIONS_DIRECTORY) {
  const files = fs.readdirSync(directory).filter((name) => name.toLowerCase().endsWith('.sql')).sort();
  const versions = new Map();

  return files.map(function readMigration(file) {
    const match = MIGRATION_FILE_PATTERN.exec(file);
    if (!match) {
      throw new Error(`Nama file migrasi tidak valid: ${file}. Gunakan pola NNN_nama_migrasi.sql, contoh 003_enable_row_level_security.sql.`);
    }

    const [, version, name] = match;
    if (versions.has(version)) {
      throw new Error(`Nomor migrasi ${version} dipakai dua kali: ${versions.get(version)} dan ${file}.`);
    }
    versions.set(version, file);

    const sql = normalizeSql(fs.readFileSync(path.join(directory, file), 'utf8'));
    return { version, name, file, sql, checksum: checksumOf(sql), tables: tablesCreatedBy(sql) };
  });
}

module.exports = {
  DEFAULT_MIGRATIONS_DIRECTORY,
  MIGRATION_FILE_PATTERN,
  checksumOf,
  listMigrations,
  normalizeSql,
  tablesCreatedBy
};
