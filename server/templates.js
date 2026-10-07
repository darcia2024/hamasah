'use strict';

// Template yang diubah super admin dari halaman Template (template.html): pesan WhatsApp
// petugas pendaftaran, email notifikasi, kop dan rekening di PDF, serta nama dan status
// wajib dokumen pendaftar.
//
// BAWAAN di bawah sama dengan teks yang dipakai sebelum halaman ini ada, jadi selama admin
// belum menyimpan apa pun, pesan, email, dan PDF tidak berubah.
//
// Isian bertanda kurung kurawal, misalnya {nama}, diganti nilai sungguhan saat dipakai.
// Setiap bidang hanya menerima isian yang memang tersedia untuknya (ISIAN di bawah), supaya
// salah ketik seperti {nma} langsung ditolak saat disimpan, bukan terkirim apa adanya.

const STATUS_PENDAFTARAN = Object.freeze([
  'submitted', 'document-review', 'needs-revision', 'academic-preparation', 'ready-for-departure', 'completed', 'cancelled'
]);

const JENIS_EMAIL = Object.freeze([
  'registration-status', 'document-revision', 'departure-assigned', 'departure-updated',
  'payment-received', 'invoice-issued', 'invoice-reminder'
]);

const JENIS_DOKUMEN = Object.freeze(['passport', 'diploma', 'transcript', 'health-certificate', 'photo', 'other']);

// Isian yang boleh dipakai di tiap jenis email (judul dan kalimat pembuka).
const ISIAN_EMAIL = Object.freeze({
  'registration-status': ['nomor', 'status'],
  'document-revision': ['nomor'],
  'departure-assigned': ['nomor', 'kloter'],
  'departure-updated': ['nomor', 'kloter'],
  'payment-received': ['tagihan', 'atasNama', 'jumlah', 'kuitansi'],
  'invoice-issued': ['tagihan', 'atasNama', 'keterangan', 'jumlah'],
  'invoice-reminder': ['tagihan', 'atasNama', 'keterangan', 'jumlah']
});

const BAWAAN = Object.freeze({
  whatsapp: {
    salam: "Assalamu'alaikum {sapaan},",
    status: {
      submitted: 'Data pendaftaran {nama} dengan nomor {nomor} sudah kami terima. Petugas akan memeriksa berkasnya, dan kami kabari kembali setelah pemeriksaan selesai.',
      'document-review': 'Berkas pendaftaran {nama} (nomor {nomor}) sedang kami periksa. Mohon ditunggu, kami kabari kembali setelah pemeriksaan selesai.',
      'needs-revision': 'Setelah pemeriksaan, ada berkas pendaftaran {nama} (nomor {nomor}) yang perlu diperbaiki.',
      'academic-preparation': 'Alhamdulillah, berkas pendaftaran {nama} (nomor {nomor}) sudah lengkap dan diterima. Tahap berikutnya adalah persiapan akademik; rinciannya akan kami sampaikan.',
      'ready-for-departure': 'Alhamdulillah, {nama} (nomor {nomor}) sudah masuk tahap siap keberangkatan. Jadwal dan persiapan keberangkatan akan kami sampaikan.',
      completed: 'Proses pendaftaran {nama} (nomor {nomor}) sudah selesai. Jazakumullahu khairan atas kepercayaannya kepada Hamasah International.',
      cancelled: 'Pendaftaran {nama} dengan nomor {nomor} kami catat sebagai dibatalkan. Bila ada yang keliru, silakan balas pesan ini.'
    },
    judulBerkasDitolak: 'Berkas yang perlu diunggah ulang:',
    cekStatus: 'Perkembangan pendaftaran dapat dilihat di {tautan}',
    penutup: "Wassalamu'alaikum,",
    tandaTangan: 'Petugas Pendaftaran Hamasah International'
  },

  email: {
    salam: "Assalamu'alaikum {nama},",
    penutup: 'Email ini dikirim otomatis oleh Hamasah International. Hubungi tim kami lewat halaman kontak bila ada pertanyaan.',
    jenis: {
      'registration-status': { judul: 'Status pendaftaran {nomor}: {status}', pembuka: 'Status pendaftaran {nomor} kini {status}.' },
      'document-revision': { judul: 'Berkas pendaftaran {nomor} perlu diperbaiki', pembuka: 'Salah satu berkas pada pendaftaran {nomor} belum dapat diterima dan perlu diunggah ulang.' },
      'departure-assigned': { judul: 'Kloter keberangkatan {nomor}: {kloter}', pembuka: 'Pendaftaran {nomor} sudah ditetapkan masuk {kloter}.' },
      'departure-updated': { judul: 'Perubahan jadwal {kloter} ({nomor})', pembuka: 'Ada perubahan pada kloter keberangkatan {kloter} untuk pendaftaran {nomor}:' },
      'payment-received': { judul: 'Pembayaran diterima: {tagihan}', pembuka: 'Pembayaran untuk tagihan {tagihan}{atasNama} sebesar {jumlah} sudah kami terima.' },
      'invoice-issued': { judul: 'Tagihan baru {tagihan}', pembuka: 'Tagihan baru telah diterbitkan{atasNama}: {keterangan} sebesar {jumlah} (nomor {tagihan}).' },
      'invoice-reminder': { judul: 'Pengingat tagihan {tagihan}', pembuka: 'Kami mengingatkan bahwa tagihan {tagihan}{atasNama} untuk {keterangan} sebesar {jumlah} belum tercatat lunas.' }
    }
  },

  kop: {
    namaLembaga: 'Hamasah International',
    alamat: '',
    kontak: '',
    rekening: [],
    catatanKuitansi: '',
    penandatanganNama: '',
    penandatanganJabatan: '',
    catatanRapor: 'Rapor ini bukan transkrip resmi Universitas Al-Azhar.'
  },

  dokumen: {
    passport: { label: 'Paspor', petunjuk: 'Paspor (berlaku minimal 18 bulan)', wajib: true },
    diploma: { label: 'Ijazah', petunjuk: 'Ijazah (asli, terjemah, atau legalisir)', wajib: true },
    transcript: { label: 'Transkrip nilai', petunjuk: 'Transkrip nilai', wajib: true },
    'health-certificate': { label: 'Surat keterangan sehat', petunjuk: 'Surat keterangan sehat (hasil tes darah)', wajib: true },
    photo: { label: 'Pasfoto 4x6', petunjuk: 'Pasfoto 4x6 latar putih', wajib: true },
    other: { label: 'Dokumen tambahan', petunjuk: 'Dokumen lain: akta, KK, rekomendasi Kemenag, surat pernyataan wali', wajib: false }
  }
});

const BLOK = Object.freeze(Object.keys(BAWAAN));

const LABEL_BLOK = Object.freeze({
  whatsapp: 'Pesan WhatsApp',
  email: 'Email notifikasi',
  kop: 'Kop & rekening PDF',
  dokumen: 'Dokumen pendaftar'
});

// ---------------------------------------------------------------------------- validasi

class KesalahanTemplate extends Error {
  constructor(bidang, pesan) {
    super(pesan);
    this.bidang = bidang;
  }
}

function objek(nilai) {
  return nilai && typeof nilai === 'object' && !Array.isArray(nilai) ? nilai : {};
}

function teks(nilai, bidang, label, { min = 0, maks = 200, baris = false } = {}) {
  let hasil = typeof nilai === 'string' ? nilai : (nilai === undefined || nilai === null ? '' : String(nilai));
  hasil = hasil.replace(/\r\n?/g, '\n');
  hasil = baris
    ? hasil.split('\n').map((satu) => satu.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
    : hasil.replace(/\s+/g, ' ').trim();
  if (hasil.length < min) throw new KesalahanTemplate(bidang, min <= 1 ? `${label} wajib diisi.` : `${label} minimal ${min} karakter.`);
  if (hasil.length > maks) throw new KesalahanTemplate(bidang, `${label} maksimal ${maks} karakter.`);
  return hasil;
}

// Hanya isian yang ada di `izin` yang boleh dipakai. `wajib` harus muncul minimal sekali.
function isian(nilai, bidang, label, izin, { wajib = [], ...aturan } = {}) {
  const hasil = teks(nilai, bidang, label, aturan);
  for (const [, nama] of hasil.matchAll(/\{([^{}\s]*)\}/g)) {
    if (!izin.includes(nama)) {
      const tersedia = izin.length ? `Yang tersedia: ${izin.map((item) => `{${item}}`).join(', ')}.` : 'Bagian ini tidak memakai isian.';
      throw new KesalahanTemplate(bidang, `${label}: isian {${nama}} tidak dikenal. ${tersedia}`);
    }
  }
  for (const nama of wajib) {
    if (!hasil.includes(`{${nama}}`)) throw new KesalahanTemplate(bidang, `${label} harus memuat {${nama}}.`);
  }
  return hasil;
}

const PERIKSA = Object.freeze({
  whatsapp(nilai) {
    const v = objek(nilai);
    const status = {};
    for (const kunci of STATUS_PENDAFTARAN) {
      status[kunci] = isian(objek(v.status)[kunci], `status.${kunci}`, 'Pesan status', ['nama', 'nomor'], { min: 10, maks: 600, baris: true });
    }
    return {
      salam: isian(v.salam, 'salam', 'Salam pembuka', ['sapaan'], { min: 3, maks: 120 }),
      status,
      judulBerkasDitolak: isian(v.judulBerkasDitolak, 'judulBerkasDitolak', 'Judul daftar berkas ditolak', [], { min: 3, maks: 120 }),
      cekStatus: isian(v.cekStatus, 'cekStatus', 'Kalimat cek status', ['tautan'], { min: 5, maks: 200, wajib: ['tautan'] }),
      penutup: isian(v.penutup, 'penutup', 'Salam penutup', [], { min: 3, maks: 120 }),
      tandaTangan: isian(v.tandaTangan, 'tandaTangan', 'Nama pengirim', [], { min: 3, maks: 120 })
    };
  },

  email(nilai) {
    const v = objek(nilai);
    const jenis = {};
    for (const kunci of JENIS_EMAIL) {
      const j = objek(objek(v.jenis)[kunci]);
      jenis[kunci] = {
        judul: isian(j.judul, `jenis.${kunci}.judul`, 'Judul email', ISIAN_EMAIL[kunci], { min: 5, maks: 150 }),
        pembuka: isian(j.pembuka, `jenis.${kunci}.pembuka`, 'Kalimat utama', ISIAN_EMAIL[kunci], { min: 10, maks: 600 })
      };
    }
    return {
      salam: isian(v.salam, 'salam', 'Salam pembuka', ['nama'], { min: 3, maks: 120 }),
      penutup: isian(v.penutup, 'penutup', 'Kalimat penutup', [], { min: 10, maks: 400 }),
      jenis
    };
  },

  kop(nilai) {
    const v = objek(nilai);
    const rekening = Array.isArray(v.rekening) ? v.rekening : [];
    if (rekening.length > 4) throw new KesalahanTemplate('rekening', 'Rekening maksimal 4.');
    return {
      namaLembaga: teks(v.namaLembaga, 'namaLembaga', 'Nama lembaga', { min: 3, maks: 80 }),
      alamat: teks(v.alamat, 'alamat', 'Alamat', { maks: 300, baris: true }),
      kontak: teks(v.kontak, 'kontak', 'Kontak', { maks: 160 }),
      rekening: rekening.map((item, i) => {
        const r = objek(item);
        const nomor = teks(r.nomor, `rekening.${i}.nomor`, `Nomor rekening ke-${i + 1}`, { min: 5, maks: 40 });
        if (!/^[0-9 .-]+$/.test(nomor)) throw new KesalahanTemplate(`rekening.${i}.nomor`, `Nomor rekening ke-${i + 1} hanya boleh angka, spasi, titik, atau tanda hubung.`);
        return {
          bank: teks(r.bank, `rekening.${i}.bank`, `Nama bank ke-${i + 1}`, { min: 2, maks: 60 }),
          nomor,
          atasNama: teks(r.atasNama, `rekening.${i}.atasNama`, `Atas nama rekening ke-${i + 1}`, { min: 3, maks: 80 })
        };
      }),
      catatanKuitansi: teks(v.catatanKuitansi, 'catatanKuitansi', 'Catatan kuitansi', { maks: 300 }),
      penandatanganNama: teks(v.penandatanganNama, 'penandatanganNama', 'Nama penandatangan', { maks: 80 }),
      penandatanganJabatan: teks(v.penandatanganJabatan, 'penandatanganJabatan', 'Jabatan penandatangan', { maks: 80 }),
      catatanRapor: teks(v.catatanRapor, 'catatanRapor', 'Catatan rapor', { maks: 300 })
    };
  },

  dokumen(nilai) {
    const v = objek(nilai);
    const hasil = {};
    for (const kunci of JENIS_DOKUMEN) {
      const d = objek(v[kunci]);
      hasil[kunci] = {
        label: teks(d.label, `${kunci}.label`, 'Nama dokumen', { min: 3, maks: 60 }),
        petunjuk: teks(d.petunjuk, `${kunci}.petunjuk`, 'Keterangan untuk pendaftar', { min: 3, maks: 160 }),
        wajib: d.wajib === true
      };
    }
    if (!JENIS_DOKUMEN.some((kunci) => hasil[kunci].wajib)) {
      throw new KesalahanTemplate('passport.wajib', 'Minimal satu dokumen harus wajib.');
    }
    return hasil;
  }
});

function periksaBlok(blok, nilai) {
  if (!PERIKSA[blok]) return { ok: false, error: 'Bagian template tidak dikenal.', bidang: null };
  try {
    return { ok: true, nilai: PERIKSA[blok](nilai) };
  } catch (error) {
    if (error instanceof KesalahanTemplate) return { ok: false, error: error.message, bidang: error.bidang };
    throw error;
  }
}

// ---------------------------------------------------------------------------- pemakaian

// Mengganti {isian} dengan nilai. Isian yang tidak ada di `nilai` dibiarkan apa adanya.
function isiTeks(template, nilai) {
  return String(template).replace(/\{([^{}\s]+)\}/g, (cocok, nama) => (Object.prototype.hasOwnProperty.call(nilai, nama) ? String(nilai[nama]) : cocok));
}

// Jenis dokumen wajib, untuk hitungan "berkas diterima dari yang wajib".
function dokumenWajib(dokumen) {
  return JENIS_DOKUMEN.filter((kunci) => dokumen[kunci] && dokumen[kunci].wajib);
}

// Baris rekening untuk PDF dan email: "BSI 1234567890 a.n. Yayasan Hamasah".
function barisRekening(rekening) {
  return (rekening || []).map((r) => `${r.bank} ${r.nomor} a.n. ${r.atasNama}`);
}

module.exports = {
  BAWAAN,
  BLOK,
  ISIAN_EMAIL,
  JENIS_DOKUMEN,
  JENIS_EMAIL,
  LABEL_BLOK,
  STATUS_PENDAFTARAN,
  barisRekening,
  dokumenWajib,
  isiTeks,
  periksaBlok
};
