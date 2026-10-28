// Pembaca berkas tabel di peramban: CSV dan XLSX (Excel atau Google Sheets yang diunduh). Tanpa pustaka
// luar: XLSX adalah arsip ZIP berisi XML, dibuka dengan DecompressionStream bawaan peramban.
// Hasilnya { headers, rows } berupa teks; sel kosong menjadi ''. Tanggal Excel tetap berupa nomor seri
// (server yang menafsirkannya). Isi berkas tidak dikirim ke mana pun dari sini.
(function initBerkasTabel() {
  const MAKS_BYTE = 3 * 1024 * 1024;

  function bersih(nilai) {
    return String(nilai == null ? '' : nilai).replace(/^﻿/, '').trim();
  }

  // ------------------------------------------------------------------ CSV

  function pilihPemisah(teks) {
    const baris = teks.split(/\r?\n/).find((b) => b.trim()) || '';
    let dalamKutip = false;
    const hitung = { ',': 0, ';': 0, '\t': 0 };
    for (const huruf of baris) {
      if (huruf === '"') dalamKutip = !dalamKutip;
      else if (!dalamKutip && huruf in hitung) hitung[huruf] += 1;
    }
    return Object.entries(hitung).sort((a, b) => b[1] - a[1])[0][1] > 0 ? Object.entries(hitung).sort((a, b) => b[1] - a[1])[0][0] : ',';
  }

  function uraiCsv(teks) {
    const pemisah = pilihPemisah(teks);
    const hasil = [];
    let baris = [];
    let sel = '';
    let kutip = false;
    for (let i = 0; i < teks.length; i += 1) {
      const h = teks[i];
      if (kutip) {
        if (h === '"') {
          if (teks[i + 1] === '"') { sel += '"'; i += 1; } else kutip = false;
        } else sel += h;
      } else if (h === '"' && sel === '') kutip = true;
      else if (h === pemisah) { baris.push(sel); sel = ''; }
      else if (h === '\n' || h === '\r') {
        if (h === '\r' && teks[i + 1] === '\n') i += 1;
        baris.push(sel);
        hasil.push(baris);
        baris = [];
        sel = '';
      } else sel += h;
    }
    if (sel !== '' || baris.length) { baris.push(sel); hasil.push(baris); }
    return hasil;
  }

  // ------------------------------------------------------------------ XLSX

  async function inflasi(potongan, metode) {
    if (metode === 0) return potongan;
    if (metode !== 8) throw new Error('Cara kompresi berkas XLSX tidak didukung.');
    if (typeof DecompressionStream === 'undefined') throw new Error('Peramban ini belum mendukung membuka XLSX. Simpan sebagai CSV, atau pakai peramban yang lebih baru.');
    const aliran = new Blob([potongan]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(aliran).arrayBuffer());
  }

  async function bukaZip(buffer) {
    const data = new DataView(buffer);
    const byte = new Uint8Array(buffer);
    let akhir = -1;
    for (let i = byte.length - 22; i >= Math.max(0, byte.length - 65558); i -= 1) {
      if (data.getUint32(i, true) === 0x06054b50) { akhir = i; break; }
    }
    if (akhir < 0) throw new Error('Berkas ini bukan XLSX yang valid.');
    const jumlah = data.getUint16(akhir + 10, true);
    let posisi = data.getUint32(akhir + 16, true);
    const isi = new Map();
    const dekoder = new TextDecoder();
    for (let n = 0; n < jumlah; n += 1) {
      if (data.getUint32(posisi, true) !== 0x02014b50) throw new Error('Berkas XLSX rusak.');
      const metode = data.getUint16(posisi + 10, true);
      const ukuran = data.getUint32(posisi + 20, true);
      const panjangNama = data.getUint16(posisi + 28, true);
      const panjangEkstra = data.getUint16(posisi + 30, true);
      const panjangKomentar = data.getUint16(posisi + 32, true);
      const lokal = data.getUint32(posisi + 42, true);
      const nama = dekoder.decode(byte.subarray(posisi + 46, posisi + 46 + panjangNama));
      isi.set(nama, { metode, ukuran, lokal });
      posisi += 46 + panjangNama + panjangEkstra + panjangKomentar;
    }
    return async function baca(nama) {
      const entri = isi.get(nama);
      if (!entri) return null;
      const nLokal = data.getUint16(entri.lokal + 26, true);
      const eLokal = data.getUint16(entri.lokal + 28, true);
      const mulai = entri.lokal + 30 + nLokal + eLokal;
      return new TextDecoder().decode(await inflasi(byte.subarray(mulai, mulai + entri.ukuran), entri.metode));
    };
  }

  function xml(teks) {
    return new DOMParser().parseFromString(teks, 'application/xml');
  }

  function kolomKeIndeks(rujukan) {
    const huruf = (/^[A-Z]+/i.exec(rujukan) || [''])[0].toUpperCase();
    let nilai = 0;
    for (const h of huruf) nilai = nilai * 26 + (h.charCodeAt(0) - 64);
    return nilai - 1;
  }

  // Daftar lembar (nama dan jalur berkasnya) menurut urutan di workbook.xml.
  async function daftarLembar(baca) {
    const buku = await baca('xl/workbook.xml');
    const rel = await baca('xl/_rels/workbook.xml.rels');
    const hasil = [];
    if (buku && rel) {
      const hubungan = new Map([...xml(rel).querySelectorAll('Relationship')].map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));
      xml(buku).querySelectorAll('sheet').forEach((lembar) => {
        const rid = lembar.getAttribute('r:id') || lembar.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        const target = hubungan.get(rid);
        if (target) hasil.push({ nama: lembar.getAttribute('name') || `Lembar ${hasil.length + 1}`, jalur: `xl/${target.replace(/^\/?(xl\/)?/, '')}` });
      });
    }
    return hasil.length ? hasil : [{ nama: 'Lembar 1', jalur: 'xl/worksheets/sheet1.xml' }];
  }

  async function uraiXlsx(buffer, indeks = 0) {
    const baca = await bukaZip(buffer);
    const bersama = [];
    const teksBersama = await baca('xl/sharedStrings.xml');
    if (teksBersama) {
      xml(teksBersama).querySelectorAll('si').forEach((si) => bersama.push([...si.querySelectorAll('t')].map((t) => t.textContent).join('')));
    }
    const lembarAda = await daftarLembar(baca);
    const pilih = lembarAda[Math.min(Math.max(Number(indeks) || 0, 0), lembarAda.length - 1)];
    const teksLembar = await baca(pilih.jalur);
    if (!teksLembar) throw new Error(`Lembar “${pilih.nama}” di berkas XLSX tidak ditemukan.`);
    const hasil = [];
    xml(teksLembar).querySelectorAll('sheetData > row').forEach((row) => {
      const baris = [];
      row.querySelectorAll('c').forEach((c) => {
        const posisi = kolomKeIndeks(c.getAttribute('r') || '');
        const tipe = c.getAttribute('t');
        let nilai = '';
        if (tipe === 'inlineStr') nilai = [...c.querySelectorAll('t')].map((t) => t.textContent).join('');
        else {
          const v = c.querySelector('v');
          const mentah = v ? v.textContent : '';
          if (tipe === 's') nilai = bersama[Number(mentah)] || '';
          else if (tipe === 'b') nilai = mentah === '1' ? 'ya' : 'tidak';
          else nilai = mentah;
        }
        if (posisi >= 0) { while (baris.length < posisi) baris.push(''); baris[posisi] = nilai; }
      });
      hasil.push(baris);
    });
    return { rows: hasil, sheets: lembarAda.map((l) => l.nama), sheet: lembarAda.indexOf(pilih) };
  }

  // ------------------------------------------------------------------ umum

  function rapikan(baris) {
    const isi = baris.map((b) => b.map(bersih)).filter((b) => b.some((sel) => sel !== ''));
    if (!isi.length) throw new Error('Berkas tidak berisi data.');
    const lebar = Math.max(...isi.map((b) => b.length));
    const headers = Array.from({ length: lebar }, (_, i) => isi[0][i] || `Kolom ${i + 1}`);
    const rows = isi.slice(1).map((b) => Array.from({ length: lebar }, (_, i) => b[i] || ''));
    return { headers, rows };
  }

  async function baca(file, { lembar = 0 } = {}) {
    if (!file) throw new Error('Pilih berkas dulu.');
    if (file.size > MAKS_BYTE) throw new Error('Berkas terlalu besar (maksimal 3 MB).');
    const nama = String(file.name || '').toLowerCase();
    if (nama.endsWith('.xlsx')) {
      const xlsx = await uraiXlsx(await file.arrayBuffer(), lembar);
      return { ...rapikan(xlsx.rows), sheets: xlsx.sheets, sheet: xlsx.sheet };
    }
    if (nama.endsWith('.csv') || nama.endsWith('.txt') || file.type === 'text/csv') return { ...rapikan(uraiCsv(await file.text())), sheets: [], sheet: 0 };
    if (nama.endsWith('.xls')) throw new Error('Format .xls lama belum didukung. Simpan sebagai .xlsx atau .csv.');
    throw new Error('Format berkas belum didukung. Pakai CSV atau XLSX.');
  }

  // Buat teks CSV dari baris (array of array). Sel yang diawali = + - @ diberi tanda kutip agar tidak dijalankan sebagai rumus.
  function keCsv(baris) {
    return baris.map((b) => b.map((v) => `"${String(v == null ? '' : v).replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`).join(',')).join('\r\n');
  }

  function unduh(nama, teks) {
    const blob = new Blob(['﻿', teks], { type: 'text/csv;charset=utf-8' });
    const tautan = document.createElement('a');
    tautan.href = URL.createObjectURL(blob);
    tautan.download = nama;
    document.body.append(tautan);
    tautan.click();
    tautan.remove();
    setTimeout(() => URL.revokeObjectURL(tautan.href), 1000);
  }

  window.HamasahBerkasTabel = Object.freeze({ baca, keCsv, unduh, uraiCsv });
}());
