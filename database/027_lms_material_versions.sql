ALTER TABLE course_materials ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
CREATE INDEX course_material_versions_idx ON course_materials(course_id, version DESC);
