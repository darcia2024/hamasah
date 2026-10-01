'use strict';

// Ganti kata sandi sendiri dari konsol (POST /api/auth/password-change).
const test = require('node:test');
const assert = require('node:assert/strict');
const identity = require('./identity-service.js');

async function setup() {
  const service = identity.createIdentityService();
  const created = await service.createAccount({
    email: 'admin@hamasah.test', name: 'Admin Hamasah', role: identity.ROLES.ADMIN, password: 'kata-sandi-lama-aman'
  });
  assert.equal(created.ok, true);
  const perangkatA = await service.login('admin@hamasah.test', 'kata-sandi-lama-aman');
  const perangkatB = await service.login('admin@hamasah.test', 'kata-sandi-lama-aman');
  return { service, accountId: created.value.id, tokenA: perangkatA.value.accessToken, tokenB: perangkatB.value.accessToken };
}

test('kata sandi saat ini wajib benar', async () => {
  const { service, accountId } = await setup();
  const result = await service.changePassword(accountId, 'tebakan-salah-sekali', 'kata-sandi-baru-aman');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'WRONG_PASSWORD');
  assert.equal((await service.login('admin@hamasah.test', 'kata-sandi-lama-aman')).ok, true);
});

test('kata sandi baru harus valid dan berbeda', async () => {
  const { service, accountId } = await setup();
  assert.match((await service.changePassword(accountId, 'kata-sandi-lama-aman', 'pendek')).error, /12 sampai 128/);
  assert.match((await service.changePassword(accountId, 'kata-sandi-lama-aman', 'kata-sandi-lama-aman')).error, /berbeda/);
});

test('berhasil: sandi lama tidak berlaku, sesi lama dicabut, perangkat ini dapat token baru', async () => {
  const { service, accountId, tokenA, tokenB } = await setup();
  const result = await service.changePassword(accountId, 'kata-sandi-lama-aman', 'kata-sandi-baru-aman');
  assert.equal(result.ok, true);
  assert.equal(result.value.account.email, 'admin@hamasah.test');
  assert.equal('passwordHash' in result.value.account, false);

  assert.equal((await service.login('admin@hamasah.test', 'kata-sandi-lama-aman')).ok, false);
  assert.equal((await service.login('admin@hamasah.test', 'kata-sandi-baru-aman')).ok, true);

  assert.equal((await service.authenticate(tokenA)).ok, false, 'Sesi lama perangkat ini dicabut.');
  assert.equal((await service.authenticate(tokenB)).ok, false, 'Sesi di perangkat lain dicabut.');
  assert.equal((await service.authenticate(result.value.accessToken)).ok, true, 'Token baru berlaku.');
});

test('akun nonaktif tidak bisa ganti kata sandi', async () => {
  const { service, accountId } = await setup();
  await service.setAccountActive(accountId, false, { id: 'admin-lain', role: identity.ROLES.ADMIN });
  assert.equal((await service.changePassword(accountId, 'kata-sandi-lama-aman', 'kata-sandi-baru-aman')).ok, false);
});
