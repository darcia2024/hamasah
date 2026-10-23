(function () {
  'use strict';
  function link(item) {
    const parsed = new URL(item.url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'wa.me') throw Error('Tautan WhatsApp tidak valid.');
    const a = document.createElement('a');
    a.className = 'button button--primary'; a.href = parsed.href;
    a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = item.recipientName ? `Buka WhatsApp: ${item.recipientName}` : 'Buka WhatsApp';
    return a;
  }
  function append(parent, item) { if (item && item.url) parent.append(document.createElement('br'), link(item)); }
  function show(value) {
    const items = Array.isArray(value) ? value : [value];
    const dialog = document.createElement('dialog'); dialog.className = 'op-dialog manual-whatsapp-dialog';
    dialog.setAttribute('aria-labelledby', 'manual-whatsapp-title');
    const body = document.createElement('div'); body.className = 'op-dialog__body';
    const title = document.createElement('h3'); title.id = 'manual-whatsapp-title'; title.textContent = 'Pesan WhatsApp siap';
    const note = document.createElement('p'); note.textContent = 'Periksa penerima dan isi pesan, lalu tekan Kirim di WhatsApp. Membuka pesan belum berarti pesan sudah dikirim.';
    body.append(title, note);
    items.forEach(item => {
      const group = document.createElement('section'); group.className = 'staff-note-box';
      const label = document.createElement('label'); label.textContent = item.recipientName || 'Pesan untuk penerima';
      const preview = document.createElement('textarea'); preview.readOnly = true; preview.tabIndex = -1; preview.rows = 8; preview.value = item.message; preview.setAttribute('aria-label', `Isi pesan ${item.recipientName || 'WhatsApp'}`);
      label.append(preview); group.append(label, link(item)); body.append(group);
      if (item.requiresContactSelection) { const help = document.createElement('p'); help.textContent = 'Pilih kontak pemilik akun yang sesuai di WhatsApp. Nomor penerima belum terhubung pada data ini.'; group.append(help); }
    });
    const close = document.createElement('button'); close.type = 'button'; close.className = 'button button--secondary'; close.textContent = 'Selesai'; close.addEventListener('click', () => dialog.close());
    body.append(close); dialog.append(body); document.body.append(dialog);
    return new Promise(resolve => {
      dialog.addEventListener('close', () => { dialog.remove(); resolve(); }, { once: true });
      title.tabIndex = -1; dialog.showModal(); title.focus({ preventScroll: true });
      body.querySelectorAll('textarea').forEach(preview => { preview.scrollTop = 0; });
    });
  }
  window.HamasahManualWhatsapp = Object.freeze({ append, show });
}());
