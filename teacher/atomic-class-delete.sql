-- This function ensures that deleting a class and its associated subjects
-- happens in a single, all-or-nothing database transaction.
CREATE OR REPLACE FUNCTION delete_class_and_subjects(class_id_to_delete INT)
RETURNS VOID AS $$
BEGIN
  -- First, delete all subject loads associated with the class.
  DELETE FROM public.subject_loads WHERE class_id = class_id_to_delete;
  
  -- Then, delete the class itself. This only happens if the first delete succeeds.
  DELETE FROM public.classes WHERE id = class_id_to_delete;
END;
$$ LANGUAGE plpgsql;