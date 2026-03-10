-- ============================================================================
-- EDUCARE TRACK - DATA CLEANUP SCRIPT
-- Run this in Supabase SQL Editor to delete all seeded data
-- This resets the database to empty state for fresh seeding
-- ============================================================================

-- WARNING: This will delete ALL data from the following tables:
-- - attendance_logs
-- - students  
-- - subject_loads
-- - classes
-- - parents
-- - teachers
-- - guards
-- - admins
-- - announcements
-- - clinic_visits
-- - excuse_letters
-- - holidays
-- - suspensions
-- - notifications

-- Run the TRUNCATE command
TRUNCATE TABLE 
    attendance_logs, 
    students, 
    subject_loads, 
    classes, 
    parents, 
    teachers, 
    guards, 
    admins, 
    announcements, 
    clinic_visits, 
    excuse_letters, 
    holidays, 
    suspensions,
    notifications,
    admin_alerts,
    attendance_patterns,
    password_resets
RESTART IDENTITY CASCADE;

-- Verify tables are empty (optional)
SELECT 'admins' as table_name, COUNT(*) as count FROM admins
UNION ALL
SELECT 'teachers', COUNT(*) FROM teachers
UNION ALL
SELECT 'guards', COUNT(*) FROM guards
UNION ALL
SELECT 'parents', COUNT(*) FROM parents
UNION ALL
SELECT 'classes', COUNT(*) FROM classes
UNION ALL
SELECT 'students', COUNT(*) FROM students
UNION ALL
SELECT 'attendance_logs', COUNT(*) FROM attendance_logs
UNION ALL
SELECT 'announcements', COUNT(*) FROM announcements
UNION ALL
SELECT 'clinic_visits', COUNT(*) FROM clinic_visits
UNION ALL
SELECT 'excuse_letters', COUNT(*) FROM excuse_letters
UNION ALL
SELECT 'holidays', COUNT(*) FROM holidays
UNION ALL
SELECT 'suspensions', COUNT(*) FROM suspensions;

-- ============================================================================
-- Script completed successfully
-- Database is now ready for fresh seeding
-- ============================================================================
