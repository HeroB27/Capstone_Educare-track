-- ============================================================================
-- SECURE PASSWORD UPDATE FOR CLINIC STAFF
-- This function securely verifies the old password and updates to a new hashed password.
-- It prevents plain-text passwords from ever being handled by the client-side code.
-- ============================================================================
CREATE OR REPLACE FUNCTION update_clinic_password(
    p_staff_id BIGINT,
    p_current_password TEXT,
    p_new_password TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    current_hash TEXT;
BEGIN
    -- Get the current hashed password from the clinic_staff table.
    SELECT password INTO current_hash FROM public.clinic_staff WHERE id = p_staff_id;

    -- Verify if the provided current password matches the stored hash.
    IF current_hash IS NOT NULL AND crypt(p_current_password, current_hash) = current_hash THEN
        -- If it matches, update the password with a new, securely hashed version.
        UPDATE public.clinic_staff SET password = crypt(p_new_password, gen_salt('bf')) WHERE id = p_staff_id;
        RETURN TRUE;
    END IF;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;