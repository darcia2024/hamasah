// Menu navigasi antar halaman staf/portal, ditampilkan sesuai role akun yang login.
//
// Daftar role di sini SENGAJA disamakan persis dengan pemeriksaan akses di masing-masing
// halaman tujuan (lihat guard di portal.js/staff.js/monitoring.js/lms.js/operations.js/
// audit.js). Kalau tidak disamakan, menu ini bisa menampilkan tautan yang begitu diklik
// langsung ditolak halaman tujuannya, lebih baik tautannya memang tidak muncul sama sekali.

const ROLE_NAV_LABELS = Object.freeze({
  student: {
    portal: 'Dashboard santri',
    lms: 'Ruang belajar (LMS)'
  },
  parent: {
    portal: 'Pantau Ananda'
  },
  supervisor: {
    portal: 'Portal Utama',
    monitoring: 'Monitoring Asrama',
    lms: 'Maddah Santri'
  },
  'registration-officer': {
    portal: 'Portal Utama',
    staff: 'Pipeline Pendaftaran'
  },
  teacher: {
    portal: 'Portal Utama',
    lms: 'Kelola Maddah (LMS)'
  },
  finance: {
    portal: 'Portal Utama',
    operations: 'Keuangan & SPP'
  },
  admin: {
    portal: 'Portal Utama',
    staff: 'Pendaftaran',
    monitoring: 'Monitoring Asrama',
    lms: 'LMS Maddah',
    operations: 'Keuangan & SPP',
    audit: 'Jejak Audit'
  }
});

const ROLE_DISPLAY_NAMES = Object.freeze({
  student: 'Santri Aktif',
  parent: 'Wali Santri',
  supervisor: 'Musyrif Asrama',
  'registration-officer': 'Petugas Pendaftaran',
  teacher: 'Tenaga Pengajar / Asatidz',
  finance: 'Divisi Keuangan',
  admin: 'Super Admin'
});

const STAFF_NAV_LINKS = Object.freeze([
  {
    href: 'portal.html',
    label: 'Portal',
    page: 'portal',
    roles: null,
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>'
  },
  {
    href: 'staff.html',
    label: 'Pendaftaran',
    page: 'staff',
    roles: ['admin', 'registration-officer'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 12h6M9 16h6"/></svg>'
  },
  {
    href: 'monitoring.html',
    label: 'Monitoring',
    page: 'monitoring',
    roles: ['admin', 'supervisor'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M22 12h-4M6 12H2M12 6V2M12 22v-4"/><circle cx="12" cy="12" r="3"/></svg>'
  },
  {
    href: 'lms.html',
    label: 'LMS',
    page: 'lms',
    roles: ['admin', 'teacher', 'supervisor', 'student'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>'
  },
  {
    href: 'operations.html',
    label: 'Keuangan',
    page: 'operations',
    roles: ['admin', 'finance'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/><path d="M5 15h4M13 15h2"/></svg>'
  },
  {
    href: 'audit.html',
    label: 'Audit',
    page: 'audit',
    roles: ['admin'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
  }
]);

function getInitials(name) {
  if (!name) return 'H';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// container: elemen <nav> kosong di header atau sidebar. role: role akun yang sedang login.
// currentPage: kunci "page" pada daftar di atas, supaya tautan halaman ini ditandai
// aria-current (dipakai CSS untuk menonjolkannya).
// account: objek akun dari /api/me (opsional) untuk update badge & avatar profil CRM.
function renderStaffNav(container, role, currentPage, account) {
  if (!container) return;
  const roleLabels = ROLE_NAV_LABELS[role] || {};
  const tautan = STAFF_NAV_LINKS.filter((link) => !link.roles || link.roles.includes(role));
  container.replaceChildren(...tautan.map((link) => {
    const a = document.createElement('a');
    a.href = link.href;
    const label = roleLabels[link.page] || link.label;
    const badgeHtml = link.badge ? `<span class="crm-badge-counter crm-badge-counter--${link.badgeType}">${link.badge}</span>` : '';
    a.innerHTML = `<div class="crm-nav-link-main">${link.icon} <span>${label}</span></div>${badgeHtml}`;
    if (link.page === currentPage) {
      a.setAttribute('aria-current', 'page');
      a.classList.add('is-active');
    }
    return a;
  }));
  container.hidden = tautan.length === 0;

  // Update CRM User Profile Card if elements exist on page
  if (account) {
    updateCrmUserBadges(account);
  }
}

function updateCrmUserBadges(account) {
  const avatarEl = document.querySelector('#crm-user-avatar');
  const nameEl = document.querySelector('#crm-user-name');
  const rolePillEl = document.querySelector('#crm-user-role-pill');
  const headerRoleEl = document.querySelector('#crm-header-role');
  const topAvatarEl = document.querySelector('#crm-topbar-avatar');
  const topNameEl = document.querySelector('#crm-topbar-name');

  if (avatarEl) avatarEl.textContent = getInitials(account.name);
  if (nameEl) nameEl.textContent = account.name;
  if (topAvatarEl) topAvatarEl.textContent = getInitials(account.name);
  if (topNameEl) topNameEl.textContent = account.name;
  const displayRole = ROLE_DISPLAY_NAMES[account.role] || account.role;
  if (rolePillEl) {
    rolePillEl.textContent = displayRole;
    rolePillEl.className = `crm-user-role-pill crm-user-role-pill--${account.role}`;
  }
  if (headerRoleEl) {
    headerRoleEl.textContent = displayRole;
    headerRoleEl.className = `crm-role-chip crm-role-chip--${account.role}`;
  }
}

// ---------------------------------------------------------------------------
// Smooth Page Navigation Transitions (Multi-Page Animation)
// ---------------------------------------------------------------------------
function initPageTransitions() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  document.documentElement.classList.add('crm-page-ready');

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    if (
      href.startsWith('#') ||
      href.startsWith('javascript:') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:')
    ) {
      return;
    }

    if (link.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
      return;
    }

    if (href.startsWith('http://') || href.startsWith('https://')) {
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
      } catch {
        return;
      }
    }

    e.preventDefault();
    document.body.classList.add('crm-page-exiting');

    setTimeout(() => {
      window.location.href = href;
    }, 180);
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPageTransitions);
  } else {
    initPageTransitions();
  }
}
