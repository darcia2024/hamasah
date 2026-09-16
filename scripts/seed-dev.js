// Data contoh untuk pengembangan lokal. Tidak pernah dijalankan di staging atau production.
const fs = require('node:fs');
const path = require('node:path');
const identity = require('../server/identity-service.js');
const { createPostgresAccountStore } = require('../server/postgres-account-store.js');
const { createPostgresArticleStore } = require('../server/postgres-article-store.js');

const DEV_PASSWORD = 'kata-sandi-dev-hamasah';

const DEV_ACCOUNTS = Object.freeze([
  { name: 'Admin Dev', email: 'admin@hamasah.test', role: identity.ROLES.ADMIN },
  { name: 'Petugas Pendaftaran Dev', email: 'petugas@hamasah.test', role: identity.ROLES.REGISTRATION_OFFICER },
  { name: 'Musyrif Dev', email: 'musyrif@hamasah.test', role: identity.ROLES.SUPERVISOR },
  { name: 'Wali Dev', email: 'wali@hamasah.test', role: identity.ROLES.PARENT },
  { name: 'Santri Dev', email: 'santri@hamasah.test', role: identity.ROLES.STUDENT }
]);

function readSeedArticles() {
  const filePath = path.join(__dirname, '..', 'data', 'articles.json');
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

// Idempoten: dijalankan berulang kali tidak membuat data ganda.
async function seedDevelopmentData({ database, logger = console }) {
  const accountStore = createPostgresAccountStore({ database });
  const identityService = identity.createIdentityService({ accountStore });
  const createdAccounts = [];

  for (const account of DEV_ACCOUNTS) {
    if (await accountStore.getByEmail(account.email)) continue;
    const created = await identityService.createAccount({ ...account, password: DEV_PASSWORD });
    if (!created.ok) {
      throw new Error(`Gagal membuat akun ${account.email}: ${created.error}`);
    }
    createdAccounts.push(account.email);
  }

  const articleStore = createPostgresArticleStore({ database });
  const createdArticles = [];
  for (const article of readSeedArticles()) {
    if (await articleStore.get(article.slug)) continue;
    const created = await articleStore.create(article, article.publishedAt || new Date().toISOString());
    if (created.ok) createdArticles.push(created.value.slug);
  }

  if (createdAccounts.length || createdArticles.length) {
    logger.log(`[dev] Data contoh ditambahkan: ${createdAccounts.length} akun, ${createdArticles.length} artikel.`);
  }
  return { accounts: createdAccounts, articles: createdArticles, password: DEV_PASSWORD };
}

module.exports = { DEV_ACCOUNTS, DEV_PASSWORD, seedDevelopmentData };
