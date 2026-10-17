// Iqamah santri (17 Oktober 2026): berapa lama lagi berlaku dan kapan harus mulai
// diperpanjang. Dipakai beranda santri (bisa melapor tanggal baru dan menandai sedang
// mengurus), beranda wali (hanya melihat), dan tab Iqamah di Kelola Asrama (asrama.js).
// Data: GET /api/iqamah-saya dan /api/asrama/:id/iqamah (server/residence-service.js).
// Semua teks lewat textContent; tidak ada atribut style.
(function initIqamah() {
  const TANGGAL = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const TAHAP = Object.freeze({
    kosong: { label: 'Belum diisi', nada: 'netral' },
    aman: { label: 'Masih aman', nada: 'baik' },
    siapkan: { label: 'Siapkan berkas', nada: 'cukup' },
    urus: { label: 'Segera urus', nada: 'perlu' },
    habis: { label: 'Sudah habis', nada: 'perlu' }
  });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function tanggal(iso) {
    return iso ? TANGGAL.format(new Date(`${iso}T00:00:00Z`)) : '';
  }

  function teksSisa(iqamah) {
    if (iqamah.sisaHari === null) return 'Belum diisi';
    if (iqamah.sisaHari < 0) return `Lewat ${-iqamah.sisaHari} hari`;
    if (iqamah.sisaHari === 0) return 'Habis hari ini';
    return `${iqamah.sisaHari} hari lagi`;
  }

  // Satu kalimat arahan sesuai tahap, untuk santri dan musyrif.
  function arahan(s, aturan, { santri = false } = {}) {
    const q = s.iqamah;
    const kamu = santri ? 'kamu' : 'santri';
    if (q.tahap === 'kosong') {
      return santri
        ? 'Tanggal habis iqamah belum tercatat. Laporkan tanggal di kartu iqamah-mu supaya musyrif bisa mengingatkan.'
        : 'Tanggal habis iqamah belum tercatat.';
    }
    if (q.tahap === 'habis') return `Iqamah sudah habis sejak ${tanggal(q.expiresOn)}. Segera urus ke kantor imigrasi bersama musyrif untuk menghindari denda.`;
    if (q.tahap === 'urus') return `Sudah lewat batas mulai mengurus (${tanggal(q.batasUrus)}). Urus perpanjangan sekarang, paling lambat sebelum ${tanggal(q.expiresOn)}.`;
    if (q.tahap === 'siapkan') return `Mulai siapkan berkas perpanjangan. Pengurusan paling lambat dimulai ${tanggal(q.batasUrus)}, ${aturan.batasUrusHari} hari sebelum habis.`;
    return `Perpanjangan mulai diurus paling lambat ${tanggal(q.batasUrus)}. Sampai saat itu ${kamu} belum perlu melakukan apa-apa.`;
  }

  function chip(tahap) {
    const t = TAHAP[tahap] || TAHAP.kosong;
    return el('span', `iqm-chip is-${t.nada}`, t.label);
  }

  function barisInfo(label, nilai, kelas = '') {
    const li = el('li', `iqm-facts__row ${kelas}`.trim());
    li.append(el('span', 'iqm-facts__label', label), el('strong', 'iqm-facts__value', nilai));
    return li;
  }

  // Fakta singkat: berlaku sampai, batas urus, paspor, pengurusan, dan laporan terakhir.
  function fakta(s) {
    const ul = el('ul', 'iqm-facts');
    if (s.iqamah.expiresOn) {
      ul.append(barisInfo('Berlaku sampai', tanggal(s.iqamah.expiresOn)));
      ul.append(barisInfo('Mulai urus paling lambat', tanggal(s.iqamah.batasUrus)));
    }
    if (s.paspor) {
      ul.append(barisInfo('Paspor berlaku sampai', tanggal(s.paspor.expiresOn), s.paspor.cukup ? '' : 'is-warn'));
    }
    if (s.pengurusan) {
      ul.append(barisInfo('Perpanjangan', `Sedang diurus sejak ${tanggal(s.pengurusan.startedOn)}${s.pengurusan.note ? ` · ${s.pengurusan.note}` : ''}`, 'is-progress'));
    }
    return ul;
  }

  function catatanPaspor(s, aturan) {
    if (!s.paspor || s.paspor.cukup) return null;
    const bulan = Math.round(aturan.pasporMinimalHari / 30);
    return el('p', 'iqm-alert', s.paspor.sisaHari < 0
      ? 'Paspor sudah habis. Perpanjang paspor di KBRI Kairo dulu sebelum mengurus iqamah.'
      : `Paspor tinggal ${s.paspor.sisaHari} hari. Untuk perpanjangan iqamah, paspor harus berlaku minimal ${bulan} bulan. Perpanjang paspor di KBRI Kairo dulu.`);
  }

  function catatanLaporan(laporan) {
    if (!laporan) return null;
    if (laporan.status === 'menunggu') {
      return el('p', 'iqm-note is-wait', `Laporan tanggal baru ${tanggal(laporan.expiresOn)} menunggu dicek musyrif.`);
    }
    if (laporan.status === 'ditolak') {
      return el('p', 'iqm-note is-rejected', `Laporan ${tanggal(laporan.expiresOn)} ditolak${laporan.decisionNote ? `: ${laporan.decisionNote}` : '.'} Kirim ulang tanggal yang benar.`);
    }
    return null;
  }

  async function kirim(url, method, headers, body) {
    const response = await fetch(url, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const hasil = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(hasil.error || 'Permintaan belum dapat diproses.');
    return hasil;
  }

  // Kartu untuk beranda. data: jawaban /api/iqamah-saya. santri: tampilkan laporan dan
  // penanda pengurusan; tanpa itu (wali) hanya melihat. muatUlang(pesan) menggambar ulang.
  function kartu(data, { studentId, headers, santri = false, muatUlang, pesan = '' }) {
    if (!data || !Array.isArray(data.students)) return null;
    const s = data.students.find((x) => String(x.id) === String(studentId));
    if (!s) return null;
    const aturan = data.aturan;
    const wadah = el('section', `crm-white-card santri-card iqm-card is-${s.iqamah.tahap}`);
    const kepala = el('div', 'santri-card__head');
    kepala.append(el('h3', 'santri-card__title', santri ? 'Iqamah' : 'Iqamah ananda'));
    kepala.append(el('p', 'santri-card__note', 'Izin tinggal di Mesir. Perpanjang sebelum habis supaya tidak kena denda.'));
    wadah.append(kepala);

    const inti = el('div', 'iqm-hero');
    const angka = el('div', 'iqm-hero__count');
    angka.append(el('strong', '', teksSisa(s.iqamah)), chip(s.iqamah.tahap));
    inti.append(angka, el('p', 'iqm-hero__hint', arahan(s, aturan, { santri })));
    wadah.append(inti, fakta(s));
    [catatanPaspor(s, aturan), catatanLaporan(s.laporan)].filter(Boolean).forEach((n) => wadah.append(n));

    if (!santri) return wadah;

    const status = el('p', 'form-status', pesan);
    status.setAttribute('role', 'status');
    const galat = (error) => {
      status.textContent = error.message;
      status.classList.add('is-error');
    };

    if (s.tersedia === false) {
      wadah.append(el('p', 'iqm-note', 'Laporan iqamah belum bisa dikirim dari sini. Sampaikan tanggal iqamah ke musyrif langsung.'));
      return wadah;
    }

    const aksi = el('div', 'iqm-actions');
    const buka = el('button', 'button button--primary', s.iqamah.expiresOn ? 'Lapor tanggal iqamah baru' : 'Lapor tanggal iqamah');
    buka.type = 'button';
    buka.setAttribute('aria-expanded', 'false');
    aksi.append(buka);

    // Penanda pengurusan hanya relevan menjelang habis atau saat sudah dipasang.
    if (s.pengurusan || ['siapkan', 'urus', 'habis'].includes(s.iqamah.tahap)) {
      const tandai = el('button', 'button button--secondary', s.pengurusan ? 'Belum jadi mengurus' : 'Saya sedang mengurus');
      tandai.type = 'button';
      tandai.addEventListener('click', async () => {
        tandai.disabled = true;
        try {
          await kirim(`/api/students/${encodeURIComponent(studentId)}/iqamah/pengurusan`, 'PUT', headers, { aktif: !s.pengurusan });
          await muatUlang(s.pengurusan ? 'Penanda pengurusan dilepas.' : 'Tercatat sedang mengurus perpanjangan. Musyrif bisa melihatnya.');
        } catch (error) {
          galat(error);
          tandai.disabled = false;
        }
      });
      aksi.append(tandai);
    }

    const form = el('form', 'santri-leave-form iqm-form');
    form.noValidate = true;
    form.hidden = true;
    form.id = `form-iqamah-${studentId}`;
    buka.setAttribute('aria-controls', form.id);
    const bidang = (label, kontrol) => {
      const w = el('label', 'santri-leave-form__field');
      w.append(el('span', '', label), kontrol);
      return w;
    };
    const tgl = el('input');
    tgl.type = 'date';
    tgl.required = true;
    const catatan = el('input');
    catatan.type = 'text';
    catatan.maxLength = 300;
    catatan.placeholder = 'Contoh: sudah diperpanjang satu tahun di Abbasiyah';
    const kirimTombol = el('button', 'button button--primary', 'Kirim ke musyrif');
    kirimTombol.type = 'submit';
    const batal = el('button', 'button button--secondary', 'Batal');
    batal.type = 'button';
    const tombol = el('div', 'santri-leave-form__actions');
    tombol.append(kirimTombol, batal);
    form.append(bidang('Tanggal habis di kartu iqamah', tgl), bidang('Catatan (opsional)', catatan), tombol);
    const lipat = (terbuka) => {
      form.hidden = !terbuka;
      aksi.hidden = terbuka;
      buka.setAttribute('aria-expanded', String(terbuka));
      if (terbuka) tgl.focus();
    };
    buka.addEventListener('click', () => lipat(true));
    batal.addEventListener('click', () => { status.textContent = ''; lipat(false); buka.focus(); });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      status.classList.remove('is-error');
      if (!tgl.value) {
        status.textContent = 'Isi tanggal habis sesuai yang tertulis di kartu iqamah.';
        status.classList.add('is-error');
        tgl.focus();
        return;
      }
      kirimTombol.disabled = true;
      try {
        await kirim(`/api/students/${encodeURIComponent(studentId)}/iqamah/laporan`, 'POST', headers, { expiresOn: tgl.value, note: catatan.value });
        await muatUlang('Laporan terkirim. Tanggal dipakai setelah dicek musyrif.');
      } catch (error) {
        galat(error);
        kirimTombol.disabled = false;
      }
    });
    wadah.append(aksi, form, status);
    return wadah;
  }

  // Ubin ringkas untuk kartu "Hari ini" di beranda santri.
  function ubin(data, studentId) {
    const s = data && Array.isArray(data.students) ? data.students.find((x) => String(x.id) === String(studentId)) : null;
    if (!s) return null;
    const nada = (TAHAP[s.iqamah.tahap] || TAHAP.kosong).nada;
    const kotak = el('a', `snt-tile iqm-tile is-${nada}`);
    kotak.href = '#kartu-iqamah';
    kotak.append(el('span', 'snt-tile__label', 'Iqamah'), el('strong', 'snt-tile__value', teksSisa(s.iqamah)));
    kotak.append(el('span', 'snt-tile__note', s.iqamah.expiresOn
      ? (s.pengurusan ? 'Sedang diurus' : `Urus paling lambat ${tanggal(s.iqamah.batasUrus)}`)
      : 'Laporkan tanggal iqamah-mu'));
    return kotak;
  }

  window.HamasahIqamah = Object.freeze({ TAHAP, arahan, chip, fakta, kartu, kirim, tanggal, teksSisa, ubin, catatanPaspor });
})();
