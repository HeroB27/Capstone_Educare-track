# Recursive Function Fix - Stack Overflow Prevention

**Date:** 2026-04-08

## Problem
The teacher-gatekeeper-mode.js and guard-core.js files had local `getLateThreshold` and `getDismissalTime` functions that were calling themselves recursively through `window.getLateThreshold` and `window.getDismissalTime`, causing stack overflow errors.

### Files Affected
1. `teacher/teacher-gatekeeper-mode.js` (lines 564-582)
2. `guard/guard-core.js` (lines 98-106)

## Cause
The local functions were designed to call the global `window.getLateThreshold` and `window.getDismissalTime` as fallbacks, but they had the same names as those global functions. This created an infinite recursion when called.

Example of the problematic pattern:
```javascript
async function getLateThreshold(gradeLevel) {
    if (typeof window.getLateThreshold === 'function') {
        return await window.getLateThreshold(gradeLevel);  // Recursive call!
    }
    return '08:00';
}
```

## Solution
1. **Removed the recursive local functions** from both files
2. **Added non-recursive fallback functions** at the top of each file (after global variables) that:
   - Check if `window.getLateThreshold` / `window.getDismissalTime` already exists
   - Only define fallbacks if they don't exist
   - Return simple default values without calling themselves

### Changes Made

#### teacher/teacher-gatekeeper-mode.js
- Added fallbacks after line 22 (after global variables)
- Removed local `getLateThreshold` function (old lines 564-572)
- Removed local `getDismissalTime` function (old lines 574-582)

#### guard/guard-core.js
- Added fallbacks after line 26 (after audioCtx initialization)
- Removed local `getLateThreshold` function (old lines 98-101)
- Removed local `getDismissalTime` function (old lines 103-106)

## Verification
- general-core.js properly exposes `getLateThreshold` and `getDismissalTime` to window (lines 684-685)
- Both files use `await getLateThreshold()` and `await getDismissalTime()` correctly in handleAttendanceScan
- The fallbacks will only activate if general-core.js fails to load

## Result
The scanner should now work without stack overflow errors. If general-core.js loads successfully, its global functions will be used. If not, the fallback functions will provide default values (08:00 for late threshold, 15:00 for dismissal time).