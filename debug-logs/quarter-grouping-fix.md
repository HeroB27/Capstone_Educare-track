# Quarter Grouping Fix - 2026-04-13

## Problem
The quarter grouping in both admin and teacher analytics was producing inaccurate data because:
1. Hardcoded quarter keys (`'Q1'`, `'Q2'`, `'Q3'`) didn't match the actual quarter names returned by `calculateQuarter()` (e.g., `'Quarter 1'`, `'Quarter 2'`, etc.). This caused all logs to be ignored in quarter view.
2. The quarter view always showed three fixed quarters even if the selected date range doesn't cover them, causing inconsistency with month view.

## Root Cause
- The `quarterGroups` object was initialized with keys `'Q1'`, `'Q2'`, `'Q3'`
- The `calculateQuarter()` function from `school-year-core.js` returns quarter names like `'Quarter 1'`, `'Quarter 2'`, etc.
- Since the keys didn't match, the conditional checks like `if (quarterGroups[quarter])` always failed, and no attendance data was counted

## Solution
Applied dynamic quarter grouping to both files:

### admin-data-analytics.js (lines 300-356)
- Replaced hardcoded `quarterGroups` with dynamic accumulator object created from `dynamicQuarters` array
- For each log, use `calculateQuarter()` to determine quarter and increment appropriate accumulator
- Filter quarters to only those that intersect the selected date range (`quartersInRange`)
- Build labels and data arrays from `quartersInRange` in quarter order

### teacher-data-analytics.js (lines 390-446)
- Same fix applied to match admin logic

## Changes Made
1. Dynamic accumulator initialization:
   ```javascript
   const quarterGroups = {};
   dynamicQuarters?.forEach(q => {
       quarterGroups[q.name] = { Present: 0, Late: 0, Absent: 0, Excused: 0, HalfDay: 0 };
   });
   ```

2. Filter quarters intersecting date range:
   ```javascript
   const quartersInRange = dynamicQuarters?.filter(q => {
       const quarterStart = new Date(q.start);
       const quarterEnd = new Date(q.end);
       const rangeStart = new Date(dateStart);
       const rangeEnd = new Date(dateEnd);
       return (quarterStart <= rangeEnd && quarterEnd >= rangeStart);
   }) || [];
   ```

3. Build labels and data arrays from filtered quarters:
   ```javascript
   const labels = quartersInRange.map(q => ...);
   const present = quartersInRange.map(q => quarterGroups[q.name]?.Present || 0);
   // etc.
   ```

## Verification
- Quarter labels now match actual quarter names from `dynamicQuarters`
- Only quarters overlapping the selected date range appear in the chart
- Counting logic is now identical to month grouping, ensuring consistency