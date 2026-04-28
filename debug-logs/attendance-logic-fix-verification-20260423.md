Date: 2026-04-23

what is the problem
Attendance system analytics (DepEd 20% rule) were producing incorrect results due to inconsistent feature flag usage and missing synchronization between attendance_logs and attendance_daily_summary tables.

what cause it
1. Inconsistent USE_NEW_ATTENDANCE_LOGIC flags across modules (attendance-rules.js had false while others had true)
2. Gatekeeper scans only updated attendance_logs without syncing to attendance_daily_summary
3. Teacher subject attendance updates didn't directly update attendance_daily_summary
4. Batch synchronization required manual initiation instead of being automatic

what is the solution
1. Unified USE_NEW_ATTENDANCE_LOGIC = true across all modules (attendance-rules.js, guard-core.js, attendance-daily-summary-batch.js)
2. Added direct attendance_daily_summary updates in guard-core.js saveAttendanceLog function after every insert/update
3. Verified teacher-subject-attendance.js already calls syncStudentDailySummary after saves
4. All modules now use the new attendance logic path that updates both tables consistently