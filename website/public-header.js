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
    if ((samePage && !url.hash) || articleDetail || sameSection) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
  });

  // Tautan ke bagian di halaman yang sama (di beranda: Program, Tentang) disorot sesuai
  // bagian yang sedang ada di tengah layar. Di luar bagian itu, tidak ada yang disorot.
  const sectionLinks = navLinks
    .map((link) => ({ link, hash: new URL(link.href, window.location.href).hash }))
    .filter(({ link, hash }) => {
      const linkPath = new URL(link.href, window.location.href).pathname.split('/').pop() || 'index.html';
      return hash && linkPath === currentPath && document.getElementById(hash.slice(1));
    });
  if (sectionLinks.length && 'IntersectionObserver' in window) {
    const terlihat = new Set();
    const sorot = () => {
      const aktif = sectionLinks.find(({ hash }) => terlihat.has(hash.slice(1)));
      sectionLinks.forEach((item) => {
        const nyala = item === aktif;
        item.link.classList.toggle('is-active', nyala);
        if (nyala) item.link.setAttribute('aria-current', 'location');
        else item.link.removeAttribute('aria-current');
      });
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) terlihat.add(entry.target.id);
        else terlihat.delete(entry.target.id);
      });
      sorot();
    }, { rootMargin: '-45% 0px -50% 0px' });
    sectionLinks.forEach(({ hash }) => observer.observe(document.getElementById(hash.slice(1))));
  }

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

// Animasi saat scroll: blok di bawah layar pertama muncul naik perlahan ketika masuk
// layar. Blok yang sudah terlihat saat halaman dibuka tidak disentuh; bagian pertama
// dianimasikan CSS. Isi daftar dan grid muncul bergiliran. Setelah selesai, kelasnya
// dilepas supaya efek hover kartu (transform) bekerja lagi.
(function initScrollReveal() {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const main = document.querySelector('main');
  if (!main) return;
  // Halaman baca artikel tidak dianimasikan: pembaca datang untuk membaca, dan isinya satu
  // blok panjang.
  if (main.classList.contains('story-page')) return;

  // Wadah yang anak-anaknya muncul satu per satu.
  const GROUPS = [
    '.lp-paths', '.lp-steps', '.lp-days__list', '.lp-portal__list', '.lp-mission', '.lp-checks',
    '.pricing-cards-grid', '.breakdown-grid', '.biaya-faq-grid', '.biaya-trust-grid',
    '.offices-cards-grid', '.articles-catalog-grid', '.pena-list'
  ].join(', ');
  // Blok teks yang barisnya (eyebrow, judul, paragraf) muncul bergiliran.
  const COPY = 'header, .lp-head, .section-heading, .section-intro, .lp-split__copy, .lp-register__copy, .subscribe-text, div:not([class])';

  const targets = [];
  const add = (element, index) => {
    targets.push(element);
    element.style.setProperty('--reveal-delay', `${Math.min(index, 5) * 90}ms`);
  };

  main.querySelectorAll(':scope > section:not(:first-child), :scope > article, :scope > div').forEach((section) => {
    const shell = section.querySelector(':scope > .shell') || section;
    Array.from(shell.children).forEach((block, blockIndex) => {
      if (block.matches(GROUPS)) {
        Array.from(block.children).forEach((item, index) => add(item, index));
      } else if (block.matches(COPY) && block.children.length > 1 && block.children.length <= 8) {
        Array.from(block.children).forEach((line, index) => add(line, index));
      } else {
        add(block, blockIndex);
      }
    });
  });

  const fold = window.innerHeight;
  const pending = targets.filter((element) => {
    if (getComputedStyle(element).display === 'none') return false;
    const kotak = element.getBoundingClientRect();
    // Blok yang lebih tinggi dari layar tidak dianimasikan. Ambang 8% dari tingginya bisa
    // melebihi tinggi layar, sehingga blok itu tidak akan pernah muncul.
    if (kotak.height > fold) return false;
    return kotak.top > fold * 0.9;
  });
  if (!pending.length) return;

  const finish = (element) => {
    element.classList.remove('reveal', 'is-revealed');
    element.style.removeProperty('--reveal-delay');
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const element = entry.target;
      observer.unobserve(element);
      element.classList.add('is-revealed');
      element.addEventListener('transitionend', function onEnd(event) {
        if (event.target !== element || event.propertyName !== 'transform') return;
        element.removeEventListener('transitionend', onEnd);
        finish(element);
      });
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  pending.forEach((element) => {
    element.classList.add('reveal');
    observer.observe(element);
  });
})();

// Daftar yang dilipat supaya halaman tidak panjang di ponsel (fasilitas tiap program dan
// tanya-jawab biaya) langsung terbuka di layar lebar, tempat ruangnya cukup.
(function bukaLipatanDiLayarLebar() {
  if (!window.matchMedia('(min-width: 769px)').matches) return;
  document.querySelectorAll('details[data-buka-desktop]').forEach((lipatan) => { lipatan.open = true; });
})();
