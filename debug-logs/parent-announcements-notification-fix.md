# Parent Module - Announcements Not Loading in Notifications

**Date:** 2026-03-13  
**Module:** Parent Notifications  
**Issue:** Announcements are not appearing in the parent notifications list

---

## Problem Analysis

After analyzing the codebase, I've identified the root cause:

### Architecture Overview:
1. **Admin creates announcements** → Saved to `announcements` table with `target_parents` flag
2. **Parent Announcements Board** → Correctly fetches from `announcements` table with `.eq('target_parents', true)` ✅ WORKS
3. **Parent Notifications** → Only queries `notifications` table ❌ NOT WORKING

### Root Cause:
The [`parent-notifications.js`](parent/parent-notifications.js) only fetches from the `notifications` table (lines 130-137):

```javascript
const { data: notifications, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', parentId)
    .eq('recipient_role', 'parents')
    ...
```

But announcements are stored in the **`announcements`** table, not the `notifications` table. There's no code that:
- Fetches announcements where `target_parents = true`
- OR creates notification entries when announcements are created

---

## Possible Solutions

### Option A: Fetch Announcements in Notifications Page (RECOMMENDED)
Modify [`loadNotifications()`](parent/parent-notifications.js:112) to also fetch announcements from the `announcements` table and merge them with notifications.

**Pros:** Quick fix, minimal code changes  
**Cons:** Duplicates data if user visits both pages

### Option B: Create Notifications on Announcement Creation  
Modify [`admin-announcements.js`](admin/admin-announcements.js:339) to insert notification entries when an announcement is saved with `target_parents = true`.

**Pros:** Proper notification architecture  
**Cons:** More complex, requires handling parent IDs dynamically

---

## Diagnosis Confirmation

**Most likely source:** The parent notifications page (`parent-notifications.js`) doesn't query the `announcements` table at all.

**Recommended fix:** Option A - Add announcement fetching to the notifications page
