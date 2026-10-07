// Editor isian super admin, dipakai dua halaman:
// - Konten Website (konten.html, <body data-editor="konten">): isi website publik.
//   Endpoint /api/admin/content (server/routes/site-content.js, server/site-content.js).
// - Template (template.html, <body data-editor="template">): pesan WhatsApp, email,
//   kop PDF, dan dokumen pendaftar. Endpoint /api/admin/templates (server/routes/templates.js,
//   server/templates.js).
//
// Formulir dibangun dari SKEMA di bawah. Nilai yang sedang disunting disimpan di `draf`
// (salinan nilai tersimpan); setiap kotak isian menulis ke draf lewat data-path, misalnya
// "program.kuliah.harga" atau "2.jawab". Jalur yang sama dipakai server untuk menunjuk
// kotak yang salah, jadi pesan kesalahan bisa ditempelkan ke kotaknya.
const guard = document.querySelector('#content-guard');
const guardCopy = document.querySelector('#content-guard-copy');
const consoleSection = document.querySelector('#content-console');
const tabs = document.querySelector('#content-tabs');
const form = document.querySelector('#content-form');
const fieldsBox = document.querySelector('#content-fields');
const title = document.querySelector('#content-title');
const desc = document.querySelector('#content-desc');
const preview = document.querySelector('#content-preview');
const lastChanged = document.querySelector('#content-last');
const restoreButton = document.querySelector('#content-restore');
const resetButton = document.querySelector('#content-reset');
const saveButton = document.querySelector('#content-save');
const status = document.querySelector('#content-status');
const unavailable = document.querySelector('#content-unavailable');
const staffNav = document.querySelector('#staff-nav');

const pratinjauBox = document.querySelector('#content-pratinjau');

const EDITOR = document.body.dataset.editor === 'template' ? 'template' : 'konten';
const KONFIG = {
  konten: {
    api: '/api/admin/content',
    halaman: 'konten',
    simpanan: 'hamasahKontenBagian',
    bawaan: 'Masih memakai isi bawaan website.',
    tersimpan: 'Tersimpan. Halaman website memakai isi baru dalam beberapa menit (paling lama sekitar 5 menit).',
    dikembalikan: 'kembali ke isi bawaan. Website memakai isi ini dalam beberapa menit.'
  },
  template: {
    api: '/api/admin/templates',
    halaman: 'template',
    simpanan: 'hamasahTemplateBagian',
    bawaan: 'Masih memakai template bawaan.',
    tersimpan: 'Tersimpan. Template baru langsung dipakai untuk pesan, email, dan PDF berikutnya.',
    dikembalikan: 'kembali ke template bawaan.'
  }
}[EDITOR];

const PROGRAM = [['kuliah', 'Kuliah S1 Al-Azhar'], ['mahad', "Ma'had Al-Azhar"], ['courses', 'Hamasah Courses']];

// jenis: teks, area, saklar, tanggal, pilih. maks mengikuti batas di server.
const SKEMA_KONTEN = {
  kontak: {
    keterangan: 'Nomor WhatsApp admin, alamat kantor, dan akun media sosial. Nomor baru langsung dipakai di semua tombol WhatsApp di website.',
    tautan: 'kontak.html',
    isi: [
      { k: 'whatsapp', label: 'Nomor WhatsApp admin', jenis: 'teks', maks: 20, petunjuk: 'Dengan kode negara, misalnya 6281234567890. Awalan 0 diubah otomatis menjadi 62.', format: 'whatsapp' },
      { k: 'alamatIndonesia', label: 'Alamat kantor Indonesia', jenis: 'area', baris: 3, maks: 300, petunjuk: 'Satu baris per baris alamat.' },
      { k: 'alamatMesir', label: 'Alamat kantor Mesir', jenis: 'area', baris: 3, maks: 300, petunjuk: 'Satu baris per baris alamat.' },
      { k: 'jamLayanan', label: 'Jam layanan', jenis: 'teks', maks: 200 },
      { k: 'email', label: 'Email (tidak wajib)', jenis: 'teks', maks: 120, petunjuk: 'Tampil di halaman Kontak bila diisi.' },
      { k: 'instagram', label: 'Instagram (tidak wajib)', jenis: 'teks', maks: 60, petunjuk: 'Nama akun, misalnya hamasah.international.' },
      { k: 'tiktok', label: 'TikTok (tidak wajib)', jenis: 'teks', maks: 60, petunjuk: 'Nama akun tanpa @.' },
      { k: 'youtube', label: 'YouTube (tidak wajib)', jenis: 'teks', maks: 300, petunjuk: 'Alamat kanal lengkap, diawali https://www.youtube.com/.' }
    ]
  },
  biaya: {
    keterangan: 'Kartu biaya tiap program dan tanya-jawab seputar biaya di halaman Biaya & fasilitas.',
    tautan: 'biaya.html',
    isi: [
      { k: 'pengantar', label: 'Pengantar halaman biaya', jenis: 'area', baris: 3, maks: 500 },
      ...PROGRAM.map(([kunci, nama]) => ({
        grup: `Program ${nama}`,
        k: `program.${kunci}`,
        isi: [
          { k: 'label', label: 'Label di atas biaya', jenis: 'teks', maks: 40, petunjuk: 'Misalnya: SPP Asrama & Hidup.' },
          { k: 'harga', label: 'Biaya', jenis: 'teks', maks: 60, petunjuk: 'Misalnya: Rp 45.000.000, atau Dikonfirmasi saat konsultasi.' },
          { k: 'keterangan', label: 'Keterangan di bawah biaya', jenis: 'teks', maks: 120 },
          { k: 'fasilitas', label: 'Yang didapat', jenis: 'daftar-teks', maks: 160, batas: 12, minimal: 1, tambah: 'Tambah butir' }
        ]
      })),
      {
        k: 'faq', label: 'Tanya-jawab biaya', jenis: 'daftar', batas: 12, tambah: 'Tambah tanya-jawab', nama: 'Tanya-jawab',
        isi: [
          { k: 'tanya', label: 'Pertanyaan', jenis: 'teks', maks: 200 },
          { k: 'jawab', label: 'Jawaban', jenis: 'area', baris: 3, maks: 800 }
        ]
      }
    ]
  },
  program: {
    keterangan: 'Sasaran dan ringkasan tiap program di beranda, serta paragraf pembuka di halaman programnya.',
    tautan: 'index.html#program',
    isi: PROGRAM.map(([kunci, nama]) => ({
      grup: nama,
      k: kunci,
      isi: [
        { k: 'syarat', label: 'Sasaran (teks kecil di atas judul)', jenis: 'teks', maks: 60, petunjuk: 'Misalnya: Usia 13 sampai 30 tahun.' },
        { k: 'ringkasan', label: 'Ringkasan di beranda', jenis: 'area', baris: 2, maks: 200 },
        { k: 'pengantar', label: 'Paragraf pembuka halaman program', jenis: 'area', baris: 3, maks: 500 }
      ]
    }))
  },
  testimoni: {
    keterangan: 'Kartu testimoni wali di beranda. Urutan di sini sama dengan urutan tampil.',
    tautan: 'index.html#testimoni',
    akar: {
      jenis: 'daftar', batas: 8, tambah: 'Tambah testimoni', nama: 'Testimoni',
      isi: [
        { k: 'nama', label: 'Nama pemberi testimoni', jenis: 'teks', maks: 120, petunjuk: 'Misalnya: Wali dari Ahmad Fauzan.' },
        { k: 'keterangan', label: 'Keterangan', jenis: 'teks', maks: 80, petunjuk: "Misalnya: Santri Ma'had Al-Azhar." },
        { k: 'kutipan', label: 'Kutipan singkat', jenis: 'area', baris: 2, maks: 200, petunjuk: 'Satu kalimat yang tampil besar di kartu.' },
        { k: 'isi', label: 'Testimoni lengkap (tidak wajib)', jenis: 'area', baris: 6, maks: 4000, petunjuk: 'Pisahkan paragraf dengan satu baris kosong.' },
        { k: 'foto', label: 'Foto', jenis: 'pilih', pilihan: 'foto', petunjuk: 'Foto baru dikirim ke pengembang untuk ditambahkan ke pilihan ini.' },
        { k: 'alt', label: 'Keterangan foto untuk pembaca layar', jenis: 'teks', maks: 160, petunjuk: 'Wajib bila memakai foto. Misalnya: Ayah dan ibu wali santri.' }
      ]
    }
  },
  faq: {
    keterangan: 'Pertanyaan umum di beranda. Asisten website juga menjawab dari isi ini.',
    tautan: 'index.html#bantuan',
    akar: {
      jenis: 'daftar', batas: 10, minimal: 1, tambah: 'Tambah pertanyaan', nama: 'Pertanyaan',
      isi: [
        { k: 'tanya', label: 'Pertanyaan (tombol)', jenis: 'teks', maks: 120 },
        { k: 'topik', label: 'Topik (teks kecil di atas jawaban)', jenis: 'teks', maks: 60, petunjuk: 'Misalnya: Tentang biaya.' },
        { k: 'judul', label: 'Judul jawaban', jenis: 'teks', maks: 200 },
        { k: 'jawab', label: 'Jawaban', jenis: 'area', baris: 4, maks: 800 }
      ]
    }
  },
  pengumuman: {
    keterangan: 'Pita pengumuman di bagian atas beranda. Bisa diberi tanggal mulai dan selesai supaya hilang sendiri.',
    tautan: 'index.html',
    isi: [
      { k: 'aktif', label: 'Tampilkan pengumuman', jenis: 'saklar', petunjuk: 'Pengumuman hanya tampil bila saklar ini menyala dan hari ini berada di rentang tanggalnya.' },
      { k: 'teks', label: 'Isi pengumuman', jenis: 'area', baris: 2, maks: 200, petunjuk: 'Misalnya: Gelombang 2 dibuka sampai 30 November 2026.' },
      { k: 'tautanTeks', label: 'Teks tautan (tidak wajib)', jenis: 'teks', maks: 40, petunjuk: 'Misalnya: Daftar sekarang.' },
      { k: 'tautanUrl', label: 'Alamat tautan (tidak wajib)', jenis: 'teks', maks: 300, petunjuk: 'Halaman di situs ini (misalnya #pendaftaran atau biaya.html) atau alamat https://.' },
      { k: 'mulai', label: 'Tampil mulai tanggal (tidak wajib)', jenis: 'tanggal' },
      { k: 'selesai', label: 'Tampil sampai tanggal (tidak wajib)', jenis: 'tanggal' }
    ]
  }
};

const STATUS_PENDAFTARAN = [
  ['submitted', 'Pendaftaran baru masuk'],
  ['document-review', 'Berkas sedang diperiksa'],
  ['needs-revision', 'Berkas perlu diperbaiki'],
  ['academic-preparation', 'Persiapan akademik'],
  ['ready-for-departure', 'Siap berangkat'],
  ['completed', 'Selesai'],
  ['cancelled', 'Dibatalkan']
];

const JENIS_EMAIL = [
  ['registration-status', 'Status pendaftaran berubah', '{nomor}, {status}'],
  ['document-revision', 'Berkas perlu diperbaiki', '{nomor}'],
  ['departure-assigned', 'Masuk kloter keberangkatan', '{nomor}, {kloter}'],
  ['departure-updated', 'Jadwal kloter berubah', '{nomor}, {kloter}'],
  ['payment-received', 'Pembayaran diterima', '{tagihan}, {atasNama}, {jumlah}, {kuitansi}'],
  ['invoice-issued', 'Tagihan baru', '{tagihan}, {atasNama}, {keterangan}, {jumlah}'],
  ['invoice-reminder', 'Pengingat tagihan', '{tagihan}, {atasNama}, {keterangan}, {jumlah}']
];

const JENIS_DOKUMEN = [
  ['passport', 'Paspor'], ['diploma', 'Ijazah'], ['transcript', 'Transkrip nilai'],
  ['health-certificate', 'Surat keterangan sehat'], ['photo', 'Pasfoto'], ['other', 'Dokumen lain']
];

// Contoh pendaftar untuk pratinjau pesan WhatsApp dan email.
const CONTOH_PENDAFTAR = {
  registrationId: 'HI-REG-2026-00012',
  status: 'needs-revision',
  applicant: { applicantName: 'Ahmad Fauzan', guardianName: 'Hadi Santoso' },
  documents: [{ type: 'passport', reviewStatus: 'rejected', reviewNote: 'Masa berlaku kurang dari 18 bulan.' }]
};

function isiContoh(teks, nilai) {
  return String(teks || '').replace(/\{([^{}\s]+)\}/g, (cocok, nama) => (nama in nilai ? nilai[nama] : cocok));
}

const SKEMA_TEMPLATE = {
  whatsapp: {
    keterangan: 'Pesan yang disusun tombol "Kabari lewat WhatsApp" di halaman Pendaftaran. Petugas tetap bisa menyuntingnya sebelum menekan kirim.',
    isi: [
      { k: 'salam', label: 'Salam pembuka', jenis: 'teks', maks: 120, petunjuk: 'Isian: {sapaan} (nama calon santri, atau "Bapak/Ibu" dan nama wali).' },
      {
        grup: 'Kalimat utama per status pendaftaran',
        k: 'status',
        isi: STATUS_PENDAFTARAN.map(([kunci, nama]) => ({ k: kunci, label: nama, jenis: 'area', baris: 3, maks: 600, petunjuk: 'Isian: {nama}, {nomor}.' }))
      },
      { k: 'judulBerkasDitolak', label: 'Judul daftar berkas yang ditolak', jenis: 'teks', maks: 120, petunjuk: 'Tampil bila ada berkas yang ditolak, diikuti nama berkas dan catatan petugas.' },
      { k: 'cekStatus', label: 'Kalimat tautan cek status', jenis: 'teks', maks: 200, petunjuk: 'Wajib memuat {tautan}.' },
      { k: 'penutup', label: 'Salam penutup', jenis: 'teks', maks: 120 },
      { k: 'tandaTangan', label: 'Nama pengirim', jenis: 'teks', maks: 120 }
    ],
    pratinjau(draf) {
      return window.HamasahWhatsappMessage.registrationMessage(CONTOH_PENDAFTAR, {
        recipient: 'guardian',
        statusUrl: `${window.location.origin}/website/cek-status.html`,
        template: draf,
        dokumen: data.nilai.dokumen
      });
    }
  },
  email: {
    keterangan: 'Email otomatis ke pendaftar dan wali. Rincian seperti tanggal kloter dan tautan dibuat sistem; yang diatur di sini salam, judul, kalimat utama, dan penutup.',
    isi: [
      { k: 'salam', label: 'Salam pembuka', jenis: 'teks', maks: 120, petunjuk: 'Isian: {nama} (nama penerima).' },
      { k: 'penutup', label: 'Kalimat penutup', jenis: 'area', baris: 2, maks: 400 },
      ...JENIS_EMAIL.map(([kunci, nama, isian]) => ({
        grup: `Email: ${nama}`,
        k: `jenis.${kunci}`,
        isi: [
          { k: 'judul', label: 'Judul email', jenis: 'teks', maks: 150, petunjuk: `Isian: ${isian}.` },
          { k: 'pembuka', label: 'Kalimat utama', jenis: 'area', baris: 2, maks: 600, petunjuk: `Isian: ${isian}. Nilai isian dicetak tebal.` }
        ]
      }))
    ],
    pratinjau(draf) {
      const nilai = { nama: 'Bapak Hadi Santoso', nomor: CONTOH_PENDAFTAR.registrationId, status: 'Perlu perbaikan berkas' };
      const jenis = draf.jenis['registration-status'];
      return [
        `Contoh email "Status pendaftaran berubah"`,
        '',
        `Judul: ${isiContoh(jenis.judul, nilai)}`,
        '',
        isiContoh(draf.salam, nilai),
        isiContoh(jenis.pembuka, nilai),
        '(rincian dan tautan cek status dari sistem)',
        draf.penutup
      ].join('\n');
    }
  },
  kop: {
    keterangan: 'Kepala dan catatan di kuitansi pembayaran dan rapor santri (PDF). Rekening resmi juga dicantumkan di email tagihan.',
    isi: [
      { k: 'namaLembaga', label: 'Nama lembaga', jenis: 'teks', maks: 80 },
      { k: 'alamat', label: 'Alamat (tidak wajib)', jenis: 'area', baris: 2, maks: 300, petunjuk: 'Ditulis satu baris di bawah nama lembaga.' },
      { k: 'kontak', label: 'Kontak (tidak wajib)', jenis: 'teks', maks: 160, petunjuk: 'Misalnya: WhatsApp +62 878-9759-1978 · admin@hamasah.id' },
      {
        k: 'rekening', label: 'Rekening resmi pembayaran', jenis: 'daftar', batas: 4, tambah: 'Tambah rekening', nama: 'Rekening',
        isi: [
          { k: 'bank', label: 'Nama bank', jenis: 'teks', maks: 60 },
          { k: 'nomor', label: 'Nomor rekening', jenis: 'teks', maks: 40 },
          { k: 'atasNama', label: 'Atas nama', jenis: 'teks', maks: 80 }
        ]
      },
      { k: 'catatanKuitansi', label: 'Catatan di kuitansi (tidak wajib)', jenis: 'area', baris: 2, maks: 300, petunjuk: 'Misalnya: Pembayaran hanya sah ke rekening di atas.' },
      { k: 'penandatanganNama', label: 'Nama penandatangan kuitansi (tidak wajib)', jenis: 'teks', maks: 80 },
      { k: 'penandatanganJabatan', label: 'Jabatan penandatangan (tidak wajib)', jenis: 'teks', maks: 80 },
      { k: 'catatanRapor', label: 'Catatan di akhir rapor', jenis: 'area', baris: 2, maks: 300 }
    ],
    pratinjau(draf) {
      const rekening = (draf.rekening || []).map((r) => `- ${r.bank} ${r.nomor} a.n. ${r.atasNama}`);
      return [
        'KUITANSI PEMBAYARAN',
        draf.namaLembaga,
        ...(draf.alamat ? [draf.alamat.split('\n').join(', ')] : []),
        ...(draf.kontak ? [draf.kontak] : []),
        '----------------------------------------',
        'Nomor kuitansi, nama santri, jumlah, tanggal bayar ...',
        ...(rekening.length ? ['', 'Rekening resmi pembayaran', ...rekening] : []),
        ...(draf.catatanKuitansi ? ['', draf.catatanKuitansi] : []),
        ...(draf.penandatanganNama ? ['', 'Hormat kami,', '', draf.penandatanganNama, draf.penandatanganJabatan || ''] : [])
      ].join('\n');
    }
  },
  dokumen: {
    keterangan: 'Nama dan keterangan berkas yang diunggah pendaftar di halaman Cek status, serta mana yang wajib. Dokumen wajib dihitung di ringkasan berkas anggota kloter.',
    isi: JENIS_DOKUMEN.map(([kunci, nama]) => ({
      grup: nama,
      k: kunci,
      isi: [
        { k: 'label', label: 'Nama dokumen', jenis: 'teks', maks: 60, petunjuk: 'Tampil di daftar berkas, pesan WhatsApp, dan halaman petugas.' },
        { k: 'petunjuk', label: 'Keterangan untuk pendaftar', jenis: 'teks', maks: 160, petunjuk: 'Tampil di pilihan jenis berkas saat mengunggah.' },
        { k: 'wajib', label: 'Wajib diunggah', jenis: 'saklar' }
      ]
    }))
  }
};

const SKEMA = EDITOR === 'template' ? SKEMA_TEMPLATE : SKEMA_KONTEN;

let data = null;
let aktif = EDITOR === 'template' ? 'whatsapp' : 'kontak';
let draf = null;

function session() {
  try { return JSON.parse(sessionStorage.getItem('hamasahPortalSession') || 'null'); } catch { return null; }
}

function headers() {
  const current = session();
  return current ? { Authorization: `Bearer ${current.accessToken}` } : {};
}

function waktu(iso) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(iso));
}

function setStatus(text, error = false) {
  status.textContent = text;
  status.classList.toggle('is-error', error);
}

function salin(nilai) {
  return JSON.parse(JSON.stringify(nilai));
}

async function kirim(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: { ...headers(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'Permintaan belum dapat diproses.');
    error.errors = result.errors || null;
    throw error;
  }
  return result;
}

// Daftar di akar (testimoni, FAQ) memakai jalur kosong, yaitu draf itu sendiri.
function ambil(objek, jalur) {
  if (jalur === '') return objek;
  return jalur.split('.').reduce((isi, kunci) => (isi === undefined || isi === null ? undefined : isi[kunci]), objek);
}

function tulis(objek, jalur, nilai) {
  const bagian = jalur.split('.');
  const terakhir = bagian.pop();
  const wadah = bagian.reduce((isi, kunci) => isi[kunci], objek);
  wadah[terakhir] = nilai;
}

function gabung(...bagian) {
  return bagian.filter((item) => item !== '' && item !== undefined && item !== null).join('.');
}

// Sama dengan formatWhatsapp di server/site-content.js.
function formatWhatsapp(nilai) {
  let angka = String(nilai || '').replace(/[\s().+-]/g, '');
  if (/^0\d+$/.test(angka)) angka = `62${angka.slice(1)}`;
  if (!/^[1-9]\d{9,14}$/.test(angka)) return '';
  const kode = angka.startsWith('62') ? '62' : angka.startsWith('20') ? '20' : angka.slice(0, 2);
  const sisa = angka.slice(kode.length);
  const kelompok = [sisa.slice(0, 3)];
  for (let i = 3; i < sisa.length; i += 4) kelompok.push(sisa.slice(i, i + 4));
  return `+${kode} ${kelompok.join('-')}`;
}

let nomorId = 0;

function kotak(def, jalur) {
  const id = `isi-${nomorId += 1}`;
  const nilai = ambil(draf, jalur);
  const baris = document.createElement('div');
  baris.className = def.jenis === 'saklar' ? 'setting-row' : 'setting-field';
  baris.dataset.jalur = jalur;

  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = def.label;

  let kontrol;
  if (def.jenis === 'area') {
    kontrol = document.createElement('textarea');
    kontrol.rows = def.baris || 3;
  } else if (def.jenis === 'pilih') {
    kontrol = document.createElement('select');
    (data.fotoTestimoni || []).forEach((foto) => kontrol.add(new Option(foto.label, foto.berkas)));
  } else {
    kontrol = document.createElement('input');
    kontrol.type = def.jenis === 'saklar' ? 'checkbox' : def.jenis === 'tanggal' ? 'date' : 'text';
    if (def.jenis === 'saklar') {
      kontrol.className = 'setting-switch';
      kontrol.setAttribute('role', 'switch');
    }
  }
  kontrol.id = id;
  kontrol.dataset.path = jalur;
  if (def.maks) kontrol.maxLength = def.maks;
  if (def.jenis === 'saklar') kontrol.checked = Boolean(nilai);
  else kontrol.value = nilai === undefined || nilai === null ? '' : String(nilai);

  const petunjuk = document.createElement('p');
  petunjuk.className = 'setting-field__hint';
  petunjuk.id = `${id}-ket`;
  const tulisPetunjuk = () => {
    const tampil = def.format === 'whatsapp' ? formatWhatsapp(kontrol.value) : '';
    petunjuk.textContent = [def.petunjuk, tampil ? `Tampil sebagai ${tampil}.` : ''].filter(Boolean).join(' ');
  };
  tulisPetunjuk();
  if (def.format) kontrol.addEventListener('input', tulisPetunjuk);
  kontrol.setAttribute('aria-describedby', petunjuk.id);

  if (def.jenis === 'saklar') {
    const teks = document.createElement('div');
    teks.className = 'setting-row__text';
    teks.append(label, petunjuk);
    baris.append(teks, kontrol);
  } else {
    baris.append(label, kontrol);
    if (petunjuk.textContent) baris.append(petunjuk);
  }
  return baris;
}

function tombolKecil(teks, aksi, nonaktif) {
  const tombol = document.createElement('button');
  tombol.type = 'button';
  tombol.className = 'button button--secondary content-item__btn';
  tombol.textContent = teks;
  tombol.disabled = Boolean(nonaktif);
  tombol.addEventListener('click', aksi);
  return tombol;
}

// Daftar butir (tanya-jawab, testimoni, fasilitas): bisa ditambah, dihapus, dan diurutkan.
function daftar(def, jalur) {
  const wadah = document.createElement('div');
  wadah.className = 'content-list';
  wadah.dataset.jalur = jalur;
  const isi = ambil(draf, jalur) || [];

  if (def.label) {
    const judul = document.createElement('p');
    judul.className = 'content-list__title';
    judul.textContent = def.label;
    wadah.append(judul);
  }

  isi.forEach((_, i) => {
    const jalurButir = gabung(jalur, i);
    const butir = document.createElement('div');
    butir.className = def.jenis === 'daftar-teks' ? 'content-item content-item--inline' : 'content-item';

    const kepala = document.createElement('div');
    kepala.className = 'content-item__head';
    const nama = document.createElement('strong');
    nama.textContent = def.jenis === 'daftar-teks' ? `${i + 1}.` : `${def.nama} ${i + 1}`;
    const aksi = document.createElement('div');
    aksi.className = 'content-item__actions';
    const geser = (arah) => () => {
      const daftarNilai = ambil(draf, jalur);
      const [satu] = daftarNilai.splice(i, 1);
      daftarNilai.splice(i + arah, 0, satu);
      gambarFormulir();
    };
    aksi.append(
      tombolKecil('Naik', geser(-1), i === 0),
      tombolKecil('Turun', geser(1), i === isi.length - 1),
      tombolKecil('Hapus', () => {
        ambil(draf, jalur).splice(i, 1);
        gambarFormulir();
      }, (def.minimal || 0) >= isi.length)
    );
    kepala.append(nama, aksi);
    butir.append(kepala);

    if (def.jenis === 'daftar-teks') {
      butir.append(kotak({ label: `Butir ${i + 1}`, jenis: 'teks', maks: def.maks }, jalurButir));
    } else {
      def.isi.forEach((anak) => butir.append(kotak(anak, gabung(jalurButir, anak.k))));
    }
    wadah.append(butir);
  });

  const tambah = tombolKecil(def.tambah, () => {
    const baru = def.jenis === 'daftar-teks' ? '' : Object.fromEntries(def.isi.map((anak) => [anak.k, anak.jenis === 'saklar' ? false : '']));
    ambil(draf, jalur).push(baru);
    gambarFormulir();
    const kotakBaru = fieldsBox.querySelectorAll(`[data-path^="${gabung(jalur, isi.length)}"]`)[0];
    if (kotakBaru) kotakBaru.focus();
  }, isi.length >= def.batas);
  tambah.classList.add('content-list__add');
  wadah.append(tambah);
  return wadah;
}

function bagian(defs, awal) {
  const hasil = [];
  defs.forEach((def) => {
    if (def.grup) {
      const grup = document.createElement('fieldset');
      grup.className = 'content-group';
      const legenda = document.createElement('legend');
      legenda.textContent = def.grup;
      grup.append(legenda, ...bagian(def.isi, gabung(awal, def.k)));
      hasil.push(grup);
    } else if (def.jenis === 'daftar' || def.jenis === 'daftar-teks') {
      hasil.push(daftar(def, gabung(awal, def.k)));
    } else {
      hasil.push(kotak(def, gabung(awal, def.k)));
    }
  });
  return hasil;
}

function gambarFormulir() {
  const skema = SKEMA[aktif];
  const isi = skema.akar ? [daftar(skema.akar, '')] : bagian(skema.isi, '');
  fieldsBox.replaceChildren(...isi);
  tandaiPerubahan();
  gambarPratinjau();
}

// Contoh hasil (pesan WhatsApp, email, kuitansi) dari draf yang sedang disunting.
function gambarPratinjau() {
  if (!pratinjauBox) return;
  const skema = SKEMA[aktif];
  pratinjauBox.hidden = !skema.pratinjau;
  if (!skema.pratinjau) return;
  let teks;
  try { teks = skema.pratinjau(draf); } catch { teks = 'Pratinjau belum dapat ditampilkan.'; }
  pratinjauBox.querySelector('pre').textContent = teks;
}

function adaPerubahan() {
  return data && JSON.stringify(draf) !== JSON.stringify(data.nilai[aktif]);
}

function tandaiPerubahan() {
  const berubah = adaPerubahan();
  saveButton.disabled = !berubah || !data.tersedia;
  resetButton.disabled = !berubah;
  restoreButton.disabled = !data.tersimpan[aktif] || !data.tersedia;
  if (!status.classList.contains('is-error')) setStatus(berubah ? 'Ada perubahan yang belum disimpan.' : '');
}

function gambarTab() {
  tabs.replaceChildren(...data.blok.map((blok) => {
    const tombol = document.createElement('button');
    tombol.type = 'button';
    tombol.className = `crm-pill-btn${blok.kunci === aktif ? ' is-active' : ''}`;
    tombol.setAttribute('role', 'tab');
    tombol.setAttribute('aria-selected', String(blok.kunci === aktif));
    tombol.textContent = blok.label;
    tombol.addEventListener('click', () => pilih(blok.kunci));
    return tombol;
  }));
}

function gambarBagian() {
  const blok = data.blok.find((item) => item.kunci === aktif);
  const skema = SKEMA[aktif];
  title.textContent = blok.label;
  desc.textContent = skema.keterangan;
  preview.hidden = !skema.tautan;
  if (skema.tautan) preview.href = skema.tautan;
  const terakhir = data.terakhir[aktif];
  lastChanged.textContent = data.tersimpan[aktif] && terakhir
    ? `Diubah ${waktu(terakhir.pada)}${terakhir.oleh ? ` oleh ${terakhir.oleh}` : ''}.`
    : KONFIG.bawaan;
  draf = salin(data.nilai[aktif]);
  gambarTab();
  gambarFormulir();
}

function pilih(kunci) {
  if (kunci === aktif) return;
  if (adaPerubahan() && !window.confirm('Ada perubahan yang belum disimpan. Pindah bagian dan buang perubahan itu?')) return;
  aktif = kunci;
  setStatus('');
  try { sessionStorage.setItem(KONFIG.simpanan, kunci); } catch {}
  gambarBagian();
}

function terima(isi) {
  data = { ...data, ...isi };
  unavailable.hidden = data.tersedia;
}

async function muat() {
  const hasil = await kirim('GET', KONFIG.api);
  data = hasil;
  unavailable.hidden = hasil.tersedia;
  setStatus('');
  gambarBagian();
}

// Setiap kotak menulis ke draf. "change" ikut didengar untuk pilihan, saklar, dan tanggal.
function catatIsian(event) {
  const kontrol = event.target.closest('[data-path]');
  if (!kontrol) return;
  tulis(draf, kontrol.dataset.path, kontrol.type === 'checkbox' ? kontrol.checked : kontrol.value);
  kontrol.removeAttribute('aria-invalid');
  status.classList.remove('is-error');
  tandaiPerubahan();
  gambarPratinjau();
}
fieldsBox.addEventListener('input', catatIsian);
fieldsBox.addEventListener('change', catatIsian);

resetButton.addEventListener('click', () => {
  status.classList.remove('is-error');
  draf = salin(data.nilai[aktif]);
  gambarFormulir();
});

restoreButton.addEventListener('click', async () => {
  const blok = data.blok.find((item) => item.kunci === aktif);
  if (!window.confirm(`Kembalikan bagian ${blok.label} ke isi bawaan? Isi yang sekarang tersimpan akan dihapus.`)) return;
  restoreButton.disabled = true;
  try {
    const hasil = await kirim('DELETE', `${KONFIG.api}/${aktif}`);
    terima(hasil.isi);
    gambarBagian();
    setStatus(`${blok.label} ${KONFIG.dikembalikan}`);
  } catch (error) {
    setStatus(error.message, true);
    tandaiPerubahan();
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!adaPerubahan()) return;
  saveButton.disabled = true;
  saveButton.textContent = 'Menyimpan...';
  setStatus('');
  try {
    const hasil = await kirim('PUT', `${KONFIG.api}/${aktif}`, { nilai: draf });
    terima(hasil.isi);
    gambarBagian();
    setStatus(KONFIG.tersimpan);
  } catch (error) {
    setStatus(error.message, true);
    Object.keys(error.errors || {}).forEach((jalur) => {
      const kontrol = fieldsBox.querySelector(`[data-path="${jalur}"]`) || fieldsBox.querySelector(`[data-jalur="${jalur}"] [data-path]`);
      if (kontrol) kontrol.setAttribute('aria-invalid', 'true');
    });
    const salah = fieldsBox.querySelector('[aria-invalid="true"]');
    if (salah) salah.focus();
    saveButton.disabled = false;
  } finally {
    saveButton.textContent = 'Simpan';
  }
});

document.querySelector('#reload-content').addEventListener('click', () => {
  if (adaPerubahan() && !window.confirm('Buang perubahan yang belum disimpan?')) return;
  muat().catch((error) => setStatus(error.message || 'Konten belum dapat dimuat.', true));
});

window.addEventListener('beforeunload', (event) => {
  if (adaPerubahan()) event.preventDefault();
});

const logoutButton = document.querySelector('#logout-button');
if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', headers: headers() }).catch(() => {});
    sessionStorage.removeItem('hamasahPortalSession');
    window.location.reload();
  });
}

(async function initialize() {
  if (session()) document.body.classList.add('in-crm');
  try {
    const me = await window.hamasahMintaAkun(headers());
    const result = me.body;
    if (!me.ok || result.account.role !== 'admin') {
      throw new Error('Halaman ini hanya dapat dibuka oleh super admin.');
    }
    guard.hidden = true;
    consoleSection.hidden = false;
    document.body.classList.add('in-crm');
    renderStaffNav(staffNav, result.account.role, KONFIG.halaman, result.account);
    try {
      const tersimpan = sessionStorage.getItem(KONFIG.simpanan);
      if (tersimpan && SKEMA[tersimpan]) aktif = tersimpan;
    } catch {}
    await muat().catch((error) => setStatus(error.message || 'Konten belum dapat dimuat.', true));
  } catch (error) {
    guardCopy.textContent = error.message || 'Silakan masuk melalui Portal Hamasah.';
    const judul = guard.querySelector('h1');
    if (judul) judul.textContent = 'Akses konten website belum tersedia';
  }
}());
