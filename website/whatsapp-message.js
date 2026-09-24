// Pesan WhatsApp siap kirim untuk petugas pendaftaran.
//
// Pengurus memutuskan pemberitahuan ke pendaftar dikirim manual lewat WhatsApp
// (bukan email otomatis). Modul ini hanya menyusun teks dan tautan wa.me; yang
// menekan kirim tetap petugas, dari WhatsApp miliknya sendiri. Tidak ada data
// yang dikirim ke pihak ketiga oleh aplikasi.
//
// Dipakai browser (staff.js) dan diuji di Node, dengan pola yang sama seperti
// registration-domain.js. Isinya harus tetap aman dibaca publik.
(function whatsappMessageModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.HamasahWhatsappMessage = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : null, function whatsappMessageFactory() {
  const DOCUMENT_LABELS = Object.freeze({
    passport: 'Paspor',
    diploma: 'Ijazah',
    transcript: 'Transkrip nilai',
    'health-certificate': 'Surat keterangan sehat',
    photo: 'Pasfoto 4x6',
    other: 'Dokumen tambahan'
  });

  // Kalimat inti per status. {nama} dan {nomor} diisi saat pesan disusun.
  const STATUS_MESSAGES = Object.freeze({
    submitted: 'Data pendaftaran {nama} dengan nomor {nomor} sudah kami terima. Petugas akan memeriksa berkasnya, dan kami kabari kembali setelah pemeriksaan selesai.',
    'document-review': 'Berkas pendaftaran {nama} (nomor {nomor}) sedang kami periksa. Mohon ditunggu, kami kabari kembali setelah pemeriksaan selesai.',
    'needs-revision': 'Setelah pemeriksaan, ada berkas pendaftaran {nama} (nomor {nomor}) yang perlu diperbaiki.',
    'academic-preparation': 'Alhamdulillah, berkas pendaftaran {nama} (nomor {nomor}) sudah lengkap dan diterima. Tahap berikutnya adalah persiapan akademik; rinciannya akan kami sampaikan.',
    'ready-for-departure': 'Alhamdulillah, {nama} (nomor {nomor}) sudah masuk tahap siap keberangkatan. Jadwal dan persiapan keberangkatan akan kami sampaikan.',
    completed: 'Proses pendaftaran {nama} (nomor {nomor}) sudah selesai. Jazakumullahu khairan atas kepercayaannya kepada Hamasah International.',
    cancelled: 'Pendaftaran {nama} dengan nomor {nomor} kami catat sebagai dibatalkan. Bila ada yang keliru, silakan balas pesan ini.'
  });

  // Nomor untuk wa.me: hanya angka, dengan kode negara, tanpa tanda plus.
  // Nomor Indonesia yang diawali 0 diubah ke 62, sama seperti normalizePhone di
  // registration-domain.js.
  function toWhatsappNumber(phone) {
    const angka = String(phone || '').replace(/\D/g, '');
    if (!angka) return '';
    const nomor = angka.startsWith('0') ? `62${angka.slice(1)}` : angka;
    // Panjang nomor internasional (E.164) 8 sampai 15 digit.
    return /^[1-9]\d{7,14}$/.test(nomor) ? nomor : '';
  }

  function isi(template, registration) {
    return template
      .replaceAll('{nama}', registration.applicant.applicantName || 'calon santri')
      .replaceAll('{nomor}', registration.registrationId);
  }

  // recipient: 'applicant' (calon santri) atau 'guardian' (wali).
  // statusUrl: alamat halaman cek status; hanya alamat, tanpa kode akses.
  function registrationMessage(registration, { recipient = 'applicant', statusUrl = '' } = {}) {
    const applicant = registration.applicant || {};
    const sapaan = recipient === 'guardian' && applicant.guardianName
      ? `Bapak/Ibu ${applicant.guardianName}`
      : recipient === 'guardian' ? 'Bapak/Ibu' : applicant.applicantName || '';
    const baris = [`Assalamu'alaikum ${sapaan},`.replace(' ,', ','), ''];
    baris.push(isi(STATUS_MESSAGES[registration.status] || 'Ada pembaruan pada pendaftaran {nama} (nomor {nomor}).', registration));

    const ditolak = (registration.documents || []).filter((dokumen) => dokumen.reviewStatus === 'rejected');
    if (ditolak.length) {
      baris.push('', 'Berkas yang perlu diunggah ulang:');
      for (const dokumen of ditolak) {
        const label = DOCUMENT_LABELS[dokumen.type] || dokumen.type;
        baris.push(`- ${label}${dokumen.reviewNote ? `: ${dokumen.reviewNote}` : ''}`);
      }
    }

    if (statusUrl && registration.status !== 'cancelled') {
      baris.push('', `Perkembangan pendaftaran dapat dilihat di ${statusUrl}`);
    }
    baris.push('', 'Wassalamu\'alaikum,', 'Petugas Pendaftaran Hamasah International');
    return baris.join('\n');
  }

  function whatsappUrl(phone, message) {
    const nomor = toWhatsappNumber(phone);
    if (!nomor) return '';
    return `https://wa.me/${nomor}?text=${encodeURIComponent(message)}`;
  }

  return Object.freeze({ DOCUMENT_LABELS, STATUS_MESSAGES, registrationMessage, toWhatsappNumber, whatsappUrl });
});
