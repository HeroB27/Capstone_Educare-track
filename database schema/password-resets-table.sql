-- Password Resets Table
-- Purpose: Store password reset requests from the login page
-- This connects the frontend password reset flow with the admin dashboard

CREATE TABLE IF NOT EXISTS password_resets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    token VARCHAR(10) NOT NULL,
    new_password VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_password_resets_username ON password_resets(username);
CREATE INDEX IF NOT EXISTS idx_password_resets_status ON password_resets(status);
CREATE INDEX IF NOT EXISTS idx_password_resets_created_at ON password_resets(created_at DESC);
