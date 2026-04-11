# Debug Log: Seeder Bug Fix - Student ID Mismatch

**Date:** 2026-04-08

## Problem
In `seedStudents()`, the code builds a local array `students` with temporary ID values (sequentially generated numbers). After inserting this array into Supabase, it does NOT update the local array with the real database IDs returned by Supabase.

The buggy line was:
```javascript
seededData.students = students;  // students = local array, not the DB result
```

Later, `seedAttendanceAndExcuses()` loops over `seededData.students` and uses `student.id` – which were fake IDs that don't exist in the database. The attendance logs were inserted with those fake IDs, creating orphaned records.

## Cause
The `.insert()` call was not using `.select()` to retrieve the inserted rows with their actual database IDs. Even if it did, the result was being ignored in favor of the local `students` array.

## Solution
After all chunks are inserted, re-fetch all students from the database:

```javascript
const { data: actualStudents, error: fetchError } = await supabase.from('students').select('*');
if (fetchError) throw fetchError;
seededData.students = actualStudents;
```

This ensures `seededData.students` contains the actual database records with real IDs.

## Files Modified
- `data-seeder.js` - Fixed `seedStudents()` function at lines 327-335

## Next Steps
To fix existing orphaned data, run the TRUNCATE command and re-run the seeder:

```sql
TRUNCATE TABLE attendance_logs, students, subject_loads, classes, 
parents, teachers, guards, admins, clinic_staff, announcements, 
clinic_visits, excuse_letters, holidays 
RESTART IDENTITY CASCADE;
```