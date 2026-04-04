# Debug Log: deleteHoliday is not defined (and range deletion)

**Date:** 2026-03-26

## Problem
`admin-calendar.js:541 Uncaught ReferenceError: deleteHoliday is not defined`

## Root Cause
The file had two related functions:
- `deleteHolidayGroup(description)` - for grouped deletion by description
- Missing: `deleteHoliday(date)` - for single date deletion

The code at line 541 was trying to attach `window.deleteHoliday = deleteHoliday`, but the function was never defined. Only `deleteHolidayGroup` existed.

## Solution
Added the missing `deleteHoliday(date)` function that deletes a specific holiday by date:

**Updated to also support deleting holiday ranges:**
When you delete any single date within a holiday range (e.g., April 30 to June 1), the function now:
1. Looks up the holiday's description
2. Deletes ALL holidays with that same description (the entire range)

```javascript
// 9. Delete Holiday (Single date - deletes entire range with same description)
async function deleteHoliday(date) {
    try {
        // Get the holiday to find its description
        const { data: holiday, error: fetchError } = await supabase
            .from('holidays')
            .select('description')
            .eq('date', date)
            .single();
        
        if (fetchError) throw fetchError;
        if (!holiday) {
            showNotification("Holiday not found", "error");
            return;
        }
        
        // Delete all holidays with the same description (the entire range)
        const { error } = await supabase
            .from('holidays')
            .delete()
            .eq('description', holiday.description);
            
        if (error) throw error;
        showNotification("Holiday range deleted successfully!", "success");
        loadHolidays();
        loadStats();
    } catch (err) {
        showNotification("Error deleting: " + err.message, "error");
    }
}
```

The function is now properly attached to window at line 554.