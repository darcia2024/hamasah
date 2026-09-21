const assert = require('node:assert/strict');
const C = require('./contrast-math.js');

const BLACK = { r: 0, g: 0, b: 0, a: 1 };
const WHITE = { r: 255, g: 255, b: 255, a: 1 };

function close(actual, expected, tolerance, pesan) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${pesan || 'nilai'}: ${actual} bukan ${expected} (+-${tolerance})`);
}

// --- Nilai acuan yang dipublikasikan WCAG ---
close(C.contrastRatio(BLACK, WHITE), 21, 0.001, 'hitam di putih');
close(C.contrastRatio(WHITE, WHITE), 1, 0.001, 'putih di putih');
// #767676 adalah abu-abu paling terang yang masih lulus 4,5:1 di atas putih.
const abu767676 = C.parseColor('rgb(118, 118, 118)');
close(C.contrastRatio(abu767676, WHITE), 4.54, 0.01, '#767676 di putih');
const abu777777 = C.parseColor('rgb(119, 119, 119)');
assert.ok(C.contrastRatio(abu777777, WHITE) < 4.5, '#777777 di putih harus gagal.');
// Simetris: urutan teks dan latar tidak memengaruhi rasio.
assert.equal(C.contrastRatio(abu767676, WHITE), C.contrastRatio(WHITE, abu767676));

// --- parseColor ---
assert.deepEqual(C.parseColor('rgb(1, 2, 3)'), { r: 1, g: 2, b: 3, a: 1 });
assert.deepEqual(C.parseColor('rgba(1, 2, 3, 0.5)'), { r: 1, g: 2, b: 3, a: 0.5 });
assert.deepEqual(C.parseColor('rgb(1 2 3 / 50%)'), { r: 1, g: 2, b: 3, a: 0.5 });
assert.deepEqual(C.parseColor('transparent'), { r: 0, g: 0, b: 0, a: 0 });
assert.equal(C.parseColor('oklch(0.7 0.1 80)'), null, 'Format yang tidak dikenal harus null, bukan ditebak.');
assert.equal(C.parseColor(undefined), null);

// --- Penumpukan warna ---
const separuhHitam = C.composite({ r: 0, g: 0, b: 0, a: 0.5 }, WHITE);
close(separuhHitam.r, 127.5, 0.001, '50% hitam di putih');
assert.equal(separuhHitam.a, 1, 'Hasil penumpukan selalu buram.');
// Dua lapisan sama dengan penumpukan berurutan dari bawah.
const dua = C.compositeStack([{ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 0, b: 0, a: 0.5 }], WHITE);
const berurutan = C.composite({ r: 0, g: 0, b: 0, a: 0.5 }, C.composite({ r: 255, g: 0, b: 0, a: 0.5 }, WHITE));
assert.deepEqual(dua, berurutan);

// --- Teks besar ---
assert.equal(C.isLargeText(24, 400), true);
assert.equal(C.isLargeText(23.9, 400), false);
assert.equal(C.isLargeText(18.66, 700), true);
assert.equal(C.isLargeText(18.65, 700), false, 'Di bawah 18,66 px tidak dihitung besar walau tebal.');
assert.equal(C.isLargeText(18.66, 600), false, 'Bobot 600 belum dianggap tebal.');
assert.equal(C.targetFor(16, 400), 4.5);
assert.equal(C.targetFor(24, 400), 3);

// --- Pembulatan ke bawah ---
assert.equal(C.floorTo2(4.4999), 4.49, '4,4999 tidak boleh tampil sebagai 4,50.');
assert.equal(C.floorTo2(4.5), 4.5);

// --- Batas di atas rentang latar ---
// Luminans teks berada di dalam rentang: ada titik di mana teks lenyap.
assert.equal(C.boundsOverRange(0.5, 0, 1).worst, 1);
// Teks lebih terang dari seluruh rentang: yang terburuk adalah ujung yang terterang.
const terangDiAtasGelap = C.boundsOverRange(0.9, 0, 0.05);
assert.ok(terangDiAtasGelap.worst > 4.5);
close(terangDiAtasGelap.worst, C.ratioOfLuminances(0.9, 0.05), 1e-9);

// --- analyze: latar buram ---
const krem = { r: 254, g: 243, b: 199, a: 1 };
const kremDiKrem = C.analyze({ text: krem, base: { type: 'solid', color: { r: 255, g: 251, b: 235, a: 1 } }, target: 4.5 });
assert.equal(kremDiKrem.status, 'violation');
assert.ok(kremDiKrem.worst < 1.2, 'Teks krem di atas permukaan krem harus terukur mendekati 1:1.');
assert.equal(kremDiKrem.worst, kremDiKrem.best, 'Latar buram: satu angka pasti, bukan rentang.');

const hitamDiPutih = C.analyze({ text: BLACK, base: { type: 'solid', color: WHITE }, target: 4.5 });
assert.equal(hitamDiPutih.status, 'pass');

// Lapisan tembus pandang di atas latar buram ikut dihitung.
const diAtasScrim = C.analyze({
  text: WHITE,
  over: [{ r: 0, g: 0, b: 0, a: 0.9 }],
  base: { type: 'solid', color: WHITE },
  target: 4.5
});
assert.equal(diAtasScrim.status, 'pass');

// --- analyze: foto. Inilah inti kejujuran alat ini. ---
// Tanpa lapisan penutup: tidak ada jaminan apa pun, dan alat TIDAK mengarang satu
// angka. Kasus terburuknya tepat 1, kasus terbaiknya tinggi, hasilnya tinjau manual.
const tanpaScrim = C.analyze({ text: krem, base: { type: 'photo' }, target: 4.5 });
assert.equal(tanpaScrim.status, 'manual');
assert.equal(tanpaScrim.worst, 1);
assert.ok(tanpaScrim.best > 10);
assert.equal(tanpaScrim.backdropColor, null, 'Piksel foto tidak diketahui, jadi tidak boleh ada warna latar.');

// Dengan scrim gelap yang cukup pekat, teks krem terjamin terbaca di atas foto
// APA PUN, termasuk foto putih polos. Inilah yang dulu dijamin .image-badge.
const denganScrim = C.analyze({
  text: krem,
  over: [{ r: 30, g: 27, b: 22, a: 0.88 }],
  base: { type: 'photo' },
  target: 4.5
});
assert.equal(denganScrim.status, 'pass');
assert.ok(denganScrim.worst >= 4.5);

// Scrim yang terlalu tipis tidak menjamin apa-apa: kembali ke tinjau manual.
const scrimTipis = C.analyze({
  text: krem,
  over: [{ r: 30, g: 27, b: 22, a: 0.2 }],
  base: { type: 'photo' },
  target: 4.5
});
assert.equal(scrimTipis.status, 'manual');

// Gagal pasti hanya bila kasus terbaiknya pun gagal: gradien seluruhnya terang.
const gradienTerang = C.analyze({
  text: krem,
  base: { type: 'gradient', colors: [{ r: 255, g: 255, b: 255, a: 1 }, { r: 250, g: 240, b: 200, a: 1 }] },
  target: 4.5
});
assert.equal(gradienTerang.status, 'violation');

// Gradien gelap ke terang: sebagian lulus, sebagian tidak, jadi tinjau manual.
const gradienCampur = C.analyze({
  text: krem,
  base: { type: 'gradient', colors: [{ r: 20, g: 20, b: 20, a: 1 }, { r: 255, g: 255, b: 255, a: 1 }] },
  target: 4.5
});
assert.equal(gradienCampur.status, 'manual');

// Teks tembus pandang di atas foto tetap menghasilkan batas, bukan angka tunggal.
const tembus = C.analyze({ text: { r: 255, g: 255, b: 255, a: 0.6 }, base: { type: 'photo' }, target: 4.5 });
assert.equal(tembus.status, 'manual');
assert.ok(tembus.worst < tembus.best);

// --- toHex ---
assert.equal(C.toHex({ r: 231, g: 177, b: 12, a: 1 }), '#e7b10c');
assert.equal(C.toHex({ r: 0, g: 0, b: 0, a: 0.5 }), '#00000080');

console.log('contrast-math tests passed');
