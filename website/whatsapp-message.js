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

  // Template bawaan. Super admin bisa menggantinya di halaman Template; petugas lalu
  // mengirim nilai dari GET /api/templates/whatsapp lewat opsi 	emplate dan dokumen.
  const DEFAULT_TEMPLATE = Object.freeze({
    salam: "Assalamu'alaikum {sapaan},",
    status: STATUS_MESSAGES,
    judulBerkasDitolak: 'Berkas yang perlu diunggah ulang:',
    cekStatus: 'Perkembangan pendaftaran dapat dilihat di {tautan}',
    penutup: "Wassalamu'alaikum,",
    tandaTangan: 'Petugas Pendaftaran Hamasah International'
  });

  // recipient: 'applicant' (calon santri) atau 'guardian' (wali).
  // statusUrl: alamat halaman cek status; hanya alamat, tanpa kode akses.
  // template: blok "whatsapp" dari halaman Template. dokumen: blok "dokumen" (nama dokumen).
  function registrationMessage(registration, { recipient = 'applicant', statusUrl = '', template = null, dokumen = null } = {}) {
    const t = { ...DEFAULT_TEMPLATE, ...(template || {}), status: { ...STATUS_MESSAGES, ...((template && template.status) || {}) } };
    const applicant = registration.applicant || {};
    const sapaan = recipient === 'guardian' && applicant.guardianName
      ? `Bapak/Ibu ${applicant.guardianName}`
      : recipient === 'guardian' ? 'Bapak/Ibu' : applicant.applicantName || '';
    const baris = [t.salam.replaceAll('{sapaan}', sapaan).replace(' ,', ','), ''];
    baris.push(isi(t.status[registration.status] || 'Ada pembaruan pada pendaftaran {nama} (nomor {nomor}).', registration));

    const ditolak = (registration.documents || []).filter((item) => item.reviewStatus === 'rejected');
    if (ditolak.length) {
      baris.push('', t.judulBerkasDitolak);
      for (const item of ditolak) {
        const label = (dokumen && dokumen[item.type] && dokumen[item.type].label) || DOCUMENT_LABELS[item.type] || item.type;
        baris.push(`- ${label}${item.reviewNote ? `: ${item.reviewNote}` : ''}`);
      }
    }

    if (statusUrl && registration.status !== 'cancelled') {
      baris.push('', t.cekStatus.replaceAll('{tautan}', statusUrl));
    }
    baris.push('', t.penutup, t.tandaTangan);
    return baris.join('\n');
  }

  function whatsappUrl(phone, message) {
    const nomor = toWhatsappNumber(phone);
    if (!nomor) return '';
    return `https://wa.me/${nomor}?text=${encodeURIComponent(message)}`;
  }

  return Object.freeze({ DEFAULT_TEMPLATE, DOCUMENT_LABELS, STATUS_MESSAGES, registrationMessage, toWhatsappNumber, whatsappUrl });
});
