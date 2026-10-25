# Audit ulang, 25 Oktober 2026 (catatan developer)

Catatan ini untuk developer, bukan untuk pimpinan. Halaman `/pitch` sengaja tidak memuat
audit. Yang dirangkum di sini: hasil pemeriksaan ulang terhadap audit 23 Oktober
(`.claude/audit-2026-10-23/REPORT.md`) dan perbaikannya (`docs/AUDIT_REMEDIATION_2026-10-23.md`).

## Ringkasan

| Pemeriksaan | Hasil | Cara |
|---|---|---|
| Suite tes penuh | 370 dari 372 lulus | `node --test --test-concurrency=2` dari akar repo, 518 detik |
| Risiko akses S01–S08 | 8 dari 8 tertutup di kode | Ditelusuri di sumber (lihat tabel di bawah) |
| Kontras warna | 14 → 4 pelanggaran unik | `npm run check:contrast` sebelum dan sesudah commit `7407e84` |
| Situs live | 23 dari 23 halaman membalas 200 | Fetch dari origin hamasah.vercel.app |
| Header keamanan live | CSP ketat, HSTS, nosniff, COOP, frame-ancestors 'none' | Header respons `/` |
| Berkas internal live | 404 untuk `.env`, `package.json`, `server/`, `.git/config`, `docs/`, log | Fetch langsung |
| Kesiapan live | `/api/health` dan `/api/ready` 200, `database: siap` | Fetch langsung |

## Dua tes yang gagal

- `api/index.js melayani permintaan dengan environment production`
- `alamat asli pengunjung dikembalikan dari parameter rewrite Vercel`

Keduanya di `server/serverless-entry.test.js`. Penyebab: `Cannot find module '@vercel/functions'`.
Paket tercatat di `package.json` (3.10.3) dan `package-lock.json`, tetapi tidak ada di
`node_modules` lokal. Ini masalah lingkungan, bukan kode; Vercel memasang dependensi saat build.
**Belum dibuktikan**: jalankan `npm ci` lalu ulangi tes itu.

## S01–S08 di kode sekarang

| ID | Risiko lama | Bukti tertutup |
|---|---|---|
| S01 | Koreksi catatan tidak mengikat ID catatan ke santri | `server/postgres-student-store.js:169,179`: `WHERE id = $1 AND student_id = $2` (dengan `FOR UPDATE`) |
| S02 | Review tugas tanpa cek pengelola kelas | `server/lms-service.js:641`: `canManageCourse` sebelum review |
| S03 | Staf mengirim kuis/tugas sebagai santri | `server/lms-service.js:211`: `canSubmit` hanya `student` yang terhubung; dipakai di complete, quiz, assignment |
| S04 | Undangan menghidupkan akun yang diblokir | `server/identity-service.js:546`: hanya `lifecycle === 'pending'` |
| S05 | Token awal pendaftar tidak dicabut | `server/http/auth.js:73`: hanya sesi pendaftar (`applicantService.authenticate`) |
| S06 | Token reset bertahan setelah ganti email | `server/identity-service.js:450`: `clearedTokens` bila email/peran berubah |
| S07 | Snapshot akun lama menimpa yang baru | `server/postgres-account-store.js:88`: `WHERE id = $1 AND version = $2` |
| S08 | Unggah PDF kelas lain | `server/storage/upload-policies.js:48,196`: `canManageFiles(entityId, actor)` |

Semua tertutup **di kode**. Belum direproduksi di lingkungan terisolasi dengan data dummy.

## Sisa kontras (4)

Bukan dari komponen yang diubah sesi ini:

- `span.ananda-stat__note` di halaman wali (detail santri): `#8a8a8f` di atas putih, 3,43:1. Tiga teks: "Belum dicatat", "Belum ada juz ditandai", "2 dari 2 kegiatan".
- `span.admin-ops-figure__note` di Portal admin: `#716b61` di atas `#ddf1e3`, 4,46:1.

## Masih terbuka

1. Uji keamanan terisolasi (sandbox + data dummy) untuk jalur akses lintas asrama/kelas, pembayaran, dan token.
2. Migrasi 054 dan 055 di produksi belum dibuktikan dari sini. Jalankan `npm run verify:database` dengan konfigurasi produksi (lihat `RUNBOOK.md`).
3. Folder `hamasah/` di akar repo adalah salinan repo yang sama (remote `darcia2024/hamasah`), tidak terlacak. `node --test` dari akar ikut menjalankan tesnya, jadi tes berjalan dua kali. Rawan salah edit.
4. Kata sandi sementara dari admin tidak kedaluwarsa dan tidak wajib diganti. Perlu keputusan pimpinan.
5. Retry notifikasi lewat GitHub Actions belum aktif (perlu secret/variable). Dampak terbatas karena pengingat ke wali dikirim manual lewat WhatsApp.

## Mengaktifkan AI

Produksi saat ini menjawab dengan `mode: "lokal"` (dicek lewat `POST /api/assistant/ask`), artinya
`OPENROUTER_API_KEY` belum diisi di Vercel. Satu kunci menyalakan tiga fitur: asisten website
(`server/site-assistant.js`), asisten belajar LMS (`server/lms-tutor-provider.js`), dan Cerita AI
musyrif (`server/musyrif-story-service.js`). Saklar `asisten.situs` dan `asisten.belajar` di
Pengaturan bawaannya sudah menyala.

Langkah (dilakukan pemilik akun Vercel, kunci tidak boleh ditulis di repo):

1. Buat API key di openrouter.ai dan isi saldo.
2. Vercel, project hamasah, Settings, Environment Variables, Production:
   - `OPENROUTER_API_KEY` = kunci tadi
   - `OPENROUTER_MODEL` = `openai/gpt-5-nano` (bawaan; boleh diganti)
   - `ASSISTANT_DAILY_LIMIT` = batas jawaban AI per hari per instans (bawaan 1000)
   - opsional `OPENROUTER_TUTOR_MODEL`, `OPENROUTER_STORY_MODEL`
3. Redeploy production.
4. Cek: `POST /api/assistant/ask` harus tidak lagi mengembalikan `mode: "lokal"`.
5. Batas per santri per jam diatur di Pengaturan (`asisten.batasPerJam`, bawaan 20).

Kebijakan privasi perlu menyebut bahwa pertanyaan diproses penyedia AI di luar negeri.

## Data lokal yang dipakai untuk tangkapan layar pitch

- `npm run demo:isi` ke database lokal `data/dev-db` (akun `*@demo.hamasah.test`).
- `node scripts/seed-example-course.js` (khusus localhost) memasang kelas "Nahwu Dasar: Fondasi
  Membaca Al-Ajurrumiyyah" dengan video YouTube dari `content/examples/nahwu-dasar.json`.
- Santri demo didaftarkan ke kelas itu lewat `POST /api/students/:id/courses/:courseId`.

Tidak ada data produksi yang diubah.
