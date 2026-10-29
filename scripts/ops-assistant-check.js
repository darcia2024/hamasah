// Uji manual penyedia AI untuk Asisten Operasional, memakai kunci OPENROUTER_API_KEY Anda sendiri.
// Hanya mengirim data karangan (tanpa data santri asli) dan mencetak jawabannya. Contoh:
//   OPENROUTER_API_KEY=sk-... node scripts/ops-assistant-check.js
const { createOpsAssistantProvider } = require('../server/ops-assistant-provider.js');

async function main() {
  const provider = createOpsAssistantProvider({ env: process.env });
  if (!provider.configured) {
    console.error('OPENROUTER_API_KEY belum diisi. Isi dulu, lalu jalankan ulang.');
    process.exit(1);
  }
  const konteks = { asrama: 'Asrama Contoh', santriAktif: 12, kehadiran30Hari: { persen: 83, hadir: 50, izin: 4, sakit: 2, alpa: 4 }, santriAlpa3Plus: [{ santri: 'Santri 1', alpa: 3 }], urusanTerbuka: 2 };
  const system = 'Kamu asisten operasional Hamasah International. Tulis bahasa Indonesia ringkas tanpa markdown. Gunakan HANYA isi DATA; nama seperti "Santri 1" adalah alias.';
  const user = `TUGAS: Ringkas laporan asrama\nDATA (JSON):\n${JSON.stringify(konteks)}\n\nTulis ringkasan 3 sampai 5 kalimat tanpa menambah fakta.`;
  const mulai = Date.now();
  const hasil = await provider.generate({ system, user });
  console.log(`Berhasil dalam ${Date.now() - mulai} ms. Jawaban:\n\n${hasil.text}`);
  const adaAngkaAsing = (hasil.text.match(/\d+/g) || []).filter((n) => !['83', '50', '4', '2', '12', '3', '1'].includes(n));
  if (adaAngkaAsing.length) console.warn(`\nPERHATIAN: ada angka yang tidak ada di data: ${adaAngkaAsing.join(', ')}`);
}

main().catch((error) => { console.error(`Gagal: ${error.message}`); process.exit(1); });
