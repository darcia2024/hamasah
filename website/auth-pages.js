function readTokenFromFragment() {
  return new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
}

async function requestJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Permintaan belum dapat diproses.');
    error.code = data.code || '';
    error.status = response.status;
    throw error;
  }
  return data;
}

function setStatus(element, message, kind) {
  element.textContent = message;
  element.dataset.kind = kind || '';
}

function setSubmitting(form, submitting) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = submitting;
  button.textContent = submitting ? 'Memproses…' : button.dataset.label;
}

function classifyTokenError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  if (code.includes('expired') || message.includes('kedaluwarsa') || message.includes('expired')) return 'expired';
  if (code.includes('used') || code.includes('consumed') || message.includes('sudah digunakan') || message.includes('already used')) return 'used';
  return 'invalid';
}

function initPasswordToggles() {
  document.querySelectorAll('[data-password-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      button.textContent = visible ? 'Tampilkan' : 'Sembunyikan';
      button.setAttribute('aria-label', visible ? 'Tampilkan kata sandi' : 'Sembunyikan kata sandi');
    });
  });
}

function renderTokenState(state, message) {
  const box = document.querySelector('[data-token-state]');
  const form = document.querySelector('[data-password-form]');
  if (!box) return;
  const title = box.querySelector('[data-token-state-title]');
  const copy = box.querySelector('[data-token-state-message]');
  const recovery = box.querySelector('.token-recovery-link');
  const labels = {
    loading: ['Memeriksa tautan…', 'Tautan sedang diperiksa.'],
    valid: ['Tautan siap digunakan', 'Buat kata sandi baru untuk melanjutkan.'],
    invalid: ['Tautan tidak valid', 'Tautan ini tidak dikenali. Minta tautan baru sebelum membuat kata sandi.'],
    expired: ['Tautan sudah kedaluwarsa', 'Minta tautan baru agar dapat membuat kata sandi.'],
    used: ['Tautan sudah digunakan', 'Tautan hanya dapat digunakan sekali. Minta tautan baru bila perlu.'],
    success: ['Berhasil', 'Kata sandi sudah disimpan.']
  };
  const fallback = labels[state] || labels.invalid;
  box.dataset.tokenState = state;
  if (title) title.textContent = fallback[0];
  if (copy) copy.textContent = message || fallback[1];
  if (recovery) recovery.hidden = !['invalid', 'expired', 'used'].includes(state);
  if (form) form.hidden = !['valid', 'loading'].includes(state) || state === 'loading';
}

function attachPasswordForm({ endpoint, successMessage, successRedirect }) {
  const form = document.querySelector('[data-password-form]');
  const status = document.querySelector('[data-status]');
  const token = readTokenFromFragment();
  const password = form.elements.password;
  const confirmation = form.elements.confirmation;
  if (!token) {
    renderTokenState('invalid');
    setStatus(status, 'Tautan tidak ditemukan. Minta tautan baru sebelum membuat kata sandi.', 'error');
    return;
  }
  renderTokenState('valid');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (password.value.length < 12) return setStatus(status, 'Kata sandi minimal 12 karakter.', 'error');
    if (password.value !== confirmation.value) return setStatus(status, 'Konfirmasi kata sandi belum sama.', 'error');
    setSubmitting(form, true);
    renderTokenState('loading');
    setStatus(status, '');
    try {
      const result = await requestJson(endpoint, { token, password: password.value });
      form.reset();
      renderTokenState('success');
      setStatus(status, successMessage, 'success');
      if (successRedirect) {
        window.setTimeout(() => { window.location.assign(successRedirect); }, 1200);
      }
    } catch (error) {
      renderTokenState(classifyTokenError(error), error.message);
      setStatus(status, error.message, 'error');
    } finally {
      setSubmitting(form, false);
    }
  });
}

function attachForgotPasswordForm() {
  const form = document.querySelector('#forgot-password-form');
  const status = document.querySelector('[data-status]');
  if (!form || !status) return;
  const email = form.elements.email;
  const emailError = document.querySelector('#forgot-email-error');
  const setEmailError = (message) => {
    email.setAttribute('aria-invalid', String(Boolean(message)));
    if (emailError) emailError.textContent = message || '';
  };
  email.addEventListener('input', () => setEmailError(''));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!email.checkValidity()) {
      setEmailError('Masukkan alamat email yang valid.');
      email.focus();
      return;
    }
    setEmailError('');
    setSubmitting(form, true);
    setStatus(status, '');
    try {
      const data = await requestJson('/api/auth/password-reset-request', { email: form.elements.email.value });
      form.reset();
      setStatus(status, data.message, 'success');
    } catch (error) {
      setStatus(status, error.message, 'error');
    } finally {
      setSubmitting(form, false);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initPasswordToggles();
  const page = document.body;
  if (page.dataset.passwordEndpoint) {
    attachPasswordForm({
      endpoint: page.dataset.passwordEndpoint,
      successMessage: page.dataset.passwordSuccess || 'Kata sandi berhasil diperbarui.',
      successRedirect: page.dataset.passwordRedirect || ''
    });
  }
  if (page.hasAttribute('data-forgot-password')) attachForgotPasswordForm();
});
