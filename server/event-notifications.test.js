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

  // Kloter ditetapkan: ke pendaftar dan wali (tanpa duplikat), tidak untuk dibatalkan atau tanpa kloter.
  const kloter = { name: 'Kloter 1 <Jakarta>', plannedDate: '2026-10-15', origin: 'Jakarta (CGK)', status: 'confirmed', statusLabel: 'Terkonfirmasi', note: 'Bawa paspor asli.' };
  const sebelumKloter = antre.length;
  assert.equal(await notifier.departureAssigned('HI-REG-2026-00001', kloter), 1);
  assert.equal(antre[sebelumKloter].notificationType, 'departure-assigned');
  assert.equal(antre[sebelumKloter].payload.departureName, 'Kloter 1 <Jakarta>');
  assert.equal(await notifier.departureAssigned('HI-REG-2026-00002', kloter), 0, 'Pendaftaran dibatalkan tidak dikirimi.');
  assert.equal(await notifier.departureAssigned('HI-REG-2026-00001', null), 0, 'Tanpa kloter tidak ada email.');
  const pesanKloter = eventMessage('departure-assigned', { name: 'Calon', registrationId: 'HI-REG-2026-00001', departureName: 'Kloter 1 <Jakarta>', plannedDate: '2026-10-15', origin: 'Jakarta (CGK)', statusLabel: 'Terkonfirmasi', note: '<script>x</script>' }, 'https://app.test');
  assert.ok(pesanKloter.html.includes('Kamis, 15 Oktober 2026'));
  assert.ok(pesanKloter.html.includes('Kloter 1 &lt;Jakarta&gt;') && !pesanKloter.html.includes('<script>'));
  assert.ok(pesanKloter.html.includes('https://app.test/website/cek-status.html'));
  assert.ok(eventMessage('departure-assigned', { registrationId: 'X', departureName: 'K', plannedDate: null }, '').html.includes('Rencana berangkat: belum ditetapkan'));

  // Kloter berubah: satu email per penerima anggota; pendaftaran dibatalkan dilewati.
  const sebelumUbah = antre.length;
  const perubahan = [{ field: 'plannedDate', from: '2026-10-15', to: '2026-10-22' }, { field: 'status', from: 'confirmed', to: 'cancelled' }];
  assert.equal(await notifier.departureUpdated(['HI-REG-2026-00001', 'HI-REG-2026-00002'], { name: 'Kloter 1' }, perubahan), 1);
  assert.equal(antre[sebelumUbah].notificationType, 'departure-updated');
  assert.equal(await notifier.departureUpdated(['HI-REG-2026-00001'], { name: 'Kloter 1' }, []), 0, 'Tanpa perubahan tidak ada email.');
  const pesanUbah = eventMessage('departure-updated', { name: 'Calon', registrationId: 'HI-REG-2026-00001', departureName: 'Kloter <1>', changes: perubahan.concat([{ field: 'origin', from: null, to: 'Surabaya (SUB)' }]) }, 'https://app.test');
  assert.ok(pesanUbah.html.includes('Rencana berangkat: Kamis, 15 Oktober 2026 menjadi <strong>Kamis, 22 Oktober 2026</strong>'));
  assert.ok(pesanUbah.html.includes('Status kloter: Terkonfirmasi menjadi <strong>Dibatalkan</strong>'));
  assert.ok(pesanUbah.html.includes('Berangkat dari: belum ditetapkan menjadi <strong>Surabaya (SUB)</strong>'));
  assert.ok(pesanUbah.html.includes('Kloter ini dibatalkan.'));
  assert.ok(pesanUbah.html.includes('Kloter &lt;1&gt;'));

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
