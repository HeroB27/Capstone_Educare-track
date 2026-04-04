-- Add birthdate column to students table for enrollment form
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS birthdate date;
