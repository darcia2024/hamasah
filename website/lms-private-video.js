// Native media controls with account-checked, same-origin video delivery.
(function () {
  function node(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  function buat({ fileId, title, headers }) {
    const root = node('div', 'lms-private-player'), frame = node('div', 'lms-video');
    const video = node('video'); video.controls = true; video.playsInline = true; video.preload = 'metadata';
    video.setAttribute('controlsList', 'nodownload noremoteplayback'); video.disableRemotePlayback = true;
    video.setAttribute('aria-label', title || 'Video pertemuan');
    const status = node('p', 'lms-private-player__status', 'Menyiapkan video…'); status.setAttribute('role', 'status');
    const bar = node('div', 'lms-player-tools'); bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Kontrol video pembelajaran');
    function button(text, label, action) { const b = node('button', '', text); b.type = 'button'; b.setAttribute('aria-label', label); b.addEventListener('click', action); bar.append(b); return b; }
    const seek = delta => { if (Number.isFinite(video.duration)) video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + delta)); };
    button('−10 dtk', 'Mundur 10 detik', () => seek(-10));
    button('+10 dtk', 'Maju 10 detik', () => seek(10));
    const speed = node('select'); speed.setAttribute('aria-label', 'Kecepatan video');
    [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].forEach(n => { const opt = node('option', '', `${n}×`); opt.value = n; opt.selected = n === 1; speed.append(opt); });
    speed.addEventListener('change', () => { video.playbackRate = Number(speed.value); }); bar.append(speed);
    if (document.pictureInPictureEnabled) button('Jendela kecil', 'Buka video dalam picture-in-picture', async () => {
      try { if (document.pictureInPictureElement === video) await document.exitPictureInPicture(); else await video.requestPictureInPicture(); } catch { status.textContent = 'Putar video terlebih dahulu untuk membuka jendela kecil.'; }
    });
    const retry = button('Coba lagi', 'Muat ulang video', load); retry.hidden = true;
    async function load() {
      retry.hidden = true; status.textContent = 'Menyiapkan video…';
      try {
        const response = await fetch(`/api/course-videos/${encodeURIComponent(fileId)}/session`, { method: 'POST', headers: headers(), credentials: 'same-origin' });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Video belum bisa dibuka.');
        if (!root.isConnected) return;
        video.src = result.src; video.load(); status.textContent = '';
      } catch (error) { status.textContent = error.message; retry.hidden = false; }
    }
    video.addEventListener('error', () => { status.textContent = 'Video belum dapat diputar. Coba lagi atau hubungi pengajar jika format videonya tidak didukung.'; retry.hidden = false; });
    video.addEventListener('keydown', e => {
      if (e.target !== video || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key.toLowerCase() === 'k') { e.preventDefault(); if (video.paused) video.play().catch(()=>{}); else video.pause(); }
      else if (e.key.toLowerCase() === 'j') { e.preventDefault(); seek(-10); }
      else if (e.key.toLowerCase() === 'l') { e.preventDefault(); seek(10); }
      else if (e.key.toLowerCase() === 'm') { e.preventDefault(); video.muted = !video.muted; }
      else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (document.fullscreenElement) document.exitFullscreen?.().catch(()=>{});
        else if (video.requestFullscreen) video.requestFullscreen().catch(()=>{});
        else video.webkitEnterFullscreen?.();
      }
    });
    frame.append(video); root.append(frame, bar, status);
    // The containing view mounts the element synchronously before this request resolves.
    load(); return root;
  }
  window.HamasahLmsPrivateVideo = Object.freeze({ buat });
})();
