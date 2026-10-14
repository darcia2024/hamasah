-- Toko kelas daring Hamasah Courses (halaman kelas.html).
--
-- course_listings: maddah LMS yang dijual ke umum, dengan harga dan status tampil. Tabel
-- terpisah dari courses supaya maddah santri asrama tidak berubah apa pun.
-- course_orders: satu pembelian = satu tagihan (invoices). Pembeli adalah akun santri jalur
-- Hamasah Courses yang mendaftar sendiri. Saat keuangan menandai tagihannya lunas, pembeli
-- otomatis didaftarkan ke maddah itu (course_enrollments). Lihat server/course-shop-service.js.
-- Seperti migrasi 044-047, selama tabel belum ada halaman kelas tampil kosong dan pembelian
-- ditolak dengan pesan yang jelas.
CREATE TABLE IF NOT EXISTS course_listings (
  course_id UUID PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  price_rupiah BIGINT NOT NULL CHECK (price_rupiah > 0),
  published BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_orders (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS course_orders_student_idx ON course_orders (student_id, course_id);

ALTER TABLE course_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_orders ENABLE ROW LEVEL SECURITY;
