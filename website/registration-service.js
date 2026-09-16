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
      program: record.program,
      status: record.status,
      statusLabel: domain.STATUS_LABELS[record.status],
      progress: domain.PROGRESS[record.status],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      documentSummary: record.documents.map(function documentSummary(document) {
        return {
          type: document.type,
          status: document.status,
          uploadedAt: document.uploadedAt
        };
      }),
      history: record.statusHistory.map(function historyEntry(entry) {
        return {
          from: entry.from,
          to: entry.to,
          at: entry.changedAt,
          note: entry.note
        };
      })
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
      })
    };
  }

  function validateDocument(input) {
    const source = input || {};
    const errors = {};
    const type = String(source.type || '').trim();
    const storageKey = String(source.storageKey || '').trim();

    if (!DOCUMENT_TYPES.includes(type)) {
      errors.type = 'Jenis berkas tidak dikenali.';
    }
    if (!storageKey || storageKey.length > 255) {
      errors.storageKey = 'Referensi penyimpanan berkas tidak valid.';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      value: {
        type,
        storageKey
      }
    };
  }

  function createRegistrationService(options) {
    const config = options || {};
    const store = config.store || createMemoryStore();
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
        documents: [],
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

      const document = {
        ...validated.value,
        status: 'received',
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

    return Object.freeze({
      addDocument,
      changeStatus,
      create,
      getPublic,
      listForStaff,
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
