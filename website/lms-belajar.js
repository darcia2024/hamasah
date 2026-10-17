// Ruang belajar santri (17 Oktober 2026).
//   - Beranda: kartu "Lanjutkan belajar" dan kartu maddah dengan progres melingkar.
//   - Halaman maddah: materi aktif (video YouTube tersemat, PDF, bacaan, kuis pilihan
//     ganda/isian, tugas), tanya jawab materi, tombol sebelumnya/berikutnya, dan daftar
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

    function tanyaMateri(m) {
      const kotak = el('details', 'lms-ask');
      kotak.append(el('summary', '', 'Ada yang belum jelas? Tanyakan tentang materi ini'));
      const id = idBaru('tanya');
      const lbl = el('label', 'mus-label', 'Pertanyaanmu');
      lbl.htmlFor = id;
      const input = el('input', 'mus-input');
      input.id = id;
      input.placeholder = 'Contoh: apa bedanya mubtada dan khabar?';
      const tanya = tombol('Tanya');
      const jawab = el('div', 'lms-ask__answer');
      tanya.addEventListener('click', async () => {
        if (input.value.trim().length < 3) return;
        tanya.disabled = true;
        jawab.replaceChildren(el('p', 'mus-note', 'Mencari jawaban...'));
        try {
          const r = await api('POST', `/api/students/${encodeURIComponent(studentId)}/courses/${aktif.id}/materials/${m.id}/study-help`, { question: input.value.trim() });
          jawab.replaceChildren(paragraf((r.help && r.help.answer) || 'Belum ada jawaban. Tanyakan langsung ke guru.'));
        } catch (error) { jawab.replaceChildren(el('p', 'mus-status is-galat', error.message)); } finally { tanya.disabled = false; }
      });
      const baris = el('div', 'mus-form__row');
      baris.append(input, tanya);
      input.classList.add('lms-grow');
      kotak.append(lbl, baris, jawab);
      return kotak;
    }

    // ------------------------------------------------------------ Halaman maddah
    function lukisMaddah(kabar = '') {
      const m = aktif.materials || [];
      const i = Math.max(0, m.findIndex((x) => x.id === materiId));
      const materi = m[i];
      const isi = [];
      const kembali = tombol('← Semua maddah', 'mus-back');
      kembali.addEventListener('click', async () => { aktif = null; await muatDaftar(); lukisBeranda(); });
      isi.push(kembali);

      const tata = el('div', 'lms-learn');
      const utama = el('article', 'lms-learn__main');
      if (!materi) {
        utama.append(el('p', 'lms-empty-line', 'Maddah ini belum punya materi.'));
      } else {
        const kepala = el('header', 'lms-learn__head');
        kepala.append(
          el('p', 'wali-eyebrow', `${aktif.title} · Materi ${i + 1} dari ${m.length}`),
          el('h2', 'lms-learn__title', materi.title)
        );
        const meta = el('div', 'lms-learn__meta');
        meta.append(el('span', `lms-type is-${materi.type}`, LABEL_JENIS[materi.type] || materi.type));
        if (materi.completed) meta.append(el('span', 'lms-done', '✓ Selesai'));
        kepala.append(meta);
        utama.append(kepala);
        if (kabar) utama.append(el('p', 'mus-status is-ok asr-flash', kabar));
        if (materi.summary) utama.append(el('p', 'lms-learn__summary', materi.summary));
        utama.append(materi.type === 'video' ? isiVideo(materi) : materi.type === 'pdf' ? isiPdf(materi) : materi.type === 'quiz' ? isiKuis(materi) : materi.type === 'assignment' ? isiTugas(materi) : (() => { const w = el('div', 'lms-content'); w.append(paragraf(materi.content)); return w; })());
        if ((materi.keyPoints || []).length) {
          const poin = el('section', 'lms-points');
          poin.append(el('h4', 'wali-subtitle', 'Poin penting'));
          const ul = el('ul');
          materi.keyPoints.forEach((p) => ul.append(el('li', '', p)));
          poin.append(ul);
          utama.append(poin);
        }
        utama.append(tanyaMateri(materi));

        const nav = el('nav', 'lms-learn__nav');
        nav.setAttribute('aria-label', 'Navigasi materi');
        const sebelum = tombol('← Sebelumnya');
        sebelum.disabled = i === 0;
        sebelum.addEventListener('click', () => { materiId = m[i - 1].id; lukisMaddah(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
        const lanjut = tombol(i === m.length - 1 ? 'Kembali ke semua maddah' : 'Berikutnya →', 'button button--primary');
        const maju = async () => {
          if (i === m.length - 1) { aktif = null; await muatDaftar(); lukisBeranda(); return; }
          materiId = m[i + 1].id;
          lukisMaddah();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        };
        lanjut.addEventListener('click', maju);
        nav.append(sebelum);
        if (['video', 'pdf', 'text'].includes(materi.type) && !materi.completed) {
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
      const prog = el('div', 'lms-learn__progress');
      prog.append(cincin(aktif.progress || 0, 72));
      const pt = el('div');
      pt.append(el('strong', '', aktif.title), el('span', 'mus-note', `${m.filter((x) => x.completed).length} dari ${m.length} materi selesai`));
      prog.append(pt);
      const daftar = el('ol', 'lms-toc');
      m.forEach((x, j) => {
        const li = el('li');
        const b = tombol('', `lms-toc__item ${x.id === materiId ? 'is-active' : ''} ${x.completed ? 'is-done' : ''}`.trim());
        b.append(el('span', 'lms-toc__mark', x.completed ? '✓' : String(j + 1)), el('span', 'lms-toc__title', x.title), el('span', `lms-type is-${x.type}`, LABEL_JENIS[x.type] || x.type));
        b.addEventListener('click', () => { materiId = x.id; lukisMaddah(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
        li.append(b);
        daftar.append(li);
      });
      samping.append(prog, daftar);
      tata.append(utama, samping);
      isi.push(tata);
      wadah.replaceChildren(...isi);
    }

    return {
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
