-- ============================================================================
-- MIGRATION: Add Type and Schedule columns to Announcements
-- Purpose: Support the new Broadcast Center features (Type Filter & Scheduling)
-- ============================================================================

ALTER TABLE public.announcements
ADD COLUMN IF NOT EXISTS type text DEFAULT 'General',
ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS target_teachers boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS target_parents boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS target_students boolean DEFAULT true;

-- End of migration