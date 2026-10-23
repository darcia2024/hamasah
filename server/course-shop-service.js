const crypto = require('node:crypto');

// Toko kelas daring Hamasah Courses (halaman kelas.html, migrasi 049).
//
// Alurnya memakai bagian sistem yang sudah ada, bukan membuat versi kedua:
// - Pembeli mendaftar sendiri dan menjadi akun santri (role 'student') dengan data santri
//   program Hamasah Courses, jadi langsung bisa memakai Ruang belajar di LMS.
// - Membeli kelas menerbitkan tagihan biasa (invoices). Pembeli membayar lewat transfer
//   lalu mengonfirmasi ke admin lewat WhatsApp.
// - Saat keuangan menandai tagihan itu lunas di konsol, pembeli otomatis didaftarkan ke
//   maddah yang dibelinya (onInvoicePaid, dipanggil route tandai lunas).
//
// Selama migrasi 049 belum diterapkan, katalog kosong dan pembelian ditolak dengan pesan
// yang jelas, tanpa membuat halaman lain gagal.

const PROGRAM_KELAS = 'Hamasah Courses';
const HARGA_MAKS = 100000000;
const BELUM_SIAP = 'Toko kelas belum aktif. Admin perlu menerapkan pembaruan database terlebih dahulu.';

function tabelBelumAda(error) {
  if (!error) return false;
  if (error.code === '42P01') return true;
  return /course_(listings|orders)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function tanggalJakarta(waktu) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(waktu));
}

function createCourseShopService(options) {
  const { database, identityService, studentStore, operationsService, lmsStore, settingsService } = options;
  const now = options.now || function waktuSekarang() { return new Date().toISOString(); };

  // Kueri yang menyentuh tabel migrasi 049. Bila tabelnya belum ada, kembalikan `cadangan`.
  async function aman(kueri, cadangan) {
    try {
      return await kueri();
    } catch (error) {
      if (tabelBelumAda(error)) return cadangan;
      throw error;
    }
  }

  async function rekening() {
    try {
      return await settingsService.ambil('kelas.rekening');
    } catch {
      return '';
    }
  }

  // Kelas yang tampil di halaman publik: hanya yang diterbitkan, dengan jumlah materi aktif.
  async function catalog() {
    return aman(async () => {
      const { rows } = await database.query(
        `SELECT c.id, c.title, c.description, l.price_rupiah,
                (SELECT count(*)::int FROM course_materials m WHERE m.course_id = c.id AND m.archived_at IS NULL) AS material_count
           FROM course_listings l JOIN courses c ON c.id = l.course_id
          WHERE l.published
          ORDER BY c.title ASC`
      );
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        price: Number(row.price_rupiah),
        materialCount: row.material_count
      }));
    }, []);
  }

  async function santriMilik(actor) {
    if (!actor || actor.role !== 'student') return null;
    const { rows } = await database.query('SELECT id, name, program FROM students WHERE student_account_id = $1', [actor.id]);
    return rows[0] || null;
  }

  // Daftar akun pembeli: akun santri baru + data santri jalur Hamasah Courses, lalu langsung
  // masuk (sesi dibuat lewat login biasa, jadi aturan sesi sama dengan akun lain).
  async function signup(input) {
    const sumber = input || {};
    const name = String(sumber.name || '').trim();
    const email = String(sumber.email || '').trim().toLocaleLowerCase('en-US');
    const password = String(sumber.password || '');
    const city = String(sumber.city || '').trim().slice(0, 80);
    if (name.length < 3) return { ok: false, error: 'Tulis nama lengkap minimal 3 huruf.', field: 'name' };
    if (sumber.consent !== true) return { ok: false, error: 'Centang persetujuan pemrosesan data lebih dulu.', field: 'consent' };

    const dibuat = await identityService.createAccount({ email, name, password, role: 'student' });
    if (!dibuat.ok) {
      const pesan = dibuat.error === 'Email sudah digunakan.'
        ? 'Email ini sudah terdaftar. Silakan masuk dengan kata sandinya.'
        : dibuat.error;
      return { ok: false, error: pesan, field: dibuat.error === 'Email sudah digunakan.' ? 'email' : null };
    }
    const waktu = now();
    await studentStore.saveStudent({
      id: crypto.randomUUID(),
      name,
      program: PROGRAM_KELAS,
      city: city || 'Belum diisi',
      joinDate: tanggalJakarta(waktu),
      status: 'active',
      studentAccountId: dibuat.value.id,
      parentAccountIds: [],
      createdAt: waktu,
      updatedAt: waktu
    });
    const masuk = await identityService.login(email, password);
    if (!masuk.ok) return { ok: false, error: 'Akun dibuat, tetapi belum bisa masuk otomatis. Silakan masuk.' };
    return { ok: true, value: masuk.value };
  }

  // Ringkasan untuk pembeli yang sedang masuk: pesanan, kelas yang sudah aktif, dan cara bayar.
  async function myOverview(actor) {
    const santri = await santriMilik(actor);
    if (!santri) return { ok: false, status: 403, error: 'Halaman kelas hanya untuk akun pembeli kelas atau santri.' };
    const [orders, enrolled] = await Promise.all([
      aman(async () => {
        const { rows } = await database.query(
          `SELECT o.id, o.course_id, o.created_at, c.title, i.invoice_number, i.amount_rupiah, i.status
             FROM course_orders o
             JOIN courses c ON c.id = o.course_id
             JOIN invoices i ON i.id = o.invoice_id
            WHERE o.student_id = $1
            ORDER BY o.created_at DESC`,
          [santri.id]
        );
        return rows.map((row) => ({
          id: row.id,
          courseId: row.course_id,
          courseTitle: row.title,
          invoiceNumber: row.invoice_number,
          amount: Number(row.amount_rupiah),
          status: row.status,
          createdAt: new Date(row.created_at).toISOString()
        }));
      }, []),
      database.query('SELECT course_id FROM course_enrollments WHERE student_id = $1', [santri.id]).then((r) => r.rows.map((row) => row.course_id))
    ]);
    return {
      ok: true,
      value: {
        student: { id: santri.id, name: santri.name },
        orders,
        enrolledCourseIds: enrolled,
        bankAccount: await rekening()
      }
    };
  }

  // Membeli satu kelas: menerbitkan tagihan dan mencatat pesanannya. Bila sudah ada tagihan
  // yang belum dibayar untuk kelas yang sama, tagihan itu yang dikembalikan (tidak dobel).
  async function buy(courseId, actor) {
    const santri = await santriMilik(actor);
    if (!santri) return { ok: false, status: 403, error: 'Masuk dengan akun pembeli kelas lebih dulu.' };
    const hasil = await aman(() => database.withTransaction(async (tx) => {
      await tx.query('SELECT id FROM students WHERE id = $1 FOR UPDATE', [santri.id]);
      const { rows: listing } = await tx.query(
        `SELECT c.id, c.title, l.price_rupiah FROM course_listings l JOIN courses c ON c.id = l.course_id
          WHERE l.course_id = $1 AND l.published`,
        [courseId]
      );
      if (!listing.length) return { ok: false, status: 404, error: 'Kelas tidak ditemukan atau sedang tidak dijual.' };
      const kelas = listing[0];

      const { rows: terdaftar } = await tx.query(
        'SELECT 1 FROM course_enrollments WHERE student_id = $1 AND course_id = $2', [santri.id, courseId]
      );
      if (terdaftar.length) return { ok: false, status: 409, error: 'Anda sudah terdaftar di kelas ini. Buka Ruang belajar untuk mulai.' };

      const { rows: menunggu } = await tx.query(
        `SELECT o.id, i.invoice_number, i.amount_rupiah FROM course_orders o JOIN invoices i ON i.id = o.invoice_id
          WHERE o.student_id = $1 AND o.course_id = $2 AND i.status IN ('unpaid', 'paid')`,
        [santri.id, courseId]
      );
      if (menunggu.length) {
        return { ok: true, value: { orderId: menunggu[0].id, courseTitle: kelas.title, invoiceNumber: menunggu[0].invoice_number, amount: Number(menunggu[0].amount_rupiah), existing: true } };
      }

      const tagihan = await operationsService.issueCourseInvoice(santri.id, `Kelas daring: ${kelas.title}`, Number(kelas.price_rupiah), tx);
      const orderId = crypto.randomUUID();
      await tx.query(
        'INSERT INTO course_orders (id, student_id, course_id, invoice_id, created_at) VALUES ($1, $2, $3, $4, $5)',
        [orderId, santri.id, courseId, tagihan.id, now()]
      );
      return { ok: true, value: { orderId, courseTitle: kelas.title, invoiceNumber: tagihan.number, amount: tagihan.amount, existing: false } };
    }), null);
    return hasil || { ok: false, status: 503, error: BELUM_SIAP };
  }

  // Dipanggil setelah tagihan ditandai lunas. Bila tagihan itu milik pembelian kelas,
  // pembelinya didaftarkan ke maddah. Mengembalikan courseId yang dibuka, atau null.
  async function onInvoicePaid(invoiceId) {
    return aman(async () => {
      const { rows } = await database.query("SELECT o.student_id, o.course_id FROM course_orders o JOIN invoices i ON i.id = o.invoice_id WHERE o.invoice_id = $1 AND i.status = 'paid'", [invoiceId]);
      if (!rows.length) return null;
      await lmsStore.addEnrollment(rows[0].student_id, rows[0].course_id, now());
      return rows[0].course_id;
    }, null);
  }

  async function reconcilePaidInvoices(actor) {
    if (!actor || !['admin', 'finance'].includes(actor.role)) return { ok: false, status: 403, error: 'Akses admin atau keuangan diperlukan.' };
    const { rows } = await database.query(`SELECT o.invoice_id FROM course_orders o JOIN invoices i ON i.id = o.invoice_id
      WHERE i.status = 'paid' AND NOT EXISTS (SELECT 1 FROM course_enrollments e WHERE e.student_id = o.student_id AND e.course_id = o.course_id)`);
    const report = { checked: rows.length, reconciled: [], failed: [] };
    for (const row of rows) {
      try {
        const courseId = await onInvoicePaid(row.invoice_id);
        if (courseId) report.reconciled.push({ invoiceId: row.invoice_id, courseId });
        else report.failed.push(row.invoice_id);
      } catch { report.failed.push(row.invoice_id); }
    }
    return { ok: true, value: report };
  }

  // Konsol: semua maddah beserta harga dan status tampilnya (null bila belum pernah diatur).
  async function listListings() {
    const daftar = await aman(async () => {
      const { rows } = await database.query('SELECT course_id, price_rupiah, published FROM course_listings');
      return rows;
    }, null);
    if (daftar === null) return { ok: false, status: 503, error: BELUM_SIAP };
    return {
      ok: true,
      value: daftar.map((row) => ({ courseId: row.course_id, price: Number(row.price_rupiah), published: row.published }))
    };
  }

  async function saveListing(courseId, input) {
    const sumber = input || {};
    const harga = Number(sumber.price);
    const published = sumber.published === true;
    if (!Number.isInteger(harga) || harga <= 0 || harga > HARGA_MAKS) {
      return { ok: false, status: 422, error: 'Harga kelas harus angka rupiah lebih dari 0.' };
    }
    const hasil = await aman(async () => {
      const { rows: ada } = await database.query('SELECT 1 FROM courses WHERE id = $1', [courseId]);
      if (!ada.length) return { ok: false, status: 404, error: 'Maddah tidak ditemukan.' };
      await database.query(
        `INSERT INTO course_listings (course_id, price_rupiah, published, updated_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (course_id) DO UPDATE SET price_rupiah = EXCLUDED.price_rupiah, published = EXCLUDED.published, updated_at = EXCLUDED.updated_at`,
        [courseId, harga, published, now()]
      );
      return { ok: true, value: { courseId, price: harga, published } };
    }, null);
    return hasil || { ok: false, status: 503, error: BELUM_SIAP };
  }

  return Object.freeze({ catalog, signup, myOverview, buy, onInvoicePaid, reconcilePaidInvoices, listListings, saveListing });
}

module.exports = { PROGRAM_KELAS, createCourseShopService };
