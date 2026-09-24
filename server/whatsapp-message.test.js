// Template pesan WhatsApp untuk petugas pendaftaran (website/whatsapp-message.js).

const assert = require('node:assert/strict');
const test = require('node:test');
const wa = require('../website/whatsapp-message.js');
const domain = require('../website/registration-domain.js');

function pendaftaran(overrides = {}) {
  return {
    registrationId: 'HI-2026-00012',
    status: 'submitted',
    applicant: { applicantName: 'Ahmad Fauzi', phone: '+6281234567890', guardianName: 'Siti Aminah', guardianPhone: '0812-9876-5432' },
    documents: [],
    ...overrides
  };
}

test('nomor diubah ke format wa.me', () => {
  assert.equal(wa.toWhatsappNumber('+62 812-3456-7890'), '6281234567890');
  assert.equal(wa.toWhatsappNumber('081234567890'), '6281234567890');
  assert.equal(wa.toWhatsappNumber('+20 100 123 4567'), '201001234567');
  assert.equal(wa.toWhatsappNumber(''), '');
  assert.equal(wa.toWhatsappNumber('12'), '');
  assert.equal(wa.toWhatsappNumber(undefined), '');
});

test('setiap status pendaftaran punya kalimat sendiri', () => {
  for (const status of Object.values(domain.STATUSES)) {
    if (status === 'draft') continue;
    assert.ok(wa.STATUS_MESSAGES[status], `Status ${status} belum punya template WhatsApp.`);
  }
});

test('pesan menyebut nama, nomor, dan berkas yang ditolak beserta catatannya', () => {
  const pesan = wa.registrationMessage(pendaftaran({
    status: 'needs-revision',
    documents: [
      { type: 'passport', reviewStatus: 'rejected', reviewNote: 'Foto halaman identitas buram' },
      { type: 'diploma', reviewStatus: 'accepted' },
      { type: 'photo', reviewStatus: 'rejected' }
    ]
  }), { statusUrl: 'https://app.contoh/website/cek-status.html' });
  assert.match(pesan, /^Assalamu'alaikum Ahmad Fauzi,/);
  assert.ok(pesan.includes('HI-2026-00012'));
  assert.ok(pesan.includes('- Paspor: Foto halaman identitas buram'));
  assert.ok(pesan.includes('- Pasfoto 4x6'));
  assert.ok(!pesan.includes('Ijazah'), 'Berkas yang diterima tidak disebut.');
  assert.ok(pesan.includes('https://app.contoh/website/cek-status.html'));
});

test('pesan untuk wali menyapa nama wali', () => {
  const pesan = wa.registrationMessage(pendaftaran(), { recipient: 'guardian' });
  assert.match(pesan, /^Assalamu'alaikum Bapak\/Ibu Siti Aminah,/);
  const tanpaNama = wa.registrationMessage(pendaftaran({ applicant: { applicantName: 'Ahmad' } }), { recipient: 'guardian' });
  assert.match(tanpaNama, /^Assalamu'alaikum Bapak\/Ibu,/);
});

test('tautan wa.me memuat nomor dan pesan ter-encode, kosong bila nomor tidak valid', () => {
  const url = wa.whatsappUrl('0812-9876-5432', 'Halo & salam\nbaris dua');
  assert.equal(url, 'https://wa.me/6281298765432?text=Halo%20%26%20salam%0Abaris%20dua');
  assert.equal(wa.whatsappUrl('', 'Halo'), '');
});
