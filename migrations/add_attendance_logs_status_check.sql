-- ============================================================================
-- ATTENDANCE LOGS STATUS VALIDATION
-- ============================================================================
-- PURPOSE: Enforce valid attendance status values to prevent data corruption
-- and ensure consistency across all modules (gate scanner, teacher, reports).
--
-- Allowed status values with explanations:
--   PRESENT/ON TIME: Student on time for session
--   LATE: Student arrived after threshold
--   ABSENT: Student absent for session
--   EXCUSED: Excused absence (medical, approved)
--   EXCUSED ABSENT: Whole-day excused (homeroom specific)
--   NORMAL EXIT: Student left at normal dismissal
--   EARLY EXIT: Student left before dismissal (unauthorized)
--   LATE EXIT: Student left after dismissal + 30min
--   RE-ENTRY: Student left and returned same day (first re-entry)
--   LATE RE-ENTRY: Re-entry after threshold (late)
--   MEDICAL EXIT: Clinic discharge (sent home)
--   EARLY EXIT (AUTHORIZED): Guard pass authorized exit
--
-- DEPLOYMENT: Run this AFTER code deployment to ensure new code handles any
-- existing data that might be outside the allowed set. If constraint fails,
-- inspect rows with invalid status and clean them before re-running.
--
-- ROLLBACK: DROP CONSTRAINT IF EXISTS attendance_logs_status_check;

-- Step 1: Identify any existing invalid status values (log them for cleanup)
SELECT id, student_id, log_date, status
INTO TEMPORARY invalid_status_logs
FROM attendance_logs
WHERE status IS NOT NULL
  AND status NOT IN ('Present', 'On Time', 'Late', 'Absent', 'Excused', 'Excused Absent',
                     'Normal Exit', 'Early Exit', 'Late Exit', 'Re-entry', 'Late Re-entry',
                     'Medical Exit', 'Early Exit (Authorized)');

-- If any rows found, raise a notice and STOP to allow manual cleanup
DO $$
DECLARE
    invalid_count INT;
BEGIN
    SELECT COUNT(*) INTO invalid_count FROM invalid_status_logs;
    IF invalid_count > 0 THEN
        RAISE NOTICE '*** WARNING: Found % attendance_logs rows with invalid status values. Review invalid_status_logs temp table and clean data before applying constraint.', invalid_count;
        -- For safety, we will NOT add the constraint yet if invalid rows exist.
        -- Comment out RAISE EXCEPTION to proceed anyway (constraint will fail).
        -- RAISE EXCEPTION 'Clean invalid status values first';
    END IF;
END $$;

-- Step 2: Add the CHECK constraint (only if no invalid rows, else manual intervention needed)
ALTER TABLE attendance_logs
ADD CONSTRAINT attendance_logs_status_check
CHECK (
    status IS NULL 
    OR status IN (
        'Present', 
        'On Time', 
        'Late', 
        'Absent', 
        'Excused', 
        'Excused Absent',
        'Normal Exit', 
        'Early Exit', 
        'Late Exit', 
        'Re-entry', 
        'Late Re-entry',
        'Medical Exit', 
        'Early Exit (Authorized)'
    )
);

-- Step 3: Add comment for documentation
COMMENT ON CONSTRAINT attendance_logs_status_check ON attendance_logs IS 
'Ensures attendance status values are from the canonical set defined in core/general-core.js ATTENDANCE_STATUS constant. Prevents typos and inconsistent entries.';

-- Step 4: Verify constraint applied
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'attendance_logs'::regclass 
  AND conname = 'attendance_logs_status_check';
