// Header keamanan untuk semua respons.
//
// Content Security Policy disusun dari konfigurasi, bukan ditulis sebagai satu teks
// panjang, supaya task berikutnya bisa menambahkan domain (anti-bot Turnstile,
// penyimpanan berkas, penyedia video) tanpa menyalin-tempel seluruh aturan dan
// tanpa risiko tidak sengaja melonggarkan aturan lain.

const DEFAULT_DIRECTIVES = Object.freeze({
  'default-src': Object.freeze(["'self'"]),
  'script-src': Object.freeze(["'self'"]),
  // Google Fonts menyajikan CSS dari googleapis dan berkas fontnya dari gstatic.
  'style-src': Object.freeze(["'self'", 'https://fonts.googleapis.com']),
  'font-src': Object.freeze(['https://fonts.gstatic.com']),
  'img-src': Object.freeze(["'self'", 'data:', 'blob:']),
  'connect-src': Object.freeze(["'self'"]),
  // Menolak situs lain memuat halaman ini di dalam iframe, yaitu clickjacking.
  'frame-ancestors': Object.freeze(["'none'"]),
  'base-uri': Object.freeze(["'self'"]),
  'form-action': Object.freeze(["'self'"]),
  'object-src': Object.freeze(["'none'"])
});

const ONE_YEAR_SECONDS = 31536000;

function buildContentSecurityPolicy(directives) {
  return Object.entries(directives)
    .map(([nama, nilai]) => `${nama} ${nilai.join(' ')}`)
    .join('; ');
}

// Menggabungkan sumber tambahan ke direktif yang sudah ada, tanpa menghapus yang lama.
function withSources(directives, tambahan) {
  const hasil = { ...directives };
  for (const [nama, sumber] of Object.entries(tambahan || {})) {
    const awal = hasil[nama] || [];
    hasil[nama] = [...new Set([...awal, ...sumber])];
  }
  return hasil;
}

function createSecurityHeaders({ appEnvironment = 'development', extraCspSources } = {}) {
  const isProduction = appEnvironment === 'production';
  const directives = withSources(DEFAULT_DIRECTIVES, extraCspSources);

  const base = { 'X-Content-Type-Options': 'nosniff' };
  base['Referrer-Policy'] = 'strict-origin-when-cross-origin';
  base['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()';
  base['Cross-Origin-Opener-Policy'] = 'same-origin';
  if (isProduction) {
    // Hanya di production. Di localhost header ini akan memaksa HTTPS yang tidak ada,
    // dan browser mengingatnya lama, sehingga sulit dibatalkan saat pengembangan.
    base['Strict-Transport-Security'] = `max-age=${ONE_YEAR_SECONDS}; includeSubDomains`;
  } else {
    // Staging dan dev tidak boleh muncul di mesin pencari.
    base['X-Robots-Tag'] = 'noindex, nofollow';
  }

  const document = { ...base, 'Content-Security-Policy': buildContentSecurityPolicy(directives) };

  return {
    directives,
    forApi() { return { ...base }; },
    forDocument() { return { ...document }; }
  };
}

// Dipasang lewat setHeader sebelum respons ditulis, supaya berlaku untuk semua jalur,
// termasuk 404 dan 500 yang tidak melewati helper respons.
function applyHeaders(response, headers) {
  for (const [nama, nilai] of Object.entries(headers)) {
    response.setHeader(nama, nilai);
  }
}

module.exports = {
  DEFAULT_DIRECTIVES,
  applyHeaders,
  buildContentSecurityPolicy,
  createSecurityHeaders,
  withSources
};
