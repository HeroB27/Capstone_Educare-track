-- ============================================================================
-- ATTENDANCE DAILY SUMMARY STATUS VALIDATION
-- ============================================================================
-- PURPOSE: Enforce valid morning_status and afternoon_status values in
-- attendance_daily_summary table. Ensures data consistency for reporting.
--
-- Allowed values:
--   'Present', 'Late', 'Absent', 'Excused', 'N/A'
--
-- DEPLOYMENT: Run after verifying existing data is clean.
-- If constraint fails, clean invalid rows first.
--
-- ROLLBACK: DROP CONSTRAINT IF EXISTS attendance_daily_summary_status_check;

-- Step 1: Identify any invalid morning_status
SELECT student_id, date, morning_status, afternoon_status
INTO TEMPORARY invalid_summary_rows
FROM attendance_daily_summary
WHERE morning_status IS NOT NULL
  AND morning_status NOT IN ('Present', 'Late', 'Absent', 'Excused', 'N/A')
   OR afternoon_status IS NOT NULL
  AND afternoon_status NOT IN ('Present', 'Late', 'Absent', 'Excused', 'N/A');

-- Report any invalid rows
DO $$
DECLARE
    invalid_count INT;
BEGIN
    SELECT COUNT(*) INTO invalid_count FROM invalid_summary_rows;
    IF invalid_count > 0 THEN
        RAISE NOTICE '*** WARNING: Found % attendance_daily_summary rows with invalid status values. Review temporary table "invalid_summary_rows".', invalid_count;
    END IF;
END $$;

-- Step 2: Add CHECK constraint (will fail if invalid rows exist)
ALTER TABLE attendance_daily_summary
ADD CONSTRAINT attendance_daily_summary_status_check
CHECK (
    (morning_status IS NULL OR morning_status IN ('Present', 'Late', 'Absent', 'Excused', 'N/A'))
    AND
    (afternoon_status IS NULL OR afternoon_status IN ('Present', 'Late', 'Absent', 'Excused', 'N/A'))
);

-- Step 3: Add comment
COMMENT ON CONSTRAINT attendance_daily_summary_status_check ON attendance_daily_summary IS
'Ensures daily summary status values are from the canonical set defined in core/general-core.js ATTENDANCE_STATUS constant.';

-- Step 4: Verify
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'attendance_daily_summary'::regclass
  AND conname = 'attendance_daily_summary_status_check';
