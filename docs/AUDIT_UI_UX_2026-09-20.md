# Audit UI/UX dan rencana perbaikan — 20 September 2026

## Kesimpulan

Tampilan belum layak dinyatakan final. Masalah terbesar adalah navigasi mobile, layout dashboard mobile, kontras teks sekunder, dan konsistensi form. Identitas visual emas dan Plus Jakarta Sans dapat dipertahankan; tidak perlu mengganti arah desain lagi.

Audit ini hanya menghasilkan dokumentasi. Tidak ada perubahan kode aplikasi, data, konfigurasi, atau deployment.

## Metode dan batas pemeriksaan

- Browser lokal: `http://127.0.0.1:4273`, desktop 1440 × 900 dan mobile 390 × 844. Ukuran viewport dikembalikan setelah audit.
- Seluruh 16 halaman HTML di folder `website` dibuka pada kedua ukuran. `/` pada server ini menampilkan landing page yang sama, bukan proposal terpisah.
- Pemeriksaan mencakup tampilan awal setiap halaman, bagian pendaftaran dan error kosong, portal setelah data selesai dimuat, tab CMS dan daftar editorial, serta state notifikasi kosong.
- Pemeriksaan DOM dan sumber digunakan untuk memperjelas beberapa temuan. Screenshot dilihat selama sesi; tidak ada berkas screenshot yang disimpan bersama laporan ini.
- Sesi internal yang tersedia adalah admin. Tampilan role guru, pengawas, santri, wali, dan petugas belum diverifikasi menggunakan sesi masing-masing. Jangan menganggap akses admin membuktikan seluruh pengalaman role tersebut.
- Tidak mengirim pendaftaran, mengubah status, menerbitkan artikel, mengunggah berkas, mengirim email, atau mengganti password. Submit form pendaftaran kosong hanya digunakan untuk melihat validasi.
- Semua halaman telah ditinjau, tetapi bukan semua kombinasi tab, modal, data, error jaringan, dan state sukses. Bagian yang belum diamati dinyatakan sebagai rencana verifikasi, bukan hasil lulus.
- Data bernama Contoh/Smoke/UAT di database lokal tidak otomatis dianggap data palsu hardcoded. Bedakan fixture pengujian dengan elemen dekoratif yang mengaku sebagai data aktual.

## Tingkat keparahan

| Level | Arti | Target penanganan |
|---|---|---|
| P0 — kritis | Alur utama tidak dapat dipakai sama sekali atau dampak serius terkonfirmasi | Blokir rilis; tidak ditemukan dari cakupan visual ini |
| P1 — tinggi | Navigasi sulit, informasi penting sulit dibaca, atau tampilan berpotensi menyesatkan | Selesaikan sebelum UAT visual final |
| P2 — sedang | Spacing, hierarki, konsistensi kontrol, atau efisiensi alur bermasalah | Selesaikan sebelum rilis |
| P3 — ringan | Polesan estetika tanpa hambatan utama | Setelah P1/P2 |

Prioritas halaman di bawah adalah temuan tertinggi pada halaman, bukan ukuran kerusakan backend.

## Matriks per halaman

| Halaman | Level tertinggi | Temuan teramati | Rencana perbaikan |
|---|---|---|---|
| `/website/index.html` dan `/` | P1 | Angka contoh 98.4% dan Mumtaz tampil pada gambaran portal tanpa penanda ilustrasi yang jelas; klaim resmi/akreditasi memerlukan dasar. Badge kanan atas foto hero terpotong lengkungan frame. Pada mobile badge pembuka sempit, teks dua baris mendekati batas. | Pisahkan ilustrasi dari hasil nyata; validasi klaim; keluarkan badge dari area clipping gambar; beri tinggi otomatis dan ruang teks. |
| `/website/biaya.html` | P1 | Menu navigasi tidak terlihat di header mobile. Helper text kartu sangat pucat. Jarak antarseksi besar dan judul pricing terputus menjadi baris pendek di desktop. | Pakai navigasi mobile bersama; kuatkan teks detail biaya; sesuaikan lebar judul dan ritme antarseksi. |
| `/website/kontak.html` | P1 | Menu mobile tidak terlihat. Nomor telepon dan jam operasional terlalu pucat dibanding judul. Alamat/nomor bergaya contoh perlu konfirmasi isi sebelum CTA digunakan publik. | Navigasi bersama; detail kontak terbaca; konfirmasi sumber kontak, bedakan zona waktu dan kanal. |
| `/website/articles.html` | P1 | Menu mobile tidak terlihat. Desktop dengan satu artikel menyisakan dua pertiga grid kosong. Metadata pucat; placeholder pencarian terpotong pada mobile. | Navigasi bersama; layout adaptif jumlah hasil; label pencarian permanen dan placeholder singkat; kontras metadata. |
| `/website/article.html` | P1 | Menu mobile tidak terlihat. Breadcrumb dan metadata pucat. Untuk artikel singkat, lead/byline/kartu penulis lebih dominan daripada isi. | Navigasi bersama; sederhanakan metadata; lebar baca nyaman; panjang komponen pendukung mengikuti isi. |
| `/website/cek-status.html` | P1 | Menu mobile tidak terlihat. Tombol Masuk & Lacak Pendaftaran membungkus tiga baris dalam pill pendek. Tombol Contoh Data terlihat. Field pemulihan email bergaya native, berbeda dari field utama. | CTA lebih singkat dan tinggi otomatis; hilangkan affordance demo di tampilan publik; samakan field; konsisten memakai istilah Kode Akses. |
| `/website/portal.html` | P1 | Nama topbar Tester Hamasah berbeda dari Admin Dev di sidebar. Teks ringkasan hampir menyatu dengan latar. Mobile sidebar menghabiskan sebagian besar layar, lalu halaman memiliki scroll horizontal. | Satu sumber identitas pengguna; perbaiki kontras; drawer mobile; perbaiki lebar konten dan tab. |
| `/website/staff.html` | P1 | Sidebar mobile mendorong konten jauh ke bawah. Tombol Perbarui Data native. CMS: label slug mepet select; judul artikel dan slug pada daftar menempel; default editor langsung Terbitkan. | Shell mobile bersama; kontrol bersama; perbaiki gap editorial; draft sebagai awal dan preview sebelum publikasi. |
| `/website/monitoring.html` | P1 | Sidebar mobile panjang; topbar sempit; refresh native. Setelah pembuka besar, selector santri dan ruang kosong tidak memberi arahan yang kuat. | Ringkas pembuka; panduan pilih santri; tampilkan empty state kontekstual; optimalkan tab panjang dan shell. |
| `/website/lms.html` | P1 | Sidebar mobile panjang. Ringkasan dominan, konten belajar tidak segera terlihat. Klaim Tersinkronisasi Lengkap tampil sebelum santri dipilih. | Letakkan pilihan santri/maddah sebagai tugas awal; status berdasarkan proses nyata; shell mobile bersama. |
| `/website/operations.html` | P1 | Sidebar mobile panjang; refresh native. Form desktop satu kolom sangat lebar dengan kartu bertingkat dan CTA selebar form. | Shell mobile; grid form terarah di desktop; satu lapis panel; pisahkan aksi utama dan daftar hasil. |
| `/website/audit.html` | P1 | Sidebar mobile panjang. Filter bertumpuk, label berdekatan dengan field sebelumnya, daftar log tertunda di bawah. Refresh native. | Filter ringkas/grid desktop; label dengan jarak konsisten; ringkasan hasil dekat filter; mobile tabel/daftar terukur. |
| `/website/aktivasi.html` | P2 | Tanpa token, form password tetap mendominasi sebelum pesan tautan tidak berlaku. Pesan meminta tautan baru tetapi hanya ada link kembali masuk. | Tampilkan state tautan bermasalah lebih dulu dengan langkah pemulihan jelas; tambahkan show/hide password dan panduan syarat. |
| `/website/lupa-password.html` | P2 | Layout cukup terbaca dan tidak terpotong pada ukuran audit. Ruang kosong sebelum link kembali terasa besar; copy kanal resmi kurang spesifik. | Rapikan jarak status; jelaskan tujuan pengiriman secara netral tanpa membocorkan keberadaan akun. |
| `/website/reset-password.html` | P2 | Sama seperti aktivasi: form dominan walau tautan tidak lengkap; tidak ada CTA langsung meminta reset baru. | State invalid terpisah, tautkan ke lupa password; show/hide password dan syarat jelas. |
| `/website/404.html` | P2 | Konten menempel ke bagian atas; sebagian besar viewport kosong. Tidak memakai komposisi halaman bantuan yang konsisten. | Container dengan ruang vertikal wajar, penanda 404, CTA beranda dan kontak; tetap sederhana. |

Jumlah: 12 halaman dengan P1, 4 dengan P2. Tidak ada P0 yang terkonfirmasi. Enam halaman internal berbagi masalah shell yang sama; ini satu akar masalah, bukan enam implementasi terpisah.

## Temuan lintas halaman dan bukti

### UI-01 — Navigasi publik mobile hilang — P1

Pada 390 px, landing page menampilkan tombol Menu. Halaman biaya, kontak, katalog artikel, detail artikel, dan cek status hanya menampilkan logo di header. Pengguna tidak memperoleh akses navigasi yang setara tanpa kembali atau mencari footer.

Perbaikan: satu header responsif bersama, halaman aktif, toggle berlabel, status expanded, tutup dengan Escape, pengembalian fokus. Uji keyboard dan jangan mengandalkan logo sebagai satu-satunya jalan keluar.

### UI-02 — Shell internal tidak efektif di mobile — P1

Pada seluruh enam halaman internal, logo, profil, menu, dan keluar sesi menghabiskan sekitar 550 px pertama. Konten inti baru dimulai dekat bagian bawah layar. Topbar menjadi sempit dan teks refresh membungkus.

Perbaikan: drawer tertutup sebagai kondisi awal mobile, topbar ringkas, backdrop dan fokus yang benar. Pertahankan sidebar desktop. Konten utama harus sudah mulai terlihat tanpa melewati daftar navigasi panjang.

### UI-03 — Overflow portal — P1

DOM pada viewport 390 px menunjukkan `document.documentElement.scrollWidth = 403`. Screenshot juga menunjukkan scrollbar horizontal halaman. Tab panjang berada jauh di kanan viewport; bedakan scroll lokal tab yang disengaja dari overflow seluruh halaman.

Perbaikan: audit min-width/grid/flex, pembungkus tab dengan scroll lokal dan indikator lanjutan, kontrol topbar tidak memaksa lebar dokumen. Jangan menyembunyikan masalah dengan overflow-x hidden global.

### UI-04 — Kontras teks sekunder — P1

Portal: teks “Program akan muncul setelah maddah dan materi dipublikasikan oleh pembina.” memiliki computed color `rgb(214, 207, 190)` dan ukuran 13 px pada permukaan hampir putih. Secara visual sulit dibaca. Masalah serupa terlihat pada kartu statistik, empty state, metadata artikel, dan detail kontak. Belum ada perhitungan rasio seluruh pasangan warna, sehingga laporan ini tidak mengklaim sertifikasi WCAG.

Perbaikan: token teks sekunder yang lebih gelap, body Regular 400 dan judul SemiBold 600 sesuai arahan pengguna. Target rasio teks normal minimal 4.5:1 dan teks besar 3:1. Jangan membuat empty state tampak disabled jika pesannya masih penting dibaca.

### UI-05 — Status dan identitas yang tidak dapat dipercaya — P1

Topbar portal Tester Hamasah tidak sama dengan Admin Dev di sidebar; literal nama ditemukan di `website/portal.html`. Badge sidebar Pendaftaran 4 berbeda dari tab daftar masuk 3. Perbedaan angka belum membuktikan bug perhitungan karena definisinya bisa berbeda, tetapi UI tidak menjelaskan artinya.

Perbaikan: identitas berasal dari sesi yang sama; badge diberi arti yang jelas dan sumber aktual atau dihilangkan. Jangan tampilkan sinkronisasi lengkap, realtime, arsip permanen, atau jaminan resmi sebagai fakta tanpa dasar yang sesuai. Angka 98.4% pada gambaran portal harus diberi penanda ilustrasi atau diganti penjelasan nonnumerik.

### UI-06 — Kontrol dan jarak form tidak konsisten — P2, P1 pada CTA cek status mobile

Refresh internal tampil seperti kontrol native abu-abu. Cek status memadukan input modern dan field recovery native. CMS menunjukkan label slug dekat sekali ke select sebelumnya; daftar editorial menempelkan judul dan slug tanpa pemisahan yang cukup. Audit filter menumpuk field tanpa ritme label yang jelas.

Perbaikan: satu spesifikasi input/select/textarea/button, tinggi kontrol minimum praktis 44 px, label 6–8 px dari field terkait, grup 16–24 px, feedback dekat field. Tinggi tombol harus mengakomodasi teks; jangan mengunci tinggi pill saat label membungkus.

### UI-07 — Hierarki internal terlalu berat di bagian pembuka — P2

Monitoring, LMS, staff, operations, dan audit mengulang panel judul plus banyak metadata sebelum tugas utama. Pada mobile masalahnya berlipat dengan sidebar panjang. Operations menaruh kartu form di dalam kartu, dengan field penuh lebar desktop.

Perbaikan: judul, konteks penting, dan satu aksi utama; metadata tambahan dapat disingkat atau dibuka bila dibutuhkan. Form desktop dua kolom hanya untuk pasangan data yang relevan; mobile satu kolom. Kurangi border/radius/shadow bertingkat.

### UI-08 — Editorial berisiko salah tindakan — P1/P2

CMS yang diamati membuka status editorial Terbitkan dan CTA Terbitkan Artikel Sekarang; hanya input URL HTTPS untuk cover yang tampak pada form. Tidak terlihat upload lokal atau preview cover di state ini. Daftar menampilkan status bahasa Inggris `published` di tengah UI Indonesia.

Perbaikan: default draft, preview dan status tersimpan jelas, label tombol mengikuti status, Bahasa Indonesia konsisten. Rencanakan preview media, validasi tipe/ukuran, alt text, dan hasil upload. Keberadaan backend media tidak membuktikan kelengkapan UI; perlu cek terpisah saat implementasi.

### UI-09 — Error autentikasi belum mengarahkan pengguna — P2

Aktivasi/reset tanpa token menampilkan pesan error dan tombol submit tampak nonaktif, namun masih mengajak membuat password di bagian paling dominan. Ini kondisi tautan tidak lengkap, bukan bukti bahwa token kedaluwarsa/valid telah diuji.

Perbaikan: pesan invalid di awal, sebab umum tanpa detail sensitif, CTA konkret meminta tautan baru/menghubungi petugas. Pisahkan state valid, invalid, expired, used, loading, dan success. Jangan meminta pengguna mengisi form yang tidak dapat diproses.

### UI-10 — Estetika publik dan kepadatan informasi — P2/P3

Hero badge terpotong frame lengkung. Banyak permukaan kecil memiliki shadow dan border sekaligus. Katalog satu artikel tidak memanfaatkan area desktop. Artikel pendek diberi dekorasi metadata berlebihan. Halaman 404 sebaliknya hampir tidak memiliki komposisi ruang.

Perbaikan: gunakan satu pola elevasi sederhana, radius konsisten, grid adaptif jumlah konten, ritme vertikal lebih rapat tanpa membuat teks mepet. Pertahankan emas logo; bedakan warna utama dari warna warning/error. Ukur warna final dari asset logo saat implementasi, bukan menebak emas baru.

## Yang sudah baik dan perlu dipertahankan

- Identitas logo dan navigasi desktop mudah dikenali.
- Mayoritas konten publik berubah menjadi satu kolom di 390 px dan judul tidak saling menimpa.
- Form pendaftaran kosong menampilkan pesan error inline, memberi fokus pada nama yang bermasalah, dan tidak melanjutkan pengiriman.
- Kartu aktivasi/lupa/reset cukup terbaca di dua ukuran yang diperiksa.
- Portal menampilkan pesan belum ada data untuk beberapa ringkasan; perbaiki kontras dan tindak lanjutnya, bukan mengisi grafik palsu.
- Label Kegiatan Santri pada filter artikel menggunakan nilai kategori Kegiatan di sumber; perbedaan tulisan ini bukan bukti filter rusak.

## Rencana pengerjaan berurutan

### 1. Komponen dasar dan navigasi

Perbaiki header publik, drawer internal, overflow portal, token tipografi/kontras, serta tombol/input bersama. Verifikasi seluruh 16 halaman kembali karena perubahan komponen bersama dapat memengaruhi semuanya.

Selesai jika: pada 360, 390, 768, 1024, dan 1440 px tidak ada overflow dokumen; menu dapat digunakan dengan keyboard; identitas pengguna konsisten; teks utama dan sekunder memenuhi target kontras.

### 2. Pendaftaran dan pemulihan akses

Perbaiki CTA cek status, recovery email, istilah kode akses, elemen demo, struktur form panjang, validasi, serta aktivasi/reset invalid state. Kelompokkan form pendaftaran menjadi data calon, pendidikan, wali, persetujuan. Jika memakai langkah bertahap, pastikan data tidak hilang ketika kembali.

Selesai jika: error jelas, fokus benar, input tidak tertutup header/keyboard mobile, loading mencegah submit ganda, pengguna tahu langkah berikutnya. Uji success, perlu revisi, upload gagal, kode salah, undangan kedaluwarsa dengan fixture lokal saat implementasi; audit ini belum mengujinya.

### 3. Halaman kerja internal

Ringkas pembuka; rapikan monitoring dan LMS empty state, form operations, filter audit, serta kartu daftar staff. Jelaskan konteks santri yang sedang dipilih. Bedakan aksi lihat, simpan, ekspor, dan tindakan destruktif.

Selesai jika: tugas utama terlihat cepat di mobile; daftar panjang tidak menabrak action; nama panjang, data kosong, loading, dan error jaringan tetap terbaca. Uji tampilan sesuai role masing-masing, bukan hanya admin.

### 4. CMS dan konten publik

Rapikan daftar editorial, draft/publish/archive, preview cover, kategori, hasil pencarian, article detail, biaya dan kontak. Review klaim resmi, angka, fasilitas, alamat, serta batas layanan terhadap konten yang disetujui pemilik.

Selesai jika: status publikasi dan konsekuensi aksi jelas; daftar 0/1/banyak artikel tetap bagus; tidak ada placeholder yang dianggap informasi resmi; perubahan CMS dan halaman publik konsisten.

### 5. Polesan dan UAT visual akhir

Rapikan frame hero, shadow, radius, spacing, footer, dan 404. Ambil screenshot sebelum/sesudah per halaman desktop/mobile. Catat regresi dan validasi setelah data riil tersedia.

Selesai jika: semua P1/P2 tertutup dengan bukti; pengguna utama dapat mendaftar, melacak, membaca artikel, masuk, dan menyelesaikan tugas role tanpa penjelasan dari pengembang.

## Checklist verifikasi lanjutan

- [ ] Setiap halaman: 360/390/768/1024/1440 px, teks panjang, zoom 200%, portrait/landscape.
- [ ] Keyboard: urutan Tab, fokus terlihat, menu/drawer Escape, fokus kembali, tidak ada trap.
- [ ] Screen reader: label input, error terkait field, status async, nama tombol ikon, heading berurutan.
- [ ] Kontras: teks, placeholder, badge, focus ring, disabled, success/warning/error.
- [ ] Pendaftaran: error kosong sudah diamati; error server, submit sukses, hasil konversi, revisi dokumen belum diaudit visual lengkap.
- [ ] Akses akun: guest login, valid token, expired/used token, berhasil aktivasi/reset belum diaudit lengkap.
- [ ] Portal: admin sudah diamati; role santri/wali/guru/pengawas/petugas perlu sesi masing-masing.
- [ ] Monitoring/LMS: pilihan santri, detail materi, archived/completed, tugas/feedback perlu audit state lanjut.
- [ ] Operasional: invoice/kuitansi, visa, inventaris, export/download perlu audit state lanjut.
- [ ] Staff: daftar dan CMS sudah diamati; import preview/error/rollback dan detail konversi perlu audit lanjut.
- [ ] Artikel: valid detail sudah diamati; tidak ditemukan, empty search, cover gagal, loading perlu audit lanjut.
- [ ] Periksa seluruh tautan, kontak, dan klaim dengan sumber pemilik sebelum publikasi; tidak perlu mengubah data production untuk perbaikan visual lokal.

## Keputusan/manual di akhir

Pekerjaan layout, spacing, komponen, navigasi, dan pengujian fixture lokal dapat dikerjakan tanpa menunggu pengguna. Yang perlu keputusan pemilik adalah validitas klaim akreditasi/resmi/jaminan, kontak dan lokasi, biaya/fasilitas, SLA respons 1×24 jam, serta konten final. Kumpulkan pertanyaan ini setelah perbaikan lokal siap ditinjau. Tidak perlu mengisi environment production untuk memulai perbaikan UI.
