-- Kelola Asrama (16 Oktober 2026): jadwal kegiatan, agenda acara, piket, uang kas dan
-- iuran, serta inventaris per asrama. Dikelola musyrif asrama itu dan admin; jadwal dan
-- piket ikut tampil di beranda santri dan wali. Lihat server/dormitory-management-service.js.
-- Seperti migrasi 044-049, selama tabel belum ada halaman Kelola Asrama menampilkan arahan
-- ke halaman Pengaturan dan penyimpanan ditolak dengan pesan yang jelas.

-- Jadwal: kegiatan rutin mingguan (hari 1 = Senin ... 7 = Ahad) atau acara sekali jalan.
CREATE TABLE IF NOT EXISTS dormitory_schedule (
  id UUID PRIMARY KEY,
  dormitory_id UUID NOT NULL REFERENCES dormitories(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('rutin', 'acara')),
  day_of_week SMALLINT CHECK (day_of_week BETWEEN 1 AND 7),
  event_date DATE,
  start_time TIME,
  end_time TIME,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  location TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((kind = 'rutin' AND day_of_week IS NOT NULL) OR (kind = 'acara' AND event_date IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS dormitory_schedule_dorm_idx ON dormitory_schedule (dormitory_id, kind, day_of_week, event_date);

-- Piket: daftar tugas per asrama dan santri yang bertugas tiap hari dalam sepekan.
CREATE TABLE IF NOT EXISTS dormitory_duties (
  id UUID PRIMARY KEY,
  dormitory_id UUID NOT NULL REFERENCES dormitories(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  position SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dormitory_duty_assignments (
  duty_id UUID NOT NULL REFERENCES dormitory_duties(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (duty_id, day_of_week, student_id)
);

CREATE INDEX IF NOT EXISTS dormitory_duty_assignments_student_idx ON dormitory_duty_assignments (student_id);

-- Uang kas: pemasukan dan pengeluaran. Iuran santri = pemasukan berkategori 'iuran'
-- dengan student_id dan period (YYYY-MM). Salah catat dibatalkan (voided_at), tidak dihapus.
CREATE TABLE IF NOT EXISTS dormitory_cash_entries (
  id UUID PRIMARY KEY,
  dormitory_id UUID NOT NULL REFERENCES dormitories(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('masuk', 'keluar')),
  amount_rupiah BIGINT NOT NULL CHECK (amount_rupiah > 0),
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 2 AND 40),
  note TEXT NOT NULL DEFAULT '',
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  period TEXT CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
  created_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  voided_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS dormitory_cash_dorm_idx ON dormitory_cash_entries (dormitory_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS dormitory_cash_dues_idx ON dormitory_cash_entries (dormitory_id, period, student_id) WHERE category = 'iuran';

-- Besaran iuran bulanan per asrama.
CREATE TABLE IF NOT EXISTS dormitory_dues (
  dormitory_id UUID PRIMARY KEY REFERENCES dormitories(id) ON DELETE CASCADE,
  monthly_amount_rupiah BIGINT NOT NULL CHECK (monthly_amount_rupiah >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inventaris milik asrama. Barang yang tidak dipakai lagi diarsipkan, tidak dihapus.
CREATE TABLE IF NOT EXISTS dormitory_inventory (
  id UUID PRIMARY KEY,
  dormitory_id UUID NOT NULL REFERENCES dormitories(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  condition TEXT NOT NULL DEFAULT 'baik' CHECK (condition IN ('baik', 'rusak', 'hilang')),
  note TEXT NOT NULL DEFAULT '',
  updated_by_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS dormitory_inventory_dorm_idx ON dormitory_inventory (dormitory_id) WHERE archived_at IS NULL;

ALTER TABLE dormitory_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE dormitory_duties ENABLE ROW LEVEL SECURITY;
ALTER TABLE dormitory_duty_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE dormitory_cash_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE dormitory_dues ENABLE ROW LEVEL SECURITY;
ALTER TABLE dormitory_inventory ENABLE ROW LEVEL SECURITY;
