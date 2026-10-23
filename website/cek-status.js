document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#lookup-form');
  const regIdInput = document.querySelector('#reg-id');
  const tokenInput = document.querySelector('#access-token');
  const submitBtn = document.querySelector('#btn-submit-lookup');
  const statusMsg = document.querySelector('#lookup-status-msg');

  const resultArea = document.querySelector('#status-result');
  const resRegId = document.querySelector('#res-reg-id');
  const resProgram = document.querySelector('#res-program');
  const resStatusBadge = document.querySelector('#res-status-badge');
  const resProgressPct = document.querySelector('#res-progress-pct');
  const resProgressFill = document.querySelector('#res-progress-fill');

  const docListContainer = document.querySelector('#doc-list-container');
  const docUploadForm = document.querySelector('#doc-upload-form');
  const docTypeSelect = document.querySelector('#doc-type-select');
  const docFileInput = document.querySelector('#doc-file-input');
  const docUploadStatus = document.querySelector('#doc-upload-status');
  const historyTimeline = document.querySelector('#history-timeline');
  const applicantEditCard = document.querySelector('#applicant-edit-card');
  const applicantEditForm = document.querySelector('#applicant-edit-form');
  const applicantEditStatus = document.querySelector('#applicant-edit-status');
  const recoveryForm = document.querySelector('#recovery-form');
  const recoveryEmail = document.querySelector('#recovery-email');
  const recoveryStatus = document.querySelector('#recovery-status');
  const accessTokenError = document.querySelector('#access-token-error');
  const recoveryEmailError = document.querySelector('#recovery-email-error');
  const recoveryCta = document.querySelector('#lookup-recovery-cta');

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  let currentRegId = '';
  let currentToken = '';
  const heroSection = document.querySelector('#cs-hero');
  const resName = document.querySelector('#res-name');
  const notesCard = document.querySelector('#res-notes-card');
  const notesBox = document.querySelector('#res-notes');
  const nextStepsCard = document.querySelector('#res-next-steps-card');
  const nextStepsList = document.querySelector('#res-next-steps');
  const helpWa = document.querySelector('#cs-help-wa');
  const recoveryDetails = document.querySelector('#cs-recovery');
  const KUNCI_SESI = 'hamasahRegistration';

  // Sesi pendaftar disimpan di tab ini (sessionStorage) supaya halaman bisa dimuat ulang
  // tanpa memasukkan Kode Akses lagi. Hilang sendiri saat tab ditutup atau saat Keluar.
  function simpanSesi(registrationId, accessToken) {
    try { sessionStorage.setItem(KUNCI_SESI, JSON.stringify({ registrationId, accessToken })); } catch { /* mode privat */ }
  }
  function hapusSesi() {
    try { sessionStorage.removeItem(KUNCI_SESI); } catch { /* mode privat */ }
  }
  if (recoveryCta && recoveryDetails) {
    recoveryCta.addEventListener('click', () => { recoveryDetails.open = true; });
  }

  function setLookupState(state, message) {
    form.dataset.lookupState = state;
    const labels = {
      loading: 'Memeriksa Kode Akses…',
      valid: 'Kode Akses valid.',
      invalid: 'Kode Akses tidak valid.',
      expired: 'Kode Akses sudah kedaluwarsa.',
      used: 'Kode Akses sudah digunakan.'
    };
    statusMsg.textContent = message || labels[state] || '';
    statusMsg.className = `form-status ${['invalid', 'expired', 'used', 'error'].includes(state) ? 'is-error' : state === 'valid' ? 'is-success' : ''}`;
    recoveryCta.hidden = !['invalid', 'expired', 'used'].includes(state);
    if (accessTokenError) {
      accessTokenError.textContent = ['invalid', 'expired', 'used'].includes(state) ? statusMsg.textContent : '';
      tokenInput.setAttribute('aria-invalid', String(['invalid', 'expired', 'used'].includes(state)));
    }
  }

  function classifyLookupError(error) {
    if (![401, 403, 404, 410].includes(error?.status)) return 'error';
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('kedaluwarsa') || message.includes('expired')) return 'expired';
    if (message.includes('sudah digunakan') || message.includes('already used')) return 'used';
    return 'invalid';
  }

  const PROGRAM_NAMES = {
    'kuliah-al-azhar': 'Program Kuliah S1 Universitas Al-Azhar Kairo',
    'mahad-al-azhar': "Program Ma'had Al-Azhar (Pendidikan Formal)",
    'hamasah-courses': 'Hamasah Courses (Kelas Bahasa Arab Digital)'
  };

  // Nama dokumen. Nilai di sini bawaan; nama dan keterangan yang diatur super admin di
  // halaman Template dimuat dari /api/templates/documents dan menggantikannya.
  const DOC_TYPE_LABELS = {
    'passport': 'Paspor',
    'diploma': 'Ijazah',
    'transcript': 'Transkrip nilai',
    'health-certificate': 'Surat keterangan sehat',
    'photo': 'Pasfoto 4x6',
    'other': 'Dokumen tambahan'
  };

  fetch('/api/templates/documents')
    .then((response) => (response.ok ? response.json() : null))
    .then((hasil) => {
      if (!hasil || !Array.isArray(hasil.items) || !hasil.items.length) return;
      const terpilih = docTypeSelect.value;
      docTypeSelect.replaceChildren(...hasil.items.map((item) => {
        DOC_TYPE_LABELS[item.type] = item.label;
        return new Option(item.wajib ? item.petunjuk : `${item.petunjuk} (tidak wajib)`, item.type);
      }));
      if (terpilih) docTypeSelect.value = terpilih;
    })
    .catch(() => {});

  // Label tahapan mengikuti program. Urutan dan ambang progresnya sama untuk semua
  // program (status di server tidak berubah); yang berbeda hanya apa arti tiap tahap.
  const STEP_LABELS = {
    'kuliah-al-azhar': [
      ['Pendaftaran masuk', 'Data formulir tersimpan'],
      ['Pemeriksaan berkas', 'Validasi ijazah & paspor'],
      ['Persiapan bahasa', 'Tahdid Mustawa / Dauroh'],
      ['Visa & tiket', 'Legalisasi & kloter terbang'],
      ['Tiba di Kairo', 'Asrama Hamasah, Nasr City']
    ],
    'mahad-al-azhar': [
      ['Pendaftaran masuk', 'Data formulir tersimpan'],
      ['Pemeriksaan berkas', 'KK, akta, rekomendasi Kemenag'],
      ['Persiapan berangkat', 'Paspor & jadwal rombongan'],
      ['Visa & tiket', 'Legalisasi & kloter terbang'],
      ['Tiba di Kairo', "Pendaftaran ma'had & tes bahasa"]
    ],
    'hamasah-courses': [
      ['Pendaftaran masuk', 'Data formulir tersimpan'],
      ['Konfirmasi tim', 'Kelas dan paket yang dipilih'],
      ['Penempatan kelas', 'Jadwal dan tingkat materi'],
      ['Akun belajar', 'Akses portal santri disiapkan'],
      ['Mulai belajar', 'Kelas daring aktif']
    ]
  };

  function applyProgramSteps(program) {
    const labels = STEP_LABELS[program] || STEP_LABELS['kuliah-al-azhar'];
    ['#step-submitted', '#step-review', '#step-academic', '#step-departure', '#step-completed'].forEach((id, index) => {
      const item = document.querySelector(id);
      if (!item) return;
      item.querySelector('.step-desc strong').textContent = labels[index][0];
      item.querySelector('.step-desc small').textContent = labels[index][1];
    });
    const stepper = document.querySelector('.cs-steps');
    if (stepper) stepper.setAttribute('aria-label', program === 'hamasah-courses' ? 'Tahapan pendaftaran kelas daring' : 'Tahapan pendaftaran hingga keberangkatan');
    // Kelas daring tidak berangkat ke Kairo, jadi jadwal kloter tidak ditampilkan.
    const departureSection = document.querySelector('.cs-departure');
    if (departureSection) departureSection.hidden = program === 'hamasah-courses';
  }

  function updateStepper(status, progress) {
    const steps = [
      { id: '#step-submitted', threshold: 15 },
      { id: '#step-review', threshold: 35 },
      { id: '#step-academic', threshold: 60 },
      { id: '#step-departure', threshold: 85 },
      { id: '#step-completed', threshold: 100 }
    ];

    steps.forEach((step) => {
      const el = document.querySelector(step.id);
      if (!el) return;
      el.classList.remove('is-done', 'is-current');
      if (progress >= step.threshold) {
        el.classList.add('is-done');
      } else if (progress >= step.threshold - 25) {
        el.classList.add('is-current');
      }
    });
  }

  function renderDocuments(docs) {
    if (!Array.isArray(docs) || docs.length === 0) {
      docListContainer.innerHTML = '<p class="cs-empty">Belum ada berkas. Unggah berkas pertama Anda lewat formulir di bawah.</p>';
      return;
    }

    const html = docs.map((d) => {
      const label = DOC_TYPE_LABELS[d.type] || d.type;
      const dateStr = d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      const reviewStatus = d.reviewStatus || 'pending';
      const statusLabel = reviewStatus === 'rejected' ? 'Perlu diunggah ulang' : reviewStatus === 'accepted' ? 'Diterima' : 'Menunggu pemeriksaan';
      const note = reviewStatus === 'rejected' && d.reviewNote ? `<small class="cs-doc__note">Catatan petugas: ${escapeHtml(d.reviewNote)}</small>` : '';
      const deleteAction = reviewStatus === 'accepted' ? '' : `<button type="button" class="cs-link doc-delete-button" data-document-id="${escapeHtml(d.id)}">Hapus</button>`;
      // Pendaftar hanya dapat membuka berkasnya sendiri: endpoint memeriksa token
      // pendaftaran terhadap pendaftaran pemilik berkas, bukan sekadar peran.
      const openAction = d.fileObjectId
        ? `<button type="button" class="cs-link doc-open-button" data-file-id="${escapeHtml(d.fileObjectId)}" data-file-name="${escapeHtml(label)}">Lihat</button>`
        : '';
      return `
        <div class="cs-doc is-${reviewStatus}">
          <div class="cs-doc__text">
            <strong>${escapeHtml(label)}</strong>
            <small>Diunggah ${escapeHtml(dateStr)}</small>${note}
          </div>
          <span class="cs-doc__status">${statusLabel}</span>
          <div class="cs-doc__actions">${openAction}${deleteAction}</div>
        </div>
      `;
    }).join('');

    docListContainer.innerHTML = html;
  }

  // Catatan petugas yang ditujukan ke pendaftar, dan langkah yang perlu dikerjakan.
  function renderNotes(notes) {
    const daftar = Array.isArray(notes) ? notes : [];
    notesCard.hidden = daftar.length === 0;
    notesBox.innerHTML = daftar.slice().reverse().map((n) => {
      const tanggal = n.createdAt ? new Date(n.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      return `<div class="cs-notes__item"><p>${escapeHtml(n.body)}</p><small>${escapeHtml(tanggal)}</small></div>`;
    }).join('');
  }

  function renderNextSteps(steps) {
    const daftar = Array.isArray(steps) ? steps : [];
    nextStepsCard.hidden = daftar.length === 0;
    nextStepsList.innerHTML = daftar.map((s) => {
      const batas = s.dueOn ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${s.dueOn}T00:00:00Z`)) : '';
      return `<li class="${s.doneAt ? 'is-done' : ''}"><span>${escapeHtml(s.title)}</span>${s.doneAt ? '<small>Selesai</small>' : batas ? `<small>Batas ${escapeHtml(batas)}</small>` : ''}</li>`;
    }).join('');
  }

  // Task R3.7. POST /api/applicant/logout tidak pernah dipanggil. Berbeda dengan
  // akun staf, endpoint ini hanya mencabut sesi yang sedang dipakai, bukan seluruh
  // perangkat, jadi labelnya ditulis apa adanya.
  const applicantSessionActions = document.querySelector('#applicant-session-actions');
  const applicantLogout = document.querySelector('#applicant-logout');
  if (applicantLogout) {
    applicantLogout.addEventListener('click', async () => {
      if (!currentToken) return;
      const setuju = window.confirm(
        'Keluar dari sesi ini?\n\nAnda perlu memasukkan nomor pendaftaran dan kode akses lagi untuk membukanya kembali.'
      );
      if (!setuju) return;
      applicantLogout.disabled = true;
      try {
        await fetch('/api/applicant/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${currentToken}` }
        });
      } catch {
        // Kegagalan jaringan tidak boleh menahan pengguna di halaman yang mengira
        // dirinya masih masuk. Sesi lokal tetap dibuang.
      }
      currentToken = '';
      currentRegId = '';
      hapusSesi();
      window.location.href = window.location.pathname;
    });
  }

  docListContainer.addEventListener('click', async (event) => {
    const openButton = event.target.closest('.doc-open-button');
    if (openButton) {
      const labelAsli = openButton.textContent;
      openButton.disabled = true;
      openButton.textContent = 'Menyiapkan...';
      try {
        await window.HamasahFileOpen.buka(openButton.dataset.fileId, {
          headers: { Authorization: `Bearer ${currentToken}` },
          nama: `${currentRegId}-${openButton.dataset.fileName}`
        });
        docUploadStatus.textContent = '';
        docUploadStatus.className = 'form-status';
      } catch (error) {
        docUploadStatus.textContent = error.message;
        docUploadStatus.className = 'form-status is-error';
      } finally {
        openButton.disabled = false;
        openButton.textContent = labelAsli;
      }
      return;
    }

    const button = event.target.closest('.doc-delete-button');
    if (!button || !currentRegId || !currentToken) return;
    if (!window.confirm('Hapus dokumen ini agar Anda dapat mengunggah versi baru?')) return;
    button.disabled = true;
    try {
      const response = await fetch(`/api/registrations/${encodeURIComponent(currentRegId)}/documents/${encodeURIComponent(button.dataset.documentId)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${currentToken}` }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Dokumen belum dapat dihapus.');
      docUploadStatus.textContent = 'Berkas dihapus. Anda bisa mengunggah versi barunya.';
      docUploadStatus.className = 'form-status is-success';
      await fetchRegistration(currentRegId, currentToken);
    } catch (error) {
      docUploadStatus.textContent = error.message;
      docUploadStatus.className = 'form-status is-error';
      button.disabled = false;
    }
  });

  // Kloter keberangkatan pendaftar. Hanya menampilkan yang diisi petugas: kloter tanpa
  // tanggal tertulis "belum ditetapkan", pendaftar tanpa kloter mendapat keterangan jujur.
  function renderDeparture(departure) {
    const box = document.querySelector('#res-departure');
    if (!box) return;
    box.replaceChildren();
    if (!departure) {
      const empty = document.createElement('p');
      empty.className = 'departure-schedule__empty';
      empty.textContent = 'Jadwal keberangkatan belum ditetapkan. Kloter dan tanggal akan diumumkan di sini setelah ditetapkan oleh tim Hamasah.';
      box.append(empty);
      return;
    }
    const tanggal = departure.plannedDate
      ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${departure.plannedDate}T00:00:00Z`))
      : 'Tanggal belum ditetapkan';
    const list = document.createElement('dl');
    list.className = 'departure-schedule__list';
    [
      ['Kloter', departure.name],
      ['Rencana berangkat', tanggal],
      ['Berangkat dari', departure.origin || 'Belum ditetapkan'],
      ['Status kloter', departure.statusLabel || departure.status]
    ].forEach(([label, value]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      row.append(dt, dd);
      list.append(row);
    });
    box.append(list);
    if (departure.note) {
      const note = document.createElement('p');
      note.className = 'departure-schedule__note';
      note.textContent = departure.note;
      box.append(note);
    }
  }

  function renderHistory(history) {
    if (!Array.isArray(history) || history.length === 0) {
      historyTimeline.innerHTML = '<li class="cs-empty">Belum ada catatan pembaruan status.</li>';
      return;
    }

    historyTimeline.innerHTML = history.slice().reverse().map((h) => {
      const dateStr = h.at ? new Date(h.at).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : '';
      return `
        <li class="cs-history__item">
          <strong>${escapeHtml(h.toLabel || h.to || 'Pembaruan')}</strong>
          <small>${escapeHtml(dateStr)}</small>
          ${h.note ? `<p>${escapeHtml(h.note)}</p>` : ''}
        </li>
      `;
    }).join('');
  }

  async function fetchRegistration(regId, token) {
    setLookupState('loading', 'Memeriksa Kode Akses dan data pendaftaran…');
    submitBtn.disabled = true;

    try {
      const res = await fetch(`/api/registrations/${encodeURIComponent(regId)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = new Error(data.error || (res.status >= 500 ? 'Layanan belum tersedia. Silakan coba lagi.' : 'Nomor registrasi atau token akses tidak valid.'));
        error.status = res.status;
        throw error;
      }

      const reg = data.registration;
      currentRegId = reg.registrationId;
      currentToken = token;
      simpanSesi(currentRegId, currentToken);

      // Fill result data
      resRegId.textContent = reg.registrationId;
      resProgram.textContent = PROGRAM_NAMES[reg.program] || reg.program || 'Program Studi Al-Azhar';
      resStatusBadge.textContent = reg.statusLabel || reg.status;
      resStatusBadge.dataset.status = reg.status;
      resName.textContent = reg.applicant && reg.applicant.applicantName ? `Atas nama ${reg.applicant.applicantName}` : '';
      if (helpWa) {
        const nomor = (helpWa.getAttribute('href').match(/wa\.me\/(\d+)/) || [])[1] || '6281288489997';
        helpWa.href = `https://wa.me/${nomor}?text=${encodeURIComponent(`Assalamu'alaikum, admin Hamasah International. Saya ingin bertanya tentang pendaftaran ${reg.registrationId}.`)}`;
      }
      
      const progress = typeof reg.progress === 'number' ? reg.progress : 15;
      resProgressPct.textContent = `${progress}%`;
      resProgressFill.style.width = `${progress}%`;

      applyProgramSteps(reg.program);
      updateStepper(reg.status, progress);
      renderDocuments(reg.documentSummary);
      renderDeparture(reg.departure || null);
      if (applicantSessionActions) applicantSessionActions.hidden = false;
      const canEdit = !['ready-for-departure', 'completed', 'cancelled'].includes(reg.status);
      applicantEditCard.hidden = !canEdit;
      if (canEdit && reg.applicant) {
        for (const [name, value] of Object.entries(reg.applicant)) {
          const field = applicantEditForm.elements.namedItem(name);
          if (field && typeof value === 'string') field.value = value;
        }
      }
      const rejected = (reg.documentSummary || []).find((documentItem) => documentItem.reviewStatus === 'rejected');
      if (rejected) {
        docTypeSelect.value = rejected.type;
        docUploadStatus.textContent = 'Ada dokumen yang perlu diperbaiki. Pilih berkas baru dengan jenis yang sama lalu unggah ulang.';
        docUploadStatus.className = 'form-status is-error';
      }
      renderHistory(reg.history);
      renderNotes(reg.notes);
      renderNextSteps(reg.nextSteps);

      resultArea.hidden = false;
      if (heroSection) heroSection.hidden = true;
      setLookupState('valid', 'Kode Akses valid. Data pendaftaran berhasil ditemukan.');
      window.scrollTo({ top: 0 });
    } catch (err) {
      resultArea.hidden = true;
      if (heroSection) heroSection.hidden = false;
      if ([401, 403, 404, 410].includes(err.status)) hapusSesi();
      setLookupState(classifyLookupError(err), err.message);
    } finally {
      submitBtn.disabled = false;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = regIdInput.value.trim().toUpperCase();
    const accessCode = tokenInput.value.trim();
    if (!id || !accessCode) {
      setLookupState('invalid', 'Nomor registrasi dan Kode Akses harus diisi.');
      return;
    }
    submitBtn.disabled = true;
    setLookupState('loading', 'Memverifikasi Kode Akses…');
    fetch('/api/applicant/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationId: id, accessCode })
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.error || (response.status >= 500 ? 'Layanan belum tersedia. Silakan coba lagi.' : 'Nomor pendaftaran atau kode akses tidak tepat.'));
        error.status = response.status;
        throw error;
      }
      await fetchRegistration(id, data.accessToken);
    }).catch((error) => {
      setLookupState(classifyLookupError(error), error.message);
      submitBtn.disabled = false;
    });
  });

  applicantEditForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentRegId || !currentToken) return;
    applicantEditStatus.textContent = 'Menyimpan perubahan...';
    applicantEditStatus.className = 'form-status';
    try {
      const response = await fetch(`/api/applicant/registrations/${encodeURIComponent(currentRegId)}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(applicantEditForm).entries()))
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || Object.values(data.errors || {})[0] || 'Perubahan belum dapat disimpan.');
      applicantEditStatus.textContent = 'Data pendaftaran berhasil diperbarui.';
      applicantEditStatus.className = 'form-status is-success';
      await fetchRegistration(currentRegId, currentToken);
    } catch (error) {
      applicantEditStatus.textContent = error.message;
      applicantEditStatus.className = 'form-status is-error';
    }
  });

  recoveryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const registrationId = regIdInput.value.trim().toUpperCase();
    const email = recoveryEmail.value.trim();
    if (!regIdInput.value.trim()) {
      recoveryEmailError.textContent = 'Isi Nomor Registrasi terlebih dahulu di bagian atas.';
      regIdInput.focus();
      return;
    }
    if (!recoveryEmail.checkValidity()) {
      recoveryEmailError.textContent = 'Masukkan email pendaftaran yang valid.';
      recoveryEmail.focus();
      return;
    }
    recoveryEmailError.textContent = '';
    recoveryStatus.textContent = 'Memproses permintaan...';
    recoveryStatus.className = 'form-status';
    try {
      const response = await fetch('/api/applicant/recovery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId, email })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Permintaan belum dapat diproses.');
      recoveryStatus.textContent = data.message || 'Jika data cocok, kode akses baru akan dikirim ke email terdaftar.';
      recoveryStatus.className = 'form-status is-success';
    } catch (error) {
      recoveryStatus.textContent = error.message;
      recoveryStatus.className = 'form-status is-error';
    }
  });

  // Foto dokumen dari HP bisa 3 sampai 5 MB. Sebelum dikirim, foto JPG/PNG di atas 800 KB
  // dikecilkan ke sisi terpanjang 2200 px dan JPEG kualitas 0,85: tulisan ijazah dan paspor
  // tetap terbaca, ukurannya biasanya di bawah 1 MB. PDF dikirim apa adanya.
  async function kecilkanFoto(file) {
    if (!/^image\/(jpeg|png)$/.test(file.type) || file.size <= 800 * 1024) return file;
    try {
      const gambar = await createImageBitmap(file);
      const skala = Math.min(1, 2200 / Math.max(gambar.width, gambar.height));
      const kanvas = document.createElement('canvas');
      kanvas.width = Math.round(gambar.width * skala);
      kanvas.height = Math.round(gambar.height * skala);
      const ctx = kanvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, kanvas.width, kanvas.height);
      ctx.drawImage(gambar, 0, 0, kanvas.width, kanvas.height);
      const blob = await new Promise((resolve) => kanvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch {
      return file;
    }
  }

  // Handle document upload
  docUploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentRegId || !currentToken) return;

    const docType = docTypeSelect.value;
    const pilihan = docFileInput.files && docFileInput.files[0];

    if (!pilihan) {
      docUploadStatus.textContent = 'Pilih berkas yang akan diunggah.';
      docUploadStatus.className = 'form-status is-error';
      return;
    }

    docUploadStatus.textContent = 'Menyiapkan berkas...';
    docUploadStatus.className = 'form-status';
    const file = await kecilkanFoto(pilihan);

    try {
      const uploadRequest = await fetch('/api/uploads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`
        },
        body: JSON.stringify({
          purpose: 'registration-document',
          entityId: currentRegId,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size
        })
      });
      const uploadData = await uploadRequest.json().catch(() => ({}));
      if (!uploadRequest.ok) throw new Error(uploadData.error || 'Tempat unggah belum dapat dibuat.');

      // Dua jalur pengiriman isi berkas. Kalau penyimpanan mendukung unggah
      // langsung, berkasnya dikirim peramban ke storage, tidak lewat server, jadi
      // tidak terhalang batas ukuran badan permintaan. Servernya tetap memeriksa
      // ukuran, tipe, dan sidik isi lewat langkah konfirmasi.
      const uploadId = encodeURIComponent(uploadData.upload.id);
      if (uploadData.directUpload) {
        docUploadStatus.textContent = 'Mengunggah berkas...';
        const tautan = await fetch(`/api/uploads/${uploadId}/direct`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const tautanData = await tautan.json().catch(() => ({}));
        if (!tautan.ok) throw new Error(tautanData.error || 'Tautan unggah belum dapat dibuat.');

        const kirim = await fetch(tautanData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file
        });
        if (!kirim.ok) throw new Error('Berkas gagal dikirim ke penyimpanan. Periksa koneksi lalu coba lagi.');

        docUploadStatus.textContent = 'Memeriksa berkas...';
        const konfirmasi = await fetch(`/api/uploads/${uploadId}/confirm`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const konfirmasiData = await konfirmasi.json().catch(() => ({}));
        if (!konfirmasi.ok) throw new Error(konfirmasiData.error || 'Berkas belum dapat diterima.');
      } else {
        const contentResponse = await fetch(`/api/uploads/${uploadId}/content`, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'Authorization': `Bearer ${currentToken}`
          },
          body: file
        });
        const contentData = await contentResponse.json().catch(() => ({}));
        if (!contentResponse.ok) throw new Error(contentData.error || 'Isi berkas belum dapat disimpan.');
      }

      const res = await fetch(`/api/registrations/${encodeURIComponent(currentRegId)}/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`
        },
        body: JSON.stringify({
          type: docType,
          fileObjectId: uploadData.upload.id
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menambahkan berkas.');
      }

      docUploadStatus.textContent = 'Berkas terunggah dan menunggu pemeriksaan petugas.';
      docUploadStatus.className = 'form-status is-success';
      docFileInput.value = '';

      // Re-fetch registration to update document list
      fetchRegistration(currentRegId, currentToken);
    } catch (err) {
      docUploadStatus.textContent = err.message;
      docUploadStatus.className = 'form-status is-error';
    }
  });

  // Datang dari beranda setelah mendaftar: ?id=... saja. Token sesi dibaca dari
  // sessionStorage yang ditulis beranda, tidak lewat URL. Tautan lama yang masih
  // membawa ?token= tetap dilayani, lalu token dihapus dari alamat halaman.
  const urlParams = new URLSearchParams(window.location.search);
  const paramId = urlParams.get('id');
  let savedSession = null;
  try {
    savedSession = JSON.parse(sessionStorage.getItem('hamasahRegistration') || 'null');
  } catch {
    savedSession = null;
  }
  const sessionToken = urlParams.get('token')
    || (savedSession && (!paramId || savedSession.registrationId === paramId) ? savedSession.accessToken : '');
  const sessionId = paramId || (savedSession && savedSession.accessToken ? savedSession.registrationId : '');
  if (urlParams.has('token')) {
    urlParams.delete('token');
    const query = urlParams.toString();
    history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }
  if (sessionId) regIdInput.value = sessionId;
  if (sessionId && sessionToken) {
    fetchRegistration(sessionId, sessionToken);
  } else if (paramId) {
    tokenInput.focus();
  }
});
