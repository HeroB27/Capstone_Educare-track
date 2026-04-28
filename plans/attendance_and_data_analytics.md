# Complete Implementation Guide: Attendance & Data Analytics Logic

This document consolidates all corrected attendance logic and analytics requirements into a single, actionable specification. Follow this to update your system.

---

## Part 1: Core Attendance Logic (Recap & Final)

### 1.1 Database Schema (Already exists – no destructive changes)

| Table | Purpose |
|-------|---------|
| `attendance_daily_summary` | **Source of truth** for daily homeroom attendance (morning/afternoon status). |
| `attendance_logs` | Raw gate scans + subject attendance + audit trail. |
| `grade_schedules` | Per‑grade start, end, late threshold. |
| `guard_passes` | Teacher‑issued early exit passes. |
| `clinic_visits` | Clinic visits with nurse recommendations. |
| `holidays`, `suspensions` | No‑school days and half‑day exceptions. |
| `excuse_letters` | Parent‑submitted excuses (approved/excused). |
| `attendance_patterns` | Stores critical absence alerts (DepEd 20% rule). |

### 1.2 Corrected Behaviors (Already Implemented)

| Feature | Behaviour |
|---------|-----------|
| Gate exit | No hardcoded 9 AM block; early exit determined by `isEarlyExit()` + authorisation (guard pass or clinic). |
| Teacher homeroom override | Updates `attendance_daily_summary.morning_status` (or afternoon). Inserts audit log. Notifies parent on Absent. |
| Daily summary batch | Creates missing rows for all students each night. Respects holidays/suspensions. For students with no early exit, sets `afternoon_status = 'Present'`. Kinder: `afternoon_status = NULL`. |
| Subject attendance auto‑init | When teacher opens subject page, pre‑fills status from homeroom summary for that half‑day. |
| Half‑day holiday | Gate blocks only the affected half (morning/afternoon). |
| DepEd 20% rule | Nightly job compares unexcused absent days (full + half) vs total school days (excl. holidays/Sundays). Inserts into `attendance_patterns` when ≥20%. Notifies admin & homeroom teacher. |

---

## Part 2: Shared Helper Functions (Create `core/attendance-helpers.js`)

These functions will be used by both analytics and batch jobs.

```javascript
// ========== SCHOOL DAYS & HOLIDAYS ==========

/**
 * Get total school days between two dates for a specific grade level.
 * Excludes Sundays, full‑day holidays, and dates covered by suspensions.
 * Partial holidays (morning/afternoon) still count as school day.
 */
async function getTotalSchoolDays(startDate, endDate, gradeLevel = null) {
  // 1. Fetch holidays
  let holidayQuery = supabase
    .from('holidays')
    .select('holiday_date, time_coverage')
    .gte('holiday_date', startDate)
    .lte('holiday_date', endDate)
    .eq('is_suspended', true);
  if (gradeLevel) {
    holidayQuery = holidayQuery.or(`target_grades.eq.All,target_grades.cs.{${gradeLevel}}`);
  }
  const { data: holidays } = await holidayQuery;
  const fullDayHolidays = new Set(
    holidays?.filter(h => h.time_coverage === 'Full Day').map(h => h.holiday_date) || []
  );

  // 2. Fetch suspensions (date ranges)
  const { data: suspensions } = await supabase
    .from('suspensions')
    .select('start_date, end_date')
    .eq('is_active', true)
    .gte('start_date', startDate)
    .lte('end_date', endDate);
  // Build set of all dates covered by suspensions
  const suspendedDates = new Set();
  suspensions?.forEach(s => {
    let current = new Date(s.start_date);
    const end = new Date(s.end_date);
    while (current <= end) {
      suspendedDates.add(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
  });

  // 3. Count days
  let count = 0;
  let current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    const dayOfWeek = current.getDay(); // 0 = Sunday
    const dateStr = current.toISOString().split('T')[0];
    if (dayOfWeek !== 0 && !fullDayHolidays.has(dateStr) && !suspendedDates.has(dateStr)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/**
 * Count unexcused absent days for a student in a date range.
 * Uses attendance_daily_summary and approved excuse letters.
 * Returns number of unexcused days (full day = 1, half day = 0.5).
 */
async function countUnexcusedAbsentDays(studentId, startDate, endDate) {
  // Get summary rows
  const { data: summaries } = await supabase
    .from('attendance_daily_summary')
    .select('date, morning_status, afternoon_status')
    .eq('student_id', studentId)
    .gte('date', startDate)
    .lte('date', endDate);

  if (!summaries?.length) return 0;

  // Get approved excuses for this student
  const { data: excuses } = await supabase
    .from('excuse_letters')
    .select('date_absent, absence_type')
    .eq('student_id', studentId)
    .eq('status', 'Approved')
    .gte('date_absent', startDate)
    .lte('date_absent', endDate);

  const excuseMap = new Map();
  excuses?.forEach(e => excuseMap.set(e.date_absent, e.absence_type));

  let unexcusedDays = 0;
  for (const row of summaries) {
    const excuse = excuseMap.get(row.date);
    if (excuse === 'whole_day') continue; // fully excused

    const morningAbsent = row.morning_status === 'Absent';
    const afternoonAbsent = row.afternoon_status === 'Absent';

    if (excuse === 'half_day_morning' && morningAbsent) continue;
    if (excuse === 'half_day_afternoon' && afternoonAbsent) continue;

    if (morningAbsent && afternoonAbsent) unexcusedDays += 1;
    else if (morningAbsent || afternoonAbsent) unexcusedDays += 0.5;
  }
  return unexcusedDays;
}

/**
 * Get attendance rate for a student over a period (0-100).
 * Excused = present, Late = present, Half‑day = 0.5 present.
 */
async function getAttendanceRate(studentId, startDate, endDate) {
  const { data: summaries } = await supabase
    .from('attendance_daily_summary')
    .select('date, morning_status, afternoon_status')
    .eq('student_id', studentId)
    .gte('date', startDate)
    .lte('date', endDate);

  if (!summaries?.length) return 0;

  let presentPeriods = 0;
  let totalPeriods = 0;

  for (const row of summaries) {
    // Morning period
    totalPeriods++;
    if (['Present', 'Late', 'Excused'].includes(row.morning_status)) presentPeriods++;

    // Afternoon period (skip if Kinder – we'll detect from grade later, but for simplicity we check if afternoon_status is not null)
    if (row.afternoon_status !== null) {
      totalPeriods++;
      if (['Present', 'Late', 'Excused'].includes(row.afternoon_status)) presentPeriods++;
    }
  }
  return totalPeriods > 0 ? (presentPeriods / totalPeriods) * 100 : 0;
}
```

---

## Part 3: Analytics – Switch to `attendance_daily_summary`

### 3.1 Admin Analytics (`admin-data-analytics.js`)

Replace all queries that read `attendance_logs` with queries on `attendance_daily_summary`. Below are the key function rewrites.

#### `fetchAttendanceTrend` (using summary)

```javascript
async function fetchAttendanceTrend(dateStart, dateEnd, classId = null, groupBy = 'month', weekMonthFilter = '') {
  let query = supabase
    .from('attendance_daily_summary')
    .select(`
      student_id,
      date,
      morning_status,
      afternoon_status,
      students!inner (class_id)
    `)
    .gte('date', dateStart)
    .lte('date', dateEnd);

  if (classId) {
    query = query.eq('students.class_id', classId);
  }

  const { data: rows } = await query;
  if (!rows?.length) return emptyTrend();

  // Get grade levels to exclude Kinder afternoon
  const studentIds = [...new Set(rows.map(r => r.student_id))];
  const { data: students } = await supabase
    .from('students')
    .select('id, class_id')
    .in('id', studentIds);
  const { data: classes } = await supabase
    .from('classes')
    .select('id, grade_level');
  const gradeMap = {};
  classes?.forEach(c => gradeMap[c.id] = c.grade_level);
  const studentGradeMap = {};
  students?.forEach(s => {
    const grade = gradeMap[s.class_id];
    studentGradeMap[s.id] = grade;
  });

  // Group by month or week
  const groups = {};
  for (const row of rows) {
    const dateObj = new Date(row.date);
    let key;
    if (groupBy === 'month') {
      key = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}`;
    } else {
      // week grouping logic (simplified – use existing)
      key = getWeekKey(dateObj, weekMonthFilter);
      if (!key) continue;
    }
    if (!groups[key]) groups[key] = { present:0, late:0, absent:0, excused:0, halfday:0 };

    const grade = studentGradeMap[row.student_id];
    const isKinder = grade === 'Kinder';

    // Morning
    const m = row.morning_status;
    if (m === 'Present') groups[key].present++;
    else if (m === 'Late') { groups[key].late++; groups[key].present++; }
    else if (m === 'Excused') { groups[key].excused++; groups[key].present++; }
    else if (m === 'Absent') groups[key].absent++;

    // Afternoon (skip Kinder)
    if (!isKinder && row.afternoon_status) {
      const a = row.afternoon_status;
      if (a === 'Present') groups[key].present++;
      else if (a === 'Late') { groups[key].late++; groups[key].present++; }
      else if (a === 'Excused') { groups[key].excused++; groups[key].present++; }
      else if (a === 'Absent') groups[key].absent++;
    }
  }
  // Format labels and return
  return { labels, present, late, absent, excused, halfday };
}
```

#### `fetchStatusDistribution` (summary)

```javascript
async function fetchStatusDistribution(dateStart, dateEnd, classId = null) {
  let query = supabase
    .from('attendance_daily_summary')
    .select(`
      morning_status,
      afternoon_status,
      students!inner (class_id)
    `)
    .gte('date', dateStart)
    .lte('date', dateEnd);
  if (classId) query = query.eq('students.class_id', classId);
  const { data: rows } = await query;
  if (!rows?.length) return { Present:0, Late:0, Absent:0, Excused:0, HalfDay:0 };

  // Get grade info to skip Kinder afternoon
  const studentIds = [...new Set(rows.map(r => r.student_id))];
  const { data: students } = await supabase.from('students').select('id, class_id').in('id', studentIds);
  const { data: classes } = await supabase.from('classes').select('id, grade_level');
  const gradeMap = Object.fromEntries(classes?.map(c => [c.id, c.grade_level]) || []);
  const studentGrade = Object.fromEntries(students?.map(s => [s.id, gradeMap[s.class_id]]) || []);

  const counts = { Present:0, Late:0, Absent:0, Excused:0, HalfDay:0 };
  for (const row of rows) {
    const isKinder = studentGrade[row.student_id] === 'Kinder';
    // Morning
    addStatus(counts, row.morning_status);
    // Afternoon
    if (!isKinder && row.afternoon_status) addStatus(counts, row.afternoon_status);
  }
  return counts;
}

function addStatus(counts, status) {
  if (status === 'Present') counts.Present++;
  else if (status === 'Late') { counts.Late++; counts.Present++; }
  else if (status === 'Excused') { counts.Excused++; counts.Present++; }
  else if (status === 'Absent') counts.Absent++;
  // HalfDay is not stored in summary – derived from separate half‑day flag; we can omit or compute from logs if needed.
}
```

#### `fetchCriticalAbsences` (using DepEd 20% rule)

```javascript
async function fetchCriticalAbsences(dateStart, dateEnd, classId = null) {
  // Get all students (filtered by class)
  let studentQuery = supabase.from('students').select('id, full_name, student_id_text, class_id').eq('status', 'Enrolled');
  if (classId) studentQuery = studentQuery.eq('class_id', classId);
  const { data: students } = await studentQuery;
  if (!students?.length) return [];

  // Get school year start/end from settings
  const schoolYearStart = await getSchoolYearStart();
  const schoolYearEnd = await getSchoolYearEnd();

  const criticalList = [];
  for (const student of students) {
    // Get grade level
    const { data: classInfo } = await supabase.from('classes').select('grade_level').eq('id', student.class_id).single();
    const gradeLevel = classInfo?.grade_level;

    const totalDays = await getTotalSchoolDays(schoolYearStart, schoolYearEnd, gradeLevel);
    const unexcusedDays = await countUnexcusedAbsentDays(student.id, schoolYearStart, schoolYearEnd);
    const absenceRate = (unexcusedDays / totalDays) * 100;

    if (absenceRate >= 20) {
      criticalList.push({
        name: student.full_name,
        id: student.student_id_text,
        absent: Math.floor(unexcusedDays),
        halfday: Math.round((unexcusedDays % 1) * 2), // approximate half‑day count
        adjustedAbsence: unexcusedDays,
        rate: absenceRate
      });
    }
  }
  return criticalList.sort((a,b) => b.adjustedAbsence - a.adjustedAbsence).slice(0, 20);
}
```

#### `fetchAverageAttendanceRate` (using summary)

```javascript
async function fetchAverageAttendanceRate(dateStart, dateEnd, classId = null) {
  let query = supabase
    .from('attendance_daily_summary')
    .select(`
      morning_status,
      afternoon_status,
      students!inner (class_id)
    `)
    .gte('date', dateStart)
    .lte('date', dateEnd);
  if (classId) query = query.eq('students.class_id', classId);
  const { data: rows } = await query;
  if (!rows?.length) return 0;

  // Get grade info (same as before)
  // ... (fetch grade levels)

  let presentCount = 0;
  let totalCount = 0;
  for (const row of rows) {
    const isKinder = studentGrade[row.student_id] === 'Kinder';
    totalCount++;
    if (['Present','Late','Excused'].includes(row.morning_status)) presentCount++;
    if (!isKinder && row.afternoon_status) {
      totalCount++;
      if (['Present','Late','Excused'].includes(row.afternoon_status)) presentCount++;
    }
  }
  return totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;
}
```

### 3.2 Teacher Analytics (`teacher-data-analytics.js`)

Same changes as admin, but filtered to homeroom class only. Replace all `attendance_logs` queries with `attendance_daily_summary`. Use the shared helper functions.

**Important:** Teacher’s `loadPeriodStats` currently reads `attendance_logs`. Change to read `attendance_daily_summary` and compute present/late/absent/excused/halfday from morning/afternoon statuses.

**Example rewrite of `loadPeriodStats`:**

```javascript
async function loadPeriodStats(startDate, endDate) {
  if (!studentIdsInHomeroom.length) return;
  const { data: summaries } = await supabase
    .from('attendance_daily_summary')
    .select('student_id, morning_status, afternoon_status')
    .in('student_id', studentIdsInHomeroom)
    .gte('date', startDate)
    .lte('date', endDate);

  // Get grade levels (to skip Kinder afternoon)
  const { data: students } = await supabase.from('students').select('id, class_id').in('id', studentIdsInHomeroom);
  const { data: classes } = await supabase.from('classes').select('id, grade_level');
  const gradeMap = Object.fromEntries(classes?.map(c => [c.id, c.grade_level]) || []);
  const studentGrade = Object.fromEntries(students?.map(s => [s.id, gradeMap[s.class_id]]) || []);

  let present = 0, late = 0, absent = 0, excused = 0, halfDay = 0;
  for (const row of summaries) {
    const isKinder = studentGrade[row.student_id] === 'Kinder';
    // Morning
    processStatus(row.morning_status);
    // Afternoon
    if (!isKinder && row.afternoon_status) processStatus(row.afternoon_status);
  }
  function processStatus(status) {
    if (status === 'Present') present++;
    else if (status === 'Late') { late++; present++; }
    else if (status === 'Excused') { excused++; present++; }
    else if (status === 'Absent') absent++;
    // Half‑day is not directly stored; we can approximate if needed
  }
  // Update UI with counts and average rate
}
```

---

## Part 4: Nightly Batch Jobs

### 4.1 Daily Summary Sync (`attendance-daily-summary-batch.js`)

Already defined earlier. Must run at 00:05 daily. Key points:
- Create missing summary rows for all enrolled students for yesterday’s date.
- For each student, derive morning/afternoon status from gate scans (first `time_in` of day, `subject_load_id IS NULL`) and subject attendance.
- Apply rule: if no early exit (i.e., no `time_out` before dismissal), set `afternoon_status = 'Present'`.
- Skip holidays/suspensions (no row created).

### 4.2 DepEd 20% Rule Sync (`attendance-rules.js` – `runCriticalAbsenceCheck`)

Run nightly (e.g., at 01:00). For each enrolled student:
- Compute total school days (using `getTotalSchoolDays`).
- Compute unexcused absent days (using `countUnexcusedAbsentDays`).
- If ≥20%, insert into `attendance_patterns` (if not already unresolved).
- Notify admin and homeroom teacher.

---

## Part 5: Integration Checklist for AI Assistant

| Order | Task | Files | Success Criteria |
|-------|------|-------|------------------|
| 1 | Create `core/attendance-helpers.js` | New file | Exports `getTotalSchoolDays`, `countUnexcusedAbsentDays`, `getAttendanceRate`. |
| 2 | Update admin analytics to use summary | `admin-data-analytics.js` | All charts and tables read from `attendance_daily_summary`. |
| 3 | Update teacher analytics to use summary | `teacher-data-analytics.js` | Same as above. |
| 4 | Fix DepEd critical absences threshold | Both analytics files | Use `getTotalSchoolDays` and `countUnexcusedAbsentDays`; replace hardcoded 10. |
| 5 | Add Kinder exclusion | Both analytics files | Skip afternoon status for students in grade 'Kinder'. |
| 6 | Ensure nightly batch jobs are scheduled | `attendance-daily-summary-batch.js`, `attendance-rules.js` | Run via cron or admin‑triggered button. |
| 7 | Feature flag for gradual rollout | All modified files | Use `USE_SUMMARY_ANALYTICS = false` initially; test then flip to true. |

---

## Part 6: Testing Validation

After implementation, run these tests:

| Test | Expected Result |
|------|-----------------|
| Teacher manually marks student Absent (override). Analytics next day shows Absent count increased. | ✅ Reflects override. |
| Student with 10 excused absences and 5 unexcused. School days = 100. DepEd check: 5% → not flagged. | ✅ No critical alert. |
| Student with 25 unexcused half‑days (12.5 full days). School days = 100. Rate = 12.5% → not flagged. | ✅ No critical alert (needs 20%). |
| Kinder student: afternoon status never appears in analytics. | ✅ All charts ignore afternoon. |
| Holiday “Morning Only”: no summary row for morning, but afternoon row exists (if student present). | ✅ Summary correct, analytics show only afternoon. |

---

This is the complete logic specification. The AI assistant should now implement the code following the above guidelines, using the existing database schema and the corrected attendance logic from earlier messages.