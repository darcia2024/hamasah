const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10000;

// Platform container mengirim SIGTERM saat deploy atau restart. Permintaan yang sedang berjalan
// diselesaikan dulu, koneksi database ditutup, lalu proses berhenti.
// Logikanya dipisah dari server.js supaya bisa diuji tanpa mengirim sinyal sungguhan,
// karena Windows tidak mendukung pengiriman SIGTERM ke proses lain.
function createShutdownHandler({
  server,
  app,
  timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
  logger = console,
  exit = process.exit
} = {}) {
  let shuttingDown = false;

  return async function shutdown(signal) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.log(`[server] ${signal} diterima, menutup layanan.`);

    const forceExit = setTimeout(() => {
      logger.error(`[server] Penutupan melewati ${timeoutMs / 1000} detik, proses dihentikan paksa.`);
      exit(1);
    }, timeoutMs);
    if (typeof forceExit.unref === 'function') {
      forceExit.unref();
    }

    try {
      await new Promise((resolve) => server.close(resolve));
      if (typeof server.closeIdleConnections === 'function') {
        server.closeIdleConnections();
      }
      await app.close();
      clearTimeout(forceExit);
      logger.log('[server] Layanan ditutup dengan rapi.');
      exit(0);
    } catch (error) {
      clearTimeout(forceExit);
      logger.error(`[server] Gagal menutup dengan rapi: ${error.message}`);
      exit(1);
    }
  };
}

module.exports = { DEFAULT_SHUTDOWN_TIMEOUT_MS, createShutdownHandler };
