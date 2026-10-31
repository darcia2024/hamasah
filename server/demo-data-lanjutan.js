'use strict';
// Data demo untuk fitur-fitur sesudah rapat pimpinan (migrasi 059 sampai 081). Lanjutan dari server/demo-data.js dengan
// prinsip yang sama: satu contoh yang terasa nyata untuk setiap fitur, semuanya masuk lewat service aplikasi (aturan
// validasi dan hak akses ikut berlaku), dan setiap langkah aman diulang karena hanya membuat yang belum ada.
//
// Semua contoh berpusat pada santri contoh Rayhan, asrama contohnya, dan akun demo per peran. Bagian yang tabelnya belum
// ada (database yang belum menerapkan migrasinya) dilewati, supaya langkah lain tetap bisa diisi.
//
// Pengaturan milik pemilik (rumus rapor, bobot KPI, batas peringatan dokumen, jenis surat) TIDAK diubah: data demo memakai
// isian bawaan dari migrasi. Karena itu rapor contoh berhenti di status "menunggu ditinjau", tidak diterbitkan.

const { createProgramService } = require('./program-service.js');
const { createDormitoryRoomService } = require('./dormitory-room-service.js');
const { createActivityAttendanceService } = require('./activity-attendance-service.js');
const { createTahfidzService } = require('./tahfidz-service.js');
const { createReportCardService } = require('./report-card-service.js');
const { createLetterArchiveService } = require('./letter-archive-service.js');
const { createKpiService } = require('./kpi-service.js');
const { createCentralMonitoringService } = require('./central-monitoring-service.js');
const { createInventoryService } = require('./inventory-service.js');
const { createAcContributionService } = require('./ac-contribution-service.js');
const { createPaymentIntegrationService } = require('./payment-integration-service.js');
const { createLmsProgramService } = require('./lms-program-service.js');
const { createStudentMessageService } = require('./student-message-service.js');
const { createParentFeedbackService } = require('./parent-feedback-service.js');
const { createResidenceService } = require('./residence-service.js');

const HARI_MS = 24 * 60 * 60 * 1000;

// Penanda yang dipakai saat menghapus data demo. Program, transaksi, dan pengumuman musyrif tidak terikat ke santri atau
// asrama demo, jadi dikenali dari nama atau nomornya.
const DEMO_PROGRAM = Object.freeze({ name: 'Pembinaan Mahasiswa Al-Azhar', batch: 'Angkatan 2025/2026', lokasi: 'Hamasah Mesir' });
const DEMO_REF_PEMBAYARAN = 'DEMO-XND-00001';
// Nama lama sebelum penyedia pembayarannya dikoreksi dari Sendit ke Xendit: diganti di tempat, bukan digandakan.
const DEMO_REF_PEMBAYARAN_LAMA = 'DEMO-SND-00001';
const DEMO_PENGUMUMAN_MUSYRIF = 'Rapat evaluasi bulanan musyrif';

// Langkah tambahan, dijalankan sesudah langkah demo yang lama (butuh akun, asrama, santri, tagihan, dan maddah).
const LANGKAH_LANJUTAN = Object.freeze([
  { id: 'lanjutan:program', label: 'Program, batch, kamar, dan kelas per program' },
  { id: 'lanjutan:kegiatan', label: 'Absensi kegiatan, setoran tahfidz, dan rapor bulanan' },
  { id: 'lanjutan:administrasi', label: 'Surat, urusan santri, laporan iqamah, dan KPI musyrif' },
  { id: 'lanjutan:asrama', label: 'Aset asrama, pemeriksaan bulanan, AC patungan, dan video galeri' },
  { id: 'lanjutan:pesan', label: 'Pesan pembinaan, kritik dan saran wali, dan pengumuman musyrif' },
  { id: 'lanjutan:keuangan', label: 'Transaksi pembayaran Xendit' }
]);

function tanggalJakarta(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);
}

// Tanggal YYYY-MM-DD (WIB) n hari sebelum hari ini; n negatif berarti mendatang.
function tanggal(n) {
  return tanggalJakarta(new Date(Date.now() - n * HARI_MS));
}

function bulanIni() {
  return tanggal(0).slice(0, 7);
}

async function tabelAda(database, tabel) {
  return Boolean((await database.query('SELECT to_regclass($1)::text AS ada', [tabel])).rows[0].ada);
}

async function kolomAda(database, tabel, kolom) {
  const { rows } = await database.query('SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2', [tabel, kolom]);
  return rows.length > 0;
}

async function satu(database, sql, params) {
  return (await database.query(sql, params)).rows[0] || null;
}

// Service fitur baru, dirakit seperti server/app.js. Waktu memakai jam sungguhan: banyak aturan "tidak boleh di masa
// depan" membandingkan dengan hari ini, jadi jam mundur demo lama tidak dipakai di sini.
function rakitLayananLanjutan(ctx) {
  const { database } = ctx;
  const L = ctx.layanan;
  const staffDormitories = (accountId) => L.dormitoryService.dormitoriesForStaff(accountId);
  const accessFor = (studentId, actor) => L.studentPortalService.accessFor(studentId, actor);
  const activityAttendance = createActivityAttendanceService({ database, staffDormitories });
  const tahfidz = createTahfidzService({ database, accessFor });
  return {
    program: createProgramService({ database, accessFor }),
    kamar: createDormitoryRoomService({ database, staffDormitories }),
    activityAttendance,
    tahfidz,
    rapor: createReportCardService({ database, accessFor, staffDormitories, activityAttendance, tahfidz }),
    surat: createLetterArchiveService({ database, staffDormitories, finalizeExit: async () => ({ ok: false, error: 'Tidak dipakai data demo.' }) }),
    kpi: createKpiService({ database }),
    pantauan: createCentralMonitoringService({ database, staffDormitories }),
    inventaris: createInventoryService({ database, staffDormitories }),
    ac: createAcContributionService({ database, staffDormitories }),
    pembayaran: createPaymentIntegrationService({ database, markInvoicePaid: (invoiceId, actor, input) => L.operationsService.markInvoicePaid(invoiceId, actor, input) }),
    lmsProgram: createLmsProgramService({ database, staffDormitories, lms: L.lmsService }),
    pesan: createStudentMessageService({ database, accessFor }),
    masukan: createParentFeedbackService({ database, accessFor, staffDormitories }),
    iqamah: createResidenceService({ database, accessFor, listStudentsForActor: (actor) => L.studentPortalService.listForActor(actor), staffDormitories })
  };
}

function wajib(hasil, label, KesalahanDemo) {
  if (!hasil || !hasil.ok) {
    const alasan = hasil && (hasil.error || JSON.stringify(hasil.errors || {}));
    throw new KesalahanDemo(`Gagal ${label}: ${alasan}`);
  }
  return hasil.value;
}

// Santri, asrama, dan akun contoh yang dipakai semua langkah di bawah.
function contoh(ctx, KesalahanDemo) {
  const santri = ctx.santri.rayhan;
  const asrama = ctx.asrama.putra;
  const { musyrif, guru, keuangan, petugas, wali } = ctx.aktor;
  const akunSantri = ctx.aktor.santri;
  if (!santri || !asrama || !musyrif || !guru || !keuangan || !petugas || !wali || !akunSantri) {
    throw new KesalahanDemo('Akun, asrama, atau santri demo belum ada. Jalankan langkah sebelumnya dulu.');
  }
  return { santri, asrama, musyrif, guru, keuangan, petugas, wali, akunSantri, admin: ctx.admin };
}

// ---------------------------------------------------------------------------------------------------------------------
// Program dan batch (060), kamar (059), dan maddah per program dengan sesi belajar bersama (076).

async function isiProgram(ctx, S, K) {
  const { database } = ctx;
  const c = contoh(ctx, K);
  let dibuat = 0;

  if (await tabelAda(database, 'program_batches')) {
    let program = await satu(database, `SELECT p.id FROM programs p JOIN locations l ON l.id = p.location_id WHERE p.name = $1 AND l.name = $2`, [DEMO_PROGRAM.name, DEMO_PROGRAM.lokasi]);
    if (!program) {
      const lokasi = await satu(database, 'SELECT id FROM locations WHERE name = $1', [DEMO_PROGRAM.lokasi]);
      if (lokasi) {
        program = wajib(await S.program.createProgram(lokasi.id, {
          name: DEMO_PROGRAM.name, kind: 'pembinaan', durationDays: 1460,
          description: 'Pembinaan santri yang kuliah S1 di Al-Azhar: halaqah tahfidz, talaqqi, dan pendampingan akademik di asrama.'
        }, c.admin), 'membuat program contoh', K);
        dibuat += 1;
      }
    }
    if (program) {
      let batch = await satu(database, 'SELECT id, status FROM program_batches WHERE program_id = $1 AND name = $2', [program.id, DEMO_PROGRAM.batch]);
      if (!batch) {
        batch = wajib(await S.program.createBatch(program.id, { name: DEMO_PROGRAM.batch, startsOn: tanggal(400), note: 'Angkatan yang berangkat Agustus tahun lalu.' }, c.admin), 'membuat batch contoh', K);
        batch.status = 'direncanakan';
        dibuat += 1;
      }
      if (batch.status === 'direncanakan') wajib(await S.program.updateBatch(batch.id, { status: 'berjalan' }, c.admin), 'menjalankan batch contoh', K);
      if (!(await satu(database, 'SELECT 1 FROM batch_participants WHERE batch_id = $1 AND student_id = $2', [batch.id, c.santri.id]))) {
        wajib(await S.program.addParticipants(batch.id, { studentIds: [String(c.santri.id)] }, c.admin), 'memasukkan santri ke batch', K);
        dibuat += 1;
      }
      // Maddah contoh dikelompokkan ke program ini (tanpa akses otomatis, supaya pendaftaran maddah yang sudah ada tidak berubah).
      const maddah = await satu(database, 'SELECT id, program_id FROM courses WHERE owner_account_id = $1 ORDER BY created_at LIMIT 1', [c.guru.id]);
      if (maddah && (await kolomAda(database, 'courses', 'program_id')) && !maddah.program_id) {
        wajib(await S.lmsProgram.setScope(maddah.id, { programId: program.id, level: 'Tingkat 1', autoAccess: false }, c.guru), 'mengelompokkan maddah ke program', K);
        dibuat += 1;
      }
    }
  }

  if (await tabelAda(database, 'dormitory_rooms')) {
    let kamar = await satu(database, 'SELECT id FROM dormitory_rooms WHERE dormitory_id = $1 ORDER BY created_at LIMIT 1', [c.asrama.id]);
    if (!kamar) {
      kamar = wajib(await S.kamar.createRoom(c.asrama.id, { name: 'Kamar 1', capacity: 4, hasAc: true, supervisorId: c.musyrif.id, note: 'Kamar depan lantai 2, dekat ruang belajar.' }, c.musyrif), 'membuat kamar contoh', K);
      dibuat += 1;
    }
    const tempat = await satu(database, 'SELECT room_id FROM students WHERE id = $1', [c.santri.id]);
    if (tempat && !tempat.room_id) {
      wajib(await S.kamar.placeStudent(c.santri.id, { dormitoryId: String(c.asrama.id), roomId: String(kamar.id), reason: 'Penempatan kamar awal tahun ajaran.' }, c.musyrif), 'menempatkan santri di kamar', K);
      dibuat += 1;
    }
  }

  if (await tabelAda(database, 'course_sessions')) {
    const maddah = await satu(database, 'SELECT id FROM courses WHERE owner_account_id = $1 ORDER BY created_at LIMIT 1', [c.guru.id]);
    if (maddah && !(await satu(database, 'SELECT 1 FROM course_sessions WHERE course_id = $1', [maddah.id]))) {
      const sesi = wajib(await S.lmsProgram.createSession(maddah.id, { title: 'Halaqah Nahwu bersama: bab kalam dan isim', heldOn: tanggal(3), dormitoryId: String(c.asrama.id), note: 'Dibahas bersama di ruang belajar asrama.' }, c.guru), 'membuat sesi belajar bersama', K);
      const terdaftar = await satu(database, 'SELECT 1 FROM course_enrollments WHERE course_id = $1 AND student_id = $2', [maddah.id, c.santri.id]);
      if (terdaftar) wajib(await S.lmsProgram.saveAttendance(sesi.id, { entries: [{ studentId: String(c.santri.id), status: 'hadir' }] }, c.guru), 'mencatat kehadiran sesi belajar', K);
      dibuat += 1;
    }
  }
  return dibuat;
}

// ---------------------------------------------------------------------------------------------------------------------
// Absensi kegiatan (066), buku setoran tahfidz (067), dan rapor bulanan (068).

async function isiKegiatan(ctx, S, K) {
  const { database } = ctx;
  const c = contoh(ctx, K);
  let dibuat = 0;

  if (await tabelAda(database, 'activity_sessions')) {
    if (!(await satu(database, 'SELECT 1 FROM activity_sessions WHERE dormitory_id = $1', [c.asrama.id]))) {
      const jenis = await satu(database, `SELECT id FROM activity_types WHERE active ORDER BY lower(name) = 'halaqah pagi' DESC, name LIMIT 1`, []);
      if (jenis) {
        const sesi = wajib(await S.activityAttendance.createSession({
          typeId: jenis.id, title: "Halaqah tahfizh ba'da Subuh", date: tanggal(1), startTime: '05:00', endTime: '06:00',
          location: 'Musholla asrama', groupKind: 'asrama', dormitoryId: String(c.asrama.id), staffAccountId: c.musyrif.id
        }, c.musyrif), 'membuat kegiatan contoh', K);
        wajib(await S.activityAttendance.setSessionStatus(sesi.id, { status: 'terlaksana' }, c.musyrif), 'menandai kegiatan terlaksana', K);
        wajib(await S.activityAttendance.saveAttendance(sesi.id, { entries: [{ studentId: String(c.santri.id), status: 'hadir' }] }, c.musyrif), 'mengisi absensi kegiatan', K);
        dibuat += 1;
      }
    }
  }

  if (await tabelAda(database, 'tahfidz_entries')) {
    if (!(await satu(database, 'SELECT 1 FROM tahfidz_entries WHERE student_id = $1', [c.santri.id]))) {
      wajib(await S.tahfidz.addEntry(c.santri.id, { date: tanggal(2), kind: 'ziyadah', surah: 67, ayahFrom: 1, ayahTo: 15, quality: 'lancar', examiner: 'Ust. Hanif Mubarok', note: 'Makhraj sudah baik, tinggal menjaga waqaf.' }, c.musyrif), 'mencatat setoran tahfidz', K);
      wajib(await S.tahfidz.addEntry(c.santri.id, { date: tanggal(1), kind: 'murajaah', surah: 78, ayahFrom: 1, ayahTo: 40, quality: 'kurang-lancar', examiner: 'Ust. Hanif Mubarok', note: 'Masih tertukar di ayat 31 sampai 34.' }, c.musyrif), 'mencatat murajaah', K);
      dibuat += 2;
    }
  }

  if (await tabelAda(database, 'monthly_reports')) {
    const bulan = new Date().toISOString().slice(0, 7);
    if (!(await satu(database, 'SELECT 1 FROM monthly_reports WHERE student_id = $1 AND month = $2', [c.santri.id, bulan]))) {
      wajib(await S.rapor.compose(c.santri.id, bulan, c.musyrif), 'menyusun rapor bulanan', K);
      wajib(await S.rapor.update(c.santri.id, bulan, {
        note: 'Bulan ini Rayhan rajin mengikuti halaqah pagi dan setoran hafalannya lancar. Masih perlu menjaga jam kembali ke asrama.',
        recommendation: 'Tambah murajaah Juz 30 sepekan dua kali dan ikut kelas percakapan hari Ahad.',
        status: 'review'
      }, c.musyrif), 'mengajukan rapor untuk ditinjau', K);
      dibuat += 1;
    }
  }
  return dibuat;
}

// ---------------------------------------------------------------------------------------------------------------------
// Surat dan arsip (070), urusan santri dengan penanggung jawab (069), laporan iqamah (055), dan KPI musyrif (071).

async function isiAdministrasi(ctx, S, K) {
  const { database } = ctx;
  const c = contoh(ctx, K);
  let dibuat = 0;

  if (await tabelAda(database, 'letters')) {
    if (!(await satu(database, 'SELECT 1 FROM letters WHERE student_id = $1', [c.santri.id]))) {
      const jenis = await satu(database, `SELECT id FROM letter_types WHERE code = 'pernyataan-tata-tertib' AND active`, []);
      if (jenis) {
        const surat = wajib(await S.surat.create({
          typeId: jenis.id, studentId: String(c.santri.id), letterDate: tanggal(6),
          subject: 'Pernyataan persetujuan tata tertib asrama tahun ajaran ini',
          notes: 'Ditandatangani wali saat kunjungan ke kantor Hamasah Semarang, lalu dikirim lewat pos.'
        }, c.musyrif), 'mencatat surat contoh', K);
        wajib(await S.surat.verify(surat.id, { note: 'Tanda tangan wali dan materai sudah dicek.' }, c.petugas), 'memverifikasi surat contoh', K);
        dibuat += 1;
      }
    }
  }

  if (await kolomAda(database, 'student_cases', 'assignee_account_id')) {
    if (!(await satu(database, `SELECT 1 FROM student_cases WHERE student_id = $1 AND source = 'manual'`, [c.santri.id]))) {
      wajib(await S.pantauan.create({
        kind: 'lapor-diri', studentId: String(c.santri.id), dueOn: tanggal(-12), assigneeAccountId: c.musyrif.id,
        note: 'Lapor diri tahunan ke KBRI Kairo. Siapkan fotokopi paspor dan iqamah.'
      }, c.admin), 'mencatat urusan lapor diri', K);
      dibuat += 1;
    }
  }

  if (await tabelAda(database, 'residence_reports')) {
    if (!(await satu(database, 'SELECT 1 FROM residence_reports WHERE student_id = $1', [c.santri.id]))) {
      wajib(await S.iqamah.report(c.santri.id, { expiresOn: tanggal(-390), note: 'Sudah diperpanjang satu tahun di kantor imigrasi Abbasiyah.' }, c.akunSantri), 'melaporkan tanggal iqamah baru', K);
      dibuat += 1;
    }
  }

  if (await tabelAda(database, 'kpi_evaluations')) {
    // Draf yang sudah ada dihitung ulang juga: draf yang disusun sebelum kegiatan demo terisi masih berbunyi "belum ada data".
    const kpi = await satu(database, 'SELECT status FROM kpi_evaluations WHERE musyrif_account_id = $1 AND month = $2', [c.musyrif.id, bulanIni()]);
    if (!kpi || kpi.status !== 'final') {
      wajib(await S.kpi.evaluate(c.musyrif.id, bulanIni(), c.admin), 'menyusun penilaian KPI musyrif', K);
      if (!kpi) dibuat += 1;
    }
  }
  return dibuat;
}

// ---------------------------------------------------------------------------------------------------------------------
// Aset asrama dengan sumber dana dan pemilik (075, 081), pemeriksaan bulanan, AC patungan (075), dan video galeri (079).

async function isiAsrama(ctx, S, K) {
  const { database } = ctx;
  const c = contoh(ctx, K);
  let dibuat = 0;

  if (await kolomAda(database, 'dormitory_inventory', 'funding_source')) {
    if (!(await satu(database, `SELECT 1 FROM dormitory_inventory WHERE dormitory_id = $1 AND funding_source <> ''`, [c.asrama.id]))) {
      wajib(await S.inventaris.createItem(c.asrama.id, {
        name: 'Kipas angin dinding', quantity: 2, category: 'elektronik', location: 'Kamar 1', purchasedOn: tanggal(60), unitPrice: 350000,
        fundingSource: 'kas-asrama', note: 'Dibeli dari kas asrama setelah musim panas.'
      }, c.musyrif), 'mencatat aset dengan sumber dana', K);
      wajib(await S.inventaris.createItem(c.asrama.id, {
        name: 'Kasur lipat', quantity: 1, category: 'perlengkapan-tidur', location: 'Kamar 1', ownerType: 'santri', ownerStudentId: String(c.santri.id),
        note: 'Dibawa sendiri dari Indonesia.'
      }, c.musyrif), 'mencatat barang pribadi santri', K);
      dibuat += 2;
    }
    if (!(await satu(database, 'SELECT 1 FROM inventory_checks WHERE dormitory_id = $1', [c.asrama.id]))) {
      wajib(await S.inventaris.startCheck(c.asrama.id, bulanIni(), c.musyrif), 'memulai pemeriksaan bulanan', K);
      dibuat += 1;
    }
  }

  if (await tabelAda(database, 'dormitory_ac_units')) {
    let unit = await satu(database, 'SELECT id FROM dormitory_ac_units WHERE dormitory_id = $1 AND archived_at IS NULL', [c.asrama.id]);
    if (!unit) {
      const kamar = (await tabelAda(database, 'dormitory_rooms')) ? await satu(database, 'SELECT id FROM dormitory_rooms WHERE dormitory_id = $1 ORDER BY created_at LIMIT 1', [c.asrama.id]) : null;
      unit = wajib(await S.ac.createUnit({
        dormitoryId: String(c.asrama.id), roomId: kamar ? String(kamar.id) : null, label: 'AC Kamar 1', ownership: 'patungan',
        purchaseTotal: 9000000, installTotal: 600000, purchasedOn: tanggal(45), refundPurchase: true, refundInstall: false,
        terms: 'Iuran beli dikembalikan penuh bila santri keluar sebelum satu tahun sejak AC dipasang. Iuran pasang tidak dikembalikan.'
      }, c.keuangan), 'mencatat AC patungan', K);
      dibuat += 1;
    }
    if (!(await satu(database, 'SELECT 1 FROM ac_contributions WHERE ac_id = $1 AND student_id = $2', [unit.id, c.santri.id]))) {
      wajib(await S.ac.addContribution(unit.id, { kind: 'pembelian', amount: 2250000, paidOn: tanggal(44), studentId: String(c.santri.id), note: 'Transfer dari wali.' }, c.keuangan), 'mencatat iuran AC', K);
      dibuat += 1;
    }
  }

  if (await kolomAda(database, 'dormitory_gallery', 'youtube_id')) {
    if (!(await satu(database, 'SELECT 1 FROM dormitory_gallery WHERE dormitory_id = $1 AND youtube_id IS NOT NULL', [c.asrama.id]))) {
      wajib(await ctx.layanan.dormitoryManagementService.addPhoto(c.asrama.id, {
        mediaType: 'video', youtubeUrl: 'https://youtu.be/qKaR8eTDIl4', caption: 'Halaqah Nahwu sore bersama musyrif', category: 'belajar', takenOn: tanggal(6)
      }, c.musyrif), 'menambah video galeri', K);
      dibuat += 1;
    }
  }
  return dibuat;
}

// ---------------------------------------------------------------------------------------------------------------------
// Pesan pembinaan pribadi (065), kritik dan saran wali dengan balasan (064), dan pengumuman khusus musyrif (080).

async function isiPesan(ctx, S, K) {
  const { database } = ctx;
  const c = contoh(ctx, K);
  let dibuat = 0;

  if (await tabelAda(database, 'student_personal_messages')) {
    if (!(await satu(database, 'SELECT 1 FROM student_personal_messages WHERE student_id = $1', [c.santri.id]))) {
      wajib(await S.pesan.send(c.santri.id, {
        kind: 'evaluasi', subject: 'Evaluasi pekan ini',
        body: 'Alhamdulillah setoran Al-Mulk 1-15 lancar. Pekan depan coba lanjut ke ayat 16-30, dan jangan lupa kembali ke asrama sebelum jam malam.'
      }, c.musyrif), 'mengirim pesan pembinaan', K);
      dibuat += 1;
    }
  }

  if (await tabelAda(database, 'parent_feedback')) {
    if (!(await satu(database, 'SELECT 1 FROM parent_feedback WHERE parent_account_id = $1', [c.wali.id]))) {
      const masukan = wajib(await S.masukan.send({
        kind: 'saran', studentId: String(c.santri.id), subject: 'Jadwal kabar dari asrama',
        body: 'Kalau bisa, kabar kegiatan asrama dikirim rutin tiap akhir pekan, supaya kami di Indonesia bisa ikut memantau.'
      }, c.wali), 'mengirim kritik dan saran wali', K);
      const id = (masukan && (masukan.id || (masukan.feedback && masukan.feedback.id)));
      if (id) wajib(await S.masukan.handle(id, { status: 'ditindaklanjuti', reply: 'Terima kasih, Bapak. Mulai pekan ini ringkasan kegiatan dikirim setiap Jumat lewat kotak pesan.' }, c.admin), 'membalas kritik dan saran', K);
      dibuat += 1;
    }
  }

  // Pengumuman musyrif butuh migrasi 080; database yang belum menerapkannya dilewati.
  const bolehMusyrif = await satu(database, `SELECT 1 FROM pg_constraint WHERE conname = 'announcements_audience_check' AND pg_get_constraintdef(oid) LIKE '%musyrif%'`, []);
  if (bolehMusyrif && !(await satu(database, `SELECT 1 FROM announcements WHERE audience = 'musyrif' AND title = $1`, [DEMO_PENGUMUMAN_MUSYRIF]))) {
    wajib(await ctx.layanan.studentLifeService.createAnnouncement({
      title: DEMO_PENGUMUMAN_MUSYRIF, audience: 'musyrif', expiresOn: tanggal(-14),
      body: "Rapat evaluasi bulanan musyrif hari Kamis ba'da Ashar di kantor Hamasah Kairo. Mohon siapkan rekap presensi dan catatan santri yang perlu perhatian."
    }, c.admin), 'menulis pengumuman untuk musyrif', K);
    dibuat += 1;
  }
  return dibuat;
}

// ---------------------------------------------------------------------------------------------------------------------
// Transaksi pembayaran lewat Xendit yang menunggu dicocokkan (074).

async function isiKeuangan(ctx, S, K) {
  const { database } = ctx;
  const c = contoh(ctx, K);
  if (!(await tabelAda(database, 'external_payments'))) return 0;
  await database.query('UPDATE external_payments SET external_ref = $1 WHERE external_ref = $2', [DEMO_REF_PEMBAYARAN, DEMO_REF_PEMBAYARAN_LAMA]);
  if (await satu(database, 'SELECT 1 FROM external_payments WHERE external_ref = $1', [DEMO_REF_PEMBAYARAN])) return 0;
  const tagihan = await satu(database, `SELECT invoice_number, amount_rupiah FROM invoices WHERE student_id = $1 AND status = 'unpaid' AND voided_at IS NULL ORDER BY issued_at LIMIT 1`, [c.santri.id]);
  if (!tagihan) return 0;
  wajib(await S.pembayaran.record({
    source: 'xendit', externalRef: DEMO_REF_PEMBAYARAN, amount: Number(tagihan.amount_rupiah), paidOn: tanggal(1),
    invoiceNumber: tagihan.invoice_number, payerName: 'Bambang Sutrisno Wibowo'
  }, c.keuangan), 'mencatat transaksi Xendit', K);
  return 1;
}

const PENGISI = Object.freeze({
  'lanjutan:program': isiProgram,
  'lanjutan:kegiatan': isiKegiatan,
  'lanjutan:administrasi': isiAdministrasi,
  'lanjutan:asrama': isiAsrama,
  'lanjutan:pesan': isiPesan,
  'lanjutan:keuangan': isiKeuangan
});

async function jalankanLangkahLanjutan(ctx, langkah, KesalahanDemo) {
  const isi = PENGISI[langkah];
  if (!isi) throw new KesalahanDemo('Langkah data demo tidak dikenal.');
  return isi(ctx, rakitLayananLanjutan(ctx), KesalahanDemo);
}

// Menghapus data fitur baru yang tidak ikut terhapus bersama santri, asrama, atau akun demo. Dijalankan di dalam
// transaksi penghapusan, sebelum santri dihapus: surat dan iuran AC menahan penghapusan santri (ON DELETE RESTRICT).
async function hapusDataLanjutan(tx, { santriIds, akunIds }) {
  const ada = async (tabel) => Boolean((await tx.query('SELECT to_regclass($1)::text AS ada', [tabel])).rows[0].ada);
  if (santriIds.length) {
    if (await ada('letters')) await tx.query('DELETE FROM letters WHERE student_id = ANY($1::uuid[])', [santriIds]);
    if (await ada('ac_refunds')) await tx.query('DELETE FROM ac_refunds WHERE student_id = ANY($1::uuid[])', [santriIds]);
    if (await ada('ac_contributions')) await tx.query('DELETE FROM ac_contributions WHERE student_id = ANY($1::uuid[])', [santriIds]);
  }
  if (await ada('external_payments')) await tx.query('DELETE FROM external_payments WHERE external_ref = ANY($1::text[])', [[DEMO_REF_PEMBAYARAN, DEMO_REF_PEMBAYARAN_LAMA]]);
  // Kritik dan saran wali tidak ikut terhapus bersama akun wali (ON DELETE SET NULL), jadi dihapus di sini.
  if (await ada('parent_feedback') && akunIds.length) await tx.query('DELETE FROM parent_feedback WHERE parent_account_id = ANY($1::uuid[])', [akunIds]);
  await tx.query(`DELETE FROM announcements WHERE audience = 'musyrif' AND title = $1`, [DEMO_PENGUMUMAN_MUSYRIF]).catch(() => {});
  // Program contoh hanya dihapus bila tidak punya peserta selain santri demo.
  if (await ada('programs')) {
    await tx.query(
      `DELETE FROM programs p USING locations l
        WHERE l.id = p.location_id AND p.name = $1 AND l.name = $2
          AND NOT EXISTS (SELECT 1 FROM program_batches b JOIN batch_participants bp ON bp.batch_id = b.id
                           WHERE b.program_id = p.id AND NOT (bp.student_id = ANY($3::uuid[])))`,
      [DEMO_PROGRAM.name, DEMO_PROGRAM.lokasi, santriIds]
    );
  }
}

module.exports = { LANGKAH_LANJUTAN, DEMO_PROGRAM, DEMO_REF_PEMBAYARAN, DEMO_PENGUMUMAN_MUSYRIF, jalankanLangkahLanjutan, hapusDataLanjutan };
