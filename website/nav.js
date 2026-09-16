// Menu navigasi antar halaman staf/portal, ditampilkan sesuai role akun yang login.
//
// Daftar role di sini SENGAJA disamakan persis dengan pemeriksaan akses di masing-masing
// halaman tujuan (lihat guard di portal.js/staff.js/monitoring.js/lms.js/operations.js/
// audit.js). Kalau tidak disamakan, menu ini bisa menampilkan tautan yang begitu diklik
// langsung ditolak halaman tujuannya — lebih baik tautannya memang tidak muncul sama sekali.
const STAFF_NAV_LINKS = Object.freeze([
  { href: 'portal.html', label: 'Portal', page: 'portal', roles: null },
  { href: 'staff.html', label: 'Pendaftaran', page: 'staff', roles: ['admin', 'registration-officer'] },
  { href: 'monitoring.html', label: 'Monitoring', page: 'monitoring', roles: ['admin', 'supervisor'] },
  { href: 'lms.html', label: 'LMS', page: 'lms', roles: ['admin', 'teacher', 'supervisor', 'student'] },
  { href: 'operations.html', label: 'Keuangan', page: 'operations', roles: ['admin', 'finance'] },
  { href: 'audit.html', label: 'Audit', page: 'audit', roles: ['admin'] }
]);

// container: elemen <nav> kosong di header. role: role akun yang sedang login.
// currentPage: kunci "page" pada daftar di atas, supaya tautan halaman ini ditandai
// aria-current (dipakai CSS untuk menonjolkannya).
function renderStaffNav(container, role, currentPage) {
  if (!container) return;
  const tautan = STAFF_NAV_LINKS.filter((link) => !link.roles || link.roles.includes(role));
  container.replaceChildren(...tautan.map((link) => {
    const a = document.createElement('a');
    a.href = link.href;
    a.textContent = link.label;
    if (link.page === currentPage) a.setAttribute('aria-current', 'page');
    return a;
  }));
  container.hidden = tautan.length === 0;
}
