-- =====================================================
-- FIX #25: Attendance Logs Upsert Constraint
-- Date: 2026-03-18
-- Issue: Code uses .upsert() with onConflict but no unique constraint exists
-- =====================================================

-- Add unique constraint for student_id + log_date combination
ALTER TABLE attendance_logs 
ADD CONSTRAINT attendance_logs_student_id_log_date_key 
UNIQUE (student_id, log_date);

-- =====================================================
-- FIX #1: QR Code Data Regeneration
-- Date: 2026-03-18
-- Issue: QR codes in database use old format but scanner expects EDU-YYYY-G###-XXXX
-- =====================================================

-- Regenerate QR codes in proper format: EDU-2026-G###-XXXX
UPDATE students 
SET qr_code_data = 'EDU-2026-G' || 
    LPAD(id::text, 3, '0') || '-' || 
    UPPER(SUBSTRING(md5(id::text) FROM 1 FOR 4))
WHERE qr_code_data IS NULL OR qr_code_data NOT LIKE 'EDU-%';

-- Verify the update
SELECT id, student_id_text, qr_code_data 
FROM students 
WHERE qr_code_data IS NOT NULL 
LIMIT 10;
