Date: 2026-04-20

PROBLEM:
Attendance backend modules are not properly synchronized. Multiple data stores exist (attendance_logs, attendance_daily_summary) with inconsistent updates across teacher homeroom, subject attendance, gatekeeper scans, and clinic modules.

KEY FINDINGS:

1. **Two-Tables Problem**: 
   - `attendance_logs` - raw transaction log (every scan, every subject entry)
   - `attendance_daily_summary` - aggregated daily status (morning_status, afternoon_status)
   - These tables are not kept in sync consistently.

2. **Gatekeeper Mode** (teacher-gatekeeper-mode.js):
   - Scans write to `attendance_logs` ONLY (lines 567, 580, 600, 610)
   - Does NOT update `attendance_daily_summary` at all
   - Creates raw log entries but daily summary remains NULL

3. **Teacher Homeroom** (teacher-homeroom.js):
   - Legacy mode (USE_NEW_ATTENDANCE_LOGIC=false): saves to `attendance_logs` only (line 322-323)
   - New mode (v2): saves to BOTH `attendance_logs` AND `attendance_daily_summary` (lines 263-272)
   - Also calls `recomputeHalfDayStatus` after save (line 279)
   - BUT: Flag `USE_NEW_ATTENDANCE_LOGIC = false` is hardcoded, so v2 never runs

4. **Teacher Subject Attendance** (teacher-subject-attendance.js):
   - Saves subject attendance to `attendance_logs` only (lines 236, 240)
   - Calls `recomputeHomeroomAttendance` which updates homeroom log's morning_absent/afternoon_absent flags (line 250)
   - Also calls `recomputeHalfDayBatch` (line 253-255)
   - Does NOT directly update `attendance_daily_summary`
   - Auto-initialization relies on `attendance_daily_summary` being populated (line 96-97 calls syncDailySummaryForDate)

5. **Batch Job** (core/attendance-daily-summary-batch.js):
   - `syncDailySummaryForDate()` exists to populate summary from logs
   - `syncStudentDailySummary()` reads homeroom logs and writes summary (lines 187-249)
   - BUT: This is only called from:
     a) Subject attendance auto-init (if function exists)
     b) Admin button click (runDailySync, runDailySyncForDate)
   - NOT automatically triggered after gate scans or teacher saves

6. **Attendance Rules** (core/attendance-rules.js):
   - Reads from `attendance_daily_summary` ONLY (line 94-98)
   - If summary is empty/missing, calculations are wrong
   - Depends on batch job to keep summary populated

7. **Parent View** (parent-childs-attendance.js):
   - Reads from `attendance_logs` only (line 30-34)
   - Does NOT use `attendance_daily_summary`
   - Shows raw log entries, not aggregated daily status

8. **Clinic Module** (clinic-core.js):
   - Does NOT interact with attendance tables directly
   - Separate concerns (clinic_visits table)

SYNC GAPS IDENTIFIED:

Gap 1: Gatekeeper scans → logs but not summary
- Impact: Daily summary missing for students who only scan gate (no homeroom override)
- Result: attendance_rules calculates 0 days instead of actual

Gap 2: Teacher homeroom (legacy mode) → logs only, no summary
- Impact: Manual edits don't update summary
- Result: Summary stale unless batch job runs

Gap 3: Teacher subject attendance → logs only, no summary direct update
- Impact: Subject absences trigger half-day recompute but don't update summary
- Result: Summary still shows Present even if all subjects absent

Gap 4: Batch job not automatically triggered
- Impact: Summary only updated when subject page loads (calls sync) or admin clicks button
- Result: Real-time sync broken

Gap 5: USE_NEW_ATTENDANCE_LOGIC flag false everywhere
- Impact: New logic (that updates both tables) never activates
- Result: System stuck in legacy mode with known gaps

FLOW DIAGRAM (Current Broken State):

Gate Scan (gatekeeper-mode.js)
  ↓
attendance_logs INSERT/UPDATE
  ↓
[NO UPDATE TO attendance_daily_summary]
  ↓
Summary incomplete

Teacher Homeroom Save (legacy mode)
  ↓
attendance_logs UPSERT
  ↓
[NO UPDATE TO attendance_daily_summary]
  ↓
Summary incomplete

Teacher Homeroom Save (v2 mode - DISABLED)
  ↓
attendance_logs UPSERT
  ↓
attendance_daily_summary UPSERT ✓
  ↓
Half-day recompute ✓
  ↓
Summary complete

Teacher Subject Save
  ↓
attendance_logs UPSERT
  ↓
recomputeHomeroomAttendance (updates homeroom log's flags)
  ↓
recomputeHalfDayBatch (updates summary? unclear)
  ↓
[INDIRECT summary update - not reliable]

Batch Job (manual trigger only)
  ↓
Reads attendance_logs (homeroom entries)
  ↓
Writes attendance_daily_summary
  ↓
Populates missing entries

Attendance Rules Analytics
  ↓
READS attendance_daily_summary ONLY
  ↓
If summary missing → WRONG CALCULATIONS

SOLUTIONS TO SYNC:

Option A: Enable USE_NEW_ATTENDANCE_LOGIC globally
- Change all `const USE_NEW_ATTENDANCE_LOGIC = false;` to `true`
- Pros: Uses existing v2 code paths
- Cons: Need to verify v2 code is complete and tested

Option B: Add triggers to database (NOT recommended - project uses simple SQL)
- Use Supabase functions or triggers
- But project philosophy: avoid complex DB logic

Option C: Centralize all writes through a single sync function
- Create `core/attendance-sync.js` that all modulescall
- Ensures logs + summary always updated together
- More reliable than scattered updates

Option D: Convert batch job to real-time listener
- Instead of manual trigger, listen to `attendance_logs` changes
- Auto-update summary when log changes
- Better real-time sync

RECOMMENDED APPROACH:

1. Enable USE_NEW_ATTENDANCE_LOGIC in all files
2. Verify teacher-homeroom.js v2 path correctly updates both tables (it does - lines 263-272)
3. Add direct summary update to teacher-subject-attendance.js after save (currently indirect)
4. Add direct summary update to teacher-gatekeeper-mode.js after scan (currently missing)
5. Set up automatic daily batch as safety net (cron/scheduled)
6. Remove legacy mode code paths after 2-week transition

IMMEDIATE FIXES NEEDED:

Fix 1: teacher-gatekeeper-mode.js - after successful scan, call sync function
Fix 2: teacher-subject-attendance.js - after saveAllPending, call summary upsert directly
Fix 3: Ensure batch job runs automatically nightly via Supabase Scheduler or external cron
Fix 4: Create unified write function in core that all modules import

NEXT STEPS:
- Ask user which approach they prefer (A, C, or D)
- Implement chosen solution
- Test end-to-end: gate scan → summary → analytics
- Verify parent view uses correct source
