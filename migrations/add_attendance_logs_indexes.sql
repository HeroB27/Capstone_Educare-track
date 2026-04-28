-- Add composite index on attendance_logs for efficient queries
-- This supports:
--   - Subject attendance queries by student + date + subject
--   - Gatekeeper scan lookups by student + date
--   - Homeroom fetch by student + date (subject_load_id IS NULL)
-- Created as part of attendance sync fix

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_logs_student_date_subject
    ON attendance_logs(student_id, log_date, subject_load_id);

-- Also add an index for homeroom-only queries (subject_load_id IS NULL)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_logs_student_date_homeroom
    ON attendance_logs(student_id, log_date)
    WHERE subject_load_id IS NULL;

-- Verification query
SELECT 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'attendance_logs' 
    AND indexname IN (
        'idx_attendance_logs_student_date_subject',
        'idx_attendance_logs_student_date_homeroom'
    );
