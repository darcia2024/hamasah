// Formulir pertanyaan halaman kontak.
//
// Sejak 14 Oktober 2026: isian dicatat ke POST /api/inquiries (kotak masuk konsol petugas)
// dan pada saat yang sama WhatsApp Admin 1 dibuka dengan pesan yang sudah tersusun, jadi
// pengunjung tinggal menekan kirim. WhatsApp dibuka langsung saat tombol ditekan (tidak
// menunggu server) supaya tidak diblokir peramban sebagai jendela munculan.

// ---------------------------------------------------------------------------
// Nomor WhatsApp resmi.
//
// Diisi server lewat <meta name="hamasah-whatsapp"> dan diubah super admin dari halaman
// Konten Website. Nomor di sini hanya cadangan bila meta itu tidak ada (format
// internasional tanpa tanda plus dan spasi). Selama kosong, tombol WhatsApp tidak tampil.
//
// Nomor bawaan dikonfirmasi pengurus 24 September 2026 (butir A2): satu admin untuk
// Indonesia dan Mesir.
// ---------------------------------------------------------------------------
const WHATSAPP_NUMBER = (document.querySelector('meta[name="hamasah-whatsapp"]') || {}).content || '6281288489997';

function whatsappUrl() {
  const nomor = String(WHATSAPP_NUMBER || '').replace(/\D/g, '');
  if (!nomor) return '';
  const pesan = encodeURIComponent('Assalamu\'alaikum, saya ingin bertanya tentang program Hamasah International.');
  return `https://wa.me/${nomor}?text=${pesan}`;
}

function setupWhatsapp() {
  const wrapper = document.querySelector('#inquiry-whatsapp');
  const link = document.querySelector('#inquiry-whatsapp-link');
  if (!wrapper || !link) return;
  const url = whatsappUrl();
  if (!url) {
    wrapper.hidden = true;
    return;
  }
  link.href = url;
  link.target = '_blank';
  wrapper.hidden = false;
}

document.addEventListener('DOMContentLoaded', () => {
  setupWhatsapp();

  const form = document.querySelector('#contact-inquiry-form');
  const status = document.querySelector('#inquiry-status');
  if (!form || !status) return;

  const fields = {
    name: document.querySelector('#inquiry-name'),
    phone: document.querySelector('#inquiry-phone'),
    topic: document.querySelector('#inquiry-topic'),
    message: document.querySelector('#inquiry-message')
  };

  function setStatus(pesan, jenis) {
    status.textContent = pesan;
    status.className = jenis ? `form-status is-${jenis}` : 'form-status';
  }

  function clearFieldErrors() {
    Object.values(fields).forEach((field) => {
      if (field) field.removeAttribute('aria-invalid');
    });
  }

  function markField(nama) {
    const field = fields[nama];
    if (!field) return;
    field.setAttribute('aria-invalid', 'true');
    field.focus();
  }

  // Tautan dari halaman lain boleh membawa ?topic=biaya dan sejenisnya.
  const requestedTopic = new URLSearchParams(window.location.search).get('topic');
  if (fields.topic && requestedTopic && [...fields.topic.options].some((option) => option.value === requestedTopic)) {
    fields.topic.value = requestedTopic;
  }

  // Pintasan topik di kiri formulir langsung memilih topik yang sesuai.
  document.querySelectorAll('[data-topic]').forEach((shortcut) => {
    shortcut.addEventListener('click', () => {
      if (fields.topic) fields.topic.value = shortcut.dataset.topic;
      if (fields.message) window.setTimeout(() => fields.message.focus({ preventScroll: true }), 0);
    });
  });

  // Pesan yang dibuka di WhatsApp: salam, nama, topik, lalu pertanyaannya.
  function susunPesan() {
    const nama = fields.name.value.trim().replace(/\s+/g, ' ');
    const topik = fields.topic ? fields.topic.options[fields.topic.selectedIndex].textContent.trim() : '';
    const pertanyaan = fields.message.value.trim();
    return [
      "Assalamu'alaikum, admin Hamasah International.",
      '',
      `Nama: ${nama}`,
      topik ? `Topik: ${topik}` : null,
      '',
      'Pertanyaan:',
      pertanyaan
    ].filter((baris) => baris !== null).join('\n');
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearFieldErrors();

    if (!fields.name || fields.name.value.trim().length < 2) {
      setStatus('Tulis nama Anda terlebih dahulu.', 'error');
      markField('name');
      return;
    }
    if (!fields.phone || fields.phone.value.replace(/\D/g, '').length < 9) {
      setStatus('Tulis nomor WhatsApp Anda, contoh 0812xxxxxxxx.', 'error');
      markField('phone');
      return;
    }
    if (!fields.message || fields.message.value.trim().length < 5) {
      setStatus('Tulis pertanyaan Anda terlebih dahulu.', 'error');
      markField('message');
      return;
    }

    const nomor = String(WHATSAPP_NUMBER || '').replace(/\D/g, '');
    if (!nomor) {
      setStatus('Nomor WhatsApp admin belum tersedia. Silakan coba lagi nanti.', 'error');
      return;
    }

    const url = `https://wa.me/${nomor}?text=${encodeURIComponent(susunPesan())}`;
    // Catatan untuk konsol petugas. keepalive: tetap terkirim walau pengunjung pindah ke WhatsApp.
    const catatan = fetch('/api/inquiries', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fields.name.value,
        phone: fields.phone.value,
        topic: fields.topic ? fields.topic.value : '',
        message: fields.message.value
      })
    }).then((response) => response.ok).catch(() => false);
    // Dibuka di tab baru supaya isian tidak hilang bila pengunjung kembali. Bila peramban
    // memblokir tab baru, tautan di bawah tombol tetap bisa diketuk.
    const jendela = window.open(url, '_blank', 'noopener');
    status.className = 'form-status is-success';
    status.textContent = jendela === null
      ? 'WhatsApp belum terbuka. '
      : 'WhatsApp dibuka dengan pesan Anda, tinggal tekan kirim. Belum terbuka? ';
    const tautan = document.createElement('a');
    tautan.href = url;
    tautan.target = '_blank';
    tautan.rel = 'noopener';
    tautan.textContent = 'Buka WhatsApp';
    status.append(tautan, '.');
    // Isian dikosongkan hanya bila catatan tersimpan, supaya bisa dikirim ulang bila gagal.
    catatan.then((tersimpan) => { if (tersimpan) form.reset(); });
  });
});
