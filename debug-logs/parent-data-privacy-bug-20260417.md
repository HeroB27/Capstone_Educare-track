# Parent Module Data Privacy Bug

**Date:** 2026-04-17

## Problem
Parents can see announcements and gate tap notifications belonging to OTHER children. This violates data privacy - parents should ONLY see data for their own children.

## Symptoms
- Announcements board shows announcements from all students in the school
- Gate tap notifications include children who are not the parent's own children
- There is no filtering by parent-child relationship in queries

## Analysis

### Database Structure (Expected)
According to `database-schema.txt` and the project's data model:
- `parents` table: stores parent accounts
- `children` (or `students`) table: stores student records with foreign key `parent_id` linking to parents
- `announcements` table: likely has `student_id` or `child_id` foreign key
- `gate_taps` / `attendance` table: likely has `student_id` foreign key

**Expected Query Pattern:**
```sql
SELECT * FROM announcements 
WHERE student_id IN (SELECT id FROM students WHERE parent_id = current_parent_id)
```

### Current Bug Pattern
Queries are likely using:
```sql
SELECT * FROM announcements -- NO WHERE FILTER
```
or
```sql
SELECT * FROM announcements 
WHERE grade_id = X -- filters by grade, not by parent's children
```

## Root Cause Hypothesis

**Primary Cause:** Missing parent-child relationship filtering in database queries.

**Likely Affected Files:**
1. `parent-announcements-board.js` - Fetches announcements without parent filter
2. `parent-notifications.js` - Fetches gate taps/attendance without parent filter
3. `parent-dashboard.js` - May show aggregated data from all children
4. `parent-core.js` - May have helper functions that don't filter by parent

**Why This Happened:**
- Developer may have thought queries were isolated by auth context
- RLS (Row Level Security) was NOT used per project rules; we rely on manual filtering
- Queries were written assuming "parent view" inherently filters to own children
- Missing JOIN conditions or subqueries that link parent -> children -> data

## Fix Applied (2026-04-17)

**Changes made:**

1. **`parent-announcements-board.js`** (line 14)
   - Changed: `.or('target_parents.eq.true, target_students.eq.true')`
   - To: `.eq('target_parents', true)`

2. **`parent-dashboard.js`** (line 237, inside `loadNotificationsPreview`)
   - Changed: `.or('target_parents.eq.true,target_students.eq.true')`
   - To: `.eq('target_parents', true)`

3. **`parent-messages.html`** (line 224, inside `fetchMessages`)
   - Changed: `.or('target_parents.eq.true,target_students.eq.true')`
   - To: `.eq('target_parents', true)`

**Rationale:**
The `announcements` table has boolean targeting columns (`target_parents`, `target_students`, etc.) but no foreign key linking to specific students or grades. Querying with `OR target_students.eq.true` returns every student-targeted announcement system-wide, including those mentioning specific student names, causing privacy violation. Restricting to `target_parents = true` ensures only broadcasts explicitly intended for parents are visible.

**Result:**
Parents now see only announcements targeted to parents. All gate tap and attendance notifications remain correctly filtered by `recipient_id` through the existing notifications system.
