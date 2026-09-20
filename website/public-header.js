(function initPublicHeader() {
  const menuButton = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('.site-nav');
  if (!menuButton || !navigation) return;

  const navLinks = Array.from(navigation.querySelectorAll('a'));
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const currentHash = window.location.hash;

  navLinks.forEach((link) => {
    const url = new URL(link.href, window.location.href);
    const linkPath = url.pathname.split('/').pop() || 'index.html';
    const samePage = linkPath === currentPath;
    const articleDetail = currentPath === 'article.html' && linkPath === 'articles.html';
    const sameSection = samePage && url.hash && url.hash === currentHash;
    const isIndexProgram = currentPath === 'index.html' && url.hash === '#program' && (!currentHash || currentHash === '#beranda');
    if ((samePage && !url.hash) || articleDetail || sameSection || isIndexProgram) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
  });

  function closeMenu({ returnFocus = false } = {}) {
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Buka menu navigasi');
    navigation.classList.remove('is-open');
    document.body.classList.remove('menu-open');
    if (returnFocus) menuButton.focus();
  }

  function openMenu() {
    menuButton.setAttribute('aria-expanded', 'true');
    menuButton.setAttribute('aria-label', 'Tutup menu navigasi');
    navigation.classList.add('is-open');
    document.body.classList.add('menu-open');
    const firstLink = navigation.querySelector('a');
    if (firstLink && window.matchMedia('(max-width: 768px)').matches) firstLink.focus();
  }

  menuButton.addEventListener('click', () => {
    const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
    if (isOpen) closeMenu();
    else openMenu();
  });
  navLinks.forEach((link) => link.addEventListener('click', () => closeMenu()));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      closeMenu({ returnFocus: true });
    }
  });
  document.addEventListener('click', (event) => {
    if (menuButton.getAttribute('aria-expanded') !== 'true') return;
    if (!navigation.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
  });
})();
