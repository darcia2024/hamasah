// Kartu tambahan di dashboard santri (portal.js), diisi setelah dashboard tampil supaya
// tidak menahannya:
//   - "Hari ini" (hanya santri): tugas dan kuis yang belum beres, materi berikutnya,
//     sholat dan setoran hafalan terakhir yang dicatat musyrif.
//   - Roadmap studi (santri, wali, staf): GET /api/students/:id/roadmap.
//   - Santri teladan bulan ini (santri dan wali): GET /api/honors.
// Semua teks dipasang lewat textContent. Kartu yang datanya kosong tidak ditampilkan.
(function initPerjalananSantri() {
  const TANGGAL = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'UTC' });
  const BULAN = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const NILAI_HAFALAN = { lancar: 'Lancar', 'kurang-lancar': 'Kurang lancar', ulang: 'Perlu diulang' };
  const SHOLAT = [['subuh', 'Subuh'], ['dzuhur', 'Dzuhur'], ['ashar', 'Ashar'], ['maghrib', 'Maghrib'], ['isya', 'Isya']];
  const STATUS_SHOLAT = { berjamaah: 'Berjamaah', munfarid: 'Munfarid', tidak: 'Tidak', izin: 'Izin' };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function tanggal(iso) {
    try { return TANGGAL.format(new Date(iso)); } catch { return String(iso || ''); }
  }

  function kartu(judul, keterangan, kelas = '') {
    const wadah = el('section', `crm-white-card santri-card ${kelas}`.trim());
    const kepala = el('div', 'santri-card__head');
    kepala.append(el('h3', 'santri-card__title', judul));
    if (keterangan) kepala.append(el('p', 'santri-card__note', keterangan));
    wadah.append(kepala);
    return wadah;
  }

  async function ambil(url, headers) {
    try {
      const response = await fetch(url, { headers });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  }

  function tautanMateri(course, material) {
    const params = new URLSearchParams({ maddah: course.id, materi: material.id });
    return `lms.html#${params.toString()}`;
  }

  // ------------------------------------------------------------------ Hari ini
  function daftarTugas(courses) {
    const tugas = [];
    const berikutnya = [];
    (courses || []).forEach((course) => {
      const materi = course.materials || [];
      materi.forEach((material) => {
        if (material.type === 'assignment' && !material.completed) {
          const kiriman = material.submission;
          if (!kiriman) tugas.push({ course, material, label: 'Tugas belum dikirim', tingkat: 'perlu' });
          else if (kiriman.status === 'reviewed') tugas.push({ course, material, label: `Dinilai ${kiriman.score}, belum lulus. Baca catatan pengajar.`, tingkat: 'perlu' });
          else tugas.push({ course, material, label: 'Terkirim, menunggu dinilai', tingkat: 'tunggu' });
        }
        if (material.type === 'quiz' && !material.completed) {
          const percobaan = (material.attempts || []).length;
          const batas = (material.quiz && material.quiz.attemptLimit) || 3;
          if (percobaan < batas) {
            tugas.push({ course, material, label: percobaan ? `Belum lulus, sisa ${batas - percobaan} percobaan` : 'Kuis belum dikerjakan', tingkat: 'perlu' });
          }
        }
      });
      const lanjut = materi.find((material) => !material.completed && ['text', 'video', 'pdf'].includes(material.type));
      if (lanjut) berikutnya.push({ course, material: lanjut });
    });
    return { tugas, berikutnya };
  }

  function barisTautan(course, material, keterangan, kelas) {
    const item = el('li', `santri-task ${kelas || ''}`.trim());
    const tautan = el('a', 'santri-task__link', material.title);
    tautan.href = tautanMateri(course, material);
    item.append(tautan, el('span', 'santri-task__meta', `${course.title} · ${keterangan}`));
    return item;
  }

  function kartuHariIni(courses, care) {
    const { tugas, berikutnya } = daftarTugas(courses);
    const sholatTerakhir = care && care.prayers && care.prayers.days && care.prayers.days[0];
    const hafalanTerakhir = care && care.memorization && care.memorization[0];
    if (!tugas.length && !berikutnya.length && !sholatTerakhir && !hafalanTerakhir) return null;

    const wadah = kartu('Hari ini', 'Yang perlu Anda kerjakan dan catatan terbaru dari musyrif.', 'santri-today');
    const grid = el('div', 'santri-today__grid');

    const kolomBelajar = el('div', 'santri-today__col');
    kolomBelajar.append(el('h4', 'santri-today__label', 'Tugas dan kuis'));
    if (tugas.length) {
      const daftar = el('ul', 'santri-task-list');
      tugas.forEach(({ course, material, label, tingkat }) => daftar.append(barisTautan(course, material, label, `is-${tingkat}`)));
      kolomBelajar.append(daftar);
    } else {
      kolomBelajar.append(el('p', 'santri-today__empty', 'Tidak ada tugas atau kuis yang tertunda.'));
    }
    if (berikutnya.length) {
      kolomBelajar.append(el('h4', 'santri-today__label', 'Lanjutkan belajar'));
      const daftar = el('ul', 'santri-task-list');
      berikutnya.forEach(({ course, material }) => daftar.append(barisTautan(course, material, 'materi berikutnya')));
      kolomBelajar.append(daftar);
    }

    const kolomIbadah = el('div', 'santri-today__col');
    kolomIbadah.append(el('h4', 'santri-today__label', 'Sholat terakhir dicatat'));
    if (sholatTerakhir) {
      kolomIbadah.append(el('p', 'santri-today__date', tanggal(sholatTerakhir.date)));
      const daftar = el('ul', 'santri-prayer-list');
      SHOLAT.forEach(([kunci, label]) => {
        const status = sholatTerakhir.prayers[kunci];
        const item = el('li', `santri-prayer ${status ? `is-${status}` : ''}`.trim());
        item.append(el('span', 'santri-prayer__name', label), el('span', 'santri-prayer__status', status ? STATUS_SHOLAT[status] || status : '-'));
        daftar.append(item);
      });
      kolomIbadah.append(daftar);
    } else {
      kolomIbadah.append(el('p', 'santri-today__empty', 'Belum ada presensi sholat yang dicatat.'));
    }
    kolomIbadah.append(el('h4', 'santri-today__label', 'Setoran hafalan terakhir'));
    if (hafalanTerakhir) {
      const jenis = hafalanTerakhir.kind === 'ziyadah' ? 'Hafalan baru' : 'Murajaah';
      kolomIbadah.append(
        el('p', 'santri-today__strong', hafalanTerakhir.portion),
        el('p', 'santri-today__meta', `${jenis} · ${NILAI_HAFALAN[hafalanTerakhir.grade] || hafalanTerakhir.grade} · ${tanggal(hafalanTerakhir.occurredOn)}`)
      );
      if (hafalanTerakhir.note) kolomIbadah.append(el('p', 'santri-today__meta', hafalanTerakhir.note));
    } else {
      kolomIbadah.append(el('p', 'santri-today__empty', 'Belum ada setoran yang dicatat.'));
    }

    grid.append(kolomBelajar, kolomIbadah);
    wadah.append(grid);
    return wadah;
  }

  // ------------------------------------------------------------------- Roadmap
  function kartuRoadmap(roadmap) {
    if (!roadmap) return null;
    const keterangan = roadmap.current
      ? `${roadmap.program}. Fase ${roadmap.current} dari ${roadmap.phases.length}.`
      : `${roadmap.program}. Fase saat ini belum diisi admin.`;
    const wadah = kartu('Roadmap studi', keterangan, 'santri-roadmap');
    const daftar = el('ol', 'santri-roadmap__list');
    roadmap.phases.forEach((fase) => {
      const item = el('li', `santri-roadmap__step is-${fase.state}`);
      if (fase.state === 'current') item.setAttribute('aria-current', 'step');
      const status = { done: 'Selesai', current: 'Sedang dijalani', upcoming: 'Berikutnya' }[fase.state];
      item.append(
        el('span', 'santri-roadmap__dot', String(fase.number)),
        el('span', 'santri-roadmap__title', fase.title),
        el('span', 'santri-roadmap__state', roadmap.current ? status : '')
      );
      daftar.append(item);
    });
    wadah.append(daftar);
    return wadah;
  }

  // ------------------------------------------------------------- Santri teladan
  function kartuTeladan(honors) {
    if (!honors || !honors.items || !honors.items.length) return null;
    let bulan = honors.month;
    try { bulan = BULAN.format(new Date(`${honors.month}-01T00:00:00Z`)); } catch {}
    const wadah = kartu(`Santri teladan ${bulan}`, 'Dipilih pengurus Hamasah dari catatan ibadah, kehadiran, dan hafalan.', 'santri-honors');
    const daftar = el('ul', 'santri-honors__list');
    honors.items.forEach((item) => {
      const baris = el('li', 'santri-honors__item');
      baris.append(
        el('span', 'santri-honors__badge', item.title),
        el('strong', 'santri-honors__name', item.name),
        el('span', 'santri-honors__program', item.program),
        el('p', 'santri-honors__reason', item.reason)
      );
      daftar.append(baris);
    });
    wadah.append(daftar);
    return wadah;
  }

  // wadah: elemen kosong di bawah kartu profil. role: peran akun yang membuka dashboard.
  async function isi(wadah, { studentId, role, care, headers }) {
    if (!wadah || !studentId) return;
    const id = encodeURIComponent(studentId);
    const santri = role === 'student';
    const keluarga = santri || role === 'parent';
    const [roadmap, honors, courses] = await Promise.all([
      ambil(`/api/students/${id}/roadmap`, headers),
      keluarga ? ambil('/api/honors', headers) : null,
      santri ? ambil(`/api/students/${id}/courses`, headers) : null
    ]);
    const kartuKartu = [
      santri ? kartuHariIni(courses && courses.items, care) : null,
      kartuRoadmap(roadmap && roadmap.roadmap),
      keluarga ? kartuTeladan(honors) : null
    ].filter(Boolean);
    wadah.replaceChildren(...kartuKartu);
    wadah.hidden = !kartuKartu.length;
  }

  window.HamasahPerjalanan = Object.freeze({ isi, daftarTugas });
}());
