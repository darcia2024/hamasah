// Perhitungan kontras WCAG 2.x untuk skrip pengukur kontras (Task R4.3).
//
// Dibuat sebagai modul UMD sederhana karena dipakai di dua tempat: test unit di
// Node, dan halaman yang sedang diukur di browser, tempat skrip menyuntikkan isi
// berkas ini. Pola yang sama dipakai website/registration-domain.js.
//
// Prinsip yang menjaga hasilnya jujur:
//
// - Latar buram (warna solid) diukur pasti. Rasionya satu angka, lulus atau tidak.
// - Latar yang tidak diketahui pikselnya (foto) TIDAK diberi angka tunggal. Yang
//   dihitung adalah batas: rasio terburuk dan terbaik yang mungkin terjadi di
//   atas latar apa pun yang dapat ada di belakang teks. Lulus hanya bila kasus
//   terburuknya pun lulus, yaitu ketika ada lapisan buram (scrim) yang menjamin
//   keterbacaan di atas foto mana pun. Gagal pasti hanya bila kasus terbaiknya
//   pun gagal. Sisanya adalah tinjau manual, bukan tebakan.

(function contrastMathModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else if (root) {
    root.HamasahContrast = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : null, function contrastMathFactory() {
  'use strict';

  const TARGET_NORMAL = 4.5;
  const TARGET_LARGE = 3;
  const BLACK = Object.freeze({ r: 0, g: 0, b: 0, a: 1 });
  const WHITE = Object.freeze({ r: 255, g: 255, b: 255, a: 1 });

  // Menerima keluaran getComputedStyle: "rgb(1, 2, 3)", "rgba(1, 2, 3, 0.5)",
  // sintaks modern "rgb(1 2 3 / 50%)", dan "transparent". null bila tidak dikenali,
  // supaya pemanggil menandainya sebagai tinjau manual dan bukan diam-diam salah.
  function parseColor(value) {
    if (typeof value !== 'string') return null;
    const text = value.trim().toLowerCase();
    if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

    const match = text.match(/^rgba?\(\s*([^)]+)\)$/);
    if (!match) return null;

    const parts = match[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;

    const channel = (token) => {
      const number = parseFloat(token);
      if (Number.isNaN(number)) return null;
      return token.endsWith('%') ? (number / 100) * 255 : number;
    };
    const r = channel(parts[0]);
    const g = channel(parts[1]);
    const b = channel(parts[2]);
    if (r === null || g === null || b === null) return null;

    let a = 1;
    if (parts.length >= 4) {
      const raw = parseFloat(parts[3]);
      if (Number.isNaN(raw)) return null;
      a = parts[3].endsWith('%') ? raw / 100 : raw;
    }
    return { r, g, b, a: Math.min(1, Math.max(0, a)) };
  }

  function toLinear(channel) {
    const scaled = channel / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
  }

  function luminance(color) {
    return 0.2126 * toLinear(color.r) + 0.7152 * toLinear(color.g) + 0.0722 * toLinear(color.b);
  }

  function ratioOfLuminances(first, second) {
    const lighter = Math.max(first, second);
    const darker = Math.min(first, second);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function contrastRatio(first, second) {
    return ratioOfLuminances(luminance(first), luminance(second));
  }

  // Menempelkan warna tembus pandang di atas warna buram. Hasilnya buram.
  function composite(top, bottom) {
    const alpha = top.a === undefined ? 1 : top.a;
    return {
      r: top.r * alpha + bottom.r * (1 - alpha),
      g: top.g * alpha + bottom.g * (1 - alpha),
      b: top.b * alpha + bottom.b * (1 - alpha),
      a: 1
    };
  }

  // Menumpuk beberapa lapisan tembus pandang (urutan dari atas ke bawah) di atas
  // satu warna dasar buram.
  function compositeStack(layersTopToBottom, base) {
    let result = base;
    for (let index = layersTopToBottom.length - 1; index >= 0; index -= 1) {
      result = composite(layersTopToBottom[index], result);
    }
    return result;
  }

  // Teks besar menurut WCAG: 24 px, atau 18,66 px (14 pt) bila tebal.
  function isLargeText(fontSizePx, fontWeight) {
    return fontSizePx >= 24 || (fontSizePx >= 18.66 && Number(fontWeight) >= 700);
  }

  function targetFor(fontSizePx, fontWeight) {
    return isLargeText(fontSizePx, fontWeight) ? TARGET_LARGE : TARGET_NORMAL;
  }

  // Rasio terburuk dan terbaik bila latar dapat berupa luminans apa pun di dalam
  // [lowest, highest]. Rasio turun mendekati 1 saat luminans latar mendekati
  // luminans teks, jadi titik terburuknya bisa berada DI TENGAH rentang, bukan di
  // ujungnya. Itu sebabnya rentang yang memuat luminans teks langsung bernilai 1.
  function boundsOverRange(textLuminance, lowest, highest) {
    const atLowest = ratioOfLuminances(textLuminance, lowest);
    const atHighest = ratioOfLuminances(textLuminance, highest);
    const best = Math.max(atLowest, atHighest);
    const worst = textLuminance >= lowest && textLuminance <= highest ? 1 : Math.min(atLowest, atHighest);
    return { worst, best };
  }

  // Mengurangi 2 desimal ke bawah, bukan membulatkan: WCAG tidak mengizinkan 4,499
  // ditampilkan sebagai 4,50 lalu dianggap lulus.
  function floorTo2(value) {
    return Math.floor(value * 100) / 100;
  }

  function toHex(color) {
    const part = (channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, '0');
    const base = `#${part(color.r)}${part(color.g)}${part(color.b)}`;
    return color.a !== undefined && color.a < 1 ? `${base}${part(color.a * 255)}` : base;
  }

  // Menyimpulkan satu pengukuran.
  //
  //   text     warna teks, boleh tembus pandang: {r, g, b, a}
  //   over     lapisan tembus pandang di antara teks dan dasar, dari atas ke bawah
  //   base     salah satu dari:
  //              {type: 'solid',    color}    latar buram, diukur pasti
  //              {type: 'gradient', colors}   gradien berhenti-warna buram
  //              {type: 'photo'}              piksel tidak diketahui
  //   target   4,5 atau 3
  //
  // Mengembalikan {status, worst, best, backdrop}. status:
  //   'pass'       lulus. Untuk latar tidak pasti artinya TERJAMIN di kasus terburuk.
  //   'violation'  gagal pasti: bahkan kasus terbaiknya di bawah target.
  //   'manual'     bergantung pada piksel sebenarnya, perlu ditinjau manusia.
  function analyze({ text, over = [], base, target }) {
    const textAlpha = text.a === undefined ? 1 : text.a;

    if (base.type === 'solid') {
      const backdrop = compositeStack(over, base.color);
      const painted = composite(text, backdrop);
      const ratio = contrastRatio(painted, backdrop);
      return {
        status: ratio >= target ? 'pass' : 'violation',
        worst: ratio,
        best: ratio,
        backdrop: `solid ${toHex(backdrop)}`,
        backdropColor: toHex(backdrop)
      };
    }

    // Kandidat warna dasar. Untuk foto cukup hitam dan putih: luminans hasil
    // penumpukan naik seiring naiknya setiap kanal dasar, jadi ujung-ujungnya
    // sudah mencakup seluruh kemungkinan warna foto.
    let candidates;
    let label;
    if (base.type === 'gradient') {
      candidates = base.colors;
      label = 'gradien';
    } else {
      candidates = [BLACK, WHITE];
      label = 'foto';
    }

    const backdrops = candidates.map((color) => compositeStack(over, color));
    const luminances = backdrops.map(luminance);
    const lowest = Math.min(...luminances);
    const highest = Math.max(...luminances);

    let worst;
    let best;
    if (textAlpha >= 0.999) {
      ({ worst, best } = boundsOverRange(luminance(text), lowest, highest));
    } else {
      // Teks tembus pandang berubah warna mengikuti latarnya, jadi luminans teks
      // tidak lagi satu angka. Dicoba pada tangga abu-abu di dalam rentang latar;
      // ini aproksimasi, bukan batas eksak.
      const rows = [];
      const steps = 24;
      for (let step = 0; step <= steps; step += 1) {
        const level = 255 * (step / steps);
        const gray = { r: level, g: level, b: level, a: 1 };
        const backdrop = compositeStack(over, gray);
        const painted = composite(text, backdrop);
        rows.push(contrastRatio(painted, backdrop));
      }
      worst = Math.min(...rows);
      best = Math.max(...rows);
    }

    const hasScrim = over.length > 0;
    const scrimNote = hasScrim ? `${label} dengan ${over.length} lapisan tembus pandang` : `${label} tanpa lapisan penutup`;
    let status = 'manual';
    if (worst >= target) status = 'pass';
    else if (best < target) status = 'violation';

    return { status, worst, best, backdrop: scrimNote, backdropColor: null };
  }

  return Object.freeze({
    TARGET_NORMAL,
    TARGET_LARGE,
    analyze,
    boundsOverRange,
    composite,
    compositeStack,
    contrastRatio,
    floorTo2,
    isLargeText,
    luminance,
    parseColor,
    ratioOfLuminances,
    targetFor,
    toHex
  });
}));
