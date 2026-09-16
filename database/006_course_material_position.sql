-- Urutan materi di dalam satu maddah.
-- Sebelumnya urutan hanya mengikuti created_at, sehingga dua materi yang dibuat pada
-- detik yang sama bisa berpindah-pindah urutannya di layar santri. Kolom position
-- membuat urutan tetap dan nanti bisa diatur pembina.

ALTER TABLE course_materials ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

-- Materi yang sudah ada diberi nomor urut mengikuti waktu pembuatannya.
UPDATE course_materials SET position = urutan.baris - 1
FROM (
  SELECT id, row_number() OVER (PARTITION BY course_id ORDER BY created_at, id) AS baris
  FROM course_materials
) AS urutan
WHERE course_materials.id = urutan.id;
