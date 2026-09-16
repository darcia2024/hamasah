-- Supabase menyajikan schema public lewat Data API. Tanpa Row Level Security, seluruh tabel
-- di bawah dapat dibaca dan ditulis oleh siapa pun yang memegang anon key, termasuk tabel
-- accounts (hash kata sandi) dan registrations (nomor telepon calon santri dan wali).
--
-- Mengaktifkan RLS tanpa policy berarti menolak semua akses dari role Data API.
-- Aplikasi tidak terpengaruh karena terhubung sebagai pemilik tabel, dan pemilik tabel
-- melewati RLS selama FORCE ROW LEVEL SECURITY tidak diaktifkan.
--
-- Setiap migrasi berikutnya yang membuat tabel baru wajib menyertakan perintah serupa.

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_parent_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE visa_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
