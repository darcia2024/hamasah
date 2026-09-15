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

    return {
      save(record) {
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
      }
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
    let nextSequence = Number.isInteger(config.startSequence) ? config.startSequence : null;

    async function create(payload, options) {
      const createOptions = options || {};
      if (nextSequence === null) nextSequence = await store.count();
      nextSequence += 1;
      const created = domain.createApplication(payload, {
        sequence: nextSequence,
        createdAt: getNow()
      });

      if (!created.ok) {
        nextSequence -= 1;
        return created;
      }

      const record = {
        ...created.value,
        documents: [],
        ...createOptions.privateData
      };
      await store.save(record);

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
        note: actorData.note
      });
      if (!updated.ok) {
        return updated;
      }

      const saved = await store.save({
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
        uploadedBy: actorRole
      };
      const saved = await store.save({
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
