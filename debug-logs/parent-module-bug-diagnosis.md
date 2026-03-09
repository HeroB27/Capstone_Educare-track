# Parent Module Bug Diagnosis Report

**Date:** 2026-03-09  
**Analyst:** Tech Lead Debug Mode

---

## Bug 1: Missing Children (No children linked to your account)

### Symptoms
- UI shows: "Select Child: No children linked to your account"
- Console error: "Unable to retrieve Child"

### Root Cause Analysis
After analyzing [`parent/parent-children.js`](parent/parent-children.js:18-29) and [`parent/parent-core.js`](parent/parent-core.js:45-53):

**Potential Issues Identified:**

1. **Complex Join Query Failure** - The code uses nested select with joins:
   ```javascript
   .select(`*, classes (grade_level, section_name, strand, teachers (...))`)
   ```
   This can fail if Supabase relationships aren't properly configured.

2. **currentUser.id extraction** - The code assumes `currentUser.id` is properly set. However, in some contexts, the script might be loaded before `currentUser` is initialized.

3. **Silent failure on empty results** - When no children are found, it shows "No children linked" but doesn't log whether it's:
   - A query error
   - No matching records (parent_id mismatch)
   - currentUser.id being undefined

### Most Likely Source
The complex join query in `parent-children.js` line 18-29 may be failing due to:
- Missing foreign key relationships in Supabase
- Or the query returning empty results because `currentUser.id` is not matching the `students.parent_id` column

### Solution
Replace the complex query with a simple direct query as specified:
```javascript
supabase.from('students').select('*').eq('parent_id', parentId)
```

Also ensure proper extraction of parentId from localStorage.

---

## Bug 2: 400 Bad Request (Notifications Fetch)

### Symptoms
- Console error: `GET .../rest/v1/parents?select=notification... 400 (Bad Request)`

### Root Cause Analysis
After analyzing [`parent/parent-notifications.js`](parent/parent-notifications.js:67-74):

The current code DOES query the correct `notifications` table:
```javascript
.from('notifications')
.select('*')
.eq('recipient_id', currentUser.id)
.eq('recipient_role', 'parent')  // Uses 'parent' (singular)
```

However, based on the error message showing `parents` table being queried, there might be:
1. Another code path in a different file that's incorrectly querying the `parents` table
2. Or the `recipient_role` value needs to be `'parents'` (plural) to match the schema convention

### Schema Reference (database-schema.txt)
The `notifications` table has:
- `recipient_id` - BigInt (links to user ID)
- `recipient_role` - Text (should match the table name: 'parents', 'teachers', etc.)

### Most Likely Source
The `recipient_role` should be `'parents'` (plural) to match the table naming convention used in the system (as seen in `general-core.js` line 253 where `'parent'` is used - but this might be inconsistent).

### Solution
Replace the notification fetch with the correct query:
```javascript
supabase.from('notifications').select('*').eq('recipient_id', parentId).eq('recipient_role', 'parents')
```

---

## Summary of Fixes Needed

| Bug | File | Current Issue | Fix |
|-----|------|---------------|-----|
| 1 | parent-children.js | Complex join query + currentUser extraction | Simple select with direct parent_id match |
| 2 | parent-notifications.js | Wrong recipient_role value | Use 'parents' (plural) instead of 'parent' |

---

## Validation Steps

After applying fixes:

1. **Children Bug Fix Validation:**
   - Login as parent with linked children
   - Navigate to children page
   - Verify dropdown shows children (not "No children linked")

2. **Notifications Bug Fix Validation:**
   - Login as parent
   - Navigate to notifications page
   - Verify notifications load without 400 error
   - Check console for successful fetch
