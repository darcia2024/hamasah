// Pemilih santri untuk <select> di halaman internal (Task R6.2).
//
// Daftar santri kini berpaginasi di server. Sebuah <select> yang diisi dari satu halaman
// akan diam-diam memotong daftar (santri ke-21 tidak akan pernah bisa dipilih), jadi setiap
// <select> santri dilengkapi kotak cari yang meminta halaman baru ke server, dan petunjuk
// "Menampilkan X dari Y santri" selama daftarnya belum lengkap.
//
//   HamasahStudentPicker.attach(select, { headers, placeholder, formatLabel, onLoaded })
//     -> { reload(), selectedItem() }
//
// `headers` adalah fungsi yang mengembalikan header Authorization terbaru.
(function initStudentPicker() {
  const PAGE_SIZE = 20;

  function attach(select, options = {}) {
    const headers = options.headers || (() => ({}));
    const placeholder = options.placeholder === undefined ? 'Pilih santri' : options.placeholder;
    const formatLabel = options.formatLabel || ((student) => `${student.name} · ${student.program}`);

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'student-picker__search';
    search.placeholder = 'Cari nama santri...';
    search.setAttribute('aria-label', 'Cari nama santri');
    search.hidden = true;
    const hint = document.createElement('p');
    hint.className = 'student-picker__hint';
    hint.setAttribute('role', 'status');
    hint.hidden = true;
    select.before(search);
    select.after(hint);

    let known = new Map();
    let token = 0;

    async function load(query) {
      const mine = ++token;
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (query) params.set('search', query);
      const response = await fetch(`/api/my-students?${params}`, { headers: headers() });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Data santri belum dapat dimuat.');
      if (mine !== token) return null;

      const current = select.value;
      const items = result.items || [];
      // Santri yang sedang dipilih tetap ada di daftar, walau tidak termasuk hasil pencarian.
      const keep = current && !items.some((student) => student.id === current) ? known.get(current) : null;
      known = new Map(items.map((student) => [student.id, student]));
      if (keep) known.set(keep.id, keep);

      select.replaceChildren();
      if (placeholder !== null) select.add(new Option(placeholder, ''));
      if (keep) select.add(new Option(formatLabel(keep), keep.id));
      items.forEach((student) => select.add(new Option(formatLabel(student), student.id)));
      if (current && known.has(current)) select.value = current;

      const total = typeof result.total === 'number' ? result.total : items.length;
      search.hidden = total <= PAGE_SIZE && !query;
      hint.hidden = total <= items.length && !query;
      hint.textContent = `Menampilkan ${items.length} dari ${total} santri. Ketik nama untuk mencari.`;
      if (options.onLoaded) options.onLoaded({ items, total, query });
      return { items, total };
    }

    let timer = null;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        load(search.value.trim()).catch((error) => { hint.hidden = false; hint.textContent = error.message; });
      }, 250);
    });

    return {
      reload: () => load(search.value.trim()),
      selectedItem: () => known.get(select.value) || null
    };
  }

  window.HamasahStudentPicker = Object.freeze({ attach });
}());
