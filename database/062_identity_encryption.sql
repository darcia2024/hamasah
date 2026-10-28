-- Nomor paspor dan iqamah disimpan terenkripsi (28 Oktober 2026), jadi kolomnya perlu muat nilai
-- terenkripsi (awalan, nonce, tag, dan isi). Batas panjang lama (40) hanya untuk teks biasa.
-- Lihat server/field-encryption.js dan server/student-profile-service.js.

ALTER TABLE student_profiles DROP CONSTRAINT IF EXISTS student_profiles_passport_number_check;
ALTER TABLE student_profiles DROP CONSTRAINT IF EXISTS student_profiles_iqamah_number_check;
ALTER TABLE student_profiles ADD CONSTRAINT student_profiles_passport_number_check CHECK (char_length(passport_number) <= 300);
ALTER TABLE student_profiles ADD CONSTRAINT student_profiles_iqamah_number_check CHECK (char_length(iqamah_number) <= 300);
