// Membuka berkas pribadi dari /api/files/:id (Task R3.5).
//
// Tidak bisa memakai <a href="/api/files/..."> biasa: endpointnya menuntut header
// Authorization, dan <a> tidak pernah mengirimkannya. Berkas karena itu diambil
// lewat fetch, dibungkus object URL, lalu URL-nya dibebaskan setelah dipakai.
//
// Pratinjau di tempat hanya untuk gambar. PDF sengaja diunduh, bukan ditampilkan
// di dalam <iframe> atau <object>: Content Security Policy halaman ini tidak punya
// frame-src sehingga blob: jatuh ke default-src 'self', dan object-src bernilai
// 'none'. Melonggarkan keduanya demi pratinjau berarti membatalkan sebagian
// pengetatan yang baru dikerjakan Phase R1.

(function fileOpenModule(root) {
  const DAPAT_DIPRATINJAU = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

  function bebaskanNanti(objectUrl) {
    // Dibebaskan pada tugas berikutnya, bukan seketika: sebagian browser
    // membatalkan unduhan yang object URL-nya dicabut sebelum unduhan dimulai.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }

  function unduh(blob, namaBerkas) {
    const objectUrl = URL.createObjectURL(blob);
    const tautan = document.createElement('a');
    tautan.href = objectUrl;
    tautan.download = namaBerkas;
    document.body.append(tautan);
    tautan.click();
    tautan.remove();
    bebaskanNanti(objectUrl);
  }

  function tampilkanPratinjau(blob, namaBerkas) {
    const objectUrl = URL.createObjectURL(blob);

    const dialog = document.createElement('dialog');
    dialog.className = 'file-preview';

    const judul = document.createElement('p');
    judul.className = 'file-preview__title';
    judul.textContent = namaBerkas;

    const gambar = document.createElement('img');
    gambar.className = 'file-preview__image';
    gambar.src = objectUrl;
    gambar.alt = `Pratinjau berkas ${namaBerkas}`;

    const aksi = document.createElement('div');
    aksi.className = 'file-preview__actions';

    const unduhTombol = document.createElement('button');
    unduhTombol.type = 'button';
    unduhTombol.className = 'button button--secondary';
    unduhTombol.textContent = 'Unduh';
    unduhTombol.addEventListener('click', () => unduh(blob, namaBerkas));

    // Object URL dan elemennya dilepas bersama, supaya membuka banyak berkas
    // berturut-turut tidak meninggalkan tumpukan blob di memori.
    //
    // Pembersihan dipanggil langsung dari setiap jalan keluar, bukan hanya dari
    // event 'close'. Alasannya: event itu tidak selalu terkirim. Pada mesin
    // render yang dipakai untuk memverifikasi task ini, showModal() dan close()
    // bekerja tetapi 'close' dan 'cancel' tidak pernah menyala sama sekali,
    // sehingga blob dan elemennya akan menumpuk diam-diam. Fungsinya dibuat
    // idempoten supaya aman dipanggil dari beberapa jalur sekaligus.
    let sudahDibersihkan = false;
    function bersihkan() {
      if (sudahDibersihkan) return;
      sudahDibersihkan = true;
      URL.revokeObjectURL(objectUrl);
      dialog.remove();
    }

    const tutup = document.createElement('button');
    tutup.type = 'button';
    tutup.className = 'button button--primary';
    tutup.textContent = 'Tutup';
    tutup.addEventListener('click', () => {
      dialog.close();
      bersihkan();
    });

    aksi.append(unduhTombol, tutup);
    dialog.append(judul, gambar, aksi);

    // Escape menutup dialog tanpa melewati tombol. keydown dipakai karena ia
    // peristiwa DOM biasa, bukan bagian dari mesin event <dialog> yang bisa diam.
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') bersihkan();
    });
    dialog.addEventListener('cancel', bersihkan);
    dialog.addEventListener('close', bersihkan);

    document.body.append(dialog);
    dialog.showModal();
  }

  // Mengembalikan 'pratinjau' atau 'unduh' supaya pemanggil bisa menyesuaikan
  // pesan statusnya. Melempar Error dengan pesan dari server bila gagal, sehingga
  // kegagalan tidak pernah berakhir sebagai berkas kosong yang terlanjur tersimpan.
  async function buka(fileId, options) {
    const opsi = options || {};
    const response = await fetch(`/api/files/${encodeURIComponent(fileId)}`, { headers: opsi.headers || {} });
    if (!response.ok) {
      let pesan = 'Berkas belum dapat dibuka.';
      try {
        pesan = (await response.json()).error || pesan;
      } catch {
        // Respons gagal tidak selalu JSON; pesan bawaan dipakai apa adanya.
      }
      throw new Error(pesan);
    }

    const blob = await response.blob();
    const namaBerkas = opsi.nama || `berkas-${fileId}`;
    if (DAPAT_DIPRATINJAU.includes(blob.type)) {
      tampilkanPratinjau(blob, namaBerkas);
      return 'pratinjau';
    }
    unduh(blob, namaBerkas);
    return 'unduh';
  }

  root.HamasahFileOpen = Object.freeze({ buka, DAPAT_DIPRATINJAU });
}(typeof globalThis !== 'undefined' ? globalThis : window));
