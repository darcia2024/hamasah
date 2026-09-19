// Memeriksa bahwa isi image Docker cukup untuk menjalankan aplikasi.
// Docker tidak selalu terpasang di laptop, jadi skrip ini menyalin file sesuai baris COPY
// pada Dockerfile ke folder sementara, memasang dependency production, lalu menjalankan server.
//
// Jalankan dengan: npm run check:docker (butuh internet untuk npm ci).
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const repositoryRoot = path.resolve(__dirname, '..');

function readCopyInstructions() {
  const dockerfile = fs.readFileSync(path.join(repositoryRoot, 'Dockerfile'), 'utf8');
  return dockerfile
    .split(/\r?\n/)
    .filter((line) => /^COPY\s/i.test(line.trim()))
    .map((line) => line.trim().replace(/^COPY\s+/i, '').split(/\s+/).filter((part) => !part.startsWith('--')))
    .map((parts) => ({ sources: parts.slice(0, -1), destination: parts[parts.length - 1] }));
}

function copyInto(target, sources) {
  for (const source of sources) {
    const from = path.join(repositoryRoot, source);
    if (!fs.existsSync(from)) {
      throw new Error(`Dockerfile menyalin ${source}, tetapi file itu tidak ada di repositori.`);
    }
    const to = path.join(target, source);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
  }
}

// Di Windows npm berupa file .cmd. Jalankan langsung tanpa shell agar argumen
// tidak digabung menjadi satu string dan tidak memunculkan peringatan keamanan Node.
function run(command, args, options = {}) {
  const npmCli = command === 'npm' ? process.env.npm_execpath : '';
  const executable = npmCli ? process.execPath : command;
  const commandArgs = npmCli ? [npmCli, ...args] : args;
  const result = spawnSync(executable, commandArgs, {
    cwd: options.cwd,
    encoding: 'utf8'
  });
  return { code: result.status, output: `${result.stdout || ''}${result.stderr || ''}`.trim() };
}

function record(checks, label, passed, detail) {
  checks.push([label, passed, detail]);
  console.log(`${passed ? 'OK   ' : 'GAGAL'} ${label}${detail ? ` (${detail})` : ''}`);
  return passed;
}

function startServer(directory, port) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: directory,
    env: {
      ...process.env,
      APP_ENV: 'production',
      PORT: String(port),
      // Database sengaja tidak dapat dihubungi: /api/ready harus melaporkan tidak siap,
      // dan tidak ada koneksi ke database sungguhan selama pemeriksaan ini.
      DATABASE_URL: 'postgresql://uji:uji@127.0.0.1:1/uji',
      // Nilai dummy ini hanya melewati pemeriksaan konfigurasi saat start. Server
      // tidak melakukan panggilan ke storage sebelum ada permintaan unggah/unduh.
      STORAGE_BUCKET: 'docker-private',
      SUPABASE_URL: 'https://storage.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'docker-check-service-role-key',
      IP_HASH_SECRET: 'docker-check-ip-hash-secret-minimum-32-chars'
    }
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  return { child, readOutput: () => output.trim() };
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    child.on('exit', () => resolve());
    child.kill('SIGKILL');
    setTimeout(resolve, 5000);
  });
}

async function waitForServer(port, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return true;
    } catch {
      // Server belum siap, coba lagi.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function main() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'hamasah-docker-'));
  const checks = [];
  let serverProcess;

  try {
    const instructions = readCopyInstructions();
    if (!instructions.length) {
      throw new Error('Tidak ada baris COPY pada Dockerfile.');
    }
    for (const instruction of instructions) {
      copyInto(target, instruction.sources);
    }
    record(checks, 'Semua file pada baris COPY tersedia', true, `${instructions.length} baris COPY`);

    const install = run('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: target });
    if (!record(checks, 'npm ci --omit=dev berhasil', install.code === 0, install.code === 0 ? '' : install.output.split('\n').slice(-3).join(' '))) {
      throw new Error('Pemasangan dependency gagal.');
    }

    // Ditulis sebagai file supaya argumen tidak perlu melewati shell.
    const probeFile = path.join(target, 'periksa-modul.js');
    fs.writeFileSync(probeFile, "require('./server/app.js');\nrequire('./database/migrate.js');\nconsole.log('modul lengkap');\n");
    const requireCheck = run(process.execPath, [probeFile], { cwd: target });
    fs.rmSync(probeFile, { force: true });
    if (!record(checks, 'Semua modul yang dibutuhkan ada di image', requireCheck.code === 0, requireCheck.code === 0 ? '' : requireCheck.output.split('\n')[0])) {
      throw new Error('Modul tidak lengkap di dalam image.');
    }

    const port = await freePort();
    serverProcess = startServer(target, port);
    const started = await waitForServer(port);
    if (!record(checks, 'Server berhasil start di dalam image', started, started ? '' : serverProcess.readOutput().split('\n')[0])) {
      throw new Error('Server gagal start.');
    }

    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    record(checks, 'GET /api/health mengembalikan 200', health.status === 200, `status ${health.status}`);

    const ready = await fetch(`http://127.0.0.1:${port}/api/ready`);
    const readyBody = await ready.json();
    record(checks, 'GET /api/ready mengembalikan 503 saat database mati', ready.status === 503, `status ${ready.status}`);
    record(checks, 'Respons /api/ready tidak membocorkan detail error', !JSON.stringify(readyBody).includes('127.0.0.1'), JSON.stringify(readyBody));

    // Windows tidak mengirim SIGTERM sungguhan ke proses lain, jadi penutupan rapi
    // hanya bisa diuji di Linux. Logikanya sendiri diuji di server/shutdown.test.js.
    if (process.platform === 'win32') {
      console.log('LEWAT Penutupan rapi setelah SIGTERM (tidak didukung Windows, lihat server/shutdown.test.js)');
      await stopProcess(serverProcess.child);
    } else {
      const exited = await new Promise((resolve) => {
        serverProcess.child.on('exit', (code) => resolve(code));
        serverProcess.child.kill('SIGTERM');
        setTimeout(() => resolve('timeout'), 12000);
      });
      record(checks, 'Server berhenti rapi setelah SIGTERM', exited === 0, `exit ${exited}`);
    }
    serverProcess = undefined;
  } finally {
    if (serverProcess) {
      await stopProcess(serverProcess.child);
    }
    // Windows kadang masih memegang file sesaat setelah proses berhenti.
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (error) {
      console.warn(`Folder sementara belum bisa dihapus: ${target}`);
    }
  }

  const semuaLulus = checks.every(([, passed]) => passed);
  console.log(semuaLulus ? '\nIsi image Docker sudah cukup untuk menjalankan aplikasi.' : '\nADA PEMERIKSAAN YANG GAGAL.');
  process.exitCode = semuaLulus ? 0 : 1;
}

main().catch((error) => {
  console.error(`Pemeriksaan gagal: ${error.message}`);
  process.exitCode = 1;
});
