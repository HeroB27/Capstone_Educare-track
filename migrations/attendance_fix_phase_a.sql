-- Phase A: Safe SQL Migrations for Attendance Logic Fix
-- Run this in Supabase SQL Editor before Phase C JS modifications
-- All changes are ADD-ONLY (no data loss)

-- ============================================================================
-- PART 1: Run this first - Add columns
-- ============================================================================

-- 1. Add tracking columns to attendance_daily_summary
ALTER TABLE attendance_daily_summary 
ADD COLUMN IF NOT EXISTS last_modified_by TEXT,
ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMPTZ DEFAULT now();

-- 2. Add used_at column to guard_passes (if not exists)
ALTER TABLE guard_passes 
ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

-- Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'attendance_daily_summary' 
AND column_name IN ('last_modified_by', 'last_modified_at');

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'guard_passes' 
AND column_name = 'used_at';

-- ============================================================================
-- PART 2: Run this second (separate query) - Create indexes
-- ============================================================================

-- 3. Add performance indexes (run separately due to CONCURRENTLY limitation)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_daily_summary_student_date 
ON attendance_daily_summary(student_id, date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_guard_passes_active 
ON guard_passes(student_id, status, time_out) 
WHERE status = 'Active';