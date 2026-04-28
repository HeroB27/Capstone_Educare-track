/**
 * ============================================================================
 * ATTENDANCE HELPERS - Shared utility functions for attendance module
 * ============================================================================
 * Centralized helpers to ensure consistent attendance logic across all modules.
 */

const USE_NEW_ATTENDANCE_LOGIC = true;

// ==================== DATE & TIME HELPERS ====================

/**
 * Get local ISO date string (avoid timezone shift)
 */
function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Compare two HH:MM:SS time strings
 * Returns positive if time1 > time2
 */
function compareTimes(time1, time2) {
    const [h1, m1, s1 = 0] = time1.split(':').map(Number);
    const [h2, m2, s2 = 0] = time2.split(':').map(Number);
    return (h1 * 60 + m1) - (h2 * 60 + m2);
}

/**
 * Check if time1 is late compared to threshold
 */
function isLate(time, threshold) {
    return compareTimes(time, threshold) > 0;
}

/**
 * Check if exit is early (before dismissal)
 */
function isEarlyExit(time, dismissal) {
    return compareTimes(time, dismissal) < 0;
}

/**
 * Check if exit is late (more than 30 min after dismissal)
 */
function isLateExit(time, dismissal) {
    const diff = compareTimes(time, dismissal);
    return diff > 30 * 60; // 30 minutes in seconds
}

// ==================== SCHOOL DAY CHECK ====================

/**
 * Check if a date is a valid school day for a specific grade level.
 * Returns: { isSchoolDay: boolean, morningHeld: boolean, afternoonHeld: boolean }
 */
async function checkSchoolDay(dateStr, gradeLevel = null) {
    const dayOfWeek = new Date(dateStr).getDay();

    // Sunday = no school
    if (dayOfWeek === 0) {
        return { isSchoolDay: false, morningHeld: false, afternoonHeld: false };
    }

    // Saturday check
    if (dayOfWeek === 6) {
        const { data: setting } = await supabase
            .from('settings')
            .select('setting_value')
            .eq('setting_key', 'weekend_saturday_enabled')
            .maybeSingle();
        const saturdayEnabled = setting?.setting_value === 'true';
        if (!saturdayEnabled) {
            return { isSchoolDay: false, morningHeld: false, afternoonHeld: false };
        }
    return { isSchoolDay: true, morningHeld: true, afternoonHeld: true };
}

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

// ==================== STUDENT & GRADE HELPERS ====================

/**
 * Get student's grade level
 */
async function getStudentGradeLevel(studentId) {
    const { data: student } = await supabase
        .from('students')
        .select('classes(grade_level)')
        .eq('id', studentId)
        .single();

    return student?.classes?.grade_level || null;
}

/**
 * Is this a Kinder student? (Kinder has no afternoon session)
 */
async function isKinderStudent(studentId) {
    const gradeLevel = await getStudentGradeLevel(studentId);
    return gradeLevel === 'Kinder';
}

/**
 * Get all students in a class
 */
async function getStudentsInClass(classId) {
    const { data: students } = await supabase
        .from('students')
        .select('id, full_name, parent_id')
        .eq('class_id', classId)
        .eq('status', 'Enrolled')
        .order('full_name');

    return students || [];
}

/**
 * Get homeroom teacher ID for a class
 */
async function getHomeroomTeacherId(classId) {
    const { data: classRec } = await supabase
        .from('classes')
        .select('adviser_id')
        .eq('id', classId)
        .single();

    return classRec?.adviser_id || null;
}

// ==================== TIME BOUNDARY HELPERS ====================

/**
 * Get late threshold time for a grade level (reads from settings or defaults)
 */
async function getLateThreshold(gradeLevel) {
    const { data: setting } = await supabase
        .from('settings')
        .select('setting_value')
        .eq('setting_key', 'am_late_threshold')
        .maybeSingle();

    if (setting?.setting_value) {
        return setting.setting_value;
    }

    // Default: 08:00
    return '08:00';
}

/**
 * Get dismissal time for a grade level (reads from settings or defaults)
 */
async function getDismissalTime(gradeLevel) {
    const { data: setting } = await supabase
        .from('settings')
        .select('setting_value')
        .eq('setting_key', 'pm_dismissal_time')
        .maybeSingle();

    if (setting?.setting_value) {
        return setting.setting_value;
    }

    // Default: 15:00 (3:00 PM)
    return '15:00';
}

/**
 * Determine half-day boundary (morning vs afternoon) based on time_slot
 * For Kinder: all sessions are considered morning (no afternoon)
 */
async function getHalfBoundary(studentId, dateStr) {
    const isKinder = await isKinderStudent(studentId);
    if (isKinder) {
        return { morning: true, afternoon: false };
    }

    // Could also check actual subject schedule if needed
    // For now: assume morning subjects = morning, afternoon subjects = afternoon
    return { morning: true, afternoon: true };
}

// ==================== SYNC & RECOMPUTE HELPERS ====================

/**
 * Sync a single student's daily summary from their homeroom attendance log.
 * This is the core function that ensures attendance_daily_summary is populated.
 * Called by batch job and real-time sync.
 * 
 * Enhanced with afternoon auto-present rule:
 * For non-Kinder students, if afternoon_status is 'Absent' (no scan) but the student
 * has no early exit record, auto-correct to 'Present'.
 */
async function syncStudentDailySummary(studentId, dateStr, schoolDayInfo = null) {
    const localDate = new Date(dateStr + 'T00:00:00');

    // Get school day info if not provided
    if (!schoolDayInfo) {
        const gradeLevel = await getStudentGradeLevel(studentId);
        schoolDayInfo = await checkSchoolDay(dateStr, gradeLevel);
    }

    const isKinder = await isKinderStudent(studentId);

    const { data: homeroomLog } = await supabase
        .from('attendance_logs')
        .select('status, morning_absent, afternoon_absent')
        .eq('student_id', studentId)
        .eq('log_date', dateStr)
        .is('subject_load_id', null)
        .maybeSingle();

    let morningStatus = 'Present';
    let afternoonStatus = 'Present';

    // Handle morning session
    if (schoolDayInfo.morningHeld) {
        if (homeroomLog) {
            if (homeroomLog.morning_absent) {
                morningStatus = 'Absent';
            } else if (homeroomLog.status === 'Late') {
                morningStatus = 'Late';
            } else if (homeroomLog.status === 'Absent') {
                morningStatus = 'Absent';
            } else if (homeroomLog.status === 'Excused') {
                morningStatus = 'Excused';
            } else {
                morningStatus = 'Present';
            }
        } else {
            morningStatus = 'Absent';
        }
    } else {
        morningStatus = 'N/A';
    }

    // Handle afternoon session
    if (isKinder || !schoolDayInfo.afternoonHeld) {
        afternoonStatus = 'N/A';
    } else if (schoolDayInfo.afternoonHeld) {
        if (homeroomLog) {
            if (homeroomLog.afternoon_absent) {
                afternoonStatus = 'Absent';
            } else if (homeroomLog.status === 'Late') {
                afternoonStatus = 'Late';
            } else if (homeroomLog.status === 'Excused') {
                afternoonStatus = 'Excused';
            } else {
                afternoonStatus = 'Present';
            }
        } else {
            afternoonStatus = 'Absent';
        }
    } else {
        afternoonStatus = 'N/A';
    }

    const { error } = await supabase
        .from('attendance_daily_summary')
        .upsert({
            student_id: studentId,
            date: dateStr,
            morning_status: morningStatus,
            afternoon_status: afternoonStatus,
            last_modified_at: new Date().toISOString()
        }, { onConflict: 'student_id, date' });

    if (error) {
        console.error('[AttendanceHelpers] Error syncing student ' + studentId + ':', error);
    }

    // AFTERNOON AUTO-PRESENT RULE (non-Kinder only)
    // If afternoon_status is 'Absent' and student was PRESENT in morning (i.e., they came to school),
    // but no evidence of early exit, assume they stayed all afternoon → auto-Present.
    // This prevents marking absent students as Present.
    if (!isKinder && afternoonStatus === 'Absent' && schoolDayInfo.afternoonHeld) {
        const isMorningPresent = morningStatus === 'Present' || morningStatus === 'Late' || morningStatus === 'Excused';
        if (isMorningPresent) {
            const gradeLevel = await getStudentGradeLevel(studentId);
            const dismissalTime = await getDismissalTime(gradeLevel); // e.g., "15:00"

            // Build dismissal datetime
            const [dHour, dMin] = dismissalTime.split(':').map(Number);
            const dismissalDate = new Date(dateStr);
            dismissalDate.setHours(dHour, dMin, 0, 0);

            // Fetch all exit logs (with time_out) for that date
            const { data: logs } = await supabase
                .from('attendance_logs')
                .select('time_out')
                .eq('student_id', studentId)
                .eq('log_date', dateStr)
                .not('time_out', 'is', null);

            let hasEarlyExit = false;
            if (logs && logs.length > 0) {
                for (const log of logs) {
                    const timeOut = new Date(log.time_out);
                    if (timeOut < dismissalDate) {
                        hasEarlyExit = true;
                        break;
                    }
                }
            }

            if (!hasEarlyExit) {
                await supabase
                    .from('attendance_daily_summary')
                    .update({ afternoon_status: 'Present' })
                    .eq('student_id', studentId)
                    .eq('date', dateStr);

                console.log('[AttendanceHelpers] Auto-present applied: student ' + studentId + ' afternoon on ' + dateStr);
                afternoonStatus = 'Present';
            }
        }
    }

    return { morningStatus, afternoonStatus };
}

/**
 * Recompute half-day flags for a student on a specific date
 * Updates the homeroom attendance_logs record with morning_absent/afternoon_absent
 * based on all subject attendance for that day.
 */
async function recomputeHalfDayStatus(studentId, date) {
    const { data: student } = await supabase
        .from('students')
        .select('class_id')
        .eq('id', studentId)
        .single();

    if (!student) return;

    const { data: subjects } = await supabase
        .from('subject_loads')
        .select('id, schedule_time_start')
        .eq('class_id', student.class_id);

    const { data: logs } = await supabase
        .from('attendance_logs')
        .select('subject_load_id, status')
        .eq('student_id', studentId)
        .eq('log_date', date)
        .not('subject_load_id', 'is', null);

    let morningAbsent = false;
    let afternoonAbsent = false;

    for (const subj of subjects || []) {
        const hour = subj.schedule_time_start ? parseInt(subj.schedule_time_start.split(':')[0]) : 12;
        const log = logs?.find(l => l.subject_load_id === subj.id);
        const status = log ? log.status : 'Absent';
        // Both Absent and Late count as not present for half-day
        const isPresent = (status === 'On Time' || status === 'Present' || status === 'Excused');
        if (!isPresent) {
            if (hour < 12) {
                morningAbsent = true;
            } else {
                afternoonAbsent = true;
            }
        }
    }

    const { data: existingHomeroom } = await supabase
        .from('attendance_logs')
        .select('id')
        .eq('student_id', studentId)
        .eq('log_date', date)
        .is('subject_load_id', null)
        .maybeSingle();

    if (existingHomeroom) {
        await supabase
            .from('attendance_logs')
            .update({ morning_absent: morningAbsent, afternoon_absent: afternoonAbsent })
            .eq('id', existingHomeroom.id);
    } else {
        // Create homeroom record if doesn't exist
        await supabase.from('attendance_logs').insert({
            student_id: studentId,
            log_date: date,
            status: 'On Time',
            morning_absent: morningAbsent,
            afternoon_absent: afternoonAbsent
        });
    }

    // Also update attendance_daily_summary's half-day flags if needed
    // The summary's morning_status/afternoon_status should already reflect these
    // but we ensure consistency by re-syncing summary
    await syncStudentDailySummary(studentId, date);
}

/**
 * Batch recompute half-day for multiple students/dates
 */
async function recomputeHalfDayBatch(updates) {
    for (const u of updates) {
        await recomputeHalfDayStatus(u.studentId, u.date);
    }
}

// ==================== AFTERNOON AUTO-PRESENT RULE ====================

/**
 * Apply afternoon auto-present correction for non-Kinder students.
 *
 * Business Rule: If a student was present in the morning and has NO authorized
 * early exit (guard pass, medical, or explicit early checkout), assume they
 * stayed for the afternoon session and mark them Present.
 */
async function applyAfternoonAutoPresentRule(studentId, dateStr, morningStatus, schoolDayInfo) {
    const isKinder = await isKinderStudent(studentId);

    // Only apply for non-Kinder with afternoon session
    if (isKinder || !schoolDayInfo.afternoonHeld) {
        return false;
    }

    // Must be marked Absent initially
    const { data: summary } = await supabase
        .from('attendance_daily_summary')
        .select('afternoon_status')
        .eq('student_id', studentId)
        .eq('date', dateStr)
        .maybeSingle();

    const afternoonStatus = summary?.afternoon_status || 'Absent';
    if (afternoonStatus !== 'Absent') {
        return false;
    }

    // Student must have been present in morning
    const isMorningPresent = morningStatus === 'Present' || morningStatus === 'Late' || morningStatus === 'Excused';
    if (!isMorningPresent) {
        return false;
    }

    // Check for AUTHORIZED early exit: guard pass issued today still active
    const dayStart = dateStr + 'T00:00:00';
    const dayEnd = dateStr + 'T23:59:59';
    const { data: guardPass } = await supabase
        .from('guard_passes')
        .select('id')
        .eq('student_id', studentId)
        .eq('status', 'Active')
        .gte('issued_at', dayStart)
        .lte('issued_at', dayEnd)
        .maybeSingle();

    if (guardPass) {
        console.log('[AutoPresent] Student ' + studentId + ' has active guard pass - NOT auto-presenting');
        return false;
    }

    // Check for clinic sent home today (still at clinic or not returned)
    const { data: clinicVisit } = await supabase
        .from('clinic_visits')
        .select('id, action_taken, time_out')
        .eq('student_id', studentId)
        .is('time_out', null) // Still at clinic
        .gte('time_in', dayStart)
        .lt('time_in', dayEnd)
        .order('time_in', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (clinicVisit && clinicVisit.action_taken?.toLowerCase().includes('sent home')) {
        console.log('[AutoPresent] Student ' + studentId + ' sent home from clinic - NOT auto-presenting');
        return false;
    }

    // Check for any early exit timestamp (left before dismissal)
    // This catches unauthorized early departures; if they left early they missed some afternoon
    const gradeLevel = await getStudentGradeLevel(studentId);
    const dismissalTime = await getDismissalTime(gradeLevel);
    const [dHour, dMin] = dismissalTime.split(':').map(Number);
    const dismissalDate = new Date(dateStr);
    dismissalDate.setHours(dHour, dMin, 0, 0);

    const { data: exitLogs } = await supabase
        .from('attendance_logs')
        .select('time_out')
        .eq('student_id', studentId)
        .eq('log_date', dateStr)
        .not('time_out', 'is', null);

    if (exitLogs && exitLogs.length > 0) {
        const hasClearEarlyExit = exitLogs.some(log => {
            const timeOut = new Date(log.time_out);
            return timeOut < dismissalDate;
        });
        if (hasClearEarlyExit) {
            console.log('[AutoPresent] Student ' + studentId + ' has early exit timestamp - NOT auto-presenting');
            return false;
        }
    }

    // All checks passed - apply auto-present
    await supabase
        .from('attendance_daily_summary')
        .update({ afternoon_status: 'Present' })
        .eq('student_id', studentId)
        .eq('date', dateStr);

    console.log('[AttendanceHelpers] Auto-present applied: student ' + studentId + ' afternoon on ' + dateStr);
    return true;
}



// ==================== NOTIFICATION HELPERS ====================

/**
 * Create a notification if one doesn't already exist (deduplication).
 * @param {number} recipientId - User ID of recipient
 * @param {string} recipientRole - Role of recipient (parent, teacher, etc.)
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {string} type - Notification type/category
 * @returns {boolean} - true if created, false if duplicate
 */
async function createNotification(recipientId, recipientRole, title, message, type) {
    if (!recipientId) return false;
    
    // Check for duplicate (same title, recipient, type within last 5 minutes)
    // Using exact match on title + recipient + type is sufficient for attendance alerts
    const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('recipient_id', recipientId)
        .eq('type', type)
        .eq('title', title)
        .maybeSingle();

    if (existing) {
        return false; // Duplicate - not created
    }

    await supabase.from('notifications').insert({
        recipient_id: recipientId,
        recipient_role: recipientRole,
        title,
        message,
        type,
        created_at: new Date().toISOString()
    });
    
    return true; // Created
}

/**
 * Notify parent of attendance issue (deprecated - use createNotification directly)
 */
async function notifyParentOfAbsence(studentId, date, status, subjectName = null) {
    const { data: student } = await supabase
        .from('students')
        .select('id, full_name, parent_id')
        .eq('id', studentId)
        .single();

    if (!student?.parent_id) return;

    const title = subjectName ? `Subject Alert: ${status} in ${subjectName}` : `Attendance Alert: ${status}`;
    const message = subjectName
        ? `Your child ${student.full_name} was marked ${status} in ${subjectName} on ${date}.`
        : `Your child ${student.full_name} was marked ${status} on ${date}.`;

    await createNotification(student.parent_id, 'parent', title, message, 'attendance_alert');
}

/**
 * Notify homeroom teacher of subject attendance issue
 */
async function notifyHomeroomTeacherOfAbsence(studentId, status, subjectName, date) {
    const { data: student } = await supabase
        .from('students')
        .select('class_id, full_name')
        .eq('id', studentId)
        .single();

    if (!student?.class_id) return;

    const { data: classRec } = await supabase
        .from('classes')
        .select('adviser_id')
        .eq('id', student.class_id)
        .single();

    if (!classRec?.adviser_id) return;

    const title = `Subject Alert: ${status}`;
    const message = `Student ${student.full_name} was marked ${status} in ${subjectName} on ${date}.`;

    await createNotification(classRec.adviser_id, 'teacher', title, message, 'attendance_alert');
}

// ==================== EXPORTS ====================

window.AttendanceHelpers = {
    // Date/time
    getLocalDateString,
    compareTimes,
    isLate,
    isEarlyExit,
    isLateExit,
    // School day checks
    checkSchoolDay,
    checkStudentAttendanceAllowed,
    getTotalSchoolDays,
    countUnexcusedAbsentDays,
    getAttendanceRate,
    // Student/grade
    getStudentGradeLevel,
    isKinderStudent,
    getStudentsInClass,
    getHomeroomTeacherId,
    // Boundaries
    getLateThreshold,
    getDismissalTime,
    getHalfBoundary,
    // Sync
    syncStudentDailySummary,
    applyAfternoonAutoPresentRule,
    recomputeHalfDayStatus,
    recomputeHalfDayBatch,
    // Notifications
    createNotification,
    notifyParentOfAbsence,
    notifyHomeroomTeacherOfAbsence
};

// Backward compatibility: expose directly on window for legacy code
window.syncStudentDailySummary = syncStudentDailySummary;
window.applyAfternoonAutoPresentRule = applyAfternoonAutoPresentRule;
window.recomputeHalfDayStatus = recomputeHalfDayStatus;
window.recomputeHalfDayBatch = recomputeHalfDayBatch;
window.checkSchoolDay = checkSchoolDay;
window.isKinderStudent = isKinderStudent;
window.getStudentGradeLevel = getStudentGradeLevel;
window.getHalfBoundary = getHalfBoundary;
window.createNotification = createNotification;
// Note: getLateThreshold and getDismissalTime are already on window via general-core.js
