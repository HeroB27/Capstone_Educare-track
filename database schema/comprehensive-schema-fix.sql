-- ============================================================================
-- EDUCARE TRACK - COMPREHENSIVE DATABASE SCHEMA FIX
-- Run these SQL commands in Supabase SQL Editor to fix all schema mismatches
-- ============================================================================
-- Generated: 2026-03-02
-- Purpose: Fix all database schema issues identified through deep debug
-- ============================================================================

-- ============================================================================
-- SECTION 1: ALREADY DOCUMENTED FIXES (is_active columns)
-- ============================================================================

-- Add is_active column to admins table
ALTER TABLE public.admins 
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Add is_active column to guards table  
ALTER TABLE public.guards 
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Add is_active column to clinic_staff table
ALTER TABLE public.clinic_staff 
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Update existing records to have is_active = true
UPDATE public.admins SET is_active = true WHERE is_active IS NULL;
UPDATE public.guards SET is_active = true WHERE is_active IS NULL;
UPDATE public.clinic_staff SET is_active = true WHERE is_active IS NULL;

-- ============================================================================
-- SECTION 2: CLINIC VISITS - Missing columns for notifications & approvals
-- ============================================================================

-- Add parent_notified column for tracking if parent was notified of clinic visit
ALTER TABLE public.clinic_visits
ADD COLUMN IF NOT EXISTS parent_notified boolean DEFAULT false;

-- Add parent_notified_at column to track when parent was notified
ALTER TABLE public.clinic_visits
ADD COLUMN IF NOT EXISTS parent_notified_at timestamp with time zone;

-- Add teacher_approval column for sent-home approval workflow
ALTER TABLE public.clinic_visits
ADD COLUMN IF NOT EXISTS teacher_approval boolean;

-- Add teacher_remarks column for teacher approval/disapproval notes
ALTER TABLE public.clinic_visits
ADD COLUMN IF NOT EXISTS teacher_remarks text;

-- ============================================================================
-- SECTION 3: EXCUSE LETTERS - Missing updated_at column
-- ============================================================================

-- Add updated_at column to track when excuse letters are approved/rejected
ALTER TABLE public.excuse_letters
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- ============================================================================
-- SECTION 4: ANNOUNCEMENTS - Priority and Admin tracking columns
-- ============================================================================

-- Add priority column for Important/Normal announcement filtering
ALTER TABLE public.announcements
ADD COLUMN IF NOT EXISTS priority text;

-- Add type column for General/Emergency/Event categorization
ALTER TABLE public.announcements
ADD COLUMN IF NOT EXISTS type text DEFAULT 'General';

-- Add scheduling and targeting columns
ALTER TABLE public.announcements
ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS target_teachers boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS target_parents boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS target_students boolean DEFAULT true;

-- Add posted_by_admin_id column to track which admin posted the announcement
ALTER TABLE public.announcements
ADD COLUMN IF NOT EXISTS posted_by_admin_id bigint REFERENCES public.admins(id);

-- ============================================================================
-- SECTION 5: NOTIFICATIONS - Additional columns for scheduling
-- ============================================================================

-- Add is_urgent column for urgent announcements
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS is_urgent boolean DEFAULT false;

-- Add scheduled_at column for scheduled notifications
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone;

-- Add sender_id column to track who sent the notification
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS sender_id bigint;

-- Add batch_id column for grouping scheduled announcements
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS batch_id text;

-- ============================================================================
-- SECTION 6: TEACHERS - Additional columns
-- ============================================================================

-- Add is_gatekeeper column (may already exist, but ensuring it's present)
ALTER TABLE public.teachers
ADD COLUMN IF NOT EXISTS is_gatekeeper boolean DEFAULT false;

-- ============================================================================
-- SECTION 7: STUDENTS - Additional useful columns
-- ============================================================================

-- Add qr_code_data column for QR code generation (may already exist)
ALTER TABLE public.students
ADD COLUMN IF NOT EXISTS qr_code_data text;

-- Add profile_photo_url column for student photos (may already exist)
ALTER TABLE public.students
ADD COLUMN IF NOT EXISTS profile_photo_url text;

-- ============================================================================
-- VERIFICATION: Check all columns were added correctly
-- ============================================================================

SELECT 
    table_name, 
    column_name, 
    data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name IN ('clinic_visits', 'excuse_letters', 'announcements', 'notifications', 'teachers', 'students')
AND column_name IN ('parent_notified', 'parent_notified_at', 'teacher_approval', 'teacher_remarks', 
                    'updated_at', 'priority', 'type', 'is_urgent', 'scheduled_at', 'sender_id', 'batch_id',
                    'is_gatekeeper', 'qr_code_data', 'profile_photo_url', 'is_active')
ORDER BY table_name, column_name;

-- ============================================================================
-- END OF COMPREHENSIVE SCHEMA FIX
-- ============================================================================
