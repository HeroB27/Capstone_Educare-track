-- ============================================================================
-- QR Code Regeneration Script
-- Purpose: Regenerate student QR codes to match the new format: EDU-YYYY-G###-XXXX
-- Run in: Supabase SQL Editor
-- ============================================================================

-- Step 1: View current QR codes to understand the data
SELECT id, student_id_text, full_name, qr_code_data 
FROM students 
ORDER BY id 
LIMIT 20;

-- Step 2: Generate new QR codes in proper format
-- Format: EDU-2026-G001-A1B2 (Year-Gate-Number-UniqueSuffix)
-- This generates sequential G001, G002, etc. based on student ID

UPDATE students 
SET qr_code_data = 'EDU-2026-G' || 
    LPAD(id::text, 3, '0') || '-' || 
    UPPER(SUBSTRING(md5(id || full_name) FROM 1 FOR 4))
WHERE qr_code_data IS NULL 
   OR qr_code_data NOT LIKE 'EDU-%';

-- Step 3: Verify the update
SELECT id, student_id_text, full_name, qr_code_data 
FROM students 
WHERE qr_code_data LIKE 'EDU-%'
ORDER BY id 
LIMIT 20;

-- Step 4: Count how many were updated
SELECT 
    COUNT(*) as total_students,
    COUNT(qr_code_data) as with_qr_codes,
    COUNT(CASE WHEN qr_code_data LIKE 'EDU-%' THEN 1 END) as edu_format
FROM students;

-- ============================================================================
-- ALTERNATIVE: If you want to use student_id_text for the G### part
-- ============================================================================
/*
-- Reset to try again
UPDATE students SET qr_code_data = NULL;

-- Use student_id_text (e.g., "STU-001" -> extract "001")
UPDATE students 
SET qr_code_data = 'EDU-2026-G' || 
    COALESCE(
        SUBSTRING(student_id_text FROM '[0-9]+'), 
        LPAD(id::text, 3, '0')
    ) || '-' || 
    UPPER(SUBSTRING(md5(id || full_name) FROM 1 FOR 4));
*/
