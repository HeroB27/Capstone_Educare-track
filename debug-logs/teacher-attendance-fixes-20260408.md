# Debug Log - Teacher Attendance XSS and Logic Fixes

Date: 2026-04-08

## Problem
The teacher-homeroom-table.js had several issues:
1. XSS vulnerability - student.full_name used in notifications without escaping
2. YTD absences didn't account for pending updates in the current month
3. DepEd warning only checked YTD >= 15, but didn't check current month absences >= 15

## Solution Applied

### 1. XSS Fix
Added escapeHtml() to all student.full_name in notifications across files:
- teacher-homeroom-table.js
- teacher-subject-attendance-table.js
- teacher-gatekeeper-mode.js
- teacher-core.js
- teacher-subject-attendance.js
- teacher-homeroom.js

### 2. YTD Calculation Fix
Updated loadYtdAbsences() in teacher-homeroom-table.js to account for pending updates:
- Now tracks current month absences separately
- Adjusts count when pending changes from Absent to another status or vice versa

### 3. Warning Threshold Fix
Updated checkAndNotifyHighAbsences() to check both:
- YTD absences >= 15
- Current month absences >= 15

Warning message now shows both YTD and month-specific counts.