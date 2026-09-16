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
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const RESET_TTL_MS = 1000 * 60 * 30;

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
    list() {
      return [...accounts.values()].map(clone);
    },
    save(account) {
      accounts.set(account.id, clone(account));
      return clone(account);
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
    remove(tokenHash) {
      sessions.delete(tokenHash);
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
      resetExpiresAt: null
    });
    return { ok: true, value: publicAccount(account) };
  }

  async function createSession(account) {
    const accessToken = crypto.randomBytes(32).toString('base64url');
    const issuedAt = now();
    await sessionStore.save({
      tokenHash: hashSecret(accessToken),
      accountId: account.id,
      expiresAt: new Date(issuedAt.getTime() + SESSION_TTL_MS).toISOString()
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
    return { ok: true, value: publicAccount(account) };
  }

  async function logout(accessToken) {
    await sessionStore.remove(hashSecret(accessToken || ''));
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
    return { ok: true, value: { resetToken, resetExpiresAt } };
  }

  async function resetPassword(emailInput, resetToken, nextPassword) {
    const passwordError = validatePassword(nextPassword);
    const account = await accountStore.getByEmail(normalizeEmail(emailInput));
    if (!account || passwordError || !account.resetTokenHash || new Date(account.resetExpiresAt).getTime() <= now().getTime() || !safeEqual(hashSecret(resetToken || ''), account.resetTokenHash)) {
      return { ok: false, error: passwordError || 'Token reset tidak berlaku.' };
    }
    const updatedAt = now().toISOString();
    await accountStore.save({
      ...account,
      passwordHash: await hashPassword(nextPassword),
      resetTokenHash: null,
      resetExpiresAt: null,
      updatedAt
    });
    return { ok: true };
  }

  return Object.freeze({
    authenticate,
    createAccount,
    createMemoryAccountStore,
    issuePasswordReset,
    listAccounts,
    login,
    logout,
    publicAccount,
    resetPassword
  });
}

module.exports = {
  ROLES,
  createIdentityService,
  createMemoryAccountStore,
  createMemorySessionStore,
  hashPassword,
  normalizeEmail,
  validatePassword,
  verifyPassword
};
