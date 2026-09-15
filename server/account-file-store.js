const fs = require('node:fs');
const path = require('node:path');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createAccountFileStore(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  function readDatabase() {
    if (!fs.existsSync(filePath)) {
      return { accounts: {} };
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { accounts: data.accounts || {} };
  }

  function writeDatabase(database) {
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(database, null, 2), 'utf8');
    fs.renameSync(temporaryPath, filePath);
  }

  return {
    count() {
      return Object.keys(readDatabase().accounts).length;
    },
    getByEmail(email) {
      const account = Object.values(readDatabase().accounts).find(function matches(entry) {
        return entry.email === email;
      });
      return account ? clone(account) : null;
    },
    getById(accountId) {
      const account = readDatabase().accounts[accountId];
      return account ? clone(account) : null;
    },
    list() {
      return Object.values(readDatabase().accounts).map(clone);
    },
    save(account) {
      const database = readDatabase();
      database.accounts[account.id] = clone(account);
      writeDatabase(database);
      return clone(account);
    }
  };
}

module.exports = { createAccountFileStore };
