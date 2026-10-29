const { json, publicError } = require('../http/respond.js');
const { ACTIONS } = require('../audit-service.js');

// Toko kelas daring (kelas.html). Logika di server/course-shop-service.js.
// Alamat website learning terpisah (pengaturan kelas.websiteBelajar). Hanya https yang dipakai; selain itu dianggap tidak diatur.
async function websiteBelajar(services) {
  if (!services.settingsService) return '';
  const nilai = String(await services.settingsService.ambil('kelas.websiteBelajar') || '').trim();
  try { return new URL(nilai).protocol === 'https:' ? nilai : ''; } catch { return ''; }
}

function dialihkan(response, alamat) {
  json(response, 409, { error: 'Kelas berbayar untuk umum kini dilayani di website learning terpisah. LMS ini khusus santri Hamasah.', code: 'dialihkan', redirectUrl: alamat });
}

module.exports = [
  // Katalog publik: kelas yang diterbitkan admin beserta harganya.
  {
    method: 'GET',
    pattern: /^\/api\/kelas$/,
    async handler({ response, services }) {
      json(response, 200, { items: await services.courseShop.catalog(), redirectUrl: (await websiteBelajar(services)) || null });
    }
  },

  // Daftar akun pembeli lalu langsung masuk. Dibatasi per IP seperti formulir publik lain.
  {
    method: 'POST',
    pattern: /^\/api\/kelas\/daftar$/,
    rateLimit: { rule: 'learner-signup', identity: ({ ip }) => ip },
    async handler({ response, services, readBody, ip }) {
      const alamat = await websiteBelajar(services);
      if (alamat) { dialihkan(response, alamat); return; }
      const hasil = await services.courseShop.signup(await readBody());
      if (!hasil.ok) {
        json(response, 422, { error: hasil.error, field: hasil.field || null });
        return;
      }
      await services.auditService.record({
        action: ACTIONS.LEARNER_SIGNED_UP, actor: hasil.value.account, ip,
        entityType: 'account', entityId: hasil.value.account.id
      });
      json(response, 201, { accessToken: hasil.value.accessToken, account: hasil.value.account });
    }
  },

  {
    method: 'GET',
    pattern: /^\/api\/kelas\/saya$/,
    permission: 'shop.buy',
    async handler({ response, services, auth }) {
      const hasil = await services.courseShop.myOverview(await auth.actor());
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? hasil.value : publicError(hasil));
    }
  },

  {
    method: 'POST',
    pattern: /^\/api\/kelas\/([\w-]+)\/beli$/,
    permission: 'shop.buy',
    async handler({ response, services, auth, params, ip }) {
      const alamat = await websiteBelajar(services);
      if (alamat) { dialihkan(response, alamat); return; }
      const actor = await auth.actor();
      const hasil = await services.courseShop.buy(params[0], actor);
      if (!hasil.ok) {
        json(response, hasil.status || 422, publicError(hasil));
        return;
      }
      if (!hasil.value.existing) {
        await services.auditService.record({
          action: ACTIONS.COURSE_ORDERED, actor, ip,
          entityType: 'course', entityId: params[0],
          metadata: { invoiceNumber: hasil.value.invoiceNumber, amount: hasil.value.amount }
        });
      }
      json(response, hasil.value.existing ? 200 : 201, { order: hasil.value });
    }
  },

  // Konsol: harga dan status jual tiap maddah.
  {
    method: 'GET',
    pattern: /^\/api\/admin\/kelas$/,
    permission: 'shop.manage',
    async handler({ response, services }) {
      const hasil = await services.courseShop.listListings();
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? { items: hasil.value } : publicError(hasil));
    }
  },

  {
    method: 'PUT',
    pattern: /^\/api\/admin\/kelas\/([\w-]+)$/,
    permission: 'shop.manage',
    async handler({ response, services, auth, params, readBody, ip }) {
      const actor = await auth.actor();
      const hasil = await services.courseShop.saveListing(params[0], await readBody());
      if (hasil.ok) {
        await services.auditService.record({
          action: ACTIONS.COURSE_LISTING_SAVED, actor, ip,
          entityType: 'course', entityId: params[0],
          metadata: { price: hasil.value.price, published: hasil.value.published }
        });
      }
      json(response, hasil.ok ? 200 : (hasil.status || 422), hasil.ok ? { listing: hasil.value } : publicError(hasil));
    }
  }
];
