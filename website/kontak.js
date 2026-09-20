// Formulir konsultasi halaman kontak (Task R1.5 dan R1.6).
//
// Sebelumnya handler ini ditulis sebagai <script> inline di kontak.html dan
// diblokir Content Security Policy, sehingga penekanan tombol memicu submit
// native: halaman memuat ulang dan isian hilang tanpa pesan apa pun. Bahkan
// ketika berjalan, handler lama hanya membaca isian lalu membuangnya dan
// menampilkan pesan sukses. Sekarang pesan benar-benar dikirim ke
// POST /api/inquiries dan disimpan untuk ditindaklanjuti petugas.

// ---------------------------------------------------------------------------
// Nomor WhatsApp resmi.
//
// SATU-SATUNYA tempat nomor ini ditulis. Isi dengan format internasional tanpa
// tanda plus dan tanpa spasi, contoh: '6281234567890'. Selama masih kosong,
// tombol WhatsApp tidak ditampilkan sama sekali.
//
// Biarkan kosong sampai nomor resmi dikonfirmasi pemilik proses. Tahap 2 sudah
// menghapus seluruh nomor yang belum terkonfirmasi dari konten publik; jangan
// mengisi ini dengan nomor contoh.
// ---------------------------------------------------------------------------
const WHATSAPP_NUMBER = '';

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

  const submitButton = form.querySelector('button[type="submit"]');
  const submitLabel = submitButton ? submitButton.querySelector('span') : null;
  const labelAwal = submitLabel ? submitLabel.textContent : '';

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

  function setBusy(busy) {
    if (!submitButton) return;
    submitButton.disabled = busy;
    submitButton.setAttribute('aria-busy', busy ? 'true' : 'false');
    if (submitLabel) submitLabel.textContent = busy ? 'Mengirim...' : labelAwal;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors();
    setBusy(true);
    setStatus('Mengirim pesan konsultasi...', null);

    let response;
    let result;
    try {
      response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fields.name ? fields.name.value : '',
          phone: fields.phone ? fields.phone.value : '',
          topic: fields.topic ? fields.topic.value : '',
          message: fields.message ? fields.message.value : ''
        })
      });
      result = await response.json().catch(() => ({}));
    } catch {
      // Jaringan gagal berarti pesan tidak tersimpan. Jangan pernah menampilkan
      // sukses untuk keadaan ini.
      setBusy(false);
      setStatus('Pesan belum terkirim. Periksa koneksi Anda lalu coba lagi.', 'error');
      return;
    }

    setBusy(false);

    if (response.status === 429) {
      setStatus('Terlalu banyak pengiriman dari perangkat ini. Silakan coba lagi dalam beberapa saat.', 'error');
      return;
    }
    if (!response.ok) {
      setStatus(result.error || 'Pesan belum dapat dikirim. Silakan periksa kembali isian Anda.', 'error');
      if (result.field) markField(result.field);
      return;
    }

    form.reset();
    setStatus('Pesan konsultasi sudah kami terima. Tim Hamasah akan menghubungi Anda melalui nomor WhatsApp yang Anda tuliskan.', 'success');
  });
});
