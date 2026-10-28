-- Izin pulang ke Indonesia (28 Oktober 2026): jenis izin baru untuk santri yang pulang dalam waktu
-- lebih lama. Pembayarannya berbeda selama pulang, jadi keuangan perlu melihatnya. Besaran tarif
-- belum diputuskan, sehingga tidak ada tagihan yang diubah otomatis. Lihat
-- server/student-life-service.js (recordHomeLeave, homeLeaves).

ALTER TABLE student_leave_requests DROP CONSTRAINT IF EXISTS student_leave_requests_kind_check;
ALTER TABLE student_leave_requests ADD CONSTRAINT student_leave_requests_kind_check
  CHECK (kind IN ('keluar-asrama', 'sakit', 'lainnya', 'pulang-indonesia'));
