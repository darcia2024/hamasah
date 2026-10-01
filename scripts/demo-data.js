'use strict';
// Data demo yang terasa seperti data sungguhan, supaya pemilik bisa membayangkan
// aplikasi saat sudah dipakai: akun staf, wali, dan santri; asrama; santri dengan
// presensi, sholat, hafalan, kesehatan, dan catatan pembinaan; tagihan dan kuitansi;
// visa; inventaris; pendaftar di setiap tahap; kloter; pesan konsultasi; serta maddah
// LMS lengkap dengan progres belajar. Semua data masuk lewat service aplikasi, jadi
// aturan validasi dan hak akses yang sama ikut berlaku.
//
// Semua orang, nomor, dan catatan di sini fiktif. Penandanya:
//   - email akun dan pendaftar berakhiran @demo.hamasah.test (domain .test tidak
//     pernah bisa menerima email),
//   - nomor WhatsApp berawalan 0800-0000, bukan nomor seluler, jadi tombol WhatsApp
//     di konsol tidak akan menghubungi orang sungguhan,
//   - nama santri, asrama, inventaris, dan maddah dari daftar di skrip ini.
// Akun admin TIDAK dibuat dan tidak disentuh.
//
// Di laptop (hentikan preview dulu: database lokal hanya boleh dibuka satu proses):
//   npm run demo:isi                                  mengisi data demo
//   npm run demo:hapus                                laporan saja, tidak menghapus
//   CONFIRM_DELETE=I_UNDERSTAND npm run demo:hapus    menghapus semua data demo
//   npm run demo:isi -- --sandi-baru                  kata sandi dan kode akses baru
//
// Ke database production, dari terminal yang sama (lihat RUNBOOK.md):
//   APP_ENV=production ALLOW_PRODUCTION_WRITE=I_UNDERSTAND DATABASE_URL=... node scripts/demo-data.js
//
// Akun demo adalah akun sungguhan dengan hak sesuai perannya (petugas melihat semua
// pendaftar, keuangan melihat semua tagihan). Karena itu kata sandinya di production
// dibuat acak, hanya dicetak sekali di terminal, dan tidak pernah ditulis di repo.
// Hapus data demo sebelum aplikasi dipakai untuk data sungguhan.

const crypto = require('node:crypto');
const path = require('node:path');
const identity = require('../server/identity-service.js');
const registrationServiceModule = require('../server/registration-service.js');
const { createDatabase } = require('../server/db.js');
const { assertDatabaseWriteAllowed } = require('../server/environment.js');
const { createAccessCode } = require('../server/applicant-service.js');
const { hashToken } = require('../server/http/auth.js');
const { createPostgresAccountStore } = require('../server/postgres-account-store.js');
const { createPostgresRegistrationStore } = require('../server/postgres-registration-store.js');
const { createPostgresDepartureStore } = require('../server/postgres-departure-store.js');
const { createDepartureService } = require('../server/departure-service.js');
const { createPostgresDormitoryStore } = require('../server/postgres-dormitory-store.js');
const { createDormitoryService } = require('../server/dormitory-service.js');
const { createPostgresStudentStore } = require('../server/postgres-student-store.js');
const { createStudentPortalService } = require('../server/student-portal-service.js');
const { createPostgresStudentCareStore } = require('../server/postgres-student-care-store.js');
const { createStudentCareService } = require('../server/student-care-service.js');
const { createPostgresOperationsStore } = require('../server/postgres-operations-store.js');
const { createOperationsService } = require('../server/operations-service.js');
const { createPostgresLmsStore } = require('../server/postgres-lms-store.js');
const { createLmsService } = require('../server/lms-service.js');
const { createPostgresInquiryStore } = require('../server/postgres-inquiry-store.js');

const DEMO_DOMAIN = 'demo.hamasah.test';
const DEMO_EMAIL_PATTERN = `%@${DEMO_DOMAIN}`;
const DEMO_PHONE_PREFIX = '+62800000';
const LOCAL_DATABASE_URL = `pglite:${path.join(__dirname, '..', 'data', 'dev-db')}`;
const LOCAL_DEMO_PASSWORD = 'kata-sandi-demo-hamasah';
const CONFIRM_DELETE = 'I_UNDERSTAND';
const HARI_MS = 24 * 60 * 60 * 1000;
const ROLES = identity.ROLES;

// Angkatan santri, dalam hari sejak bergabung. Semua tanggal dihitung mundur dari
// hari skrip dijalankan, jadi data selalu terlihat baru.
const BARU = 38;
const LAMA = 402;
const SENIOR = 767;

function email(lokal) {
  return `${lokal}@${DEMO_DOMAIN}`;
}

function telepon(nomor) {
  return `${DEMO_PHONE_PREFIX}${String(nomor).padStart(4, '0')}`;
}

const DEMO_ACCOUNTS = Object.freeze([
  { key: 'petugas', name: 'Nurul Hidayati', email: email('petugas'), role: ROLES.REGISTRATION_OFFICER, peran: 'Petugas pendaftaran', dibuat: 95 },
  { key: 'musyrif', name: 'Ust. Hanif Mubarok', email: email('musyrif'), role: ROLES.SUPERVISOR, peran: 'Musyrif Asrama Putra Al-Fath', dibuat: 95 },
  { key: 'musyrifah', name: 'Ustzh. Salma Nurjannah', email: email('musyrifah'), role: ROLES.SUPERVISOR, peran: 'Musyrifah Asrama Putri Az-Zahra', dibuat: 95 },
  { key: 'guru', name: 'Ust. Ridwan Fathoni', email: email('guru'), role: ROLES.TEACHER, peran: 'Guru maddah', dibuat: 90 },
  { key: 'keuangan', name: 'Dewi Anggraini', email: email('keuangan'), role: ROLES.FINANCE, peran: 'Bagian keuangan', dibuat: 95 },
  { key: 'wali', name: 'Bambang Sutrisno Wibowo', email: email('wali'), role: ROLES.PARENT, peran: 'Wali Rayhan dan Nayla', dibuat: 70 },
  { key: 'wali2', name: 'Siti Maesaroh', email: email('wali2'), role: ROLES.PARENT, peran: 'Wali Muhammad Hafizh', dibuat: 40 },
  { key: 'santri', name: 'Rayhan Akbar Wibowo', email: email('santri'), role: ROLES.STUDENT, peran: 'Santri Kuliah, tahun kedua', dibuat: 70 },
  { key: 'santri2', name: 'Nayla Husna Wibowo', email: email('santri2'), role: ROLES.STUDENT, peran: "Santri Ma'had, angkatan baru", dibuat: 37 }
]);

const DEMO_DORMITORIES = Object.freeze([
  { key: 'putra', name: 'Asrama Putra Al-Fath', area: 'Hay Asyir, Madinat Nasr', gender: 'putra', capacity: 24, pembina: 'musyrif' },
  { key: 'putri', name: 'Asrama Putri Az-Zahra', area: 'Hay Sabi, Madinat Nasr', gender: 'putri', capacity: 16, pembina: 'musyrifah' }
]);

const DEMO_STUDENTS = Object.freeze([
  { key: 'rayhan', name: 'Rayhan Akbar Wibowo', gender: 'putra', jalur: 'kuliah', program: 'Kuliah S1 Al-Azhar (Ushuluddin)', bergabung: LAMA, asal: 'Semarang', akun: 'santri', wali: ['wali'] },
  { key: 'hafizh', name: 'Muhammad Hafizh Ramadhan', gender: 'putra', jalur: 'mahad', program: "Ma'had Al-Azhar (I'dadi)", bergabung: BARU, asal: 'Cirebon', wali: ['wali2'] },
  { key: 'zaki', name: 'Ahmad Zaki Mubarak', gender: 'putra', jalur: 'kuliah', program: 'Kuliah S1 Al-Azhar (Syariah wal Qanun)', bergabung: LAMA, asal: 'Padang' },
  { key: 'fikri', name: 'Fikri Haidar Alfarizi', gender: 'putra', jalur: 'kuliah', program: 'Kuliah S1 Al-Azhar (Bahasa Arab)', bergabung: BARU, asal: 'Bekasi', pendaftaran: 'fikri' },
  { key: 'naufal', name: 'Naufal Abid Pratama', gender: 'putra', jalur: 'mahad', program: "Ma'had Al-Azhar (Tsanawi)", bergabung: BARU, asal: 'Tasikmalaya', pendaftaran: 'naufal' },
  { key: 'ilham', name: 'Ilham Syauqi Nugraha', gender: 'putra', jalur: 'kuliah', program: 'Kuliah S1 Al-Azhar (Ushuluddin)', bergabung: SENIOR, asal: 'Garut' },
  { key: 'daffa', name: 'Daffa Rasyid Hidayat', gender: 'putra', jalur: 'mahad', program: "Ma'had Al-Azhar (Tsanawi)", bergabung: LAMA, asal: 'Bandar Lampung' },
  { key: 'nayla', name: 'Nayla Husna Wibowo', gender: 'putri', jalur: 'mahad', program: "Ma'had Al-Azhar (Tsanawi)", bergabung: BARU, asal: 'Semarang', akun: 'santri2', wali: ['wali'] },
  { key: 'aisyah', name: 'Aisyah Qonita Rahma', gender: 'putri', jalur: 'kuliah', program: 'Kuliah S1 Al-Azhar (Dirasat Islamiyah)', bergabung: LAMA, asal: 'Banjarmasin' },
  { key: 'khansa', name: 'Khansa Mumtaza Azkiya', gender: 'putri', jalur: 'kuliah', program: 'Kuliah S1 Al-Azhar (Bahasa Arab)', bergabung: BARU, asal: 'Malang' },
  { key: 'shafiyyah', name: 'Shafiyyah Nur Aini', gender: 'putri', jalur: 'mahad', program: "Ma'had Al-Azhar (I'dadi)", bergabung: BARU, asal: 'Pekanbaru' },
  { key: 'hana', name: 'Hana Salsabila Firdaus', gender: 'putri', jalur: 'kuliah', program: 'Kuliah S1 Al-Azhar (Syariah wal Qanun)', bergabung: SENIOR, asal: 'Mataram' }
]);

// Catatan pembinaan khusus per santri, di luar presensi, sholat, dan hafalan harian.
const CATATAN_SANTRI = Object.freeze({
  rayhan: {
    prestasi: [{ hari: 21, title: 'Khatam hafalan Juz 30', description: 'Menyelesaikan setoran Juz 30 dengan predikat lancar di hadapan musyrif.' }],
    evaluasi: [
      { hari: 16, area: 'Akademik', note: "Kehadiran kuliah stabil. Perlu menambah jam muraja'ah mata kuliah Tafsir menjelang ujian termin." },
      { hari: 4, area: 'Kemandirian', note: 'Sudah bisa mengatur uang saku bulanan sendiri dan rutin melapor ke musyrif.' }
    ]
  },
  hafizh: {
    evaluasi: [{ hari: 9, area: 'Adaptasi', note: 'Masih menyesuaikan diri dengan cuaca dan makanan di Kairo. Mulai akrab dengan teman sekamar.' }],
    kesehatan: [
      { hari: 5, condition: 'sakit-ringan', complaint: 'Demam dan pilek setelah perubahan cuaca.', actionTaken: 'Diberi obat penurun panas, istirahat di kamar, dan dipantau musyrif setiap malam.', parentNote: 'Ananda sempat demam ringan dan sudah ditangani. Mohon doanya.' },
      { hari: 3, condition: 'sehat', complaint: 'Pemeriksaan ulang setelah demam.', actionTaken: 'Suhu normal, kembali mengikuti kegiatan.', parentNote: 'Alhamdulillah ananda sudah sehat dan kembali ikut kegiatan.' }
    ]
  },
  zaki: {
    prestasi: [{ hari: 30, title: 'Lulus tes penempatan bahasa Arab tingkat Mutawassith', description: 'Langsung masuk kelas menengah di markaz bahasa.' }],
    evaluasi: [{ hari: 11, area: 'Akhlak', note: 'Ringan tangan membantu santri baru mengurus berkas iqamah.' }],
    pelanggaran: [{ hari: 8, level: 'ringan', note: 'Memakai dapur di luar jadwal piket dan tidak membersihkannya kembali.' }]
  },
  fikri: {
    evaluasi: [{ hari: 10, area: 'Akademik', note: 'Aktif bertanya di kelas talaqqi. Perlu memperbaiki tulisan tangan Arab untuk ujian tulis.' }]
  },
  naufal: {
    evaluasi: [{ hari: 12, area: 'Ibadah', note: 'Sholat berjamaah tepat waktu. Pekan pertama masih perlu dibangunkan untuk Subuh.' }]
  },
  ilham: {
    prestasi: [{ hari: 45, title: 'Lulus ujian termin dengan predikat Jayyid Jiddan', description: 'Naik ke tingkat tiga Fakultas Ushuluddin tanpa mata kuliah mengulang.' }],
    evaluasi: [{ hari: 7, area: 'Kepemimpinan', note: 'Dipercaya menjadi ketua kamar dan membimbing santri baru belajar Nahwu.' }],
    kesehatan: [{ hari: 11, condition: 'dirujuk', complaint: 'Sakit gigi karena geraham berlubang.', actionTaken: 'Dirujuk ke dokter gigi di Hay Asyir ditemani musyrif. Gigi ditambal dan diberi obat.', parentNote: 'Ananda sudah diperiksa dokter gigi dan giginya ditambal. Tidak perlu tindakan lanjutan.' }]
  },
  daffa: {
    evaluasi: [{ hari: 6, area: 'Kedisiplinan', note: 'Masih sering terlambat kembali ke asrama. Sudah dibuat kesepakatan jam pulang bersama musyrif.' }],
    pelanggaran: [{ hari: 9, level: 'ringan', note: 'Terlambat kembali ke asrama 40 menit setelah jam malam tanpa memberi kabar.' }],
    kesehatan: [{ hari: 2, condition: 'perlu-perhatian', complaint: 'Nyeri lambung kambuh karena sering telat makan.', actionTaken: 'Diperiksa di klinik dekat asrama dan diberi obat lambung. Jadwal makan dipantau musyrif.', parentNote: 'Maag ananda kambuh, sudah diperiksa dan diberi obat. Jadwal makannya kami pantau.' }]
  },
  nayla: {
    prestasi: [{ hari: 4, title: 'Setoran pertama Juz 29 tanpa kesalahan', description: 'Setoran QS. Al-Mulk 1-15 lancar di halaqah sore.' }],
    evaluasi: [{ hari: 8, area: 'Adaptasi', note: 'Cepat beradaptasi dan rajin mengikuti halaqah hafalan sore.' }]
  },
  aisyah: {
    prestasi: [{ hari: 18, title: 'Menyelesaikan hafalan Juz 29', description: 'Lulus ujian hafalan Juz 29 di hadapan musyrifah dengan predikat lancar.' }],
    evaluasi: [{ hari: 12, area: 'Akademik', note: 'Nilai ujian lisan bahasa Arab sangat baik. Disarankan ikut kelas khitabah.' }]
  },
  khansa: {
    evaluasi: [{ hari: 10, area: 'Adaptasi', note: 'Masih canggung berbicara bahasa Arab di kelas. Dipasangkan dengan kakak tingkat untuk latihan percakapan.' }],
    kesehatan: [{ hari: 6, condition: 'sakit-ringan', complaint: 'Batuk dan radang tenggorokan.', actionTaken: 'Minum obat batuk dan air hangat, istirahat dari kegiatan sore.', parentNote: 'Ananda batuk ringan, sudah minum obat dan mulai membaik.' }]
  },
  shafiyyah: {
    evaluasi: [{ hari: 9, area: 'Ibadah', note: "Tilawah harian rutin. Perlu bimbingan makhraj untuk huruf 'ain dan ha." }]
  },
  hana: {
    prestasi: [{ hari: 25, title: 'Juara 2 lomba pidato bahasa Arab antar asrama', description: 'Membawakan tema adab penuntut ilmu di hadapan dewan juri.' }],
    evaluasi: [{ hari: 5, area: 'Kepemimpinan', note: 'Membimbing santri putri baru mengenal rute kampus dan jadwal talaqqi.' }]
  }
});

const KEGIATAN_BERSAMA = Object.freeze([
  { hari: 35, untuk: 'baru', title: 'Orientasi kampus Al-Azhar', description: 'Pengenalan gedung kuliah, perpustakaan, dan jadwal talaqqi di Masjid Al-Azhar.' },
  { hari: 20, untuk: 'semua', title: 'Rihlah ilmiah ke Masjid Amr bin Ash', description: 'Mengenal sejarah salah satu masjid tertua di Mesir bersama musyrif.' },
  { hari: 13, untuk: 'semua', title: 'Kerja bakti asrama', description: 'Membersihkan dapur, ruang belajar, dan tangga asrama bersama.' },
  { hari: 6, untuk: 'semua', title: 'Kajian pekanan bersama musyrif', description: 'Tema adab penuntut ilmu dan mengatur waktu antara kuliah, talaqqi, dan hafalan.' },
  { hari: 3, untuk: 'semua', title: 'Talaqqi Matan Al-Ajurrumiyyah', description: 'Mengikuti majelis talaqqi setelah Subuh di Masjid Al-Azhar dan mencatat syarah guru.' }
]);

const ZIYADAH = Object.freeze({
  mahad: ['QS. Al-Mulk 1-15', 'QS. Al-Mulk 16-30', 'QS. Al-Qalam 1-25', 'QS. Al-Qalam 26-52', 'QS. Al-Haqqah 1-24', 'QS. Al-Haqqah 25-52', "QS. Al-Ma'arij 1-21", "QS. Al-Ma'arij 22-44", 'QS. Nuh 1-14', 'QS. Nuh 15-28', 'QS. Al-Jinn 1-14', 'QS. Al-Jinn 15-28'],
  kuliah: ['QS. Al-Baqarah 1-16', 'QS. Al-Baqarah 17-29', 'QS. Al-Baqarah 30-39', 'QS. Al-Baqarah 40-52', 'QS. Al-Baqarah 53-61', 'QS. Al-Baqarah 62-74', 'QS. Al-Baqarah 75-86', 'QS. Al-Baqarah 87-101', 'QS. Al-Baqarah 102-112', 'QS. Al-Baqarah 113-126']
});
const MURAJAAH = Object.freeze([
  'Juz 30 (An-Naba sampai Al-Infithar)', 'Juz 30 (Al-Muthaffifin sampai Al-Fajr)', 'Juz 30 (Al-Balad sampai An-Nas)',
  "Juz 29 (Al-Mulk sampai Al-Ma'arij)", 'Juz 29 (Nuh sampai Al-Mursalat)', 'Juz 1 (Al-Fatihah sampai Al-Baqarah 74)'
]);

// Pendaftar di setiap tahap. Peristiwa ditulis berurutan dari yang paling lama.
// status: pindah tahap; catatan: catatan internal atau untuk pendaftar; langkah:
// tindak lanjut dengan tenggat sekian hari dari hari ini.
const DEMO_REGISTRATIONS = Object.freeze([
  {
    key: 'fikri', applicantName: 'Fikri Haidar Alfarizi', program: 'kuliah-al-azhar', gender: 'putra', umur: 19, city: 'Bekasi',
    schoolOrigin: 'MA Miftahul Ulum Bekasi', educationLevel: 'MA', guardianName: 'Hadi Alfarizi', referralSource: 'Instagram', dibuat: 130, jam: '10:12', kloter: 'lalu',
    peristiwa: [
      { hari: 127, status: 'document-review', note: 'Berkas awal diterima dan mulai diperiksa.' },
      { hari: 118, status: 'academic-preparation', note: 'Paspor, ijazah, dan surat sehat lengkap.' },
      { hari: 118, catatan: 'applicant', body: 'Berkas Anda lengkap. Jadwal tes bahasa Arab kami kirim lewat WhatsApp.' },
      { hari: 60, status: 'ready-for-departure', note: 'Lulus tes bahasa Arab dan visa pelajar terbit.' },
      { hari: 39, status: 'completed', note: 'Berangkat bersama kloter Agustus dan tiba di Kairo.' }
    ]
  },
  {
    key: 'naufal', applicantName: 'Naufal Abid Pratama', program: 'mahad-al-azhar', gender: 'putra', umur: 16, city: 'Tasikmalaya',
    schoolOrigin: 'Pondok Pesantren Al-Ikhlas Tasikmalaya', educationLevel: 'MTs', guardianName: 'Ujang Saepudin', referralSource: 'Teman atau keluarga', dibuat: 126, jam: '13:40', kloter: 'lalu',
    peristiwa: [
      { hari: 124, status: 'document-review', note: 'Berkas diterima.' },
      { hari: 115, status: 'academic-preparation', note: 'Berkas lengkap, menunggu tes.' },
      { hari: 58, status: 'ready-for-departure', note: 'Visa pelajar terbit dan tiket diterbitkan.' },
      { hari: 39, status: 'completed', note: 'Tiba di Kairo bersama kloter Agustus.' }
    ]
  },
  {
    key: 'hamzah', applicantName: 'Hamzah Abdul Aziz', program: 'kuliah-al-azhar', gender: 'putra', umur: 18, city: 'Bogor',
    schoolOrigin: 'MA Al-Falah Bogor', educationLevel: 'MA', guardianName: 'Abdul Aziz Syarif', referralSource: 'YouTube', dibuat: 58, jam: '08:55', kloter: 'dekat',
    peristiwa: [
      { hari: 55, status: 'document-review', note: 'Berkas mulai diperiksa.' },
      { hari: 47, status: 'academic-preparation', note: 'Berkas lengkap dan sah.' },
      { hari: 12, status: 'ready-for-departure', note: 'Visa pelajar terbit dan tiket sudah diterbitkan.' },
      { hari: 11, catatan: 'applicant', body: 'Tiket sudah terbit. Mohon hadir di Terminal 3 Bandara Soekarno-Hatta empat jam sebelum keberangkatan.' },
      { hari: 11, langkah: 'Serahkan paspor asli untuk pengecekan akhir', tenggat: 7 }
    ]
  },
  {
    key: 'nabila', applicantName: 'Nabila Azzahra Putri', program: 'mahad-al-azhar', gender: 'putri', umur: 15, city: 'Depok',
    schoolOrigin: 'SMP IT Al-Hidayah Depok', educationLevel: 'SMP', guardianName: 'Yuliana Pertiwi', referralSource: 'Instagram', dibuat: 54, jam: '19:22', kloter: 'dekat',
    peristiwa: [
      { hari: 50, status: 'document-review', note: 'Berkas mulai diperiksa.' },
      { hari: 49, status: 'needs-revision', note: 'Surat sehat belum memuat hasil tes darah.' },
      { hari: 49, catatan: 'applicant', body: 'Surat keterangan sehat belum memuat hasil tes darah. Mohon unggah ulang surat dari klinik atau laboratorium yang mencantumkan hasil pemeriksaan darah.' },
      { hari: 44, status: 'document-review', note: 'Surat sehat revisi diterima.' },
      { hari: 40, status: 'academic-preparation', note: 'Berkas lengkap.' },
      { hari: 10, status: 'ready-for-departure', note: 'Visa pelajar terbit.' },
      { hari: 10, langkah: 'Pelunasan biaya keberangkatan', tenggat: 5 }
    ]
  },
  {
    key: 'dimas', applicantName: 'Dimas Prasetyo Nugroho', program: 'kuliah-al-azhar', gender: 'putra', umur: 18, city: 'Semarang',
    schoolOrigin: 'MA Darul Falah Semarang', educationLevel: 'MA', guardianName: 'Sugeng Prasetyo', referralSource: 'Google', dibuat: 41, jam: '15:03',
    peristiwa: [
      { hari: 38, status: 'document-review', note: 'Berkas mulai diperiksa.' },
      { hari: 31, catatan: 'internal', body: 'Calon mengabarkan diterima di kampus dalam negeri dan memilih mundur. Sudah dikonfirmasi wali lewat telepon.' },
      { hari: 30, status: 'cancelled', note: 'Mengundurkan diri atas permintaan calon dan wali.' }
    ]
  },
  {
    key: 'syifa', applicantName: 'Syifa Aulia Rahmah', program: 'mahad-al-azhar', gender: 'putri', umur: 14, city: 'Palembang',
    schoolOrigin: 'MTs Nurul Iman Palembang', educationLevel: 'MTs', guardianName: 'Rahmat Hidayat', referralSource: 'Teman atau keluarga', dibuat: 33, jam: '11:18', kloter: 'nanti',
    peristiwa: [
      { hari: 31, status: 'document-review', note: 'Berkas mulai diperiksa.' },
      { hari: 26, status: 'academic-preparation', note: 'Berkas lengkap.' },
      { hari: 26, langkah: 'Pembuatan paspor di Kantor Imigrasi Palembang', tenggat: 6 },
      { hari: 26, langkah: 'Tes kesehatan dengan pemeriksaan darah', tenggat: 10 }
    ]
  },
  {
    key: 'farhan', applicantName: 'Farhan Adzkiya Yusuf', program: 'kuliah-al-azhar', gender: 'putra', umur: 19, city: 'Yogyakarta',
    schoolOrigin: 'MA Al-Mumtaz Yogyakarta', educationLevel: 'MA', guardianName: 'Yusuf Prasetyo', referralSource: 'Alumni Hamasah', dibuat: 28, jam: '09:47', kloter: 'nanti',
    peristiwa: [
      { hari: 25, status: 'document-review', note: 'Berkas mulai diperiksa.' },
      { hari: 21, status: 'academic-preparation', note: 'Berkas lengkap dan sah.' },
      { hari: 21, catatan: 'applicant', body: 'Berkas Anda lengkap. Jadwal tes bahasa Arab online kami kirim lewat WhatsApp.' },
      { hari: 21, langkah: 'Tes bahasa Arab online', tenggat: 5 },
      { hari: 20, langkah: 'Legalisir ijazah di Kemenag dan Kemenlu', tenggat: 12 }
    ]
  },
  {
    key: 'annisa', applicantName: 'Annisa Rahmadani', program: 'mahad-al-azhar', gender: 'putri', umur: 16, city: 'Makassar',
    schoolOrigin: 'MTs Al-Ikhlas Makassar', educationLevel: 'MTs', guardianName: 'Andi Rahman', referralSource: 'Instagram', dibuat: 16, jam: '20:31',
    peristiwa: [
      { hari: 13, status: 'document-review', note: 'Berkas mulai diperiksa.' },
      { hari: 12, status: 'needs-revision', note: 'Scan paspor buram.' },
      { hari: 12, catatan: 'applicant', body: 'Scan paspor buram dan halaman identitas terpotong. Mohon unggah ulang scan paspor yang jelas dan utuh.' }
    ]
  },
  {
    key: 'rizky', applicantName: 'Rizky Maulana Akbar', program: 'kuliah-al-azhar', gender: 'putra', umur: 18, city: 'Medan',
    schoolOrigin: 'MA Al-Washliyah Medan', educationLevel: 'MA', guardianName: 'Syahrial Nasution', referralSource: 'YouTube', dibuat: 10, jam: '16:08',
    peristiwa: [
      { hari: 8, status: 'document-review', note: 'Berkas mulai diperiksa.' },
      { hari: 8, catatan: 'internal', body: 'Ijazah masih berupa SKL, ijazah asli menyusul Desember. Tetap diproses sambil menunggu.' },
      { hari: 8, langkah: 'Periksa transkrip nilai dan SKL', tenggat: 2 }
    ]
  },
  {
    key: 'laras', applicantName: 'Laras Wening Pambudi', program: 'hamasah-courses', gender: 'putri', umur: 24, city: 'Surakarta',
    schoolOrigin: 'S1 Pendidikan Guru Sekolah Dasar', educationLevel: 'S1', referralSource: 'Instagram', dibuat: 6, jam: '21:15',
    peristiwa: [
      { hari: 5, catatan: 'internal', body: 'Minat kelas bahasa Arab tingkat dasar, meminta jadwal malam hari karena bekerja.' }
    ]
  },
  {
    key: 'zahira', applicantName: 'Zahira Putri Maharani', program: 'mahad-al-azhar', gender: 'putri', umur: 15, city: 'Surabaya',
    schoolOrigin: 'SMP IT Al-Ummah Surabaya', educationLevel: 'SMP', guardianName: 'Hartono Wicaksono', referralSource: 'Teman atau keluarga', dibuat: 3, jam: '10:05',
    peristiwa: [
      { hari: 2, catatan: 'internal', body: 'Wali menanyakan jadwal tes lewat WhatsApp, sudah dijelaskan alurnya.' }
    ]
  },
  {
    key: 'alif', applicantName: 'Muhammad Alif Firdaus', program: 'kuliah-al-azhar', gender: 'putra', umur: 18, city: 'Bandung',
    schoolOrigin: 'MA Daarul Hikmah Bandung', educationLevel: 'MA', guardianName: 'Firdaus Hakim', referralSource: 'Instagram', dibuat: 1, jam: '19:40',
    peristiwa: []
  }
]);

// Kloter: hari positif berarti sekian hari lalu, negatif berarti mendatang.
const DEMO_KLOTER = Object.freeze([
  { key: 'lalu', hari: 39, status: 'departed', dibuat: 75, origin: 'Bandara Soekarno-Hatta (CGK) Terminal 3', applicantNote: 'Rombongan sudah tiba di Kairo dengan selamat. Terima kasih atas doa Bapak dan Ibu.' },
  { key: 'dekat', hari: -17, status: 'confirmed', dibuat: 22, origin: 'Bandara Soekarno-Hatta (CGK) Terminal 3', applicantNote: 'Kumpul di Terminal 3 pukul 14.00 WIB. Bawa paspor asli, fotokopi ijazah, dan obat pribadi secukupnya.' },
  { key: 'nanti', hari: -100, status: 'planned', dibuat: 15, origin: 'Bandara Soekarno-Hatta (CGK)', applicantNote: 'Tanggal masih rencana dan akan dipastikan setelah visa terbit.' }
]);

const DEMO_INQUIRIES = Object.freeze([
  { name: 'Rafi Ardiansyah', topic: 'lainnya', jamLalu: 3, status: 'new', message: 'Apakah Hamasah membantu pengurusan legalisir ijazah ke Kemenag dan Kemenlu sebelum berangkat?' },
  { name: 'Rina Marlina', topic: 'biaya', hari: 1, jam: '20:14', status: 'new', message: "Assalamualaikum, apakah biaya Ma'had bisa dicicil? Anak saya baru lulus SMP tahun ini." },
  { name: 'Agus Setiawan', topic: 'asrama', hari: 2, jam: '09:32', status: 'new', message: 'Asrama putra di Kairo jaraknya berapa jauh dari kampus Al-Azhar? Apakah sudah termasuk makan?' },
  { name: 'Yusuf Alfarisi', topic: 'kuliah', hari: 4, jam: '16:05', status: 'contacted', ditangani: 3, message: 'Saya lulusan MA jurusan IPA, apakah bisa mendaftar Fakultas Ushuluddin? Kapan jadwal tes masuknya?' },
  { name: 'Wulandari', topic: 'mahad', hari: 6, jam: '11:20', status: 'contacted', ditangani: 5, message: "Usia anak saya 13 tahun, apakah sudah bisa daftar Ma'had? Persyaratan kesehatannya apa saja?" },
  { name: 'Fatimah Azzahra Lubis', topic: 'courses', hari: 9, jam: '21:47', status: 'closed', ditangani: 8, message: 'Apakah kelas bahasa Arab online ada jadwal malam? Saya bekerja sampai sore.' },
  { name: 'Haris Munandar', topic: 'biaya', hari: 12, jam: '07:58', status: 'closed', ditangani: 11, message: 'Untuk DP pemberkasan kuliah Rp 4,5 juta, apakah boleh ditransfer dua kali?' }
]);

const DEMO_INVENTORY = Object.freeze([
  { name: 'Kasur busa 90x200 cm', location: 'Asrama Putra Al-Fath', awal: 18, hari: 90, mutasi: [{ hari: 42, direction: 'in', quantity: 6, reason: 'Pembelian untuk santri baru angkatan Agustus' }, { hari: 15, direction: 'out', quantity: 1, reason: 'Sobek dan kempis, diganti baru' }] },
  { name: 'Lemari pakaian dua pintu', location: 'Asrama Putra Al-Fath', awal: 12, hari: 90, mutasi: [] },
  { name: 'Kipas angin berdiri', location: 'Asrama Putra Al-Fath', awal: 10, hari: 90, mutasi: [{ hari: 9, direction: 'out', quantity: 1, reason: 'Motor kipas rusak, dibawa ke tempat servis' }] },
  { name: 'Galon air mineral 19 liter', location: 'Asrama Putra Al-Fath', awal: 20, hari: 30, mutasi: [{ hari: 7, direction: 'out', quantity: 8, reason: 'Pemakaian pekan ini' }, { hari: 2, direction: 'in', quantity: 10, reason: 'Isi ulang dari depot langganan' }] },
  { name: 'Kasur busa 90x200 cm', location: 'Asrama Putri Az-Zahra', awal: 12, hari: 90, mutasi: [{ hari: 42, direction: 'in', quantity: 4, reason: 'Pembelian untuk santri baru angkatan Agustus' }] },
  { name: 'Lemari pakaian dua pintu', location: 'Asrama Putri Az-Zahra', awal: 8, hari: 90, mutasi: [] },
  { name: 'Setrika listrik', location: 'Asrama Putri Az-Zahra', awal: 3, hari: 90, mutasi: [{ hari: 5, direction: 'correction', quantity: 1, delta: -1, reason: 'Hasil cek bulanan: satu unit tidak ditemukan' }] },
  { name: 'Mushaf Al-Quran rasm Utsmani', location: 'Kantor Hamasah Kairo', awal: 40, hari: 90, mutasi: [{ hari: 36, direction: 'out', quantity: 6, reason: 'Dibagikan ke santri baru angkatan Agustus' }] },
  { name: 'Kitab Matan Al-Ajurrumiyyah', location: 'Kantor Hamasah Kairo', awal: 25, hari: 90, mutasi: [{ hari: 34, direction: 'out', quantity: 6, reason: 'Dibagikan ke santri baru untuk talaqqi' }] },
  { name: 'Map berkas iqamah santri', location: 'Kantor Hamasah Kairo', awal: 50, hari: 60, mutasi: [{ hari: 30, direction: 'out', quantity: 6, reason: 'Pemberkasan iqamah santri baru' }] }
]);

// paspor dan visa: sekian hari lagi sampai kedaluwarsa.
const VISA_SANTRI_BARU = 'Berkas iqamah pelajar sudah diserahkan ke kantor imigrasi Abbasiyah, menunggu jadwal foto sidik jari.';
const DEMO_VISA = Object.freeze({
  rayhan: { status: 'approved', paspor: 1200, visa: 190, note: 'Iqamah pelajar aktif.' },
  hafizh: { status: 'legalization', paspor: 1790, visa: 52, note: 'Menunggu legalisir surat keterangan pelajar dari Al-Azhar sebelum pengajuan iqamah.' },
  zaki: { status: 'collecting-documents', paspor: 950, visa: 18, note: 'Iqamah habis bulan depan. Berkas perpanjangan mulai dikumpulkan.' },
  fikri: { status: 'submitted', paspor: 1800, visa: 52, note: VISA_SANTRI_BARU },
  naufal: { status: 'submitted', paspor: 1795, visa: 52, note: VISA_SANTRI_BARU },
  ilham: { status: 'approved', paspor: 600, visa: 240, note: 'Iqamah pelajar aktif.' },
  daffa: { status: 'approved', paspor: 1100, visa: 130, note: 'Iqamah pelajar aktif.' },
  nayla: { status: 'submitted', paspor: 1810, visa: 52, note: VISA_SANTRI_BARU },
  aisyah: { status: 'approved', paspor: 140, visa: 200, note: 'Paspor habis kurang dari enam bulan lagi. Perpanjang di KBRI Kairo sebelum iqamah diperpanjang.' },
  khansa: { status: 'collecting-documents', paspor: 1805, visa: 52, note: 'Kurang pas foto latar putih 4x6 dan fotokopi visa masuk.' },
  shafiyyah: { status: 'submitted', paspor: 1800, visa: 52, note: VISA_SANTRI_BARU },
  hana: { status: 'approved', paspor: 700, visa: 260, note: 'Iqamah pelajar aktif.' }
});

// Iuran bulan berjalan yang belum dibayar, supaya daftar tagihan memperlihatkan
// campuran lunas dan belum lunas.
const IURAN_BELUM_LUNAS = Object.freeze(['hafizh', 'zaki', 'daffa', 'khansa', 'hana']);

const DEMO_COURSES = Object.freeze([
  {
    key: 'nahwu',
    title: 'Nahwu Dasar: Matan Al-Ajurrumiyyah',
    description: 'Kaidah dasar susunan kalimat bahasa Arab untuk santri tahun pertama, mengikuti urutan Matan Al-Ajurrumiyyah.',
    dibuat: 60,
    materials: [
      {
        hari: 60, type: 'text', title: 'Pengertian kalam dan unsurnya',
        content: "Kalam menurut ahli nahwu adalah lafazh yang tersusun dan memberi faedah dengan bahasa Arab. Contoh: al-'ilmu nuurun (ilmu itu cahaya). Kalimat ini tersusun dari dua kata dan maknanya sudah sempurna, sehingga pendengar tidak menunggu kelanjutannya. Kalam tersusun dari tiga jenis kata: isim, fi'il, dan huruf.",
        summary: "Kalam adalah lafazh tersusun yang maknanya sudah sempurna, dibangun dari isim, fi'il, dan huruf.",
        keyPoints: ['Kalam tersusun dari minimal dua kata.', 'Kalam memberi makna yang sempurna.', "Unsur kalam ada tiga: isim, fi'il, dan huruf."],
        studyGuide: [{ question: 'Apa syarat sebuah lafazh disebut kalam?', answer: 'Tersusun dari minimal dua kata dan maknanya sudah sempurna.' }]
      },
      {
        hari: 52, type: 'text', title: 'Tanda-tanda isim',
        content: "Isim dikenali dari empat tanda: berharakat kasrah karena huruf jar (fil masjidi), menerima tanwin (kitaabun), menerima alif lam (al-kitaabu), dan didahului huruf jar seperti min, ilaa, 'an, 'alaa, dan fii. Bila salah satu tanda ini ada, kata tersebut adalah isim.",
        summary: 'Isim dikenali dari kasrah, tanwin, alif lam, dan huruf jar.',
        keyPoints: ['Tanwin hanya masuk pada isim.', 'Alif lam adalah tanda isim.', 'Kata setelah huruf jar selalu isim.'],
        studyGuide: [{ question: 'Sebutkan empat tanda isim.', answer: 'Kasrah, tanwin, alif lam, dan didahului huruf jar.' }]
      },
      {
        hari: 44, type: 'text', title: "Fi'il dan pembagiannya",
        content: "Fi'il adalah kata yang menunjukkan pekerjaan dan terikat waktu. Fi'il dibagi tiga: fi'il madhi untuk masa lampau (kataba), fi'il mudhari' untuk masa sekarang atau akan datang (yaktubu), dan fi'il amr untuk perintah (uktub). Fi'il mudhari' selalu diawali salah satu huruf hamzah, nun, ya, atau ta.",
        summary: "Fi'il terbagi menjadi madhi, mudhari', dan amr sesuai waktunya.",
        keyPoints: ["Fi'il madhi menunjukkan masa lampau.", "Fi'il mudhari' diawali hamzah, nun, ya, atau ta.", "Fi'il amr menunjukkan perintah."],
        studyGuide: [{ question: "Apa beda fi'il madhi dan fi'il mudhari'?", answer: "Fi'il madhi untuk masa lampau, fi'il mudhari' untuk masa sekarang atau akan datang." }]
      },
      {
        hari: 36, type: 'quiz', title: "Kuis bab kalam, isim, dan fi'il",
        content: JSON.stringify({
          questions: [
            { prompt: 'Lafazh tersusun yang maknanya sudah sempurna disebut apa? (satu kata, huruf kecil)', answer: 'kalam' },
            { prompt: 'Kata yang bisa menerima tanwin disebut apa?', answer: 'isim' },
            { prompt: "Kata yang menunjukkan pekerjaan dan terikat waktu disebut apa? (tulis tanpa tanda petik)", answer: 'fiil' },
            { prompt: 'Kata yang maknanya baru sempurna bila bersama kata lain disebut apa?', answer: 'huruf' },
            { prompt: 'Harakat dua di akhir isim, seperti pada kitaabun, disebut apa?', answer: 'tanwin' }
          ]
        }),
        summary: "Lima soal singkat untuk mengulang bab kalam, isim, fi'il, dan huruf.",
        keyPoints: ['Jawab dengan satu kata huruf kecil.', 'Maksimal tiga kali percobaan, nilai lulus 70.']
      },
      {
        hari: 30, type: 'assignment', title: "Tugas: i'rab lima kalimat sederhana",
        content: "Tuliskan i'rab lima kalimat berikut: 1) al-'ilmu nuurun, 2) al-masjidu kabiirun, 3) dzahaba Ahmadu ilaa al-jaami'ati, 4) yaqra'u ath-thaalibu al-qur'aana, 5) al-kitaabu 'alaa al-maktabi. Sebutkan kedudukan setiap kata dan tanda i'rabnya.",
        summary: "Latihan menentukan kedudukan kata dan tanda i'rab pada kalimat sederhana.",
        keyPoints: ['Tentukan mubtada dan khabar.', "Tentukan fi'il, fa'il, dan maf'ul bih.", "Sebutkan tanda i'rab setiap kata."]
      }
    ]
  },
  {
    key: 'persiapan',
    title: 'Persiapan Tes Masuk Al-Azhar',
    description: 'Latihan membaca, menyimak, dan wawancara bahasa Arab sebelum tes penempatan di markaz bahasa Al-Azhar.',
    dibuat: 50,
    materials: [
      {
        hari: 50, type: 'text', title: 'Gambaran tes penempatan bahasa Arab',
        content: "Santri baru mengikuti tes penempatan untuk menentukan level kelas bahasa. Tes terdiri dari ujian tulis (qawaid dan pemahaman bacaan), menyimak, dan wawancara singkat. Hasilnya menentukan apakah santri masuk level dasar (mubtadi'), menengah (mutawassith), atau lanjut (mutaqaddim). Siapkan perkenalan diri, kosakata sehari-hari, dan kebiasaan membaca teks pendek.",
        summary: 'Tes penempatan menentukan level kelas bahasa: dasar, menengah, atau lanjut.',
        keyPoints: ['Ada ujian tulis, menyimak, dan wawancara.', 'Hasil tes menentukan level kelas.', 'Latih perkenalan diri sejak sekarang.'],
        studyGuide: [{ question: 'Apa saja bagian tes penempatan?', answer: 'Ujian tulis, menyimak, dan wawancara singkat.' }]
      },
      {
        hari: 45, type: 'text', title: "Latihan qira'ah: hari pertama di kampus",
        content: "Bacalah teks berikut dengan suara keras: Dzahabtu ilaa al-jaami'ati fii al-shabaahi al-baakiri. Qaabaltu ushdiqaa'ii amaama al-maktabati, tsumma dakhalnaa al-fashla ma'an. Kaana al-ustaadzu yasyrahu ad-darsa bi-shautin waadhihin. Setelah membaca, tuliskan arti setiap kalimat dan garis bawahi kata kerjanya.",
        summary: 'Latihan membaca teks pendek tentang hari pertama di kampus.',
        keyPoints: ['Baca dengan suara keras dan perlahan.', 'Terjemahkan per kalimat.', 'Kenali kata kerja dalam teks.']
      },
      {
        hari: 40, type: 'quiz', title: 'Kuis kosakata kampus',
        content: JSON.stringify({
          questions: [
            { prompt: 'Bahasa Arab untuk perpustakaan? (huruf latin, huruf kecil)', answer: 'maktabah' },
            { prompt: 'Bahasa Arab untuk fakultas?', answer: 'kulliyyah' },
            { prompt: 'Bahasa Arab untuk guru atau dosen laki-laki?', answer: 'ustadz' },
            { prompt: 'Bahasa Arab untuk ujian?', answer: 'imtihan' }
          ]
        }),
        summary: 'Empat soal kosakata yang sering muncul di lingkungan kampus.',
        keyPoints: ['Tulis dengan huruf latin.', 'Maksimal tiga kali percobaan, nilai lulus 70.']
      },
      {
        hari: 35, type: 'assignment', title: 'Tugas: perkenalan diri dalam bahasa Arab',
        content: 'Tulis perkenalan diri dalam bahasa Arab minimal lima kalimat: nama, asal daerah, sekolah asal, alasan belajar di Al-Azhar, dan cita-cita. Boleh memakai huruf latin.',
        summary: 'Latihan menulis perkenalan diri untuk persiapan wawancara tes.',
        keyPoints: ['Minimal lima kalimat.', 'Sebutkan alasan belajar di Al-Azhar.', 'Perhatikan susunan mubtada dan khabar.']
      }
    ]
  }
]);

const JAWABAN_SALAH = Object.freeze({
  kalam: 'kalimat', isim: 'huruf', fiil: "fi'il", huruf: 'harf', tanwin: 'tanween',
  maktabah: 'maktab', kulliyyah: 'kuliyah', ustadz: 'ustaz', imtihan: 'imtihaan'
});

// ---------------------------------------------------------------------------
// Waktu dan angka acak yang stabil

function tanggalJakarta(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);
}

// Tanggal YYYY-MM-DD (WIB) n hari sebelum hari ini; n negatif berarti mendatang.
function tanggal(n) {
  return tanggalJakarta(new Date(Date.now() - n * HARI_MS));
}

// Saat n hari lalu pada jam WIB tertentu, tidak pernah melewati saat ini.
function waktu(n, jamMenit = '09:00') {
  const hasil = new Date(`${tanggal(n)}T${jamMenit}:00+07:00`).getTime();
  return new Date(Math.min(hasil, Date.now() - 5 * 60 * 1000));
}

function namaBulan(date) {
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(date);
}

function tanggalLahir(umur, geser) {
  return tanggalJakarta(new Date(Date.now() - (umur * 365.25 + geser) * HARI_MS));
}

function buatAcak(benih) {
  let a = benih >>> 0;
  return function acak() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pilihBerbobot(acak, pilihan) {
  const total = pilihan.reduce((jumlah, [, bobot]) => jumlah + bobot, 0);
  let titik = acak() * total;
  for (const [nilai, bobot] of pilihan) {
    titik -= bobot;
    if (titik < 0) return nilai;
  }
  return pilihan[pilihan.length - 1][0];
}

function pilihSatu(acak, daftar) {
  return daftar[Math.floor(acak() * daftar.length)];
}

// Jam bersama untuk semua service: setiap catatan diberi waktu kejadiannya sendiri,
// sehingga riwayat status, tagihan, dan progres belajar tersebar wajar ke belakang.
function buatJam() {
  let titik = null;
  return {
    sekarang() { return titik ? new Date(titik) : new Date(); },
    setel(saat) { titik = saat ? new Date(saat).getTime() : null; }
  };
}

function pastikan(hasil, label) {
  if (!hasil || !hasil.ok) {
    const alasan = hasil && (hasil.error || JSON.stringify(hasil.errors || {}));
    throw new Error(`Gagal ${label}: ${alasan}`);
  }
  return hasil.value;
}

async function pada(jam, saat, label, kerja) {
  jam.setel(saat);
  try {
    return pastikan(await kerja(), label);
  } finally {
    jam.setel(null);
  }
}

// ---------------------------------------------------------------------------
// Service, dirakit sama seperti server/app.js tetapi tanpa notifikasi email: data
// demo tidak boleh memicu email ke siapa pun.

function rakitLayanan(database, jam) {
  const now = () => jam.sekarang().toISOString();
  const accountStore = createPostgresAccountStore({ database });
  const identityService = identity.createIdentityService({ accountStore, now: () => jam.sekarang() });
  const dormitoryStore = createPostgresDormitoryStore({ database });
  const dormitoryService = createDormitoryService({ store: dormitoryStore, getAccount: (accountId) => accountStore.getById(accountId), now });
  const studentStore = createPostgresStudentStore({ database });
  const studentPortalService = createStudentPortalService({
    store: studentStore,
    supervisorDormitories: (accountId) => dormitoryService.dormitoriesForStaff(accountId),
    getDormitory: (dormitoryId) => dormitoryStore.getDormitory(dormitoryId),
    countInDormitory: (dormitoryId) => studentStore.countInDormitory(dormitoryId),
    now
  });
  const studentCareService = createStudentCareService({
    store: createPostgresStudentCareStore({ database }),
    accessFor: (studentId, actor) => studentPortalService.accessFor(studentId, actor),
    healthEnabled: true,
    now
  });
  const operationsService = createOperationsService({
    store: createPostgresOperationsStore({ database }),
    async studentExists(studentId) { return Boolean(await studentStore.getStudent(studentId)); },
    async parentCanViewStudent() { return false; },
    now
  });
  const lmsService = createLmsService({ store: createPostgresLmsStore({ database }), now });
  const registrationStore = createPostgresRegistrationStore({ database });
  const registrationService = registrationServiceModule.createRegistrationService({ store: registrationStore, now });
  const departureService = createDepartureService({
    store: createPostgresDepartureStore({ database }),
    now,
    async registrationExists(registrationId) { return Boolean(await registrationStore.get(registrationId)); }
  });
  const inquiryStore = createPostgresInquiryStore({ database });
  return {
    accountStore, identityService, dormitoryService, studentPortalService, studentCareService,
    operationsService, lmsService, registrationService, departureService, inquiryStore
  };
}

// ---------------------------------------------------------------------------
// Mengisi data demo

async function adaDataDemo(database) {
  const { rows } = await database.query('SELECT count(*)::int AS jumlah FROM accounts WHERE email LIKE $1', [DEMO_EMAIL_PATTERN]);
  return rows[0].jumlah > 0;
}

async function buatAkun(ctx, kataSandi) {
  for (const akun of DEMO_ACCOUNTS) {
    await pada(ctx.jam, waktu(akun.dibuat, '09:30'), `membuat akun ${akun.email}`, () => ctx.layanan.identityService.createAccount({
      name: akun.name, email: akun.email, role: akun.role, password: kataSandi
    }));
    const tersimpan = await ctx.layanan.accountStore.getByEmail(akun.email);
    ctx.aktor[akun.key] = { id: tersimpan.id, accountId: tersimpan.id, role: tersimpan.role };
  }
}

async function buatAsrama(ctx) {
  for (const asrama of DEMO_DORMITORIES) {
    const dibuat = await pada(ctx.jam, waktu(92, '10:00'), `membuat ${asrama.name}`, () => ctx.layanan.dormitoryService.create({
      name: asrama.name, area: asrama.area, gender: asrama.gender, capacity: asrama.capacity
    }, ctx.admin));
    ctx.asrama[asrama.key] = dibuat;
    await pada(ctx.jam, waktu(92, '10:05'), `menugaskan pembina ${asrama.name}`, () => ctx.layanan.dormitoryService.assign(
      dibuat.id, ctx.aktor[asrama.pembina].id, ctx.admin
    ));
  }
}

function dataPendaftar(r, indeks) {
  const slug = r.applicantName.toLocaleLowerCase('id-ID').split(' ').slice(0, 2).join('.');
  const payload = {
    applicantName: r.applicantName,
    phone: telepon(1001 + indeks * 2),
    email: email(slug),
    birthDate: tanggalLahir(r.umur, 40 + indeks * 23),
    gender: r.gender,
    schoolOrigin: r.schoolOrigin,
    educationLevel: r.educationLevel,
    city: r.city,
    program: r.program,
    referralSource: r.referralSource,
    consent: true,
    dataProcessingConsent: true
  };
  if (r.guardianName) {
    Object.assign(payload, {
      guardianName: r.guardianName,
      guardianPhone: telepon(1002 + indeks * 2),
      guardianEmail: email(`wali.${slug}`),
      guardianConsent: true
    });
  }
  return payload;
}

async function buatPendaftaran(ctx) {
  const petugas = ctx.aktor.petugas;
  const layanan = ctx.layanan.registrationService;
  for (const [indeks, r] of DEMO_REGISTRATIONS.entries()) {
    const kode = createAccessCode();
    const kodeHash = await identity.hashPassword(kode);
    const dibuat = await pada(ctx.jam, waktu(r.dibuat, r.jam), `mendaftarkan ${r.applicantName}`, () => layanan.create(dataPendaftar(r, indeks), {
      privateData: { accessTokenHash: hashToken(crypto.randomBytes(32).toString('base64url')), accessCodeHash: kodeHash }
    }));
    const nomor = dibuat.registrationId;
    for (const [urutan, p] of r.peristiwa.entries()) {
      // Peristiwa di hari yang sama diberi selang beberapa menit supaya urutannya terjaga.
      const saat = new Date(waktu(p.hari, '10:00').getTime() + urutan * 7 * 60 * 1000);
      if (p.status) {
        await pada(ctx.jam, saat, `mengubah status ${nomor}`, () => layanan.changeStatus(nomor, p.status, { role: petugas.role, accountId: petugas.id, note: p.note }));
      } else if (p.catatan) {
        await pada(ctx.jam, saat, `mencatat ${nomor}`, () => layanan.addNote(nomor, { visibility: p.catatan, body: p.body }, petugas));
      } else if (p.langkah) {
        await pada(ctx.jam, saat, `menambah tindak lanjut ${nomor}`, () => layanan.addNextStep(nomor, { title: p.langkah, dueOn: tanggal(-p.tenggat) }, petugas));
      }
    }
    const status = (await ctx.database.query('SELECT id, status FROM registrations WHERE registration_id = $1', [nomor])).rows[0];
    ctx.pendaftaran[r.key] = { id: status.id, nomor, nama: r.applicantName, status: status.status, kode };
  }
}

async function buatKloter(ctx) {
  for (const k of DEMO_KLOTER) {
    const rencana = tanggal(k.hari);
    const nama = `Kloter ${namaBulan(new Date(`${rencana}T12:00:00+07:00`))}`;
    const kloter = await pada(ctx.jam, waktu(k.dibuat, '11:00'), `membuat ${nama}`, () => ctx.layanan.departureService.createGroup({
      name: nama, plannedDate: rencana, origin: k.origin, status: k.status, applicantNote: k.applicantNote
    }, ctx.aktor.petugas));
    ctx.kloter[k.key] = kloter;
    for (const r of DEMO_REGISTRATIONS.filter((item) => item.kloter === k.key)) {
      await pada(ctx.jam, waktu(Math.max(k.dibuat - 2, 1), '11:30'), `memasukkan ${r.applicantName} ke ${nama}`, () => ctx.layanan.departureService.assign(
        ctx.pendaftaran[r.key].nomor, kloter.id, ctx.aktor.petugas
      ));
    }
  }
}

async function buatSantri(ctx) {
  for (const s of DEMO_STUDENTS) {
    const dibuat = await pada(ctx.jam, waktu(s.bergabung, '08:00'), `membuat santri ${s.name}`, () => ctx.layanan.studentPortalService.createStudent({
      name: s.name,
      program: s.program,
      city: 'Kairo',
      joinDate: tanggal(s.bergabung),
      gender: s.gender,
      dormitoryId: ctx.asrama[s.gender].id,
      studentAccountId: s.akun ? ctx.aktor[s.akun].id : null,
      parentAccountIds: (s.wali || []).map((key) => ctx.aktor[key].id),
      registrationId: s.pendaftaran ? ctx.pendaftaran[s.pendaftaran].id : null
    }, ctx.admin));
    ctx.santri[s.key] = dibuat;
  }
}

const SHOLAT = Object.freeze(['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya']);

async function isiCatatanSantri(ctx, s, indeks) {
  const { jam } = ctx;
  const portal = ctx.layanan.studentPortalService;
  const care = ctx.layanan.studentCareService;
  const pembina = ctx.aktor[s.gender === 'putra' ? 'musyrif' : 'musyrifah'];
  const acak = buatAcak(1000 + indeks * 7919);
  const id = ctx.santri[s.key].id;
  const catatan = CATATAN_SANTRI[s.key] || {};
  const hariSakit = new Set((catatan.kesehatan || []).filter((k) => k.condition !== 'sehat').map((k) => k.hari));

  for (let n = 7; n >= 1; n -= 1) {
    const status = hariSakit.has(n) ? 'excused' : pilihBerbobot(acak, [['present', 84], ['late', 9], ['excused', 4], ['absent', 3]]);
    const note = {
      present: '',
      late: pilihSatu(acak, ['Terlambat 10 menit, baru pulang dari kampus.', 'Terlambat karena antre di kantor imigrasi.']),
      excused: hariSakit.has(n) ? 'Sakit, istirahat di kamar.' : 'Izin mengurus berkas iqamah bersama petugas.',
      absent: 'Tidak hadir tanpa keterangan, sudah ditegur musyrif.'
    }[status];
    await pada(jam, waktu(n, '21:30'), 'mencatat kehadiran', () => portal.addAttendance(id, {
      status, category: 'Kegiatan harian', occurredAt: waktu(n, '20:00').toISOString(), note
    }, pembina));
    if (n % 2 === 1 && !hariSakit.has(n)) {
      await pada(jam, waktu(n, '12:00'), 'mencatat talaqqi', () => portal.addAttendance(id, {
        status: acak() < 0.9 ? 'present' : 'late', category: 'Talaqqi pagi', occurredAt: waktu(n, '11:00').toISOString(), note: ''
      }, pembina));
    }

    const entries = SHOLAT.map((prayer) => {
      if (hariSakit.has(n)) return { prayer, status: 'munfarid', note: 'Sakit, sholat di kamar.' };
      let hasil = pilihBerbobot(acak, [['berjamaah', 86], ['munfarid', 11], ['tidak', 3]]);
      if (hasil === 'tidak' && prayer !== 'subuh') hasil = 'munfarid';
      const keterangan = hasil === 'munfarid'
        ? pilihSatu(acak, ['Terlambat pulang dari kampus.', 'Sholat sendiri di kamar.', ''])
        : hasil === 'tidak' ? 'Kesiangan, sudah ditegur dan diqadha.' : '';
      return { prayer, status: hasil, note: keterangan };
    });
    await pada(jam, waktu(n, '23:00'), 'mencatat sholat', () => care.recordPrayers(id, { date: tanggal(n), entries }, pembina));
  }

  const segmen = ZIYADAH[s.jalur];
  let urut = (indeks * 3 + (s.bergabung === BARU ? 0 : 4)) % segmen.length;
  for (const [k, n] of [13, 11, 9, 7, 5, 3, 1].entries()) {
    const kind = k % 2 === 0 ? 'ziyadah' : 'murajaah';
    const portion = kind === 'ziyadah' ? segmen[urut++ % segmen.length] : MURAJAAH[(indeks + k) % MURAJAAH.length];
    const grade = hariSakit.has(n) ? 'ulang' : pilihBerbobot(acak, [['lancar', 68], ['kurang-lancar', 24], ['ulang', 8]]);
    const note = {
      lancar: pilihSatu(acak, ['Bacaan lancar, makhraj baik.', 'Lancar.', '']),
      'kurang-lancar': 'Masih tertukar di beberapa ayat yang mirip.',
      ulang: hariSakit.has(n) ? 'Sedang sakit, setoran diulang setelah sehat.' : 'Belum siap, setor ulang besok.'
    }[grade];
    await pada(jam, waktu(n, '17:30'), 'mencatat hafalan', () => care.addMemorization(id, { occurredOn: tanggal(n), kind, portion, grade, note }, pembina));
  }

  for (const k of catatan.kesehatan || []) {
    await pada(jam, waktu(k.hari, '19:00'), 'mencatat kesehatan', () => care.addHealth(id, {
      occurredOn: tanggal(k.hari), condition: k.condition, complaint: k.complaint, actionTaken: k.actionTaken, parentNote: k.parentNote
    }, pembina));
  }

  for (const kegiatan of KEGIATAN_BERSAMA) {
    if (kegiatan.untuk === 'baru' && s.bergabung !== BARU) continue;
    await pada(jam, waktu(kegiatan.hari, '16:00'), 'mencatat kegiatan', () => portal.addActivity(id, {
      title: kegiatan.title, description: kegiatan.description, occurredAt: waktu(kegiatan.hari, '15:00').toISOString()
    }, pembina));
  }
  for (const p of catatan.prestasi || []) {
    await pada(jam, waktu(p.hari, '16:30'), 'mencatat prestasi', () => portal.addAchievement(id, {
      title: p.title, description: p.description, occurredAt: waktu(p.hari, '15:30').toISOString()
    }, pembina));
  }
  for (const e of catatan.evaluasi || []) {
    await pada(jam, waktu(e.hari, '20:30'), 'mencatat evaluasi', () => portal.addEvaluation(id, {
      area: e.area, note: e.note, occurredAt: waktu(e.hari, '20:15').toISOString()
    }, pembina));
  }
  for (const v of catatan.pelanggaran || []) {
    await pada(jam, waktu(v.hari, '22:30'), 'mencatat pelanggaran', () => portal.addViolation(id, {
      level: v.level, note: v.note, occurredAt: waktu(v.hari, '22:00').toISOString()
    }, pembina));
  }
}

function tahunAjaran(date) {
  const [tahun, bulan] = tanggalJakarta(date).split('-').map(Number);
  return bulan >= 7 ? `${tahun}/${tahun + 1}` : `${tahun - 1}/${tahun}`;
}

async function buatTagihan(ctx) {
  const ops = ctx.layanan.operationsService;
  const keuangan = ctx.aktor.keuangan;
  // Tagihan dan pelunasan dikumpulkan dulu lalu dijalankan menurut waktunya, supaya
  // nomor invoice dan kuitansi urut sesuai tanggal seperti di kantor sungguhan.
  const peristiwa = [];
  function tagih(santriId, description, amount, hariTerbit, hariLunas) {
    const tagihan = { santriId, description, amount, id: null };
    peristiwa.push({ saat: waktu(hariTerbit, '10:00').getTime() + peristiwa.length * 60 * 1000, tagihan, jenis: 'terbit' });
    if (hariLunas !== null) {
      peristiwa.push({ saat: waktu(hariLunas, '14:20').getTime() + peristiwa.length * 60 * 1000, tagihan, jenis: 'bayar' });
    }
  }
  for (const [i, s] of DEMO_STUDENTS.entries()) {
    const id = ctx.santri[s.key].id;
    if (s.bergabung === BARU) {
      tagih(id, `DP pemberkasan ${s.jalur === 'kuliah' ? 'Kuliah S1 Al-Azhar' : "Ma'had Al-Azhar"}`, s.jalur === 'kuliah' ? 4500000 : 5000000, 112 - (i % 4), 110 - (i % 4));
      tagih(id, 'Cicilan biaya program tahap 2', 7500000, 75, 70 - (i % 3));
      tagih(id, 'Cicilan biaya program tahap 3', 7500000, 12, i % 2 === 0 ? 4 : null);
    } else {
      tagih(id, `Daftar ulang tahun ajaran ${tahunAjaran(waktu(48))}`, 3500000, 48, s.key === 'daffa' ? null : 44 - (i % 3));
    }
    tagih(id, `Iuran asrama dan makan ${namaBulan(waktu(25))}`, 2400000, 32, 29 - (i % 4));
    tagih(id, `Iuran asrama dan makan ${namaBulan(new Date(Date.now() + 5 * HARI_MS))}`, 2400000, 2, IURAN_BELUM_LUNAS.includes(s.key) ? null : 1);
  }
  peristiwa.sort((a, b) => a.saat - b.saat);
  for (const p of peristiwa) {
    const t = p.tagihan;
    if (p.jenis === 'terbit') {
      const invoice = await pada(ctx.jam, p.saat, `membuat tagihan ${t.description}`, () => ops.createInvoice({ studentId: t.santriId, description: t.description, amount: t.amount }, keuangan));
      t.id = invoice.id;
    } else {
      await pada(ctx.jam, p.saat, `melunasi ${t.description}`, () => ops.markInvoicePaid(t.id, keuangan));
    }
  }
  return {
    jumlah: peristiwa.filter((p) => p.jenis === 'terbit').length,
    lunas: peristiwa.filter((p) => p.jenis === 'bayar').length
  };
}

async function buatVisa(ctx) {
  const ops = ctx.layanan.operationsService;
  for (const s of DEMO_STUDENTS) {
    const v = DEMO_VISA[s.key];
    const studentId = ctx.santri[s.key].id;
    const dasar = { studentId, passportExpiresAt: tanggal(-v.paspor), visaExpiresAt: tanggal(-v.visa) };
    // Santri baru punya riwayat: mulai mengumpulkan berkas, lalu maju ke tahap sekarang.
    if (s.bergabung === BARU && v.status !== 'collecting-documents') {
      await pada(ctx.jam, waktu(33, '13:00'), `mencatat visa ${s.name}`, () => ops.saveVisa({ ...dasar, status: 'collecting-documents', note: 'Mengumpulkan paspor, pas foto, dan surat keterangan pelajar.' }, ctx.aktor.keuangan));
    }
    await pada(ctx.jam, waktu(s.bergabung === BARU ? 14 : 20, '13:30'), `mencatat visa ${s.name}`, () => ops.saveVisa({ ...dasar, status: v.status, note: v.note }, ctx.aktor.keuangan));
  }
}

async function buatInventaris(ctx) {
  const ops = ctx.layanan.operationsService;
  for (const barang of DEMO_INVENTORY) {
    const item = await pada(ctx.jam, waktu(barang.hari, '09:00'), `mencatat ${barang.name}`, () => ops.saveInventory({
      name: barang.name, location: barang.location, quantity: barang.awal
    }, ctx.aktor.keuangan));
    for (const m of barang.mutasi) {
      await pada(ctx.jam, waktu(m.hari, '15:00'), `mutasi ${barang.name}`, () => ops.moveInventory(item.id, {
        direction: m.direction, quantity: m.quantity, delta: m.delta, reason: m.reason
      }, ctx.aktor.keuangan));
    }
  }
}

async function buatPesan(ctx) {
  const store = ctx.layanan.inquiryStore;
  for (const [i, p] of DEMO_INQUIRIES.entries()) {
    const masuk = p.jamLalu ? new Date(Date.now() - p.jamLalu * 60 * 60 * 1000) : waktu(p.hari, p.jam);
    const pesan = pastikan(await store.create({ name: p.name, phone: telepon(2001 + i), topic: p.topic, message: p.message }, masuk.toISOString()), `menyimpan pesan ${p.name}`);
    if (p.status === 'new') continue;
    pastikan(await store.updateStatus(pesan.id, 'contacted', ctx.aktor.petugas.id, waktu(p.ditangani, '10:30').toISOString()), 'menandai pesan');
    if (p.status === 'closed') {
      pastikan(await store.updateStatus(pesan.id, 'closed', ctx.aktor.petugas.id, waktu(p.ditangani - 1, '11:00').toISOString()), 'menutup pesan');
    }
  }
}

function jawabanTugas(materi, s, bagus) {
  const namaDepan = s.name.split(' ')[0];
  if (materi.title.startsWith('Tugas: perkenalan')) {
    const cita = s.gender === 'putra' ? 'mudarrisan fii ma\'had' : 'mudarrisatan li al-banaat';
    return `Ismii ${s.name}. Ana min ${s.asal}, Indonesia. Takharrajtu min madrasah fii baladii. Adrusu fii al-Azhar li ata'allama al-lughah al-'arabiyyah wa 'uluum ad-diin. Uriidu an akuuna ${cita}.${bagus ? '' : ' (Kalimat ketiga belum yakin susunannya.)'}`;
  }
  const kalimatEmpat = bagus
    ? "4) Yaqra'u: fi'il mudhari' marfu' dengan dhammah. Ath-thaalibu: fa'il marfu' dengan dhammah. Al-qur'aana: maf'ul bih manshub dengan fathah."
    : "4) Yaqra'u: fi'il mudhari'. Ath-thaalibu: maf'ul bih. Al-qur'aana: fa'il.";
  return [
    `Jawaban ${namaDepan}:`,
    "1) Al-'ilmu: mubtada marfu' dengan dhammah. Nuurun: khabar marfu' dengan dhammah.",
    '2) Al-masjidu: mubtada marfu\' dengan dhammah. Kabiirun: khabar marfu\' dengan dhammah.',
    "3) Dzahaba: fi'il madhi mabni fathah. Ahmadu: fa'il marfu' dengan dhammah. Ilaa al-jaami'ati: jar majrur.",
    kalimatEmpat,
    "5) Al-kitaabu: mubtada marfu'. 'Alaa al-maktabi: jar majrur yang menjadi khabar."
  ].join(' ');
}

async function jalankanProgres(ctx, s, maddah, level, acak, mulai) {
  const lms = ctx.layanan.lmsService;
  const guru = ctx.aktor.guru;
  const studentId = ctx.santri[s.key].id;
  let hari = mulai;
  for (const [urutan, materi] of maddah.materi.entries()) {
    if (urutan >= level) break;
    hari = Math.max(1, Math.min(hari - 2 - Math.floor(acak() * 4), materi.hari - 1));
    const materialId = materi.tersimpan.id;
    if (materi.type === 'quiz') {
      const soal = JSON.parse(materi.content).questions;
      let peluang = 0.55 + acak() * 0.4;
      for (let percobaan = 0; percobaan < 2; percobaan += 1) {
        const answers = {};
        soal.forEach((q, i) => { answers[i] = acak() < peluang ? q.answer : JAWABAN_SALAH[q.answer]; });
        const hasil = await pada(ctx.jam, waktu(Math.max(hari - percobaan, 1), '20:10'), 'mengerjakan kuis', () => lms.submitQuiz(studentId, maddah.course.id, materialId, answers, guru));
        if (hasil.attempt.passed) break;
        peluang = Math.min(peluang + 0.3, 0.97);
      }
    } else if (materi.type === 'assignment') {
      const bagus = acak() < 0.7;
      const kiriman = await pada(ctx.jam, waktu(hari, '21:00'), 'mengirim tugas', () => lms.submitAssignment(studentId, maddah.course.id, materialId, { body: jawabanTugas(materi, s, bagus) }, guru));
      // Kiriman terbaru dibiarkan menunggu penilaian, supaya guru melihat antrean.
      if (hari > 3 && acak() < 0.75) {
        const score = bagus ? 82 + Math.floor(acak() * 14) : 60 + Math.floor(acak() * 18);
        const note = score >= 85
          ? 'Jawaban sudah tepat dan rapi. Pertahankan, lanjutkan ke bab berikutnya.'
          : score >= 70
            ? 'Sebagian besar tepat. Perhatikan lagi tanda i\'rab dan susunan kalimat keempat.'
            : "Masih tertukar antara fa'il dan maf'ul bih. Pelajari ulang materi lalu kirim perbaikan.";
        await pada(ctx.jam, waktu(hari - 2, '09:30'), 'menilai tugas', () => lms.reviewSubmission(kiriman.id, { score, note }, guru));
      }
    } else {
      await pada(ctx.jam, waktu(hari, '19:45'), 'menyelesaikan materi', () => lms.completeMaterial(studentId, maddah.course.id, materialId, guru));
    }
  }
}

async function buatMaddah(ctx) {
  const lms = ctx.layanan.lmsService;
  const guru = ctx.aktor.guru;
  const maddah = {};
  for (const c of DEMO_COURSES) {
    const course = await pada(ctx.jam, waktu(c.dibuat, '08:30'), `membuat maddah ${c.title}`, () => lms.createCourse({ title: c.title, description: c.description }, guru));
    const materi = [];
    for (const m of c.materials) {
      const tersimpan = await pada(ctx.jam, waktu(m.hari, '08:45'), `menambah materi ${m.title}`, () => lms.addMaterial(course.id, {
        type: m.type, title: m.title, content: m.content, summary: m.summary, keyPoints: m.keyPoints, studyGuide: m.studyGuide || []
      }, guru));
      materi.push({ ...m, tersimpan });
    }
    maddah[c.key] = { course, materi };
  }

  for (const [i, s] of DEMO_STUDENTS.entries()) {
    const acak = buatAcak(5000 + i * 104729);
    const studentId = ctx.santri[s.key].id;
    const lama = s.bergabung !== BARU;
    await pada(ctx.jam, waktu(lama ? 59 : 37, '09:00'), 'mendaftarkan maddah', () => lms.enroll(studentId, maddah.nahwu.course.id, guru));
    await jalankanProgres(ctx, s, maddah.nahwu, lama ? 3 + Math.floor(acak() * 3) : 1 + Math.floor(acak() * 4), acak, lama ? 50 : 30);
    if (!lama) {
      await pada(ctx.jam, waktu(35, '09:00'), 'mendaftarkan maddah', () => lms.enroll(studentId, maddah.persiapan.course.id, guru));
      await jalankanProgres(ctx, s, maddah.persiapan, 2 + Math.floor(acak() * 3), acak, 33);
    }
  }
  return Object.keys(maddah).length;
}

async function isiDataDemo({ database, kataSandi, logger = console }) {
  const problem = identity.validatePassword(kataSandi);
  if (problem) throw new Error(`Kata sandi demo belum valid: ${problem}`);
  if (await adaDataDemo(database)) {
    return { sudahAda: true };
  }
  const jam = buatJam();
  const ctx = {
    database,
    jam,
    layanan: rakitLayanan(database, jam),
    // Pekerjaan khusus admin (asrama, data santri) memakai aktor admin tanpa akun,
    // supaya tidak perlu membuat atau meminjam akun admin.
    admin: { id: null, accountId: null, role: ROLES.ADMIN },
    aktor: {}, asrama: {}, pendaftaran: {}, kloter: {}, santri: {}
  };
  logger.log('[demo] Membuat akun demo.');
  await buatAkun(ctx, kataSandi);
  logger.log('[demo] Membuat asrama, pendaftar, dan kloter.');
  await buatAsrama(ctx);
  await buatPendaftaran(ctx);
  await buatKloter(ctx);
  logger.log('[demo] Membuat santri beserta catatan harian (bagian paling lama).');
  await buatSantri(ctx);
  for (const [indeks, s] of DEMO_STUDENTS.entries()) {
    await isiCatatanSantri(ctx, s, indeks);
  }
  logger.log('[demo] Membuat tagihan, visa, inventaris, pesan, dan maddah.');
  const tagihan = await buatTagihan(ctx);
  await buatVisa(ctx);
  await buatInventaris(ctx);
  await buatPesan(ctx);
  const maddah = await buatMaddah(ctx);
  return {
    sudahAda: false,
    akun: DEMO_ACCOUNTS.map((akun) => ({ email: akun.email, nama: akun.name, peran: akun.peran })),
    pendaftar: DEMO_REGISTRATIONS.map((r) => ctx.pendaftaran[r.key]),
    jumlah: {
      asrama: DEMO_DORMITORIES.length,
      santri: DEMO_STUDENTS.length,
      tagihan: tagihan.jumlah,
      tagihanLunas: tagihan.lunas,
      visa: DEMO_STUDENTS.length,
      inventaris: DEMO_INVENTORY.length,
      kloter: DEMO_KLOTER.length,
      pesan: DEMO_INQUIRIES.length,
      maddah
    }
  };
}

// ---------------------------------------------------------------------------
// Kata sandi dan kode akses baru

async function gantiSandiDemo({ database, kataSandi }) {
  const problem = identity.validatePassword(kataSandi);
  if (problem) throw new Error(`Kata sandi demo belum valid: ${problem}`);
  const hash = await identity.hashPassword(kataSandi);
  const pendaftaran = (await database.query(
    'SELECT id, registration_id, applicant_name, status FROM registrations WHERE email LIKE $1 ORDER BY registration_id', [DEMO_EMAIL_PATTERN]
  )).rows;
  const kodeBaru = [];
  for (const row of pendaftaran) {
    kodeBaru.push({ row, kode: createAccessCode() });
  }
  const hashKode = await Promise.all(kodeBaru.map((item) => identity.hashPassword(item.kode)));
  await database.withTransaction(async (tx) => {
    const akun = await tx.query('UPDATE accounts SET password_hash = $1 WHERE email LIKE $2 RETURNING id', [hash, DEMO_EMAIL_PATTERN]);
    const akunIds = akun.rows.map((row) => row.id);
    if (akunIds.length) await tx.query('DELETE FROM account_sessions WHERE account_id = ANY($1::uuid[])', [akunIds]);
    for (const [i, item] of kodeBaru.entries()) {
      await tx.query('UPDATE registrations SET access_code_hash = $1 WHERE id = $2', [hashKode[i], item.row.id]);
      await tx.query('DELETE FROM applicant_sessions WHERE registration_id = $1', [item.row.id]);
    }
  });
  return {
    pendaftar: kodeBaru.map(({ row, kode }) => ({ nomor: row.registration_id, nama: row.applicant_name, status: row.status, kode }))
  };
}

// ---------------------------------------------------------------------------
// Menemukan dan menghapus data demo

async function temukanDataDemo(database) {
  const ambil = async (sql, params) => (await database.query(sql, params)).rows;
  const akun = await ambil('SELECT id, email, role FROM accounts WHERE email LIKE $1 ORDER BY email', [DEMO_EMAIL_PATTERN]);
  const akunIds = akun.map((row) => row.id);
  const pendaftaran = await ambil(
    'SELECT id, registration_id, applicant_name FROM registrations WHERE email LIKE $1 ORDER BY registration_id', [DEMO_EMAIL_PATTERN]
  );
  const kode = pendaftaran.map((row) => row.registration_id);
  const santri = await ambil(
    `SELECT s.id, s.name FROM students s
     WHERE EXISTS (SELECT 1 FROM unnest($1::text[], $2::text[]) AS d(nama, program) WHERE d.nama = s.name AND d.program = s.program)
        OR s.student_account_id = ANY($3::uuid[])
        OR s.registration_id = ANY($4::uuid[])
     ORDER BY s.name`,
    [DEMO_STUDENTS.map((s) => s.name), DEMO_STUDENTS.map((s) => s.program), akunIds, pendaftaran.map((row) => row.id)]
  );
  const santriIds = santri.map((row) => row.id);
  // Kloter hanya ikut terhapus bila SEMUA anggotanya pendaftar demo. Kloter kosong
  // atau berisi pendaftar sungguhan tidak pernah disentuh.
  const kloter = await ambil(
    `SELECT g.id, g.name FROM departure_groups g
     WHERE EXISTS (SELECT 1 FROM registration_departures m WHERE m.departure_group_id = g.id)
       AND NOT EXISTS (SELECT 1 FROM registration_departures m WHERE m.departure_group_id = g.id AND NOT (m.registration_id = ANY($1::text[])))
     ORDER BY g.planned_date`,
    [kode]
  );
  const asrama = await ambil(
    `SELECT d.id, d.name, EXISTS (SELECT 1 FROM students s WHERE s.dormitory_id = d.id AND NOT (s.id = ANY($2::uuid[]))) AS dipakai
     FROM dormitories d WHERE d.name = ANY($1::text[]) ORDER BY d.name`,
    [DEMO_DORMITORIES.map((d) => d.name), santriIds]
  );
  const inventaris = await ambil(
    `SELECT i.id, i.name, i.location,
       EXISTS (SELECT 1 FROM inventory_movements m WHERE m.inventory_item_id = i.id
               AND (m.actor_account_id IS NULL OR NOT (m.actor_account_id = ANY($3::uuid[])))) AS disentuh
     FROM inventory_items i
     WHERE EXISTS (SELECT 1 FROM unnest($1::text[], $2::text[]) AS d(nama, lokasi) WHERE d.nama = i.name AND d.lokasi = i.location)
     ORDER BY i.location, i.name`,
    [DEMO_INVENTORY.map((b) => b.name), DEMO_INVENTORY.map((b) => b.location), akunIds]
  );
  const maddah = await ambil('SELECT id, title FROM courses WHERE owner_account_id = ANY($1::uuid[]) ORDER BY title', [akunIds]);
  const pesan = await ambil(
    'SELECT id, name FROM inquiries WHERE phone_e164 LIKE $1 AND name = ANY($2::text[]) ORDER BY created_at', [`${DEMO_PHONE_PREFIX}%`, DEMO_INQUIRIES.map((p) => p.name)]
  );
  const invoice = await ambil('SELECT id, invoice_number, receipt_number FROM invoices WHERE student_id = ANY($1::uuid[]) ORDER BY invoice_number', [santriIds]);
  const berkas = await ambil(
    `SELECT id, bucket, storage_key FROM file_objects
     WHERE uploaded_by_account_id = ANY($1::uuid[])
        OR (entity_type = 'registration' AND entity_id = ANY($2::text[]))
        OR entity_id = ANY($3::text[])
     ORDER BY storage_key`,
    [akunIds, kode, santriIds]
  );
  return {
    akun, pendaftaran, santri, kloter, maddah, pesan, invoice, berkas,
    asrama: asrama.filter((row) => !row.dipakai),
    asramaDilewati: asrama.filter((row) => row.dipakai),
    inventaris: inventaris.filter((row) => !row.disentuh),
    inventarisDilewati: inventaris.filter((row) => row.disentuh)
  };
}

function totalBaris(data) {
  return ['akun', 'pendaftaran', 'santri', 'kloter', 'maddah', 'pesan', 'invoice', 'asrama', 'inventaris', 'berkas']
    .reduce((jumlah, key) => jumlah + data[key].length, 0);
}

function cetakLaporan(data, logger = console) {
  const baris = (label, rows, tampil) => {
    logger.log(`${label.padEnd(13)}${rows.length}`);
    rows.forEach((row) => logger.log(`  - ${tampil(row)}`));
  };
  logger.log('--- Data demo yang ditemukan ---');
  baris('Akun:', data.akun, (row) => `${row.email} (${row.role})`);
  baris('Santri:', data.santri, (row) => row.name);
  baris('Pendaftar:', data.pendaftaran, (row) => `${row.registration_id} ${row.applicant_name}`);
  baris('Kloter:', data.kloter, (row) => row.name);
  baris('Asrama:', data.asrama, (row) => row.name);
  baris('Maddah:', data.maddah, (row) => row.title);
  baris('Tagihan:', data.invoice, (row) => row.invoice_number);
  baris('Inventaris:', data.inventaris, (row) => `${row.name} (${row.location})`);
  baris('Pesan:', data.pesan, (row) => row.name);
  baris('Berkas:', data.berkas, (row) => `${row.bucket}/${row.storage_key}`);
  data.asramaDilewati.forEach((row) => logger.log(`Dilewati: ${row.name} masih dihuni santri yang bukan data demo.`));
  data.inventarisDilewati.forEach((row) => logger.log(`Dilewati: ${row.name} (${row.location}) sudah diubah akun yang bukan akun demo.`));
  logger.log('---');
}

function urutanDokumen(nomor, pemisah) {
  if (!nomor) return null;
  const bagian = nomor.split(pemisah);
  return { tahun: Number(bagian[bagian.length - 2]), urut: Number(bagian[bagian.length - 1]) };
}

// Nomor terakhir yang dipakai data demo, per jenis dokumen dan tahun.
function nomorTerakhirDemo(data) {
  const terakhir = new Map();
  const catat = (scope, nomor) => {
    if (!nomor) return;
    const kunci = `${scope}:${nomor.tahun}`;
    terakhir.set(kunci, { scope, tahun: nomor.tahun, urut: Math.max(nomor.urut, (terakhir.get(kunci) || { urut: 0 }).urut) });
  };
  data.pendaftaran.forEach((row) => catat('registration', urutanDokumen(row.registration_id, '-')));
  data.invoice.forEach((row) => {
    catat('invoice', urutanDokumen(row.invoice_number, '/'));
    catat('receipt', urutanDokumen(row.receipt_number, '/'));
  });
  return [...terakhir.values()];
}

const SISA_NOMOR = Object.freeze({
  registration: "SELECT max(right(registration_id, 5)::int) AS maks FROM registrations WHERE substring(registration_id FROM 8 FOR 4) = $1",
  invoice: "SELECT max(split_part(invoice_number, '/', 4)::int) AS maks FROM invoices WHERE split_part(invoice_number, '/', 3) = $1",
  receipt: "SELECT max(split_part(receipt_number, '/', 4)::int) AS maks FROM invoices WHERE receipt_number IS NOT NULL AND split_part(receipt_number, '/', 3) = $1"
});

async function hapusDataDemo({ database, data, storage, logger = console }) {
  if (data.berkas.length && !storage) {
    throw new Error('Ada berkas unggahan milik data demo, tetapi akses storage belum tersedia. Set SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di terminal ini lalu jalankan ulang.');
  }
  const ids = (rows) => rows.map((row) => row.id);
  const akunIds = ids(data.akun);
  await database.withTransaction(async (tx) => {
    const hapus = async (sql, values) => { if (values.length) await tx.query(sql, [values]); };
    await hapus('DELETE FROM inventory_movements WHERE inventory_item_id = ANY($1::uuid[])', ids(data.inventaris));
    await hapus('DELETE FROM inventory_items WHERE id = ANY($1::uuid[])', ids(data.inventaris));
    await hapus('DELETE FROM invoice_corrections WHERE invoice_id = ANY($1::uuid[])', ids(data.invoice));
    await hapus('DELETE FROM invoices WHERE id = ANY($1::uuid[])', ids(data.invoice));
    await hapus('DELETE FROM departure_groups WHERE id = ANY($1::uuid[])', ids(data.kloter));
    await hapus('DELETE FROM students WHERE id = ANY($1::uuid[])', ids(data.santri));
    await hapus('DELETE FROM courses WHERE id = ANY($1::uuid[])', ids(data.maddah));
    await hapus('DELETE FROM registrations WHERE id = ANY($1::uuid[])', ids(data.pendaftaran));
    await hapus('DELETE FROM dormitories WHERE id = ANY($1::uuid[])', ids(data.asrama));
    await hapus('DELETE FROM inquiries WHERE id = ANY($1::uuid[])', ids(data.pesan));
    await hapus('DELETE FROM notification_outbox WHERE account_id = ANY($1::uuid[])', akunIds);
    await tx.query('DELETE FROM rate_limit_hits WHERE bucket LIKE $1', [`%@${DEMO_DOMAIN}%`]);
    await hapus('DELETE FROM accounts WHERE id = ANY($1::uuid[])', akunIds);

    // Penomoran dimundurkan hanya bila nomor terakhir yang terbit memang milik data
    // demo, supaya pendaftar dan tagihan sungguhan pertama tetap mulai dari 00001.
    for (const nomor of nomorTerakhirDemo(data)) {
      const counter = (await tx.query('SELECT last_value FROM document_counters WHERE scope = $1 AND year = $2', [nomor.scope, nomor.tahun])).rows[0];
      if (!counter || Number(counter.last_value) !== nomor.urut) continue;
      const sisa = (await tx.query(SISA_NOMOR[nomor.scope], [String(nomor.tahun)])).rows[0].maks;
      if (sisa === null || sisa === undefined) {
        await tx.query('DELETE FROM document_counters WHERE scope = $1 AND year = $2', [nomor.scope, nomor.tahun]);
      } else {
        await tx.query('UPDATE document_counters SET last_value = $3, updated_at = now() WHERE scope = $1 AND year = $2', [nomor.scope, nomor.tahun, Number(sisa)]);
      }
    }
  });

  for (const file of data.berkas) {
    await storage.remove(file.bucket, file.storage_key);
    await database.query('DELETE FROM file_objects WHERE id = $1', [file.id]);
    logger.log(`  Berkas terhapus: ${file.bucket}/${file.storage_key}`);
  }
}

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
  return `demo-${crypto.randomBytes(9).toString('base64url')}`;
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
    console.log(`  ${p.nomor}  ${p.kode}  ${(LABEL_STATUS[p.status] || p.status).padEnd(19)} ${p.nama}`);
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
    console.log(`\nKata sandi SEMUA akun demo: ${kataSandi}`);
    if (!target.lokal) console.log('Kata sandi ini hanya ditampilkan sekali. Simpan sekarang.');
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

module.exports = {
  DEMO_ACCOUNTS,
  DEMO_COURSES,
  DEMO_DOMAIN,
  DEMO_DORMITORIES,
  DEMO_INQUIRIES,
  DEMO_INVENTORY,
  DEMO_KLOTER,
  DEMO_REGISTRATIONS,
  DEMO_STUDENTS,
  LOCAL_DEMO_PASSWORD,
  gantiSandiDemo,
  hapusDataDemo,
  isiDataDemo,
  temukanDataDemo,
  totalBaris
};
