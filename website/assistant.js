// Asisten mengambang di landing page. Menjawab dari isi situs lewat POST /api/assistant/ask
// (server/site-assistant.js). Semua teks dari pengguna dan server dipasang lewat textContent;
// hanya ikon statis yang memakai innerHTML.
(function initSiteAssistant() {
  // Nomor diisi server lewat <meta name="hamasah-whatsapp"> (bisa diubah di Konten Website).
const WHATSAPP_URL = `https://wa.me/${(document.querySelector('meta[name="hamasah-whatsapp"]') || {}).content || '6287897591978'}`;
  const SUGGESTIONS = [
    'Berapa biayanya, bisa dicicil?',
    'Syarat daftar kuliah apa saja?',
    "Ma'had untuk usia berapa?",
    'Apa itu Tahdid Mustawa?'
  ];
  const ICONS = {
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>'
  };

  const root = document.createElement('div');
  root.className = 'assistant';

  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'assistant__launcher';
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'assistant-panel');
  launcher.innerHTML = `${ICONS.chat}<span>Tanya Hamasah</span>`;

  const panel = document.createElement('section');
  panel.className = 'assistant__panel';
  panel.id = 'assistant-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Asisten Hamasah');

  const header = document.createElement('header');
  header.className = 'assistant__header';
  const titleWrap = document.createElement('div');
  const title = document.createElement('p');
  title.className = 'assistant__title';
  title.textContent = 'Asisten Hamasah';
  const subtitle = document.createElement('p');
  subtitle.className = 'assistant__subtitle';
  subtitle.textContent = 'Jawaban otomatis dari informasi di website ini';
  titleWrap.append(title, subtitle);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'assistant__close';
  closeButton.setAttribute('aria-label', 'Tutup asisten');
  closeButton.innerHTML = ICONS.close;
  header.append(titleWrap, closeButton);

  const log = document.createElement('div');
  log.className = 'assistant__log';
  log.setAttribute('aria-live', 'polite');

  const chips = document.createElement('div');
  chips.className = 'assistant__chips';

  const form = document.createElement('form');
  form.className = 'assistant__form';
  form.method = 'post';
  const input = document.createElement('input');
  input.type = 'text';
  input.name = 'question';
  input.maxLength = 300;
  input.autocomplete = 'off';
  input.placeholder = 'Tulis pertanyaan Anda...';
  input.setAttribute('aria-label', 'Pertanyaan untuk asisten');
  const sendButton = document.createElement('button');
  sendButton.type = 'submit';
  sendButton.className = 'assistant__send';
  sendButton.setAttribute('aria-label', 'Kirim pertanyaan');
  sendButton.innerHTML = ICONS.send;
  form.append(input, sendButton);

  const footer = document.createElement('p');
  footer.className = 'assistant__footer';
  const footerLink = document.createElement('a');
  footerLink.href = WHATSAPP_URL;
  footerLink.target = '_blank';
  footerLink.rel = 'noopener';
  footerLink.textContent = 'chat admin di WhatsApp';
  footer.append('Jangan tulis data pribadi di sini. Butuh jawaban pribadi? ', footerLink);

  panel.append(header, log, chips, form, footer);
  root.append(panel, launcher);
  document.body.append(root);

  // Saklar "Asisten di website" di halaman Pengaturan: bila dimatikan, tombolnya tidak
  // ditampilkan. Bila gagal dibaca, tombol tetap ada dan server yang menolak.
  fetch('/api/settings/public')
    .then((response) => (response.ok ? response.json() : null))
    .then((pengaturan) => {
      if (pengaturan && pengaturan.asisten && pengaturan.asisten.situs === false) root.remove();
    })
    .catch(() => {});

  function addMessage(role, text, extras = {}) {
    const bubble = document.createElement('div');
    bubble.className = `assistant__msg assistant__msg--${role}`;
    const body = document.createElement('p');
    body.textContent = text;
    bubble.append(body);
    if (extras.sources && extras.sources.length) {
      const sources = document.createElement('p');
      sources.className = 'assistant__sources';
      sources.append('Selengkapnya: ');
      extras.sources.forEach((source, index) => {
        const link = document.createElement('a');
        link.href = source.url;
        link.textContent = source.title;
        if (index) sources.append(', ');
        sources.append(link);
      });
      bubble.append(sources);
    }
    if (extras.handoff) {
      const handoff = document.createElement('a');
      handoff.className = 'assistant__handoff';
      handoff.href = extras.whatsapp || WHATSAPP_URL;
      handoff.target = '_blank';
      handoff.rel = 'noopener';
      handoff.textContent = 'Tanya admin lewat WhatsApp';
      bubble.append(handoff);
    }
    log.append(bubble);
    log.scrollTop = log.scrollHeight;
    return bubble;
  }

  function renderChips() {
    chips.replaceChildren();
    SUGGESTIONS.forEach((suggestion) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'assistant__chip';
      chip.textContent = suggestion;
      chip.addEventListener('click', () => askQuestion(suggestion));
      chips.append(chip);
    });
  }

  // Riwayat singkat untuk pertanyaan lanjutan. Hanya tersimpan di halaman ini, hilang saat dimuat ulang.
  const history = [];
  let busy = false;
  async function askQuestion(question) {
    const text = String(question || '').trim();
    if (!text || busy) return;
    busy = true;
    chips.hidden = true;
    addMessage('user', text);
    const typing = addMessage('bot', 'Mencari jawaban...');
    typing.classList.add('is-typing');
    try {
      const response = await fetch('/api/assistant/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, history: history.slice(-6) })
      });
      const result = await response.json().catch(() => ({}));
      typing.remove();
      if (result.nonaktif) {
        addMessage('bot', result.error || 'Asisten sedang tidak aktif. Silakan chat admin di WhatsApp.', { handoff: true });
      } else if (response.status === 429) {
        addMessage('bot', 'Pertanyaannya banyak sekali dalam waktu singkat. Coba lagi beberapa menit lagi, atau chat admin di WhatsApp.', { handoff: true });
      } else if (!response.ok || !result.answer) {
        addMessage('bot', 'Maaf, asisten sedang tidak bisa menjawab. Silakan chat admin di WhatsApp.', { handoff: true });
      } else {
        addMessage('bot', result.answer, result);
        history.push({ role: 'user', text }, { role: 'assistant', text: result.answer });
      }
    } catch {
      typing.remove();
      addMessage('bot', 'Koneksi terputus. Periksa internet Anda lalu coba lagi.');
    } finally {
      busy = false;
    }
  }

  let greeted = false;
  function open() {
    panel.hidden = false;
    root.classList.add('is-open');
    launcher.setAttribute('aria-expanded', 'true');
    if (!greeted) {
      greeted = true;
      addMessage('bot', "Assalamu'alaikum. Saya asisten otomatis Hamasah International. Tanyakan soal program Kuliah, Ma'had, kelas daring, biaya, syarat, atau alur pendaftaran.");
      renderChips();
    }
    input.focus();
  }

  function close() {
    panel.hidden = true;
    root.classList.remove('is-open');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus();
  }

  launcher.addEventListener('click', () => (panel.hidden ? open() : close()));
  closeButton.addEventListener('click', close);
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = input.value;
    input.value = '';
    askQuestion(question);
  });
})();
