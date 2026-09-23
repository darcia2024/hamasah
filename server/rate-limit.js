// Pembatas laju permintaan dengan jendela bergeser.
//
// Ada dua penyimpanan. `createRateLimiter` menyimpan di memori proses dan dipakai
// saat aplikasi berjalan tanpa database, misalnya pada sebagian test.
// `createDatabaseRateLimiter` menyimpan di tabel `rate_limit_hits` (migrasi 041) dan
// dipakai begitu database tersedia.
//
// Yang berbasis memori hanya benar bila aplikasi berjalan sebagai satu proses yang
// menyala terus. Di platform serverless setiap permintaan dapat dilayani instance
// berbeda dan instance mati saat sepi, sehingga batas seperti "5 percobaan per 15
// menit" tidak berlaku sama sekali. Karena itu jalur production memakai database.
//
// Kedua pembatas memakai antarmuka yang sama dan keduanya asinkron, supaya
// pemanggilnya tidak perlu tahu data hitungannya disimpan di mana.

const MENIT = 60 * 1000;
const JAM = 60 * MENIT;

const RULES = Object.freeze({
  // Menebak kata sandi.
  login: Object.freeze({ limit: 5, windowMs: 15 * MENIT }),
  // Mengirimi orang lain email reset berkali-kali.
  'password-reset-request': Object.freeze({ limit: 3, windowMs: 1 * JAM }),
  // Membanjiri daftar pendaftar dengan data palsu.
  'registration-create': Object.freeze({ limit: 5, windowMs: 1 * JAM }),
  // Formulir konsultasi publik. Lebih longgar dari pendaftaran karena tidak
  // membuat nomor dokumen, tetapi tetap dibatasi supaya antrean petugas tidak dibanjiri.
  'inquiry-create': Object.freeze({ limit: 8, windowMs: 1 * JAM }),
  // Menebak token akses pendaftaran.
  'applicant-login': Object.freeze({ limit: 5, windowMs: 15 * MENIT }),
  // Meminta kode akses baru harus lebih ketat karena selalu mengirim email.
  'applicant-recovery': Object.freeze({ limit: 3, windowMs: 1 * JAM }),
  // Menukar token undangan atau token reset. Tokennya 32 byte acak, jadi menebak tidak
  // realistis; batas ini menjaga sumber daya, karena setiap permintaan yang sampai ke
  // layanan memicu verifikasi scrypt. Longgar untuk pengguna sah (beberapa kali salah
  // ketik kata sandi), ketat untuk penyemprotan.
  'token-redeem': Object.freeze({ limit: 10, windowMs: 15 * MENIT }),
  'faq-ask': Object.freeze({ limit: 20, windowMs: 10 * MENIT }),
  // Dipakai mulai Phase 13, saat pertanyaan diteruskan ke model AI berbayar.
  'ai-ask': Object.freeze({ limit: 10, windowMs: 10 * MENIT }),
  // Dipakai mulai Task 8.10, saat unggahan berkas tersedia.
  upload: Object.freeze({ limit: 30, windowMs: 1 * JAM }),
  // Jaring pengaman untuk seluruh API.
  'api-default': Object.freeze({ limit: 300, windowMs: 5 * MENIT })
});

const CLEANUP_INTERVAL_MS = 5 * MENIT;
const TOO_MANY_REQUESTS = 'Terlalu banyak percobaan. Silakan coba lagi dalam beberapa menit.';

function createRateLimiter(options = {}) {
  const rules = options.rules || RULES;
  const now = options.now || (() => Date.now());
  const buckets = new Map();

  function ruleFor(name) {
    if (!Object.prototype.hasOwnProperty.call(rules, name)) {
      // Salah ketik nama aturan tidak boleh berakhir menjadi "tanpa batas".
      throw new Error(`Aturan rate limit tidak dikenal: ${name}`);
    }
    return rules[name];
  }

  function sweep() {
    const saatIni = now();
    for (const [key, entri] of buckets) {
      const batas = saatIni - entri.windowMs;
      entri.times = entri.times.filter((waktu) => waktu > batas);
      if (entri.times.length === 0) {
        buckets.delete(key);
      }
    }
  }

  // Timer di-unref supaya proses tetap bisa berhenti sendiri, termasuk saat test.
  let timer = null;
  if (options.cleanup !== false) {
    timer = setInterval(sweep, options.cleanupIntervalMs || CLEANUP_INTERVAL_MS);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  }

  return {
    // Mencatat satu percobaan. Mengembalikan { allowed, retryAfterSeconds, remaining }.
    async check(name, identity) {
      const rule = ruleFor(name);
      const key = `${name}:${identity}`;
      const saatIni = now();
      const entri = buckets.get(key) || { times: [], windowMs: rule.windowMs };
      entri.windowMs = rule.windowMs;
      const batas = saatIni - rule.windowMs;
      entri.times = entri.times.filter((waktu) => waktu > batas);

      if (entri.times.length >= rule.limit) {
        buckets.set(key, entri);
        const bebasPada = entri.times[0] + rule.windowMs;
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((bebasPada - saatIni) / 1000))
        };
      }

      entri.times.push(saatIni);
      buckets.set(key, entri);
      return { allowed: true, remaining: rule.limit - entri.times.length, retryAfterSeconds: 0 };
    },

    // Dipanggil setelah percobaan yang berhasil, misalnya login yang benar, supaya
    // pengguna sah yang masuk dari beberapa perangkat tidak ikut terkunci.
    async reset(name, identity) {
      ruleFor(name);
      buckets.delete(`${name}:${identity}`);
    },

    sweep,
    get size() { return buckets.size; },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
  };
}

// Jendela terpanjang di antara semua aturan; dipakai pembersih berkala untuk tahu
// sampai kapan baris lama masih mungkin berguna.
function longestWindowMs(rules = RULES) {
  return Object.values(rules).reduce((paling, rule) => Math.max(paling, rule.windowMs), 0);
}

// Aturan yang hitungannya WAJIB bertahan antar proses, karena melindungi kredensial
// dan data pribadi: menebak kata sandi, menebak kode akses pendaftar, meminta kode
// baru, menukar token, dan membanjiri pendaftaran.
//
// Sisanya, terutama jaring pengaman `api-default`, tetap di memori. Alasannya dua:
// menyimpannya di database berarti satu tulisan untuk setiap permintaan API, dan
// `/api/health` harus tetap menjawab meski database sedang mati.
const DATABASE_RULES = Object.freeze([
  'login',
  'password-reset-request',
  'registration-create',
  'inquiry-create',
  'applicant-login',
  'applicant-recovery',
  'token-redeem',
  'upload'
]);

// Pembatas yang hitungannya disimpan di database. Antarmukanya sama persis dengan
// versi memori, jadi app.js tinggal memilih salah satu.
function createDatabaseRateLimiter({ store, rules = RULES } = {}) {
  if (!store) throw new Error('createDatabaseRateLimiter membutuhkan store.');

  function ruleFor(name) {
    if (!Object.prototype.hasOwnProperty.call(rules, name)) {
      throw new Error(`Aturan rate limit tidak dikenal: ${name}`);
    }
    return rules[name];
  }

  return {
    async check(name, identity) {
      const rule = ruleFor(name);
      return store.hit(`${name}:${identity}`, rule);
    },
    async reset(name, identity) {
      ruleFor(name);
      await store.clear(`${name}:${identity}`);
    },
    // Pembersihan dijalankan pekerjaan perawatan, bukan timer di dalam proses.
    async sweep() {
      return store.sweep(longestWindowMs(rules));
    },
    stop() {}
  };
}

// Gabungan keduanya: aturan yang melindungi kredensial memakai database, sisanya
// memakai memori proses.
function createHybridRateLimiter({ store, rules = RULES, databaseRules = DATABASE_RULES, memory } = {}) {
  const diDatabase = new Set(databaseRules);
  const lewatDatabase = createDatabaseRateLimiter({ store, rules });
  const lewatMemori = memory || createRateLimiter({ rules });

  function pilih(name) {
    return diDatabase.has(name) ? lewatDatabase : lewatMemori;
  }

  return {
    async check(name, identity) { return pilih(name).check(name, identity); },
    async reset(name, identity) { return pilih(name).reset(name, identity); },
    async sweep() {
      lewatMemori.sweep();
      return lewatDatabase.sweep();
    },
    stop() { lewatMemori.stop(); }
  };
}

module.exports = {
  CLEANUP_INTERVAL_MS,
  DATABASE_RULES,
  createHybridRateLimiter,
  RULES,
  TOO_MANY_REQUESTS,
  createDatabaseRateLimiter,
  createRateLimiter,
  longestWindowMs
};
