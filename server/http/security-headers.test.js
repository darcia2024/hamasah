const assert = require('node:assert/strict');
const { buildContentSecurityPolicy, createSecurityHeaders, withSources } = require('./security-headers.js');

function run() {
  const dev = createSecurityHeaders({ appEnvironment: 'development' });
  const produksi = createSecurityHeaders({ appEnvironment: 'production' });
  const staging = createSecurityHeaders({ appEnvironment: 'staging' });

  for (const nama of ['X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'Cross-Origin-Opener-Policy']) {
    assert.ok(produksi.forApi()[nama], `${nama} harus ada di respons API.`);
    assert.ok(produksi.forDocument()[nama], `${nama} harus ada di respons halaman.`);
  }
  assert.equal(produksi.forApi()['X-Content-Type-Options'], 'nosniff');
  assert.equal(produksi.forApi()['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(produksi.forApi()['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()');

  // HSTS hanya di production. Di localhost header ini memaksa HTTPS yang tidak ada,
  // dan browser mengingatnya lama sehingga sulit dibatalkan.
  assert.equal(produksi.forApi()['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');
  assert.equal(dev.forApi()['Strict-Transport-Security'], undefined);
  assert.equal(staging.forApi()['Strict-Transport-Security'], undefined);

  // Selain production tidak boleh terindeks mesin pencari.
  assert.equal(dev.forApi()['X-Robots-Tag'], 'noindex, nofollow');
  assert.equal(staging.forApi()['X-Robots-Tag'], 'noindex, nofollow');
  assert.equal(produksi.forApi()['X-Robots-Tag'], undefined);

  // CSP hanya dipasang pada respons halaman.
  assert.equal(produksi.forApi()['Content-Security-Policy'], undefined);
  const csp = produksi.forDocument()['Content-Security-Policy'];
  for (const potongan of [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
  ]) {
    assert.ok(csp.includes(potongan), `CSP kehilangan bagian: ${potongan}`);
  }

  // Menambah sumber tidak boleh menghapus yang sudah ada. Ini dipakai task
  // berikutnya untuk anti-bot, penyimpanan berkas, dan penyedia video.
  const ditambah = createSecurityHeaders({
    appEnvironment: 'production',
    extraCspSources: { 'script-src': ['https://challenges.cloudflare.com'], 'frame-src': ['https://challenges.cloudflare.com'] }
  });
  const cspTambahan = ditambah.forDocument()['Content-Security-Policy'];
  assert.ok(cspTambahan.includes("script-src 'self' https://challenges.cloudflare.com"));
  assert.ok(cspTambahan.includes('frame-src https://challenges.cloudflare.com'));
  assert.ok(cspTambahan.includes("object-src 'none'"), 'Direktif lain tidak boleh hilang saat menambah sumber.');

  // Sumber yang sama tidak digandakan.
  const kembar = withSources({ 'script-src': ["'self'"] }, { 'script-src': ["'self'", 'https://contoh.test'] });
  assert.deepEqual(kembar['script-src'], ["'self'", 'https://contoh.test']);

  assert.equal(buildContentSecurityPolicy({ 'default-src': ["'self'"], 'object-src': ["'none'"] }), "default-src 'self'; object-src 'none'");

  // Objek yang dikembalikan harus salinan, supaya satu respons tidak bisa
  // mengubah header untuk respons berikutnya.
  const pertama = produksi.forApi();
  pertama['X-Content-Type-Options'] = 'diubah';
  assert.equal(produksi.forApi()['X-Content-Type-Options'], 'nosniff');

  console.log('security headers tests passed');
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
