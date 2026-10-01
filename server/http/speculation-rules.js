// Speculation Rules untuk halaman konsol (Chrome, Edge, dan browser berbasis Chromium).
//
// HTML halaman konsol yang ada di menu diambil lebih awal begitu sebuah halaman konsol
// terbuka. Saat penunjuk berhenti di atas tautan menu, atau jari mulai menekannya,
// browser menyiapkan halaman tujuan lengkap dengan datanya di belakang layar, jadi
// begitu diklik halaman langsung tampil. Browser lain mengabaikan aturan ini.
//
// Aturan dikirim lewat header Speculation-Rules yang menunjuk ke berkas JSON, bukan
// lewat <script type="speculationrules"> sebaris, karena CSP melarang skrip sebaris.
// Membuka halaman konsol tidak mencatat apa pun di audit dan hanya membaca data, jadi
// halaman yang disiapkan lalu tidak jadi dibuka tidak meninggalkan jejak palsu.

const CONSOLE_PAGES = Object.freeze(['portal', 'staff', 'monitoring', 'operations', 'lms', 'audit', 'pengaturan']);
const CONSOLE_PATH = /^\/(?:website\/)?(?:portal|staff|monitoring|operations|lms|audit|pengaturan)\.html$/;
const RULES_PATH = '/konsol-spekulasi.json';
const CONTENT_TYPE = 'application/speculationrules+json';
// Nilai header berupa daftar string terstruktur (RFC 8941), jadi wajib berkutip.
const HEADER_VALUE = `"${RULES_PATH}"`;

const HREF_PATTERNS = Object.freeze(CONSOLE_PAGES.flatMap((page) => [`/${page}.html`, `/website/${page}.html`]));

// Tautan ke halaman yang sedang dibuka (aria-current) tidak perlu disiapkan.
const CONSOLE_LINKS = Object.freeze({
  and: [
    { href_matches: HREF_PATTERNS },
    { not: { selector_matches: '[aria-current]' } }
  ]
});

const RULES = Object.freeze({
  prefetch: [{ source: 'document', where: CONSOLE_LINKS, eagerness: 'immediate' }],
  prerender: [{ source: 'document', where: CONSOLE_LINKS, eagerness: 'moderate' }]
});

function isConsolePage(pathname) {
  return CONSOLE_PATH.test(pathname);
}

function isRulesPath(pathname) {
  return pathname === RULES_PATH || pathname === `/website${RULES_PATH}`;
}

function rulesJson() {
  return JSON.stringify(RULES);
}

module.exports = { CONTENT_TYPE, HEADER_VALUE, RULES, RULES_PATH, isConsolePage, isRulesPath, rulesJson };
