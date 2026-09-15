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
      return { registrations: {} };
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      registrations: parsed.registrations || {}
    };
  }

  function writeDatabase(database) {
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(database, null, 2), 'utf8');
    fs.renameSync(temporaryPath, filePath);
  }

  return {
    save(record) {
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
