-- Fix for User Management - Add missing columns to guards and clinic_staff tables

-- Add contact_number to guards table
ALTER TABLE public.guards ADD COLUMN IF NOT EXISTS contact_number text;

-- Add contact_number to clinic_staff table  
ALTER TABLE public.clinic_staff ADD COLUMN IF NOT EXISTS contact_number text;

-- Add is_active to guards table (for consistency with other user types)
ALTER TABLE public.guards ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Add is_active to clinic_staff table
ALTER TABLE public.clinic_staff ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Verify the columns were added
SELECT 
    'guards' as table_name,
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_name = 'guards' AND column_name IN ('contact_number', 'is_active', 'guard_id_text', 'assigned_gate', 'shift_schedule')

UNION ALL

SELECT 
    'clinic_staff' as table_name,
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_name = 'clinic_staff' AND column_name IN ('contact_number', 'is_active', 'clinic_id_text', 'role_title')

ORDER BY table_name, column_name;
