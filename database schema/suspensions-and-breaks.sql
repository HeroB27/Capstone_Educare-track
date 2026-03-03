-- ============================================================================
-- SUSPENSIONS AND BREAKS MANAGEMENT
-- ============================================================================
-- This handles:
-- 1. Class suspensions (specific classes or all)
-- 2. Semestral breaks
-- 3. Saturday class enable/disable
-- 4. Special grade-level suspensions (e.g., elementary no school)
-- ============================================================================

-- Create suspensions table
CREATE TABLE IF NOT EXISTS suspensions (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,                    -- e.g., "Christmas Break", "Typhoon Suspension"
    description TEXT,                       -- Additional details
    start_date DATE NOT NULL,               -- Start of suspension/break
    end_date DATE NOT NULL,                 -- End of suspension/break
    is_active BOOLEAN DEFAULT true,         -- Is this suspension currently active?
    
    -- Suspension Type
    suspension_type TEXT NOT NULL,          -- 'suspension' | 'semestral_break' | 'saturday_class' | 'grade_suspension'
    
    -- For grade_suspension: which grade levels are suspended
    -- JSON array: ["Kinder", "Grade 1", "Grade 2"]
    affected_grades JSONB DEFAULT '[]'::jsonb,
    
    -- For saturday_class: is saturday class enabled?
    saturday_enabled BOOLEAN DEFAULT false,
    
    -- Which classes are affected (null = all classes)
    -- JSON array of class IDs
    affected_classes JSONB DEFAULT '[]'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT                       -- Admin ID who created this
);

-- Insert default weekend settings (only if they don't exist)
INSERT INTO settings (setting_key, setting_value) 
VALUES 
    ('weekend_sunday_enabled', 'false'),
    ('weekend_saturday_enabled', 'false'),
    ('weekend_saturday_class_enabled', 'false'),
    ('auto_suspension_check', 'true')
ON CONFLICT (setting_key) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_suspensions_date_range ON suspensions(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_suspensions_active ON suspensions(is_active);
CREATE INDEX IF NOT EXISTS idx_suspensions_type ON suspensions(suspension_type);
