// Beranda musyrif: urusan administrasi santri di asrama yang dipegang (lapor diri, lapor
// pendidikan, status pendidikan). Musyrif mencatat urusan dengan batas waktu; admin melihat
// hitung mundurnya di Monitoring pusat. Data dari /api/musyrif/urusan.
//
// Semua isi dibangun lewat textContent; tidak ada data dari server yang masuk innerHTML.
(function initUrusanSantri() {
  const LABEL_STATUS = Object.freeze({ baru: 'Baru', diproses: 'Sedang diproses', selesai: 'Selesai' });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function tombol(teks, kelas, aksi) {
    const node = el('button', kelas, teks);
    node.type = 'button';
    node.addEventListener('click', aksi);
    return node;
  }

  function render({ headers }) {
    const akar = el('section', 'mp-card us');
    akar.id = 'urusan-santri';
    const kepala = el('div', 'mp-card__head');
    kepala.append(el('h4', 'mp-card__title', 'Urusan administrasi santri'));
    const status = el('p', 'mp-status');
    status.setAttribute('role', 'status');
    const isi = el('div', 'us__body');
    akar.append(kepala, el('p', 'mp-sub', 'Catat lapor diri, lapor pendidikan, dan status pendidikan santri di asramamu. Isi batas waktunya, nanti admin melihat hitung mundurnya.'), status, isi);
    let data = null;

    async function kirim(metode, body) {
      const response = await fetch('/api/musyrif/urusan', {
        method: metode, headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const hasil = await response.json();
      if (!response.ok) throw new Error(hasil.error || 'Belum dapat disimpan.');
      return hasil;
    }

    function formBaru() {
      const form = el('form', 'us__form');
      const baris = (label, input) => {
        const l = el('label', 'mp-dialog__field');
        l.append(el('span', '', label), input);
        form.append(l);
        return input;
      };
      const santri = el('select');
      santri.required = true;
      santri.append(new Option('Pilih santri', ''));
      data.students.forEach((s) => santri.append(new Option(s.name, s.id)));
      baris('Santri', santri);
      const jenis = el('select');
      data.kinds.forEach((k) => jenis.append(new Option(k.label, k.id)));
      baris('Jenis urusan', jenis);
      const batas = el('input');
      batas.type = 'date';
      batas.required = true;
      baris('Batas waktu', batas);
      const catatan = el('textarea');
      catatan.rows = 2;
      catatan.maxLength = 500;
      catatan.required = true;
      catatan.minLength = 3;
      baris('Catatan', catatan);
      const simpan = el('button', 'button button--primary mp-small', 'Simpan urusan');
      simpan.type = 'submit';
      form.append(simpan);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        simpan.disabled = true;
        try {
          await kirim('POST', { studentId: santri.value, kind: jenis.value, note: catatan.value, dueOn: batas.value });
          await muat('Urusan dicatat.');
        } catch (error) {
          status.textContent = error.message;
        } finally {
          simpan.disabled = false;
        }
      });
      const bungkus = el('details', 'us__new');
      bungkus.append(el('summary', '', 'Catat urusan baru'), form);
      return bungkus;
    }

    function baris(item) {
      const li = el('li', `mp-case is-${item.severity} is-${item.status}`);
      const utama = el('div', 'mp-case__main');
      const atas = el('div', 'mp-case__top');
      atas.append(el('strong', 'mp-case__name', item.studentName), el('span', 'mp-case__meta', item.dormitory || ''));
      utama.append(atas, el('p', 'mp-case__title', item.title), el('p', 'mp-case__detail', item.detail));
      const sisi = el('div', 'mp-case__side');
      const lencana = el('div', 'mp-case__badges');
      if (item.daysLeft !== null && item.status !== 'selesai') {
        const lewat = item.daysLeft < 0;
        lencana.append(el('span', `mp-chip ${lewat || item.severity === 'tinggi' ? 'mp-chip--urgent' : 'mp-chip--soon'}`,
          lewat ? `Terlambat ${-item.daysLeft} hari` : item.daysLeft === 0 ? 'Hari ini' : `Sisa ${item.daysLeft} hari`));
      }
      lencana.append(el('span', `mp-status-badge mp-status-badge--${item.status}`, LABEL_STATUS[item.status]));
      sisi.append(lencana);
      const ubah = (statusBaru) => async () => {
        status.textContent = 'Menyimpan...';
        try {
          await kirim('PATCH', { studentId: item.studentId, kind: item.kind, ref: item.ref, status: statusBaru });
          await muat(`Status ${item.studentName} diubah.`);
        } catch (error) {
          status.textContent = error.message;
        }
      };
      if (item.status === 'baru') sisi.append(tombol('Mulai proses', 'button button--secondary mp-small', ubah('diproses')));
      if (item.status !== 'selesai') sisi.append(tombol('Tandai selesai', 'button button--primary mp-small', ubah('selesai')));
      else sisi.append(tombol('Buka lagi', 'button button--secondary mp-small', ubah('baru')));
      li.append(utama, sisi);
      return li;
    }

    function gambar() {
      isi.replaceChildren();
      if (!data.students.length) {
        isi.append(el('p', 'mp-empty', 'Belum ada santri di asramamu.'));
        return;
      }
      isi.append(formBaru());
      if (!data.items.length) {
        isi.append(el('p', 'mp-empty', 'Belum ada urusan yang dicatat.'));
        return;
      }
      const ul = el('ul', 'mp-list');
      data.items.forEach((item) => ul.append(baris(item)));
      isi.append(ul);
    }

    async function muat(pesan) {
      try {
        const response = await fetch('/api/musyrif/urusan', { headers: headers() });
        const hasil = await response.json();
        if (!response.ok) throw new Error(hasil.error || 'Urusan belum dapat dimuat.');
        data = hasil;
        status.textContent = typeof pesan === 'string' ? pesan : '';
        gambar();
      } catch (error) {
        status.textContent = error.message;
      }
    }

    muat();
    return akar;
  }

  window.HamasahUrusanSantri = Object.freeze({ render, tanggal: (nilai) => TANGGAL.format(new Date(`${nilai}T00:00:00Z`)) });
}());
