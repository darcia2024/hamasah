// Ruang belajar santri (17 Oktober 2026).
//   - Beranda: kartu "Lanjutkan belajar" dan kartu maddah dengan progres melingkar.
//   - Halaman maddah: materi aktif (video YouTube tersemat, PDF, bacaan, kuis pilihan
//     ganda/isian, tugas), asisten belajar AI (tombol cepat + percakapan), tombol sebelumnya/berikutnya, dan daftar
//     kurikulum dengan tanda selesai.
// Data: /api/my-students (santri sendiri) dan /api/students/:id/courses*. Semua teks
// dipasang lewat textContent; video lewat iframe youtube-nocookie (CSP frame-src).
(function initLmsBelajar() {
  const LABEL_JENIS = { text: 'Bacaan', video: 'Video', pdf: 'PDF', quiz: 'Kuis', assignment: 'Tugas' };
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

  function cincin(persen, ukuran = 64) {
    const r = 26;
    const k = 2 * Math.PI * r;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('width', String(ukuran));
    svg.setAttribute('height', String(ukuran));
    svg.setAttribute('class', 'lms-ring');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Progres ${persen}%`);
    const jalur = document.createElementNS(ns, 'circle');
    [['cx', 32], ['cy', 32], ['r', r], ['class', 'lms-ring__track']].forEach(([a, v]) => jalur.setAttribute(a, String(v)));
    const isi = document.createElementNS(ns, 'circle');
    [['cx', 32], ['cy', 32], ['r', r], ['class', 'lms-ring__fill'], ['stroke-dasharray', `${(persen / 100) * k} ${k}`], ['transform', 'rotate(-90 32 32)']].forEach(([a, v]) => isi.setAttribute(a, String(v)));
    const teks = document.createElementNS(ns, 'text');
    [['x', 32], ['y', 37], ['text-anchor', 'middle'], ['class', 'lms-ring__text']].forEach(([a, v]) => teks.setAttribute(a, String(v)));
    teks.textContent = `${persen}%`;
    svg.append(jalur, isi, teks);
    return svg;
  }

  function paragraf(teks) {
    const wadah = el('div', 'lms-prose');
    String(teks || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).forEach((p) => wadah.append(el('p', '', p)));
    return wadah;
  }

  function buat({ wadah, headers }) {
    let studentId = null;
    let maddah = [];
    let aktif = null;
    let materiId = null;
    // Mode pratinjau (admin dan guru dari studio): { onKembali }. Semua aksi yang mencatat
    // progres, nilai, kiriman, atau memanggil asisten AI dimatikan; tidak ada santri aktif.
    let pratinjau = null;
    const percakapan = new Map();

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

    async function muatDaftar() {
      const r = await api('GET', `/api/students/${encodeURIComponent(studentId)}/courses`);
      maddah = r.items || [];
    }

    function berikutnya(course) {
      const m = course.materials || [];
      return m.find((x) => !x.completed) || null;
    }

    // ------------------------------------------------------------ Beranda
    function lukisBeranda() {
      const isi = [];
      const kepala = el('header', 'lms-head');
      const teks = el('div');
      teks.append(el('p', 'wali-eyebrow', 'Ruang belajar'), el('h2', 'lms-head__title', 'Belajar hari ini'), el('p', 'mus-note', maddah.length ? `${maddah.length} maddah sedang kamu ikuti.` : 'Belum ada maddah. Maddah muncul di sini setelah guru mendaftarkanmu.'));
      kepala.append(teks);
      isi.push(kepala);

      const lanjut = maddah.map((c) => ({ c, m: berikutnya(c) })).find((x) => x.m);
      if (lanjut) {
        const kartu = tombol('', 'lms-continue', `Lanjutkan ${lanjut.m.title}`);
        const kiri = el('span', 'lms-continue__text');
        kiri.append(el('span', 'lms-continue__label', 'Lanjutkan belajar'), el('strong', 'lms-continue__title', lanjut.m.title), el('span', 'lms-continue__meta', `${lanjut.c.title} · ${LABEL_JENIS[lanjut.m.type] || lanjut.m.type}`));
        kartu.append(kiri, el('span', 'lms-continue__go', 'Mulai →'));
        kartu.addEventListener('click', () => buka(lanjut.c.id, lanjut.m.id));
        isi.push(kartu);
      }

      const grid = el('div', 'lms-grid');
      maddah.forEach((c) => {
        const m = c.materials || [];
        const selesai = m.filter((x) => x.completed).length;
        const kartu = tombol('', 'lms-card lms-card--learn', `Buka ${c.title}`);
        const atas = el('span', 'lms-card__top');
        atas.append(cincin(c.progress || 0, 56));
        const status = el('span', `lms-card__status ${c.completionStatus === 'completed' ? 'is-done' : ''}`.trim(), c.completionStatus === 'completed' ? 'Selesai' : `${selesai} dari ${m.length} materi`);
        atas.append(status);
        const bawah = el('span', 'lms-card__foot');
        const n = berikutnya(c);
        bawah.append(el('span', 'mus-note', n ? `Berikutnya: ${n.title}` : 'Semua materi selesai'), el('span', 'lms-card__go', 'Buka →'));
        kartu.append(atas, el('span', 'lms-card__title', c.title), el('span', 'lms-card__desc', c.description || ''), bawah);
        kartu.addEventListener('click', () => buka(c.id));
        grid.append(kartu);
      });
      isi.push(grid);
      wadah.replaceChildren(...isi);
    }

    async function buka(courseId, matId = null) {
      wadah.replaceChildren(el('p', 'mus-loading', 'Membuka maddah...'));
      const r = await api('GET', `/api/students/${encodeURIComponent(studentId)}/courses/${encodeURIComponent(courseId)}`);
      aktif = r.course || r;
      const m = aktif.materials || [];
      materiId = matId && m.some((x) => x.id === matId) ? matId : ((berikutnya(aktif) || m[0] || {}).id || null);
      lukisMaddah();
      window.scrollTo({ top: 0 });
    }

    function gantiCourse(course) {
      aktif = course;
      const idx = maddah.findIndex((c) => c.id === course.id);
      if (idx >= 0) maddah[idx] = { ...maddah[idx], progress: course.progress, completionStatus: course.completionStatus, materials: course.materials };
    }

    // ------------------------------------------------------------ Isi materi
    function isiVideo(m) {
      const wadahIsi = el('div', 'lms-content');
      const media = m.media || {};
      if (media.youtubeId) {
        const bingkai = el('div', 'lms-video');
        const f = el('iframe');
        f.src = `https://www.youtube-nocookie.com/embed/${media.youtubeId}?rel=0`;
        f.title = m.title;
        f.loading = 'lazy';
        f.allow = 'encrypted-media; picture-in-picture; fullscreen';
        f.allowFullscreen = true;
        f.referrerPolicy = 'strict-origin-when-cross-origin';
        bingkai.append(f);
        wadahIsi.append(bingkai);
      } else if (media.url) {
        const a = el('a', 'button button--primary', 'Tonton video ↗');
        a.href = media.url;
        a.target = '_blank';
        a.rel = 'noopener';
        wadahIsi.append(a);
      }
      if (m.content) wadahIsi.append(paragraf(m.content));
      return wadahIsi;
    }

    function isiPdf(m) {
      const wadahIsi = el('div', 'lms-content');
      const media = m.media || {};
      if (media.fileId) {
        const kartu = el('div', 'lms-pdf');
        kartu.append(el('span', 'lms-pdf__icon', 'PDF'));
        const info = el('div', 'lms-pdf__info');
        info.append(el('strong', '', media.fileName || 'Materi PDF'), el('span', 'mus-note', 'Buka di tab baru untuk membaca, atau unduh untuk disimpan.'));
        const st = el('p', 'mus-status');
        const ambilBlob = async () => {
          const response = await fetch(`/api/files/${encodeURIComponent(media.fileId)}`, { headers: headers() });
          if (!response.ok) throw new Error('PDF belum dapat dibuka.');
          return URL.createObjectURL(await response.blob());
        };
        const baca = tombol('Baca PDF', 'button button--primary');
        baca.addEventListener('click', async () => {
          const jendela = window.open('', '_blank');
          try { const url = await ambilBlob(); if (jendela) jendela.location.href = url; else window.location.href = url; } catch (error) { if (jendela) jendela.close(); st.textContent = error.message; st.className = 'mus-status is-galat'; }
        });
        const unduh = tombol('Unduh');
        unduh.addEventListener('click', async () => {
          try { const url = await ambilBlob(); const a = el('a'); a.href = url; a.download = media.fileName || 'materi.pdf'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); } catch (error) { st.textContent = error.message; st.className = 'mus-status is-galat'; }
        });
        const aksi = el('div', 'mus-actions');
        aksi.append(baca, unduh);
        info.append(aksi, st);
        kartu.append(info);
        wadahIsi.append(kartu);
      }
      if (m.content) wadahIsi.append(paragraf(m.content));
      return wadahIsi;
    }

    function isiKuis(m) {
      const wadahIsi = el('div', 'lms-content');
      const kuis = m.quiz || { questions: [], attemptLimit: 3, passingScore: 70 };
      const percobaan = m.attempts || [];
      const terbaik = percobaan.reduce((t, a) => Math.max(t, a.score), 0);
      const sisa = Math.max(0, kuis.attemptLimit - percobaan.length);
      const info = el('p', `lms-quiz-info ${m.completed ? 'is-pass' : ''}`.trim(), m.completed
        ? `Lulus dengan nilai terbaik ${terbaik}.`
        : percobaan.length ? `Nilai terbaik ${terbaik}. Sisa ${sisa} dari ${kuis.attemptLimit} percobaan; lulus mulai ${kuis.passingScore}.` : `${kuis.questions.length} soal. Lulus mulai nilai ${kuis.passingScore}; kamu punya ${kuis.attemptLimit} percobaan.`);
      wadahIsi.append(info);
      if (m.completed || !sisa) return wadahIsi;
      const form = el('form', 'lms-quiz');
      const kontrol = [];
      kuis.questions.forEach((q, i) => {
        const fs = el('fieldset', 'lms-quiz__q');
        fs.append(el('legend', '', `${i + 1}. ${q.prompt}`));
        if (Array.isArray(q.options) && q.options.length) {
          const nama = idBaru('soal');
          q.options.forEach((o) => {
            const id = idBaru('o');
            const baris = el('label', 'lms-quiz__opt');
            baris.htmlFor = id;
            const r = el('input');
            r.type = 'radio'; r.name = nama; r.value = o; r.id = id;
            baris.append(r, el('span', '', o));
            fs.append(baris);
          });
          kontrol.push(() => (fs.querySelector('input:checked') || {}).value || '');
        } else {
          const i2 = el('input', 'mus-input');
          i2.type = 'text';
          i2.setAttribute('aria-label', `Jawaban soal ${i + 1}`);
          fs.append(i2);
          kontrol.push(() => i2.value.trim());
        }
        form.append(fs);
      });
      const st = el('p', 'mus-status');
      const kirim = el('button', 'button button--primary', 'Kirim jawaban');
      kirim.type = 'submit';
      form.append(kirim, st);
      if (pratinjau) {
        form.querySelectorAll('input, button').forEach((k) => { k.disabled = true; });
        st.textContent = 'Pratinjau: soal ditampilkan seperti untuk santri, jawaban tidak bisa dikirim.';
        wadahIsi.append(form);
        return wadahIsi;
      }
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const answers = Object.fromEntries(kontrol.map((f, i) => [i, f()]));
        if (Object.values(answers).some((v) => !v)) { st.textContent = 'Jawab semua soal dulu.'; st.className = 'mus-status is-galat'; return; }
        kirim.disabled = true;
        try {
          const r = await api('POST', `/api/students/${encodeURIComponent(studentId)}/courses/${aktif.id}/materials/${m.id}/attempts`, { answers });
          gantiCourse(r.course);
          lukisMaddah(r.attempt.passed ? `Nilai ${r.attempt.score}. Alhamdulillah, lulus.` : `Nilai ${r.attempt.score}. Belum lulus; pelajari lagi lalu coba sekali lagi.`);
        } catch (error) { st.textContent = error.message; st.className = 'mus-status is-galat'; kirim.disabled = false; }
      });
      wadahIsi.append(form);
      return wadahIsi;
    }

    function isiTugas(m) {
      const wadahIsi = el('div', 'lms-content');
      wadahIsi.append(paragraf(m.content));
      const kiriman = m.submission;
      if (kiriman) {
        const kotak = el('div', `lms-submitted is-${kiriman.status}`);
        kotak.append(el('strong', '', kiriman.status === 'reviewed' ? `Sudah dinilai: ${kiriman.score}` : 'Terkirim, menunggu dinilai guru'));
        if (kiriman.reviewerNote) kotak.append(el('p', '', `Catatan guru: ${kiriman.reviewerNote}`));
        wadahIsi.append(kotak);
        return wadahIsi;
      }
      const id = idBaru('jawab');
      const lbl = el('label', 'mus-label', 'Jawabanmu');
      lbl.htmlFor = id;
      const area = el('textarea', 'mus-input mus-input--area');
      area.id = id;
      area.rows = 6;
      area.placeholder = 'Tulis jawaban tugas di sini.';
      const st = el('p', 'mus-status');
      const kirim = tombol('Kirim tugas', 'button button--primary');
      if (pratinjau) {
        area.disabled = true;
        kirim.disabled = true;
        st.textContent = 'Pratinjau: kolom jawaban seperti yang dilihat santri, tugas tidak bisa dikirim.';
        wadahIsi.append(lbl, area, kirim, st);
        return wadahIsi;
      }
      kirim.addEventListener('click', async () => {
        if (area.value.trim().length < 3) { st.textContent = 'Jawaban terlalu singkat.'; st.className = 'mus-status is-galat'; return; }
        kirim.disabled = true;
        try {
          await api('POST', `/api/students/${encodeURIComponent(studentId)}/courses/${aktif.id}/materials/${m.id}/submission`, { body: area.value.trim() });
          const r = await api('GET', `/api/students/${encodeURIComponent(studentId)}/courses/${aktif.id}`);
          gantiCourse(r.course || r);
          lukisMaddah('Tugas terkirim. Guru akan menilainya.');
        } catch (error) { st.textContent = error.message; st.className = 'mus-status is-galat'; kirim.disabled = false; }
      });
      wadahIsi.append(lbl, area, kirim, st);
      return wadahIsi;
    }

    // Asisten belajar: tombol cepat + percakapan per materi. Riwayat disimpan di memori
    // halaman (percakapan) supaya tidak hilang saat santri berpindah materi lalu kembali.
    const TOMBOL_CEPAT = [
      ['sederhana', 'Jelaskan lebih sederhana'],
      ['contoh', 'Beri contoh'],
      ['ringkas', 'Ringkas poin penting'],
      ['latihan', 'Buat latihan soal']
    ];

    // Teks jawaban menjadi paragraf dan daftar (baris "- " atau "1. "), tanpa innerHTML.
    function teksKaya(teks) {
      const wadahTeks = el('div', 'lms-tutor__text');
      String(teks || '').split(/\n{2,}/).forEach((blok) => {
        const baris = blok.split('\n').map((b) => b.trim()).filter(Boolean);
        if (!baris.length) return;
        const butir = baris.filter((b) => /^(-|•|\d+[.)])\s+/.test(b));
        if (butir.length && butir.length === baris.length) {
          const daftarEl = el(/^\d/.test(baris[0]) ? 'ol' : 'ul');
          baris.forEach((b) => daftarEl.append(el('li', '', b.replace(/^(-|•|\d+[.)])\s+/, ''))));
          wadahTeks.append(daftarEl);
        } else if (butir.length && !/^(-|•|\d+[.)])\s+/.test(baris[0])) {
          wadahTeks.append(el('p', '', baris[0]));
          const daftarEl = el(/^\d/.test(baris[1] || '') ? 'ol' : 'ul');
          baris.slice(1).forEach((b) => daftarEl.append(el('li', '', b.replace(/^(-|•|\d+[.)])\s+/, ''))));
          wadahTeks.append(daftarEl);
        } else {
          wadahTeks.append(el('p', '', baris.join(' ')));
        }
      });
      return wadahTeks;
    }

    function asistenBelajar(m) {
      const kotak = el('section', 'lms-tutor');
      kotak.setAttribute('aria-label', 'Asisten belajar');
      const kepala = el('header', 'lms-tutor__head');
      const lencana = el('span', 'lms-tutor__badge', '✦');
      lencana.setAttribute('aria-hidden', 'true');
      const judul = el('div');
      judul.append(el('h4', 'lms-tutor__title', 'Asisten belajar'), el('p', 'lms-tutor__note', `Bantu kamu memahami "${m.title}". Jawaban AI bisa keliru, jadi pastikan hal penting ke ustadz pengampu.`));
      kepala.append(lencana, judul);
      kotak.append(kepala);

      if (m.type === 'quiz' && !m.completed) {
        kotak.classList.add('is-locked');
        kotak.append(el('p', 'lms-tutor__locked', 'Asisten dibuka lagi setelah kuis ini selesai, supaya nilaimu benar-benar hasil pemahamanmu. Kalau ada yang belum jelas, buka lagi materi sebelumnya.'));
        return kotak;
      }

      const riwayat = percakapan.get(m.id) || [];
      percakapan.set(m.id, riwayat);
      const utas = el('ol', 'lms-tutor__thread');
      utas.setAttribute('aria-live', 'polite');

      function gelembung(giliran) {
        const li = el('li', `lms-tutor__msg is-${giliran.role}${giliran.galat ? ' is-error' : ''}`);
        if (giliran.role === 'user') li.append(el('p', 'lms-tutor__text', giliran.label || giliran.text));
        else li.append(teksKaya(giliran.text));
        if (giliran.cadangan) li.append(el('span', 'lms-tutor__source', 'Disusun dari ringkasan materi pengajar'));
        return li;
      }
      function gambarUtas() {
        utas.replaceChildren(...riwayat.map(gelembung));
        utas.hidden = !riwayat.length;
      }
      gambarUtas();

      const chips = el('div', 'lms-tutor__chips');
      const form = el('form', 'lms-tutor__form');
      const idInput = idBaru('tutor');
      const lbl = el('label', 'sr-only', 'Pertanyaanmu tentang materi ini');
      lbl.htmlFor = idInput;
      const input = el('textarea', 'lms-tutor__input');
      input.id = idInput;
      input.rows = 2;
      input.maxLength = 1000;
      input.placeholder = 'Tanyakan bagian yang belum kamu pahami...';
      const kirim = el('button', 'lms-tutor__send', 'Tanya');
      kirim.type = 'submit';
      form.append(lbl, input, kirim);

      let sibuk = false;
      async function tanya(mode, pertanyaan, label) {
        if (sibuk) return;
        sibuk = true;
        kotak.classList.add('is-busy');
        [...chips.children].forEach((c) => { c.disabled = true; });
        kirim.disabled = true;
        const sebelumnya = riwayat.filter((g) => !g.galat).slice(-6).map((g) => ({ role: g.role, text: g.text }));
        riwayat.push({ role: 'user', text: pertanyaan || label, label });
        gambarUtas();
        const mengetik = el('li', 'lms-tutor__msg is-assistant is-typing');
        mengetik.append(el('span', 'lms-tutor__dots'), el('span', 'sr-only', 'Sedang menyusun jawaban'));
        utas.append(mengetik);
        mengetik.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        try {
          const r = await api('POST', `/api/students/${encodeURIComponent(studentId)}/courses/${aktif.id}/materials/${m.id}/study-help`, { mode, question: pertanyaan || '', history: sebelumnya });
          const help = r.help || {};
          riwayat.push({ role: 'assistant', text: help.answer || 'Belum ada jawaban. Tanyakan langsung ke ustadz pengampu.', cadangan: help.mode === 'fallback' });
        } catch (error) {
          riwayat.push({ role: 'assistant', text: error.message, galat: true });
        } finally {
          sibuk = false;
          kotak.classList.remove('is-busy');
          [...chips.children].forEach((c) => { c.disabled = false; });
          kirim.disabled = false;
          gambarUtas();
          const terakhir = utas.lastElementChild;
          if (terakhir) terakhir.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }

      TOMBOL_CEPAT.forEach(([mode, label]) => {
        const c = tombol(label, 'lms-tutor__chip');
        c.addEventListener('click', () => tanya(mode, '', label));
        chips.append(c);
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const teks = input.value.trim();
        if (teks.length < 3) { input.focus(); return; }
        input.value = '';
        tanya('tanya', teks);
      });

      kotak.append(chips, utas, form);
      return kotak;
    }

    // ------------------------------------------------------------ Halaman maddah
    // Tata letak: kepala (remah roti, judul maddah, baris statistik), panggung materi di
    // kiri, dan daftar "Isi kelas" bergambar di kanan (di ponsel turun ke bawah).
    function statistik(label, nilai) {
      const sel = el('div', 'lms-stat');
      sel.append(el('span', 'lms-stat__label', label), el('strong', 'lms-stat__value', nilai));
      return sel;
    }

    function gambarMini(x) {
      const thumb = el('span', `lms-thumb is-${x.type}`);
      const yt = x.media && x.media.youtubeId;
      if (yt && /^[A-Za-z0-9_-]{6,20}$/.test(yt)) {
        const img = el('img');
        img.src = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.addEventListener('error', () => { img.remove(); thumb.prepend(el('span', 'lms-thumb__glyph', 'Video')); });
        thumb.append(img);
      } else {
        thumb.append(el('span', 'lms-thumb__glyph', LABEL_JENIS[x.type] || x.type));
      }
      return thumb;
    }

    function pilihMateri(id) {
      materiId = id;
      lukisMaddah();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function keBeranda() {
      if (pratinjau) { pratinjau.onKembali(); return; }
      aktif = null;
      await muatDaftar();
      lukisBeranda();
    }

    function lukisMaddah(kabar = '') {
      const m = aktif.materials || [];
      const i = Math.max(0, m.findIndex((x) => x.id === materiId));
      const materi = m[i];
      const jumlahSelesai = m.filter((x) => x.completed).length;
      const isi = [];
      const kembali = tombol(pratinjau ? '← Kembali ke studio' : '← Kembali ke ruang belajar', 'mus-back');
      kembali.addEventListener('click', keBeranda);
      isi.push(kembali);
      if (pratinjau) isi.push(el('p', 'lms-preview-note', 'Mode pratinjau: begini santri melihat kelas ini. Tandai selesai, kuis, tugas, dan asisten belajar tidak aktif, jadi tidak ada yang tercatat.'));

      const tata = el('div', 'lms-learn');
      const utama = el('article', 'lms-learn__main');

      const kepala = el('header', 'lms-learn__head');
      const remah = el('nav', 'lms-crumbs');
      remah.setAttribute('aria-label', 'Lokasi');
      const tautBeranda = tombol(pratinjau ? 'Studio maddah' : 'Ruang belajar', 'lms-crumbs__link');
      tautBeranda.addEventListener('click', keBeranda);
      remah.append(tautBeranda, el('span', 'lms-crumbs__sep', '/'), el('span', 'lms-crumbs__here', aktif.title));
      if (materi) remah.append(el('span', 'lms-crumbs__sep', '/'), el('span', `lms-type is-${materi.type}`, LABEL_JENIS[materi.type] || materi.type));
      kepala.append(remah, el('h2', 'lms-learn__title', aktif.title));
      const stat = el('div', 'lms-stats');
      stat.append(
        statistik('Progres belajar', `${aktif.progress || 0}%`),
        statistik('Materi selesai', `${jumlahSelesai}/${m.length}`),
        statistik('Isi kelas', `${m.length} materi`),
        statistik('Pengampu', aktif.teacherName || 'Asatidz Hamasah')
      );
      kepala.append(stat);
      utama.append(kepala);

      if (!materi) {
        utama.append(el('p', 'lms-empty-line', 'Maddah ini belum punya materi.'));
      } else {
        if (kabar) utama.append(el('p', 'mus-status is-ok asr-flash', kabar));
        const panggung = el('section', 'lms-stage');
        const judul = el('header', 'lms-stage__head');
        // Baris status di bawah pemutar: keadaan materi, posisinya, dan jenisnya.
        const baris = el('div', 'lms-learn__meta');
        const keadaan = pratinjau ? ['is-preview', 'Pratinjau'] : materi.completed ? ['is-done', '✓ Selesai'] : ['is-now', 'Sedang dipelajari'];
        baris.append(
          el('span', `lms-status-pill ${keadaan[0]}`, keadaan[1]),
          el('span', 'lms-stage__num', `Materi ${i + 1} dari ${m.length}`),
          el('span', 'lms-learn__meta-end', LABEL_JENIS[materi.type] || materi.type)
        );
        judul.append(baris, el('h3', 'lms-stage__title', materi.title));
        const konten = materi.type === 'video' ? isiVideo(materi) : materi.type === 'pdf' ? isiPdf(materi) : materi.type === 'quiz' ? isiKuis(materi) : materi.type === 'assignment' ? isiTugas(materi) : (() => { const w = el('div', 'lms-content'); w.append(paragraf(materi.content)); return w; })();
        // Video tampil lebar di atas; judul materinya di bawah pemutar.
        const pemutar = materi.type === 'video' ? konten.querySelector('.lms-video') : null;
        if (pemutar) panggung.append(pemutar);
        panggung.append(judul);
        if (materi.summary) panggung.append(el('p', 'lms-learn__summary', materi.summary));
        if (konten.childNodes.length) panggung.append(konten);
        utama.append(panggung);
        if ((materi.keyPoints || []).length) {
          const poin = el('section', 'lms-points');
          poin.append(el('h4', 'wali-subtitle', 'Poin penting'));
          const ul = el('ul');
          materi.keyPoints.forEach((p) => ul.append(el('li', '', p)));
          poin.append(ul);
          utama.append(poin);
        }
        // Asisten belajar memanggil AI atas nama santri, jadi tidak ada di pratinjau.
        if (!pratinjau) utama.append(asistenBelajar(materi));

        const nav = el('nav', 'lms-learn__nav');
        nav.setAttribute('aria-label', 'Navigasi materi');
        const sebelum = tombol('← Sebelumnya');
        sebelum.disabled = i === 0;
        sebelum.addEventListener('click', () => pilihMateri(m[i - 1].id));
        const lanjut = tombol(i === m.length - 1 ? (pratinjau ? 'Kembali ke studio' : 'Kembali ke ruang belajar') : 'Berikutnya →', 'button button--primary');
        lanjut.addEventListener('click', () => (i === m.length - 1 ? keBeranda() : pilihMateri(m[i + 1].id)));
        nav.append(sebelum);
        if (!pratinjau && ['video', 'pdf', 'text'].includes(materi.type) && !materi.completed) {
          const selesai = tombol('✓ Tandai selesai', 'button button--secondary');
          selesai.addEventListener('click', async () => {
            selesai.disabled = true;
            try {
              const r = await api('POST', `/api/students/${encodeURIComponent(studentId)}/courses/${aktif.id}/materials/${materi.id}/complete`);
              gantiCourse(r.course);
              if (i < m.length - 1) { materiId = m[i + 1].id; lukisMaddah('Materi sebelumnya ditandai selesai.'); window.scrollTo({ top: 0, behavior: 'smooth' }); } else lukisMaddah('Materi terakhir selesai. Masya Allah.');
            } catch (error) { selesai.disabled = false; window.alert(error.message); }
          });
          nav.append(selesai);
        }
        nav.append(lanjut);
        utama.append(nav);
      }

      const samping = el('aside', 'lms-learn__side');
      samping.setAttribute('aria-label', 'Isi kelas');
      const sKepala = el('header', 'lms-side__head');
      const sJudul = el('div');
      sJudul.append(el('p', 'wali-eyebrow', 'Isi kelas'), el('h3', 'lms-side__title', 'Materi pembelajaran'));
      sKepala.append(sJudul, el('span', 'lms-side__count', `${jumlahSelesai}/${m.length}`));
      const bar = el('div', 'lms-bar lms-side__bar');
      const isiBar = el('span');
      isiBar.style.width = `${aktif.progress || 0}%`;
      bar.append(isiBar);
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-label', 'Progres maddah');
      bar.setAttribute('aria-valuenow', String(aktif.progress || 0));
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      const daftar = el('ol', 'lms-toc');
      m.forEach((x, j) => {
        const li = el('li');
        const dibuka = x.id === materiId;
        const b = tombol('', `lms-toc__item ${dibuka ? 'is-active' : ''} ${x.completed ? 'is-done' : ''}`.trim());
        if (dibuka) b.setAttribute('aria-current', 'true');
        const thumb = gambarMini(x);
        const sedang = x.type === 'video' ? 'Sedang diputar' : 'Sedang dibuka';
        thumb.append(el('span', 'lms-thumb__num', `Materi ${j + 1}`));
        if (dibuka) thumb.append(el('span', 'lms-thumb__now', sedang));
        else if (x.completed) thumb.append(el('span', 'lms-thumb__now is-done', '✓ Selesai'));
        if (x.media && x.media.youtubeId) thumb.append(el('span', 'lms-thumb__source', '▶ Video YouTube'));
        const teks = el('span', 'lms-toc__text');
        const kaki = el('span', 'lms-toc__foot');
        kaki.append(el('span', '', LABEL_JENIS[x.type] || x.type), el('span', '', pratinjau ? '' : x.completed ? 'Selesai' : dibuka ? sedang : 'Belum mulai'));
        teks.append(el('span', 'lms-toc__title', x.title), kaki);
        b.append(thumb, teks);
        b.addEventListener('click', () => pilihMateri(x.id));
        li.append(b);
        daftar.append(li);
      });
      samping.append(sKepala, bar, daftar);
      tata.append(utama, samping);
      isi.push(tata);
      wadah.replaceChildren(...isi);
      // Di layar lebar daftar materi bergulir sendiri; bawa materi yang dibuka ke pandangan.
      const aktifDiDaftar = daftar.querySelector('.is-active');
      if (aktifDiDaftar && window.matchMedia('(min-width: 961px)').matches) daftar.scrollTop = Math.max(0, aktifDiDaftar.offsetTop - daftar.offsetTop - 12);
    }

    return {
      // Dipakai studio (lms-studio.js): ruang belajar sebuah maddah persis seperti dilihat
      // santri, dari /api/courses/:id/pratinjau. onKembali dipanggil tombol kembali.
      async pratinjau(courseId, { onKembali }) {
        pratinjau = { onKembali };
        wadah.replaceChildren(el('p', 'mus-loading', 'Menyiapkan pratinjau kelas...'));
        const r = await api('GET', `/api/courses/${encodeURIComponent(courseId)}/pratinjau`);
        aktif = r.course;
        materiId = ((aktif.materials || [])[0] || {}).id || null;
        lukisMaddah();
        window.scrollTo({ top: 0, behavior: 'instant' });
      },
      async mulai() {
        wadah.replaceChildren(el('p', 'mus-loading', 'Menyiapkan ruang belajar...'));
        const saya = await api('GET', '/api/my-students');
        studentId = saya.items && saya.items[0] && saya.items[0].id;
        if (!studentId) { wadah.replaceChildren(el('p', 'lms-empty-line', 'Akun ini belum terhubung dengan data santri. Hubungi admin Hamasah.')); return; }
        await muatDaftar();
        // Tautan dari beranda santri: #maddah=<id>&materi=<id>.
        const params = new URLSearchParams(window.location.hash.slice(1));
        const dituju = params.get('maddah');
        try { if (window.location.hash) history.replaceState(null, '', window.location.pathname); } catch { /* opsional */ }
        if (dituju && maddah.some((c) => c.id === dituju)) await buka(dituju, params.get('materi'));
        else lukisBeranda();
      }
    };
  }

  window.HamasahLmsBelajar = Object.freeze({ buat });
})();
