# Debug Log: Homeroom & Subject Table - Full Status Cycle Support

**Date:** 2026-04-13

## Problem
When teacher clicks on attendance cells in both Homeroom and Subject tables:
- Only toggled between Present (green) and Absent (red)
- Did not support Late (LTE) or Excused (EXC) statuses
- Teachers needed all 4 options to properly track attendance

Also: Counters showed wrong values and attendance rate showed 200%.

## Root Cause
- Counting logic treated each AM and PM as separate units (2 per day)
- But totalSchoolDays only counted days (not periods)
- Formula: (present=20) / (days=10) * 100 = 200%

## Solution

### Fix 1: Counting by DAY not by period
Changed logic to count per DAY (not per period):
- Both AM & PM present = 1 Present (for the day)
- Both ABS = 1 Absent (for the day)  
- One ABS + one PR = 0.5 Present (halfday)
- Both LTE = 1 Late
- One LTE + one PR = 0.5 Late (half day)

### Fix 2: Full status cycling per period
Same as before - added click to cycle: PR -> LTE -> ABS -> EXC -> PR

### Fix 3: Subject Table - Shorter display codes
Updated display to show matching short codes

## Root Cause
- Homeroom table only used boolean absent flags (true/false)
- Counter logic used old `status` field regardless of period flags
- Subject table already had full cycle but showed long text ("Present", "Late", etc.)

## Solution

### Fix 1: Homeroom Table - Full status cycling per period
Added click handler to cycle through statuses:
- PR (Present) → LTE (Late) → ABS (Absent) → EXC (Excused) → PR

New function:
```javascript
function getNextPeriodStatus(current) {
    const statusOrder = ['PR', 'LTE', 'ABS', 'EXC'];
    let idx = statusOrder.indexOf(current);
    if (idx === -1) idx = 0;
    return statusOrder[(idx + 1) % statusOrder.length];
}
```

### Fix 2: Visual colors for each status
- PR = bg-green-500 (green)
- LTE = bg-orange-500 (orange)  
- ABS = bg-red-500 (red)
- EXC = bg-blue-500 (blue)

### Fix 3: Counter logic fix
Updated counting to use new period status fields:
- Previously counted as absent if `status === 'Absent'` even when both periods were present
- Now uses period-specific status (morning_status/afternoon_status) with precedence over old status field

### Fix 4: Subject Table - Shorter display codes
Updated display to show matching short codes:
- "Present" → "PR"
- "Late" → "LTE"
- "Absent" → "ABS"
- "Excused/Excused Absent" → "EXC"

### Fix 5: CSV Export - Updated legend
Added EXC to the legend:
| CODE | MEANING |
|------|---------|
| PR | Present |
| ABS | Absent (excused and not excused) |
| LTE | Late |
| EXC | Excused |
| W/E | Weekend |
| SUSP | Class suspended (no classes) |
| HOL | Holiday |
| -- | Future date / Not recorded |

## Files Modified
- `teacher/teacher-homeroom-table.js` - Added getNextPeriodStatus(), updated click handler, display colors, counting logic, CSV export
- `teacher/teacher-subject-attendance-table.js` - Updated display codes

## How to Use
Click the attendance cell to cycle through:
1. **PR** (green) - Present
2. **LTE** (orange) - Late
3. **ABS** (red) - Absent
4. **EXC** (blue) - Excused
5. Back to **PR**