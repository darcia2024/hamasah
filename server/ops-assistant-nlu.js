'use strict';

// Pembaca cerita untuk Asisten Hamasah. Murni aturan bahasa sederhana, tanpa AI luar dan tanpa database: fungsi-fungsi di
// sini hanya menerima teks dan daftar nama yang boleh diakses akun, lalu mengembalikan maksud dan isian yang dikenali.
// Dengan begitu chatbox tetap berguna di mode lokal, dan hasilnya mudah diuji.

const HARI_MS = 24 * 60 * 60 * 1000;
const BULAN = Object.freeze({
  januari: 1, jan: 1, februari: 2, feb: 2, pebruari: 2, maret: 3, mar: 3, april: 4, apr: 4, mei: 5, juni: 6, jun: 6, juli: 7, jul: 7,
  agustus: 8, agu: 8, agt: 8, ags: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, november: 11, nov: 11, desember: 12, des: 12
});
const HARI_PEKAN = Object.freeze({ minggu: 0, ahad: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, sabtu: 6 });
const WAKTU_SHOLAT = Object.freeze({ subuh: 'Subuh', dzuhur: 'Dzuhur', zuhur: 'Dzuhur', ashar: 'Ashar', asar: 'Ashar', maghrib: 'Maghrib', magrib: 'Maghrib', isya: 'Isya' });
const JENIS_URUSAN = Object.freeze({
  'lapor-diri': 'Lapor diri',
  'lapor-pendidikan': 'Lapor pendidikan',
  'status-pendidikan': 'Status pendidikan'
});
const KATA_UMUM = new Set(['santri', 'asrama', 'wali', 'bin', 'binti']);
const KATA_UMUM_ASRAMA = new Set(['asrama']);

// Huruf kecil, tanpa tanda baca dan apostrof (ba'da jadi bada), spasi tunggal.
function normal(teks) {
  return String(teks || '').toLowerCase().replace(/['’`´]/g, '').replace(/[^a-z0-9:./-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function kataKata(teks) {
  return normal(teks).split(/[\s/.-]+/).filter(Boolean);
}

function tambahHari(iso, n) {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * HARI_MS).toISOString().slice(0, 10);
}

function iso(tahun, bulan, hari) {
  const d = new Date(Date.UTC(tahun, bulan - 1, hari));
  if (d.getUTCFullYear() !== tahun || d.getUTCMonth() !== bulan - 1 || d.getUTCDate() !== hari) return null;
  return d.toISOString().slice(0, 10);
}

function tambahBulan(isoTanggal, n) {
  const [t, b, h] = isoTanggal.split('-').map(Number);
  const ke = new Date(Date.UTC(t, b - 1 + n, 1));
  const terakhir = new Date(Date.UTC(ke.getUTCFullYear(), ke.getUTCMonth() + 1, 0)).getUTCDate();
  return iso(ke.getUTCFullYear(), ke.getUTCMonth() + 1, Math.min(h, terakhir));
}

const FORMAT_TANGGAL = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
function tanggalPanjang(isoTanggal) {
  return FORMAT_TANGGAL.format(new Date(`${isoTanggal}T00:00:00Z`));
}

// Tanggal dari kalimat. hariIni berformat YYYY-MM-DD. Mengembalikan null bila tidak ada tanggal yang dikenali.
const ANGKA_HURUF = Object.freeze({ satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10 });

function bacaTanggal(pesan, hariIni) {
  const t = normal(pesan).replace(/\b(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh) (hari|minggu|pekan|bulan) (lagi|ke depan|mendatang)\b/g, (_, n, satuan, akhir) => `${ANGKA_HURUF[n]} ${satuan} ${akhir}`);
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  if (/\bhari ini\b/.test(t)) return hariIni;
  if (/\blusa\b/.test(t)) return tambahHari(hariIni, 2);
  if (/\bbesok\b/.test(t)) return tambahHari(hariIni, 1);
  m = /\b(\d{1,3}) (hari|minggu|pekan|bulan) (lagi|ke depan|mendatang)\b/.exec(t);
  if (m) {
    const n = Number(m[1]);
    return m[2] === 'hari' ? tambahHari(hariIni, n) : m[2] === 'bulan' ? tambahBulan(hariIni, n) : tambahHari(hariIni, n * 7);
  }
  if (/\b(minggu|pekan) depan\b/.test(t)) return tambahHari(hariIni, 7);
  if (/\bbulan depan\b/.test(t)) return tambahBulan(hariIni, 1);
  m = /\b(\d{1,2}) (januari|jan|februari|feb|pebruari|maret|mar|april|apr|mei|juni|jun|juli|jul|agustus|agu|agt|ags|september|sept|sep|oktober|okt|november|nov|desember|des)(?: (\d{4}))?\b/.exec(t);
  if (m) {
    const hari = Number(m[1]);
    const bulan = BULAN[m[2]];
    const tahunHariIni = Number(hariIni.slice(0, 4));
    if (m[3]) return iso(Number(m[3]), bulan, hari);
    const tahunIni = iso(tahunHariIni, bulan, hari);
    return tahunIni && tahunIni >= hariIni ? tahunIni : iso(tahunHariIni + 1, bulan, hari);
  }
  m = /\btanggal (\d{1,2})\b/.exec(t);
  if (m) {
    const hari = Number(m[1]);
    const [tahun, bulan] = hariIni.split('-').map(Number);
    const ini = iso(tahun, bulan, hari);
    if (ini && ini >= hariIni) return ini;
    const depan = new Date(Date.UTC(tahun, bulan, 1));
    return iso(depan.getUTCFullYear(), depan.getUTCMonth() + 1, hari);
  }
  // "minggu" sendirian berarti satuan waktu; sebagai nama hari ia harus didahului "hari" (atau memakai "ahad").
  m = /\b(?:hari (minggu)|(ahad|senin|selasa|rabu|kamis|jumat|sabtu))\b/.exec(t.replace(/\bjum at\b/, 'jumat'));
  if (m) {
    m = [m[0], m[1] || m[2]];
    const tujuan = HARI_PEKAN[m[1]];
    const sekarang = new Date(`${hariIni}T00:00:00Z`).getUTCDay();
    const selisih = ((tujuan - sekarang + 7) % 7) || 7;
    return tambahHari(hariIni, selisih);
  }
  return null;
}

// Jam dari kalimat: "jam 8 malam" jadi 20.00, "pukul 19.30", atau waktu sholat ("ba'da isya"). Mengembalikan teks siap pakai.
function bacaWaktu(pesan) {
  const t = normal(pesan);
  const m = /\b(?:jam|pukul|pkl) (\d{1,2})(?:[.:](\d{2}))?(?: (pagi|siang|sore|malam))?\b/.exec(t);
  if (m) {
    let jam = Number(m[1]);
    const menit = m[2] || '00';
    if (jam > 23) return null;
    if ((m[3] === 'sore' || m[3] === 'malam') && jam < 12) jam += 12;
    if (m[3] === 'siang' && jam < 11) jam += 12;
    return `pukul ${String(jam).padStart(2, '0')}.${menit}`;
  }
  const s = /\b(?:bada|sesudah|setelah|selepas) (subuh|dzuhur|zuhur|ashar|asar|maghrib|magrib|isya)\b/.exec(t);
  if (s) return `ba'da ${WAKTU_SHOLAT[s[1]]}`;
  return null;
}

// Skor kecocokan nama: kata nama yang hanya dimiliki satu orang bernilai penuh, kata yang dimiliki banyak orang bernilai kecil.
function cocokkanNama(pesan, daftar, umum = KATA_UMUM) {
  // Nama utuh yang diketik persis (mis. dari tombol pilihan) selalu menang, juga untuk nama pendek seperti "Asrama A".
  const teks = ` ${normal(pesan)} `;
  const utuh = daftar.filter((item) => { const n = normal(item.name); return n.length >= 3 && teks.includes(` ${n} `); })
    .sort((a, b) => normal(b.name).length - normal(a.name).length);
  if (utuh.length && (utuh.length === 1 || normal(utuh[0].name).length > normal(utuh[1].name).length)) return { cocok: utuh[0], kandidat: [utuh[0]] };
  const kata = new Set(kataKata(pesan));
  const milik = new Map();
  const token = daftar.map((item) => {
    const k = [...new Set(kataKata(item.name).filter((x) => x.length >= 3 && !umum.has(x)))];
    k.forEach((x) => milik.set(x, (milik.get(x) || 0) + 1));
    return { item, k };
  });
  const hasil = token.map(({ item, k }) => {
    const kena = k.filter((x) => kata.has(x));
    const skor = kena.reduce((n, x) => n + (milik.get(x) === 1 ? 1 : 0.4), 0);
    return { item, skor, kena: kena.length };
  }).filter((r) => r.skor >= 1 || r.kena >= 2).sort((a, b) => b.skor - a.skor || a.item.name.localeCompare(b.item.name));
  if (!hasil.length) return { cocok: null, kandidat: [] };
  const atas = hasil[0];
  const sama = hasil.filter((r) => Math.abs(r.skor - atas.skor) < 0.01);
  return sama.length === 1 ? { cocok: atas.item, kandidat: [atas.item] } : { cocok: null, kandidat: sama.map((r) => r.item) };
}

function jenisUrusan(t) {
  if (/\blapor diri\b/.test(t)) return 'lapor-diri';
  if (/\b(lapor|laporan) pendidikan\b/.test(t)) return 'lapor-pendidikan';
  if (/\bstatus pendidikan\b/.test(t)) return 'status-pendidikan';
  return null;
}

const PENGUMUMAN = /\b(umumkan|mengumumkan|pengumuman|informasikan)\b|\b(sampaikan|beritahu|beri tahu|kasih tahu|kabari|infokan)\s+(?:ke\s+|kepada\s+)?(semua|seluruh|para)\b/;
const LAPORAN = /\b(draf|draft|buat|susun|bikin|tulis|siapkan)\s+(?:kan\s+)?(?:sebuah\s+)?(laporan)\b/;
const DOKUMEN = /\b(dokumen|paspor|iqamah|visa)\b/;
const SANTRI_KATA = /\b(perkembangan|progres|progress|hafalan|kehadiran|absensi|absen|kabar|kondisi|kabarnya|bagaimana|gimana)\b/;
const ASRAMA_KATA = /\b(ringkas|ringkasan|rekap|rekapan|asrama|laporan asrama)\b/;
const SAPAAN = /^(halo|hai|hi|assalamualaikum|assalamu alaikum|salam|selamat (pagi|siang|sore|malam)|bisa apa|apa yang bisa|bantu|tolong|help|bantuan|menu)\b/;

// Membaca satu pesan. konteks: { santri: [{id, name}], asrama: [{id, name}], hariIni }.
// Hasil: { maksud, isian, kandidatSantri, kandidatAsrama } dengan maksud null bila tidak ada kata kunci yang dikenali.
function baca(pesan, konteks) {
  const t = normal(pesan);
  const hariIni = konteks.hariIni;
  const isian = {};

  const nama = cocokkanNama(pesan, konteks.santri || []);
  if (nama.cocok) isian.studentId = nama.cocok.id;
  const asrama = cocokkanNama(pesan, konteks.asrama || [], KATA_UMUM_ASRAMA);
  if (asrama.cocok) isian.dormitoryId = asrama.cocok.id;

  const jenis = jenisUrusan(t);
  if (jenis) isian.kind = jenis;
  const tanggal = bacaTanggal(pesan, hariIni);
  if (tanggal) isian.tanggal = tanggal;
  const waktu = bacaWaktu(pesan);
  if (waktu) isian.waktu = waktu;
  if (/\b(semua|seluruh|para) musyrif(ah)?\b/.test(t)) isian.sasaran = 'musyrif';
  else if (/\b(semua|seluruh) santri\b/.test(t)) isian.sasaran = 'santri';
  else if (/\b(semua|seluruh) wali\b/.test(t)) isian.sasaran = 'wali';

  let maksud = null;
  if (PENGUMUMAN.test(t)) maksud = 'pengumuman';
  else if (jenis || /\b(catat|tambah|buat) urusan\b/.test(t)) maksud = 'urusan';
  else if (LAPORAN.test(t)) maksud = 'laporan';
  else if (DOKUMEN.test(t)) maksud = 'dokumen';
  else if ((nama.cocok || nama.kandidat.length) && SANTRI_KATA.test(t)) maksud = 'perkembangan';
  else if (/\bperkembangan (santri|anak)\b|\b(hafalan|kehadiran|progres) santri\b/.test(t)) maksud = 'perkembangan';
  else if (ASRAMA_KATA.test(t) || (asrama.cocok && SANTRI_KATA.test(t))) maksud = 'ringkasan';
  else if (SAPAAN.test(t)) maksud = 'bantuan';

  return { maksud, isian, kandidatSantri: nama.kandidat, kandidatAsrama: asrama.kandidat, dokumenMenyebut: (t.match(/\b(paspor|iqamah|visa)\b/) || [])[1] || null };
}

// Membuang kalimat perintah ("tolong umumkan ...") supaya yang tersisa adalah isi ceritanya.
function isiCerita(pesan) {
  let teks = String(pesan || '').replace(/\s+/g, ' ').trim();
  const perintah = '(?:tolong\\s+|mohon\\s+|bisa\\s+|coba\\s+)?(?:umumkan|umumkankan|sampaikan|informasikan|infokan|beritahu|beri tahu|kasih tahu|kabari|catat|catatkan|buat(?:kan)?|tambah(?:kan)?)';
  teks = teks.replace(new RegExp(`^${perintah}(?:\\s+(?:bahwa|kalau|kalo|ke|kepada))?\\s+`, 'i'), '');
  teks = teks.replace(new RegExp(`[,;.]?\\s*${perintah}(?:\\s+(?:ke|kepada)\\s+(?:semua|seluruh|para)\\s+\\w+(?:\\s+\\w+)?)?(?:\\s+(?:ya|dong|nih))?\\s*[.!]*$`, 'i'), '');
  teks = teks.replace(/[,;]\s*(?:ya|dong|nih)\s*[.!]*$/i, '').trim();
  return teks;
}

function huruf(teks) {
  const t = String(teks || '').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function titik(teks) {
  return /[.!?]$/.test(teks) ? teks : `${teks}.`;
}

// Judul pendek dari isi cerita: sampai tanda baca pertama, dipotong di batas kata.
function judulDari(isi, maks = 80) {
  const awal = huruf(isi.split(/[.!?;\n]/)[0].trim());
  if (awal.length <= maks) return awal;
  const potong = awal.slice(0, maks);
  return `${potong.slice(0, Math.max(potong.lastIndexOf(' '), 20))}...`;
}

module.exports = { baca, bacaTanggal, bacaWaktu, cocokkanNama, isiCerita, judulDari, huruf, titik, tanggalPanjang, normal, JENIS_URUSAN };
