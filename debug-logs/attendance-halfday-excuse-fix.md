# Attendance Status and Half-Day Excuse Fix

**Date:** 2026-04-13

## Problem
1. Teacher attendance needed to add "Excused Absent" status option
2. Parent excuse letters needed half-day selection (whole day, morning only, afternoon only)
3. When teacher approves excuse letter, attendance should automatically mark as Excused/Excused Absent

## Solution

### 1. New Button Order (Teacher Attendance)
Toggle cycle: **blank → Present → Late → Absent → Excused → Excused Absent → blank**

Updated files:
- `teacher-homeroom.js` - checklist
- `teacher-homeroom-table.js` - table view
- `teacher-subject-attendance.js` - subject checklist
- `teacher-subject-attendance-table.js` - subject table view

Added CSS class `.status-excused-absent` in:
- `teacher-homeroom.html`
- `teacher-subject-attendance.html`

### 2. Database Schema Update
Added columns to `excuse_letters` table:
- `absence_type`: 'whole_day', 'half_day_morning', 'half_day_afternoon'
- `period`: 'whole_day', 'morning', 'afternoon'

SQL command: `debug-logs/add-absence-type-column.sql`

### 3. Parent Excuse Form (Half-Day Selection)
Updated files:
- `parent-excuse-letter-template.html` - Added radio buttons for absence type
- `parent-excuse-letter-template.js` - Added `updateAbsenceType()` function, save logic

### 4. Teacher Excuse Approval (Auto-Mark Attendance)
Updated `teacher-core.js` - `approveExcuseLetter()` function:
- **Whole day**: Marks as "Excused Absent" status
- **Half-day morning**: Sets morning_absent=false (not absent), afternoon as marked
- **Half-day afternoon**: Sets afternoon_absent=false (not absent), morning as marked

### 5. Updated Database Schema
Added `absence_type` and `period` columns to `database-schema.txt`
