/**
 * ============================================================================
 * ATTENDANCE RULES - DepEd 20% Rule Logic
 * ============================================================================
 * Implements DepEd attendance policy: students with >20% unexcused absences
 * in a subject are required to repeat the subject.
 * 
 * This module provides DRY-RUN capability for safe validation before
 * any data modifications.
 */

const USE_NEW_ATTENDANCE_LOGIC = true;
const CRITICAL_ABSENCE_THRESHOLD = 0.20;

/**
 * Check critical absences for all students (DRY RUN - no data modification).
 * Returns list of students with >20% unexcused absences.
 */
async function checkCriticalAbsencesDryRun(schoolYear = '2025-2026') {
    console.log('[AttendanceRules] Starting critical absence check (dry run)');
    
    const results = [];
    
    const gradeLevels = ['Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 
                        'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
    
    for (const grade of gradeLevels) {
        const gradeResults = await checkGradeCriticalAbsences(grade, schoolYear);
        results.push(...gradeResults);
    }
    
    console.log('[AttendanceRules] Dry run found ' + results.length + ' students with critical absences');
    return results;
}

/**
 * Check critical absences for a specific grade level (DRY RUN).
 */
async function checkGradeCriticalAbsences(gradeLevel, schoolYear) {
    const results = [];
    
    const { data: classes } = await supabase
        .from('classes')
        .select('id')
        .eq('grade_level', gradeLevel)
        .eq('school_year', schoolYear);
    
    if (!classes || classes.length === 0) return results;
    
    const classIds = classes.map(c => c.id);
    
    const { data: students } = await supabase
        .from('students')
        .select('id, full_name, student_id_text')
        .in('class_id', classIds)
        .eq('status', 'Enrolled');
    
    if (!students || students.length === 0) return results;
    
    const totalSchoolDays = await getTotalSchoolDays(schoolYear);
    
    for (const student of students) {
        const absenceData = await calculateStudentAbsences(student.id, schoolYear, totalSchoolDays);
        
        if (absenceData.unexcusedPercentage > CRITICAL_ABSENCE_THRESHOLD) {
            results.push({
                studentId: student.id,
                studentName: student.full_name,
                studentLRN: student.student_id_text,
                gradeLevel: gradeLevel,
                totalDays: totalSchoolDays,
                presentDays: absenceData.presentDays,
                excusedAbsences: absenceData.excusedAbsences,
                unexcusedAbsences: absenceData.unexcusedAbsences,
                unexcusedPercentage: absenceData.unexcusedPercentage,
                isCritical: true
            });
            console.log('[AttendanceRules] Student ' + student.full_name + ': ' + absenceData.unexcusedAbsences + ' / ' + totalSchoolDays + ' = ' + (absenceData.unexcusedPercentage * 100).toFixed(1) + '%');
        }
    }
    
    return results;
}

/**
 * Calculate student absence statistics using attendance_daily_summary.
 * Properly handles half-day holidays/suspensions by checking summary status.
 */
async function calculateStudentAbsences(studentId, schoolYear, totalDays) {
    const startDate = schoolYear.split('-')[0] + '-06-01';
    const endDate = schoolYear.split('-')[1] + '-03-31';
    
    const { data: summaries } = await supabase
        .from('attendance_daily_summary')
        .select('date, morning_status, afternoon_status')
        .eq('student_id', studentId)
        .gte('date', startDate)
        .lte('date', endDate);
    
    if (!summaries || summaries.length === 0) {
        return { presentDays: 0, excusedAbsences: 0, unexcusedAbsences: 0, unexcusedPercentage: 0 };
    }
    
    // Get approved excuse letters for this student
    const { data: excuses } = await supabase
        .from('excuse_letters')
        .select('date_absent, absence_type, period')
        .eq('student_id', studentId)
        .eq('status', 'Approved')
        .gte('date_absent', startDate)
        .lte('date_absent', endDate);
    
    const excuseMap = new Map();
    excuses?.forEach(e => {
        excuseMap.set(e.date_absent, {
            type: e.absence_type || 'whole_day',
            period: e.period || 'whole_day'
        });
    });
    
    let excusedAbsences = 0;
    let unexcusedAbsences = 0;
    let presentDays = 0;
    
    for (const summary of summaries) {
        const excuse = excuseMap.get(summary.date);
        const morningStatus = summary.morning_status;
        const afternoonStatus = summary.afternoon_status;
        
        // Skip halves that weren't held (N/A from half-day holidays)
        const morningHeld = morningStatus !== 'N/A';
        const afternoonHeld = afternoonStatus !== 'N/A';
        
        // Process morning
        if (morningHeld) {
            if (excuse && (excuse.type === 'whole_day' || excuse.period === 'morning' || excuse.type === 'half_day_morning')) {
                excusedAbsences += 0.5;
            } else if (morningStatus === 'Absent') {
                unexcusedAbsences += 0.5;
            } else if (morningStatus === 'Present' || morningStatus === 'Late' || morningStatus === 'Excused') {
                presentDays += 0.5;
            }
        }
        
        // Process afternoon
        if (afternoonHeld) {
            if (excuse && (excuse.type === 'whole_day' || excuse.period === 'afternoon' || excuse.type === 'half_day_afternoon')) {
                excusedAbsences += 0.5;
            } else if (afternoonStatus === 'Absent') {
                unexcusedAbsences += 0.5;
            } else if (afternoonStatus === 'Present' || afternoonStatus === 'Late' || afternoonStatus === 'Excused') {
                presentDays += 0.5;
            }
        }
    }
    
    const unexcusedPercentage = totalDays > 0 ? unexcusedAbsences / totalDays : 0;
    
    return {
        presentDays,
        excusedAbsences,
        unexcusedAbsences,
        unexcusedPercentage
    };
}

/**
 * Get total school days in a school year (excluding weekends and holidays).
 * For simplicity, uses a default estimate if not calculated.
 */
async function getTotalSchoolDays(schoolYear) {
    const { data: settings } = await supabase
        .from('settings')
        .select('setting_value')
        .eq('setting_key', 'total_school_days')
        .maybeSingle();
    
    if (settings && settings.setting_value) {
        return parseInt(settings.setting_value);
    }
    
    return 180;
}

/**
 * Full implementation with data insertion.
 * WARNING: Only call this after reviewing dry-run results.
 */
async function runCriticalAbsenceCheck(schoolYear = '2025-2026') {
    if (!USE_NEW_ATTENDANCE_LOGIC) {
        showNotification('Critical absence check requires USE_NEW_ATTENDANCE_LOGIC to be enabled', 'warning');
        return [];
    }
    
    console.log('[AttendanceRules] Running full critical absence check');
    
    const criticalStudents = await checkCriticalAbsencesDryRun(schoolYear);
    
    const patterns = [];
    
    for (const student of criticalStudents) {
        const { data: existing } = await supabase
            .from('attendance_patterns')
            .select('id')
            .eq('student_id', student.studentId)
            .eq('pattern_type', 'critical_absence')
            .eq('is_resolved', false)
            .maybeSingle();
        
        if (!existing) {
            const { error } = await supabase
                .from('attendance_patterns')
                .insert({
                    student_id: student.studentId,
                    pattern_type: 'critical_absence',
                    description: student.unexcusedAbsences + ' unexcused absences (' + (student.unexcusedPercentage * 100).toFixed(1) + '%) - may need to repeat subject',
                    severity: 'high',
                    is_resolved: false
                });
            
            if (!error) {
                patterns.push(student);
                
                // Send notification to homeroom teacher
                const { data: classInfo } = await supabase
                    .from('classes')
                    .select('adviser_id')
                    .eq('grade_level', student.gradeLevel)
                    .eq('school_year', schoolYear)
                    .maybeSingle();
                
                if (classInfo?.adviser_id) {
                    createNotification(
                        classInfo.adviser_id,
                        'teacher',
                        'Critical Absence Alert: ' + student.studentName,
                        student.studentName + ' (' + student.studentLRN + ') has ' + student.unexcusedAbsences + ' unexcused absences (' + (student.unexcusedPercentage * 100).toFixed(1) + '%). May need to repeat subject.',
                        'critical_absence'
                    ).catch(err => console.error('Error creating teacher notification:', err));
                }
                
                // Send notification to admin users
                const { data: adminUsers } = await supabase
                    .from('users')
                    .select('id')
                    .eq('role', 'admin');
                
                if (adminUsers && adminUsers.length > 0) {
                    for (const admin of adminUsers) {
                        createNotification(
                            admin.id,
                            'admin',
                            'Critical Absence Alert: ' + student.studentName,
                            student.studentName + ' (' + student.studentLRN + ', Grade ' + student.gradeLevel + ') has ' + student.unexcusedAbsences + ' unexcused absences (' + (student.unexcusedPercentage * 100).toFixed(1) + '%). May need to repeat subject.',
                            'critical_absence'
                        ).catch(err => console.error('Error creating admin notification:', err));
                    }
                }
            }
        }
    }
    
    showNotification('Found ' + criticalStudents.length + ' students with critical absences', 'info');
    return criticalStudents;
}

/**
 * Get students flagged with critical absence pattern (for admin dashboard).
 */
async function getCriticalAbsenceFlaggedStudents() {
    const { data: patterns } = await supabase
        .from('attendance_patterns')
        .select('student_id, description, severity, created_at')
        .eq('pattern_type', 'critical_absence')
        .eq('is_resolved', false)
        .order('created_at', { ascending: false });
    
    if (!patterns || patterns.length === 0) return [];
    
    const studentIds = patterns.map(p => p.student_id);
    
    const { data: students } = await supabase
        .from('students')
        .select('id, full_name, student_id_text')
        .in('id', studentIds);
    
    const studentMap = {};
    students?.forEach(s => {
        studentMap[s.id] = s;
    });
    
    return patterns.map(p => ({
        ...p,
        student: studentMap[p.student_id]
    }));
}

/**
 * Resolve a critical absence pattern (mark as addressed).
 */
async function resolveCriticalAbsencePattern(patternId) {
    const { error } = await supabase
        .from('attendance_patterns')
        .update({ 
            is_resolved: true,
            resolved_at: new Date().toISOString()
        })
        .eq('id', patternId);
    
    if (error) {
        console.error('[AttendanceRules] Error resolving pattern:', error);
        showNotification('Error resolving pattern', 'error');
    } else {
        showNotification('Pattern resolved', 'success');
    }
}

// Global exports
window.checkCriticalAbsencesDryRun = checkCriticalAbsencesDryRun;
window.checkGradeCriticalAbsences = checkGradeCriticalAbsences;
window.runCriticalAbsenceCheck = runCriticalAbsenceCheck;
window.getCriticalAbsenceFlaggedStudents = getCriticalAbsenceFlaggedStudents;
window.resolveCriticalAbsencePattern = resolveCriticalAbsencePattern;