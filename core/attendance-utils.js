/**
 * ============================================================================
 * ATTENDANCE UTILITY FUNCTIONS
 * ============================================================================
 * These functions help determine if attendance can be taken on a specific date
 * based on weekend settings and suspensions.
 */

/**
 * Check if attendance is allowed on a specific date
 * Returns: { allowed: boolean, reason: string }
 */
async function checkAttendanceAllowed(date = new Date()) {
    const result = { allowed: true, reason: '' };
    
    // Get today's day of week (0 = Sunday, 6 = Saturday)
    const dayOfWeek = date.getDay();
    
    try {
        // 1. Check weekend settings
        const { data: settings } = await supabase
            .from('settings')
            .select('setting_key, setting_value')
            .in('setting_key', ['weekend_sunday_enabled', 'weekend_saturday_enabled', 'weekend_saturday_class_enabled']);
        
        const settingMap = {};
        settings?.forEach(s => {
            settingMap[s.setting_key] = s.setting_value === 'true';
        });
        
        // Check Sunday
        if (dayOfWeek === 0 && !settingMap['weekend_sunday_enabled']) {
            return { allowed: false, reason: 'Sunday attendance is disabled' };
        }
        
        // Check Saturday
        if (dayOfWeek === 6) {
            if (!settingMap['weekend_saturday_enabled']) {
                return { allowed: false, reason: 'Saturday attendance is disabled' };
            }
            if (!settingMap['weekend_saturday_class_enabled']) {
                return { allowed: false, reason: 'Saturday classes are not in session' };
            }
        }
        
        // 2. Check suspensions for this date
        // DEFENSE FIX: Localize the ISO string to avoid the "Morning UTC Trap"
        const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        const dateStr = localDate.toISOString().split('T')[0];
        
        const { data: suspensions } = await supabase
            .from('suspensions')
            .select('*')
            .eq('is_active', true)
            .lte('start_date', dateStr)
            .gte('end_date', dateStr);
        
        if (suspensions && suspensions.length > 0) {
            for (const susp of suspensions) {
                if (susp.suspension_type === 'semestral_break') {
                    return { allowed: false, reason: susp.title + ' - No attendance during breaks' };
                }
                if (susp.suspension_type === 'saturday_class') {
                    if (!susp.saturday_enabled) {
                        return { allowed: false, reason: 'Saturday classes are suspended' };
                    }
                }
                if (susp.suspension_type === 'grade_suspension') {
                    return { 
                        allowed: 'grade_specific', 
                        reason: 'Some grades may be suspended',
                        suspendedGrades: susp.affected_grades || []
                    };
                }
                if (susp.suspension_type === 'suspension') {
                    return { 
                        allowed: 'class_specific', 
                        reason: 'Some classes may be suspended',
                        suspendedClasses: susp.affected_classes || []
                    };
                }
            }
        }
        
        return result;
        
    } catch (err) {
        console.error("Error checking attendance:", err);
        return result; // Default to allowed on error
    }
}

/**
 * Check if a specific student can attend on a given date
 */
async function checkStudentAttendanceAllowed(studentId, date = new Date()) {
    // DEFENSE FIX: Localize the ISO string
    const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    const dateStr = localDate.toISOString().split('T')[0];
    
    try {
        const { data: student } = await supabase
            .from('students')
            .select('id, class_id, classes(grade_level)')
            .eq('id', studentId)
            .single();
        
        if (!student) {
            return { allowed: false, reason: 'Student not found' };
        }
        
        const gradeLevel = student.classes?.grade_level;
        
        const { data: suspensions } = await supabase
            .from('suspensions')
            .select('*')
            .eq('is_active', true)
            .lte('start_date', dateStr)
            .gte('end_date', dateStr);
        
        if (suspensions && suspensions.length > 0) {
            for (const susp of suspensions) {
                if (susp.suspension_type === 'grade_suspension') {
                    const grades = susp.affected_grades || [];
                    if (grades.includes(gradeLevel)) {
                        return { allowed: false, reason: gradeLevel + ' is suspended: ' + susp.title };
                    }
                }
                
                if (susp.suspension_type === 'suspension') {
                    const classes = susp.affected_classes || [];
                    if (classes.includes(String(student.class_id)) || classes.includes(student.class_id)) {
                        return { allowed: false, reason: 'Class suspended: ' + susp.title };
                    }
                }
            }
        }
        
        return { allowed: true, reason: '' };
        
    } catch (err) {
        console.error("Error checking student attendance:", err);
        return { allowed: true, reason: '' };
    }
}

/**
 * Get the current weekend and suspension status for display
 */
async function getAttendanceStatus() {
    const status = {
        today: new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' }),
        isWeekend: false,
        isSunday: false,
        isSaturday: false,
        saturdayEnabled: false,
        activeSuspensions: []
    };
    
    const today = new Date();
    status.isSunday = today.getDay() === 0;
    status.isSaturday = today.getDay() === 6;
    status.isWeekend = status.isSunday || status.isSaturday;
    
    try {
        const { data: settings } = await supabase
            .from('settings')
            .select('setting_key, setting_value')
            .in('setting_key', ['weekend_sunday_enabled', 'weekend_saturday_enabled', 'weekend_saturday_class_enabled']);
        
        settings?.forEach(s => {
            if (s.setting_key === 'weekend_saturday_enabled') {
                status.saturdayEnabled = s.setting_value === 'true';
            }
        });
        
        // DEFENSE FIX: Localize the ISO string
        const localDate = new Date(today.getTime() - (today.getTimezoneOffset() * 60000));
        const dateStr = localDate.toISOString().split('T')[0];
        
        const { data: suspensions } = await supabase
            .from('suspensions')
            .select('*')
            .eq('is_active', true)
            .lte('start_date', dateStr)
            .gte('end_date', dateStr);
        
        status.activeSuspensions = suspensions || [];
        
    } catch (err) {
        console.error("Error getting attendance status:", err);
    }
    
    return status;
}

/**
 * Check if a specific date is a suspension day and get time coverage info
 */
async function checkSuspensionStatus(dateStr) {
    const result = { isSuspended: false, coverage: null };
    
    if (!dateStr) return result;
    
    try {
        const { data: holiday, error } = await supabase
            .from('holidays')
            .select('holiday_date, is_suspended, time_coverage')
            .eq('holiday_date', dateStr)
            .maybeSingle();
        
        if (error) return result;
        
        if (holiday && holiday.is_suspended === true) {
            result.isSuspended = true;
            if (holiday.time_coverage === 'Morning Only') result.coverage = 'Morning';
            else if (holiday.time_coverage === 'Afternoon Only') result.coverage = 'Afternoon';
            else result.coverage = 'Full Day';
        }
        
        return result;
    } catch (err) {
        console.error('[checkSuspensionStatus] Error:', err);
        return result;
    }
}

// ==================== HALF-DAY RECOMPUTATION ====================
// Recompute morning/afternoon half status for a student on a specific date
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
    for (const subj of subjects) {
        const hour = subj.schedule_time_start ? parseInt(subj.schedule_time_start.split(':')[0]) : 12;
        const log = logs.find(l => l.subject_load_id === subj.id);
        const status = log ? log.status : 'Absent';
        // Both Absent and Late count as not present for half-day
        const isPresent = (status === 'On Time' || status === 'Late');
        if (!isPresent) {
            if (hour < 12) {
                morningAbsent = true;
            } else {
                afternoonAbsent = true;
            }
        }
    }

    const morningStatus = morningAbsent ? 'Absent' : 'Present';
    const afternoonStatus = afternoonAbsent ? 'Absent' : 'Present';
    const { error } = await supabase
        .from('attendance_daily_summary')
        .upsert({
            student_id: studentId,
            date: date,
            morning_status: morningStatus,
            afternoon_status: afternoonStatus,
            updated_at: new Date().toISOString()
        }, { onConflict: 'student_id, date' });
    if (error) console.error('recomputeHalfDayStatus error:', error);
}

// Batch recompute for many students/dates (used after bulk saves)
async function recomputeHalfDayBatch(updates) {
    for (const u of updates) {
        await recomputeHalfDayStatus(u.studentId, u.date);
    }
}

// Global exports
window.checkAttendanceAllowed = checkAttendanceAllowed;
window.checkStudentAttendanceAllowed = checkStudentAttendanceAllowed;
window.getAttendanceStatus = getAttendanceStatus;
window.checkSuspensionStatus = checkSuspensionStatus;
window.recomputeHalfDayStatus = recomputeHalfDayStatus;
window.recomputeHalfDayBatch = recomputeHalfDayBatch;
window.recomputeHalfDayStatus = recomputeHalfDayStatus;
window.recomputeHalfDayBatch = recomputeHalfDayBatch;