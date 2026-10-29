'use strict';
// Profil santri terintegrasi (migrasi 061): kontak, pendidikan, status paspor dan iqamah,
// penempatan asrama dan kamar, riwayat status, dan dokumen pribadi.
//
// Bagian profil yang sudah punya sumber sendiri (kehadiran, hafalan, catatan pembinaan, rapor,
// tagihan, izin, riwayat program) tidak disalin ke sini; layar profil memuatnya dari endpoint
// masing-masing. Di sini hanya yang belum tersimpan di tempat lain.
//
// Hak akses mengikuti accessFor milik student-portal-service: admin melihat semuanya; musyrif
// hanya santri di asramanya; santri hanya dirinya; wali hanya anaknya.
//   - Nomor paspor dan iqamah: penuh hanya untuk admin, tersamar untuk pihak lain.
//   - Dokumen: setiap dokumen punya visibilitas (admin, staf, keluarga). Staf = admin dan
//     musyrif yang berhak atas santri itu; keluarga = staf ditambah santri dan walinya.
//   - Mengubah profil: admin semua kolom; musyrif hanya kontak, pendidikan, dan status paspor
//     manual untuk santri di asramanya.
//
// Kode ini boleh online lebih dulu daripada migrasi: selama tabelnya belum ada, profil tetap
// menampilkan data dasar (available: false) dan penyimpanan dibalas 409 dengan arahan ke Pengaturan.

const crypto = require('node:crypto');
const { enkripsi, dekripsi } = require('./field-encryption.js');

const HARI_MS = 24 * 60 * 60 * 1000;
const PASPOR_HAMPIR_HARI = 180;
const IQAMAH_HAMPIR_HARI = 60;
const STATUS_SANTRI = Object.freeze({ active: 'Aktif', leave: 'Cuti atau izin panjang', graduated: 'Selesai (lulus)', withdrawn: 'Mengundurkan diri', inactive: 'Nonaktif', archived: 'Arsip' });
const STATUS_PENDIDIKAN = Object.freeze({ aktif: 'Aktif', cuti: 'Cuti', bermasalah: 'Bermasalah', lulus: 'Lulus' });
const STATE_PASPOR = Object.freeze({ hilang: 'Hilang', rusak: 'Rusak', diurus: 'Sedang diurus' });
const JENIS_DOKUMEN = Object.freeze({ paspor: 'Paspor', iqamah: 'Iqamah', identitas: 'Identitas (KTP, KK, akta)', ijazah: 'Ijazah dan transkrip', surat: 'Surat', kesehatan: 'Kesehatan', lainnya: 'Lainnya' });
const VISIBILITAS = Object.freeze({ admin: 'Hanya admin', staf: 'Admin dan musyrif asrama', keluarga: 'Termasuk santri dan wali' });
const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk profil santri. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';

// Kolom yang boleh diubah, per peran.
const KOLOM_KONTAK = Object.freeze({ phone: 30, email: 120, homeAddress: 300, emergencyName: 80, emergencyPhone: 30 });
const KOLOM_PENDIDIKAN = Object.freeze({ educationLevel: 60, institution: 120, major: 120, educationNote: 300 });
const KOLOM_ADMIN = Object.freeze({ birthPlace: 80, nationality: 60, passportNumber: 40, iqamahNumber: 40 });
// Nomor identitas disimpan terenkripsi (field-encryption.js).
const KOLOM_TERENKRIPSI = Object.freeze(['passportNumber', 'iqamahNumber']);
const SNAKE = Object.freeze({
  phone: 'phone', email: 'email', homeAddress: 'home_address', emergencyName: 'emergency_name', emergencyPhone: 'emergency_phone',
  educationLevel: 'education_level', institution: 'institution', major: 'major', educationNote: 'education_note',
  birthPlace: 'birth_place', nationality: 'nationality', passportNumber: 'passport_number', iqamahNumber: 'iqamah_number'
});

function tabelBelumAda(error) {
  if (!error) return false;
  if (error.code === '42P01' || error.code === '42703') return true;
  return /(student_profiles|student_status_history|student_documents|room_id)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function bersih(value, maks) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, maks);
}

function adaId(value) {
  return /^[\w-]{8,64}$/.test(String(value || ''));
}

function samarkan(nilai) {
  const teks = String(nilai || '');
  return teks ? `••••${teks.slice(-3)}` : '';
}

function teksTanggal(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : (value ? new Date(value).toISOString() : null);
}

function tanggalJakarta(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);
}

function selisihHari(dari, ke) {
  return Math.round((new Date(`${ke}T00:00:00Z`) - new Date(`${dari}T00:00:00Z`)) / HARI_MS);
}

// Status dokumen identitas: yang tidak bisa dihitung dari tanggal (hilang, rusak, sedang diurus)
// dicatat manual dan menang atas tanggal.
function keadaanDokumen(tanggal, hariIni, hampirHari, manual) {
  if (manual && STATE_PASPOR[manual]) return { state: manual, label: STATE_PASPOR[manual], expiresOn: teksTanggal(tanggal), daysLeft: tanggal ? selisihHari(hariIni, teksTanggal(tanggal)) : null };
  if (!tanggal) return { state: 'belum-dicatat', label: 'Belum dicatat', expiresOn: null, daysLeft: null };
  const sisa = selisihHari(hariIni, teksTanggal(tanggal));
  const state = sisa < 0 ? 'kedaluwarsa' : sisa <= hampirHari ? 'hampir-kedaluwarsa' : 'aktif';
  return { state, label: { kedaluwarsa: 'Kedaluwarsa', 'hampir-kedaluwarsa': 'Hampir kedaluwarsa', aktif: 'Aktif' }[state], expiresOn: teksTanggal(tanggal), daysLeft: sisa };
}

function createStudentProfileService({ database, accessFor, identityKey = 'development-only-key', now = () => new Date() } = {}) {
  if (!database || typeof accessFor !== 'function') throw new Error('createStudentProfileService membutuhkan database dan accessFor.');

  async function ambil(sql, params = []) {
    return (await database.query(sql, params)).rows;
  }

  async function tulis(fn) {
    try {
      return await fn();
    } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      throw error;
    }
  }

  async function bacaBoleh(fn, kosong) {
    try {
      return await fn();
    } catch (error) {
      if (tabelBelumAda(error)) return kosong;
      throw error;
    }
  }

  async function akses(studentId, actor, perlu) {
    if (!actor) return { ok: false, status: 403, error: 'Akses santri ini tidak diizinkan.' };
    if (!adaId(studentId)) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    const hasil = await accessFor(studentId, actor);
    if (!hasil.exists) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    if (!hasil[perlu]) return { ok: false, status: 403, error: 'Akses santri ini tidak diizinkan.' };
    return { ok: true, akses: hasil };
  }

  // Tingkat visibilitas dokumen yang boleh dibuka pelaku: admin 3, staf 2, keluarga 1.
  function tingkatBuka(actor, aksesSantri) {
    if (actor.role === 'admin') return 3;
    if (['supervisor', 'registration-officer'].includes(actor.role) && aksesSantri.view) return 2;
    return 1;
  }

  const URUT_VISIBILITAS = Object.freeze({ admin: 3, staf: 2, keluarga: 1 });

  function bentukDokumen(row) {
    return {
      id: row.id, kind: row.kind, kindLabel: JENIS_DOKUMEN[row.kind] || row.kind, title: row.title,
      visibility: row.visibility, visibilityLabel: VISIBILITAS[row.visibility], fileId: row.file_id,
      fileName: row.original_name || null, contentType: row.content_type || null, sizeBytes: row.size_bytes ? Number(row.size_bytes) : null,
      uploadedBy: row.uploaded_by || null, createdAt: iso(row.created_at), archived: Boolean(row.archived_at)
    };
  }

  // ------------------------------------------------------------------ baca profil

  async function profile(studentId, actor) {
    const izin = await akses(studentId, actor, 'view');
    if (!izin.ok) return izin;
    const admin = actor.role === 'admin';
    const staf = admin || izin.akses.staff;
    const hariIni = tanggalJakarta(now());
    const siswa = (await ambil(
      `SELECT s.id, s.name, s.program, s.city, s.gender, s.status, to_char(s.join_date, 'YYYY-MM-DD') AS join_date,
              to_char(s.birth_date, 'YYYY-MM-DD') AS birth_date, s.dormitory_id, d.name AS dormitory_name
       FROM students s LEFT JOIN dormitories d ON d.id = s.dormitory_id WHERE s.id = $1`, [studentId]
    ))[0];
    const visa = (await bacaBoleh(() => ambil(
      `SELECT status, passport_expires_at, visa_expires_at FROM visa_tracking WHERE student_id = $1`, [studentId]
    ), []))[0] || null;

    let tersedia = true;
    let profil = null;
    let riwayatStatus = [];
    let dokumen = [];
    let kasus = [];
    try {
      profil = (await ambil('SELECT * FROM student_profiles WHERE student_id = $1', [studentId]))[0] || null;
      if (staf) {
        riwayatStatus = await ambil(
          `SELECT h.from_status, h.to_status, h.reason, h.changed_at, acc.name AS changed_by FROM student_status_history h
           LEFT JOIN accounts acc ON acc.id = h.changed_by_account_id WHERE h.student_id = $1 ORDER BY h.changed_at DESC LIMIT 30`, [studentId]
        );
      }
      // Wali ikut melihat urusan administrasi anaknya (tanpa catatan internal), supaya tahu apa yang sedang diurus.
      if (staf || actor.role === 'parent' || actor.role === 'student') {
        kasus = await bacaBoleh(() => ambil(
          `SELECT c.kind, c.ref, c.status, c.note, to_char(c.due_on, 'YYYY-MM-DD') AS due_on FROM student_cases c
           WHERE c.student_id = $1 AND c.status <> 'selesai' AND c.kind IN ('lapor-diri', 'lapor-pendidikan', 'status-pendidikan') ORDER BY c.due_on NULLS LAST`, [studentId]
        ), []);
      }
      const rows = await ambil(
        `SELECT d.*, f.original_name, f.content_type, f.size_bytes, acc.name AS uploaded_by FROM student_documents d
         JOIN file_objects f ON f.id = d.file_id LEFT JOIN accounts acc ON acc.id = d.uploaded_by_account_id
         WHERE d.student_id = $1 AND d.archived_at IS NULL AND f.status = 'ready' ORDER BY d.created_at DESC`, [studentId]
      );
      const batas = tingkatBuka(actor, izin.akses);
      dokumen = rows.filter((row) => URUT_VISIBILITAS[row.visibility] <= batas).map(bentukDokumen);
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      tersedia = false;
    }

    // Kamar dan penghuni asrama; boleh belum ada (migrasi 059).
    let kamar = null;
    let pembina = [];
    let penempatan = [];
    if (siswa.dormitory_id) {
      pembina = (await ambil(
        `SELECT acc.name FROM staff_dormitory_assignments a JOIN accounts acc ON acc.id = a.account_id WHERE a.dormitory_id = $1 AND acc.active ORDER BY acc.name`, [siswa.dormitory_id]
      )).map((row) => row.name);
      kamar = await bacaBoleh(async () => {
        const baris = (await ambil(
          `SELECT r.id, r.name, r.capacity, r.has_ac, acc.name AS supervisor_name FROM students s JOIN dormitory_rooms r ON r.id = s.room_id AND r.dormitory_id = s.dormitory_id
           LEFT JOIN accounts acc ON acc.id = r.supervisor_account_id WHERE s.id = $1`, [studentId]
        ))[0];
        return baris ? { id: baris.id, name: baris.name, capacity: Number(baris.capacity), hasAc: Boolean(baris.has_ac), supervisorName: baris.supervisor_name || null } : null;
      }, null);
    }
    penempatan = await bacaBoleh(async () => (await ambil(
      `SELECT h.from_label, h.to_label, h.reason, h.moved_at FROM placement_history h WHERE h.student_id = $1 ORDER BY h.moved_at DESC LIMIT 20`, [studentId]
    )).map((row) => ({ from: row.from_label, to: row.to_label, reason: row.reason || '', movedAt: iso(row.moved_at) })), []);

    const wali = await ambil(`SELECT acc.id, acc.name, acc.email FROM student_parent_accounts sp JOIN accounts acc ON acc.id = sp.parent_account_id WHERE sp.student_id = $1 ORDER BY acc.name`, [studentId]);
    const p = profil || {};
    const nomorPaspor = dekripsi(p.passport_number, identityKey);
    const nomorIqamah = dekripsi(p.iqamah_number, identityKey);
    const kontak = staf || actor.role === 'student' || actor.role === 'parent';
    return {
      ok: true,
      value: {
        available: tersedia,
        studentId,
        name: siswa.name,
        status: { value: siswa.status, label: STATUS_SANTRI[siswa.status] || siswa.status, history: riwayatStatus.map((h) => ({ from: STATUS_SANTRI[h.from_status] || h.from_status, to: STATUS_SANTRI[h.to_status] || h.to_status, reason: h.reason || '', changedAt: iso(h.changed_at), changedBy: h.changed_by || null })) },
        personal: {
          birthDate: siswa.birth_date || null, birthPlace: p.birth_place || '', nationality: p.nationality || '', gender: siswa.gender || null,
          city: siswa.city, joinDate: siswa.join_date,
          phone: kontak ? (p.phone || '') : '', email: kontak ? (p.email || '') : '', homeAddress: kontak ? (p.home_address || '') : '',
          emergencyName: kontak ? (p.emergency_name || '') : '', emergencyPhone: kontak ? (p.emergency_phone || '') : ''
        },
        identifiers: {
          passportNumber: admin ? nomorPaspor : samarkan(nomorPaspor),
          iqamahNumber: admin ? nomorIqamah : samarkan(nomorIqamah),
          masked: !admin
        },
        education: {
          program: siswa.program, level: p.education_level || '', institution: p.institution || '', major: p.major || '',
          studyYear: p.study_year === undefined || p.study_year === null ? null : Number(p.study_year),
          status: p.education_status || '', statusLabel: STATUS_PENDIDIKAN[p.education_status] || '', note: p.education_note || ''
        },
        passport: { ...keadaanDokumen(visa && visa.passport_expires_at, hariIni, PASPOR_HAMPIR_HARI, p.passport_state), manual: p.passport_state || '' },
        iqamah: { ...keadaanDokumen(visa && visa.visa_expires_at, hariIni, IQAMAH_HAMPIR_HARI, ''), visaStatus: visa ? visa.status : null },
        placement: {
          dormitory: siswa.dormitory_id ? { id: siswa.dormitory_id, name: siswa.dormitory_name } : null,
          room: kamar, supervisors: pembina, history: penempatan
        },
        administrativeCases: kasus.map((k) => ({ kind: k.kind, ref: k.ref, status: k.status, note: staf ? (k.note || '') : '', dueOn: k.due_on || null })),
        guardians: wali.map((w) => ({ id: w.id, name: w.name, email: staf ? w.email : null })),
        documents: dokumen,
        options: { documentKinds: Object.entries(JENIS_DOKUMEN).map(([id, label]) => ({ id, label })), visibilities: Object.entries(VISIBILITAS).filter(([id]) => id !== 'admin' || admin).map(([id, label]) => ({ id, label })), statuses: Object.entries(STATUS_SANTRI).map(([id, label]) => ({ id, label })), educationStatuses: Object.entries(STATUS_PENDIDIKAN).map(([id, label]) => ({ id, label })), passportStates: Object.entries(STATE_PASPOR).map(([id, label]) => ({ id, label })) },
        can: {
          editContact: staf && izin.akses.write, editEducation: staf && izin.akses.write, editPassportState: staf && izin.akses.write,
          editIdentity: admin, changeStatus: admin, uploadDocuments: staf && izin.akses.write, archiveDocuments: staf && izin.akses.write
        }
      }
    };
  }

  // ------------------------------------------------------------------ ubah profil

  async function updateProfile(studentId, input, actor) {
    const izin = await akses(studentId, actor, 'write');
    if (!izin.ok) return izin;
    if (!['admin', 'supervisor'].includes(actor.role)) return { ok: false, status: 403, error: 'Hanya admin dan musyrif yang mengubah profil.' };
    const admin = actor.role === 'admin';
    const sumber = input || {};
    const boleh = { ...KOLOM_KONTAK, ...KOLOM_PENDIDIKAN, ...(admin ? KOLOM_ADMIN : {}) };
    const ditolak = Object.keys(sumber).filter((k) => (KOLOM_ADMIN[k] && !admin));
    if (ditolak.length) return { ok: false, status: 403, error: 'Tempat lahir, kewarganegaraan, dan nomor paspor atau iqamah hanya diubah admin.' };
    const nilai = {};
    Object.entries(boleh).forEach(([kunci, maks]) => {
      if (sumber[kunci] === undefined) return;
      const teks = bersih(sumber[kunci], maks);
      nilai[SNAKE[kunci]] = KOLOM_TERENKRIPSI.includes(kunci) ? enkripsi(teks, identityKey) : teks;
    });
    if (nilai.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nilai.email)) return { ok: false, status: 422, error: 'Alamat email belum valid.' };
    if (sumber.studyYear !== undefined) {
      const tahun = sumber.studyYear === null || sumber.studyYear === '' ? null : Number(sumber.studyYear);
      if (tahun !== null && (!Number.isInteger(tahun) || tahun < 1 || tahun > 12)) return { ok: false, status: 422, error: 'Tahun studi 1 sampai 12.' };
      nilai.study_year = tahun;
    }
    if (sumber.educationStatus !== undefined) {
      const status = bersih(sumber.educationStatus, 20);
      if (status && !STATUS_PENDIDIKAN[status]) return { ok: false, status: 422, error: 'Status pendidikan belum valid.' };
      nilai.education_status = status;
    }
    if (sumber.passportState !== undefined) {
      const state = bersih(sumber.passportState, 20);
      if (state && !STATE_PASPOR[state]) return { ok: false, status: 422, error: 'Status paspor belum valid.' };
      nilai.passport_state = state;
    }
    const kolom = Object.keys(nilai);
    if (!kolom.length) return { ok: false, status: 422, error: 'Tidak ada data yang diubah.' };
    return tulis(async () => {
      const awal = kolom.map((k, i) => `$${i + 3}`);
      await ambil(
        `INSERT INTO student_profiles (student_id, updated_by_account_id, ${kolom.join(', ')}) VALUES ($1, $2, ${awal.join(', ')})
         ON CONFLICT (student_id) DO UPDATE SET ${kolom.map((k) => `${k} = EXCLUDED.${k}`).join(', ')}, updated_by_account_id = EXCLUDED.updated_by_account_id, updated_at = now()`,
        [studentId, actor.id || null, ...kolom.map((k) => nilai[k])]
      );
      return { ok: true, value: { studentId, fields: kolom } };
    });
  }

  // Catat perubahan status (dipanggil route setelah updateStudent berhasil mengubah status).
  async function recordStatusChange(studentId, dari, ke, alasan, actor) {
    if (!dari || !ke || dari === ke) return { ok: true, value: { recorded: false } };
    return tulis(async () => {
      await ambil(
        `INSERT INTO student_status_history (id, student_id, from_status, to_status, reason, changed_by_account_id, changed_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [crypto.randomUUID(), studentId, dari, ke, bersih(alasan, 300), actor && actor.id ? actor.id : null, now().toISOString()]
      );
      return { ok: true, value: { recorded: true } };
    });
  }

  // ------------------------------------------------------------------ dokumen

  // Daftarkan dokumen yang berkasnya sudah diunggah lewat /api/uploads (purpose student-document):
  // { fileId, kind, title, visibility }.
  async function addDocument(studentId, input, actor) {
    const izin = await akses(studentId, actor, 'write');
    if (!izin.ok) return izin;
    if (!['admin', 'supervisor'].includes(actor.role)) return { ok: false, status: 403, error: 'Hanya admin dan musyrif yang menambah dokumen.' };
    const sumber = input || {};
    const jenis = bersih(sumber.kind, 20);
    const judul = bersih(sumber.title, 120);
    const visibilitas = bersih(sumber.visibility, 20) || 'staf';
    if (!adaId(sumber.fileId)) return { ok: false, status: 422, error: 'Unggah berkasnya dulu.' };
    if (!JENIS_DOKUMEN[jenis]) return { ok: false, status: 422, error: 'Pilih jenis dokumen.' };
    if (judul.length < 2) return { ok: false, status: 422, error: 'Isi judul dokumen.' };
    if (!VISIBILITAS[visibilitas]) return { ok: false, status: 422, error: 'Pilih siapa yang boleh membuka dokumen ini.' };
    if (visibilitas === 'admin' && actor.role !== 'admin') return { ok: false, status: 403, error: 'Hanya admin yang membatasi dokumen untuk admin saja.' };
    return tulis(async () => {
      const berkas = (await ambil('SELECT id, purpose, entity_id, status FROM file_objects WHERE id = $1', [sumber.fileId]))[0];
      if (!berkas || berkas.purpose !== 'student-document' || String(berkas.entity_id) !== String(studentId)) return { ok: false, status: 422, error: 'Berkas ini bukan dokumen santri tersebut.' };
      if (berkas.status !== 'ready') return { ok: false, status: 409, error: 'Berkas belum selesai diunggah.' };
      const id = crypto.randomUUID();
      try {
        await ambil('INSERT INTO student_documents (id, student_id, file_id, kind, title, visibility, uploaded_by_account_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [id, studentId, sumber.fileId, jenis, judul, visibilitas, actor.id || null]);
      } catch (error) {
        if (error.code === '23505') return { ok: false, status: 409, error: 'Berkas ini sudah terdaftar sebagai dokumen.' };
        throw error;
      }
      return { ok: true, value: { id, kind: jenis } };
    });
  }

  async function archiveDocument(studentId, documentId, actor) {
    const izin = await akses(studentId, actor, 'write');
    if (!izin.ok) return izin;
    if (!['admin', 'supervisor'].includes(actor.role)) return { ok: false, status: 403, error: 'Hanya admin dan musyrif yang mengarsipkan dokumen.' };
    if (!adaId(documentId)) return { ok: false, status: 404, error: 'Dokumen tidak ditemukan.' };
    return tulis(async () => {
      const dokumen = (await ambil('SELECT id, visibility FROM student_documents WHERE id = $1 AND student_id = $2 AND archived_at IS NULL', [documentId, studentId]))[0];
      if (!dokumen) return { ok: false, status: 404, error: 'Dokumen tidak ditemukan.' };
      if (dokumen.visibility === 'admin' && actor.role !== 'admin') return { ok: false, status: 403, error: 'Dokumen ini hanya untuk admin.' };
      await ambil('UPDATE student_documents SET archived_at = now() WHERE id = $1', [documentId]);
      return { ok: true, value: { id: documentId } };
    });
  }

  // Dipakai kebijakan unduhan berkas (storage/upload-policies.js): boleh bila dokumennya terdaftar,
  // belum diarsipkan, dan visibilitasnya terjangkau pelaku. Berkas yang belum terdaftar hanya
  // terbuka untuk admin.
  async function bolehUnduh(fileId, actor) {
    if (!actor || !adaId(fileId)) return false;
    try {
      const dokumen = (await ambil('SELECT student_id, visibility, archived_at FROM student_documents WHERE file_id = $1', [fileId]))[0];
      if (!dokumen) return actor.role === 'admin';
      if (dokumen.archived_at && actor.role !== 'admin') return false;
      const izin = await accessFor(dokumen.student_id, actor);
      if (!izin.exists || !izin.view) return false;
      return URUT_VISIBILITAS[dokumen.visibility] <= tingkatBuka(actor, izin);
    } catch (error) {
      if (tabelBelumAda(error)) return actor.role === 'admin';
      throw error;
    }
  }

  // Santri yang dilepas dari asrama tidak membawa kamarnya; tanpa ini kamar lama hidup lagi bila ia ditempatkan kembali di asrama yang sama.
  async function releaseRoom(studentId) {
    if (!adaId(studentId)) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    try {
      await ambil('UPDATE students SET room_id = NULL WHERE id = $1 AND room_id IS NOT NULL', [studentId]);
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
    }
    return { ok: true, value: { studentId } };
  }

  return Object.freeze({ profile, updateProfile, recordStatusChange, addDocument, archiveDocument, bolehUnduh, releaseRoom });
}

module.exports = { createStudentProfileService, samarkan, keadaanDokumen, STATUS_SANTRI };
