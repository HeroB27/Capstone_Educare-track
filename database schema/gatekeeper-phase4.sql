-- ============================================================================
-- Phase 4: Advanced Attendance Tracking - Database Schema Updates
-- ============================================================================

-- 1. Add columns to attendance_logs for partial attendance tracking
ALTER TABLE public.attendance_logs 
ADD COLUMN IF NOT EXISTS morning_absent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS afternoon_absent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS partial_absence_notified BOOLEAN DEFAULT FALSE;

-- 2. Create table for tracking attendance patterns and security alerts
CREATE TABLE IF NOT EXISTS public.attendance_patterns (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    student_id bigint NOT NULL,
    pattern_type text NOT NULL,
    description text,
    severity text DEFAULT 'low',
    is_resolved BOOLEAN DEFAULT FALSE,
    created_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone,
    CONSTRAINT attendance_patterns_pkey PRIMARY KEY (id),
    CONSTRAINT attendance_patterns_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);

-- 3. Create table for admin alerts
CREATE TABLE IF NOT EXISTS public.admin_alerts (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    alert_type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    severity text DEFAULT 'medium',
    is_read BOOLEAN DEFAULT FALSE,
    created_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT admin_alerts_pkey PRIMARY KEY (id)
);

-- 4. Create index for faster pattern lookups
CREATE INDEX IF NOT EXISTS idx_attendance_patterns_student_id 
ON public.attendance_patterns(student_id);

CREATE INDEX IF NOT EXISTS idx_attendance_patterns_created_at 
ON public.attendance_patterns(created_at);

CREATE INDEX IF NOT EXISTS idx_admin_alerts_created_at 
ON public.admin_alerts(created_at);

-- 5. Note: Skipping unique constraint for notifications as it's not critical for Phase 4
-- The core Phase 4 features work without this constraint
