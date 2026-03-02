-- ============================================================================
-- EDUCARE TRACK - DATABASE FIX COMMANDS
-- Run these SQL commands in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- FIX 1: Add is_active column to admins table
-- ============================================================================
-- This is needed because the login system checks for is_active to determine
-- if a user account is deactivated. Without this column, admin accounts
-- cannot be deactivated through the user management interface.

ALTER TABLE public.admins 
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- ============================================================================
-- FIX 2: Add is_active column to guards table (optional - for consistency)
-- ============================================================================
ALTER TABLE public.guards 
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- ============================================================================
-- FIX 3: Add is_active column to clinic_staff table (optional - for consistency)
-- ============================================================================
ALTER TABLE public.clinic_staff 
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- ============================================================================
-- VERIFICATION: Check if columns were added correctly
-- ============================================================================
SELECT 
    table_name, 
    column_name, 
    data_type, 
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND column_name = 'is_active'
ORDER BY table_name;

-- ============================================================================
-- UPDATE EXISTING RECORDS: Set is_active = true for all existing admins
-- ============================================================================
UPDATE public.admins SET is_active = true WHERE is_active IS NULL;
UPDATE public.guards SET is_active = true WHERE is_active IS NULL;
UPDATE public.clinic_staff SET is_active = true WHERE is_active IS NULL;

-- ============================================================================
-- END OF FIX COMMANDS
-- ============================================================================
