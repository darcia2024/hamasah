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

function hashPassword(password) {
  return new Promise(function resolveHash(resolve, reject) {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, 64, function onHash(error, derivedKey) {
      if (error) {
        reject(error);
        return;
      }
      resolve(`scrypt$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`);
    });
  });
}

function verifyPassword(password, storedHash) {
  const segments = String(storedHash || '').split('$');
  if (segments.length !== 3 || segments[0] !== 'scrypt') {
    return Promise.resolve(false);
  }

  return new Promise(function resolveVerification(resolve, reject) {
    crypto.scrypt(password, Buffer.from(segments[1], 'base64url'), 64, function onHash(error, derivedKey) {
      if (error) {
        reject(error);
        return;
      }
      resolve(safeEqual(derivedKey.toString('base64url'), segments[2]));
    });
  });
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
    if (!account || !account.active || !(await verifyPassword(String(password || ''), account.passwordHash))) {
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
    const updatedAt = now().toISOString();
    const accountId = await accountStore.consumeInvitationToken(hashSecret(invitationToken || ''), await hashPassword(nextPassword), updatedAt);
    if (!accountId) return { ok: false, error: 'Undangan tidak berlaku.' };
    const account = await accountStore.getById(accountId);
    return { ok: true, value: { account: account ? publicAccount(account) : null } };
  }

  async function resetPassword(resetToken, nextPassword) {
    const passwordError = validatePassword(nextPassword);
    if (passwordError || typeof accountStore.consumeResetToken !== 'function') {
      return { ok: false, error: passwordError || 'Token reset tidak berlaku.' };
    }
    const updatedAt = now().toISOString();
    const accountId = await accountStore.consumeResetToken(hashSecret(resetToken || ''), await hashPassword(nextPassword), updatedAt);
    if (!accountId) return { ok: false, error: 'Token reset tidak berlaku.' };
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
