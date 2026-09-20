const KNOWLEDGE_BASE = Object.freeze([
  {
    id: 'program-kuliah',
    keywords: ['kuliah', 'al-azhar', 'universitas', 'fakultas'],
    answer: 'Program Kuliah mendampingi persiapan studi menuju Al-Azhar Kairo. Persyaratan akhir, jadwal, dan proses akademik selalu dikonfirmasi kembali oleh tim Hamasah sesuai ketentuan yang berlaku.'
  },
  {
    id: 'program-mahad',
    keywords: ['mahad', "ma'had", 'bahasa', 'persiapan'],
    answer: "Program Ma'had berfokus pada penguatan bahasa Arab dan persiapan akademik sebelum tahapan studi berikutnya. Tim Hamasah membantu calon santri memahami jalur yang paling sesuai."
  },
  {
    id: 'pendaftaran',
    keywords: ['daftar', 'pendaftaran', 'dokumen', 'berkas', 'syarat', 'paspor'],
    answer: 'Pendaftaran diawali dengan pengisian data dasar. Setelah itu petugas akan memeriksa kebutuhan berkas dan memberi catatan bila ada yang perlu dilengkapi. Gunakan nomor registrasi untuk memantau proses Anda.'
  },
  {
    id: 'kairo',
    keywords: ['mesir', 'kairo', 'keberangkatan', 'visa', 'asrama'],
    answer: 'Hamasah mendampingi persiapan keberangkatan, penyesuaian awal di Kairo, dan informasi kegiatan santri. Jadwal perjalanan serta kebutuhan visa dikonfirmasi per pendaftar oleh tim resmi.'
  }
]);

const UNSAFE_PATTERNS = Object.freeze([
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /reveal\s+(the\s+)?system\s+prompt/i,
  /bypass\s+(your\s+)?(safety|rules|policy)/i
]);

function answerQuestion(question) {
  const normalized = String(question || '').toLocaleLowerCase('id-ID').trim();
  if (normalized.length < 3) {
    return { matched: false, answer: 'Tulis pertanyaan yang lebih lengkap agar kami dapat membantu.' };
  }
  if (UNSAFE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { matched: false, handoff: true, source: 'faq-safety', answer: 'Saya hanya dapat membantu pertanyaan tentang program dan layanan Hamasah. Untuk hal di luar itu, silakan hubungi tim Hamasah.' };
  }

  const ranked = KNOWLEDGE_BASE
    .map(function score(entry) {
      const score = entry.keywords.reduce(function sum(total, keyword) {
        return total + (normalized.includes(keyword) ? 1 : 0);
      }, 0);
      return { entry, score };
    })
    .sort(function highestFirst(left, right) { return right.score - left.score; });

  if (!ranked[0] || ranked[0].score === 0) {
    return {
      matched: false,
      handoff: true,
      source: 'faq-handoff',
      answer: 'Pertanyaan ini perlu dikonfirmasi oleh tim Hamasah. Silakan gunakan konsultasi pendaftaran agar informasi yang diberikan sesuai kondisi terbaru.'
    };
  }

  return {
    matched: true,
    source: 'faq-approved',
    topic: ranked[0].entry.id,
    answer: ranked[0].entry.answer
  };
}

module.exports = { KNOWLEDGE_BASE, answerQuestion };
