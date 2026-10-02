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

  // --------------------------------------------------------- Indikator utama
  // Sholat berjamaah (periode ringkasan ibadah), hafalan juz, dan kondisi kesehatan
  // terakhir. Kesehatan hanya bila fiturnya dinyalakan admin (care.health bukan null).
  const KONDISI = { sehat: 'Sehat', 'sakit-ringan': 'Sakit ringan', 'perlu-perhatian': 'Perlu perhatian', dirujuk: 'Dirujuk ke dokter' };

  function kotakIndikator(label, nilai, keterangan, kelas = '') {
    const kotak = el('div', `santri-indicator ${kelas}`.trim());
    kotak.append(el('span', 'santri-indicator__label', label), el('strong', 'santri-indicator__value', nilai), el('span', 'santri-indicator__note', keterangan));
    return kotak;
  }

  function kartuIndikator(care, juz) {
    const kotak = [];
    if (care && care.prayers) {
      const p = care.prayers;
      kotak.push(kotakIndikator(
        'Sholat berjamaah',
        p.berjamaahRate === null ? '-' : `${p.berjamaahRate}%`,
        p.recorded ? `${p.totals.berjamaah} dari ${p.recorded} waktu, ${tanggal(care.period.from)} sampai ${tanggal(care.period.to)}` : 'Belum ada presensi sholat yang dicatat.'
      ));
    }
    if (juz && juz.tersedia) {
      kotak.push(kotakIndikator(
        'Hafalan Al-Qur\'an',
        `${juz.hafal} juz`,
        juz.sedang ? `${juz.sedang} juz sedang dihafal` : (juz.hafal ? 'Sudah hafal' : 'Belum ada juz yang ditandai musyrif.')
      ));
    }
    if (care && Array.isArray(care.health)) {
      const terakhir = care.health.slice().sort((a, b) => String(b.occurredOn).localeCompare(String(a.occurredOn)))[0];
      kotak.push(terakhir
        ? kotakIndikator('Kesehatan', KONDISI[terakhir.condition] || terakhir.condition, `Dicatat ${tanggal(terakhir.occurredOn)}`, `is-${terakhir.condition}`)
        : kotakIndikator('Kesehatan', '-', 'Belum ada catatan kesehatan pada periode ini.'));
    }
    if (!kotak.length) return null;
    const wadah = el('section', 'santri-indicators');
    wadah.setAttribute('aria-label', 'Indikator utama');
    wadah.append(...kotak);
    return wadah;
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

  async function kirim(url, method, headers, body) {
    const response = await fetch(url, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Permintaan belum dapat diproses.');
    return result;
  }

  // ---------------------------------------------------------------- Pengumuman
  function kartuPengumuman(data) {
    if (!data || !data.items || !data.items.length) return null;
    const wadah = kartu('Pengumuman', null, 'santri-announcements');
    const daftar = el('ul', 'santri-announce-list');
    data.items.slice(0, 5).forEach((item) => {
      const baris = el('li', 'santri-announce');
      const sasaran = item.dormitoryName || 'Semua asrama';
      baris.append(
        el('strong', 'santri-announce__title', item.title),
        el('p', 'santri-announce__body', item.body),
        el('span', 'santri-announce__meta', [sasaran, tanggal(item.createdAt), item.author].filter(Boolean).join(' · '))
      );
      daftar.append(baris);
    });
    wadah.append(daftar);
    return wadah;
  }

  // ---------------------------------------------------------- Peta hafalan juz
  const STATUS_JUZ = { belum: 'Belum', sedang: 'Sedang dihafal', hafal: 'Sudah hafal' };
  const JUZ_BERIKUT = { belum: 'sedang', sedang: 'hafal', hafal: 'belum' };

  // editable: musyrif dan admin bisa mengklik kotak juz untuk mengganti statusnya
  // (belum -> sedang -> hafal -> belum). Dipakai juga oleh monitoring.js.
  function kartuJuz(data, { studentId, headers, editable = false, onError } = {}) {
    if (!data || !data.tersedia) return null;
    if (!editable && !data.hafal && !data.sedang) return null;
    const wadah = kartu('Peta hafalan 30 juz', null, 'santri-juz');
    const ringkas = el('p', 'santri-card__note');
    const grid = el('div', 'santri-juz__grid');
    // Kotak yang bisa diklik tetap tombol bagi pembaca layar; hanya tampilan baca-saja
    // yang diberi peran daftar.
    if (!editable) grid.setAttribute('role', 'list');
    function perbaruiRingkasan() {
      const hafal = data.juz.filter((item) => item.status === 'hafal').length;
      const sedang = data.juz.filter((item) => item.status === 'sedang').length;
      ringkas.textContent = `${hafal} juz sudah hafal${sedang ? `, ${sedang} sedang dihafal` : ''}.${editable ? ' Klik kotak juz untuk mengganti statusnya.' : ''}`;
    }
    data.juz.forEach((item) => {
      const kotak = el(editable ? 'button' : 'span', `santri-juz__cell is-${item.status}`, String(item.number));
      if (!editable) kotak.setAttribute('role', 'listitem');
      const label = () => `Juz ${item.number}: ${STATUS_JUZ[item.status]}`;
      kotak.setAttribute('aria-label', label());
      kotak.title = label();
      if (editable) {
        kotak.type = 'button';
        kotak.addEventListener('click', async () => {
          const berikut = JUZ_BERIKUT[item.status];
          kotak.disabled = true;
          try {
            await kirim(`/api/students/${encodeURIComponent(studentId)}/juz/${item.number}`, 'PUT', headers, { status: berikut });
            kotak.classList.replace(`is-${item.status}`, `is-${berikut}`);
            item.status = berikut;
            kotak.setAttribute('aria-label', label());
            kotak.title = label();
            perbaruiRingkasan();
          } catch (error) {
            if (onError) onError(error.message);
          } finally {
            kotak.disabled = false;
          }
        });
      }
      grid.append(kotak);
    });
    const keterangan = el('div', 'santri-juz__legend');
    ['hafal', 'sedang', 'belum'].forEach((status) => {
      const butir = el('span', 'santri-juz__key');
      butir.append(el('span', `santri-juz__swatch is-${status}`), document.createTextNode(STATUS_JUZ[status]));
      keterangan.append(butir);
    });
    perbaruiRingkasan();
    wadah.querySelector('.santri-card__head').append(ringkas);
    wadah.append(grid, keterangan);
    return wadah;
  }

  // --------------------------------------------------------------------- Izin
  const STATUS_IZIN = { menunggu: 'Menunggu keputusan', disetujui: 'Disetujui', ditolak: 'Ditolak', dibatalkan: 'Dibatalkan' };
  const JENIS_IZIN = [['keluar-asrama', 'Izin keluar asrama'], ['sakit', 'Izin sakit'], ['lainnya', 'Izin lainnya']];
  const WAKTU = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

  function waktu(iso) {
    try { return WAKTU.format(new Date(iso)); } catch { return String(iso || ''); }
  }

  function barisIzin(item, { bisaBatal, onBatal }) {
    const baris = el('li', `santri-leave is-${item.status}`);
    const kepala = el('div', 'santri-leave__head');
    kepala.append(el('strong', '', item.kindLabel), el('span', 'santri-leave__status', STATUS_IZIN[item.status] || item.status));
    baris.append(
      kepala,
      el('span', 'santri-leave__meta', `${waktu(item.startsAt)} sampai ${waktu(item.endsAt)}`),
      el('p', 'santri-leave__reason', item.reason)
    );
    if (item.decisionNote) baris.append(el('p', 'santri-leave__note', `Catatan ${item.decidedBy || 'musyrif'}: ${item.decisionNote}`));
    if (bisaBatal && item.status === 'menunggu') {
      const batal = el('button', 'button button--secondary santri-leave__cancel', 'Batalkan pengajuan');
      batal.type = 'button';
      batal.addEventListener('click', () => onBatal(item, batal));
      baris.append(batal);
    }
    return baris;
  }

  // Santri: formulir pengajuan dan riwayat. Wali: riwayat saja.
  // pesan: teks konfirmasi dari tindakan sebelumnya, ditampilkan di kartu yang baru.
  function kartuIzin(data, { studentId, headers, santri, muatUlang, pesan = '' }) {
    if (!data || !data.tersedia) return null;
    if (!santri && !data.items.length) return null;
    const wadah = kartu(santri ? 'Izin' : 'Izin ananda', santri ? 'Ajukan izin ke musyrif asrama. Izin yang disetujui tercatat di kegiatan harian.' : 'Pengajuan izin dan keputusan musyrif.', 'santri-leave-card');
    const status = el('p', 'form-status', pesan);
    status.setAttribute('role', 'status');

    if (santri) {
      const form = el('form', 'santri-leave-form');
      form.noValidate = true;
      function bidang(label, kontrol) {
        const wadahBidang = el('label', 'santri-leave-form__field');
        wadahBidang.append(el('span', '', label), kontrol);
        return wadahBidang;
      }
      const jenis = el('select');
      JENIS_IZIN.forEach(([nilai, teks]) => jenis.add(new Option(teks, nilai)));
      const mulai = el('input');
      mulai.type = 'datetime-local';
      const selesai = el('input');
      selesai.type = 'datetime-local';
      const alasan = el('textarea');
      alasan.rows = 2;
      alasan.maxLength = 500;
      alasan.placeholder = 'Contoh: mengurus perpanjangan iqamah di Abbasiyah.';
      const kirimTombol = el('button', 'button button--primary', 'Ajukan izin');
      kirimTombol.type = 'submit';
      form.append(bidang('Jenis izin', jenis), bidang('Mulai', mulai), bidang('Selesai', selesai), bidang('Alasan', alasan), kirimTombol);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        status.classList.remove('is-error');
        if (!mulai.value || !selesai.value || alasan.value.trim().length < 5) {
          status.textContent = 'Isi waktu mulai, waktu selesai, dan alasan (minimal 5 karakter).';
          status.classList.add('is-error');
          return;
        }
        kirimTombol.disabled = true;
        try {
          await kirim(`/api/students/${encodeURIComponent(studentId)}/leave`, 'POST', headers, {
            kind: jenis.value,
            startsAt: new Date(mulai.value).toISOString(),
            endsAt: new Date(selesai.value).toISOString(),
            reason: alasan.value
          });
          await muatUlang('Pengajuan terkirim. Musyrif asrama akan memutuskannya.');
        } catch (error) {
          status.textContent = error.message;
          status.classList.add('is-error');
          kirimTombol.disabled = false;
        }
      });
      wadah.append(form);
    }
    wadah.append(status);

    if (data.items.length) {
      const daftar = el('ul', 'santri-leave-list');
      data.items.slice(0, 10).forEach((item) => daftar.append(barisIzin(item, {
        bisaBatal: santri,
        async onBatal(izin, tombol) {
          if (!window.confirm('Batalkan pengajuan izin ini?')) return;
          tombol.disabled = true;
          try {
            await kirim(`/api/leave/${encodeURIComponent(izin.id)}/batal`, 'POST', headers);
            await muatUlang('Pengajuan dibatalkan.');
          } catch (error) {
            status.textContent = error.message;
            status.classList.add('is-error');
            tombol.disabled = false;
          }
        }
      })));
      wadah.append(daftar);
    }
    return wadah;
  }

  // wadah: elemen kosong di bawah kartu profil. role: peran akun yang membuka dashboard.
  async function isi(wadah, { studentId, role, care, headers }) {
    if (!wadah || !studentId) return;
    const id = encodeURIComponent(studentId);
    const santri = role === 'student';
    const keluarga = santri || role === 'parent';
    const [roadmap, honors, courses, pengumuman, juz, izin] = await Promise.all([
      ambil(`/api/students/${id}/roadmap`, headers),
      keluarga ? ambil('/api/honors', headers) : null,
      santri ? ambil(`/api/students/${id}/courses`, headers) : null,
      keluarga ? ambil('/api/announcements', headers) : null,
      ambil(`/api/students/${id}/juz`, headers),
      keluarga ? ambil(`/api/students/${id}/leave`, headers) : null
    ]);
    const muatUlangIzin = async (pesan = '') => {
      const segar = await ambil(`/api/students/${id}/leave?t=${Date.now()}`, headers);
      const lama = wadah.querySelector('.santri-leave-card');
      const baru = kartuIzin(segar, { studentId, headers, santri, muatUlang: muatUlangIzin, pesan });
      if (lama && baru) lama.replaceWith(baru);
    };
    const kartuKartu = [
      kartuIndikator(care, juz),
      santri ? kartuHariIni(courses && courses.items, care) : null,
      keluarga ? kartuPengumuman(pengumuman) : null,
      keluarga ? kartuIzin(izin, { studentId, headers, santri, muatUlang: muatUlangIzin }) : null,
      kartuRoadmap(roadmap && roadmap.roadmap),
      kartuJuz(juz),
      keluarga ? kartuTeladan(honors) : null
    ].filter(Boolean);
    wadah.replaceChildren(...kartuKartu);
    wadah.hidden = !kartuKartu.length;
  }

  window.HamasahPerjalanan = Object.freeze({ isi, daftarTugas, kartuJuz });
}());
