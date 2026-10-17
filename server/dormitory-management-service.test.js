// Kelola Asrama: jadwal, agenda, piket, kas dan iuran, inventaris, dan tampilan keluarga.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createTestDatabase } = require('./test-support/database.js');
const { createDormitoryManagementService } = require('./dormitory-management-service.js');

async function run() {
  const database = await createTestDatabase();
  try {
    const q = (sql, p) => database.query(sql, p);
    const putra = crypto.randomUUID();
    const putri = crypto.randomUUID();
    await q(`INSERT INTO dormitories (id, name, area, gender, capacity) VALUES ($1, 'Asrama Putra Uji', 'Nasr City', 'putra', 10), ($2, 'Asrama Putri Uji', 'Nasr City', 'putri', 10)`, [putra, putri]);
    async function santri(nama, asrama, status = 'active') {
      const id = crypto.randomUUID();
      await q(`INSERT INTO students (id, name, program, city, join_date, status, dormitory_id) VALUES ($1, $2, 'Kuliah', 'Kairo', '2026-08-01', $3, $4)`, [id, nama, status, asrama]);
      return id;
    }
    const ahmad = await santri('Ahmad Zaki', putra);
    const fikri = await santri('Fikri Haidar', putra);
    await santri('Lulus Lama', putra, 'graduated');
    const hana = await santri('Hana Salsabila', putri);

    const musyrifId = crypto.randomUUID();
    await q(`INSERT INTO accounts (id, email, name, role, password_hash) VALUES ($1, 'musyrif-uji@hamasah.test', 'Musyrif Uji', 'supervisor', 'x')`, [musyrifId]);
    const MUSYRIF = { id: musyrifId, role: 'supervisor' };
    const ADMIN = { role: 'admin' };
    const keluarga = {
      parent: [{ id: ahmad, name: 'Ahmad Zaki', dormitoryId: putra, dormitoryName: 'Asrama Putra Uji' }],
      student: [{ id: fikri, name: 'Fikri Haidar', dormitoryId: putra, dormitoryName: 'Asrama Putra Uji' }]
    };
    const layanan = createDormitoryManagementService({
      database,
      staffDormitories: async (id) => (id === musyrifId ? [putra] : []),
      listStudentsForActor: async (actor) => keluarga[actor.role] || [],
      now: () => new Date('2026-10-16T03:00:00Z')
    });

    // Hak akses: musyrif hanya asramanya; peran lain ditolak.
    assert.deepEqual((await layanan.list(MUSYRIF)).value.dormitories.map((d) => d.id), [putra]);
    assert.equal((await layanan.list(ADMIN)).value.dormitories.length, 2);
    assert.equal((await layanan.list({ role: 'parent' })).status, 403);
    assert.equal((await layanan.overview(putri, MUSYRIF)).status, 403);
    assert.equal((await layanan.addSchedule(putri, { title: 'Kajian', dayOfWeek: 1 }, MUSYRIF)).status, 403);
    assert.equal((await layanan.overview(crypto.randomUUID(), ADMIN)).status, 404);

    // Jadwal rutin dan acara.
    assert.equal((await layanan.addSchedule(putra, { title: 'Ka', dayOfWeek: 1 }, MUSYRIF)).ok, false);
    assert.equal((await layanan.addSchedule(putra, { title: 'Kajian', dayOfWeek: 9 }, MUSYRIF)).ok, false);
    assert.equal((await layanan.addSchedule(putra, { title: 'Kajian', dayOfWeek: 1, startTime: '20:00', endTime: '19:00' }, MUSYRIF)).ok, false);
    const talaqqi = await layanan.addSchedule(putra, { title: 'Talaqqi kitab', dayOfWeek: 1, startTime: '5.30', endTime: '06:30', location: 'Musholla' }, MUSYRIF);
    assert.equal(talaqqi.ok, true);
    assert.equal(talaqqi.value.startTime, '05:30');
    const rihlah = await layanan.addSchedule(putra, { kind: 'acara', title: 'Rihlah ke Alexandria', date: '2026-10-25' }, MUSYRIF);
    await layanan.addSchedule(putra, { kind: 'acara', title: 'Acara lama sekali', date: '2026-08-01' }, MUSYRIF);
    await layanan.addSchedule(putra, { kind: 'acara', title: 'Acara jauh di depan', date: '2027-03-01' }, MUSYRIF);
    const ubah = await layanan.updateSchedule(putra, talaqqi.value.id, { title: 'Talaqqi kitab Arbain', dayOfWeek: 2, startTime: '05:30' }, MUSYRIF);
    assert.equal(ubah.value.dayOfWeek, 2);

    // Piket.
    const dapur = (await layanan.addDuty(putra, { name: 'Dapur' }, MUSYRIF)).value;
    const kamar = (await layanan.addDuty(putra, { name: 'Kamar mandi' }, MUSYRIF)).value;
    assert.equal((await layanan.setDutyAssignments(putra, { assignments: [{ dutyId: dapur.id, day: 1, studentIds: [hana] }] }, MUSYRIF)).ok, false, 'Santri asrama lain ditolak.');
    const atur = await layanan.setDutyAssignments(putra, { assignments: [
      { dutyId: dapur.id, day: 1, studentIds: [ahmad, fikri] },
      { dutyId: kamar.id, day: 3, studentIds: [ahmad, ahmad] }
    ] }, MUSYRIF);
    assert.equal(atur.value.assignments, 3);

    // Kas dan iuran.
    assert.equal((await layanan.addCash(putra, { direction: 'masuk', amount: 0, category: 'lain' }, MUSYRIF)).ok, false);
    assert.equal((await layanan.addCash(putra, { direction: 'masuk', amount: 50000, category: 'iuran' }, MUSYRIF)).ok, false, 'Iuran butuh santri.');
    assert.equal((await layanan.setDues(putra, { monthlyAmount: 50000 }, MUSYRIF)).ok, true);
    await layanan.addCash(putra, { direction: 'masuk', amount: 50000, category: 'Iuran', studentId: ahmad, date: '2026-10-05' }, MUSYRIF);
    await layanan.addCash(putra, { direction: 'masuk', amount: 20000, category: 'iuran', studentId: fikri, date: '2026-10-06' }, MUSYRIF);
    const sabun = await layanan.addCash(putra, { direction: 'keluar', amount: 15000, category: 'kebersihan', note: 'Sabun dan pel', date: '2026-10-07' }, MUSYRIF);
    const salah = await layanan.addCash(putra, { direction: 'keluar', amount: 999000, category: 'konsumsi', date: '2026-10-08' }, MUSYRIF);
    assert.equal((await layanan.voidCash(putra, salah.value.id, { reason: 'ok' }, MUSYRIF)).ok, false);
    assert.equal((await layanan.voidCash(putra, salah.value.id, { reason: 'Salah ketik nominal' }, MUSYRIF)).ok, true);
    assert.equal((await layanan.voidCash(putra, salah.value.id, { reason: 'Salah ketik nominal' }, MUSYRIF)).status, 404);
    assert.equal((await layanan.addCash(putra, { direction: 'keluar', amount: 1000, category: 'konsumsi', date: '2026-12-01' }, MUSYRIF)).ok, false, 'Tanggal masa depan ditolak.');

    // Inventaris.
    const kasur = (await layanan.addInventory(putra, { name: 'Kasur lipat', quantity: 12 }, MUSYRIF)).value;
    await layanan.updateInventory(putra, kasur.id, { name: 'Kasur lipat', quantity: 11, condition: 'rusak', note: '1 robek' }, MUSYRIF);
    const kipas = (await layanan.addInventory(putra, { name: 'Kipas angin', quantity: 3 }, MUSYRIF)).value;
    await layanan.archiveInventory(putra, kipas.id, MUSYRIF);
    assert.equal((await layanan.addInventory(putra, { name: 'X', quantity: -1 }, MUSYRIF)).ok, false);

    // Ringkasan pengelola.
    const lihat = (await layanan.overview(putra, MUSYRIF, { month: '2026-10' })).value;
    assert.equal(lihat.tersedia, true);
    assert.deepEqual(lihat.students.map((s) => s.name), ['Ahmad Zaki', 'Fikri Haidar'], 'Hanya santri aktif.');
    assert.deepEqual(lihat.schedule.map((j) => j.title).sort(), ['Acara jauh di depan', 'Rihlah ke Alexandria', 'Talaqqi kitab Arbain'], 'Acara lebih dari 30 hari lalu disembunyikan.');
    assert.deepEqual(lihat.duties.map((d) => d.name), ['Dapur', 'Kamar mandi']);
    assert.deepEqual(lihat.duties[0].days[1].map((s) => s.name), ['Ahmad Zaki', 'Fikri Haidar']);
    assert.equal(lihat.cash.balance, 50000 + 20000 - 15000);
    assert.equal(lihat.cash.monthIn, 70000);
    assert.equal(lihat.cash.monthOut, 15000);
    assert.equal(lihat.cash.entries.length, 4);
    assert.ok(lihat.cash.entries.find((e) => e.id === salah.value.id).voided);
    assert.equal(lihat.cash.entries.find((e) => e.id === sabun.value.id).note, 'Sabun dan pel');
    assert.deepEqual(lihat.cash.dues.students.map((s) => [s.name, s.paid, s.settled]), [['Ahmad Zaki', 50000, true], ['Fikri Haidar', 20000, false]]);
    assert.deepEqual(lihat.inventory.map((b) => [b.name, b.quantity, b.condition]), [['Kasur lipat', 11, 'rusak']]);

    // Keluarga: jadwal, agenda 45 hari, dan piket anaknya saja; tanpa kas dan inventaris.
    const wali = (await layanan.forFamily({ role: 'parent' })).value;
    assert.equal(wali.dormitories.length, 1);
    const asrama = wali.dormitories[0];
    assert.deepEqual(asrama.routine.map((j) => j.title), ['Talaqqi kitab Arbain']);
    assert.deepEqual(asrama.events.map((j) => j.title), ['Rihlah ke Alexandria']);
    assert.deepEqual(asrama.duties.map((d) => `${d.studentName}:${d.duty}:${d.dayOfWeek}`), ['Ahmad Zaki:Dapur:1', 'Ahmad Zaki:Kamar mandi:3']);
    assert.ok(!('cash' in asrama) && !('inventory' in asrama));
    const santriSendiri = (await layanan.forFamily({ role: 'student' })).value.dormitories[0];
    assert.deepEqual(santriSendiri.duties.map((d) => d.studentName), ['Fikri Haidar']);
    assert.equal((await layanan.forFamily(MUSYRIF)).status, 403);

    // Galeri asrama (migrasi 051): hanya unggahan 'dormitory-photo' asrama itu yang siap.
    async function unggahan(asramaId, { purpose = 'dormitory-photo', status = 'ready' } = {}) {
      const id = crypto.randomUUID();
      await q(
        `INSERT INTO file_objects (id, bucket, storage_key, purpose, entity_type, entity_id, original_name, content_type, size_bytes, status)
         VALUES ($1, 'hamasah-private', $2, $3, 'dormitory', $4, 'foto.jpg', 'image/jpeg', 1200, $5)`,
        [id, `${purpose}/${asramaId}/${id}.jpg`, purpose, String(asramaId), status]
      );
      return id;
    }
    const fotoRihlah = await unggahan(putra);
    assert.equal((await layanan.addPhoto(putra, { fileId: await unggahan(putra, { status: 'pending' }) }, MUSYRIF)).ok, false, 'Unggahan belum selesai ditolak.');
    assert.equal((await layanan.addPhoto(putra, { fileId: await unggahan(putri) }, MUSYRIF)).ok, false, 'Foto asrama lain ditolak.');
    assert.equal((await layanan.addPhoto(putra, { fileId: await unggahan(putra, { purpose: 'student-photo' }) }, MUSYRIF)).ok, false, 'Jenis unggahan lain ditolak.');
    assert.equal((await layanan.addPhoto(putri, { fileId: fotoRihlah }, MUSYRIF)).status, 403);
    const foto = await layanan.addPhoto(putra, { fileId: fotoRihlah, caption: 'Rihlah ke Alexandria', takenOn: '2026-10-12' }, MUSYRIF);
    assert.equal(foto.ok, true);
    const fotoKedua = await layanan.addPhoto(putra, { fileId: await unggahan(putra), caption: 'Mudzakarah malam' }, MUSYRIF);
    assert.deepEqual((await layanan.overview(putra, MUSYRIF)).value.gallery.items.map((f) => f.caption), ['Mudzakarah malam', 'Rihlah ke Alexandria']);
    assert.deepEqual((await layanan.forFamily({ role: 'student' })).value.dormitories[0].gallery.map((f) => f.fileId), [fotoKedua.value.fileId, fotoRihlah]);
    assert.equal(await layanan.bolehLihatFoto(putra, { role: 'parent' }), true);
    assert.equal(await layanan.bolehLihatFoto(putri, { role: 'parent' }), false, 'Wali tidak melihat galeri asrama lain.');
    assert.equal(await layanan.bolehLihatFoto(putra, { role: 'teacher' }), false);
    assert.equal(await layanan.bolehUnggahFoto(putri, MUSYRIF), false);
    assert.equal(await layanan.bolehUnggahFoto(putra, MUSYRIF), true);
    assert.equal((await layanan.archivePhoto(putra, fotoKedua.value.id, MUSYRIF)).ok, true);
    assert.deepEqual((await layanan.forFamily({ role: 'parent' })).value.dormitories[0].gallery.map((f) => f.caption), ['Rihlah ke Alexandria']);

    // Sebelum migrasi 051 (tabel 050 sudah ada): galeri kosong, Kelola Asrama tetap jalan.
    await q('DROP TABLE dormitory_gallery');
    const tanpaGaleri = (await layanan.overview(putra, MUSYRIF)).value;
    assert.equal(tanpaGaleri.tersedia, true);
    assert.equal(tanpaGaleri.gallery.tersedia, false);
    assert.deepEqual((await layanan.forFamily({ role: 'parent' })).value.dormitories[0].gallery, []);
    assert.equal((await layanan.addPhoto(putra, { fileId: fotoRihlah }, MUSYRIF)).status, 409);

    // Hapus tugas piket ikut menghapus pembagiannya; hapus jadwal.
    await layanan.deleteDuty(putra, kamar.id, MUSYRIF);
    await layanan.deleteSchedule(putra, rihlah.value.id, MUSYRIF);
    const sesudah = (await layanan.overview(putra, ADMIN)).value;
    assert.equal(sesudah.duties.length, 1);
    assert.ok(!sesudah.schedule.some((j) => j.id === rihlah.value.id));

    // Sebelum migrasi 050: baca kosong, tulis 409.
    for (const tabel of ['dormitory_duty_assignments', 'dormitory_duties', 'dormitory_schedule', 'dormitory_cash_entries', 'dormitory_dues', 'dormitory_inventory']) {
      await q(`DROP TABLE ${tabel}`);
    }
    const lama = await layanan.overview(putra, MUSYRIF);
    assert.equal(lama.ok, true);
    assert.equal(lama.value.tersedia, false);
    assert.equal((await layanan.addSchedule(putra, { title: 'Kajian', dayOfWeek: 1 }, MUSYRIF)).status, 409);
    assert.equal((await layanan.forFamily({ role: 'parent' })).value.tersedia, false);

    console.log('dormitory management tests passed');
  } finally {
    await database.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
