# Debug Log: admin-add-parent-and-child.js Errors

## Date
2026-04-03

## Problem
JavaScript errors in admin-add-parent-and-child.js file causing enrollment issues

## What causes it
1. **Missing birthdate column**: Code uses `birthdate` property but students table doesn't have this column
2. **Wrong column references**: 
   - Uses `student.photo_url` instead of `student.profile_photo_url`
   - Uses `student.id_number` instead of `student.student_id_text`
3. **Schema mismatch**: Code assumes columns that don't exist in the database

## Solution
1. Add birthdate column to students table via SQL
2. Fix JS references to use correct column names:
   - `photo_url` → `profile_photo_url`  
   - `id_number` → `student_id_text`
   - Add birthdate to insert/update operations

## FIXES APPLIED
1. Created SQL file: `database schema/add-birthdate-to-students.sql`
2. Fixed Line 1685: `student.photo_url` → `student.profile_photo_url`
3. Fixed Line 1694: `student.id_number` → `student.student_id_text`
4. Fixed Line 1700: QR code data reference updated to use `student_id_text`
5. Fixed `viewStudentID` function - Added fallback to fetch class info separately when join doesn't work
6. Fixed duplicate variable declarations in `viewStudentID`
