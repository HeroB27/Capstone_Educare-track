
/**
 * ============================================================================
 * ATTENDANCE UTILITY FUNCTIONS
 * ============================================================================
 * These functions help determine if attendance can be taken on a specific date
 * based on weekend settings and suspensions.
 * 
 * Usage:
 * - Guard Scanner: Check before allowing scan
 * - Teacher Attendance: Check before marking attendance
 * ============================================================================
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
            // Check if Saturday classes are enabled
            if (!settingMap['weekend_saturday_class_enabled']) {
                return { allowed: false, reason: 'Saturday classes are not in session' };
            }
        }
        
        // 2. Check suspensions for this date
        const dateStr = date.toISOString().split('T')[0];
        
        const { data: suspensions } = await supabase
            .from('suspensions')
            .select('*')
            .eq('is_active', true)
            .lte('start_date', dateStr)
            .gte('end_date', dateStr);
        
        if (suspensions && suspensions.length > 0) {
            // Check each suspension
            for (const susp of suspensions) {
                if (susp.suspension_type === 'semestral_break') {
                    return { allowed: false, reason: susp.title + ' - No attendance during breaks' };
                }
                if (susp.suspension_type === 'saturday_class') {
                    // Saturday class toggle - if disabled, no attendance
                    if (!susp.saturday_enabled) {
                        return { allowed: false, reason: 'Saturday classes are suspended' };
                    }
                }
                if (susp.suspension_type === 'grade_suspension') {
                    // Grade suspension - need to check student's grade
                    return { 
                        allowed: 'grade_specific', 
                        reason: 'Some grades may be suspended',
                        suspendedGrades: susp.affected_grades || []
                    };
                }
                if (susp.suspension_type === 'suspension') {
                    // Class suspension - need to check student's class
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
        // Default to allowed on error
        return result;
    }
}

/**
 * Check if a specific student can attend on a given date
 * Takes into account grade suspension and class suspension
 */
async function checkStudentAttendanceAllowed(studentId, date = new Date()) {
    const dateStr = date.toISOString().split('T')[0];
    
    try {
        // First get the student's class info
        const { data: student } = await supabase
            .from('students')
            .select('id, class_id, classes(grade_level)')
            .eq('id', studentId)
            .single();
        
        if (!student) {
            return { allowed: false, reason: 'Student not found' };
        }
        
        const gradeLevel = student.classes?.grade_level;
        
        // Check suspensions
        const { data: suspensions } = await supabase
            .from('suspensions')
            .select('*')
            .eq('is_active', true)
            .lte('start_date', dateStr)
            .gte('end_date', dateStr);
        
        if (suspensions && suspensions.length > 0) {
            for (const susp of suspensions) {
                // Check grade suspension
                if (susp.suspension_type === 'grade_suspension') {
                    const grades = susp.affected_grades || [];
                    if (grades.includes(gradeLevel)) {
                        return { allowed: false, reason: gradeLevel + ' is suspended: ' + susp.title };
                    }
                }
                
                // Check class suspension
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
        // Get weekend settings
        const { data: settings } = await supabase
            .from('settings')
            .select('setting_key, setting_value')
            .in('setting_key', ['weekend_sunday_enabled', 'weekend_saturday_enabled', 'weekend_saturday_class_enabled']);
        
        settings?.forEach(s => {
            if (s.setting_key === 'weekend_saturday_enabled') {
                status.saturdayEnabled = s.setting_value === 'true';
            }
        });
        
        // Get active suspensions for today
        const dateStr = today.toISOString().split('T')[0];
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

// Make functions globally available
window.checkAttendanceAllowed = checkAttendanceAllowed;
window.checkStudentAttendanceAllowed = checkStudentAttendanceAllowed;
window.getAttendanceStatus = getAttendanceStatus;

