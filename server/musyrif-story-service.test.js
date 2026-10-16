// Cerita musyrif ke usulan catatan: OpenRouter diganti tiruan, jadi tanpa jaringan.
const assert = require('node:assert/strict');
const { createMusyrifStoryService, susunDaftar, normalkan } = require('./musyrif-story-service.js');

const SANTRI = [
  { id: 'a1', name: 'Ahmad Zaki Mubarak', status: 'active' },
  { id: 'a2', name: 'Ahmad Fikri', status: 'active' },
  { id: 'h1', name: 'Hana Salsabila', status: 'active' },
  { id: 'x9', name: 'Lulus Dulu', status: 'graduated' }
];

function portal(daftar = SANTRI) {
  return { async listForActor(actor) { return actor.role === 'supervisor' || actor.role === 'admin' ? daftar : []; } };
}

function tiruan(jawaban, catat = []) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    catat.push({ url, body, headers: init.headers });
    return { ok: true, async json() { return { choices: [{ message: { content: typeof jawaban === 'string' ? jawaban : JSON.stringify(jawaban) } }] }; } };
  };
}

const MUSYRIF = { id: 'm1', role: 'supervisor' };
const ENV = { OPENROUTER_API_KEY: 'uji' };
const now = () => new Date('2026-10-16T05:00:00Z');

async function run() {
  // Nama depan ganda diberi inisial; hanya nama depan yang dikirim.
  const daftar = susunDaftar(SANTRI.slice(0, 3));
  assert.deepEqual(daftar.map((d) => `${d.kode}:${d.panggilan}`), ['S1:Ahmad Z.', 'S2:Ahmad F.', 'S3:Hana']);

  // Butir tidak sah dibuang.
  assert.equal(normalkan({ jenis: 'sholat', waktu: 'tahajud', status: 'berjamaah' }), null);
  assert.equal(normalkan({ jenis: 'setoran', kind: 'ziyadah', portion: 'Q', grade: 'lancar' }), null);
  assert.equal(normalkan({ jenis: 'catatan', area: 'Akhlak', note: 'baik' }), null);
  assert.deepEqual(normalkan({ jenis: 'catatan', area: 'akhlak', note: 'Sopan kepada teman sekamar.' }).value.area, 'Akhlak');

  // Tanpa kunci: tidak aktif dan tidak memanggil jaringan.
  const mati = createMusyrifStoryService({ env: {}, fetchImpl: () => { throw new Error('jangan dipanggil'); }, studentPortalService: portal(), now, logger: null });
  assert.equal(mati.aktif(), false);
  const ditolak = await mati.map({ story: 'Subuh tadi semua berjamaah.' }, MUSYRIF);
  assert.equal(ditolak.status, 503);

  // Peran lain ditolak.
  const catat = [];
  const layanan = createMusyrifStoryService({
    env: ENV, now, logger: null, studentPortalService: portal(),
    fetchImpl: tiruan({
      items: [
        { santri: 'SEMUA', jenis: 'sholat', waktu: 'subuh', status: 'berjamaah' },
        { santri: 'S1', jenis: 'sholat', waktu: 'subuh', status: 'munfarid' },
        { santri: 'S3', jenis: 'setoran', kind: 'ziyadah', portion: 'QS. Al-Mulk 1-15', grade: 'lancar' },
        { santri: 'S2', jenis: 'kehadiran', kegiatan: 'Talaqqi kitab', status: 'late' },
        { santri: 'S9', jenis: 'prestasi', title: 'Santri tidak dikenal' },
        { santri: 'S3', jenis: 'disiplin', level: 'parah', note: 'Keluar asrama tanpa izin' },
        { santri: 'S1', jenis: 'warna', note: 'aneh' }
      ],
      tidakTerpetakan: ['Budi juga ikut kajian'],
      ringkasan: 'Subuh berjamaah, Hana setoran Al-Mulk.'
    }, catat)
  });
  assert.equal((await layanan.map({ story: 'Subuh tadi semua berjamaah.' }, { id: 'p', role: 'parent' })).status, 403);
  assert.equal((await layanan.map({ story: 'pendek' }, MUSYRIF)).ok, false);
  assert.equal((await layanan.map({ story: 'Subuh tadi semua berjamaah.', date: '2026-10-20' }, MUSYRIF)).ok, false, 'Tanggal masa depan ditolak.');

  const hasil = await layanan.map({ story: 'Subuh tadi semua berjamaah, Ahmad Zaki sholat sendiri. Hana setor Al-Mulk 1-15 lancar. Ahmad Fikri telat talaqqi. Hana keluar tanpa izin.', date: '2026-10-15' }, MUSYRIF);
  assert.equal(hasil.ok, true);
  assert.equal(hasil.value.date, '2026-10-15');

  // Yang dikirim ke model: kode dan nama depan saja, santri lulus tidak ikut, tanpa id.
  const pesan = catat[0].body.messages[1].content;
  assert.match(pesan, /S1: Ahmad Z\./);
  assert.match(pesan, /S3: Hana\n/);
  assert.doesNotMatch(pesan, /Mubarak|Salsabila|Lulus|a1|h1/);
  assert.equal(catat[0].body.response_format.type, 'json_object');
  assert.equal(catat[0].headers.Authorization, 'Bearer uji');

  const p = hasil.value.proposals;
  const sholat = p.filter((x) => x.type === 'sholat');
  assert.equal(sholat.length, 3, 'SEMUA dijabarkan ke tiga santri aktif.');
  assert.equal(sholat.find((x) => x.studentId === 'a1').value.status, 'munfarid', 'Penyebutan terakhir yang berlaku.');
  assert.deepEqual(p.find((x) => x.type === 'setoran'), { studentId: 'h1', studentName: 'Hana Salsabila', type: 'setoran', value: { kind: 'ziyadah', portion: 'QS. Al-Mulk 1-15', grade: 'lancar', note: '' } });
  assert.equal(p.find((x) => x.type === 'kehadiran').studentId, 'a2');
  assert.equal(p.find((x) => x.type === 'disiplin').value.level, 'ringan', 'Tingkat tak dikenal menjadi ringan.');
  assert.ok(!p.some((x) => x.type === 'prestasi'), 'Kode tak dikenal dibuang.');
  assert.deepEqual(hasil.value.unmatched, ['Budi juga ikut kajian']);

  // Dibatasi ke satu santri (dari halaman santri).
  const satu = await layanan.map({ story: 'Subuh tadi semua berjamaah.', studentIds: ['h1'] }, MUSYRIF);
  assert.ok(satu.value.proposals.every((x) => x.studentId === 'h1'));

  // Jawaban model rusak: galat yang ramah, bukan usulan kosong.
  const rusak = createMusyrifStoryService({ env: ENV, now, logger: null, studentPortalService: portal(), fetchImpl: tiruan('maaf saya tidak bisa') });
  assert.equal((await rusak.map({ story: 'Subuh tadi semua berjamaah.' }, MUSYRIF)).status, 502);

  // Musyrif tanpa santri.
  const kosong = createMusyrifStoryService({ env: ENV, now, logger: null, studentPortalService: portal([]), fetchImpl: tiruan({ items: [] }) });
  assert.equal((await kosong.map({ story: 'Subuh tadi semua berjamaah.' }, MUSYRIF)).ok, false);

  console.log('musyrif story tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
