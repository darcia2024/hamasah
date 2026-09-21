// Modul sisi server: aturan transisi status pendaftaran, penanganan token akses,
// dan listForStaff. Sebelum Task R2.1 berkas ini berada di website/ sehingga dapat
// diunduh siapa pun di /website/registration-service.js. Tidak ada satu pun halaman
// yang memuatnya lewat <script>, jadi cabang UMD untuk browser ikut dicabut.
(function registrationServiceModule(factory) {
  module.exports = factory(require('../website/registration-domain.js'));
})(function registrationServiceFactory(domain) {
  'use strict';

  if (!domain) {
    throw new Error('registration-domain.js gagal dimuat.');
  }

  const DOCUMENT_TYPES = Object.freeze([
    'passport',
    'diploma',
    'transcript',
    'health-certificate',
    'photo',
    'other'
  ]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createMemoryStore() {
    const records = new Map();
    const counters = new Map();

    return {
      nextSequence(scope, year) {
        const key = `${scope}:${year}`;
        const next = (counters.get(key) || 0) + 1;
        counters.set(key, next);
        return next;
      },
      insert(record) {
        if (records.has(record.registrationId)) {
          throw new Error(`Nomor registrasi ${record.registrationId} sudah dipakai.`);
        }
        records.set(record.registrationId, clone(record));
        return clone(record);
      },
      async update(record) {
        const existing = records.get(record.registrationId);
        if (existing && record.version !== undefined && record.version !== existing.version) {
          throw new Error('Konflik versi pendaftaran. Muat ulang data terbaru.');
        }
        const saved = { ...record, version: (existing && existing.version || record.version || 1) + 1 };
        records.set(record.registrationId, clone(saved));
        return clone(saved);
      },
      get(registrationId) {
        const record = records.get(registrationId);
        return record ? clone(record) : null;
      },
      count() {
        return records.size;
      },
      // Sama bentuknya dengan store PostgreSQL: satu halaman yang sudah disaring.
      list({ search, status, page, pageSize } = {}) {
        const kata = String(search || '').trim().toLocaleLowerCase('id-ID');
        const ukuran = Math.min(100, Math.max(1, Number(pageSize) || 20));
        const halaman = Math.max(1, Number(page) || 1);
        const cocok = [...records.values()]
          .sort(function latestFirst(left, right) { return right.updatedAt.localeCompare(left.updatedAt); })
          .filter((record) => {
            const haystack = `${record.registrationId} ${record.applicant.applicantName} ${record.applicant.phone}`.toLocaleLowerCase('id-ID');
            return (!status || record.status === status) && (!kata || haystack.includes(kata));
          });
        return { items: cocok.slice((halaman - 1) * ukuran, halaman * ukuran).map(clone), total: cocok.length, page: halaman, pageSize: ukuran };
      },
      async removeDocument(registrationId, documentId) {
        const record = records.get(registrationId);
        if (!record) return null;
        const documents = (record.documents || []).filter((document) => document.id !== documentId);
        if (documents.length === record.documents.length) return null;
        const saved = { ...record, documents, updatedAt: new Date().toISOString(), version: (record.version || 1) + 1 };
        records.set(registrationId, clone(saved));
        return clone(saved);
      }
    };
  }

  function toPublicRegistration(record) {
    return {
      registrationId: record.registrationId,
      // Disimpan bersarang di applicant.program (lihat postgres-registration-store.js),
      // bukan langsung di record.program.
      program: record.applicant.program,
      status: record.status,
      statusLabel: domain.STATUS_LABELS[record.status],
      progress: domain.PROGRESS[record.status],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      documentSummary: record.documents.map(function documentSummary(document) {
        return {
          id: document.id,
          type: document.type,
          fileObjectId: document.fileObjectId || null,
          status: document.status,
          uploadedAt: document.uploadedAt,
          reviewStatus: document.reviewStatus || 'pending',
          reviewNote: document.reviewNote || ''
        };
      }),
      history: record.statusHistory.map(function historyEntry(entry) {
        return {
          from: entry.from,
          to: entry.to,
          at: entry.changedAt,
          note: entry.note
        };
      }),
      notes: (record.notes || []).filter((entry) => entry.visibility === 'applicant').map((entry) => ({ body: entry.body, createdAt: entry.createdAt })),
      nextSteps: (record.nextSteps || []).map((entry) => ({ id: entry.id, title: entry.title, dueOn: entry.dueOn, doneAt: entry.doneAt }))
    };
  }

  // Identitas pelaku hanya muncul di tampilan staf, tidak pada data yang dilihat pendaftar.
  function toStaffRegistration(record) {
    return {
      ...toPublicRegistration(record),
      applicant: {
        applicantName: record.applicant.applicantName,
        phone: record.applicant.phone,
        guardianName: record.applicant.guardianName,
        guardianPhone: record.applicant.guardianPhone,
        educationLevel: record.applicant.educationLevel,
        city: record.applicant.city
      },
      history: record.statusHistory.map(function staffHistoryEntry(entry) {
        return {
          from: entry.from,
          to: entry.to,
          at: entry.changedAt,
          note: entry.note,
          byRole: entry.changedBy,
          byAccountId: entry.changedByAccountId || null,
          byName: entry.changedByName || null
        };
      }),
      documents: record.documents,
      notes: record.notes || [],
      nextSteps: record.nextSteps || []
    };
  }

  function validateDocument(input) {
    const source = input || {};
    const errors = {};
    const type = String(source.type || '').trim();
    const fileObjectId = String(source.fileObjectId || '').trim();

    if (!DOCUMENT_TYPES.includes(type)) {
      errors.type = 'Jenis berkas tidak dikenali.';
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fileObjectId)) {
      errors.fileObjectId = 'Berkas unggahan belum dipilih.';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      value: {
        type,
        fileObjectId
      }
    };
  }

  function createRegistrationService(options) {
    const config = options || {};
    const store = config.store || createMemoryStore();
    const getFile = config.getFile || (async () => null);
    const getNow = config.now || function now() { return new Date().toISOString(); };
    const timeZone = config.timeZone || domain.REGISTRATION_TIME_ZONE;

    async function create(payload, options) {
      const createOptions = options || {};

      // Versi kebijakan privasi distempel di sini, bukan diambil dari kiriman browser.
      // Yang mengikat adalah dokumen yang berlaku di server pada saat persetujuan
      // diberikan; nilai apa pun yang dititipkan di body diabaikan.
      const payloadTerstempel = { ...(payload || {}), privacyPolicyVersion: domain.PRIVACY_POLICY_VERSION };

      // Data diperiksa lebih dulu supaya kiriman yang tidak valid tidak menghabiskan nomor registrasi.
      const validation = domain.validateApplicant(payloadTerstempel, { requireProfile: true });
      if (!validation.valid) {
        return { ok: false, errors: validation.errors };
      }

      // Nomor urut dibuat database dalam satu perintah atomik, bukan dihitung dari jumlah baris.
      const createdAt = getNow();
      const year = domain.yearInTimeZone(createdAt, timeZone);
      const sequence = await store.nextSequence('registration', year);
      const created = domain.createApplication(payloadTerstempel, { sequence, createdAt, year });
      if (!created.ok) {
        return created;
      }

      const record = {
        ...created.value,
        version: 1,
        documents: [], notes: [], nextSteps: [],
        ...createOptions.privateData
      };
      // insert, bukan upsert: nomor yang bentrok harus gagal keras, tidak menimpa data lama.
      await store.insert(record);

      return {
        ok: true,
        value: toPublicRegistration(record)
      };
    }

    async function getPublic(registrationId) {
      const record = await store.get(registrationId);
      if (!record) {
        return { ok: false, error: 'Pendaftaran tidak ditemukan.' };
      }

      return { ok: true, value: toPublicRegistration(record) };
    }

    // Selalu satu bentuk: { items, total, page, pageSize }. Penyaringan dan pemotongan
    // halaman dilakukan store (SQL pada PostgreSQL), bukan di sini.
    async function listForStaff(options = {}) {
      if (typeof store.list !== 'function') {
        return { items: [], total: 0, page: 1, pageSize: 20 };
      }
      const page = await store.list({
        search: String(options.search || '').trim(),
        status: String(options.status || '').trim(),
        page: Math.max(1, Number(options.page) || 1),
        pageSize: Math.min(100, Math.max(1, Number(options.pageSize) || 20))
      });
      return { items: page.items.map(toStaffRegistration), total: page.total, page: page.page, pageSize: page.pageSize };
    }

    async function changeStatus(registrationId, nextStatus, actor) {
      const record = await store.get(registrationId);
      if (!record) {
        return { ok: false, error: 'Pendaftaran tidak ditemukan.' };
      }

      const actorData = actor || {};
      const updated = domain.transitionApplication(record, nextStatus, actorData.role, {
        changedAt: getNow(),
        note: actorData.note,
        accountId: actorData.accountId
      });
      if (!updated.ok) {
        return updated;
      }

      const saved = await store.update({
        ...updated.value,
        documents: record.documents
      });

      return { ok: true, value: toPublicRegistration(saved) };
    }

    async function addDocument(registrationId, input, actor) {
      const record = await store.get(registrationId);
      if (!record) {
        return { ok: false, error: 'Pendaftaran tidak ditemukan.' };
      }

      const actorRole = actor && actor.role;
      const allowedRoles = [domain.ROLES.APPLICANT, domain.ROLES.REGISTRATION_OFFICER, domain.ROLES.ADMIN];
      if (!allowedRoles.includes(actorRole)) {
        return { ok: false, error: 'Aktor tidak berhak menambahkan berkas.' };
      }

      const validated = validateDocument(input);
      if (!validated.valid) {
        return { ok: false, errors: validated.errors };
      }

      const file = await getFile(validated.value.fileObjectId);
      if (!file || file.status !== 'ready' || file.purpose !== 'registration-document' ||
        file.entityType !== 'registration' || file.entityId !== registrationId) {
        return { ok: false, error: 'Berkas belum siap atau tidak terhubung ke pendaftaran ini.' };
      }

      const document = {
        id: globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        ...validated.value,
        storageKey: file.storageKey,
        fileObjectId: file.id,
        status: 'received',
        reviewStatus: 'pending', reviewNote: '', reviewedAt: null, reviewedByAccountId: null,
        uploadedAt: getNow(),
        uploadedBy: actorRole,
        uploadedByAccountId: (actor && actor.accountId) || null
      };
      const replacement = record.status === domain.STATUSES.NEEDS_REVISION && actorRole === domain.ROLES.APPLICANT && (
        record.documents.some((entry) => entry.type === document.type && entry.reviewStatus === 'rejected') ||
        record.documents.length === 0
      );
      const nextRecord = {
        ...record,
        documents: record.documents.concat(document),
        updatedAt: document.uploadedAt
      };
      if (actorRole === domain.ROLES.APPLICANT && replacement) {
        nextRecord.status = domain.STATUSES.DOCUMENT_REVIEW;
        nextRecord.progress = domain.PROGRESS[domain.STATUSES.DOCUMENT_REVIEW];
        nextRecord.statusHistory = (record.statusHistory || []).concat({
          from: domain.STATUSES.NEEDS_REVISION,
          to: domain.STATUSES.DOCUMENT_REVIEW,
          changedAt: document.uploadedAt,
          changedBy: domain.ROLES.APPLICANT,
          changedByAccountId: null,
          note: 'Dokumen revisi dikirim dan menunggu pemeriksaan petugas.'
        });
      }
      const saved = await store.update(nextRecord);

      return { ok: true, value: toPublicRegistration(saved) };
    }

    async function updateApplicant(registrationId, input, actor) {
      if (!actor || actor.role !== domain.ROLES.APPLICANT) return { ok: false, status: 403, error: 'Akses calon santri diperlukan.' };
      const record = await store.get(registrationId);
      if (!record) return { ok: false, error: 'Pendaftaran tidak ditemukan.' };
      if (['ready-for-departure', 'completed', 'cancelled'].includes(record.status)) {
        return { ok: false, error: 'Data pendaftaran sudah dikunci pada tahap ini.' };
      }
      const source = input || {};
      const editable = ['applicantName', 'phone', 'guardianName', 'guardianPhone', 'guardianEmail', 'email', 'birthDate', 'gender', 'schoolOrigin', 'city'];
      const nextApplicant = { ...record.applicant };
      for (const field of editable) {
        if (Object.prototype.hasOwnProperty.call(source, field)) nextApplicant[field] = source[field];
      }
      // privacyPolicyVersion diteruskan apa adanya dari baris yang tersimpan. Kalau
      // dibiarkan kosong, normalizeApplicant akan mengisinya dengan versi yang berlaku
      // hari ini, sehingga menyunting nomor telepon diam-diam mencatat persetujuan
      // terhadap kebijakan yang belum pernah dibaca pendaftar.
      //
      // consent dan dataProcessingConsent disetel true karena keduanya sudah diberikan
      // saat pendaftaran dibuat; ini penyuntingan profil, bukan persetujuan baru.
      const validation = domain.validateApplicant({
        ...nextApplicant,
        program: record.applicant.program,
        educationLevel: record.applicant.educationLevel,
        privacyPolicyVersion: record.applicant.privacyPolicyVersion,
        consent: true,
        dataProcessingConsent: true,
        guardianConsent: record.applicant.guardianConsent
      }, { requireProfile: true });
      if (!validation.valid) return { ok: false, errors: validation.errors };
      const updatedAt = getNow();
      const saved = await store.update({ ...record, applicant: validation.value, updatedAt });
      return { ok: true, value: toPublicRegistration(saved) };
    }

    async function reviewDocument(registrationId, documentId, input, actor) {
      if (!actor || ![domain.ROLES.ADMIN, domain.ROLES.REGISTRATION_OFFICER].includes(actor.role)) return { ok: false, error: 'Akses petugas diperlukan.' };
      const status = String((input || {}).reviewStatus || '');
      const note = String((input || {}).note || '').trim();
      if (!['accepted', 'rejected'].includes(status) || (status === 'rejected' && !note)) return { ok: false, error: 'Status review belum valid, dan alasan penolakan wajib diisi.' };
      const record = await store.get(registrationId);
      if (!record) return { ok: false, error: 'Pendaftaran tidak ditemukan.' };
      const reviewedAt = getNow();
      if (typeof store.reviewDocument === 'function') {
        const saved = await store.reviewDocument(registrationId, documentId, { reviewStatus: status, reviewNote: note, reviewedAt, reviewedByAccountId: actor.accountId });
        return saved ? { ok: true, value: toPublicRegistration(saved) } : { ok: false, error: 'Berkas tidak ditemukan.' };
      }
      const documents = record.documents.map((document) => document.id === documentId ? { ...document, reviewStatus: status, reviewNote: note, reviewedAt, reviewedByAccountId: actor.accountId } : document);
      if (!documents.some((document) => document.id === documentId)) return { ok: false, error: 'Berkas tidak ditemukan.' };
      const saved = await store.update({ ...record, documents, updatedAt: reviewedAt });
      return { ok: true, value: toPublicRegistration(saved) };
    }

    async function deleteDocument(registrationId, documentId, actor) {
      if (!actor || ![domain.ROLES.APPLICANT, domain.ROLES.REGISTRATION_OFFICER, domain.ROLES.ADMIN].includes(actor.role)) {
        return { ok: false, status: 403, error: 'Akses pendaftar atau petugas diperlukan.' };
      }
      const record = await store.get(registrationId);
      if (!record) return { ok: false, error: 'Pendaftaran tidak ditemukan.' };
      if (['ready-for-departure', 'completed', 'cancelled'].includes(record.status)) {
        return { ok: false, error: 'Berkas sudah dikunci pada tahap ini.' };
      }
      const document = (record.documents || []).find((entry) => entry.id === documentId);
      if (!document) return { ok: false, error: 'Dokumen tidak ditemukan.' };
      if (document.reviewStatus === 'accepted') return { ok: false, error: 'Dokumen yang sudah diterima tidak dapat dihapus.' };
      if (actor.role === domain.ROLES.APPLICANT && document.uploadedBy !== domain.ROLES.APPLICANT) {
        return { ok: false, status: 403, error: 'Pendaftar hanya dapat menghapus dokumen yang diunggah sendiri.' };
      }
      const saved = typeof store.removeDocument === 'function'
        ? await store.removeDocument(registrationId, documentId)
        : null;
      if (!saved) return { ok: false, error: 'Dokumen tidak dapat dihapus.' };
      if (document.fileObjectId && typeof config.markFileDeleted === 'function') {
        await config.markFileDeleted(document.fileObjectId, getNow());
      }
      return { ok: true, value: toPublicRegistration(saved) };
    }

    async function addNote(registrationId, input, actor) {
      if (!actor || ![domain.ROLES.ADMIN, domain.ROLES.REGISTRATION_OFFICER].includes(actor.role)) return { ok: false, error: 'Akses petugas diperlukan.' };
      const visibility = String((input || {}).visibility || ''); const body = String((input || {}).body || '').trim();
      if (!['internal', 'applicant'].includes(visibility) || !body || body.length > 2000) return { ok: false, error: 'Catatan belum valid.' };
      const note = { id: globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`, visibility, body, authorAccountId: actor.accountId || null, createdAt: getNow() };
      const record = typeof store.addNote === 'function' ? await store.addNote(registrationId, note) : await (async () => { const current = await store.get(registrationId); return current && store.update({ ...current, notes: (current.notes || []).concat(note), updatedAt: note.createdAt }); })();
      return record ? { ok: true, value: toPublicRegistration(record) } : { ok: false, error: 'Pendaftaran tidak ditemukan.' };
    }

    async function addNextStep(registrationId, input, actor) {
      if (!actor || ![domain.ROLES.ADMIN, domain.ROLES.REGISTRATION_OFFICER].includes(actor.role)) return { ok: false, error: 'Akses petugas diperlukan.' };
      const title = String((input || {}).title || '').trim();
      const dueOn = String((input || {}).dueOn || '').trim() || null;
      if (!title || title.length > 240) return { ok: false, error: 'Judul tindak lanjut wajib diisi maksimal 240 karakter.' };
      if (dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return { ok: false, error: 'Tanggal tindak lanjut belum valid.' };
      const step = { id: globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`, title, dueOn, doneAt: null, createdAt: getNow() };
      const record = typeof store.addNextStep === 'function' ? await store.addNextStep(registrationId, step) : null;
      return record ? { ok: true, value: toPublicRegistration(record) } : { ok: false, error: 'Pendaftaran tidak ditemukan.' };
    }

    return Object.freeze({
      addDocument,
      addNote,
      addNextStep,
      changeStatus,
      create,
      getPublic,
      listForStaff,
      reviewDocument,
      deleteDocument,
      updateApplicant,
      store
    });
  }

  return Object.freeze({
    DOCUMENT_TYPES,
    createMemoryStore,
    toStaffRegistration,
    createRegistrationService,
    validateDocument
  });
});
