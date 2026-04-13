# School Year Configuration Plan

## Objective
Implement admin-configurable school year start/end dates with persistence, global access functions, and update all hardcoded references.

## Current Dates (from user)
- School Year Start: August 11
- School Year End: April 28

---

## Comprehensive File Scan Results

### Files with Hardcoded School Year Dates (MUST UPDATE)

| File | Line(s) | Issue |
|------|---------|-------|
| `admin/admin-data-analytics.js` | 4-9 | Constants `SCHOOL_YEAR_START`, `SCHOOL_YEAR_END`, `QUARTERS` |
| `admin/admin-data-analytics.js` | 28, 1541 | Default date inputs |
| `admin/admin-data-analytics.js` | 285-286 | Quarter calculation logic |
| `teacher/teacher-data-analytics.js` | 365-366 | Quarter calculation with hardcoded dates |
| `teacher/teacher-data-analytics.js` | 350 | Month mapping (Aug-Apr) |
| `teacher/teacher-homeroom-table.js` | 51 | Hardcoded `08-01` |
| `teacher/teacher-subject-attendance-table.js` | 20 | Hardcoded `08-01` |
| `admin/admin-class-management.js` | 47 | Hardcoded `08-01` |
| `admin/admin-class-management.js` | 148 | Default `2025-2026` |
| `teacher/teacher-data-analytics.html` | 144, 152 | Hardcoded month options |
| `admin/admin-data-analytics.html` | 125, 133 | Hardcoded month options |

### Files Using schoolYearStart Variable (Dynamic but Fixed to Aug 1)

| File | Line(s) | Issue |
|------|---------|-------|
| `teacher/teacher-homeroom-table.js` | 12, 50-51 | Uses `08-01` for YTD absences |
| `teacher/teacher-subject-attendance-table.js` | 11, 20 | Uses `08-01` for YTD absences |
| `admin/admin-class-management.js` | 22, 46-47 | Uses `08-01` for YTD absences |

### Files with Quarter-Related Logic (Affected)

| File | Line(s) | Issue |
|------|---------|-------|
| `admin/admin-data-analytics.js` | 277-316 | Quarter grouping and labels |
| `teacher/teacher-data-analytics.js` | 355-396 | Quarter grouping and labels |

---

## Implementation Steps

### Step 1: Database - Add School Year Settings

**Use existing `settings` table** (no schema change needed)

Insert default values if not exist:
```sql
INSERT INTO settings (setting_key, setting_value) VALUES 
  ('school_year_start', '2025-08-11'),
  ('school_year_end', '2026-04-28')
ON CONFLICT (setting_key) DO NOTHING;
```

---

### Step 2: Core Helper - Create school-year-core.js

Create: `core/school-year-core.js`

```javascript
// School Year Configuration Helper
// Provides global access to admin-configurable school year dates
// Uses existing 'settings' table for persistence

async function getSchoolYearStart() { ... }  // Returns 'YYYY-MM-DD' or defaults
async function getSchoolYearEnd() { ... }    // Returns 'YYYY-MM-DD' or defaults
async function getQuarters() { ... }        // Returns [{name, start, end}, ...]
async function setSchoolYearDates(startDate, endDate) { ... }
function getDefaultSchoolYearStart() { ... }  // Aug 11 of current year
function getDefaultSchoolYearEnd() { ... }   // Apr 28 of next year
function calculateQuarter(logDate, start, end) { ... } // Returns 'Q1', 'Q2', 'Q3'
```

**Fallback behavior**: 
- If no dates in settings, use defaults (Aug 11 - Apr 28)
- Log warning to console

---

### Step 3: Admin Settings UI - Add School Year Tab

**File**: `admin/admin-settings.html`
- Add new tab: "School Year Configuration"
- Two date pickers: Start Date, End Date
- Save button with loading state

**File**: `admin/admin-settings.js`
- `loadSchoolYearSettings()` - fetch from database
- `saveSchoolYearSettings()` - save to database
- **Validation**:
  - End date must be after start date (block)
  - Start date > 2 years past: show warning but allow
  - Invalid dates: show error

---

### Step 4: Update All Hardcoded References

#### Priority 1 - Core Analytics (admin-data-analytics.js)
- Remove: `const SCHOOL_YEAR_START = '2025-08-01'`
- Remove: `const SCHOOL_YEAR_END = '2026-04-28'`
- Remove: hardcoded `QUARTERS` array
- Update: Quarter calculation to use dynamic quarters
- Update: Default date inputs to use school year settings
- Update: Month dropdown generation

#### Priority 2 - Teacher Analytics (teacher-data-analytics.js)
- Remove: hardcoded quarter date ranges
- Update: Month mapping to be dynamic
- Update: Quarter labels to reflect actual dates

#### Priority 3 - Attendance Tables (teacher-homeroom-table.js, etc.)
- Update: `schoolYearStart` to use `getSchoolYearStart()`
- This affects YTD absence calculations

#### Priority 4 - Class Management (admin-class-management.js)
- Update: Default school_year to use dynamic dates
- Update: YTD absence calculations

#### Priority 5 - HTML Files
- `admin/admin-data-analytics.html` - Dynamic month dropdown
- `teacher/teacher-data-analytics.html` - Dynamic month dropdown

---

### Step 5: Quarter Calculation Logic

The school year spans Aug to Apr (3 quarters):

```javascript
function calculateQuarters(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  const quarterLength = Math.ceil(totalMonths / 3);
  
  // Q1: Start to Start+quarterLength-1
  // Q2: Start+quarterLength to Start+(2*quarterLength)-1  
  // Q3: Remainder
}
```

---

### Step 6: Validation Rules

1. **End date before start date**: Block with error: "End date must be after start date"
2. **Start date > 2 years past**: Show warning: "Warning: Start date is more than 2 years in the past"
3. **Invalid dates**: Show error: "Please enter valid dates"
4. **Success**: Show notification "School year dates saved successfully"

---

## Complete Files to Modify

| File | Change Type | Priority |
|------|-------------|----------|
| `core/school-year-core.js` | NEW - helper functions | Critical |
| `admin/admin-settings.html` | ADD - School Year tab | Critical |
| `admin/admin-settings.js` | ADD - save/load functions | Critical |
| `admin/admin-data-analytics.js` | UPDATE - use dynamic dates | High |
| `admin/admin-data-analytics.html` | UPDATE - dynamic month dropdown | High |
| `teacher/teacher-data-analytics.js` | UPDATE - use dynamic dates | High |
| `teacher/teacher-data-analytics.html` | UPDATE - dynamic month dropdown | High |
| `teacher/teacher-homeroom-table.js` | UPDATE - use school year core | Medium |
| `teacher/teacher-subject-attendance-table.js` | UPDATE - use school year core | Medium |
| `admin/admin-class-management.js` | UPDATE - use school year core | Medium |

---

## API/Usage Instructions for Admin

- **Settings Page**: `admin/admin-settings.html` → "School Year Configuration" tab
- **Saving**: Select dates and click "Save School Year Dates"
- **Viewing**: Dates displayed after saving
- **Impact**: All analytics, attendance tables, and reports will use these dates

---

## Testing Checklist

1. [ ] Admin can set school year dates via Settings page
2. [ ] Dates persist in database after page reload
3. [ ] Analytics correctly calculate quarters based on settings
4. [ ] Month dropdowns show correct range based on school year
5. [ ] YTD absences calculate from correct start date
6. [ ] Validation rules prevent invalid dates
7. [ ] Fallback works when no dates are set (uses Aug 11 - Apr 28)
8. [ ] No breaking changes to existing features
9. [ ] Console warnings appear when using fallback

---

## Dependencies

- `core/general-core.js` - Already loaded in admin pages
- `assets/supabase-client.js` - Already loaded
- Uses existing `settings` table from database schema