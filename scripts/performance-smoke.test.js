const assert = require('node:assert/strict');
const { createAiService } = require('../server/ai-service.js');
const { createMemoryOperationsStore, createOperationsService } = require('../server/operations-service.js');

async function run() {
  const ai = createAiService({ maxRequests: 2000 });
  const started = performance.now();
  for (let i = 0; i < 500; i += 1) await ai.answer({ actor: { id: `s-${i % 10}` }, question: 'Apa inti materi?', fallbackAnswer: 'Rangkuman materi.' });
  const aiMs = performance.now() - started;
  const operations = createOperationsService({ store: createMemoryOperationsStore(), studentExists: async () => true });
  const opStarted = performance.now();
  for (let i = 0; i < 100; i += 1) await operations.createInvoice({ studentId: 'student-1', description: 'SPP bulanan', amount: 100000 }, { id: 'admin', role: 'admin' });
  const opMs = performance.now() - opStarted;
  assert.ok(aiMs < 5000, `AI fallback terlalu lambat: ${aiMs}ms`);
  assert.ok(opMs < 5000, `Operasional terlalu lambat: ${opMs}ms`);
  console.log(`performance smoke passed (AI 500=${Math.round(aiMs)}ms; invoice 100=${Math.round(opMs)}ms)`);
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
