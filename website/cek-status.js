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
    statusMsg.className = `form-status ${['invalid', 'expired', 'used'].includes(state) ? 'is-error' : state === 'valid' ? 'is-success' : ''}`;
    recoveryCta.hidden = !['invalid', 'expired', 'used'].includes(state);
    if (accessTokenError) {
      accessTokenError.textContent = ['invalid', 'expired', 'used'].includes(state) ? statusMsg.textContent : '';
      tokenInput.setAttribute('aria-invalid', String(['invalid', 'expired', 'used'].includes(state)));
    }
  }

  function classifyLookupError(error) {
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

  const DOC_TYPE_LABELS = {
    'passport': 'Paspor Asli',
    'diploma': 'Ijazah Resmi',
    'transcript': 'Transkrip Nilai',
    'health-certificate': 'Surat Keterangan Sehat',
    'photo': 'Pasfoto Resmi (4x6)',
    'other': 'Dokumen Tambahan'
  };

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
      docListContainer.innerHTML = '<p class="empty-docs-note">Belum ada dokumen yang terlampir. Anda dapat mengunggah berkas menggunakan formulir di bawah.</p>';
      return;
    }

    const html = docs.map((d) => {
      const label = DOC_TYPE_LABELS[d.type] || d.type;
      const dateStr = d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      const reviewStatus = d.reviewStatus || 'pending';
      const statusLabel = reviewStatus === 'rejected' ? 'Perlu diunggah ulang' : reviewStatus === 'accepted' ? 'Diterima' : 'Menunggu review';
      const note = reviewStatus === 'rejected' && d.reviewNote ? `<small class="doc-review-note">Catatan petugas: ${escapeHtml(d.reviewNote)}</small>` : '';
      const deleteAction = reviewStatus === 'accepted' ? '' : `<button type="button" class="button button--text doc-delete-button" data-document-id="${escapeHtml(d.id)}">Hapus & unggah ulang</button>`;
      // Pendaftar hanya dapat membuka berkasnya sendiri: endpoint memeriksa token
      // pendaftaran terhadap pendaftaran pemilik berkas, bukan sekadar peran.
      const openAction = d.fileObjectId
        ? `<button type="button" class="button button--text doc-open-button" data-file-id="${escapeHtml(d.fileObjectId)}" data-file-name="${escapeHtml(label)}">Lihat berkas</button>`
        : '';
      return `
        <div class="doc-item-row">
          <div class="doc-icon-badge" aria-hidden="true"><svg class="m3-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
          <div class="doc-text">
            <strong>${label}</strong>
            <small>Diunggah: ${escapeHtml(dateStr)}</small>${note}
          </div>
          <span class="m3-chip-status ${reviewStatus === 'rejected' ? 'is-rejected' : reviewStatus === 'accepted' ? 'is-approved' : ''}">${statusLabel}</span>
          ${openAction}
          ${deleteAction}
        </div>
      `;
    }).join('');

    docListContainer.innerHTML = html;
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
      await fetchRegistration(currentRegId, currentToken);
    } catch (error) {
      docUploadStatus.textContent = error.message;
      docUploadStatus.className = 'form-status is-error';
      button.disabled = false;
    }
  });

  function renderHistory(history) {
    if (!Array.isArray(history) || history.length === 0) {
      historyTimeline.innerHTML = '<p class="empty-docs-note">Belum ada catatan pembaruan status.</p>';
      return;
    }

    const html = history.slice().reverse().map((h) => {
      const dateStr = h.at ? new Date(h.at).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : '';
      return `
        <div class="history-item">
          <div class="history-dot"></div>
          <div class="history-body">
            <div class="history-header">
            <strong>${escapeHtml(h.to || 'Pembaruan')}</strong>
            <small>${escapeHtml(dateStr)}</small>
            </div>
            <p>${escapeHtml(h.note || 'Pembaruan otomatis dari sistem pendaftaran.')}</p>
          </div>
        </div>
      `;
    }).join('');

    historyTimeline.innerHTML = html;
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

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Nomor registrasi atau token akses tidak valid.');
      }

      const reg = data.registration;
      currentRegId = reg.registrationId;
      currentToken = token;

      // Fill result data
      resRegId.textContent = reg.registrationId;
      resProgram.textContent = PROGRAM_NAMES[reg.program] || reg.program || 'Program Studi Al-Azhar';
      resStatusBadge.textContent = reg.statusLabel || reg.status;
      
      const progress = typeof reg.progress === 'number' ? reg.progress : 15;
      resProgressPct.textContent = `${progress}%`;
      resProgressFill.style.width = `${progress}%`;

      updateStepper(reg.status, progress);
      renderDocuments(reg.documentSummary);
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

      resultArea.hidden = false;
      setLookupState('valid', 'Kode Akses valid. Data pendaftaran berhasil ditemukan.');

      // Scroll smoothly to results
      resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      resultArea.hidden = true;
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
      if (!response.ok) throw new Error(data.error || 'Nomor pendaftaran atau kode akses tidak tepat.');
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

  // Handle document upload
  docUploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentRegId || !currentToken) return;

    const docType = docTypeSelect.value;
    const file = docFileInput.files && docFileInput.files[0];

    if (!file) {
      docUploadStatus.textContent = 'Pilih berkas yang akan diunggah.';
      docUploadStatus.className = 'form-status is-error';
      return;
    }

    docUploadStatus.textContent = 'Mengirim catatan berkas...';
    docUploadStatus.className = 'form-status';

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

      const contentResponse = await fetch(`/api/uploads/${encodeURIComponent(uploadData.upload.id)}/content`, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'Authorization': `Bearer ${currentToken}`
        },
        body: file
      });
      const contentData = await contentResponse.json().catch(() => ({}));
      if (!contentResponse.ok) throw new Error(contentData.error || 'Isi berkas belum dapat disimpan.');

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

      docUploadStatus.textContent = 'Berkas berhasil dicatat ke sistem!';
      docUploadStatus.className = 'form-status is-success';
      docFileInput.value = '';

      // Re-fetch registration to update document list
      fetchRegistration(currentRegId, currentToken);
    } catch (err) {
      docUploadStatus.textContent = err.message;
      docUploadStatus.className = 'form-status is-error';
    }
  });

  // Auto-fill from URL params ?id=...&token=...
  const urlParams = new URLSearchParams(window.location.search);
  const paramId = urlParams.get('id');
  const paramToken = urlParams.get('token');
  if (paramId && paramToken) {
    regIdInput.value = paramId;
    tokenInput.value = paramToken;
    fetchRegistration(paramId, paramToken);
  }
});
