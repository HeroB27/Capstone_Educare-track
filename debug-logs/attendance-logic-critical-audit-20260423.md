Date: 2026-04-23

what is the problem
Comprehensive attendance logic audit reveals CRITICAL DATA INTEGRITY ISSUES affecting reporting accuracy:
1. AFTERNOON AUTO-PRESENT RULE SPLIT: Real-time sync applies it, batch job DOES NOT (attendance-helpers.js vs attendance-daily-summary-batch.js)
2. DUPLICATE half-day recompute functions with conflicting logic (attendance-helpers.js CORRECT, attendance-utils.js BUGGY - Excused counted as absent)
3. Status value enumeration not enforced (Present/On Time, Excused Absent variants)
4. Auto-present rule uses time_out timestamp instead of checking guard_passes authorization (false positives)
5. Notification duplicate avoidance inconsistent across modules

what cause it
- Previous fixes (Feature Flag work, auto-present rule addition) were applied incrementally without auditing all code paths
- Code duplication without shared abstraction (two syncStudentDailySummary implementations diverged)
- Business logic evolution: auto-present rule added for real-time but batch job forgotten
- No centralized constants or validation
- No automated tests verifying batch vs real-time parity

what is the solution
IMMEDIATE (Prevent further corruption):
1. Consolidate syncStudentDailySummary() into single source in attendance-helpers.js
   - Extract afternoon auto-present logic to: applyAfternoonAutoPresentRule(studentId, dateStr)
   - Call it from BOTH helpers sync AND batch sync
2. Remove recomputeHalfDayStatus() from attendance-utils.js entirely
   - Add: window.recomputeHalfDayStatus = attendanceHelpers.recomputeHalfDayStatus
   - This removes the buggy version that miscounts Excused
3. Fix auto-present eligibility: Only apply if student has NO guard_passes authorization record (not just time_out check)
4. Define canonical attendance status constants and update all modules

SHORT TERM (This week):
5. Add database CHECK constraint on attendance_logs.status with all valid values
6. Centralize notification creation: AttendanceHelpers.createNotification() with built-in duplicate detection
7. Add logging: console.log every time auto-present rule fires, for audit trail

REGRESSION TESTING (Before deployment):
8. Create test scenarios:
   - Entry-only scan → verify both real-time and batch show Present afternoon
   - Excused absence with approved excuse letter → verify counted as excused not unexcused
   - Guard pass early exit → verify NOT auto-corrected to Present
   - Re-entry scenario → verify two separate logs, summary correct
9. Run batch sync on previous week's data, compare to real-time view, flag discrepancies

DEPLOYMENT:
10. Deploy in phases:
    a. Deploy helpers.js + batch.js fix (monitor auto-present logs)
    b. Deploy status constant updates
    c. Deploy notification centralization
11. After deploy: run batch sync for past 7 days to correct any misstates
12. Monitor DepEd rule reports for 1 week, verify against expected counts

AFFECTED FILES (10+):
- core/attendance-helpers.js (modify)
- core/attendance-daily-summary-batch.js (modify - remove local syncStudentDailySummary, call helpers)
- core/attendance-utils.js (remove duplicate recomputeHalfDayStatus, add re-export)
- teacher/teacher-homeroom.js (change to use window.recomputeHalfDayStatus from helpers)
- teacher/teacher-subject-attendance.js (already calls helpers.sync, verify)
- guard/guard-core.js (already calls helpers.sync, verify)
- core/general-core.js (add status constants, evaluateGateStatus verification)
- All CSV export modules (update to use canonical status labels)
- Database migration: add CHECK constraint (separate SQL file)

VERIFICATION STEPS:
- [ ] Batch job output matches real-time view for same date (spot check 10 students)
- [ ] Excused absences appear in daily_summary as "Excused" and count as present for rate
- [ ] Students with guard passes show "Early Exit (Authorized)" and afternoon remains Absent (not auto-corrected)
- [ ] No duplicate notifications for same event in notifications table
- [ ] DepEd 20% rule matches manual calculation on sample student

RISKS:
- Batch job change may time out on large student body; consider processing per-grade with delay
- CHECK constraint may fail if legacy invalid statuses exist; need data cleanup first
- Existing code might rely on buggy utils version; must grep for recomputeHalfDayStatus references

RECOMMENDATION:
Do NOT implement new features until Phase A (unification) is complete. This is foundational.
