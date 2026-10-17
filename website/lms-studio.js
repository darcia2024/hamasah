// Studio maddah untuk guru dan admin (17 Oktober 2026).
//   - Beranda studio: kartu maddah (materi, santri, tugas menunggu dinilai) dan panduan
//     untuk guru yang belum punya maddah.
//   - Ruang kerja satu maddah: tab Kurikulum (susun, ubah, urutkan, arsipkan materi),
//     Penilaian (kiriman tugas), dan Santri (progres dan pendaftaran).
//   - Penyusun materi per jenis: teks, video YouTube, PDF (unggah), kuis (pilihan ganda
//     atau isian), dan tugas.
// Endpoint yang dipakai sama dengan konsol lama (/api/courses, /api/lms/*). Semua teks
// dipasang lewat textContent.
(function initLmsStudio() {
  const JENIS = [
    ['text', 'Bacaan', 'Teks materi, ringkasan bab, atau rujukan kitab.'],
    ['video', 'Video', 'Tautan YouTube; diputar langsung di portal.'],
    ['pdf', 'PDF', 'Unggah berkas PDF; santri membacanya di portal.'],
    ['quiz', 'Kuis', 'Pilihan ganda atau isian, dinilai otomatis.'],
    ['assignment', 'Tugas', 'Santri mengirim jawaban, Anda menilai.']
  ];
  const LABEL_JENIS = Object.fromEntries(JENIS.map(([k, l]) => [k, l]));
  const POLA_YOUTUBE = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#\s]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i;
  const TANGGAL = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  let nomor = 0;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }
  function tombol(teks, kelas = 'button button--secondary', label) {
    const b = el('button', kelas, teks);
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    return b;
  }
  function idBaru(a) { nomor += 1; return `${a}-${nomor}`; }

  function bidang(label, jenis = 'text', { nilai = '', placeholder = '', petunjuk = '' } = {}) {
    const wadah = el('div', 'mus-field');
    const id = idBaru('lms');
    const lbl = el('label', 'mus-label', label);
    lbl.htmlFor = id;
    const input = jenis === 'textarea' ? el('textarea', 'mus-input mus-input--area') : el('input', 'mus-input');
    if (jenis !== 'textarea') input.type = jenis;
    input.id = id;
    input.value = nilai;
    input.placeholder = placeholder;
    wadah.append(lbl, input);
    if (petunjuk) wadah.append(el('p', 'lms-hint', petunjuk));
    return { el: wadah, input, nilai: () => input.value.trim(), setel: (v) => { input.value = v; } };
  }

  function status() {
    const p = el('p', 'mus-status');
    p.setAttribute('role', 'status');
    return {
      el: p,
      ok(t) { p.textContent = t; p.className = 'mus-status is-ok'; },
      galat(t) { p.textContent = t; p.className = 'mus-status is-galat'; },
      kosong() { p.textContent = ''; p.className = 'mus-status'; }
    };
  }

  function buat({ wadah, headers, role }) {
    let maddah = [];
    let ringkasan = new Map();
    let aktifId = null;
    let tabAktif = 'kurikulum';
    let listing = new Map();
    let kabar = '';

    async function api(method, url, body) {
      const response = await fetch(url, {
        method,
        headers: { ...headers(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const hasil = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(hasil.error || 'Permintaan belum berhasil.');
      return hasil;
    }

    async function muat() {
      const [kursus, ring] = await Promise.all([
        api('GET', '/api/courses'),
        api('GET', '/api/lms/ringkasan-guru').catch(() => ({ courses: [] }))
      ]);
      maddah = kursus.items || [];
      ringkasan = new Map((ring.courses || []).map((c) => [c.id, c]));
      if (role === 'admin') {
        const daftar = await api('GET', '/api/admin/kelas').catch(() => ({ items: [] }));
        listing = new Map((daftar.items || []).map((l) => [l.courseId, l]));
      }
    }

    async function segarkan(pesan) {
      if (pesan) kabar = pesan;
      await muat();
      lukis();
    }

    // ------------------------------------------------------------ Dialog maddah
    async function dialogMaddah(course = null) {
      const bidangDialog = [
        { nama: 'title', label: 'Judul maddah', nilai: course ? course.title : '', wajib: true },
        { nama: 'description', label: 'Deskripsi singkat', jenis: 'textarea', nilai: course ? course.description : '', wajib: true }
      ];
      if (role === 'admin') {
        const akun = await api('GET', '/api/accounts').then((r) => r.items || []).catch(() => []);
        const guru = akun.filter((a) => a.role === 'teacher' && a.active);
        bidangDialog.push({ nama: 'ownerAccountId', label: 'Guru pengampu', jenis: 'select', nilai: course ? course.ownerAccountId || '' : '', pilihan: [['', 'Belum ditentukan'], ...guru.map((g) => [g.id, g.name])] });
      }
      const hasil = await window.HamasahDialog.formulir({
        judul: course ? 'Ubah maddah' : 'Maddah baru',
        keterangan: course ? '' : 'Setelah dibuat, tambahkan materi lalu daftarkan santri.',
        bidang: bidangDialog,
        labelSimpan: course ? 'Simpan' : 'Buat maddah',
        kirim: async (n) => {
          const body = { title: n.title, description: n.description };
          if (role === 'admin') body.ownerAccountId = n.ownerAccountId || null;
          return course ? api('PATCH', `/api/courses/${course.id}`, body) : api('POST', '/api/courses', body);
        }
      });
      if (!hasil) return;
      if (!course && hasil.course) aktifId = hasil.course.id;
      await segarkan(course ? 'Maddah diperbarui.' : 'Maddah dibuat. Tambahkan materi pertamanya.');
    }

    async function dialogJual(course) {
      const ada = listing.get(course.id);
      const hasil = await window.HamasahDialog.formulir({
        judul: `Penjualan: ${course.title}`,
        keterangan: 'Atur harga maddah ini di toko kelas daring Hamasah Courses.',
        bidang: [
          { nama: 'price', label: 'Harga (Rp)', jenis: 'number', min: 1, nilai: ada ? ada.price : '', wajib: true },
          { nama: 'published', label: 'Tampilkan di toko', jenis: 'select', nilai: ada && ada.published ? 'ya' : 'tidak', pilihan: [['tidak', 'Belum ditampilkan'], ['ya', 'Tampilkan']] }
        ],
        kirim: (n) => api('PUT', `/api/admin/kelas/${course.id}`, { price: Number(String(n.price).replace(/\D/g, '')), published: n.published === 'ya' })
      });
      if (hasil) await segarkan('Pengaturan penjualan tersimpan.');
    }

    // ------------------------------------------------------------ Beranda studio
    function lukisBeranda() {
      const isi = [];
      const kepala = el('header', 'lms-head');
      const teks = el('div');
      teks.append(
        el('p', 'wali-eyebrow', role === 'admin' ? 'Studio maddah · semua guru' : 'Studio maddah'),
        el('h2', 'lms-head__title', role === 'admin' ? 'Semua maddah' : 'Maddah yang Anda ampu'),
        el('p', 'mus-note', 'Susun materi, nilai tugas, dan pantau santri dari satu tempat.')
      );
      const baru = tombol('+ Maddah baru', 'button button--primary');
      baru.addEventListener('click', () => dialogMaddah());
      kepala.append(teks, baru);
      isi.push(kepala);
      if (kabar) { isi.push(el('p', 'mus-status is-ok asr-flash', kabar)); kabar = ''; }

      if (!maddah.length) {
        const kosong = el('section', 'lms-empty');
        kosong.append(el('h3', 'mus-title', 'Mulai dengan maddah pertama'), el('p', 'mus-note', 'Tiga langkah untuk membuka kelas Anda:'));
        const langkah = el('ol', 'lms-steps');
        [['Buat maddah', 'Judul dan deskripsi singkat, misal Nahwu Al-Ajurrumiyyah.'], ['Tambah materi', 'Bacaan, video YouTube, PDF, kuis, atau tugas.'], ['Daftarkan santri', 'Pilih santri yang mengikuti maddah ini.']].forEach(([j, k], i) => {
          const li = el('li', 'lms-step');
          li.append(el('span', 'lms-step__num', String(i + 1)), el('strong', '', j), el('span', 'mus-note', k));
          langkah.append(li);
        });
        const mulai = tombol('Buat maddah pertama', 'button button--primary');
        mulai.addEventListener('click', () => dialogMaddah());
        kosong.append(langkah, mulai);
        isi.push(kosong);
        wadah.replaceChildren(...isi);
        return;
      }

      const grid = el('div', 'lms-grid');
      maddah.forEach((c) => {
        const r = ringkasan.get(c.id) || {};
        const aktif = (c.materials || []).filter((m) => !m.archivedAt);
        const kartu = tombol('', 'lms-card', `Buka maddah ${c.title}`);
        const atas = el('span', 'lms-card__top');
        atas.append(el('span', 'lms-card__badge', `${aktif.length} materi`));
        if (r.pending) atas.append(el('span', 'lms-card__alert', `${r.pending} tugas menunggu`));
        if (role === 'admin' && listing.get(c.id) && listing.get(c.id).published) atas.append(el('span', 'lms-card__badge is-shop', 'Dijual'));
        const jenis = el('span', 'lms-card__types');
        [...new Set(aktif.map((m) => m.type))].forEach((t) => jenis.append(el('span', `lms-type is-${t}`, LABEL_JENIS[t] || t)));
        const bawah = el('span', 'lms-card__foot');
        bawah.append(el('span', '', `${r.students || 0} santri`), el('span', 'lms-card__go', 'Buka →'));
        kartu.append(atas, el('span', 'lms-card__title', c.title), el('span', 'lms-card__desc', c.description || ''), jenis, bawah);
        kartu.addEventListener('click', () => { aktifId = c.id; tabAktif = 'kurikulum'; lukis(); window.scrollTo({ top: 0 }); });
        grid.append(kartu);
      });
      isi.push(grid);
      wadah.replaceChildren(...isi);
    }

    // ------------------------------------------------------------ Penyusun materi
    function formMateri(course, materi, { onSelesai }) {
      const jenisAwal = materi ? materi.type : 'text';
      const panel = el('section', 'lms-composer');
      const kepala = el('header', 'lms-composer__head');
      kepala.append(el('h3', 'mus-title', materi ? `Ubah materi: ${materi.title}` : 'Materi baru'));
      const tutup = tombol('Tutup', 'mus-link');
      tutup.addEventListener('click', onSelesai);
      kepala.append(tutup);
      panel.append(kepala);

      let jenis = jenisAwal;
      const pilihJenis = el('div', 'lms-typepick');
      pilihJenis.setAttribute('role', 'radiogroup');
      pilihJenis.setAttribute('aria-label', 'Jenis materi');
      const tombolJenis = JENIS.map(([k, l, ket]) => {
        const b = tombol('', `lms-typepick__opt is-${k} ${k === jenis ? 'is-active' : ''}`.trim());
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(k === jenis));
        b.disabled = Boolean(materi) && k !== jenisAwal;
        b.append(el('strong', '', l), el('span', '', ket));
        b.addEventListener('click', () => { jenis = k; tombolJenis.forEach((t) => { const aktif = t === b; t.classList.toggle('is-active', aktif); t.setAttribute('aria-checked', String(aktif)); }); lukisIsi(); });
        pilihJenis.append(b);
        return b;
      });
      if (!materi) panel.append(pilihJenis);

      const judul = bidang('Judul materi', 'text', { nilai: materi ? materi.title : '', placeholder: 'Bab I: Kalam dan pembagian isim' });
      const ringkas = bidang('Ringkasan untuk santri', 'textarea', { nilai: materi ? materi.summary : '', placeholder: 'Satu dua kalimat inti bahasan (minimal 8 huruf).' });
      ringkas.input.rows = 2;
      const isiWadah = el('div', 'lms-composer__body');
      const tambahan = el('details', 'lms-extra');
      tambahan.append(el('summary', '', 'Tambahan (opsional): poin penting dan tanya jawab panduan'));
      const poin = bidang('Poin penting (pisahkan dengan koma)', 'text', { nilai: materi ? (materi.keyPoints || []).join(', ') : '', placeholder: 'Kalam lafadz murokkab, 3 tanda isim' });
      const panduan = (materi && materi.studyGuide && materi.studyGuide[0]) || {};
      const tanya = bidang('Pertanyaan panduan', 'text', { nilai: panduan.question || '' });
      const jawab = bidang('Jawaban panduan', 'textarea', { nilai: panduan.answer || '' });
      jawab.input.rows = 2;
      tambahan.append(poin.el, tanya.el, jawab.el);
      if (materi && ((materi.keyPoints || []).length || panduan.question)) tambahan.open = true;

      // Isi sesuai jenis.
      let ambilIsi = () => '';
      let isiLama = {};
      if (materi && materi.content && String(materi.content).trim().startsWith('{')) {
        try { isiLama = JSON.parse(materi.content); } catch { isiLama = {}; }
      }
      const teksLama = materi && !String(materi.content || '').trim().startsWith('{') ? materi.content : '';

      function lukisIsi() {
        isiWadah.replaceChildren();
        if (jenis === 'text' || jenis === 'assignment') {
          const f = bidang(jenis === 'assignment' ? 'Instruksi tugas' : 'Isi bacaan', 'textarea', {
            nilai: teksLama || isiLama.teks || '',
            placeholder: jenis === 'assignment' ? 'Apa yang harus dikerjakan dan dikirim santri.' : 'Tulis materi, ringkasan bab, atau rujukan kitab.'
          });
          f.input.rows = 8;
          isiWadah.append(f.el);
          ambilIsi = () => f.nilai();
        } else if (jenis === 'video') {
          const url = bidang('Tautan YouTube', 'url', { nilai: isiLama.url || ((teksLama.match(/https?:\/\/\S+/) || [])[0] || ''), placeholder: 'https://www.youtube.com/watch?v=...' });
          const catatan = bidang('Catatan untuk santri (opsional)', 'textarea', { nilai: isiLama.teks || (isiLama.url ? '' : teksLama.replace(/https?:\/\/\S+/, '').trim()) });
          catatan.input.rows = 3;
          const pratinjau = el('div', 'lms-video lms-video--preview');
          const segarPratinjau = () => {
            const m = url.nilai().match(POLA_YOUTUBE);
            pratinjau.replaceChildren();
            if (m) {
              const f = el('iframe');
              f.src = `https://www.youtube-nocookie.com/embed/${m[1]}`;
              f.title = 'Pratinjau video';
              f.loading = 'lazy';
              f.allow = 'encrypted-media; picture-in-picture; fullscreen';
              f.referrerPolicy = 'strict-origin-when-cross-origin';
              pratinjau.append(f);
            } else if (url.nilai()) {
              pratinjau.append(el('p', 'lms-hint', 'Bukan tautan YouTube. Video akan dibuka di tab baru oleh santri.'));
            }
          };
          url.input.addEventListener('change', segarPratinjau);
          segarPratinjau();
          isiWadah.append(url.el, pratinjau, catatan.el);
          ambilIsi = () => (url.nilai() ? JSON.stringify({ url: url.nilai(), teks: catatan.nilai() }) : '');
        } else if (jenis === 'pdf') {
          let berkas = isiLama.fileId ? { fileId: isiLama.fileId, fileName: isiLama.fileName || 'materi.pdf' } : null;
          const info = el('p', 'lms-file');
          const segarInfo = () => { info.textContent = berkas ? `Berkas: ${berkas.fileName}` : 'Belum ada berkas PDF.'; info.classList.toggle('has-file', Boolean(berkas)); };
          segarInfo();
          const pilih = el('input');
          pilih.type = 'file';
          pilih.accept = 'application/pdf';
          pilih.id = idBaru('pdf');
          const lbl = el('label', 'button button--secondary lms-upload', berkas ? 'Ganti PDF' : 'Pilih PDF');
          lbl.htmlFor = pilih.id;
          pilih.className = 'mus-visually-hidden';
          const st = status();
          pilih.addEventListener('change', async () => {
            const file = pilih.files && pilih.files[0];
            if (!file) return;
            if (file.type !== 'application/pdf') { st.galat('Hanya berkas PDF.'); return; }
            st.ok('Mengunggah PDF...');
            try {
              berkas = { fileId: await unggahPdf(course.id, file), fileName: file.name };
              segarInfo();
              lbl.textContent = 'Ganti PDF';
              st.ok('PDF terunggah.');
            } catch (error) { st.galat(error.message); } finally { pilih.value = ''; }
          });
          const catatan = bidang('Catatan untuk santri (opsional)', 'textarea', { nilai: isiLama.teks || teksLama });
          catatan.input.rows = 3;
          const baris = el('div', 'mus-form__row');
          baris.append(lbl, pilih);
          isiWadah.append(info, baris, st.el, catatan.el);
          ambilIsi = () => (berkas ? JSON.stringify({ fileId: berkas.fileId, fileName: berkas.fileName, teks: catatan.nilai() }) : '');
        } else if (jenis === 'quiz') {
          const daftar = el('ol', 'lms-quiz-builder2');
          const soalLama = Array.isArray(isiLama.questions) ? isiLama.questions : [];
          const tambahSoal = (q = {}) => {
            const li = el('li', 'lms-q');
            const pertanyaan = bidang('Pertanyaan', 'text', { nilai: q.prompt || '' });
            const modeNama = idBaru('mode');
            const mode = el('div', 'mus-seg mus-seg--kecil');
            const baris = el('div', 'mus-seg__row');
            const pilihanMode = [['pg', 'Pilihan ganda'], ['isian', 'Isian']].map(([v, l]) => {
              const r = el('input');
              r.type = 'radio'; r.name = modeNama; r.value = v; r.id = idBaru('m');
              r.checked = v === (q.prompt && !q.options ? 'isian' : 'pg');
              const lb = el('label', 'mus-seg__opt', l);
              lb.htmlFor = r.id;
              baris.append(r, lb);
              return r;
            });
            mode.append(baris);
            const opsiWadah = el('div', 'lms-q__options');
            const benarNama = idBaru('benar');
            const opsi = [];
            const tambahOpsi = (teks = '', benar = false) => {
              if (opsi.length >= 6) return;
              const b = el('div', 'lms-q__option');
              const r = el('input');
              r.type = 'radio'; r.name = benarNama; r.checked = benar;
              r.setAttribute('aria-label', 'Tandai sebagai jawaban benar');
              const i = el('input', 'mus-input');
              i.type = 'text'; i.value = teks; i.placeholder = `Pilihan ${opsi.length + 1}`;
              const h = tombol('×', 'lms-q__del', 'Hapus pilihan');
              h.addEventListener('click', () => { if (opsi.length <= 2) return; b.remove(); opsi.splice(opsi.indexOf(item), 1); });
              const item = { r, i };
              b.append(r, i, h);
              opsiWadah.append(b);
              opsi.push(item);
            };
            (q.options && q.options.length ? q.options : ['', '', '']).forEach((t) => tambahOpsi(t, q.options ? t === q.answer : false));
            const tambahOpsiBtn = tombol('+ Pilihan', 'mus-link');
            tambahOpsiBtn.addEventListener('click', () => tambahOpsi());
            const isian = bidang('Jawaban benar (dicocokkan persis)', 'text', { nilai: q.options ? '' : (q.answer || '') });
            const segarMode = () => {
              const pg = pilihanMode[0].checked;
              opsiWadah.hidden = !pg; tambahOpsiBtn.hidden = !pg; isian.el.hidden = pg;
            };
            pilihanMode.forEach((r) => r.addEventListener('change', segarMode));
            segarMode();
            const hapus = tombol('Hapus soal', 'mus-link asr-danger');
            hapus.addEventListener('click', () => li.remove());
            li.append(pertanyaan.el, mode, opsiWadah, tambahOpsiBtn, isian.el, hapus);
            li.__ambil = () => {
              const prompt = pertanyaan.nilai();
              if (!prompt) return null;
              if (pilihanMode[0].checked) {
                const options = opsi.map((o) => o.i.value.trim()).filter(Boolean);
                const benar = opsi.find((o) => o.r.checked);
                return { prompt, options, answer: benar ? benar.i.value.trim() : '' };
              }
              return { prompt, answer: isian.nilai() };
            };
            daftar.append(li);
          };
          (soalLama.length ? soalLama : [{}]).forEach(tambahSoal);
          const tambah = tombol('+ Tambah soal');
          tambah.addEventListener('click', () => tambahSoal());
          isiWadah.append(el('p', 'lms-hint', 'Tandai bulatan di samping pilihan yang benar. Lulus bila nilai minimal 70; santri punya tiga percobaan.'), daftar, tambah);
          ambilIsi = () => {
            const questions = [...daftar.children].map((li) => li.__ambil()).filter(Boolean);
            return questions.length ? JSON.stringify({ questions }) : '';
          };
        }
      }
      lukisIsi();

      const st = status();
      const simpan = tombol(materi ? 'Simpan perubahan' : 'Tambah ke kurikulum', 'button button--primary');
      simpan.addEventListener('click', async () => {
        st.kosong();
        const content = ambilIsi();
        if (!content) { st.galat(jenis === 'pdf' ? 'Unggah PDF-nya dulu.' : jenis === 'video' ? 'Isi tautan videonya.' : jenis === 'quiz' ? 'Tambahkan minimal satu soal.' : 'Isi materinya dulu.'); return; }
        const body = {
          type: jenis, title: judul.nilai(), summary: ringkas.nilai(), content,
          keyPoints: poin.nilai().split(',').map((x) => x.trim()).filter(Boolean),
          studyGuide: tanya.nilai() && jawab.nilai() ? [{ question: tanya.nilai(), answer: jawab.nilai() }] : []
        };
        if (body.title.length < 3) { st.galat('Judul materi minimal 3 huruf.'); return; }
        if (body.summary.length < 8) { st.galat('Ringkasan minimal 8 huruf.'); return; }
        simpan.disabled = true;
        try {
          if (materi) await api('PATCH', `/api/courses/${course.id}/materials/${materi.id}`, body);
          else await api('POST', `/api/courses/${course.id}/materials`, body);
          await segarkan(materi ? 'Materi diperbarui.' : 'Materi ditambahkan ke kurikulum.');
        } catch (error) { st.galat(error.message); simpan.disabled = false; }
      });
      const aksi = el('div', 'mus-actions');
      const batal = tombol('Batal');
      batal.addEventListener('click', onSelesai);
      aksi.append(simpan, batal);
      panel.append(judul.el, isiWadah, ringkas.el, tambahan, aksi, st.el);
      return panel;
    }

    async function unggahPdf(courseId, file) {
      const minta = await api('POST', '/api/uploads', { purpose: 'course-file', entityId: courseId, fileName: file.name, contentType: 'application/pdf', size: file.size });
      const id = encodeURIComponent(minta.upload.id);
      if (minta.directUpload) {
        const tautan = await api('POST', `/api/uploads/${id}/direct`);
        const kirim = await fetch(tautan.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: file });
        if (!kirim.ok) throw new Error('PDF gagal dikirim ke penyimpanan.');
        await api('POST', `/api/uploads/${id}/confirm`);
      } else {
        const response = await fetch(`/api/uploads/${id}/content`, { method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/pdf' }, body: file });
        const hasil = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(hasil.error || 'PDF gagal diunggah.');
      }
      return minta.upload.id;
    }

    // ------------------------------------------------------------ Tab Kurikulum
    function tabKurikulum(course) {
      const wadahTab = el('div', 'lms-tab');
      const aktif = (course.materials || []).filter((m) => !m.archivedAt);
      const atas = el('div', 'lms-tab__head');
      atas.append(el('p', 'mus-note', aktif.length ? `${aktif.length} materi, berurutan seperti yang dilihat santri.` : 'Belum ada materi. Mulai dengan materi pertama.'));
      const tambah = tombol('+ Tambah materi', 'button button--primary');
      atas.append(tambah);
      const komposer = el('div');
      tambah.addEventListener('click', () => {
        komposer.replaceChildren(formMateri(course, null, { onSelesai: () => komposer.replaceChildren() }));
        komposer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      const daftar = el('ol', 'lms-curriculum');
      aktif.forEach((m, i) => {
        const li = el('li', 'lms-lesson');
        li.append(el('span', 'lms-lesson__num', String(i + 1)));
        const info = el('div', 'lms-lesson__info');
        const judulBaris = el('div', 'lms-lesson__title');
        judulBaris.append(el('span', `lms-type is-${m.type}`, LABEL_JENIS[m.type] || m.type), el('strong', '', m.title));
        info.append(judulBaris, el('p', 'lms-lesson__summary', m.summary || ''));
        const aksi = el('div', 'lms-lesson__actions');
        const naik = tombol('↑', 'lms-icon-btn', `Naikkan ${m.title}`);
        const turun = tombol('↓', 'lms-icon-btn', `Turunkan ${m.title}`);
        naik.disabled = i === 0;
        turun.disabled = i === aktif.length - 1;
        const pindah = async (arah) => {
          const ids = aktif.map((x) => x.id);
          const j = i + arah;
          [ids[i], ids[j]] = [ids[j], ids[i]];
          try { await api('PUT', `/api/courses/${course.id}/materials/urutan`, { ids }); await segarkan(); } catch (error) { window.alert(error.message); }
        };
        naik.addEventListener('click', () => pindah(-1));
        turun.addEventListener('click', () => pindah(1));
        const ubah = tombol('Ubah', 'mus-link');
        ubah.addEventListener('click', () => {
          komposer.replaceChildren(formMateri(course, m, { onSelesai: () => komposer.replaceChildren() }));
          komposer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        const arsip = tombol('Arsipkan', 'mus-link asr-danger');
        arsip.addEventListener('click', async () => {
          if (!window.confirm(`Arsipkan "${m.title}"? Santri tidak melihatnya lagi; progres yang sudah ada tetap tersimpan.`)) return;
          try { await api('PATCH', `/api/courses/${course.id}/materials/${m.id}/archive`); await segarkan('Materi diarsipkan.'); } catch (error) { window.alert(error.message); }
        });
        aksi.append(naik, turun, ubah, arsip);
        li.append(info, aksi);
        daftar.append(li);
      });
      wadahTab.append(atas, komposer, daftar);
      return wadahTab;
    }

    // ------------------------------------------------------------ Tab Penilaian
    function tabPenilaian(course) {
      const wadahTab = el('div', 'lms-tab');
      let saring = 'submitted';
      const filter = el('div', 'mus-filter');
      const daftar = el('div', 'lms-reviews');
      daftar.append(el('p', 'mus-loading', 'Memuat kiriman...'));
      let semua = [];
      function gambar() {
        filter.replaceChildren();
        [['submitted', 'Menunggu dinilai'], ['reviewed', 'Sudah dinilai'], ['semua', 'Semua']].forEach(([k, l]) => {
          const n = k === 'semua' ? semua.length : semua.filter((s) => s.status === k).length;
          const b = tombol(`${l} (${n})`, `mus-filter__btn ${saring === k ? 'is-active' : ''}`.trim());
          b.addEventListener('click', () => { saring = k; gambar(); });
          filter.append(b);
        });
        const tampil = saring === 'semua' ? semua : semua.filter((s) => s.status === saring);
        daftar.replaceChildren();
        if (!tampil.length) daftar.append(el('p', 'lms-empty-line', saring === 'submitted' ? 'Tidak ada tugas yang menunggu dinilai.' : 'Belum ada kiriman.'));
        tampil.forEach((s) => {
          const kartu = el('article', `lms-review is-${s.status}`);
          const kepala = el('header', 'lms-review__head');
          kepala.append(el('strong', '', s.studentName), el('span', 'mus-note', `${s.materialTitle} · ${s.submittedAt ? TANGGAL.format(new Date(s.submittedAt)) : ''}`));
          kartu.append(kepala, el('p', 'lms-review__body', s.body));
          if (s.status === 'reviewed') {
            kartu.append(el('p', 'lms-review__score', `Nilai ${s.score}${s.reviewerNote ? ` · ${s.reviewerNote}` : ''}`));
          } else {
            const baris = el('div', 'mus-form__row');
            const nilai = bidang('Nilai (0–100)', 'number');
            nilai.input.min = '0'; nilai.input.max = '100';
            const catatan = bidang('Catatan untuk santri', 'text', { placeholder: 'Bagus, perhatikan i\'rab pada contoh kedua.' });
            catatan.el.classList.add('lms-grow');
            baris.append(nilai.el, catatan.el);
            const st = status();
            const simpan = tombol('Simpan nilai', 'button button--primary');
            simpan.addEventListener('click', async () => {
              const angka = String(nilai.nilai()).trim();
              if (!/^\d{1,3}$/.test(angka) || Number(angka) > 100) { st.galat('Isi nilai 0 sampai 100.'); nilai.input.focus(); return; }
              simpan.disabled = true;
              try {
                await api('PATCH', `/api/lms/submissions/${s.id}/review`, { score: Number(nilai.nilai()), note: catatan.nilai() });
                kabar = `Nilai untuk ${s.studentName} tersimpan.`;
                await muat();
                lukis();
              } catch (error) { st.galat(error.message); simpan.disabled = false; }
            });
            kartu.append(baris, simpan, st.el);
          }
          daftar.append(kartu);
        });
      }
      api('GET', `/api/courses/${course.id}/submissions`).then((r) => { semua = r.items || []; gambar(); }).catch((e) => { daftar.replaceChildren(el('p', 'mus-status is-galat', e.message)); });
      wadahTab.append(filter, daftar);
      return wadahTab;
    }

    // ------------------------------------------------------------ Tab Santri
    function tabSantri(course) {
      const wadahTab = el('div', 'lms-tab');
      const tabel = el('div', 'lms-people');
      tabel.append(el('p', 'mus-loading', 'Memuat progres santri...'));
      const daftarkan = el('section', 'lms-enroll2');
      daftarkan.append(el('h4', 'wali-subtitle', 'Daftarkan santri'));
      const cari = bidang('Cari santri', 'search', { placeholder: 'Ketik nama santri...' });
      const opsi = el('div', 'lms-pick');
      const st = status();
      const kirim = tombol('Daftarkan santri terpilih', 'button button--primary');
      kirim.disabled = true;
      daftarkan.append(cari.el, opsi, kirim, st.el);
      let terdaftar = new Set();
      let pilihan = [];
      function gambarOpsi() {
        const kata = cari.nilai().toLowerCase();
        opsi.replaceChildren();
        const sisa = pilihan.filter((s) => !terdaftar.has(String(s.id)) && (!kata || s.name.toLowerCase().includes(kata)));
        if (!sisa.length) opsi.append(el('p', 'lms-empty-line', 'Semua santri aktif sudah terdaftar, atau tidak ada yang cocok.'));
        sisa.slice(0, 40).forEach((s) => {
          const id = idBaru('ikut');
          const b = el('div', 'asr-pick__row');
          const c = el('input');
          c.type = 'checkbox'; c.id = id; c.value = s.id;
          c.addEventListener('change', () => { kirim.disabled = !opsi.querySelector('input:checked'); });
          const l = el('label', '', `${s.name}${s.program ? ` · ${s.program}` : ''}`);
          l.htmlFor = id;
          b.append(c, l);
          opsi.append(b);
        });
      }
      cari.input.addEventListener('input', gambarOpsi);
      kirim.addEventListener('click', async () => {
        const ids = [...opsi.querySelectorAll('input:checked')].map((c) => c.value);
        kirim.disabled = true;
        let berhasil = 0;
        for (const sid of ids) {
          try { await api('POST', `/api/students/${encodeURIComponent(sid)}/courses/${course.id}`); berhasil += 1; } catch (error) { st.galat(error.message); }
        }
        await segarkan(`${berhasil} santri didaftarkan.`);
      });
      Promise.all([
        api('GET', `/api/courses/${course.id}/progres`),
        api('GET', '/api/lms/pilihan-santri').catch(() => ({ items: [] }))
      ]).then(([prog, pil]) => {
        const items = prog.items || [];
        terdaftar = new Set(items.map((i) => String(i.studentId)));
        pilihan = pil.items || [];
        tabel.replaceChildren();
        if (!items.length) tabel.append(el('p', 'lms-empty-line', 'Belum ada santri terdaftar di maddah ini.'));
        items.forEach((i) => {
          const baris = el('div', 'lms-person');
          const nama = el('div', 'lms-person__id');
          nama.append(el('strong', '', i.studentName), el('span', 'mus-note', `${i.completed} dari ${i.total} materi selesai`));
          const bar = el('div', 'lms-bar');
          bar.setAttribute('role', 'progressbar');
          bar.setAttribute('aria-valuenow', String(i.progress));
          bar.setAttribute('aria-valuemin', '0');
          bar.setAttribute('aria-valuemax', '100');
          bar.setAttribute('aria-label', `Progres ${i.studentName}`);
          const isiBar = el('span');
          isiBar.style.width = `${i.progress}%`;
          bar.append(isiBar);
          const angka = el('div', 'lms-person__stats');
          angka.append(
            el('span', '', `${i.progress}%`),
            el('span', 'mus-note', i.bestQuizScore === null ? 'Kuis –' : `Kuis ${i.bestQuizScore}`),
            el('span', i.assignments.pending ? 'lms-person__pending' : 'mus-note', i.assignments.total ? `Tugas ${i.assignments.reviewed}/${i.assignments.total}${i.assignments.pending ? ` · ${i.assignments.pending} menunggu` : ''}` : 'Tanpa tugas')
          );
          baris.append(nama, bar, angka);
          tabel.append(baris);
        });
        gambarOpsi();
      }).catch((e) => tabel.replaceChildren(el('p', 'mus-status is-galat', e.message)));
      wadahTab.append(tabel, daftarkan);
      return wadahTab;
    }

    // ------------------------------------------------------------ Ruang kerja maddah
    function lukisMaddah(course) {
      const r = ringkasan.get(course.id) || {};
      const isi = [];
      const kembali = tombol('← Semua maddah', 'mus-back');
      kembali.addEventListener('click', () => { aktifId = null; lukis(); });
      isi.push(kembali);
      const kepala = el('header', 'lms-head');
      const teks = el('div');
      teks.append(el('p', 'wali-eyebrow', 'Maddah'), el('h2', 'lms-head__title', course.title), el('p', 'mus-note', course.description || ''));
      const aksi = el('div', 'mus-actions');
      const ubah = tombol('Ubah maddah');
      ubah.addEventListener('click', () => dialogMaddah(course));
      aksi.append(ubah);
      if (role === 'admin') {
        const jual = tombol('Atur penjualan');
        jual.addEventListener('click', () => dialogJual(course));
        aksi.append(jual);
      }
      kepala.append(teks, aksi);
      isi.push(kepala);
      if (kabar) { isi.push(el('p', 'mus-status is-ok asr-flash', kabar)); kabar = ''; }

      const tab = el('div', 'mus-tabs');
      tab.setAttribute('role', 'tablist');
      [['kurikulum', 'Kurikulum'], ['penilaian', `Penilaian${r.pending ? ` (${r.pending})` : ''}`], ['santri', `Santri (${r.students || 0})`]].forEach(([k, l]) => {
        const b = tombol(l, `mus-tab ${tabAktif === k ? 'is-active' : ''}`.trim());
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(tabAktif === k));
        b.addEventListener('click', () => { tabAktif = k; lukis(); });
        tab.append(b);
      });
      isi.push(tab);
      isi.push(tabAktif === 'penilaian' ? tabPenilaian(course) : tabAktif === 'santri' ? tabSantri(course) : tabKurikulum(course));
      wadah.replaceChildren(...isi);
    }

    function lukis() {
      const course = aktifId && maddah.find((c) => c.id === aktifId);
      if (course) lukisMaddah(course); else { aktifId = null; lukisBeranda(); }
    }

    return {
      async mulai() {
        wadah.replaceChildren(el('p', 'mus-loading', 'Memuat studio maddah...'));
        await muat();
        // Tautan dari beranda guru: #kelola=kiriman|progres&maddah=<id>.
        const params = new URLSearchParams(window.location.hash.slice(1));
        const dituju = params.get('maddah');
        if (dituju && maddah.some((c) => c.id === dituju)) {
          aktifId = dituju;
          tabAktif = params.get('kelola') === 'kiriman' ? 'penilaian' : params.get('kelola') === 'progres' ? 'santri' : 'kurikulum';
        }
        try { if (window.location.hash) history.replaceState(null, '', window.location.pathname); } catch { /* opsional */ }
        lukis();
      },
      segarkan: () => segarkan()
    };
  }

  window.HamasahLmsStudio = Object.freeze({ buat });
})();
