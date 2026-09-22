const crypto = require('node:crypto');

// Daftar role tunggal. Nilainya harus sama dengan CHECK constraint di
// database/007_role_finance_teacher.sql dan dengan server/access-policy.js.
const ROLES = Object.freeze({
  ADMIN: 'admin',
  REGISTRATION_OFFICER: 'registration-officer',
  PARENT: 'parent',
  STUDENT: 'student',
  SUPERVISOR: 'supervisor',
  TEACHER: 'teacher',
  FINANCE: 'finance'
});

const ROLE_VALUES = Object.freeze(Object.values(ROLES));

const JAM = 1000 * 60 * 60;
const HARI = 24 * JAM;

// Keputusan K17 (16 Sep 2026). Akun staf memegang data banyak orang, jadi sesinya
// pendek dan tidak diperpanjang. Wali dan santri hanya melihat datanya sendiri dan
// membukanya dari HP pribadi, jadi sesinya panjang dan diperpanjang selama aktif.
// Sesi yang dipaksa pendek untuk wali berujung pada kata sandi yang ditulis di
// catatan HP, dan itu justru lebih berbahaya.
const SESSION_TTL_MS = Object.freeze({
  [ROLES.ADMIN]: 12 * JAM,
  [ROLES.REGISTRATION_OFFICER]: 12 * JAM,
  [ROLES.SUPERVISOR]: 12 * JAM,
  [ROLES.TEACHER]: 12 * JAM,
  [ROLES.FINANCE]: 12 * JAM,
  [ROLES.PARENT]: 30 * HARI,
  [ROLES.STUDENT]: 30 * HARI
});

// Role yang sesinya ikut diperpanjang setiap kali dipakai.
const SLIDING_ROLES = Object.freeze([ROLES.PARENT, ROLES.STUDENT]);

// Penulisan ulang waktu kedaluwarsa dibatasi supaya setiap permintaan tidak
// berubah menjadi satu operasi tulis ke database.
const TOUCH_INTERVAL_MS = 15 * 60 * 1000;

function sessionTtlFor(role) {
  return SESSION_TTL_MS[role] || 12 * JAM;
}
const RESET_TTL_MS = 1000 * 60 * 30;
const INVITATION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeEmail(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US');
}

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 12 || password.length > 128) {
    return 'Kata sandi harus terdiri dari 12 sampai 128 karakter.';
  }
  return null;
}

function hashSecret(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

// Parameter scrypt (Task R8.4). Sebelumnya default Node: N=2^14, r=8, p=1 (16 MB, sekitar
// 28 ms). Sekarang N=2^16, r=8, p=2: padanan OWASP untuk N=2^17/p=1 dengan separuh memori
// (64 MB per verifikasi), sekitar 225 ms di laptop pengembangan. N=2^17/p=1 (128 MB per
// login) sengaja tidak dipakai sebelum ukuran hosting diputuskan (K2).
//
// Format baru menyimpan parameternya: scrypt$N=65536,r=8,p=2$<salt>$<kunci>. Format lama
// tanpa parameter (scrypt$<salt>$<kunci>) tetap diverifikasi dengan parameter lamanya, dan
// terganti ketika kata sandi diatur ulang.
const SCRYPT_PARAMS = Object.freeze({ N: 65536, r: 8, p: 2 });
const LEGACY_SCRYPT_PARAMS = Object.freeze({ N: 16384, r: 8, p: 1 });
const SCRYPT_KEY_LENGTH = 64;

function scrypt(password, salt, { N, r, p }) {
  return new Promise(function resolveHash(resolve, reject) {
    // maxmem wajib dinaikkan: batas default Node (32 MB) menolak N di atas 2^14.
    crypto.scrypt(password, salt, SCRYPT_KEY_LENGTH, { N, r, p, maxmem: 256 * N * r }, function onHash(error, derivedKey) {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

// Parameter dari hash tersimpan, dibatasi supaya hash rusak tidak memicu alokasi besar.
function parseScryptParams(text) {
  const values = Object.fromEntries(String(text).split(',').map((pair) => pair.split('=')));
  const N = Number(values.N);
  const r = Number(values.r);
  const p = Number(values.p);
  const valid = Number.isInteger(N) && N >= 1024 && N <= 1048576 && (N & (N - 1)) === 0
    && Number.isInteger(r) && r >= 1 && r <= 32 && Number.isInteger(p) && p >= 1 && p <= 16;
  return valid ? { N, r, p } : null;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scrypt(password, salt, SCRYPT_PARAMS);
  const { N, r, p } = SCRYPT_PARAMS;
  return `scrypt$N=${N},r=${r},p=${p}$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
}

// Hash tiruan berparameter sama dengan hash baru, dipakai login untuk akun yang tidak ada.
// Dibuat sekali per proses; kata sandinya acak dan tidak pernah disimpan.
let dummyHashPromise = null;
function dummyPasswordHash() {
  if (!dummyHashPromise) dummyHashPromise = hashPassword(crypto.randomBytes(32).toString('base64url'));
  return dummyHashPromise;
}

async function verifyPassword(password, storedHash) {
  const segments = String(storedHash || '').split('$');
  if (segments[0] !== 'scrypt' || (segments.length !== 3 && segments.length !== 4)) return false;
  const params = segments.length === 3 ? LEGACY_SCRYPT_PARAMS : parseScryptParams(segments[1]);
  if (!params) return false;
  const [salt, expected] = segments.slice(-2);
  const derivedKey = await scrypt(password, Buffer.from(salt, 'base64url'), params);
  return safeEqual(derivedKey.toString('base64url'), expected);
}

  function createMemoryAccountStore() {
  const accounts = new Map();
  return {
    count() { return accounts.size; },
    getByEmail(email) {
      const account = [...accounts.values()].find(function matches(entry) { return entry.email === email; });
      return account ? clone(account) : null;
    },
    getById(id) {
      const account = accounts.get(id);
      return account ? clone(account) : null;
    },
    getByInvitationTokenHash(tokenHash) {
      const account = [...accounts.values()].find((entry) => entry.invitationTokenHash === tokenHash);
      return account ? clone(account) : null;
    },
    getByResetTokenHash(tokenHash) {
      const account = [...accounts.values()].find((entry) => entry.resetTokenHash === tokenHash);
      return account ? clone(account) : null;
    },
    list() {
      return [...accounts.values()].map(clone);
    },
    save(account) {
      accounts.set(account.id, clone(account));
      return clone(account);
    },
    consumeResetToken(tokenHash, passwordHash, nowIso) {
      const account = [...accounts.values()].find((entry) => entry.active && entry.resetTokenHash === tokenHash && entry.resetExpiresAt > nowIso);
      if (!account) return null;
      accounts.set(account.id, {
        ...account,
        passwordHash,
        resetTokenHash: null,
        resetExpiresAt: null,
        updatedAt: nowIso
      });
      return account.id;
    },
    consumeInvitationToken(tokenHash, passwordHash, nowIso) {
      const account = [...accounts.values()].find((entry) => !entry.active && entry.invitationTokenHash === tokenHash && entry.invitationExpiresAt > nowIso);
      if (!account) return null;
      accounts.set(account.id, {
        ...account,
        active: true,
        passwordHash,
        invitationTokenHash: null,
        invitationExpiresAt: null,
        updatedAt: nowIso
      });
      return account.id;
    }
  };
}

function createMemorySessionStore() {
  const sessions = new Map();
  return {
    get(tokenHash) {
      const session = sessions.get(tokenHash);
      return session ? clone(session) : null;
    },
    save(session) {
      sessions.set(session.tokenHash, clone(session));
    },
    touch(tokenHash, { expiresAt, lastSeenAt }) {
      const session = sessions.get(tokenHash);
      if (session) {
        sessions.set(tokenHash, { ...session, expiresAt, lastSeenAt });
      }
    },
    remove(tokenHash) {
      sessions.delete(tokenHash);
    },
    removeForAccount(accountId) {
      let dihapus = 0;
      for (const [tokenHash, session] of sessions) {
        if (session.accountId === accountId) {
          sessions.delete(tokenHash);
          dihapus += 1;
        }
      }
      return dihapus;
    },
    removeExpired(isoTime) {
      let dihapus = 0;
      for (const [tokenHash, session] of sessions) {
        if (session.expiresAt < isoTime) {
          sessions.delete(tokenHash);
          dihapus += 1;
        }
      }
      return dihapus;
    }
  };
}

function publicAccount(account) {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    active: account.active,
    createdAt: account.createdAt
  };
}

function createIdentityService(options) {
  const config = options || {};
  const accountStore = config.accountStore || createMemoryAccountStore();
  const sessionStore = config.sessionStore || createMemorySessionStore();
  const now = config.now || function currentTime() { return new Date(); };
  const consumedInvitationTokenHashes = new Set();
  const consumedResetTokenHashes = new Set();

  async function createAccount(input) {
    const source = input || {};
    const email = normalizeEmail(source.email);
    const name = String(source.name || '').trim();
    const role = source.role;
    const passwordError = validatePassword(source.password);

    if (!/^\S+@\S+\.\S+$/.test(email) || name.length < 2 || !ROLE_VALUES.includes(role) || passwordError) {
      return { ok: false, error: passwordError || 'Data akun belum valid.' };
    }
    if (await accountStore.getByEmail(email)) {
      return { ok: false, error: 'Email sudah digunakan.' };
    }

    const createdAt = now().toISOString();
    const account = await accountStore.save({
      id: crypto.randomUUID(),
      email,
      name,
      role,
      active: true,
      passwordHash: await hashPassword(source.password),
      createdAt,
      updatedAt: createdAt,
      resetTokenHash: null,
      resetExpiresAt: null,
      invitationTokenHash: null,
      invitationExpiresAt: null,
      invitedAt: null
    });
    return { ok: true, value: publicAccount(account) };
  }

  async function createSession(account) {
    const accessToken = crypto.randomBytes(32).toString('base64url');
    const issuedAt = now();
    await sessionStore.save({
      tokenHash: hashSecret(accessToken),
      accountId: account.id,
      expiresAt: new Date(issuedAt.getTime() + sessionTtlFor(account.role)).toISOString(),
      lastSeenAt: issuedAt.toISOString()
    });
    return { accessToken, account: publicAccount(account) };
  }

  async function login(emailInput, password) {
    const account = await accountStore.getByEmail(normalizeEmail(emailInput));
    // scrypt selalu dijalankan, juga untuk email yang tidak terdaftar atau akun nonaktif, supaya
    // waktu respons tidak membedakan keduanya dari kata sandi yang salah (enumerasi akun).
    const cocok = await verifyPassword(String(password || ''), account ? account.passwordHash : await dummyPasswordHash());
    if (!account || !account.active || !cocok) {
      return { ok: false, error: 'Email atau kata sandi tidak tepat.' };
    }
    return { ok: true, value: await createSession(account) };
  }

  async function authenticate(accessToken) {
    const tokenHash = hashSecret(accessToken || '');
    const session = await sessionStore.get(tokenHash);
    if (!session) {
      return { ok: false, error: 'Sesi tidak ditemukan.' };
    }
    if (new Date(session.expiresAt).getTime() <= now().getTime()) {
      await sessionStore.remove(tokenHash);
      return { ok: false, error: 'Sesi sudah berakhir.' };
    }
    const account = await accountStore.getById(session.accountId);
    if (!account || !account.active) {
      return { ok: false, error: 'Akun tidak dapat digunakan.' };
    }

    // Sesi wali dan santri diperpanjang selama masih dipakai, tetapi tulisannya
    // dibatasi sekali per 15 menit supaya membuka halaman tidak berarti menulis
    // ke database setiap kali.
    if (SLIDING_ROLES.includes(account.role) && typeof sessionStore.touch === 'function') {
      const saatIni = now();
      const terakhir = session.lastSeenAt ? new Date(session.lastSeenAt).getTime() : 0;
      if (saatIni.getTime() - terakhir >= TOUCH_INTERVAL_MS) {
        await sessionStore.touch(tokenHash, {
          expiresAt: new Date(saatIni.getTime() + sessionTtlFor(account.role)).toISOString(),
          lastSeenAt: saatIni.toISOString()
        });
      }
    }

    return { ok: true, value: publicAccount(account) };
  }

  async function logout(accessToken) {
    await sessionStore.remove(hashSecret(accessToken || ''));
  }

  // Mencabut seluruh sesi satu akun. Dipakai saat perangkat hilang, dan saat akun
  // dinonaktifkan.
  async function logoutAll(accountId) {
    if (typeof sessionStore.removeForAccount !== 'function') {
      return 0;
    }
    return sessionStore.removeForAccount(accountId);
  }

  // Menonaktifkan akun sekaligus mencabut sesinya. Tanpa pencabutan, akun yang
  // sudah dinonaktifkan masih bisa dipakai sampai sesinya kedaluwarsa sendiri,
  // dan untuk wali itu berarti sampai 30 hari.
  async function setAccountActive(accountId, active, actor) {
    if (!actor || actor.role !== ROLES.ADMIN) {
      return { ok: false, error: 'Akses admin diperlukan.' };
    }
    const account = await accountStore.getById(accountId);
    if (!account) {
      return { ok: false, error: 'Akun tidak ditemukan.' };
    }
    if (account.id === actor.id && !active) {
      return { ok: false, error: 'Akun yang sedang dipakai tidak dapat dinonaktifkan sendiri.' };
    }
    const disimpan = await accountStore.save({ ...account, active: Boolean(active), updatedAt: now().toISOString() });
    const dicabut = active ? 0 : await logoutAll(accountId);
    return { ok: true, value: { account: publicAccount(disimpan), sessionsRevoked: dicabut } };
  }

  // Dipanggil job harian.
  async function purgeExpiredSessions() {
    if (typeof sessionStore.removeExpired !== 'function') {
      return 0;
    }
    return sessionStore.removeExpired(now().toISOString());
  }

  async function listAccounts() {
    if (typeof accountStore.list !== 'function') {
      return [];
    }
    return (await accountStore.list())
      .sort(function byName(left, right) { return left.name.localeCompare(right.name, 'id-ID'); })
      .map(publicAccount);
  }

  async function issuePasswordReset(emailInput) {
    const account = await accountStore.getByEmail(normalizeEmail(emailInput));
    if (!account || !account.active) {
      return { ok: true, value: null };
    }
    const resetToken = crypto.randomBytes(32).toString('base64url');
    const resetExpiresAt = new Date(now().getTime() + RESET_TTL_MS).toISOString();
    await accountStore.save({
      ...account,
      resetTokenHash: hashSecret(resetToken),
      resetExpiresAt,
      updatedAt: now().toISOString()
    });
    return { ok: true, value: { resetToken, resetExpiresAt, accountId: account.id, accountName: account.name } };
  }

  // Akun undangan tidak dapat dipakai sebelum pemilik membuat kata sandinya.
  // Token mentah hanya dikembalikan sekali ke route untuk dikirim lewat email.
  async function inviteAccount(input) {
    const source = input || {};
    const email = normalizeEmail(source.email);
    const name = String(source.name || '').trim();
    const role = source.role;
    if (!/^\S+@\S+\.\S+$/.test(email) || name.length < 2 || !ROLE_VALUES.includes(role)) {
      return { ok: false, error: 'Data akun belum valid.' };
    }
    if (await accountStore.getByEmail(email)) {
      return { ok: false, error: 'Email sudah digunakan.' };
    }
    const createdAt = now().toISOString();
    const invitationToken = crypto.randomBytes(32).toString('base64url');
    const invitationExpiresAt = new Date(now().getTime() + INVITATION_TTL_MS).toISOString();
    const account = await accountStore.save({
      id: crypto.randomUUID(), email, name, role, active: false,
      passwordHash: await hashPassword(crypto.randomBytes(48).toString('base64url')),
      resetTokenHash: null, resetExpiresAt: null,
      invitationTokenHash: hashSecret(invitationToken), invitationExpiresAt, invitedAt: createdAt,
      createdAt, updatedAt: createdAt
    });
    return { ok: true, value: { account: publicAccount(account), invitationToken, invitationExpiresAt } };
  }

  async function renewInvitation(accountId) {
    const account = await accountStore.getById(accountId);
    if (!account || account.active) {
      return { ok: false, error: 'Undangan akun tidak dapat diperbarui.' };
    }
    const invitationToken = crypto.randomBytes(32).toString('base64url');
    const invitationExpiresAt = new Date(now().getTime() + INVITATION_TTL_MS).toISOString();
    const updated = await accountStore.save({
      ...account,
      invitationTokenHash: hashSecret(invitationToken), invitationExpiresAt,
      invitedAt: now().toISOString(), updatedAt: now().toISOString()
    });
    return { ok: true, value: { account: publicAccount(updated), invitationToken, invitationExpiresAt } };
  }

  async function acceptInvitation(invitationToken, nextPassword) {
    const passwordError = validatePassword(nextPassword);
    if (passwordError || typeof accountStore.consumeInvitationToken !== 'function') {
      return { ok: false, error: passwordError || 'Undangan tidak berlaku.' };
    }
    const tokenHash = hashSecret(invitationToken || '');
    const candidate = typeof accountStore.getByInvitationTokenHash === 'function' ? await accountStore.getByInvitationTokenHash(tokenHash) : null;
    if (!candidate) {
      return consumedInvitationTokenHashes.has(tokenHash)
        ? { ok: false, code: 'TOKEN_USED', error: 'Tautan aktivasi sudah digunakan.' }
        : { ok: false, code: 'TOKEN_INVALID', error: 'Tautan aktivasi tidak valid.' };
    }
    if (!candidate.invitationExpiresAt || candidate.invitationExpiresAt <= now().toISOString()) {
      return { ok: false, code: 'TOKEN_EXPIRED', error: 'Tautan aktivasi sudah kedaluwarsa.' };
    }
    const updatedAt = now().toISOString();
    const accountId = await accountStore.consumeInvitationToken(tokenHash, await hashPassword(nextPassword), updatedAt);
    if (!accountId) return { ok: false, code: 'TOKEN_USED', error: 'Tautan aktivasi sudah digunakan.' };
    consumedInvitationTokenHashes.add(tokenHash);
    const account = await accountStore.getById(accountId);
    return { ok: true, value: { account: account ? publicAccount(account) : null } };
  }

  async function resetPassword(resetToken, nextPassword) {
    const passwordError = validatePassword(nextPassword);
    if (passwordError || typeof accountStore.consumeResetToken !== 'function') {
      return { ok: false, error: passwordError || 'Token reset tidak berlaku.' };
    }
    const tokenHash = hashSecret(resetToken || '');
    const candidate = typeof accountStore.getByResetTokenHash === 'function' ? await accountStore.getByResetTokenHash(tokenHash) : null;
    if (!candidate) {
      return consumedResetTokenHashes.has(tokenHash)
        ? { ok: false, code: 'TOKEN_USED', error: 'Tautan reset sudah digunakan.' }
        : { ok: false, code: 'TOKEN_INVALID', error: 'Tautan reset tidak valid.' };
    }
    if (!candidate.resetExpiresAt || candidate.resetExpiresAt <= now().toISOString()) {
      return { ok: false, code: 'TOKEN_EXPIRED', error: 'Tautan reset sudah kedaluwarsa.' };
    }
    const updatedAt = now().toISOString();
    const accountId = await accountStore.consumeResetToken(tokenHash, await hashPassword(nextPassword), updatedAt);
    if (!accountId) return { ok: false, code: 'TOKEN_USED', error: 'Tautan reset sudah digunakan.' };
    consumedResetTokenHashes.add(tokenHash);
    await logoutAll(accountId);
    return { ok: true };
  }

  return Object.freeze({
    authenticate,
    acceptInvitation,
    createAccount,
    createMemoryAccountStore,
    inviteAccount,
    issuePasswordReset,
    listAccounts,
    login,
    logout,
    logoutAll,
    publicAccount,
    purgeExpiredSessions,
    resetPassword,
    renewInvitation,
    setAccountActive
  });
}

module.exports = {
  ROLES,
  SESSION_TTL_MS,
  INVITATION_TTL_MS,
  SLIDING_ROLES,
  TOUCH_INTERVAL_MS,
  sessionTtlFor,
  createIdentityService,
  createMemoryAccountStore,
  createMemorySessionStore,
  hashPassword,
  normalizeEmail,
  validatePassword,
  verifyPassword
};
