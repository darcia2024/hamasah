CREATE TABLE student_follow_ups (
 id UUID PRIMARY KEY, student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 title TEXT NOT NULL CHECK(char_length(title) BETWEEN 3 AND 160),
 target TEXT NOT NULL CHECK(char_length(target) BETWEEN 5 AND 1000),
 due_on DATE NOT NULL, status TEXT NOT NULL DEFAULT 'perlu' CHECK(status IN ('perlu','dipantau','selesai')),
 progress_note TEXT NOT NULL DEFAULT '' CHECK(char_length(progress_note)<=1000),
 created_by UUID REFERENCES accounts(id) ON DELETE SET NULL, updated_by UUID REFERENCES accounts(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX student_follow_ups_due_idx ON student_follow_ups(status,due_on,student_id);
ALTER TABLE student_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_leave_requests ADD COLUMN returned_at TIMESTAMPTZ;
ALTER TABLE student_leave_requests ADD COLUMN returned_by UUID REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE student_leave_requests ADD COLUMN return_note TEXT NOT NULL DEFAULT '' CHECK(char_length(return_note)<=300);
