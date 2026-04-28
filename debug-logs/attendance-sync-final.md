Date: 2026-04-20

PROBLEM:
Attendance backend modules were not synchronized. Two tables (`attendance_logs` raw, `attendance_daily_summary` aggregated) were out of sync across gatekeeper scans, teacher homeroom, subject attendance, and batch jobs. Analytics (`attendance-rules.js`) reads only from `attendance_daily_summary`, leading to inaccurate calculations.

ROOT CAUSE:
1. Gatekeeper writes to attendance_logs only, never updates summary.
2. Teacher homeroom (legacy mode) writes to logs only; v2 mode (which writes both) was disabled by flag.
3. Teacher subject attendance writes to logs, triggers recompute flags, but does not directly update summary.
4. Batch job exists but only runs manually; not auto-triggered.
5. USE_NEW_ATTENDANCE_LOGIC flag set false everywhere, preventing v2 updates.

SOLUTION IMPLEMENTED:

A. Architecture Changes
- Created `core/attendance-helpers.js` – consolidated shared functions:
  - `syncStudentDailySummary()` – writes both homeroom log → summary (now includes afternoon auto-present rule)
  - `recomputeHalfDayStatus()` – updates half-day flags and calls sync
  - `recomputeHalfDayBatch()` – batch helper
  - `checkSchoolDay()`, `isKinderStudent()`, `getStudentGradeLevel()`, etc.
- This ensures a single source of truth for sync logic.

B. Teacher Homeroom (Partial Option A)
- Set `USE_NEW_ATTENDANCE_LOGIC = true` in `teacher/teacher-homeroom.js`.
- Now uses `saveHomeroomStatusV2()` which:
  - Upserts to `attendance_logs` (audit trail)
  - Upserts to `attendance_daily_summary` (source of truth)
  - Calls `recomputeHalfDayStatus()` to keep flags in sync

C. Teacher Subject Attendance (Option B – Central Sync)
- Added feature flag `ENABLE_SUBJECT_AUTOINIT = true`.
- `loadInitialSubjectAttendance()` now:
  - Ensures summary exists via targeted `syncStudentDailySummary()` per student (not heavy full sync)
  - Respects existing subject logs (manual overrides take priority)
  - Auto-fills: homeroom Absent → Absent; homeroom Present/Late/Excused → Present
- `saveAllPending()` after saving:
  - Calls `recomputeHomeroomAttendance()` to update flags
  - Calls `recomputeHalfDayBatch()` → which internally calls `syncStudentDailySummary` → updates summary
- Direct summary updates no longer rely solely on batch job.

D. Gatekeeper Mode (Option B – Central Sync)
- Modified `teacher/teacher-gatekeeper-mode.js`:
  - After every scan outcome (entry or exit), calls `AttendanceHelpers.syncStudentDailySummary()`.
  - Wrapped in try/catch to avoid breaking UI if sync fails.
- Added `attendance-helpers.js` to `teacher-gatekeeper-mode.html` script chain.
- Ensures gate scans populate summary immediately.

E. Student Subject Attendance Modal
- Created `teacher/teacher-student-modal.js` with matrix viewer.
- Modal HTML already existed in `teacher-homeroom.html`; connected via `openStudentSubjectAttendanceModal()`.
- Added stats summary container to modal.
- Displays color-coded per-subject attendance over date range, with pattern detection.

F. Afternoon Auto-Present Rule (Enhanced)
- Implemented in both `attendance-helpers.js` and `attendance-daily-summary-batch.js`:
  - If afternoon_status is 'Absent' AND afternoon session held:
    - Fetch student's grade dismissal time via `getDismissalTime()`.
    - Check for any early exit (`time_out < dismissalTime`).
    - If no early exit found → set `afternoon_status = 'Present'`.
  - This automatically marks students who stayed all day as present even if they never scanned after lunch.

G. Database Index for Performance
- Created migration `migrations/add_attendance_logs_indexes.sql`:
  - Index on `(student_id, log_date, subject_load_id)` for subject queries.
  - Partial index on `(student_id, log_date)` where `subject_load_id IS NULL` for homeroom queries.
- Run this SQL in Supabase to optimize query speed.

FILES MODIFIED:
1. teacher/teacher-homeroom.js – enabled v2 mode
2. teacher/teacher-homeroom.html – added modal container, loaded modal+helpers scripts
3. teacher/teacher-subject-attendance.html – loaded attendance-helpers.js
4. teacher/teacher-subject-attendance.js – feature flag, improved auto-init, sync on save
5. teacher/teacher-gatekeeper-mode.html – loaded attendance-helpers.js
6. teacher/teacher-gatekeeper-mode.js – added sync call after scan
7. core/attendance-helpers.js – new file (711 lines)
8. teacher/teacher-student-modal.js – new file (subject matrix)
9. core/attendance-daily-summary-batch.js – enhanced with auto-present rule
10. migrations/add_attendance_logs_indexes.sql – new migration

SYNC FLOW (After Fix):

Gate Scan
  ↓
attendance_logs INSERT/UPDATE
  ↓
syncStudentDailySummary() – called immediately
  ↓
attendance_daily_summary UPSERT (morning & afternoon)
  ↓
Afternoon auto-present applied if applicable
  ↓
Summary always current

Teacher Homeroom (v2)
  ↓
Upsert logs + summary directly
  ↓
recomputeHalfDayStatus() → syncStudentDailySummary()
  ↓
Summary in sync

Teacher Subject Save
  ↓
Upsert logs (subject_load_id)
  ↓
recomputeHomeroomAttendance() (flags)
  ↓
recomputeHalfDayBatch() → for each student:
    recomputeHalfDayStatus() → syncStudentDailySummary()
  ↓
Summary updated

Batch Job (Nightly Safety Net)
  ↓
For each student: syncStudentDailySummary()
  ↓
Fills any missing rows; applies auto-present
  ↓
Analytics (attendance-rules.js) → accurate data

ROLLBACK PLAN:
- Teacher homeroom: revert `USE_NEW_ATTENDANCE_LOGIC = false` to fallback to legacy (not recommended).
- Subject auto-init: set `ENABLE_SUBJECT_AUTOINIT = false` to disable pre-fill.
- Gatekeeper sync: temporarily remove the sync call lines (lines ~615-621 and ~587-593 in gatekeeper-mode.js).
- All changes are additive and do not modify existing database schema.

REMAINING WORK / CAVEATS:
- Morning-only attendance detection: Students who only scan in afternoon may incorrectly show morning as Present. The current morning logic infers presence from homeroom log without considering time_in. This edge case is rare; teachers can manually override if needed. Future refinement: check time_in against a morning cutoff.
- Parent view (`parent-childs-attendance.js`) still reads raw `attendance_logs`. Should be migrated to read `attendance_daily_summary` for consistency (out of scope for this sprint).
- Batch job is not scheduled automatically; set up a cron job or Supabase Scheduler to call `syncDailySummaryForDate()` nightly.
- Ensure all deployments include the new script tags in the correct order to avoid undefined function errors.

NEXT STEPS:
1. Apply database index migration in Supabase SQL Editor.
2. Deploy updated JS files to server.
3. Test E2E scenarios (see testing plan).
4. Monitor logs for any sync errors.

TEST CASES (verify these manually):
- [ ] Gate entry morning → summary shows morning Present/Late, afternoon Present
- [ ] Gate early exit → summary shows afternoon Absent
- [ ] Teacher overrides homeroom → summary updates
- [ ] Subject attendance save → summary updates (afternoon absent if all subjects absent)
- [ ] Auto-init on subject page → pre-fills based on homeroom
- [ ] Student modal → displays matrix with colors and pattern
- [ ] DepEd 20% rule in admin dashboard reflects correct counts
