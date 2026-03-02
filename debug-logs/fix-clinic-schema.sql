-- ============================================================================
-- CLINIC MODULE FIX: Add 'priority' column to announcements table
-- This allows the "Important" filter on the announcements board to function.
-- ============================================================================
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS priority TEXT;