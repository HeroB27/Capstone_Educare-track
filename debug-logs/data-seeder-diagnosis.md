# Data Seeder Diagnosis Report
**Date:** 2026-03-09  
**Analyst:** Debug Mode  
**File:** [`data-seeder.js`](data-seeder.js)

---

## Summary of Reported Bugs (User's List)

### ✅ Bug #1: Non-Existent Column "source" (FATAL)
**Status:** ALREADY FIXED  
**Location:** Steps 12 & 13 (attendance logs)  
**Finding:** The `source: 'guard'` line has already been removed from both [`seedAttendanceLogs()`](data-seeder.js:720) and [`seedTodayAttendance()`](data-seeder.js:791). The current code only includes:
- `student_id`
- `log_date`
- `time_in`
- `status`
- `remarks`

These match the schema columns exactly.

---

### ✅ Bug #2: Clinic Status Mismatch
**Status:** ALREADY FIXED  
**Location:** [`seedClinicVisits()`](data-seeder.js:615)  
**Finding:** The status is already set to `'Completed'` (lines 615 and 624), matching the normalized values in your system.

---

### ✅ Bug #3: Missing Admin IDs
**Status:** ALREADY FIXED  
**Location:** [`seedAdmins()`](data-seeder.js:168)  
**Finding:** The `admin_id_text` is already being generated and included:
```javascript
admin_id_text: generateID('ADM', '2026', admin1Phone, '')
```

---

## Additional Issues Found (New)

### ⚠️ Issue #4: Guards Missing Optional Fields
**Location:** [`seedGuards()`](data-seeder.js:196)  
**Schema Requirement:** The [`guards`](database%20schema/database-schema.txt:55) table has:
- `contact_number` - required in some views
- `email` - for notifications
- `is_active` - boolean DEFAULT true

**Current Code:** Only inserts:
- `username`, `password`, `full_name`, `assigned_gate`, `shift_schedule`, `guard_id_text`

**Impact:** LOW - These fields have defaults or are nullable, but may cause issues in UI components that expect them.

---

### ⚠️ Issue #5: Classes Missing room_number
**Location:** [`seedClasses()`](data-seeder.js:304)  
**Schema Requirement:** The [`classes`](database%20schema/database-schema.txt:119) table has:
- `room_number` - text field

**Current Code:** Inserts `grade_level`, `section_name`, `strand`, `adviser_id`, `school_year` but NOT `room_number`.

**Impact:** LOW - Nullable field, but ID card generation or room assignment features may need it.

---

### ⚠️ Issue #6: Clinic Visits Missing Optional Fields
**Location:** [`seedClinicVisits()`](data-seeder.js:607)  
**Schema Requirement:** The [`clinic_visits`](database%20schema/database-schema.txt:252) table has:
- `parent_notified` - boolean DEFAULT false
- `teacher_approval` - boolean
- `teacher_remarks` - text

**Current Code:** Only inserts basic fields, not these workflow-related fields.

**Impact:** MEDIUM - Teacher approval workflow may fail if these fields are expected but null.

---

## Verdict

**The 3 bugs you reported have already been patched.** The seeder should now run without crashing at Step 12.

The 3 additional issues I found are **low severity** because all missing fields have defaults or are nullable. However, for data completeness, you may want to add them.

Would you like me to apply patches for Issues #4-6 for better data completeness?
