// Migrasi 034: index untuk jalur query yang sering dipakai (Task R6.5).
// Diperiksa dua hal: indexnya ada, dan planner benar-benar memakainya untuk query yang
// sama dengan yang dijalankan store (kolom pengurutan cocok dengan ORDER BY).

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createTestDatabase } = require('../server/test-support/database.js');

const EXPECTED = Object.freeze({
  student_parent_accounts_parent_idx: 'student_parent_accounts',
  course_enrollments_course_idx: 'course_enrollments',
  achievements_student_idx: 'student_achievements',
  evaluations_student_idx: 'student_evaluations',
  violations_student_idx: 'student_violations',
  registrations_updated_idx: 'registrations',
  invoices_issued_idx: 'invoices',
  students_name_idx: 'students'
});

// Planner memilih seq scan pada tabel kecil walau ada index. Untuk membuktikan bahwa index
// dapat MELAYANI query, seq scan dimatikan sementara dan rencana yang dihasilkan diperiksa.
async function planFor(database, sql, params = []) {
  const { rows } = await database.query(`EXPLAIN ${sql}`, params);
  return rows.map((row) => row['QUERY PLAN']).join('\n');
}

async function run() {
  const database = await createTestDatabase();
  try {
    const { rows } = await database.query("SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public'");
    const found = new Map(rows.map((row) => [row.indexname, row.tablename]));
    for (const [name, table] of Object.entries(EXPECTED)) {
      assert.equal(found.get(name), table, `Index ${name} tidak ada pada ${table}.`);
    }

    // Data ada, lalu migrasi dijalankan ulang: harus idempoten dan tidak merusak data.
    const accountId = crypto.randomUUID();
    await database.query("INSERT INTO accounts (id, email, name, role, password_hash) VALUES ($1, 'wali@hamasah.test', 'Wali', 'parent', 'x')", [accountId]);
    const studentId = crypto.randomUUID();
    await database.query("INSERT INTO students (id, name, program, city, join_date, status) VALUES ($1, 'Santri Indeks', 'Kuliah Al-Azhar', 'Kairo', '2026-08-20', 'active')", [studentId]);
    await database.query('INSERT INTO student_parent_accounts (student_id, parent_account_id) VALUES ($1, $2)', [studentId, accountId]);
    await database.query("INSERT INTO student_violations (id, student_id, level, note, occurred_at) VALUES ($1, $2, 'ringan', 'Catatan', now())", [crypto.randomUUID(), studentId]);
    const sql = fs.readFileSync(path.join(__dirname, '034_query_path_indexes.sql'), 'utf8');
    await database.exec(sql);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM student_violations')).rows[0].n, 1);

    await database.query('SET enable_seqscan = off');
    // Tanpa bitmap dan tanpa Sort yang murah: bila urutan index tidak cocok dengan ORDER BY,
    // rencananya tetap memuat Sort dan pemeriksaan di bawah gagal.
    await database.query('SET enable_bitmapscan = off');
    await database.query('SET enable_sort = off');
    const q = (text, params) => planFor(database, text, params);

    const wali = await q('SELECT student_id FROM student_parent_accounts WHERE parent_account_id = $1', [accountId]);
    assert.match(wali, /student_parent_accounts_parent_idx/, wali);

    const maddah = await q('SELECT student_id FROM course_enrollments WHERE course_id = $1', [crypto.randomUUID()]);
    assert.match(maddah, /course_enrollments_course_idx/, maddah);

    // Query byStudent: WHERE student_id = $1 ORDER BY occurred_at DESC, created_at DESC.
    for (const [table, index] of [['student_achievements', 'achievements_student_idx'], ['student_evaluations', 'evaluations_student_idx'], ['student_violations', 'violations_student_idx']]) {
      const plan = await q(`SELECT * FROM ${table} WHERE student_id = $1 ORDER BY occurred_at DESC, created_at DESC`, [studentId]);
      assert.match(plan, new RegExp(index), plan);
      assert.doesNotMatch(plan, /\bSort\b/, `${table}: masih ada Sort, urutan index tidak cocok dengan ORDER BY.\n${plan}`);
    }

    // Daftar berpaginasi tanpa filter: urutan index harus melayani ORDER BY + LIMIT tanpa Sort.
    const pendaftar = await q('SELECT * FROM registrations ORDER BY updated_at DESC, id LIMIT 20 OFFSET 0');
    assert.match(pendaftar, /registrations_updated_idx/, pendaftar);
    assert.doesNotMatch(pendaftar, /\bSort\b/, pendaftar);
    const tagihan = await q('SELECT * FROM invoices ORDER BY issued_at DESC, id LIMIT 20 OFFSET 0');
    assert.match(tagihan, /invoices_issued_idx/, tagihan);
    assert.doesNotMatch(tagihan, /\bSort\b/, tagihan);
    const santri = await q('SELECT * FROM students ORDER BY name ASC, id LIMIT 20 OFFSET 0');
    assert.match(santri, /students_name_idx/, santri);
    assert.doesNotMatch(santri, /\bSort\b/, santri);

    console.log(`query path index tests passed (${Object.keys(EXPECTED).length} index, rencana query memakainya)`);
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
