// Pembatas laju permintaan, jendela bergeser, disimpan di memori proses.
//
// Batasan yang harus disadari: hitungannya per proses. Kalau nanti aplikasi berjalan
// di lebih dari satu instance, setiap instance punya hitungannya sendiri, sehingga
// batas efektifnya menjadi batas dikali jumlah instance. Untuk skala lembaga ini satu
// instance sudah cukup; kalau nanti ditambah, pembatas ini harus pindah ke Redis atau
// ke lapisan proxy. Catatan yang sama ada di PRODUCTION_DEPLOYMENT.md.

const MENIT = 60 * 1000;
const JAM = 60 * MENIT;

const RULES = Object.freeze({
  // Menebak kata sandi.
  login: Object.freeze({ limit: 5, windowMs: 15 * MENIT }),
  // Mengirimi orang lain email reset berkali-kali.
  'password-reset-request': Object.freeze({ limit: 3, windowMs: 1 * JAM }),
  // Membanjiri daftar pendaftar dengan data palsu.
  'registration-create': Object.freeze({ limit: 5, windowMs: 1 * JAM }),
  // Menebak token akses pendaftaran.
  'applicant-login': Object.freeze({ limit: 5, windowMs: 15 * MENIT }),
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
    check(name, identity) {
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
    reset(name, identity) {
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

module.exports = { CLEANUP_INTERVAL_MS, RULES, TOO_MANY_REQUESTS, createRateLimiter };
