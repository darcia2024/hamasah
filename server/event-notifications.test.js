// Notifikasi peristiwa penting (Task R8.3).
const assert = require('node:assert/strict');
const { createEventNotifier } = require('./event-notifications.js');
const { eventMessage } = require('./notification-templates.js');

async function run() {
  const antre = [];
  const notificationService = { canSend: () => true, async queueEvent(item) { antre.push(item); } };
  const records = {
    'HI-REG-2026-00001': {
      status: 'document-review',
      applicant: { applicantName: 'Calon <b>Uji</b>', email: 'calon@contoh.test', guardianEmail: 'CALON@contoh.test' },
      documents: [{ id: 'd1', reviewStatus: 'rejected', reviewNote: 'Foto buram' }, { id: 'd2', reviewStatus: 'accepted' }]
    },
    'HI-REG-2026-00002': { status: 'cancelled', applicant: { email: 'batal@contoh.test' }, documents: [] }
  };
  const notifier = createEventNotifier({ notificationService, registrationStore: { async get(id) { return records[id] || null; } }, logger: { error() {} } });

  // Email pendaftar dan wali yang sama hanya diantrekan sekali.
  assert.equal(await notifier.registrationStatusChanged('HI-REG-2026-00001'), 1);
  assert.equal(antre[0].notificationType, 'registration-status');
  assert.equal(antre[0].recipientEmail, 'calon@contoh.test');
  assert.equal(antre[0].payload.statusLabel, 'Pemeriksaan berkas');

  // Hanya berkas yang ditolak memicu notifikasi revisi.
  assert.equal(await notifier.documentRejected('HI-REG-2026-00001', 'd1'), 1);
  assert.equal(antre[1].payload.note, 'Foto buram');
  assert.equal(await notifier.documentRejected('HI-REG-2026-00001', 'd2'), 0);

  // Pendaftaran yang dibatalkan tidak dikirimi apa pun.
  assert.equal(await notifier.registrationStatusChanged('HI-REG-2026-00002'), 0);
  assert.equal(antre.length, 2);

  // Tanpa pengirim terkonfigurasi: tidak mengantre. Gagal mengantre: tidak melempar.
  const mati = createEventNotifier({ notificationService: { canSend: () => false, async queueEvent() { throw new Error('tidak boleh'); } }, registrationStore: { async get(id) { return records[id]; } } });
  assert.equal(await mati.registrationStatusChanged('HI-REG-2026-00001'), 0);
  const rusak = createEventNotifier({ notificationService: { canSend: () => true, async queueEvent() { throw new Error('db mati'); } }, registrationStore: { async get(id) { return records[id]; } }, logger: { error() {} } });
  assert.equal(await rusak.registrationStatusChanged('HI-REG-2026-00001'), 0);

  // Isi email di-escape.
  const pesan = eventMessage('document-revision', { name: 'Calon <b>Uji</b>', registrationId: 'HI-REG-2026-00001', note: '<script>x</script>' }, 'https://app.test');
  assert.ok(!pesan.html.includes('<script>') && !pesan.html.includes('<b>Uji'));
  assert.ok(pesan.html.includes('https://app.test/website/cek-status.html'));
  const bayar = eventMessage('payment-received', { name: 'Wali', studentName: 'Santri', invoiceNumber: 'INV/HI/2026/00001', receiptNumber: 'KWT/HI/2026/00001', amount: 1500000 }, 'https://app.test');
  assert.match(bayar.html, /Rp\s?1\.500\.000/);
  assert.equal(eventMessage('tidak-dikenal', {}, ''), null);

  console.log('event notification tests passed');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
