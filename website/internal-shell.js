(function initInternalShell() {
  const shell = document.querySelector('.crm-shell');
  const sidebar = document.querySelector('#crm-sidebar');
  const topbar = document.querySelector('.crm-topbar');
  if (!shell || !sidebar || !topbar) return;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'crm-drawer-toggle';
  toggle.setAttribute('aria-controls', 'crm-sidebar');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Buka navigasi samping');
  toggle.innerHTML = '<span aria-hidden="true">☰</span><span class="crm-drawer-toggle-label">Menu</span>';
  topbar.prepend(toggle);

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'crm-drawer-backdrop';
  backdrop.setAttribute('aria-label', 'Tutup navigasi samping');
  shell.append(backdrop);

  const focusables = () => Array.from(sidebar.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.disabled && el.offsetParent !== null);
  const isMobile = () => window.matchMedia('(max-width: 800px)').matches;

  function closeDrawer({ returnFocus = false } = {}) {
    shell.classList.remove('is-drawer-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Buka navigasi samping');
    sidebar.removeAttribute('aria-modal');
    sidebar.setAttribute('aria-hidden', isMobile() ? 'true' : 'false');
    document.body.classList.remove('crm-drawer-open');
    if (returnFocus) toggle.focus();
  }

  function openDrawer() {
    if (!isMobile()) return;
    shell.classList.add('is-drawer-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Tutup navigasi samping');
    sidebar.setAttribute('aria-hidden', 'false');
    sidebar.setAttribute('aria-modal', 'true');
    document.body.classList.add('crm-drawer-open');
    const first = focusables()[0];
    if (first) first.focus();
  }

  toggle.addEventListener('click', () => {
    if (toggle.getAttribute('aria-expanded') === 'true') closeDrawer();
    else openDrawer();
  });
  backdrop.addEventListener('click', () => closeDrawer({ returnFocus: true }));
  sidebar.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeDrawer();
  });
  document.addEventListener('keydown', (event) => {
    if (toggle.getAttribute('aria-expanded') !== 'true') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer({ returnFocus: true });
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  window.addEventListener('resize', () => {
    if (!isMobile()) closeDrawer();
  });
  sidebar.setAttribute('aria-hidden', isMobile() ? 'true' : 'false');
})();
