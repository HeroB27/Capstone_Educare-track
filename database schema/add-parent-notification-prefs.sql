-- Add notification_preferences column to parents table
-- Required for parent settings page to store notification preferences
-- Run this SQL in your Supabase database

ALTER TABLE public.parents 
ADD COLUMN IF NOT EXISTS notification_preferences jsonb 
DEFAULT '{"entry_exit": true, "clinic": true, "urgent": true, "excuse": true}'::jsonb;

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'parents' AND column_name = 'notification_preferences';
