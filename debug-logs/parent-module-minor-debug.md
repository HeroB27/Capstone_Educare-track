# Parent Module Debug Diagnosis

**Date:** 2026-03-13  
**Module:** Parent Module (Minor)

---

## Problem Summary

Three issues reported:
1. Dashboard student dropdown shows "Student1(N/A) (N/A)"
2. My Children page shows "undefined%" for attendance rate
3. Excuse Letters page shows "No Child Linked"

---

## Root Cause Analysis

### Issue 1: Dashboard Student Dropdown (N/A)

**Location:** [`parent-core.js:61-64`](parent/parent-core.js:61)

**Problem:** The student query doesn't include the classes join:
```javascript
const { data: children, error } = await supabase
    .from('students')
    .select('*')  // Missing classes join!
    .eq('parent_id', parentId);
```

**What the code expects:** Lines 206 and 216 reference `child.classes?.grade_level` and `child.classes?.section_name`

**Root Cause:** The code attempts to access `child.classes.grade_level` but the query only selects `*` from students table without joining the classes table. Since there's no join, `child.classes` is `undefined`, causing `(N/A)` to display.

**Database Schema Check:** The `students` table has a `class_id` foreign key (line 215 in database-schema.txt), and the `classes` table has `grade_level` and `section_name` (lines 74-84).

---

### Issue 2: My Children - undefined% Attendance

**Location:** [`parent-children.js:190-198`](parent/parent-children.js:190)

**Problem:** The check `if (error || !logs)` doesn't handle empty arrays:
```javascript
if (error || !logs) {
    return { present: 0, late: 0, absent: 0, percentage: 100 };
}
// logs is [] (empty array) - truthy, so continues to calculate
const schoolDays = getSchoolDaysInMonth(now.getFullYear(), now.getMonth());
const present = logs.filter(...).length;  // 0
const percentage = schoolDays > 0 ? Math.round((present / schoolDays) * 100) : 100;
```

**Additional issue:** The percentage calculation could result in `NaN` in edge cases when school days calculation returns unexpected values.

**Root Cause:** Empty array `[]` is truthy in JavaScript, so the code proceeds to calculate with no logs. The fallback `{ present: 0, late: 0, absent: 0, percentage: 100 }` is never triggered when logs is an empty array.

---

### Issue 3: Excuse Letters - No Child Linked

**Location:** [`parent-excuse-letter-template.js:24,117-127`](parent/parent-excuse-letter-template.js:24)

**Problem:** Race condition between loading children and populating selector:
```javascript
// In parent-excuse-letter-template.js DOMContentLoaded:
populateChildSelector();  // Called immediately

// In parent-core.js DOMContentLoaded:
await loadChildren();     // Async, may not complete first
```

The `populateChildSelector()` function (line 121) checks `allChildren.length === 0`:
```javascript
if (allChildren.length === 0) {
    selectorEl.innerHTML = '<p class="text-gray-500 text-sm">No children linked to your account</p>';
    return;
}
```

**Root Cause:** `allChildren` is empty because `loadChildren()` is still executing (it's async). The DOMContentLoaded fires for both scripts at roughly the same time, but `populateChildSelector()` doesn't wait for `loadChildren()` to complete.

---

## Proposed Solutions

### Fix 1: Add Classes Join to Student Query

**File:** `parent-core.js`  
**Line:** ~61-64

Change:
```javascript
.select('*')
```

To:
```javascript
.select('*, classes(grade_level, section_name)')
```

### Fix 2: Handle Empty Logs Array in Attendance Stats

**File:** `parent-children.js`  
**Line:** ~190

Change:
```javascript
if (error || !logs) {
```

To:
```javascript
if (error || !logs || logs.length === 0) {
```

### Fix 3: Wait for Children to Load Before Populating Selector

**File:** `parent-excuse-letter-template.js`  
**Line:** ~23-24

Change:
```javascript
populateChildSelector();
```

To:
```javascript
// Wait for children to load from parent-core.js
const checkChildren = setInterval(() => {
    if (window.allChildren && window.allChildren.length > 0) {
        clearInterval(checkChildren);
        populateChildSelector();
    }
}, 100);

// Timeout after 5 seconds
setTimeout(() => clearInterval(checkChildren), 5000);
```

OR add event listener for child loaded:
```javascript
document.addEventListener('childrenLoaded', () => {
    populateChildSelector();
});
```

And dispatch event in parent-core.js after loadChildren completes.

---

## Validation Against Schema

The database schema is correct except for one missing column:

### Database Schema Mismatch Found
- **Table:** `parents`
- **Missing Column:** `notification_preferences` (jsonb)
- **Used By:** [`parent-settings.js:16,60`](parent/parent-settings.js:16)

**Fix Applied:**
1. Updated [`database-schema.txt`](database schema/database-schema.txt) to include the column
2. Created [`add-parent-notification-prefs.sql`](database schema/add-parent-notification-prefs.sql) SQL command file

Run this SQL in your Supabase database to add the missing column:
```sql
ALTER TABLE public.parents 
ADD COLUMN IF NOT EXISTS notification_preferences jsonb 
DEFAULT '{"entry_exit": true, "clinic": true, "urgent": true, "excuse": true}'::jsonb;
```
