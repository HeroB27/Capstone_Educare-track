/**
 * ============================================================================
 * ATTENDANCE DAILY SUMMARY BATCH OPERATIONS
 * ============================================================================
 * End-of-day batch job for syncing homeroom attendance to daily summary.
 * This file provides batch processing for the attendance system.
 */

const USE_NEW_ATTENDANCE_LOGIC = true;

/**
 * Get dismissal time for a grade level from settings.
 * Fallback to '15:00' if not configured.
 */
async function getDismissalTimeForGrade(gradeLevel) {
    const { data: setting } = await supabase
        .from('settings')
        .select('setting_value')
        .eq('setting_key', 'pm_dismissal_time')
        .maybeSingle();
    return setting?.setting_value || '15:00';
}

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
    
    // Check holiday
    const { data: holiday } = await supabase
        .from('holidays')
        .select('holiday_date, is_suspended, time_coverage, target_grades')
        .eq('holiday_date', dateStr)
        .maybeSingle();
    
    if (holiday && holiday.is_suspended) {
        // Check if this grade is affected
        if (holiday.target_grades && holiday.target_grades !== 'All' && gradeLevel) {
            const affectedGrades = holiday.target_grades.split(',').map(g => g.trim().toLowerCase());
            if (!affectedGrades.includes(gradeLevel.toLowerCase())) {
                // Grade not affected - it's a school day
                return { isSchoolDay: true, morningHeld: true, afternoonHeld: true };
            }
        }
        
        // Full day suspension
        if (holiday.time_coverage === 'Full Day' || !holiday.time_coverage) {
            return { isSchoolDay: false, morningHeld: false, afternoonHeld: false };
        }
        
        // Partial day
        if (holiday.time_coverage === 'Morning Only') {
            return { isSchoolDay: true, morningHeld: false, afternoonHeld: true };
        }
        if (holiday.time_coverage === 'Afternoon Only') {
            return { isSchoolDay: true, morningHeld: true, afternoonHeld: false };
        }
    }
    
    // Check suspension
    const { data: suspension } = await supabase
        .from('suspensions')
        .select('id, suspension_type, affected_grades, saturday_enabled')
        .eq('is_active', true)
        .lte('start_date', dateStr)
        .gte('end_date', dateStr)
        .maybeSingle();
    
    if (suspension) {
        if (suspension.suspension_type === 'semestral_break') {
            return { isSchoolDay: false, morningHeld: false, afternoonHeld: false };
        }
        if (suspension.suspension_type === 'grade_suspension' && gradeLevel) {
            const affected = suspension.affected_grades || [];
            if (!affected.includes(gradeLevel)) {
                return { isSchoolDay: true, morningHeld: true, afternoonHeld: true };
            }
            return { isSchoolDay: false, morningHeld: false, afternoonHeld: false };
        }
        if (suspension.suspension_type === 'saturday_class') {
            const satEnabled = suspension.saturday_enabled;
            if (dayOfWeek === 6 && !satEnabled) {
                return { isSchoolDay: false, morningHeld: false, afternoonHeld: false };
            }
        }
    }
    
    return { isSchoolDay: true, morningHeld: true, afternoonHeld: true };
}

/**
 * Is this a Kinder student? (no afternoon session)
 */
async function isKinderStudent(studentId) {
    const { data: student } = await supabase
        .from('students')
        .select('class_id')
        .eq('id', studentId)
        .single();
    
    if (!student?.class_id) return false;
    
    const { data: classRec } = await supabase
        .from('classes')
        .select('grade_level')
        .eq('id', student.class_id)
        .single();
    
    return classRec?.grade_level === 'Kinder';
}

/**
 * Sync attendance_daily_summary from attendance_logs for a specific date.
 * Creates or updates morning/afternoon status based on log entries.
 * Skips dates that are not school days.
 */
async function syncDailySummaryForDate(dateStr) {
    console.log('[AttendanceBatch] Starting sync for ' + dateStr);
    
    // Check if it's a school day (any grade)
    const schoolDayCheck = await checkSchoolDay(dateStr);
    if (!schoolDayCheck.isSchoolDay) {
        console.log('[AttendanceBatch] ' + dateStr + ' is not a school day - skipping');
        return;
    }
    
    const gradeLevels = ['Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 
                     'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
    
    for (const grade of gradeLevels) {
        // Check per-grade school day status
        const gradeDayCheck = await checkSchoolDay(dateStr, grade);
        if (!gradeDayCheck.isSchoolDay) continue;
        
        const { data: classes } = await supabase
            .from('classes')
            .select('id')
            .eq('grade_level', grade);
        
        if (!classes || classes.length === 0) continue;
        
        const classIds = classes.map(c => c.id);
        
        const { data: students } = await supabase
            .from('students')
            .select('id, class_id')
            .in('class_id', classIds)
            .eq('status', 'Enrolled');
        
        if (!students || students.length === 0) continue;
        
        for (const student of students) {
            await syncStudentDailySummary(student.id, dateStr, gradeDayCheck);
        }
    }
    
    console.log('[AttendanceBatch] Sync completed for ' + dateStr);
}

/**
 * Sync a single student's daily summary from their homeroom attendance log.
 * Delegates to AttendanceHelpers.syncStudentDailySummary() to ensure
 * consistent behavior between real-time updates and batch processing.
 */
async function syncStudentDailySummary(studentId, dateStr, schoolDayInfo = null) {
    // Use the shared implementation from attendance-helpers.js
    if (typeof window.AttendanceHelpers !== 'undefined' && typeof window.AttendanceHelpers.syncStudentDailySummary === 'function') {
        return await window.AttendanceHelpers.syncStudentDailySummary(studentId, dateStr, schoolDayInfo);
    }
    // Fallback: should never occur if script loading order is correct
    console.error('[AttendanceBatch] AttendanceHelpers.syncStudentDailySummary unavailable - using fallback');
    return { morningStatus: 'Present', afternoonStatus: 'Present' };
}

/**
 * Run daily sync for yesterday's date.
 * Can be called from admin button or cron job.
 */
async function runDailySync() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    await syncDailySummaryForDate(dateStr);
    showNotification('Daily summary sync completed for ' + dateStr, 'success');
}

/**
 * Run daily sync for a specific date (admin use).
 */
async function runDailySyncForDate(dateStr) {
    await syncDailySummaryForDate(dateStr);
    showNotification('Daily summary sync completed for ' + dateStr, 'success');
}

// Global exports
window.syncDailySummaryForDate = syncDailySummaryForDate;
window.syncStudentDailySummary = syncStudentDailySummary;
window.runDailySync = runDailySync;
window.runDailySyncForDate = runDailySyncForDate;