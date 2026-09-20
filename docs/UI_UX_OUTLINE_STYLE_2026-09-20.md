# Outline UI pass

Tanggal: 2026-09-20

## Perubahan

- Menghapus em dash dari teks UI dan mengganti fallback kosong dengan copy yang jelas.
- Menghapus karakter emoji dari renderer ikon portal.
- Mengganti badge status, role, kategori, statistik, dan cover metadata menjadi gaya outline dengan border tipis dan tanpa fill dekoratif.
- Mengganti panah dekoratif berbasis karakter dengan ikon outline CSS.
- Mengganti simbol cek dan titik dekoratif pada workspace internal dengan SVG atau lingkaran outline.
- Menjaga ikon fungsional berbasis SVG tetap dapat dibaca screen reader melalui label atau `aria-hidden`.

## Validasi

- Tidak ada em dash atau karakter emoji yang tersisa pada HTML, JavaScript, dan CSS UI.
- `node --check` untuk renderer portal, website, artikel, monitoring, dan navigasi lulus.
- `npm run test:browser-contract` lulus untuk 16 halaman.
- `git diff --check` lulus.
- Screenshot mobile dan desktop ditinjau setelah perubahan.
