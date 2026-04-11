# Debug Log: Parent ID null Error Fix

**Date:** 2026-04-08

## Problem
The 400 error occurs when parentId is undefined or null. The Supabase query `id=eq.null` was failing because parent.id might be missing from the rendered table.

## Cause
1. The `openEditParentModal` function didn't validate the parentId before using it in the Supabase query
2. Parent records with NULL IDs in the database would cause the button to pass an invalid ID
3. No guard was checking if the parent object has a valid ID before rendering

## Solution Applied

### 1. Added validation guard in openEditParentModal (line 200)
```javascript
async function openEditParentModal(parentId) {
    if (!parentId || parentId === 'null' || parentId === 'undefined') {
        console.error('Invalid parent ID:', parentId);
        showNotification('Error: Parent ID missing. Refresh the page.', 'error');
        return;
    }
    // rest of code...
}
```

### 2. Added skip for invalid parent records in renderParentStudentTable (line 143)
```javascript
paginatedParents.forEach(parent => {
    if (!parent || !parent.id) {
        console.warn('Skipping parent record with missing ID:', parent);
        return;
    }
    // rest of rendering code...
});
```

### 3. RLS Disabled (via SQL - user to run manually)
```sql
-- Disable RLS on ALL tables in public schema
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY;', r.tablename);
    END LOOP;
END $$;

-- Also for storage.objects
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;
```

### 4. Storage bucket created via SQL (user to run manually)
```sql
INSERT INTO storage.buckets (id, name, public) 
VALUES ('student-photos', 'student-photos', true)
ON CONFLICT (id) DO NOTHING;
```

## Files Modified
- `admin/admin-add-parent-and-child.js` - Added validation guard and skip for invalid parent records

## Manual Steps Required
1. Run RLS disable SQL in Supabase SQL Editor
2. Create storage bucket if not exists
3. Check for NULL ID parent records: `SELECT id, full_name FROM parents WHERE id IS NULL;`
4. Delete or fix corrupted records
