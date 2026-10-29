// Pesan personal musyrif ke santri (server/student-message-service.js).
// Tiga tampilan dengan aturan privasi yang sama dengan server:
//   - santri: membaca pesan untuk dirinya dan menandainya dibaca;
//   - musyrif/admin: menulis pesan, memutuskan satu per satu apakah dibagikan ke wali, dan mengatur
//     catatan pembinaan mana yang boleh dilihat santri;
//   - wali: hanya melihat pesan yang sengaja dibagikan musyrif.
// Pesan tidak pernah dimasukkan ke dashboard atau rapor; semua lewat /api/students/:id/pesan.
(function initPesanPersonal() {
  const WAKTU = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function bagian(judul, keterangan, kelas = '') {
    const wadah = el('section', `wali-section ${kelas}`.trim());
    const kepala = el('header', 'wali-section__head');
    kepala.append(el('h3', 'wali-section__title', judul));
    if (keterangan) kepala.append(el('p', 'wali-section__note', keterangan));
    wadah.append(kepala);
    return wadah;
  }

  async function ambil(url, headers, opsi = {}) {
    const respons = await fetch(url, { headers: { ...headers, ...(opsi.body ? { 'Content-Type': 'application/json' } : {}) }, ...opsi });
    const hasil = await respons.json().catch(() => ({}));
    if (!respons.ok) throw new Error(hasil.error || 'Permintaan belum berhasil. Coba lagi.');
    return hasil;
  }

  function butirPesan(m, { tampilkanBagikan = false, onAksi = null } = {}) {
    const item = el('li', `wali-note is-${m.readAt === null || m.readAt === undefined ? 'catatan' : 'baik'}`);
    const meta = el('div', 'wali-note__meta');
    meta.append(el('span', 'wali-note__kind', m.kindLabel), el('span', '', `${WAKTU.format(new Date(m.createdAt))}${m.authorName ? ` · ${m.authorName}` : ''}`));
    item.append(meta, el('p', 'wali-note__body pesan-judul', m.subject), el('p', 'wali-note__body', m.body));
    if (tampilkanBagikan) {
      const status = m.sharedWithParent
        ? `Dibagikan ke wali oleh ${m.sharedBy || 'staf'}${m.sharedAt ? ` · ${WAKTU.format(new Date(m.sharedAt))}` : ''}`
        : 'Privat: hanya santri dan staf yang membaca.';
      item.append(el('p', 'wali-field__hint', `${m.readAt ? 'Sudah dibaca santri. ' : 'Belum dibaca santri. '}${status}`));
      if (onAksi) {
        const tombol = el('button', 'wali-link', m.sharedWithParent ? 'Tarik dari wali' : 'Bagikan ke wali');
        tombol.type = 'button';
        tombol.addEventListener('click', () => onAksi(m, tombol));
        item.append(tombol);
      }
    }
    return item;
  }

  // ------------------------------------------------------------ Santri
  function kartuSantri(student, headers, { onBaca = null } = {}) {
    const wadah = bagian('Pesan untuk kamu', 'Pesan pribadi dari musyrif atau petugas. Wali tidak melihatnya kecuali musyrif sengaja membagikannya.', 'pesan-santri');
    const isi = el('div');
    wadah.append(isi);

    async function muat() {
      let data;
      try { data = await ambil(`/api/students/${encodeURIComponent(student.id)}/pesan?t=${Date.now()}`, headers); } catch (error) {
        isi.replaceChildren(el('p', 'wali-empty', error.message));
        return;
      }
      if (data.available === false) { isi.replaceChildren(el('p', 'wali-empty', 'Fitur pesan belum aktif. Hubungi admin Hamasah.')); return; }
      if (!data.items.length) { isi.replaceChildren(el('p', 'wali-empty', 'Belum ada pesan personal untukmu.')); return; }
      const daftar = el('ul', 'wali-notes');
      data.items.forEach((m) => {
        const item = butirPesan(m);
        if (!m.readAt) {
          item.classList.add('is-catatan');
          const tombol = el('button', 'wali-link', 'Tandai sudah dibaca');
          tombol.type = 'button';
          tombol.addEventListener('click', async () => {
            tombol.disabled = true;
            try {
              await ambil(`/api/pesan/${encodeURIComponent(m.id)}/dibaca`, headers, { method: 'POST' });
              if (onBaca) onBaca();
              await muat();
            } catch (error) {
              tombol.disabled = false;
              tombol.textContent = error.message;
            }
          });
          item.append(tombol);
        }
        daftar.append(item);
      });
      isi.replaceChildren(el('p', 'wali-pending-note', data.unread ? `${data.unread} pesan belum dibaca.` : 'Semua pesan sudah dibaca.'), daftar);
    }
    muat();
    return wadah;
  }

  // ------------------------------------------------------------ Wali
  // Hanya pesan yang dibagikan musyrif. Tanpa pesan terbagi, kartu tidak ditampilkan sama sekali.
  async function kartuWali(student, headers) {
    let data;
    try { data = await ambil(`/api/students/${encodeURIComponent(student.id)}/pesan?t=${Date.now()}`, headers); } catch { return null; }
    if (!data.available || !data.items.length) return null;
    const wadah = bagian('Pesan dari musyrif', 'Pesan yang sengaja dibagikan musyrif kepada Bapak/Ibu. Pesan pribadi lain untuk ananda tidak ditampilkan di sini.', 'pesan-wali');
    const daftar = el('ul', 'wali-notes');
    data.items.forEach((m) => daftar.append(butirPesan(m)));
    wadah.append(daftar);
    return wadah;
  }

  // ------------------------------------------------------------ Musyrif dan admin
  function kartuStaf(student, headers) {
    const wadah = bagian('Pesan personal ke santri', 'Evaluasi, pengingat, atau apresiasi yang dikirim langsung ke santri. Pesan bersifat privat: wali baru melihatnya bila Anda membagikannya satu per satu.', 'pesan-staf');
    const form = el('form', 'wali-form');
    form.noValidate = true;
    const id = `pesan-${Math.random().toString(36).slice(2, 7)}`;
    const baris = (label, kontrol) => {
      const b = el('div', 'wali-form__row');
      const l = el('label', 'wali-field__label', label);
      kontrol.id = `${id}-${label.replace(/\W+/g, '')}`;
      l.htmlFor = kontrol.id;
      b.append(l, kontrol);
      return b;
    };
    const jenis = el('select', 'wali-field');
    [['evaluasi', 'Evaluasi'], ['pengingat', 'Pengingat'], ['apresiasi', 'Apresiasi'], ['lainnya', 'Pesan lain']].forEach(([v, t]) => jenis.append(new Option(t, v)));
    const judul = el('input', 'wali-field');
    judul.type = 'text';
    judul.maxLength = 120;
    judul.autocomplete = 'off';
    const isi = el('textarea', 'wali-field');
    isi.rows = 4;
    isi.maxLength = 2000;
    const kirim = el('button', 'button button--primary wali-action', 'Kirim ke santri');
    kirim.type = 'submit';
    const status = el('p', 'form-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    form.append(baris('Jenis pesan', jenis), baris('Judul singkat', judul), baris('Isi pesan', isi), kirim, status);
    const riwayat = el('div', 'wali-feedback__history');

    async function muat() {
      riwayat.replaceChildren(el('h4', 'wali-subtitle', 'Pesan yang sudah dikirim'));
      let data;
      try { data = await ambil(`/api/students/${encodeURIComponent(student.id)}/pesan?t=${Date.now()}`, headers); } catch (error) {
        riwayat.append(el('p', 'wali-empty', error.message));
        return;
      }
      if (data.available === false) { riwayat.append(el('p', 'wali-empty', 'Fitur belum aktif. Terapkan pembaruan database di halaman Pengaturan.')); return; }
      if (!data.items.length) { riwayat.append(el('p', 'wali-empty', 'Belum ada pesan untuk santri ini.')); return; }
      const daftar = el('ul', 'wali-notes');
      data.items.forEach((m) => daftar.append(butirPesan(m, {
        tampilkanBagikan: true,
        onAksi: async (pesan, tombol) => {
          if (!pesan.sharedWithParent && !window.confirm('Bagikan pesan ini ke wali? Wali akan dapat membaca isinya di portalnya.')) return;
          tombol.disabled = true;
          try {
            await ambil(`/api/pesan/${encodeURIComponent(pesan.id)}/bagikan`, headers, { method: 'PATCH', body: JSON.stringify({ shared: !pesan.sharedWithParent }) });
            await muat();
          } catch (error) {
            tombol.disabled = false;
            status.textContent = error.message;
            status.classList.add('is-error');
          }
        }
      })));
      riwayat.append(daftar);
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      status.classList.remove('is-error');
      if (judul.value.trim().length < 3) { status.textContent = 'Judul minimal 3 karakter.'; status.classList.add('is-error'); judul.focus(); return; }
      if (isi.value.trim().length < 5) { status.textContent = 'Isi pesan minimal 5 karakter.'; status.classList.add('is-error'); isi.focus(); return; }
      kirim.disabled = true;
      status.textContent = 'Mengirim...';
      try {
        await ambil(`/api/students/${encodeURIComponent(student.id)}/pesan`, headers, { method: 'POST', body: JSON.stringify({ kind: jenis.value, subject: judul.value, body: isi.value }) });
        status.textContent = 'Pesan terkirim ke santri. Wali tidak melihatnya kecuali Anda membagikannya.';
        judul.value = '';
        isi.value = '';
        await muat();
      } catch (error) {
        status.textContent = error.message;
        status.classList.add('is-error');
      } finally {
        kirim.disabled = false;
      }
    });

    wadah.append(form, riwayat);
    muat();
    return wadah;
  }

  // Tombol kecil di daftar laporan musyrif: catatan evaluasi atau disiplin ini tampil ke santri atau tidak.
  function tombolVisibilitas(studentId, koleksi, rekaman, headers, onUbah) {
    if (!['evaluations', 'violations'].includes(koleksi)) return null;
    const tampil = rekaman.studentVisible !== false && (koleksi === 'evaluations' || rekaman.studentVisible === true);
    const tombol = el('button', 'mus-link', tampil ? 'Tampil ke santri · sembunyikan' : 'Tersembunyi dari santri · tampilkan');
    tombol.type = 'button';
    tombol.addEventListener('click', async () => {
      tombol.disabled = true;
      try {
        await ambil(`/api/students/${encodeURIComponent(studentId)}/catatan/${koleksi}/${encodeURIComponent(rekaman.id)}/visibilitas`, headers, { method: 'PATCH', body: JSON.stringify({ studentVisible: !tampil }) });
        if (onUbah) onUbah();
      } catch (error) {
        tombol.disabled = false;
        tombol.textContent = error.message;
      }
    });
    return tombol;
  }

  window.HamasahPesanPersonal = Object.freeze({ kartuSantri, kartuWali, kartuStaf, tombolVisibilitas });
}());
