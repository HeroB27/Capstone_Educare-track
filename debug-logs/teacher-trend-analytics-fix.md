# Teacher Trend Analytics Fix Log

**Date:** 2026-04-13

## Findings

### Admin Attendance Settings

Checked `admin-attendance-settings.html` - does NOT have school year start/end dates.

**Settings available:**
- Gate scanning thresholds (AM/PM times)
- School start/end time
- Weekend attendance options
- Notification settings
- Disciplinary rules

**Missing:** Academic year start/end date configuration for analytics.

## Updated Trend Analytics

Simplified to 3 modes:

1. **Year** - Shows all data in selected date range (aggregated)
2. **Quarter** - School quarters: Aug-Oct (Q1), Nov-Jan (Q2), Feb-Apr (Q3)
3. **Month** - Weekly breakdown within each month (e.g., "Jan W1", "Jan W2")

### Changes Made

- **Percentage denominator**: `(schoolDays × totalStudents)` - returns to 0-100%
- **School quarters**: Uses actual calendar months for Aug-Apr school year
- **Monthly view**: Shows week-by-week breakdown per month
- **No auto date changes**: Switching grouping preserves user date selection
- **ISO week numbers**: Handles year boundaries correctly

### Button IDs Changed

- `btnYear` (was `btnWeek`) - Whole year mode
- `btnQuarter` - School quarters (Aug-Apr)
- `btnMonth` - Monthly with weekly breakdown