-- Add absence_type column to excuse_letters table
-- This allows parents to specify whole day or half-day absence
-- Updated: 2026-04-13

ALTER TABLE public.excuse_letters 
ADD COLUMN IF NOT EXISTS absence_type text DEFAULT 'whole_day'::text;

-- Add period column for half-day specifics (morning, afternoon, or whole_day)
ALTER TABLE public.excuse_letters 
ADD COLUMN IF NOT EXISTS period text DEFAULT 'whole_day'::text;

COMMENT ON COLUMN public.excuse_letters.absence_type IS 'Type of absence: whole_day, half_day_morning, half_day_afternoon';
COMMENT ON COLUMN public.excuse_letters.period IS 'Period of absence: whole_day, morning, afternoon';
