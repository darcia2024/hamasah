// Galeri asrama (17 Oktober 2026), dipakai Kelola Asrama (unggah dan tarik foto) dan
// beranda santri/wali (melihat). Foto bersifat privat: diambil lewat GET /api/files/:id
// dengan sesi, lalu ditampilkan sebagai blob URL. Unggahan dikecilkan di peramban (sisi
// terpanjang 1600 px, JPEG) dan dikirim lewat alur /api/uploads berjenis 'dormitory-photo'.
(function initGaleriAsrama() {
  const TANGGAL = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const cache = new Map();

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function tanggalFoto(f) {
    const iso = f.takenOn || (f.createdAt ? f.createdAt.slice(0, 10) : null);
    return iso ? TANGGAL.format(new Date(`${iso}T00:00:00Z`)) : '';
  }

  function ambilFoto(fileId, headers) {
    if (!cache.has(fileId)) {
      cache.set(fileId, fetch(`/api/files/${encodeURIComponent(fileId)}`, { headers })
        .then((r) => (r.ok ? r.blob() : null))
        .then((b) => (b ? URL.createObjectURL(b) : null))
        .catch(() => null));
    }
    return cache.get(fileId);
  }

  // Gambar dimuat saat mendekati layar, supaya galeri panjang tidak mengunduh semuanya.
  const pengamat = 'IntersectionObserver' in window
    ? new IntersectionObserver((entri) => {
      entri.forEach((e) => {
        if (!e.isIntersecting) return;
        pengamat.unobserve(e.target);
        if (typeof e.target.muatFoto === 'function') e.target.muatFoto();
      });
    }, { rootMargin: '200px' })
    : null;

  function ubin(f, headers, { onBuka, kecil = false } = {}) {
    const b = el('button', `galeri-tile${kecil ? ' galeri-tile--kecil' : ''}`);
    b.type = 'button';
    b.setAttribute('aria-label', f.caption ? `Buka foto: ${f.caption}` : 'Buka foto');
    b.muatFoto = async () => {
      const url = await ambilFoto(f.fileId, headers);
      if (!url) { b.classList.add('is-gagal'); return; }
      const img = el('img');
      img.alt = f.caption || 'Foto kegiatan asrama';
      img.decoding = 'async';
      img.src = url;
      img.addEventListener('load', () => b.classList.add('is-loaded'));
      b.prepend(img);
    };
    if (f.caption && !kecil) b.append(el('span', 'galeri-tile__cap', f.caption));
    b.addEventListener('click', onBuka);
    if (pengamat) pengamat.observe(b); else b.muatFoto();
    return b;
  }

  // Penampil layar penuh dengan tombol sebelumnya/berikutnya dan tombol panah keyboard.
  function bukaPenampil(items, mulai, headers) {
    let i = mulai;
    const dialog = el('dialog', 'galeri-viewer');
    dialog.setAttribute('aria-label', 'Galeri asrama');
    const panggung = el('figure', 'galeri-viewer__stage');
    const img = el('img', 'galeri-viewer__img');
    const ket = el('figcaption', 'galeri-viewer__cap');
    panggung.append(img, ket);
    const tutup = el('button', 'galeri-viewer__close', '×');
    tutup.type = 'button';
    tutup.setAttribute('aria-label', 'Tutup');
    const kiri = el('button', 'galeri-viewer__nav is-prev', '‹');
    kiri.type = 'button';
    kiri.setAttribute('aria-label', 'Foto sebelumnya');
    const kanan = el('button', 'galeri-viewer__nav is-next', '›');
    kanan.type = 'button';
    kanan.setAttribute('aria-label', 'Foto berikutnya');
    const hitung = el('span', 'galeri-viewer__count');
    dialog.append(panggung, tutup, kiri, kanan, hitung);

    async function tampil() {
      const f = items[i];
      img.removeAttribute('src');
      img.alt = f.caption || 'Foto kegiatan asrama';
      ket.replaceChildren(el('strong', '', f.caption || 'Kegiatan asrama'), el('span', '', tanggalFoto(f)));
      hitung.textContent = `${i + 1} / ${items.length}`;
      kiri.disabled = i === 0;
      kanan.disabled = i === items.length - 1;
      const url = await ambilFoto(f.fileId, headers);
      if (items[i] === f && url) img.src = url;
    }
    const geser = (d) => { const j = i + d; if (j >= 0 && j < items.length) { i = j; tampil(); } };
    kiri.addEventListener('click', () => geser(-1));
    kanan.addEventListener('click', () => geser(1));
    tutup.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') geser(-1);
      if (e.key === 'ArrowRight') geser(1);
    });
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
    tampil();
  }

  // items: [{ id, fileId, caption, takenOn, createdAt }]. aksi(f): elemen tambahan per foto
  // (misalnya tombol "Tarik" di Kelola Asrama). batas: jumlah ubin yang ditampilkan.
  function grid(items, { headers, aksi = null, batas = null, kelas = '' } = {}) {
    const wadah = el('div', `galeri-grid ${kelas}`.trim());
    const tampil = batas ? items.slice(0, batas) : items;
    tampil.forEach((f, idx) => {
      const sel = el('div', 'galeri-cell');
      sel.append(ubin(f, headers, { onBuka: () => bukaPenampil(items, idx, headers) }));
      if (aksi) {
        const tambahan = aksi(f);
        if (tambahan) sel.append(tambahan);
      }
      wadah.append(sel);
    });
    if (batas && items.length > batas) {
      const lagi = el('button', 'galeri-more', `+${items.length - batas} foto`);
      lagi.type = 'button';
      lagi.addEventListener('click', () => bukaPenampil(items, batas, headers));
      wadah.append(lagi);
    }
    return wadah;
  }

  async function kecilkan(file) {
    let gambar;
    try {
      gambar = await createImageBitmap(file);
    } catch {
      throw new Error('Berkas ini tidak bisa dibaca sebagai foto. Gunakan JPG, PNG, atau WebP.');
    }
    const skala = Math.min(1, 1600 / Math.max(gambar.width, gambar.height));
    const kanvas = document.createElement('canvas');
    kanvas.width = Math.round(gambar.width * skala);
    kanvas.height = Math.round(gambar.height * skala);
    const ktx = kanvas.getContext('2d');
    ktx.fillStyle = '#FFFFFF';
    ktx.fillRect(0, 0, kanvas.width, kanvas.height);
    ktx.drawImage(gambar, 0, 0, kanvas.width, kanvas.height);
    if (typeof gambar.close === 'function') gambar.close();
    const blob = await new Promise((resolve) => kanvas.toBlob(resolve, 'image/jpeg', 0.84));
    if (!blob) throw new Error('Foto belum dapat diproses. Coba foto lain.');
    return blob;
  }

  async function kirimJson(method, url, headers, body) {
    const response = await fetch(url, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const hasil = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(hasil.error || 'Foto belum dapat diunggah.');
    return hasil;
  }

  // Mengunggah satu foto untuk asrama dan mengembalikan id berkasnya.
  async function unggah(dormitoryId, file, headers) {
    const blob = await kecilkan(file);
    const minta = await kirimJson('POST', '/api/uploads', headers, { purpose: 'dormitory-photo', entityId: dormitoryId, fileName: 'foto-asrama.jpg', contentType: 'image/jpeg', size: blob.size });
    const id = encodeURIComponent(minta.upload.id);
    if (minta.directUpload) {
      const tautan = await kirimJson('POST', `/api/uploads/${id}/direct`, headers);
      const terkirim = await fetch(tautan.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      if (!terkirim.ok) throw new Error('Foto gagal dikirim ke penyimpanan.');
      await kirimJson('POST', `/api/uploads/${id}/confirm`, headers);
    } else {
      const response = await fetch(`/api/uploads/${id}/content`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'image/jpeg' }, body: blob });
      const hasil = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(hasil.error || 'Foto gagal diunggah.');
    }
    cache.set(minta.upload.id, Promise.resolve(URL.createObjectURL(blob)));
    return minta.upload.id;
  }

  window.HamasahGaleri = Object.freeze({ grid, unggah, tanggalFoto });
})();
