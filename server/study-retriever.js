'use strict';

// Pencari jawaban lokal untuk "tanya materi" santri (keputusan pengurus C7, 30 September 2026:
// tanpa AI berbayar, tetapi sepintar mungkin). Jawaban hanya diambil dari materi yang diunggah
// pengajar, tidak pernah dikarang: tanya-jawab panduan, poin penting, ringkasan, dan isi materi
// teks. Pertanyaan tidak pernah keluar dari server Hamasah.
//
// Cara kerja singkat:
// 1. Pertanyaan dan setiap potongan materi dinormalkan (huruf kecil, tanda baca dan tanda
//    transliterasi dibuang, imbuhan umum bahasa Indonesia dipotong, kata sambung dibuang).
// 2. Setiap potongan diberi skor BM25: kata yang jarang muncul di materi bernilai lebih tinggi.
//    Frasa dua kata yang sama persis dan jenis pertanyaan (apa itu, contoh, mengapa, bagaimana)
//    menambah skor potongan yang cocok.
// 3. Tanya-jawab panduan yang cocok dipakai apa adanya. Bila tidak ada, dua kalimat materi
//    terbaik disusun jadi jawaban. Bila materi yang dibuka tidak membahasnya, materi lain di
//    maddah yang sama ikut dicari. Bila tetap tidak ada, santri diberi tahu terus terang.

const STOPWORDS = new Set([
  'apa', 'apakah', 'itu', 'ini', 'yang', 'dan', 'atau', 'di', 'ke', 'dari', 'dalam', 'pada', 'untuk',
  'dengan', 'adalah', 'ialah', 'yaitu', 'merupakan', 'saya', 'aku', 'kamu', 'anda', 'kita', 'kami',
  'ada', 'bisa', 'dapat', 'tolong', 'jelaskan', 'jelasin', 'maksud', 'maksudnya', 'arti', 'artinya',
  'bagaimana', 'gimana', 'kenapa', 'mengapa', 'kapan', 'dimana', 'mana', 'siapa', 'berapa',
  'sih', 'dong', 'ya', 'kah', 'lah', 'nya', 'juga', 'saja', 'aja', 'lagi', 'sudah', 'belum', 'akan',
  'tidak', 'bukan', 'tentang', 'sebagai', 'oleh', 'karena', 'jika', 'kalau', 'agar', 'supaya',
  'para', 'se', 'ustadz', 'ustadzah', 'kak', 'pak', 'bu', 'mohon', 'minta', 'contoh', 'contohnya',
  'cara', 'caranya', 'beda', 'bedanya', 'perbedaan', 'hubungan', 'fungsi', 'fungsinya', 'pengertian',
  'boleh', 'mau', 'tanya', 'nanya', 'bertanya', 'paham', 'bingung', 'masih', 'soal', 'jawab', 'jawabannya',
  'ga', 'gak', 'nggak', 'enggak', 'kok', 'nih', 'deh', 'al', 'el', 'seperti', 'harus', 'wajib', 'aja', 'saja', 'gitu', 'kayak'
]);

// Kata tanya yang tetap dipakai untuk menebak jenis pertanyaan, walau dibuang dari pencocokan.
const QUESTION_KINDS = [
  { kind: 'definition', pattern: /\b(apa itu|apa yang dimaksud|pengertian|definisi|arti|artinya|maksud|seperti apa|itu apa)\b/, cues: /\b(adalah|ialah|yaitu|merupakan|disebut|artinya)\b/ },
  { kind: 'example', pattern: /\b(contoh|contohnya|misal|misalnya)\b/, cues: /\b(contoh|contohnya|misal|misalnya|seperti)\b/ },
  { kind: 'reason', pattern: /\b(kenapa|mengapa|alasan|sebab)\b/, cues: /\b(karena|sebab|sehingga|oleh karena|agar|supaya)\b/ },
  { kind: 'method', pattern: /\b(bagaimana|gimana|cara|caranya|langkah)\b/, cues: /\b(dengan|cara|langkah|pertama|kemudian|lalu)\b/ },
  { kind: 'difference', pattern: /\b(beda|bedanya|perbedaan|membedakan)\b/, cues: /\b(sedangkan|berbeda|bedanya|perbedaan|adapun)\b/ },
  { kind: 'duration', pattern: /\b(berapa lama|lamanya|durasi|berapa hari|berapa bulan|berapa tahun)\b/, cues: /\b(hari|minggu|bulan|tahun|jam)\b/ },
  { kind: 'function', pattern: /\b(fungsi|fungsinya|kegunaan|guna)\b/, cues: /\b(fungsi|berfungsi|menyempurnakan|menjelaskan|menunjukkan|untuk)\b/ }
];

const K1 = 1.4;
const B = 0.75;
// Potongan diterima bila memuat sedikitnya separuh kata penting pertanyaan. Skor BM25 hanya
// mengurutkan: istilah yang ada di hampir semua kalimat (mis. "mubtada" di materi mubtada)
// memang berskor kecil, tetapi tetap sah sebagai jawaban.
const MIN_COVERAGE = 0.5;

function normalize(text) {
  return String(text || '')
    .toLocaleLowerCase('id-ID')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    // Tanda transliterasi Arab: ma'had = mahad, ta’lim = talim.
    .replace(/['’‘`ʼʻ]/g, '')
    .replace(/[^a-z0-9؀-ۿ\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Pemotong imbuhan ringan. Sengaja konservatif: kata pendek dan istilah Arab dibiarkan,
// supaya "khabar" tidak menjadi "khab" dan "mubtada" tetap utuh.
function stem(word) {
  let w = word;
  if (w.length <= 4) return w;
  w = w.replace(/(nya|lah|kah|pun)$/, '');
  if (w.length > 5) w = w.replace(/(kan|an)$/, '');
  if (w.length > 5) w = w.replace(/^(meng|meny|mem|men|me|peng|peny|pem|pen|pe|ber|be|ter|di|ke)(?=[a-z]{4,})/, '');
  return w;
}

function tokens(text) {
  return normalize(text)
    .split(' ')
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .map(stem)
    .filter((word) => word.length > 1);
}

function bigrams(list) {
  const pairs = new Set();
  for (let i = 0; i < list.length - 1; i += 1) pairs.add(`${list[i]} ${list[i + 1]}`);
  return pairs;
}

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12);
}

function questionKind(question) {
  const lower = normalize(question);
  const found = QUESTION_KINDS.find((entry) => entry.pattern.test(lower));
  return found || null;
}

// Potongan yang bisa menjadi jawaban, dari satu materi. Judul materi sengaja tidak ikut
// dicocokkan: istilah di judul muncul di hampir semua kalimat dan membuat semuanya tampak sama.
function passagesOf(material) {
  const items = [];
  (material.studyGuide || []).forEach((guide) => {
    if (guide && guide.question && guide.answer) {
      items.push({ kind: 'guide', material, text: guide.answer, matchText: `${guide.question} ${guide.question} ${guide.answer}`, guideQuestion: guide.question });
    }
  });
  (material.keyPoints || []).forEach((point) => {
    if (point) items.push({ kind: 'point', material, text: point, matchText: point });
  });
  splitSentences(material.summary).forEach((sentence) => items.push({ kind: 'summary', material, text: sentence, matchText: sentence }));
  // Isi materi hanya dibaca untuk materi teks. Video dan PDF berisi tautan atau rujukan berkas;
  // kuis berisi kunci jawaban yang tidak boleh dibocorkan lewat tanya materi.
  if (material.type === 'text') {
    const sentences = splitSentences(material.content);
    sentences.forEach((sentence, index) => {
      items.push({ kind: 'content', material, text: sentence, matchText: sentence, span: [index] });
      // Pasangan kalimat berurutan: contoh sering ditulis dalam dua kalimat
      // ("Contohnya: Zaidun qaimun. Kata Zaidun adalah mubtada ...").
      if (index + 1 < sentences.length) {
        const pair = `${sentence} ${sentences[index + 1]}`;
        items.push({ kind: 'content', material, text: pair, matchText: pair, span: [index, index + 1], parts: [sentence, sentences[index + 1]] });
      }
    });
  }
  items.forEach((item) => {
    item.tokens = tokens(item.matchText);
    item.pairs = bigrams(item.tokens);
  });
  return items;
}

function scorePassages(items, question) {
  const queryTokens = [...new Set(tokens(question))];
  if (!queryTokens.length || !items.length) return [];
  const queryPairs = bigrams(tokens(question));
  const kind = questionKind(question);
  const docCount = items.length;
  const avgLength = items.reduce((sum, item) => sum + item.tokens.length, 0) / docCount || 1;
  const documentFrequency = new Map();
  items.forEach((item) => new Set(item.tokens).forEach((token) => documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1)));

  return items.map((item) => {
    const counts = new Map();
    item.tokens.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
    let score = 0;
    let matched = 0;
    let idfMatched = 0;
    let idfTotal = 0;
    queryTokens.forEach((token) => {
      const tf = counts.get(token) || 0;
      const df = documentFrequency.get(token) || 0;
      const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
      idfTotal += idf;
      if (!tf) return;
      matched += 1;
      idfMatched += idf;
      score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * item.tokens.length) / avgLength)));
    });
    if (!matched) return { item, score: 0, coverage: 0, weightedCoverage: 0 };
    const coverage = matched / queryTokens.length;
    // Cakupan berbobot: kata yang jarang di materi (mis. "putri") lebih menentukan daripada
    // kata yang ada di mana-mana (mis. "mesir").
    const weightedCoverage = idfTotal ? idfMatched / idfTotal : coverage;
    queryPairs.forEach((pair) => { if (item.pairs.has(pair)) score += 0.4; });
    // Cakupan: potongan yang memuat lebih banyak kata pertanyaan lebih mungkin menjawabnya.
    score *= 0.6 + 0.4 * coverage;
    // Jenis pertanyaan: "apa itu" mencari kalimat "adalah", "contoh" mencari "contohnya", dst.
    if (kind && kind.cues.test(normalize(item.text))) score = score * 1.8 + 0.5;
    if (item.kind === 'guide') {
      // Tanya-jawab panduan hanya dipakai bila pertanyaannya sendiri mirip, bukan sekadar
      // jawabannya menyebut kata yang sama.
      const guideTokens = new Set(tokens(item.guideQuestion));
      const guideCoverage = queryTokens.filter((token) => guideTokens.has(token)).length / queryTokens.length;
      if (guideCoverage < MIN_COVERAGE) return { item, score: 0, coverage: 0 };
      score *= 1.25;
    }
    return { item, score, coverage, weightedCoverage };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
}

// Pertanyaan berjenis (apa itu, contoh, mengapa) dijawab satu potongan terbaik; pertanyaan umum
// boleh dua potongan yang tidak tumpang tindih.
function composeFromPassages(ranked, question) {
  const limit = questionKind(question) ? 1 : 2;
  const chosen = [];
  const seenText = new Set();
  const usedSentences = new Set();
  for (const entry of ranked) {
    if (chosen.length >= limit) break;
    if (entry.coverage < MIN_COVERAGE) continue;
    const key = normalize(entry.item.text);
    if (seenText.has(key)) continue;
    const spanKeys = (entry.item.span || []).map((index) => `${entry.item.material.id}:${index}`);
    if (spanKeys.some((spanKey) => usedSentences.has(spanKey))) continue;
    // Potongan kedua hanya dipakai bila skornya tidak jauh di bawah potongan terbaik.
    if (chosen.length && entry.score < chosen[0].score * 0.6) break;
    seenText.add(key);
    spanKeys.forEach((spanKey) => usedSentences.add(spanKey));
    chosen.push(entry);
  }
  return chosen;
}

function withPeriod(text) {
  const trimmed = String(text).trim();
  return /[.!?؟]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

// material = materi yang sedang dibuka; otherMaterials = materi lain di maddah yang sama.
function findAnswer({ question, material, otherMaterials = [] }) {
  const ranked = scorePassages(passagesOf(material), question);
  const bestGuide = ranked.find((entry) => entry.item.kind === 'guide');
  if (bestGuide && bestGuide.coverage >= MIN_COVERAGE && bestGuide === ranked[0]) {
    return { found: true, answer: bestGuide.item.text, source: 'panduan materi', materialId: material.id };
  }
  const chosen = composeFromPassages(ranked, question);
  if (chosen.length) {
    return {
      found: true,
      answer: chosen.map((entry) => withPeriod(entry.item.text)).join(' '),
      source: `isi materi "${material.title}"`,
      materialId: material.id
    };
  }

  const others = otherMaterials.filter((entry) => entry && entry.id !== material.id);
  if (others.length) {
    const rankedOthers = scorePassages(others.flatMap(passagesOf), question);
    const chosenOther = composeFromPassages(rankedOthers, question);
    if (chosenOther.length) {
      const source = chosenOther[0].item.material;
      return {
        found: true,
        answer: `${chosenOther.map((entry) => withPeriod(entry.item.text)).join(' ')} Pembahasan lengkapnya ada di materi "${source.title}".`,
        source: `materi lain: "${source.title}"`,
        materialId: source.id
      };
    }
  }

  return {
    found: false,
    answer: 'Materi di maddah ini belum membahas pertanyaan itu. Catat pertanyaanmu untuk ditanyakan ke ustadz pengajar.',
    source: 'belum ada di materi',
    materialId: material.id
  };
}

// passagesOf, scorePassages, dan composeFromPassages juga dipakai asisten landing page
// (server/site-assistant.js) supaya kedua pencari berperilaku sama.
module.exports = { findAnswer, passagesOf, scorePassages, composeFromPassages, tokens, normalize, stem, questionKind };
