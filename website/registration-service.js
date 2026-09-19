(function registrationServiceModule(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./registration-domain.js'));
    return;
  }

  root.HamasahRegistrationService = factory(root.HamasahRegistrationDomain);
})(typeof globalThis !== 'undefined' ? globalThis : null, function registrationServiceFactory(domain) {
  'use strict';

  if (!domain) {
    throw new Error('HamasahRegistrationDomain harus dimuat sebelum registration-service.js.');
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
      update(record) {
        records.set(record.registrationId, clone(record));
        return clone(record);
      },
      get(registrationId) {
        const record = records.get(registrationId);
        return record ? clone(record) : null;
      },
      count() {
        return records.size;
      },
      list() {
        return [...records.values()].map(clone);
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

      // Data diperiksa lebih dulu supaya kiriman yang tidak valid tidak menghabiskan nomor registrasi.
      const validation = domain.validateApplicant(payload);
      if (!validation.valid) {
        return { ok: false, errors: validation.errors };
      }

      // Nomor urut dibuat database dalam satu perintah atomik, bukan dihitung dari jumlah baris.
      const createdAt = getNow();
      const year = domain.yearInTimeZone(createdAt, timeZone);
      const sequence = await store.nextSequence('registration', year);
      const created = domain.createApplication(payload, { sequence, createdAt, year });
      if (!created.ok) {
        return created;
      }

      const record = {
        ...created.value,
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

    async function listForStaff() {
      if (typeof store.list !== 'function') {
        return [];
      }
      return (await store.list())
        .sort(function latestFirst(left, right) { return right.updatedAt.localeCompare(left.updatedAt); })
        .map(toStaffRegistration);
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
      const saved = await store.update({
        ...record,
        documents: record.documents.concat(document),
        updatedAt: document.uploadedAt
      });

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

    async function addNote(registrationId, input, actor) {
      if (!actor || ![domain.ROLES.ADMIN, domain.ROLES.REGISTRATION_OFFICER].includes(actor.role)) return { ok: false, error: 'Akses petugas diperlukan.' };
      const visibility = String((input || {}).visibility || ''); const body = String((input || {}).body || '').trim();
      if (!['internal', 'applicant'].includes(visibility) || !body || body.length > 2000) return { ok: false, error: 'Catatan belum valid.' };
      const note = { id: globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`, visibility, body, authorAccountId: actor.accountId || null, createdAt: getNow() };
      const record = typeof store.addNote === 'function' ? await store.addNote(registrationId, note) : await (async () => { const current = await store.get(registrationId); return current && store.update({ ...current, notes: (current.notes || []).concat(note), updatedAt: note.createdAt }); })();
      return record ? { ok: true, value: toPublicRegistration(record) } : { ok: false, error: 'Pendaftaran tidak ditemukan.' };
    }

    return Object.freeze({
      addDocument,
      addNote,
      changeStatus,
      create,
      getPublic,
      listForStaff,
      reviewDocument,
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
