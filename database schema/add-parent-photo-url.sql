-- Add profile_photo_url column to parents table
-- This enables parent photo upload functionality in admin module

ALTER TABLE public.parents 
ADD COLUMN IF NOT EXISTS profile_photo_url text;

-- NOTE: The 'profiles' storage bucket must be created in Supabase Dashboard
-- Go to Storage -> New Bucket -> Name: "profiles", Public: true
-- 
-- Storage buckets are managed by Supabase, not via SQL.
-- The bucket can also be created via Supabase CLI or API if needed.
