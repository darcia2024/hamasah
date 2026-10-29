'use strict';

const crypto = require('node:crypto');

// AC patungan dan refund (migrasi 075).
//
// Satu unit AC bisa milik Hamasah sepenuhnya ("hamasah") atau hasil patungan santri ("patungan"). Pada AC patungan, kontribusi tiap
// santri dicatat terpisah menurut jenisnya (pembelian atau pemasangan) beserta nominal dan bukti pembayaran, dan ketentuan
// pengembalian disimpan di unit itu (apakah kontribusi pembelian dan/atau pemasangan dapat dikembalikan).
//
// HAK REFUND tidak otomatis: tinggal di kamar ber-AC tidak membuat santri berhak atas pengembalian dana. Hanya santri yang
// punya kontribusi tercatat (belum dibatalkan) pada AC patungan yang bisa diajukan refund, sebesar kontribusi yang boleh dikembalikan
// menurut ketentuan unit itu. Pengajuan dibuat ketika santri keluar (status bukan aktif atau cuti, atau ada permohonan pengunduran
// diri yang disetujui), disetujui admin, lalu dicairkan dengan bukti pencairan.

const JENIS = Object.freeze({ pembelian: 'Pembelian AC', pemasangan: 'Biaya pemasangan' });
const STATUS_REFUND = Object.freeze({ diajukan: 'Menunggu persetujuan', disetujui: 'Disetujui, menunggu pencairan', ditolak: 'Ditolak', dicairkan: 'Sudah dicairkan' });
const DATABASE_BELUM_SIAP = 'Database belum diperbarui untuk AC patungan. Terapkan pembaruan database di halaman Pengaturan lebih dulu.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_KELUAR = Object.freeze(['withdrawn', 'graduated', 'inactive', 'archived']);

function tabelBelumAda(error) {
  if (!error) return false;
  if (['42P01', '42703'].includes(error.code)) return true;
  return /(ac_|dormitory_ac)/.test(String(error.message || '')) && /does not exist/i.test(String(error.message || ''));
}

function rapi(value, maks) {
  return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, maks);
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : (value ? new Date(value).toISOString() : null);
}

function tanggalValid(teks) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(teks || ''))) return false;
  const d = new Date(`${teks}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === teks;
}

function createAcContributionService({ database, staffDormitories, now = () => new Date() } = {}) {
  if (!database || typeof staffDormitories !== 'function') throw new Error('createAcContributionService membutuhkan database dan staffDormitories.');

  const keuangan = (actor) => Boolean(actor && ['admin', 'finance'].includes(actor.role));
  const baca = (actor) => Boolean(actor && ['admin', 'finance', 'supervisor'].includes(actor.role));
  const admin = (actor) => Boolean(actor && actor.role === 'admin');
  const TOLAK = { ok: false, status: 403, error: 'Hanya admin dan keuangan yang mengelola AC patungan dan refund.' };
  const hariIni = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now());

  async function tulis(fn) {
    try { return await fn(); } catch (error) {
      if (tabelBelumAda(error)) return { ok: false, status: 409, error: DATABASE_BELUM_SIAP };
      throw error;
    }
  }

  async function berkas(fileId, dormitoryId) {
    if (fileId === undefined || fileId === null || fileId === '') return null;
    if (!UUID.test(String(fileId))) return false;
    const rows = (await database.query(`SELECT id FROM file_objects WHERE id = $1 AND purpose = 'ac-proof' AND entity_id = $2 AND status = 'ready'`, [fileId, String(dormitoryId)])).rows;
    return rows.length ? rows[0].id : false;
  }

  // ------------------------------------------------------------------ unit AC

  function bentukUnit(r, { rinci }) {
    return {
      id: r.id, dormitoryId: r.dormitory_id, dormitoryName: r.dormitory_name, roomId: r.room_id || null, roomName: r.room_name || null, label: r.label,
      ownership: r.ownership, ownershipLabel: r.ownership === 'hamasah' ? 'Milik Hamasah sepenuhnya' : 'Hasil patungan', purchaseTotal: Number(r.purchase_total_rupiah), installTotal: Number(r.install_total_rupiah),
      purchasedOn: r.purchased_on_text || null, proofFileId: rinci ? r.proof_file_id || null : undefined, refundPurchase: Boolean(r.refund_purchase), refundInstall: Boolean(r.refund_install), terms: r.terms || '',
      contributors: Number(r.kontributor || 0),
      ...(rinci ? { purchaseCollected: Number(r.terkumpul_pembelian || 0), installCollected: Number(r.terkumpul_pemasangan || 0) } : {})
    };
  }

  const SELECT_UNIT = `SELECT u.*, to_char(u.purchased_on, 'YYYY-MM-DD') AS purchased_on_text, d.name AS dormitory_name, r.name AS room_name,
        (SELECT count(DISTINCT c.student_id) FROM ac_contributions c WHERE c.ac_id = u.id AND c.voided_at IS NULL) AS kontributor,
        (SELECT COALESCE(sum(c.amount_rupiah), 0) FROM ac_contributions c WHERE c.ac_id = u.id AND c.voided_at IS NULL AND c.kind = 'pembelian') AS terkumpul_pembelian,
        (SELECT COALESCE(sum(c.amount_rupiah), 0) FROM ac_contributions c WHERE c.ac_id = u.id AND c.voided_at IS NULL AND c.kind = 'pemasangan') AS terkumpul_pemasangan
      FROM dormitory_ac_units u JOIN dormitories d ON d.id = u.dormitory_id LEFT JOIN dormitory_rooms r ON r.id = u.room_id`;

  async function listUnits(actor, { dormitoryId } = {}) {
    if (!baca(actor)) return TOLAK;
    return tulis(async () => {
      const batas = actor.role === 'supervisor' ? ((await staffDormitories(actor.id)) || []) : null;
      const { rows } = await database.query(
        `${SELECT_UNIT} WHERE u.archived_at IS NULL AND ($1::uuid IS NULL OR u.dormitory_id = $1::uuid) AND ($2::uuid[] IS NULL OR u.dormitory_id = ANY($2::uuid[])) ORDER BY d.name, u.label`,
        [dormitoryId && UUID.test(dormitoryId) ? dormitoryId : null, batas]
      );
      const dormitories = (await database.query('SELECT id, name FROM dormitories WHERE ($1::uuid[] IS NULL OR id = ANY($1::uuid[])) ORDER BY name', [batas])).rows;
      const kamar = (await database.query('SELECT r.id, r.name, r.dormitory_id FROM dormitory_rooms r WHERE ($1::uuid[] IS NULL OR r.dormitory_id = ANY($1::uuid[])) ORDER BY r.name', [batas]).catch((e) => (tabelBelumAda(e) ? { rows: [] } : Promise.reject(e)))).rows;
      return { ok: true, value: { available: true, items: rows.map((r) => bentukUnit(r, { rinci: keuangan(actor) })), dormitories, rooms: kamar, canManage: keuangan(actor), canApprove: admin(actor), kinds: Object.entries(JENIS).map(([id, label]) => ({ id, label })) } };
    });
  }

  async function periksaUnit(sumber, lama = null) {
    const ambil = (k, b) => (sumber[k] === undefined ? b : sumber[k]);
    const dormitoryId = ambil('dormitoryId', lama && lama.dormitory_id);
    if (!UUID.test(String(dormitoryId))) return { ok: false, error: 'Pilih asrama.' };
    const asrama = (await database.query('SELECT id FROM dormitories WHERE id = $1', [dormitoryId])).rows[0];
    if (!asrama) return { ok: false, status: 404, error: 'Asrama tidak ditemukan.' };
    const label = rapi(ambil('label', lama && lama.label), 80);
    if (label.length < 2) return { ok: false, error: 'Label AC minimal 2 huruf (misalnya "AC Kamar 3").' };
    const ownership = ambil('ownership', lama && lama.ownership);
    if (!['hamasah', 'patungan'].includes(ownership)) return { ok: false, error: 'Tandai AC milik Hamasah sepenuhnya atau hasil patungan.' };
    const roomId = ambil('roomId', lama && lama.room_id) || null;
    if (roomId) {
      const kamar = UUID.test(String(roomId)) ? (await database.query('SELECT id FROM dormitory_rooms WHERE id = $1 AND dormitory_id = $2', [roomId, dormitoryId])).rows[0] : null;
      if (!kamar) return { ok: false, error: 'Kamar tidak ditemukan di asrama ini.' };
    }
    const uang = (k, nama) => { const n = Math.round(Number(ambil(k, lama ? Number(lama[nama]) : 0) || 0)); return Number.isFinite(n) && n >= 0 ? n : null; };
    const beli = uang('purchaseTotal', 'purchase_total_rupiah');
    const pasang = uang('installTotal', 'install_total_rupiah');
    if (beli === null || pasang === null) return { ok: false, error: 'Nominal tidak valid.' };
    const tanggal = ambil('purchasedOn', lama && lama.purchased_on_text) || null;
    if (tanggal && (!tanggalValid(tanggal) || tanggal > hariIni())) return { ok: false, error: 'Tanggal pembelian tidak valid atau di masa depan.' };
    const terms = rapi(ambil('terms', lama && lama.terms), 1000);
    if (ownership === 'patungan' && terms.length < 10) return { ok: false, error: 'AC patungan wajib memuat ketentuan pengembalian (minimal 10 karakter), misalnya: kontribusi pembelian dikembalikan penuh bila santri keluar sebelum 1 tahun.' };
    const bukti = await berkas(ambil('proofFileId', lama && lama.proof_file_id), dormitoryId);
    if (bukti === false) return { ok: false, error: 'Berkas bukti tidak ditemukan untuk asrama ini.' };
    return { ok: true, value: { dormitoryId, label, ownership, roomId, beli, pasang, tanggal, terms, bukti, refundPurchase: Boolean(ambil('refundPurchase', lama ? lama.refund_purchase : true)), refundInstall: Boolean(ambil('refundInstall', lama ? lama.refund_install : false)) } };
  }

  async function createUnit(input, actor) {
    if (!keuangan(actor)) return TOLAK;
    return tulis(async () => {
      const v = await periksaUnit(input || {});
      if (!v.ok) return v;
      const id = crypto.randomUUID();
      await database.query(
        `INSERT INTO dormitory_ac_units (id, dormitory_id, room_id, label, ownership, purchase_total_rupiah, install_total_rupiah, purchased_on, proof_file_id, refund_purchase, refund_install, terms, created_by_account_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [id, v.value.dormitoryId, v.value.roomId, v.value.label, v.value.ownership, v.value.beli, v.value.pasang, v.value.tanggal, v.value.bukti, v.value.refundPurchase, v.value.refundInstall, v.value.terms, actor.id || null]
      );
      return { ok: true, value: bentukUnit((await database.query(`${SELECT_UNIT} WHERE u.id = $1`, [id])).rows[0], { rinci: true }) };
    });
  }

  async function updateUnit(id, input, actor) {
    if (!keuangan(actor)) return TOLAK;
    if (!UUID.test(String(id))) return { ok: false, status: 404, error: 'AC tidak ditemukan.' };
    return tulis(async () => {
      const lama = (await database.query(`${SELECT_UNIT} WHERE u.id = $1 AND u.archived_at IS NULL`, [id])).rows[0];
      if (!lama) return { ok: false, status: 404, error: 'AC tidak ditemukan.' };
      const v = await periksaUnit({ ...(input || {}), dormitoryId: lama.dormitory_id }, lama);
      if (!v.ok) return v;
      // Mengubah kepemilikan menjadi milik Hamasah penuh tidak boleh menghapus kontribusi yang sudah tercatat.
      if (v.value.ownership === 'hamasah' && Number(lama.kontributor) > 0) return { ok: false, status: 409, error: 'AC ini sudah punya kontribusi santri; batalkan kontribusinya lebih dulu bila memang milik Hamasah sepenuhnya.' };
      await database.query(
        `UPDATE dormitory_ac_units SET room_id = $2, label = $3, ownership = $4, purchase_total_rupiah = $5, install_total_rupiah = $6, purchased_on = $7, proof_file_id = $8, refund_purchase = $9, refund_install = $10, terms = $11 WHERE id = $1`,
        [id, v.value.roomId, v.value.label, v.value.ownership, v.value.beli, v.value.pasang, v.value.tanggal, v.value.bukti, v.value.refundPurchase, v.value.refundInstall, v.value.terms]
      );
      return { ok: true, value: bentukUnit((await database.query(`${SELECT_UNIT} WHERE u.id = $1`, [id])).rows[0], { rinci: true }) };
    });
  }

  // ------------------------------------------------------------------ kontribusi

  function bentukKontribusi(r) {
    return { id: r.id, acId: r.ac_id, studentId: r.student_id, studentName: r.student_name, kind: r.kind, kindLabel: JENIS[r.kind], amount: Number(r.amount_rupiah), paidOn: r.paid_on_text, proofFileId: r.proof_file_id || null, note: r.note || '', voided: Boolean(r.voided_at), voidReason: r.void_reason || '' };
  }

  async function listContributions(acId, actor) {
    if (!keuangan(actor)) return TOLAK;
    if (!UUID.test(String(acId))) return { ok: false, status: 404, error: 'AC tidak ditemukan.' };
    return tulis(async () => {
      const unit = (await database.query(`${SELECT_UNIT} WHERE u.id = $1`, [acId])).rows[0];
      if (!unit) return { ok: false, status: 404, error: 'AC tidak ditemukan.' };
      const { rows } = await database.query(
        `SELECT c.*, to_char(c.paid_on, 'YYYY-MM-DD') AS paid_on_text, s.name AS student_name FROM ac_contributions c JOIN students s ON s.id = c.student_id WHERE c.ac_id = $1 ORDER BY c.voided_at NULLS FIRST, c.paid_on DESC`, [acId]
      );
      const siswa = (await database.query(`SELECT id, name FROM students WHERE dormitory_id = $1 AND status IN ('active', 'leave') ORDER BY name`, [unit.dormitory_id])).rows;
      return { ok: true, value: { unit: bentukUnit(unit, { rinci: true }), items: rows.map(bentukKontribusi), students: siswa } };
    });
  }

  async function addContribution(acId, input, actor) {
    if (!keuangan(actor)) return TOLAK;
    if (!UUID.test(String(acId))) return { ok: false, status: 404, error: 'AC tidak ditemukan.' };
    const s = input || {};
    if (!JENIS[s.kind]) return { ok: false, error: 'Pilih jenis kontribusi: pembelian atau pemasangan.' };
    const jumlah = Math.round(Number(s.amount));
    if (!Number.isFinite(jumlah) || jumlah <= 0) return { ok: false, error: 'Nominal harus lebih dari nol.' };
    if (!tanggalValid(s.paidOn) || s.paidOn > hariIni()) return { ok: false, error: 'Tanggal bayar tidak valid atau di masa depan.' };
    if (!UUID.test(String(s.studentId))) return { ok: false, error: 'Pilih santri.' };
    return tulis(async () => {
      const unit = (await database.query(`${SELECT_UNIT} WHERE u.id = $1 AND u.archived_at IS NULL`, [acId])).rows[0];
      if (!unit) return { ok: false, status: 404, error: 'AC tidak ditemukan.' };
      if (unit.ownership !== 'patungan') return { ok: false, status: 409, error: 'AC ini milik Hamasah sepenuhnya, tidak menerima kontribusi santri.' };
      const santri = (await database.query('SELECT id, dormitory_id, status FROM students WHERE id = $1', [s.studentId])).rows[0];
      if (!santri || santri.dormitory_id !== unit.dormitory_id || !['active', 'leave'].includes(santri.status)) return { ok: false, status: 422, error: 'Santri harus penghuni asrama AC ini.' };
      // Total kontribusi satu jenis tidak boleh melebihi total biaya jenis itu (bila total diisi).
      const total = s.kind === 'pembelian' ? Number(unit.purchase_total_rupiah) : Number(unit.install_total_rupiah);
      const terkumpul = s.kind === 'pembelian' ? Number(unit.terkumpul_pembelian) : Number(unit.terkumpul_pemasangan);
      if (total > 0 && terkumpul + jumlah > total) return { ok: false, status: 422, error: `Kontribusi melebihi total ${JENIS[s.kind].toLowerCase()} (${total}). Tersisa ${total - terkumpul}.` };
      const bukti = await berkas(s.proofFileId, unit.dormitory_id);
      if (bukti === false) return { ok: false, error: 'Berkas bukti pembayaran tidak ditemukan.' };
      const id = crypto.randomUUID();
      await database.query('INSERT INTO ac_contributions (id, ac_id, student_id, kind, amount_rupiah, paid_on, proof_file_id, note, created_by_account_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [id, acId, s.studentId, s.kind, jumlah, s.paidOn, bukti, rapi(s.note, 300), actor.id || null]);
      const r = (await database.query(`SELECT c.*, to_char(c.paid_on, 'YYYY-MM-DD') AS paid_on_text, st.name AS student_name FROM ac_contributions c JOIN students st ON st.id = c.student_id WHERE c.id = $1`, [id])).rows[0];
      return { ok: true, value: bentukKontribusi(r) };
    });
  }

  async function voidContribution(id, input, actor) {
    if (!keuangan(actor)) return TOLAK;
    const alasan = rapi(input && input.reason, 300);
    if (alasan.length < 5) return { ok: false, error: 'Alasan pembatalan wajib diisi (minimal 5 karakter).' };
    if (!UUID.test(String(id))) return { ok: false, status: 404, error: 'Kontribusi tidak ditemukan.' };
    return tulis(async () => {
      const r = (await database.query('SELECT voided_at, student_id, ac_id FROM ac_contributions WHERE id = $1', [id])).rows[0];
      if (!r) return { ok: false, status: 404, error: 'Kontribusi tidak ditemukan.' };
      if (r.voided_at) return { ok: false, status: 409, error: 'Kontribusi ini sudah dibatalkan.' };
      const refund = (await database.query(`SELECT 1 FROM ac_refunds WHERE ac_id = $1 AND student_id = $2 AND status IN ('diajukan', 'disetujui', 'dicairkan')`, [r.ac_id, r.student_id])).rows[0];
      if (refund) return { ok: false, status: 409, error: 'Santri ini sudah punya pengajuan refund untuk AC tersebut; kontribusinya tidak bisa dibatalkan.' };
      await database.query('UPDATE ac_contributions SET voided_at = $2, void_reason = $3 WHERE id = $1', [id, now(), alasan]);
      return { ok: true, value: { id, voided: true } };
    });
  }

  // ------------------------------------------------------------------ hak refund

  // Hak refund per AC untuk satu santri: hanya dari kontribusi tercatat, menurut ketentuan unit itu.
  async function hitungHak(studentId) {
    const { rows } = await database.query(
      `SELECT u.id AS ac_id, u.label, u.refund_purchase, u.refund_install, u.terms, d.name AS dormitory_name,
              COALESCE(sum(c.amount_rupiah) FILTER (WHERE c.kind = 'pembelian'), 0)::bigint AS pembelian,
              COALESCE(sum(c.amount_rupiah) FILTER (WHERE c.kind = 'pemasangan'), 0)::bigint AS pemasangan
         FROM ac_contributions c JOIN dormitory_ac_units u ON u.id = c.ac_id JOIN dormitories d ON d.id = u.dormitory_id
        WHERE c.student_id = $1 AND c.voided_at IS NULL AND u.ownership = 'patungan' GROUP BY u.id, u.label, u.refund_purchase, u.refund_install, u.terms, d.name`, [studentId]
    );
    const refund = (await database.query(`SELECT id, ac_id, status FROM ac_refunds WHERE student_id = $1`, [studentId])).rows;
    return rows.map((r) => {
      const eligible = (r.refund_purchase ? Number(r.pembelian) : 0) + (r.refund_install ? Number(r.pemasangan) : 0);
      const terbuka = refund.find((f) => f.ac_id === r.ac_id && ['diajukan', 'disetujui', 'dicairkan'].includes(f.status));
      return { acId: r.ac_id, label: r.label, dormitoryName: r.dormitory_name, purchaseContribution: Number(r.pembelian), installContribution: Number(r.pemasangan), refundPurchase: Boolean(r.refund_purchase), refundInstall: Boolean(r.refund_install), terms: r.terms, eligibleAmount: eligible, existingRefundId: terbuka ? terbuka.id : null, existingRefundStatus: terbuka ? terbuka.status : null };
    });
  }

  async function santriKeluar(studentId) {
    const s = (await database.query('SELECT id, name, status FROM students WHERE id = $1', [studentId])).rows[0];
    if (!s) return null;
    let suratKeluar = null;
    try {
      suratKeluar = (await database.query(`SELECT l.id FROM letters l JOIN letter_types t ON t.id = l.type_id WHERE l.student_id = $1 AND t.exit_flow AND l.status = 'disetujui' ORDER BY l.created_at DESC LIMIT 1`, [studentId])).rows[0] || null;
    } catch (error) { if (!tabelBelumAda(error) && error.code !== '42P01' && error.code !== '42703') throw error; }
    return { ...s, exitLetterId: suratKeluar ? suratKeluar.id : null, left: STATUS_KELUAR.includes(s.status) || Boolean(suratKeluar) };
  }

  async function refundPreview(studentId, actor) {
    if (!keuangan(actor)) return TOLAK;
    if (!UUID.test(String(studentId))) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    return tulis(async () => {
      const s = await santriKeluar(studentId);
      if (!s) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
      const hak = await hitungHak(studentId);
      return { ok: true, value: { studentId, studentName: s.name, left: s.left, status: s.status, exitLetterId: s.exitLetterId, entitlements: hak, note: hak.length ? 'Hak refund hanya dari kontribusi yang tercatat, menurut ketentuan tiap AC.' : 'Santri ini tidak punya kontribusi AC patungan yang tercatat, jadi tidak ada hak pengembalian dana. Tinggal di kamar ber-AC tidak otomatis berhak atas refund.' } };
    });
  }

  function bentukRefund(r) {
    return {
      id: r.id, acId: r.ac_id, acLabel: r.ac_label, dormitoryName: r.dormitory_name, studentId: r.student_id, studentName: r.student_name, letterId: r.letter_id || null,
      eligibleAmount: Number(r.eligible_amount_rupiah), approvedAmount: r.approved_amount_rupiah === null ? null : Number(r.approved_amount_rupiah), basis: r.basis || '', status: r.status, statusLabel: STATUS_REFUND[r.status],
      decisionNote: r.decision_note || '', decidedBy: r.decided_by || null, decidedAt: iso(r.decided_at), disbursedOn: r.disbursed_on_text || null, disbursementProofFileId: r.disbursement_proof_file_id || null, createdAt: iso(r.created_at)
    };
  }

  const SELECT_REFUND = `SELECT f.*, u.label AS ac_label, u.dormitory_id, d.name AS dormitory_name, s.name AS student_name, a.name AS decided_by, to_char(f.disbursed_on, 'YYYY-MM-DD') AS disbursed_on_text
      FROM ac_refunds f JOIN dormitory_ac_units u ON u.id = f.ac_id JOIN dormitories d ON d.id = u.dormitory_id JOIN students s ON s.id = f.student_id LEFT JOIN accounts a ON a.id = f.decided_by_account_id`;

  // Pengajuan refund saat santri keluar: satu pengajuan per AC yang santri itu benar-benar berkontribusi.
  async function requestRefund(studentId, input, actor) {
    if (!keuangan(actor)) return TOLAK;
    if (!UUID.test(String(studentId))) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
    return tulis(async () => {
      const s = await santriKeluar(studentId);
      if (!s) return { ok: false, status: 404, error: 'Santri tidak ditemukan.' };
      if (!s.left) return { ok: false, status: 409, error: 'Pengajuan refund dibuat ketika santri keluar. Santri ini masih aktif dan belum punya permohonan pengunduran diri yang disetujui.' };
      const hak = (await hitungHak(studentId)).filter((h) => h.eligibleAmount > 0 && !h.existingRefundId);
      if (!hak.length) {
        const adaKontribusi = (await hitungHak(studentId)).length > 0;
        return { ok: false, status: 409, error: adaKontribusi ? 'Tidak ada hak refund yang tersisa: sudah diajukan, atau ketentuan AC tidak mengizinkan pengembalian untuk jenis kontribusinya.' : 'Santri ini tidak punya kontribusi AC patungan yang tercatat, jadi tidak berhak atas pengembalian dana. Tinggal di kamar ber-AC tidak otomatis berhak refund.' };
      }
      const dibuat = [];
      for (const h of hak) {
        const id = crypto.randomUUID();
        await database.query(
          'INSERT INTO ac_refunds (id, ac_id, student_id, letter_id, eligible_amount_rupiah, basis, created_by_account_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [id, h.acId, studentId, s.exitLetterId, h.eligibleAmount, `Pembelian ${h.purchaseContribution}${h.refundPurchase ? '' : ' (tidak dikembalikan)'}; pemasangan ${h.installContribution}${h.refundInstall ? '' : ' (tidak dikembalikan)'}. Ketentuan: ${h.terms}`.slice(0, 800), actor.id || null, now()]
        );
        dibuat.push(id);
      }
      const { rows } = await database.query(`${SELECT_REFUND} WHERE f.id = ANY($1::uuid[]) ORDER BY u.label`, [dibuat]);
      return { ok: true, value: { items: rows.map(bentukRefund) } };
    });
  }

  async function listRefunds(actor, status) {
    if (!keuangan(actor)) return TOLAK;
    return tulis(async () => {
      const { rows } = await database.query(`${SELECT_REFUND} WHERE ($1::text IS NULL OR f.status = $1) ORDER BY f.created_at DESC LIMIT 200`, [STATUS_REFUND[status] ? status : null]);
      return { ok: true, value: { available: true, items: rows.map(bentukRefund), canApprove: admin(actor) } };
    });
  }

  async function decideRefund(id, input, actor) {
    if (!admin(actor)) return { ok: false, status: 403, error: 'Hanya admin yang menyetujui atau menolak refund.' };
    const keputusan = String(input && input.decision || '');
    if (!['disetujui', 'ditolak'].includes(keputusan)) return { ok: false, error: 'Keputusan harus disetujui atau ditolak.' };
    const catatan = rapi(input && input.note, 500);
    if (keputusan === 'ditolak' && catatan.length < 5) return { ok: false, error: 'Tulis alasan penolakan (minimal 5 karakter).' };
    if (!UUID.test(String(id))) return { ok: false, status: 404, error: 'Pengajuan tidak ditemukan.' };
    return tulis(async () => {
      const f = (await database.query('SELECT * FROM ac_refunds WHERE id = $1', [id])).rows[0];
      if (!f) return { ok: false, status: 404, error: 'Pengajuan tidak ditemukan.' };
      if (f.status !== 'diajukan') return { ok: false, status: 409, error: 'Pengajuan ini sudah diputuskan.' };
      let jumlah = null;
      if (keputusan === 'disetujui') {
        jumlah = input.approvedAmount === undefined ? Number(f.eligible_amount_rupiah) : Math.round(Number(input.approvedAmount));
        if (!Number.isFinite(jumlah) || jumlah < 0 || jumlah > Number(f.eligible_amount_rupiah)) return { ok: false, error: `Nominal disetujui harus antara 0 dan ${Number(f.eligible_amount_rupiah)} (hak refund menurut kontribusi).` };
        if (jumlah < Number(f.eligible_amount_rupiah) && catatan.length < 5) return { ok: false, error: 'Nominal lebih kecil dari hak refund wajib disertai alasan.' };
      }
      await database.query('UPDATE ac_refunds SET status = $2, approved_amount_rupiah = $3, decision_note = $4, decided_by_account_id = $5, decided_at = $6 WHERE id = $1', [id, keputusan, jumlah, catatan, actor.id || null, now()]);
      return { ok: true, value: bentukRefund((await database.query(`${SELECT_REFUND} WHERE f.id = $1`, [id])).rows[0]) };
    });
  }

  async function disburseRefund(id, input, actor) {
    if (!keuangan(actor)) return TOLAK;
    if (!UUID.test(String(id))) return { ok: false, status: 404, error: 'Pengajuan tidak ditemukan.' };
    const tanggal = String(input && input.disbursedOn || '');
    if (!tanggalValid(tanggal) || tanggal > hariIni()) return { ok: false, error: 'Tanggal pencairan tidak valid atau di masa depan.' };
    return tulis(async () => {
      const f = (await database.query(`${SELECT_REFUND} WHERE f.id = $1`, [id])).rows[0];
      if (!f) return { ok: false, status: 404, error: 'Pengajuan tidak ditemukan.' };
      if (f.status !== 'disetujui') return { ok: false, status: 409, error: f.status === 'dicairkan' ? 'Refund ini sudah dicairkan.' : 'Refund harus disetujui admin lebih dulu.' };
      const bukti = await berkas(input && input.proofFileId, f.dormitory_id);
      if (!bukti) return { ok: false, error: 'Bukti pencairan wajib dilampirkan.' };
      await database.query(`UPDATE ac_refunds SET status = 'dicairkan', disbursed_on = $2, disbursed_by_account_id = $3, disbursement_proof_file_id = $4 WHERE id = $1`, [id, tanggal, actor.id || null, bukti]);
      return { ok: true, value: bentukRefund((await database.query(`${SELECT_REFUND} WHERE f.id = $1`, [id])).rows[0]) };
    });
  }

  // Ringkasan untuk daftar periksa keluar santri (surat dan arsip): berapa kontribusi dan refund yang masih terbuka.
  async function studentState(studentId) {
    try {
      const hak = await hitungHak(studentId);
      return {
        contributions: hak.length,
        eligibleUnrequested: hak.filter((h) => h.eligibleAmount > 0 && !h.existingRefundId).length,
        pending: hak.filter((h) => ['diajukan', 'disetujui'].includes(h.existingRefundStatus)).length,
        hint: hak.length
          ? `Santri berkontribusi pada ${hak.length} AC patungan. ${hak.map((h) => `${h.label}: hak ${h.eligibleAmount}${h.existingRefundStatus ? ` (${STATUS_REFUND[h.existingRefundStatus].toLowerCase()})` : ' (belum diajukan)'}`).join('; ')}.`
          : 'Santri tidak punya kontribusi AC patungan tercatat, jadi tidak ada hak refund AC (tinggal di kamar ber-AC tidak otomatis berhak).'
      };
    } catch (error) {
      if (tabelBelumAda(error)) return null;
      throw error;
    }
  }

  return { listUnits, createUnit, updateUnit, listContributions, addContribution, voidContribution, refundPreview, requestRefund, listRefunds, decideRefund, disburseRefund, studentState };
}

module.exports = { createAcContributionService, JENIS, STATUS_REFUND };
