'use strict';
// Impor santri secara massal dari Excel atau Google Sheets (migrasi 063).
//
// Alur: admin mengunggah CSV atau XLSX dan memetakan kolom (dikerjakan di peramban, lihat
// website/berkas-tabel.js dan impor.js), lalu kemari:
//   1. preview: baris divalidasi (identitas, asrama dan kamar, jenjang, relasi wali), data duplikat
//      dan data bermasalah ditandai, dan hasilnya disimpan sebagai satu batch. Belum ada santri
//      atau akun yang dibuat.
//   2. commit: sesudah admin meninjau dan memutuskan baris mana yang dilewati atau tetap dibuat,
//      baris yang sah disimpan lewat service yang sama dengan pembuatan santri biasa. Akun wali dan
//      santri hanya DIUNDANG (tanpa kata sandi; pemilik akun membuat sendiri lewat tautan
//      aktivasi). Tidak ada kata sandi bawaan bersama, dan tautan aktivasi tidak disimpan maupun
//      ditampilkan di laporan.
//   3. laporan: hasil tiap baris, akun yang diundang, dan yang perlu ditindaklanjuti.
//
// Konfirmasi bisa dilanjutkan bila terhenti di tengah: baris yang sudah selesai tidak diproses
// ulang. Hanya admin.

const crypto = require('node:crypto');
const { kelompokProgram } = require('./admin-overview-service.js');

const ADMIN_ROLE = 'admin';
const MAKS_BARIS = 500;
const KUNCI_KUNCI_MENIT = 10;
const SIMPAN_SETIAP = 10;
const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk impor santri. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';
// Kolom yang dikenal. Klien mengirim baris yang kuncinya salah satu dari ini.
const KOLOM = Object.freeze(['name', 'gender', 'birthDate', 'birthPlace', 'program', 'city', 'joinDate', 'dormitory', 'room', 'phone', 'email', 'address', 'institution', 'major', 'studyYear', 'guardianName', 'guardianEmail', 'guardianPhone']);
const BULAN = Object.freeze({
  januari: 1, jan: 1, februari: 2, feb: 2, pebruari: 2, maret: 3, mar: 3, april: 4, apr: 4, mei: 5, juni: 6, jun: 6, juli: 7, jul: 7,
  agustus: 8, agu: 8, agt: 8, aug: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, oct: 10, november: 11, nov: 11, nop: 11, desember: 12, des: 12, dec: 12
});

function tabelBelumAda(error) {
  if (!error) return false;
  if (error.code === '42P01' || error.code === '42703') return true;
  return /(student_import_batches|dormitory_rooms|student_profiles)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function bersih(value, maks = 300) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, maks);
}

function kunciNama(nama) {
  return bersih(nama, 120).toLocaleLowerCase('id-ID');
}

function tanggalJakarta(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);
}

function adaTanggal(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime()) && new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso;
}

// Menerima YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, "9 Oktober 2005", dan nomor seri tanggal Excel.
// Mengembalikan { iso } atau { galat }. Kosong menghasilkan { iso: null }.
function bacaTanggal(nilai) {
  const teks = bersih(nilai, 40);
  if (!teks) return { iso: null };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(teks);
  let y; let b; let h;
  if (m) { [, y, b, h] = m; }
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(teks))) { [, h, b, y] = m; }
  else if ((m = /^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/.exec(teks)) && BULAN[m[2].toLowerCase()]) { h = m[1]; b = BULAN[m[2].toLowerCase()]; y = m[3]; }
  else if (/^\d{5}(\.\d+)?$/.test(teks) && Number(teks) > 20000 && Number(teks) < 70000) {
    const tanggal = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(teks)) * 86400000);
    return { iso: tanggal.toISOString().slice(0, 10) };
  } else return { galat: `Format tanggal “${teks}” belum dikenali. Pakai 2005-09-30 atau 30/09/2005.` };
  const iso = `${String(y).padStart(4, '0')}-${String(b).padStart(2, '0')}-${String(h).padStart(2, '0')}`;
  return adaTanggal(iso) ? { iso } : { galat: `Tanggal “${teks}” tidak ada di kalender.` };
}

function bacaJenis(nilai) {
  const teks = bersih(nilai, 30).toLowerCase();
  if (!teks) return { value: null };
  if (['putra', 'l', 'lk', 'laki-laki', 'laki laki', 'pria', 'male', 'm', 'ikhwan'].includes(teks)) return { value: 'putra' };
  if (['putri', 'p', 'pr', 'perempuan', 'wanita', 'female', 'f', 'akhwat'].includes(teks)) return { value: 'putri' };
  return { galat: `Jenis “${bersih(nilai, 30)}” belum dikenali. Pakai putra atau putri.` };
}

const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createStudentImportService({ database, studentPortalService, studentProfileService, dormitoryRoomService, identityService, sendInvitation, now = () => new Date() } = {}) {
  if (!database || !studentPortalService || !identityService) throw new Error('createStudentImportService membutuhkan database, studentPortalService, dan identityService.');

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

  function adminSaja(actor) {
    return Boolean(actor && actor.role === ADMIN_ROLE);
  }

  // ------------------------------------------------------------------ pratinjau

  async function muatKonteks() {
    const santri = await ambil('SELECT id, name, to_char(birth_date, \'YYYY-MM-DD\') AS birth_date, status FROM students');
    const akun = await ambil('SELECT id, lower(email) AS email, role, lifecycle FROM accounts');
    const asrama = await ambil('SELECT id, name, gender, capacity FROM dormitories');
    const hunian = await ambil(`SELECT dormitory_id, count(*)::int AS jumlah FROM students WHERE status IN ('active', 'leave') AND dormitory_id IS NOT NULL GROUP BY dormitory_id`);
    let kamar = [];
    try {
      kamar = await ambil('SELECT id, dormitory_id, name FROM dormitory_rooms');
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
    }
    return {
      santri,
      akun: new Map(akun.map((a) => [a.email, a])),
      asrama: new Map(asrama.map((a) => [kunciNama(a.name), a])),
      hunian: new Map(hunian.map((h) => [h.dormitory_id, h.jumlah])),
      kamar
    };
  }

  function nilaiBaris(mentah) {
    const sumber = mentah && typeof mentah === 'object' ? mentah : {};
    const hasil = {};
    KOLOM.forEach((k) => { hasil[k] = bersih(sumber[k], k === 'address' ? 300 : 160); });
    return hasil;
  }

  async function preview(input, actor) {
    if (!adminSaja(actor)) return { ok: false, status: 403, error: 'Akses admin diperlukan.' };
    const sumber = input || {};
    const baris = Array.isArray(sumber.rows) ? sumber.rows : [];
    if (!baris.length) return { ok: false, status: 422, error: 'Berkas tidak berisi baris data.' };
    if (baris.length > MAKS_BARIS) return { ok: false, status: 422, error: `Satu impor paling banyak ${MAKS_BARIS} baris. Bagi berkasnya menjadi beberapa bagian.` };
    return tulis(async () => {
      const konteks = await muatKonteks();
      const hariIni = tanggalJakarta(now());
      const namaTahunSama = new Map();
      const emailDalamBerkas = new Map();
      const waliDalamBerkas = new Map();
      const tambahanHunian = new Map();
      const hasil = baris.map((mentah, indeks) => {
        const v = nilaiBaris(mentah);
        const galat = [];
        const peringatan = [];
        const duplikat = [];
        const info = [];
        const data = { ...v };

        // Identitas
        if (v.name.length < 2) galat.push('Nama wajib diisi (minimal 2 huruf).');
        const jenis = bacaJenis(v.gender);
        if (jenis.galat) galat.push(jenis.galat);
        data.gender = jenis.value;
        const lahir = bacaTanggal(v.birthDate);
        if (lahir.galat) galat.push(`Tanggal lahir: ${lahir.galat}`);
        else if (lahir.iso && lahir.iso > hariIni) galat.push('Tanggal lahir ada di masa depan.');
        data.birthDate = lahir.iso || null;
        const gabung = bacaTanggal(v.joinDate);
        if (gabung.galat) galat.push(`Tanggal bergabung: ${gabung.galat}`);
        else if (gabung.iso && gabung.iso > hariIni) peringatan.push('Tanggal bergabung ada di masa depan.');
        data.joinDate = gabung.iso || hariIni;
        if (!gabung.iso && !gabung.galat) info.push('Tanggal bergabung kosong, dipakai tanggal hari ini.');

        // Jenjang dan kota
        if (v.program.length < 2) galat.push('Jenjang atau program wajib diisi (misalnya Kuliah S1 Al-Azhar atau Ma’had Al-Azhar).');
        else if (kelompokProgram(v.program) === 'Program lain') peringatan.push(`Jenjang “${v.program}” belum dikenali sebagai Kuliah atau Ma’had; disimpan apa adanya.`);
        if (v.city.length < 2) { data.city = 'Belum diisi'; peringatan.push('Kota asal kosong, disimpan sebagai “Belum diisi”.'); }
        if (v.studyYear) {
          const tahun = Number(v.studyYear);
          if (!Number.isInteger(tahun) || tahun < 1 || tahun > 12) galat.push('Tahun studi harus angka 1 sampai 12.');
        }

        // Asrama dan kamar
        let asrama = null;
        if (v.dormitory) {
          asrama = konteks.asrama.get(kunciNama(v.dormitory)) || null;
          if (!asrama) galat.push(`Asrama “${v.dormitory}” tidak ditemukan. Cek penulisannya atau buat asramanya dulu.`);
          else if (jenis.value && asrama.gender !== jenis.value) galat.push(`Asrama ${asrama.name} untuk ${asrama.gender}, sedangkan santri ini ${jenis.value}.`);
          else if (!jenis.value && !jenis.galat) galat.push('Jenis (putra atau putri) wajib diisi bila santri ditempatkan di asrama.');
          else if (asrama) {
            const terisi = (konteks.hunian.get(asrama.id) || 0) + (tambahanHunian.get(asrama.id) || 0);
            if (Number(asrama.capacity) > 0 && terisi >= Number(asrama.capacity)) galat.push(`Kapasitas ${asrama.name} sudah penuh (${terisi} dari ${asrama.capacity}).`);
            else tambahanHunian.set(asrama.id, (tambahanHunian.get(asrama.id) || 0) + 1);
          }
        } else {
          peringatan.push('Asrama kosong: santri disimpan tanpa asrama dan bisa ditempatkan nanti.');
        }
        data.dormitoryId = asrama ? asrama.id : null;
        data.dormitoryName = asrama ? asrama.name : null;
        data.roomId = null;
        if (v.room) {
          if (!asrama) peringatan.push('Kamar diabaikan karena asramanya kosong atau tidak dikenal.');
          else if (!konteks.kamar.length) peringatan.push('Struktur kamar belum aktif; kamar diabaikan.');
          else {
            const ditemukan = konteks.kamar.find((k) => k.dormitory_id === asrama.id && kunciNama(k.name) === kunciNama(v.room));
            if (!ditemukan) peringatan.push(`Kamar “${v.room}” tidak ada di ${asrama.name}; santri disimpan tanpa kamar.`);
            else data.roomId = ditemukan.id;
          }
        }

        // Email santri
        const emailSantri = v.email.toLowerCase();
        data.email = emailSantri;
        if (emailSantri) {
          if (!POLA_EMAIL.test(emailSantri)) galat.push('Email santri belum valid.');
          else if (konteks.akun.has(emailSantri)) galat.push('Email santri sudah dipakai akun lain.');
          else if (emailDalamBerkas.has(emailSantri)) galat.push(`Email santri sama dengan baris ${emailDalamBerkas.get(emailSantri)}.`);
          else emailDalamBerkas.set(emailSantri, indeks + 1);
        } else {
          info.push('Tanpa email santri: akun santri tidak dibuat, bisa dibuat nanti.');
        }

        // Relasi wali
        const emailWali = v.guardianEmail.toLowerCase();
        data.guardianEmail = emailWali;
        let wali = 'tanpa-akun';
        if (v.guardianName && v.guardianName.length < 2) galat.push('Nama wali terlalu pendek.');
        if (emailWali) {
          if (!POLA_EMAIL.test(emailWali)) galat.push('Email wali belum valid.');
          else if (!v.guardianName) galat.push('Email wali diisi tetapi nama wali kosong.');
          else if (emailWali === emailSantri) galat.push('Email wali sama dengan email santri.');
          else {
            const ada = konteks.akun.get(emailWali);
            if (ada && ada.role !== 'parent') galat.push(`Email wali sudah dipakai akun ${ada.role}, bukan akun wali.`);
            else if (ada) { wali = 'tautkan'; info.push('Wali sudah punya akun dan akan ditautkan (misalnya saudara kandung).'); }
            else if (waliDalamBerkas.has(emailWali)) {
              wali = 'tautkan';
              info.push(`Wali sama dengan baris ${waliDalamBerkas.get(emailWali).baris}; akunnya dipakai bersama.`);
              if (kunciNama(waliDalamBerkas.get(emailWali).nama) !== kunciNama(v.guardianName)) peringatan.push(`Email wali sama dengan baris ${waliDalamBerkas.get(emailWali).baris} tetapi namanya berbeda.`);
            } else { wali = 'baru'; waliDalamBerkas.set(emailWali, { baris: indeks + 1, nama: v.guardianName }); }
          }
        } else if (v.guardianName) {
          peringatan.push('Wali tanpa email: dicatat sebagai kontak darurat, akun wali tidak dibuat.');
        } else {
          peringatan.push('Wali belum diisi: santri belum terhubung ke akun wali.');
        }
        data.guardian = wali;

        // Duplikat: nama dan tanggal lahir sama dengan santri yang sudah ada atau baris sebelumnya.
        const kunci = kunciNama(v.name);
        if (kunci.length >= 2) {
          const sama = konteks.santri.find((s) => kunciNama(s.name) === kunci && ((s.birth_date && data.birthDate && s.birth_date === data.birthDate) || (!s.birth_date && !data.birthDate)));
          if (sama) duplikat.push({ jenis: 'sudah-ada', studentId: sama.id, pesan: `Sudah ada santri bernama ${v.name}${data.birthDate ? ' dengan tanggal lahir yang sama' : ' (tanggal lahir sama-sama kosong)'}.` });
          const samaNama = konteks.santri.filter((s) => kunciNama(s.name) === kunci && !(duplikat.length));
          if (!duplikat.length && samaNama.length) peringatan.push(`Ada santri lain bernama ${v.name} dengan tanggal lahir berbeda; dianggap orang yang berbeda.`);
          const kunciLahir = `${kunci}|${data.birthDate || ''}`;
          if (namaTahunSama.has(kunciLahir)) duplikat.push({ jenis: 'dalam-berkas', pesan: `Sama dengan baris ${namaTahunSama.get(kunciLahir)} di berkas ini.` });
          else namaTahunSama.set(kunciLahir, indeks + 1);
        }

        const status = galat.length ? 'bermasalah' : duplikat.length ? 'duplikat' : peringatan.length ? 'peringatan' : 'siap';
        return { row: indeks + 1, status, errors: galat, warnings: peringatan, duplicates: duplikat, info, data };
      });
      const hitung = (status) => hasil.filter((b) => b.status === status).length;
      const ringkas = {
        total: hasil.length, ready: hitung('siap'), warning: hitung('peringatan'), problem: hitung('bermasalah'), duplicate: hitung('duplikat'),
        newGuardianAccounts: new Set(hasil.filter((b) => b.status !== 'bermasalah' && b.data.guardian === 'baru').map((b) => b.data.guardianEmail)).size,
        linkedGuardians: hasil.filter((b) => b.status !== 'bermasalah' && b.data.guardian === 'tautkan').length,
        newStudentAccounts: hasil.filter((b) => b.status !== 'bermasalah' && b.data.email).length
      };
      const id = crypto.randomUUID();
      await ambil(
        `INSERT INTO student_import_batches (id, file_name, status, row_count, rows, summary, actor_account_id) VALUES ($1, $2, 'previewed', $3, $4::jsonb, $5::jsonb, $6)`,
        [id, bersih(sumber.fileName, 200), hasil.length, JSON.stringify(hasil), JSON.stringify(ringkas), actor.id || null]
      );
      return { ok: true, value: { id, fileName: bersih(sumber.fileName, 200), status: 'previewed', summary: ringkas, rows: hasil } };
    });
  }

  // ------------------------------------------------------------------ konfirmasi

  async function ambilBatch(batchId) {
    if (!/^[\w-]{8,64}$/.test(String(batchId || ''))) return null;
    return (await ambil('SELECT * FROM student_import_batches WHERE id = $1', [batchId]))[0] || null;
  }

  function bentukBatch(row, denganBaris = true) {
    return {
      id: row.id, fileName: row.file_name, status: row.status, rowCount: row.row_count, summary: row.summary || {},
      decisions: row.decisions || {}, createdAt: new Date(row.created_at).toISOString(), committedAt: row.committed_at ? new Date(row.committed_at).toISOString() : null,
      ...(denganBaris ? { rows: row.rows || [], results: row.results || [] } : {})
    };
  }

  async function detail(batchId, actor) {
    if (!adminSaja(actor)) return { ok: false, status: 403, error: 'Akses admin diperlukan.' };
    return tulis(async () => {
      const batch = await ambilBatch(batchId);
      if (!batch) return { ok: false, status: 404, error: 'Impor tidak ditemukan.' };
      return { ok: true, value: bentukBatch(batch) };
    });
  }

  async function list(actor) {
    if (!adminSaja(actor)) return { ok: false, status: 403, error: 'Akses admin diperlukan.' };
    try {
      const rows = await ambil(`SELECT id, file_name, status, row_count, summary, decisions, created_at, committed_at FROM student_import_batches ORDER BY created_at DESC LIMIT 20`);
      return { ok: true, value: { available: true, items: rows.map((row) => bentukBatch(row, false)) } };
    } catch (error) {
      if (!tabelBelumAda(error)) throw error;
      return { ok: true, value: { available: false, items: [] } };
    }
  }

  async function cancel(batchId, actor) {
    if (!adminSaja(actor)) return { ok: false, status: 403, error: 'Akses admin diperlukan.' };
    return tulis(async () => {
      const batch = await ambilBatch(batchId);
      if (!batch) return { ok: false, status: 404, error: 'Impor tidak ditemukan.' };
      if (batch.status !== 'previewed') return { ok: false, status: 409, error: 'Hanya impor yang belum dikonfirmasi yang bisa dibatalkan.' };
      await ambil(`UPDATE student_import_batches SET status = 'cancelled' WHERE id = $1`, [batchId]);
      return { ok: true, value: { id: batchId, status: 'cancelled' } };
    });
  }

  async function undang(akun, nama, peran) {
    const hasil = await identityService.inviteAccount({ name: nama, email: akun, role: peran });
    if (!hasil.ok) throw new Error(hasil.error || 'Undangan akun gagal dibuat.');
    let terkirim = false;
    if (typeof sendInvitation === 'function') {
      try {
        const kirim = await sendInvitation({ email: hasil.value.account.email, name: nama, token: hasil.value.invitationToken });
        terkirim = Boolean(kirim && kirim.ok !== false);
      } catch {
        terkirim = false;
      }
    }
    return { id: hasil.value.account.id, terkirim };
  }

  // Satu baris: buat santri, tempatkan, isi profil, lalu undang dan tautkan akun.
  async function prosesBaris(baris, actor) {
    const d = baris.data;
    const catatan = [];
    const diundang = [];
    const dibuat = await studentPortalService.createStudent({ name: d.name, program: d.program, city: d.city, joinDate: d.joinDate, gender: d.gender || undefined, birthDate: d.birthDate || undefined }, actor);
    if (!dibuat.ok) throw new Error(dibuat.error || 'Santri gagal dibuat.');
    const studentId = dibuat.value.id;
    if (d.dormitoryId) {
      const tempat = await studentPortalService.setPlacement(studentId, { dormitoryId: d.dormitoryId, gender: d.gender || undefined }, actor);
      if (!tempat.ok) catatan.push(`Penempatan asrama gagal: ${tempat.error}`);
      else if (d.roomId && dormitoryRoomService) {
        const kamar = await dormitoryRoomService.placeStudent(studentId, { dormitoryId: d.dormitoryId, roomId: d.roomId, reason: 'Impor santri.' }, actor);
        if (!kamar.ok) catatan.push(`Penempatan kamar gagal: ${kamar.error}`);
      }
    }
    if (studentProfileService) {
      const isi = { phone: d.phone, homeAddress: d.address, institution: d.institution, major: d.major, emergencyName: d.guardianName, emergencyPhone: d.guardianPhone, birthPlace: d.birthPlace };
      if (d.studyYear) isi.studyYear = Number(d.studyYear);
      if (Object.values(isi).some((nilai) => nilai !== '' && nilai !== undefined)) {
        const profil = await studentProfileService.updateProfile(studentId, isi, actor);
        if (!profil.ok) catatan.push(`Profil belum lengkap tersimpan: ${profil.error}`);
      }
    }
    const tautan = {};
    if (d.email) {
      try {
        const akun = await undang(d.email, d.name, 'student');
        tautan.studentAccountId = akun.id;
        diundang.push({ peran: 'santri', email: d.email, terkirim: akun.terkirim });
      } catch (error) {
        catatan.push(`Akun santri belum dibuat: ${error.message}`);
      }
    }
    if (d.guardianEmail && d.guardian !== 'tanpa-akun') {
      try {
        const ada = (await ambil(`SELECT id, role FROM accounts WHERE lower(email) = $1`, [d.guardianEmail]))[0];
        if (ada && ada.role === 'parent') {
          tautan.parentAccountIds = [ada.id];
          diundang.push({ peran: 'wali', email: d.guardianEmail, ditautkan: true });
        } else if (ada) {
          catatan.push('Akun wali tidak ditautkan: email itu dipakai akun berperan lain.');
        } else {
          const akun = await undang(d.guardianEmail, d.guardianName, 'parent');
          tautan.parentAccountIds = [akun.id];
          diundang.push({ peran: 'wali', email: d.guardianEmail, terkirim: akun.terkirim });
        }
      } catch (error) {
        catatan.push(`Akun wali belum dibuat: ${error.message}`);
      }
    }
    if (tautan.studentAccountId || tautan.parentAccountIds) {
      const hubung = await studentPortalService.linkAccounts(studentId, tautan, actor);
      if (!hubung.ok) catatan.push(`Akun belum tertaut ke santri: ${hubung.error}`);
    }
    return { studentId, notes: catatan, invited: diundang };
  }

  // decisions: { exclude: [nomor baris], force: [nomor baris duplikat yang tetap dibuat] }.
  async function commit(batchId, input, actor) {
    if (!adminSaja(actor)) return { ok: false, status: 403, error: 'Akses admin diperlukan.' };
    return tulis(async () => {
      const batch = await ambilBatch(batchId);
      if (!batch) return { ok: false, status: 404, error: 'Impor tidak ditemukan.' };
      if (batch.status === 'committed') return { ok: true, value: bentukBatch(batch) };
      if (batch.status === 'cancelled') return { ok: false, status: 409, error: 'Impor ini sudah dibatalkan.' };
      if (batch.status === 'committing' && batch.locked_at && now().getTime() - new Date(batch.locked_at).getTime() < KUNCI_KUNCI_MENIT * 60000) {
        return { ok: false, status: 409, error: 'Impor ini sedang diproses. Tunggu sebentar lalu muat ulang.' };
      }
      const sumber = input || {};
      const angka = (daftar) => [...new Set((Array.isArray(daftar) ? daftar : []).map(Number).filter(Number.isInteger))];
      const tersimpan = batch.decisions || {};
      const keputusan = batch.status === 'committing' ? { exclude: angka(tersimpan.exclude), force: angka(tersimpan.force) } : { exclude: angka(sumber.exclude), force: angka(sumber.force) };
      // Penguncian: hanya satu pemroses; pemroses yang terhenti bisa diambil alih setelah kunci kedaluwarsa.
      const kunci = await ambil(
        `UPDATE student_import_batches SET status = 'committing', decisions = $2::jsonb, locked_at = now()
         WHERE id = $1 AND (status = 'previewed' OR (status = 'committing' AND (locked_at IS NULL OR locked_at < now() - interval '${KUNCI_KUNCI_MENIT} minutes'))) RETURNING id`,
        [batchId, JSON.stringify(keputusan)]
      );
      if (!kunci.length) return { ok: false, status: 409, error: 'Impor ini sedang diproses. Tunggu sebentar lalu muat ulang.' };
      const hasil = Array.isArray(batch.results) ? [...batch.results] : [];
      const selesai = new Set(hasil.map((h) => h.row));
      const diproses = batch.rows.filter((b) => {
        if (selesai.has(b.row) || keputusan.exclude.includes(b.row)) return false;
        return b.status === 'siap' || b.status === 'peringatan' || (b.status === 'duplikat' && keputusan.force.includes(b.row));
      });
      let sejakSimpan = 0;
      const simpan = () => ambil(`UPDATE student_import_batches SET results = $2::jsonb, locked_at = now() WHERE id = $1`, [batchId, JSON.stringify(hasil)]);
      for (const baris of diproses) {
        try {
          const selesaiBaris = await prosesBaris(baris, actor);
          hasil.push({ row: baris.row, name: baris.data.name, ok: true, ...selesaiBaris });
        } catch (error) {
          hasil.push({ row: baris.row, name: baris.data.name, ok: false, error: String(error.message || 'Baris gagal diproses.'), notes: [], invited: [] });
        }
        sejakSimpan += 1;
        if (sejakSimpan >= SIMPAN_SETIAP) { await simpan(); sejakSimpan = 0; }
      }
      const dilewati = batch.rows.filter((b) => !hasil.some((h) => h.row === b.row)).map((b) => ({ row: b.row, name: b.data.name, ok: false, skipped: true, reason: keputusan.exclude.includes(b.row) ? 'Dikecualikan admin.' : b.status === 'bermasalah' ? 'Bermasalah, tidak diimpor.' : 'Duplikat, dilewati.' }));
      const dibuat = hasil.filter((h) => h.ok);
      const undangan = dibuat.flatMap((h) => h.invited || []);
      const ringkas = {
        ...(batch.summary || {}),
        created: dibuat.length,
        failed: hasil.filter((h) => !h.ok).length,
        skipped: dilewati.length,
        invitedAccounts: undangan.filter((u) => !u.ditautkan).length,
        invitationsSent: undangan.filter((u) => u.terkirim).length,
        invitationsPending: undangan.filter((u) => !u.ditautkan && !u.terkirim).length,
        guardiansLinked: undangan.filter((u) => u.ditautkan).length
      };
      await ambil(`UPDATE student_import_batches SET status = 'committed', results = $2::jsonb, summary = $3::jsonb, committed_at = now(), locked_at = NULL WHERE id = $1`, [batchId, JSON.stringify([...hasil, ...dilewati]), JSON.stringify(ringkas)]);
      const akhir = await ambilBatch(batchId);
      return { ok: true, value: bentukBatch(akhir) };
    });
  }

  return Object.freeze({ preview, commit, detail, list, cancel });
}

module.exports = { createStudentImportService, bacaTanggal, bacaJenis, KOLOM, MAKS_BARIS };
