const assert = require('node:assert/strict');
const { createShutdownHandler } = require('./shutdown.js');

function createFakes({ closeServer, closeApp } = {}) {
  const urutan = [];
  const exitCodes = [];
  const server = {
    close(callback) {
      urutan.push('server.close');
      if (closeServer === 'hang') return;
      callback();
    },
    closeIdleConnections() {
      urutan.push('closeIdleConnections');
    }
  };
  const app = {
    async close() {
      urutan.push('app.close');
      if (closeApp === 'gagal') {
        throw new Error('pool gagal ditutup');
      }
    }
  };
  const logger = { log() {}, error(message) { urutan.push(`error: ${message}`); } };
  return { urutan, exitCodes, server, app, logger, exit: (code) => exitCodes.push(code) };
}

async function testNormalShutdown() {
  const fakes = createFakes();
  const shutdown = createShutdownHandler({ server: fakes.server, app: fakes.app, logger: fakes.logger, exit: fakes.exit });
  await shutdown('SIGTERM');
  assert.deepEqual(fakes.urutan, ['server.close', 'closeIdleConnections', 'app.close']);
  assert.deepEqual(fakes.exitCodes, [0]);
}

async function testSecondSignalIsIgnored() {
  const fakes = createFakes();
  const shutdown = createShutdownHandler({ server: fakes.server, app: fakes.app, logger: fakes.logger, exit: fakes.exit });
  await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);
  assert.deepEqual(fakes.exitCodes, [0], 'Sinyal kedua tidak boleh memulai penutupan baru.');
}

async function testFailureExitsWithError() {
  const fakes = createFakes({ closeApp: 'gagal' });
  const shutdown = createShutdownHandler({ server: fakes.server, app: fakes.app, logger: fakes.logger, exit: fakes.exit });
  await shutdown('SIGTERM');
  assert.deepEqual(fakes.exitCodes, [1]);
  assert.ok(fakes.urutan.some((entry) => entry.includes('pool gagal ditutup')));
}

async function testTimeoutForcesExit() {
  const fakes = createFakes({ closeServer: 'hang' });
  const shutdown = createShutdownHandler({ server: fakes.server, app: fakes.app, timeoutMs: 20, logger: fakes.logger, exit: fakes.exit });
  shutdown('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(fakes.exitCodes, [1], 'Penutupan yang menggantung harus dihentikan paksa.');
  assert.ok(fakes.urutan.some((entry) => entry.includes('dihentikan paksa')));
}

async function run() {
  await testNormalShutdown();
  await testSecondSignalIsIgnored();
  await testFailureExitsWithError();
  await testTimeoutForcesExit();
  console.log('shutdown handler tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
