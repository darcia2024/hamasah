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
  if (!response.ok) throw new Error(data.error || 'Permintaan belum dapat diproses.');
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

function attachPasswordForm({ endpoint, successMessage }) {
  const form = document.querySelector('[data-password-form]');
  const status = document.querySelector('[data-status]');
  const token = readTokenFromFragment();
  const password = form.elements.password;
  const confirmation = form.elements.confirmation;
  if (!token) {
    setStatus(status, 'Tautan tidak lengkap atau sudah tidak berlaku. Minta tautan baru.', 'error');
    form.querySelector('button').disabled = true;
    return;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (password.value.length < 12) return setStatus(status, 'Kata sandi minimal 12 karakter.', 'error');
    if (password.value !== confirmation.value) return setStatus(status, 'Konfirmasi kata sandi belum sama.', 'error');
    setSubmitting(form, true);
    setStatus(status, '');
    try {
      await requestJson(endpoint, { token, password: password.value });
      form.reset();
      setStatus(status, successMessage, 'success');
    } catch (error) {
      setStatus(status, error.message, 'error');
    } finally {
      setSubmitting(form, false);
    }
  });
}
