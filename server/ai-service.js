'use strict';

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MAX_REQUESTS = 20;
const DEFAULT_TIMEOUT_MS = 8000;
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /reveal\s+(the\s+)?system\s+prompt/i,
  /show\s+(me\s+)?(your|the)\s+hidden\s+instructions?/i,
  /bypass\s+(your\s+)?(safety|rules|policy)/i,
  /developer\s+message/i
];

function cleanText(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function createAiService(options) {
  const config = options || {};
  const provider = config.provider || null;
  const now = config.now || (() => Date.now());
  const maxRequests = Number.isInteger(config.maxRequests) && config.maxRequests > 0 ? config.maxRequests : DEFAULT_MAX_REQUESTS;
  const windowMs = Number.isInteger(config.windowMs) && config.windowMs > 0 ? config.windowMs : DEFAULT_WINDOW_MS;
  const timeoutMs = Number.isInteger(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : DEFAULT_TIMEOUT_MS;
  const logger = config.logger || null;
  const buckets = new Map();
  const counters = { total: 0, providerSuccess: 0, providerFailure: 0, fallback: 0, blocked: 0, quotaRejected: 0 };

  function accountKey(actor) {
    return cleanText(actor && (actor.id || actor.accountId), 160) || 'anonymous';
  }

  function consume(actor) {
    const key = accountKey(actor);
    const timestamp = Number(now());
    const bucket = buckets.get(key);
    if (!bucket || timestamp - bucket.startedAt >= windowMs) {
      const fresh = { startedAt: timestamp, count: 1 };
      buckets.set(key, fresh);
      return { allowed: true, remaining: maxRequests - 1 };
    }
    if (bucket.count >= maxRequests) {
      counters.quotaRejected += 1;
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, windowMs - (timestamp - bucket.startedAt)) };
    }
    bucket.count += 1;
    return { allowed: true, remaining: maxRequests - bucket.count };
  }

  function isPromptInjection(question) {
    return INJECTION_PATTERNS.some((pattern) => pattern.test(question));
  }

  async function callProvider(input) {
    if (!provider || typeof provider.answer !== 'function') return null;
    let timer;
    try {
      const result = await Promise.race([
        Promise.resolve(provider.answer(input)),
        new Promise((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); })
      ]);
      if (!result || typeof result.answer !== 'string' || !result.answer.trim()) throw new Error('provider-empty-response');
      counters.providerSuccess += 1;
      return cleanText(result.answer, 4000);
    } catch (error) {
      counters.providerFailure += 1;
      if (logger && typeof logger.warn === 'function') logger.warn(`[ai] provider fallback: ${error.message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function answer(input) {
    const source = input || {};
    const question = cleanText(source.question);
    const fallback = cleanText(source.fallbackAnswer, 4000) || 'Pelajari rangkuman dan poin penting di atas. Jika masih bingung, diskusikan bersama pembina.';
    counters.total += 1;
    if (!question) return { ok: false, error: 'Pertanyaan belum diisi.' };
    const quota = consume(source.actor);
    if (!quota.allowed) return { ok: false, error: 'Batas pertanyaan AI sementara tercapai. Coba lagi setelah beberapa saat.', retryAfterMs: quota.retryAfterMs };
    if (isPromptInjection(question)) {
      counters.blocked += 1;
      counters.fallback += 1;
      return { ok: true, value: { answer: 'Saya hanya dapat membantu memahami materi Hamasah yang sedang kamu pelajari. Silakan tanyakan bagian materi yang belum jelas.', source: 'safety-fallback', mode: 'fallback', quotaRemaining: quota.remaining } };
    }
    const providerAnswer = await callProvider({
      question,
      actor: source.actor ? { id: accountKey(source.actor), role: source.actor.role } : null,
      context: {
        title: cleanText(source.context && source.context.title, 200),
        summary: cleanText(source.context && source.context.summary, 2000),
        keyPoints: Array.isArray(source.context && source.context.keyPoints) ? source.context.keyPoints.map((item) => cleanText(item, 400)).slice(0, 8) : [],
        studyGuide: Array.isArray(source.context && source.context.studyGuide) ? source.context.studyGuide.map((item) => ({ question: cleanText(item.question, 400), answer: cleanText(item.answer, 1000) })).slice(0, 10) : []
      }
    });
    if (providerAnswer) return { ok: true, value: { answer: providerAnswer, source: 'ai-materi', mode: 'provider', quotaRemaining: quota.remaining } };
    counters.fallback += 1;
    return { ok: true, value: { answer: fallback, source: source.fallbackSource || 'rangkuman materi', mode: 'fallback', quotaRemaining: quota.remaining } };
  }

  function metrics() {
    return { ...counters, activeAccounts: buckets.size, maxRequests, windowMs, timeoutMs };
  }

  return Object.freeze({ answer, metrics });
}

module.exports = { createAiService, INJECTION_PATTERNS };
