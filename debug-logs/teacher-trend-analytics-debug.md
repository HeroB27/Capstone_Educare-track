# Teacher Trend Analytics Debug Log

## Date: 2026-04-13

## Problem
The trend analytics in the teacher module displays incorrect data values.

## Root Cause Analysis

After comparing the teacher module (`teacher-data-analytics.js`) with the admin module (`admin-data-analytics.js`), I identified the following issues:

### Issue 1: Incorrect Percentage Calculation (PRIMARY BUG)

**Teacher version** (`renderTrendChart`, lines 517-559):
```javascript
const totalStudents = studentIdsInHomeroom.length || 1;

// Divides raw counts by total students to get "percentage"
datasets.push({ label: 'Present', data: data.present.map(v => Math.round((v / totalStudents) * 100)), ... });
```

**Admin version** (`updateTrendChart`, lines 938-1000):
```javascript
// Uses raw counts directly - no division
datasets.push({ label: 'Present', data: data.present, ... });
```

The teacher version incorrectly divides attendance counts by the number of students. This is wrong because:
- The data represents total attendance records for the period (e.g., 150 present counts across all days)
- Dividing by number of students (e.g., 30) produces meaningless numbers like 500%
- The admin correctly shows raw counts (absolute values)

### Issue 2: Data Grouping Logic Appears Similar
The quarter/month/week grouping logic in teacher matches admin closely, so that's not the primary issue.

## Solution
Update `renderTrendChart` in teacher module to use raw counts like the admin version, not divide by total students.

## Recommended Fix
Replace the percentage calculation in `renderTrendChart` with raw counts.