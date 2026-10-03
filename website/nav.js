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
    akun: 'Kelola Akun',
    audit: 'Jejak Audit',
    pengaturan: 'Pengaturan'
  }
});

// Satu-satunya daftar nama peran yang tampil ke pengguna: chip peran, daftar akun,
// pilihan peran di formulir, dan filter Jejak Audit memakai nama dari sini.
const ROLE_DISPLAY_NAMES = Object.freeze({
  student: 'Santri',
  parent: 'Wali Santri',
  supervisor: 'Musyrif Asrama',
  'registration-officer': 'Petugas Pendaftaran',
  teacher: 'Guru / Asatidz',
  finance: 'Keuangan',
  admin: 'Super Admin'
});

// Urutan peran di pilihan formulir dan filter: staf dulu, lalu keluarga, admin terakhir.
const ROLE_ORDER = Object.freeze(['registration-officer', 'supervisor', 'teacher', 'finance', 'parent', 'student', 'admin']);

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
    href: 'akun.html',
    label: 'Kelola Akun',
    page: 'akun',
    roles: ['admin'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
  },
  {
    href: 'audit.html',
    label: 'Audit',
    page: 'audit',
    roles: ['admin'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
  },
  {
    href: 'pengaturan.html',
    label: 'Pengaturan',
    page: 'pengaturan',
    roles: ['admin'],
    badge: null,
    badgeType: null,
    icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
  }
]);

function getInitials(name) {
  if (!name) return 'H';
  // Gelar di depan (Ust., Ustzh., H., Dr., dst.) tidak ikut jadi inisial:
  // "Ust. Ridwan Fathoni" menjadi RF, bukan UF.
  const GELAR = /^(ust|ustz|ustzh|ustadz|ustadzah|ustaz|ustazah|kh|h|hj|dr|drs|prof|ir)\.?$/i;
  const semua = name.trim().split(/\s+/).filter(Boolean);
  const parts = semua.length > 1 && GELAR.test(semua[0]) ? semua.slice(1) : semua;
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

// Perpindahan antarhalaman konsol tidak lagi ditahan JavaScript. Dulu setiap klik
// tautan dicegat, halaman dipudarkan sampai kosong, lalu baru pindah 180 ms kemudian,
// sehingga setiap pindah menu terasa memuat. Transisinya kini ditangani browser lewat
// View Transitions di portal.css, dan halaman tujuan disiapkan lebih dulu lewat
// Speculation Rules (server/http/speculation-rules.js).
