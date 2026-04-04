-- Add birthdate column to students table for enrollment form
-- This migration adds the birthdate field required by the new streamlined enrollment UI

ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS birthdate date;

-- Note: This column stores the student's date of birth
-- It's used in the enrollment wizard and late enrollee modal
-- Format: YYYY-MM-DD (ISO 8601 date)
