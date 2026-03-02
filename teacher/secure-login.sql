-- ============================================================================
-- SECURE LOGIN RPC FUNCTION
-- This function securely verifies a user's password against the stored hash.
-- It checks all user tables and returns the user's data if credentials are valid.
-- ============================================================================
CREATE OR REPLACE FUNCTION verify_user_password(p_username TEXT, p_password TEXT)
RETURNS json AS $$
DECLARE
    user_record RECORD;
    user_role TEXT;
BEGIN
    -- Check admins table
    SELECT *, 'admins' as role INTO user_record FROM public.admins WHERE username = p_username AND password = crypt(p_password, password);
    IF FOUND THEN RETURN row_to_json(user_record); END IF;

    -- Check teachers table
    SELECT *, 'teachers' as role INTO user_record FROM public.teachers WHERE username = p_username AND password = crypt(p_password, password);
    IF FOUND THEN RETURN row_to_json(user_record); END IF;

    -- Check parents table
    SELECT *, 'parents' as role INTO user_record FROM public.parents WHERE username = p_username AND password = crypt(p_password, password);
    IF FOUND THEN RETURN row_to_json(user_record); END IF;

    -- Check guards table
    SELECT *, 'guards' as role INTO user_record FROM public.guards WHERE username = p_username AND password = crypt(p_password, password);
    IF FOUND THEN RETURN row_to_json(user_record); END IF;

    -- Check clinic_staff table
    SELECT *, 'clinic_staff' as role INTO user_record FROM public.clinic_staff WHERE username = p_username AND password = crypt(p_password, password);
    IF FOUND THEN RETURN row_to_json(user_record); END IF;

    -- If no user is found
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- NOTE: For this to work, you must first hash existing passwords or new passwords upon registration.
-- Example for new user: INSERT INTO public.teachers (username, password) VALUES ('teacher1', crypt('new_password', gen_salt('bf')));