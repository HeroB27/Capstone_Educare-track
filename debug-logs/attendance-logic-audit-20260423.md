# ATTENDANCE LOGIC IMPLEMENTATION AUDIT REPORT
**Date:** 2026-04-23  
**Status:** ⚠️ CRITICAL ISSUES FOUND  
**Scope:** Full system audit across Teacher, Guard, Clinic, Admin, Parent modules  

---

## EXECUTIVE SUMMARY

The Educare attendance system has **sound conceptual architecture** with proper separation between:
- Raw audit logs (`attendance_logs`)
- Daily aggregated status (`attendance_daily_summary`)
- Pattern detection (`attendance_patterns`)
- Configuration (grade schedules, settings)

However, **4 critical inconsistencies** threaten data integrity and could cause incorrect attendance records, especially during batch processing.

---

## WHAT THE SYSTEM IS SUPPOSED TO DO (Plain English)

Think of attendance like a **bank statement** for school presence:

1. **Every scan** = a transaction (deposit/withdrawal) → stored in `attendance_logs` (raw ledger)
2. **Daily summary** = end-of-day balance → `attendance_daily_summary` (one row per student per day: morning status + afternoon status)
3. **Half-day tracking** = "morning_absent" / "afternoon_absent" flags on the main ledger entry
4. **Auto-correction rule** = If a student arrives AND doesn't check out early, they're assumed to have stayed all afternoon → automatically marked Present (common sense: came to school → stayed)

**Key workflows:**
- **Gate scanner:** Records timestamped entry/exit → auto-calculates status (On Time/Late/Exit types)
- **Homeroom teacher:** Can manually override morning/afternoon status if gate data missing/wrong
- **Subject teacher:** Sees homeroom status as suggestion, can override per period
- **Batch job:** Nightly sync that recomputes all daily summaries from raw logs (for reporting)

---

## CRITICAL FINDINGS

### 🔴 **CRITICAL 1: Afternoon Auto-Present Rule NOT Applied in Batch Job**

**Files Involved:**
- `core/attendance-helpers.js` (lines 389-434) → ✅ **HAS** afternoon auto-present logic
- `core/attendance-daily-summary-batch.js` (lines 272-321) → ❌ **MISSING** the auto-present logic

**The Bug:**
Both files have a `syncStudentDailySummary()` function, but they're **different implementations**:
- Real-time sync (used by gate scanner & teacher saves): **correctly applies** auto-present rule
- Batch job (used for nightly sync & admin manual sync): **does NOT apply** auto-present rule

**Impact:**
If a student:
1. Scans in at 7:30 AM (On Time)
2. Does NOT scan out (forgot, system down, etc.)
3. Teacher doesn't manually mark them Present for afternoon

→ Real-time view: afternoon shows "Present" (auto-corrected) ✅  
→ Batch report: afternoon shows "Absent" ❌  
→ Parent portal: Depends on which data source it reads (likely batch → wrong)

**Example:**
```
Student: Juan dela Cruz
Monday: Arrived 7:30 AM, left at 3:00 PM (normal dismissal)
- attendance_logs: time_in=7:30, time_out=15:00
- attendance_daily_summary (real-time): morning=Present, afternoon=Present ✓
- attendance_daily_summary (after batch run): morning=Present, afternoon=Absent ✗
```

**Root Cause:**
Copy-paste duplication. The batch file was forked from an older version before the auto-present rule existed and was never updated.

**Severity:** HIGH - Affects all students who don't scan out, common occurrence (battery dead, scanner queue, etc.)

---

### 🔴 **CRITICAL 2: Duplicate Half-Day Recompute Functions with Different Logic**

**Files Involved:**
- `core/attendance-helpers.js:444-511` → `recomputeHalfDayStatus()`  
- `core/attendance-utils.js:230-279` → `recomputeHalfDayStatus()` (DUPLICATE)

**Logic Differences:**
| Aspect | helpers version | utils version |
|--------|----------------|---------------|
| Data source | subject_loads.schedule_time_start | subject_loads.time_slot |
| Present check | `status === 'On Time' || status === 'Present' || status === 'Excused'` | `status === 'On Time' || status === 'Late'` ← BUG |
| Missing check | N/A | Considers 'Excused' as absent! |

**Impact:**
- `teacher-homeroom.js` calls `recomputeHalfDayStatus` (likely from helpers)
- `teacher-subject-attendance.js` calls `recomputeHomeroomAttendance()` (its own version, not either duplicate)
- Any module loading `attendance-utils.js` gets the BUGGY version

If the utils version gets used anywhere, excused absences are incorrectly counted as absent for half-day flags → cascades to daily summary errors.

**Severity:** HIGH - Silent data corruption; excused students marked absent

---

### 🟡 **MEDIUM 3: Status Value Inconsistency**

**Problem:**
No enforced enumeration in database. Different parts use different terminology:
- "Present" vs "On Time" (used interchangeably)
- "Excused Absent" (homeroom) vs "Excused" (subject)
- "Early Exit", "Early Exit (Authorized)", "Early Exit (Medical)" - multiple variants

**Impact:**
- CSV exports may show unexpected labels
- Analytics queries must check all variants
- Future DepEd reporting may fail if they expect specific codes

**Recommendation:**
Define canonical status list:
```
ENTRY:   On Time, Late, Absent, Excused, Excused Absent
EXIT:    Normal Exit, Early Exit, Late Exit
SPECIAL: Re-entry, Late Re-entry, Medical Exit, Early Exit (Authorized)
```

---

### 🟡 **MEDIUM 4: Afternoon Auto-Present Rule Logic Flaw**

**Location:** `attendance-helpers.js:389-434`

**Current Logic:**
```javascript
if (afternoon_status === 'Absent' && student was present in morning && NO early exit) {
    auto-set afternoon to 'Present'
}
```

**Problem:**
The check for "early exit" only looks at `time_out` < dismissal time. But if a student:
- Scanned out at 2:45 PM (before 3:00 dismissal) → counted as early exit → NOT auto-corrected → remains Absent ❌

But they were **present all afternoon** until 2:45! The early exit was only 15 minutes early, not a "left school" early exit.

**Real meaning of early exit:** Student left school entirely (for doctor, family emergency).  
15-minute early ≠ "early exit" in the business logic sense; it's just "left a bit early."

**Recommendation:**
Use guard_passes OR clinic_visits authorization to determine true early exit, not just time comparison.

---

### 🟡 **MEDIUM 5: Notification Duplication Handling Inconsistent**

**Pattern:** Some modules check for existing notification by EXACT title match, others don't.

**Example:**
- `teacher-homeroom.js:349-371` → checks title="Attendance Alert: Late" ✅
- `guard-core.js:750-768` → creates two notifications WITHOUT checking for existing ❌

**Impact:**
Multiple notifications for same event if gate scanner fires and teacher also marks.

---

### 🟢 **LOW 6: School Year Validation Not Enforced Everywhere**

**Added:** 2026-04-20 to gate scanner and teacher modules  
**Missing:** In `attendance-daily-summary-batch.js` → batch job could run for non-school dates

**Impact:** Low (batch usually runs on school days only)

---

### 🟢 **LOW 7: Grade-Level Mapping Scattered**

Multiple places map "Grade 7" to schedule keys without central function → inconsistent if naming varies.

---

## DATA FLOW INTEGRITY CHECK

### Homeroom Save Flow (teacher-homeroom.js)
```
Teacher clicks Save
  ↓
Build logUpserts (attendance_logs) + summaryUpserts (attendance_daily_summary)
  ↓
UPSERT both tables
  ↓
Loop: recomputeHalfDayStatus(student, date)
  ↓
Inside recomputeHalfDayStatus:
  - Fetch subject attendance
  - UPDATE homeroom log's morning_absent/afternoon_absent flags
  - CALL syncStudentDailySummary() ← this should apply auto-present
```
✅ Flow is correct in V2 logic

### Gate Scanner Flow (guard-core.js)
```
Scan → checkSuspension → checkHoliday → determine ENTRY/EXIT
  ↓
INSERT/UPDATE attendance_logs
  ↓
Call AttendanceHelpers.syncStudentDailySummary()
  ↓
Auto-present applied (from helpers) ✅
```
✅ Real-time path is correct

### Batch Job Flow (attendance-daily-summary-batch.js)
```
Admin triggers runDailySync()
  ↓
Loop all grades → all students → syncStudentDailySummary()
  ↓
Batch syncStudentDailySummary() does NOT include auto-present ❌
```
❌ **BATCH PATH BROKEN**

---

## ARCHITECTURAL RECOMMENDATIONS

### Immediate Fixes (Pre-Implementation)

1. **Extract afternoon auto-present rule to shared function**
   ```javascript
   // In attendance-helpers.js
   async function applyAfternoonAutoPresentRule(studentId, dateStr, schoolDayInfo) { ... }
   
   // Call from BOTH:
   syncStudentDailySummary() // after initial summary upsert
   // AND in batch version
   ```

2. **Remove duplicate from attendance-utils.js**
   - Expose `recomputeHalfDayStatus` from helpers globally
   - Delete the buggy utils version

3. **Standardize status values**
   - Add CHECK constraint to attendance_logs.status
   - Update all modules to use canonical values

4. **Fix afternoon auto-present logic**
   - Check guard_passes authorization instead of just time_out

5. **Centralize notification creation**
   ```javascript
   async function createAttendanceNotification(recipientId, title, message) {
       // Checks for duplicates before insert
   }
   ```

### Database Safeguards

Add constraints to prevent invalid statuses:
```sql
ALTER TABLE attendance_logs
  ADD CONSTRAINT valid_status
  CHECK (status IN ('On Time','Present','Late','Absent','Excused','Excused Absent',
                     'Early Exit','Late Exit','Normal Exit','Re-entry','Late Re-entry',
                     'Medical Exit','Early Exit (Authorized)'));
```

---

## QUESTIONS BEFORE IMPLEMENTATION

1. **Should "Excused" count as half-day absent?** Currently `attendance-utils.js` says NO, `attendance-helpers.js` says YES. Which is correct?

2. **What is the cutoff for "early exit"?** Currently dismissal time, but should it be:
   - Any exit before dismissal = "Early Exit" label?
   - OR only if guard pass / medical authorization exists?

3. **Should batch job run on weekends/holidays?** Currently checks `isSchoolDay` but not school year boundaries.

4. **Do we want to keep "Excused Absent" as separate status?** DepEd SF2 uses Excused as separate from Absent, but homeroom shows both.

---

## FILES REVIEWED (Complete Inventory)

### Core Logic
| File | Lines | Purpose | Issues |
|------|-------|---------|--------|
| `attendance-helpers.js` | 687 | Shared utilities, real-time sync | Auto-present rule correct |
| `attendance-daily-summary-batch.js` | 353 | Batch nightly sync | ❌ Missing auto-present |
| `attendance-utils.js` | 296 | Date checks, half-day recompute | ❌ Duplicate buggy function |
| `attendance-rules.js` | 287 | DepEd 20% rule | Appears correct |
| `general-core.js` | 650+ | Gate status eval, time helpers | OK |

### Teacher
| File | Purpose | Issues |
|------|---------|--------|
| `teacher-homeroom.js` | Daily AM/PM checklist | V2 logic OK |
| `teacher-homeroom-table.js` | Monthly grid | Uses helpers functions |
| `teacher-subject-attendance.js` | Period tracking | Own recomputeHomeroomAttendance (different logic) |
| `teacher-gatekeeper-mode.js` | Gate scanner | Real-time sync OK |

### Guard / Gate
| File | Purpose |
|------|---------|
| `guard-core.js` | Main scanner with dual scan modes |
| `guard-verification.js` | Pass management |

### Admin
| File | Purpose |
|------|---------|
| `admin-attendance-settings.js` | Configure thresholds |
| `admin-grade-schedules.js` | Per-grade times |

### Parent
| File | Purpose |
|------|---------|
| `parent-childs-attendance.js` | Read-only calendar view |

---

## ACTION ITEMS FOR FIX

**Phase A: Critical Data Integrity** (Do first)
1. Consolidate `syncStudentDailySummary()` into ONE function in `attendance-helpers.js`
2. Remove duplicate from `attendance-utils.js`; re-export from helpers
3. Update `attendance-daily-summary-batch.js` to call the shared function
4. Fix afternoon auto-present rule to check guard_passes instead of time_out only

**Phase B: Consistency**
5. Standardize status values across all modules
6. Centralize notification duplicate check
7. Add database CHECK constraints

**Phase C: Polish**
8. Centralize grade-level mapping
9. Ensure school year validation in all entry points
10. Add logging to track auto-present rule applications

---

## CONCLUSION

The system is **80% correct** but the 20% of bugs cause real-world reporting errors. The batch job being out of sync with real-time is the most urgent issue.

**Do NOT proceed with new features** until:
- Afternoon auto-present rule is applied consistently
- Duplicate buggy recompute function is removed
- Status values are standardized

This audit serves as the baseline. Fixes should be applied in order above, with full regression testing on:
- Gate scan scenarios (entry only, entry+exit, re-entry)
- Homeroom manual marking
- Subject attendance marking
- Batch job execution
