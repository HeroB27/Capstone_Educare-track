# Attendance Checklist Button Order Fix

**Date:** 2026-04-13

## Problem
The attendance toggle buttons in the teacher's attendance checklist and table views were cycling in the wrong order. The user wanted:
- Default: blank (no status)
- 1st press: Present (On Time)
- 2nd tap: Late
- 3rd tap: Absent
- 4th tap: Excused
- 5th tap: back to blank

## Root Cause
The `getNextStatus()` function in all attendance files started with `'On Time'` instead of `''` (blank), causing the wrong initial state.

## Solution
Updated the `getNextStatus()` function in all 4 teacher attendance files:

1. **teacher-subject-attendance.js** (line ~106)
2. **teacher-subject-attendance-table.js** (line ~137)
3. **teacher-homeroom.js** (line ~117)
4. **teacher-homeroom-table.js** (line ~340)

Changed from:
```javascript
const order = ['On Time', 'Late', 'Absent', 'Excused'];
let idx = order.indexOf(current); 
if (idx === -1) idx = 0; 
return order[(idx + 1) % order.length]; 
```

To:
```javascript
// Cycle: blank -> Present (On Time) -> Late -> Absent -> Excused -> blank
const order = ['', 'On Time', 'Late', 'Absent', 'Excused']; 
let idx = order.indexOf(current); 
if (idx === -1) idx = 0; // Default to start (blank)
return order[(idx + 1) % order.length]; 
```

Also fixed default status in table views from `'Absent'` to `''` (blank) when no record exists.