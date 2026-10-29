// Unggah dan buka berkas privat lewat alur /api/uploads (minta tempat, kirim isi, konfirmasi). Dipakai bukti penyelesaian
// tiket, surat, dan bukti KPI. Berkas tidak pernah punya tautan publik: dibuka lewat permintaan beraut izin lalu ditampilkan
// dari blob lokal.
(function initUnggahBerkas() {
  async function json(method, url, headers, body) {
    const respons = await fetch(url, { method, headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const hasil = await respons.json().catch(() => ({}));
    if (!respons.ok) throw new Error(hasil.error || 'Permintaan belum berhasil.');
    return hasil;
  }

  const TIPE_DITERIMA = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG' };
  const DARI_EKSTENSI = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };

  // Pemeriksaan sebelum satu byte pun dikirim, dengan pesan yang bisa dipahami pengguna.
  function periksa(berkas, maksMb) {
    if (!berkas) throw new Error('Pilih berkas dulu.');
    if (!berkas.size) throw new Error('Berkas ini kosong. Pilih berkas yang benar.');
    if (berkas.size > maksMb * 1024 * 1024) throw new Error(`Berkas terlalu besar (${(berkas.size / 1024 / 1024).toFixed(1)} MB). Maksimal ${maksMb} MB; kecilkan atau pilih berkas lain.`);
    const ekstensi = String(berkas.name || '').split('.').pop().toLowerCase();
    const tipe = TIPE_DITERIMA[berkas.type] ? berkas.type : DARI_EKSTENSI[ekstensi];
    if (!tipe) throw new Error('Jenis berkas belum diterima. Gunakan PDF, JPG, atau PNG.');
    return tipe;
  }

  // purpose: tujuan berkas (mis. 'case-evidence'); entityId: id pemilik (mis. id santri); maksMb: batas ukuran di sisi klien
  // (server tetap memeriksa lagi). Mengembalikan id berkas.
  async function kirim({ purpose, entityId, berkas, headers, maksMb = 5 }) {
    const tipe = periksa(berkas, maksMb);
    const minta = await json('POST', '/api/uploads', headers, { purpose, entityId, fileName: berkas.name, contentType: tipe, size: berkas.size });
    const id = encodeURIComponent(minta.upload.id);
    if (minta.directUpload) {
      const tautan = await json('POST', `/api/uploads/${id}/direct`, headers);
      const terkirim = await fetch(tautan.uploadUrl, { method: 'PUT', headers: { 'Content-Type': tipe }, body: berkas });
      if (!terkirim.ok) throw new Error('Berkas gagal dikirim ke penyimpanan.');
      await json('POST', `/api/uploads/${id}/confirm`, headers);
    } else {
      const respons = await fetch(`/api/uploads/${id}/content`, { method: 'PUT', headers: { ...headers, 'Content-Type': tipe }, body: berkas });
      const hasil = await respons.json().catch(() => ({}));
      if (!respons.ok) throw new Error(hasil.error || 'Berkas gagal diunggah.');
    }
    return minta.upload.id;
  }

  // Membuka berkas di tab baru lewat blob lokal.
  async function buka(fileId, headers) {
    const respons = await fetch(`/api/files/${encodeURIComponent(fileId)}`, { headers });
    if (!respons.ok) throw new Error((await respons.json().catch(() => ({}))).error || 'Berkas tidak dapat dibuka.');
    const url = URL.createObjectURL(await respons.blob());
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  window.HamasahUnggah = Object.freeze({ kirim, buka, periksa });
}());
