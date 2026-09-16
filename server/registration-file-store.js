const fs = require('node:fs');
const path = require('node:path');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createRegistrationFileStore(filePath) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });

  function readDatabase() {
    if (!fs.existsSync(filePath)) {
      return { registrations: {}, counters: {} };
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      registrations: parsed.registrations || {},
      counters: parsed.counters || {}
    };
  }

  function writeDatabase(database) {
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(database, null, 2), 'utf8');
    fs.renameSync(temporaryPath, filePath);
  }

  return {
    // Baca dan tulis di bawah berjalan tanpa await, jadi tidak ada permintaan lain yang menyela.
    nextSequence(scope, year) {
      const database = readDatabase();
      const key = `${scope}:${year}`;
      const next = (database.counters[key] || 0) + 1;
      database.counters[key] = next;
      writeDatabase(database);
      return next;
    },
    insert(record) {
      const database = readDatabase();
      if (database.registrations[record.registrationId]) {
        throw new Error(`Nomor registrasi ${record.registrationId} sudah dipakai.`);
      }
      database.registrations[record.registrationId] = clone(record);
      writeDatabase(database);
      return clone(record);
    },
    update(record) {
      const database = readDatabase();
      database.registrations[record.registrationId] = clone(record);
      writeDatabase(database);
      return clone(record);
    },
    get(registrationId) {
      const record = readDatabase().registrations[registrationId];
      return record ? clone(record) : null;
    },
    count() {
      return Object.keys(readDatabase().registrations).length;
    },
    list() {
      return Object.values(readDatabase().registrations).map(clone);
    }
  };
}

module.exports = { createRegistrationFileStore };
