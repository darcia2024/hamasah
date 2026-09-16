// Smoke test untuk aplikasi yang sudah berjalan (staging atau production).
//
// Nama berkas sengaja BUKAN smoke-test.js atau smoke.test.js: node --test
// mendeteksi otomatis berkas apa pun yang berakhiran -test.js/.test.js sebagai
// file test, dan skrip ini keluar dengan exit code bukan-nol kalau env var
// wajibnya kosong — itu akan membuat `npm test` ikut gagal setiap saat.
//
// Berbeda dengan npm test: skrip ini TIDAK memakai PGlite dan TIDAK dijalankan
// otomatis. Skrip ini mengetuk API sungguhan lewat HTTP, persis seperti browser,
// untuk membuktikan alur inti benar-benar jalan di lingkungan yang sudah dideploy
// dan tersambung ke database serta object storage sungguhan.
//
// Karena itu skrip ini SELALU dijalankan manusia, tidak pernah oleh Sonnet:
// menjalankannya berarti membuat data (akun, santri, invoice, pendaftaran, berkas)
// sungguhan di lingkungan target.
//
// Pemakaian:
//   SMOKE_BASE_URL=http://127.0.0.1:4273 \
//   SMOKE_ADMIN_EMAIL=admin@hamasah.test \
//   SMOKE_ADMIN_PASSWORD=kata-sandi-admin \
//   node scripts/smoke.js
//
// Kalau akun admin itu belum ada (baru pertama kali deploy ke lingkungan ini),
// tambahkan SMOKE_BOOTSTRAP_KEY (nilai HAMASAH_BOOTSTRAP_KEY) supaya skrip
// membuatnya lebih dulu lewat POST /api/auth/bootstrap.
//
// Tidak ada nilai yang dicetak ke layar selain hasil lulus/gagal setiap langkah.

const crypto = require('node:crypto');

const BASE_URL = String(process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4273').replace(/\/+$/, '');
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || '';
const BOOTSTRAP_KEY = process.env.SMOKE_BOOTSTRAP_KEY || '';

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('SMOKE_ADMIN_EMAIL dan SMOKE_ADMIN_PASSWORD wajib diisi. Lihat komentar di atas berkas ini.');
  process.exitCode = 1;
  process.exit();
}

// PDF sungguhan (byte tanda tangan %PDF- diperiksa server), isinya fiktif.
const CONTOH_PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(128, 0x20), Buffer.from('%%EOF')]);

let langkahBerjalan = 0;
let langkahGagal = 0;

async function langkah(nama, kerjakan) {
  langkahBerjalan += 1;
  try {
    await kerjakan();
    console.log(`✔ ${nama}`);
  } catch (error) {
    langkahGagal += 1;
    console.error(`✖ ${nama}`);
    console.error(`  ${error.message}`);
    // fetch() membungkus kegagalan koneksi (server mati, salah alamat, dsb.)
    // menjadi pesan generik "fetch failed" dan menaruh detail aslinya di sini.
    // Tanpa ini, kegagalan koneksi tidak bisa dibedakan dari kegagalan lain.
    if (error.cause) {
      console.error(`  Penyebab: ${error.cause.message || error.cause}`);
    }
  }
}

function acak() {
  return crypto.randomBytes(4).toString('hex');
}

async function permintaan(method, pathname, { token, body, raw, contentType } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (raw) headers['Content-Type'] = contentType || 'application/octet-stream';
  else if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers,
    body: raw !== undefined ? raw : (body === undefined ? undefined : JSON.stringify(body))
  });

  const jenis = response.headers.get('content-type') || '';
  let isi = null;
  if (jenis.includes('application/json')) isi = await response.json();
  else if (response.status !== 204) isi = Buffer.from(await response.arrayBuffer());

  return { status: response.status, body: isi };
}

function pastikan(kondisi, pesan) {
  if (!kondisi) {
    throw new Error(pesan);
  }
}

async function masuk(email, password) {
  const hasil = await permintaan('POST', '/api/auth/login', { body: { email, password } });
  pastikan(hasil.status === 200, `Login ${email} gagal: ${JSON.stringify(hasil.body)}`);
  return hasil.body.accessToken;
}

async function main() {
  let adminToken;

  await langkah('GET /api/health membalas 200', async () => {
    const hasil = await permintaan('GET', '/api/health');
    pastikan(hasil.status === 200 && hasil.body.ok === true, `Status: ${hasil.status}`);
  });

  await langkah('GET /api/ready membalas 200 dengan database siap', async () => {
    const hasil = await permintaan('GET', '/api/ready');
    pastikan(hasil.status === 200, `Status: ${hasil.status} — ${JSON.stringify(hasil.body)}`);
    pastikan(hasil.body.database === 'siap', `database: ${hasil.body.database}`);
  });

  await langkah('Login admin berhasil (bootstrap otomatis kalau perlu)', async () => {
    try {
      adminToken = await masuk(ADMIN_EMAIL, ADMIN_PASSWORD);
      return;
    } catch (errorLoginPertama) {
      if (!BOOTSTRAP_KEY) {
        throw errorLoginPertama;
      }
    }
    const bootstrap = await permintaan('POST', '/api/auth/bootstrap', {
      token: BOOTSTRAP_KEY,
      body: { name: 'Admin Smoke Test', email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
    });
    pastikan(bootstrap.status === 201, `Bootstrap gagal: ${JSON.stringify(bootstrap.body)}`);
    adminToken = await masuk(ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  const tag = acak();
  let waliId;
  let waliLainId;
  let waliToken;
  let waliLainToken;
  let santriAkunId;

  await langkah('Membuat akun wali dan akun santri', async () => {
    const wali = await permintaan('POST', '/api/accounts', {
      token: adminToken,
      body: { name: `Wali Smoke ${tag}`, email: `wali.smoke.${tag}@hamasah.test`, role: 'parent', password: 'kata-sandi-smoke-test' }
    });
    pastikan(wali.status === 201, `Buat wali gagal: ${JSON.stringify(wali.body)}`);
    waliId = wali.body.account.id;
    waliToken = await masuk(`wali.smoke.${tag}@hamasah.test`, 'kata-sandi-smoke-test');

    const waliLain = await permintaan('POST', '/api/accounts', {
      token: adminToken,
      body: { name: `Wali Lain Smoke ${tag}`, email: `wali.lain.smoke.${tag}@hamasah.test`, role: 'parent', password: 'kata-sandi-smoke-test' }
    });
    pastikan(waliLain.status === 201, `Buat wali lain gagal: ${JSON.stringify(waliLain.body)}`);
    waliLainId = waliLain.body.account.id;
    waliLainToken = await masuk(`wali.lain.smoke.${tag}@hamasah.test`, 'kata-sandi-smoke-test');

    const santriAkun = await permintaan('POST', '/api/accounts', {
      token: adminToken,
      body: { name: `Santri Smoke ${tag}`, email: `santri.smoke.${tag}@hamasah.test`, role: 'student', password: 'kata-sandi-smoke-test' }
    });
    pastikan(santriAkun.status === 201, `Buat akun santri gagal: ${JSON.stringify(santriAkun.body)}`);
    santriAkunId = santriAkun.body.account.id;
  });

  let studentId;

  await langkah('Membuat santri dan menghubungkan akun wali', async () => {
    const santri = await permintaan('POST', '/api/students', {
      token: adminToken,
      body: { name: `Santri Smoke ${tag}`, program: 'Kuliah Al-Azhar', city: 'Kairo', joinDate: '2026-08-20' }
    });
    pastikan(santri.status === 201, `Buat santri gagal: ${JSON.stringify(santri.body)}`);
    studentId = santri.body.student.id;

    const link = await permintaan('PATCH', `/api/students/${studentId}/accounts`, {
      token: adminToken,
      body: { studentAccountId: santriAkunId, parentAccountIds: [waliId] }
    });
    pastikan(link.status === 200, `Hubungkan akun gagal: ${JSON.stringify(link.body)}`);
  });

  await langkah('Mencatat presensi dan kegiatan, tampil di dashboard', async () => {
    const presensi = await permintaan('POST', `/api/students/${studentId}/attendance`, {
      token: adminToken, body: { status: 'present', category: 'Subuh berjamaah' }
    });
    pastikan(presensi.status === 201, `Catat presensi gagal: ${JSON.stringify(presensi.body)}`);

    const kegiatan = await permintaan('POST', `/api/students/${studentId}/activities`, {
      token: adminToken, body: { title: 'Talaqqi pagi', description: 'Membaca kitab bersama pembina.' }
    });
    pastikan(kegiatan.status === 201, `Catat kegiatan gagal: ${JSON.stringify(kegiatan.body)}`);

    const dashboard = await permintaan('GET', `/api/students/${studentId}/dashboard`, { token: waliToken });
    pastikan(dashboard.status === 200, `Dashboard gagal: ${JSON.stringify(dashboard.body)}`);
    pastikan(dashboard.body.dashboard.attendance.rate === 100, `Kehadiran seharusnya 100%, dapat: ${dashboard.body.dashboard.attendance.rate}`);
  });

  await langkah('Wali lain tidak bisa membuka dashboard santri ini (403)', async () => {
    const dashboard = await permintaan('GET', `/api/students/${studentId}/dashboard`, { token: waliLainToken });
    pastikan(dashboard.status === 403, `Seharusnya 403, dapat: ${dashboard.status}`);
  });

  let courseId;
  let materialSatuId;

  await langkah('Membuat maddah dan dua materi, urutan sesuai penambahan', async () => {
    const course = await permintaan('POST', '/api/courses', {
      token: adminToken,
      body: { title: `Nahwu Smoke Test ${tag}`, description: 'Maddah untuk pengujian rilis.' }
    });
    pastikan(course.status === 201, `Buat maddah gagal: ${JSON.stringify(course.body)}`);
    courseId = course.body.course.id;

    const materiSatu = await permintaan('POST', `/api/courses/${courseId}/materials`, {
      token: adminToken,
      body: {
        type: 'text', title: 'Jumlah Ismiyyah', content: 'Isi materi.', summary: 'Rangkuman materi pertama.',
        keyPoints: ['Poin pertama.'], studyGuide: []
      }
    });
    pastikan(materiSatu.status === 201, `Tambah materi 1 gagal: ${JSON.stringify(materiSatu.body)}`);
    materialSatuId = materiSatu.body.material.id;

    const materiDua = await permintaan('POST', `/api/courses/${courseId}/materials`, {
      token: adminToken,
      body: {
        type: 'text', title: 'Jumlah Filiyyah', content: 'Isi materi.', summary: 'Rangkuman materi kedua.',
        keyPoints: ['Poin kedua.'], studyGuide: []
      }
    });
    pastikan(materiDua.status === 201, `Tambah materi 2 gagal: ${JSON.stringify(materiDua.body)}`);

    await permintaan('POST', `/api/students/${studentId}/courses/${courseId}`, { token: adminToken });
    const dilihat = await permintaan('GET', `/api/students/${studentId}/courses/${courseId}`, { token: adminToken });
    pastikan(dilihat.status === 200, `Buka maddah gagal: ${JSON.stringify(dilihat.body)}`);
    pastikan(
      dilihat.body.course.materials[0].title === 'Jumlah Ismiyyah' && dilihat.body.course.materials[1].title === 'Jumlah Filiyyah',
      `Urutan materi salah: ${dilihat.body.course.materials.map((materi) => materi.title).join(', ')}`
    );
  });

  let invoiceId;

  await langkah('Membuat invoice dan menandainya lunas, nomor sesuai format', async () => {
    const invoice = await permintaan('POST', '/api/operations/invoices', {
      token: adminToken,
      body: { studentId, description: `SPP smoke test ${tag}`, amount: 1500000 }
    });
    pastikan(invoice.status === 201, `Buat invoice gagal: ${JSON.stringify(invoice.body)}`);
    invoiceId = invoice.body.invoice.id;
    pastikan(/^INV\/HI\/\d{4}\/\d{5}$/.test(invoice.body.invoice.number), `Format nomor invoice salah: ${invoice.body.invoice.number}`);

    const lunas = await permintaan('PATCH', `/api/operations/invoices/${invoiceId}/paid`, { token: adminToken });
    pastikan(lunas.status === 200, `Tandai lunas gagal: ${JSON.stringify(lunas.body)}`);
    pastikan(/^KWT\/HI\/\d{4}\/\d{5}$/.test(lunas.body.invoice.receiptNumber), `Format nomor kuitansi salah: ${lunas.body.invoice.receiptNumber}`);
  });

  await langkah('Menandai lunas dua kali tidak membuat nomor kuitansi kedua', async () => {
    const kedua = await permintaan('PATCH', `/api/operations/invoices/${invoiceId}/paid`, { token: adminToken });
    pastikan(kedua.status === 200, `Status seharusnya 200: ${JSON.stringify(kedua.body)}`);
    const invoice = await permintaan('GET', '/api/operations', { token: adminToken });
    const cocok = invoice.body.invoices.filter((item) => item.id === invoiceId);
    pastikan(cocok.length === 1, 'Invoice seharusnya hanya satu baris.');
  });

  let registrationId;
  let registrationToken;

  await langkah('Mengirim pendaftaran publik dan mengubah statusnya', async () => {
    const daftar = await permintaan('POST', '/api/registrations', {
      body: {
        applicantName: `Calon Smoke Test ${tag}`, phone: '081234567890', guardianName: 'Wali Calon',
        guardianPhone: '081298765432', program: 'kuliah-al-azhar', educationLevel: 'SMA', city: 'Bandung', consent: true
      }
    });
    pastikan(daftar.status === 201, `Kirim pendaftaran gagal: ${JSON.stringify(daftar.body)}`);
    registrationId = daftar.body.registration.registrationId;
    registrationToken = daftar.body.accessToken;

    const ubah = await permintaan('PATCH', `/api/registrations/${registrationId}/status`, {
      token: adminToken, body: { status: 'document-review', note: 'Berkas mulai diperiksa (smoke test).' }
    });
    pastikan(ubah.status === 200, `Ubah status gagal: ${JSON.stringify(ubah.body)}`);
  });

  await langkah('Mengunggah dan mengunduh dokumen pendaftaran (bukti storage sungguhan)', async () => {
    const minta = await permintaan('POST', '/api/uploads', {
      token: registrationToken,
      body: {
        purpose: 'registration-document', entityId: registrationId,
        fileName: 'paspor-smoke-test.pdf', contentType: 'application/pdf', size: CONTOH_PDF.length
      }
    });
    pastikan(minta.status === 201, `Minta tempat unggah gagal: ${JSON.stringify(minta.body)}`);
    const fileId = minta.body.upload.id;

    const kirim = await permintaan('PUT', `/api/uploads/${fileId}/content`, {
      token: registrationToken, raw: CONTOH_PDF, contentType: 'application/pdf'
    });
    pastikan(kirim.status === 200, `Kirim isi berkas gagal: ${JSON.stringify(kirim.body)}`);

    const unduh = await permintaan('GET', `/api/files/${fileId}`, { token: registrationToken });
    // Driver supabase membalas 302 (redirect ke signed URL); driver local membalas 200 langsung.
    if (unduh.status === 302) {
      pastikan(true, 'Redirect ke signed URL diterima (driver supabase).');
    } else {
      pastikan(unduh.status === 200, `Unduh berkas gagal: ${JSON.stringify(unduh.body)}`);
      pastikan(Buffer.isBuffer(unduh.body) && unduh.body.equals(CONTOH_PDF), 'Isi berkas yang diunduh tidak sama dengan yang diunggah.');
    }
  });

  console.log('');
  console.log(`${langkahBerjalan - langkahGagal}/${langkahBerjalan} langkah lulus.`);
  if (langkahGagal > 0) {
    console.log('Ada langkah yang gagal. Jangan lanjutkan ke migrasi production sebelum ini diperbaiki.');
    process.exitCode = 1;
  } else {
    console.log('Semua langkah lulus.');
  }
}

main().catch((error) => {
  console.error('Smoke test berhenti karena error tak terduga:', error.message);
  process.exitCode = 1;
});
