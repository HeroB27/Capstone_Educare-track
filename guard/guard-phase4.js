// ============================================================================
// PHASE 4: ADVANCED ATTENDANCE TRACKING
// ============================================================================
// This file contains functions for:
// - Partial Absence Tracking (Morning/Afternoon Absent)
// - Special Pattern Detection  
// - Admin Alerts
// ============================================================================

/**
 * Check for partial absence (Morning Absent / Afternoon Absent)
 * Called after each scan in handleScan
 */
async function checkPartialAbsence(studentId, direction, status) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const currentHour = new Date().getHours();
        
        // Get all logs for today
        const { data: logs, error } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', studentId)
            .eq('log_date', today);
        
        if (error || !logs || logs.length === 0) return;
        
        // Check if morning absent (scanning in afternoon without morning record)
        if (direction === 'ENTRY' && currentHour >= 12) {
            const hasMorningRecord = logs.some(log => {
                const logTime = new Date(log.time_in).getHours();
                return logTime < 12; // Morning record exists
            });
            
            if (!hasMorningRecord) {
                // Mark as morning absent and notify parent
                await supabase
                    .from('attendance_logs')
                    .insert({
                        student_id: studentId,
                        log_date: today,
                        time_in: new Date().toISOString(),
                        status: 'Morning Absent',
                        morning_absent: true,
                        remarks: 'Auto-marked: Morning Absent - Please submit excuse letter'
                    });
                
                // Send reminder to parent
                await sendPartialAbsenceNotification(studentId, 'Morning Absent');
            }
        }
        
        // Check if afternoon absent (exiting in morning and not returning)
        if (direction === 'EXIT' && currentHour < 12) {
            const hasAfternoonReturn = logs.some(log => {
                if (!log.time_out) return false;
                const returnTime = new Date(log.time_out).getHours();
                return returnTime >= 12; // Return in afternoon
            });
            
            if (!hasAfternoonReturn) {
                // Mark as afternoon absent
                const latestLog = logs.find(log => log.time_in && !log.time_out);
                if (latestLog) {
                    await supabase
                        .from('attendance_logs')
                        .update({ afternoon_absent: true })
                        .eq('id', latestLog.id);
                }
                
                // Send reminder to parent
                await sendPartialAbsenceNotification(studentId, 'Afternoon Absent');
            }
        }
    } catch (error) {
        console.error('Error in checkPartialAbsence:', error);
    }
}

/**
 * Send notification for partial absence
 */
async function sendPartialAbsenceNotification(studentId, absenceType) {
    try {
        const student = await getStudentById(studentId);
        if (!student || !student.parent_id) return;
        
        const message = absenceType === 'Morning Absent'
            ? `Your child ${student.full_name} was marked as absent this morning. Please submit an excuse letter.`
            : `Your child ${student.full_name} did not return this afternoon. Please submit an excuse letter.`;
        
        await supabase.from('notifications').insert({
            recipient_id: student.parent_id,
            recipient_role: 'parent',
            title: absenceType === 'Morning Absent' ? 'Morning Absence Notice' : 'Afternoon Absence Notice',
            message: message,
            type: 'absence_reminder'
        });
    } catch (error) {
        console.error('Error sending partial absence notification:', error);
    }
}

/**
 * Detect unusual attendance patterns
 */
async function detectAttendancePatterns(student, direction, status) {
    try {
        const studentId = student.id;
        
        // Check for multiple rapid scans (potential system testing)
        const { data: recentLogs } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', studentId)
            .gte('time_in', new Date(Date.now() - 10 * 60 * 1000).toISOString())
            .order('time_in', { ascending: false });
        
        if (recentLogs && recentLogs.length >= 3) {
            await createAttendancePattern(studentId, 'rapid_scans', 
                student.full_name + ' scanned multiple times rapidly - possible system test', 'medium');
        }
        
        // Check for scan and immediate exit (suspicious)
        if (direction === 'EXIT' && recentLogs && recentLogs.length > 0) {
            const lastLog = recentLogs[0];
            if (lastLog && lastLog.time_in) {
                const entryTime = new Date(lastLog.time_in).getTime();
                const exitTime = Date.now();
                const timeDiff = exitTime - entryTime;
                
                // If less than 5 minutes on campus, flag as suspicious
                if (timeDiff < 5 * 60 * 1000) {
                    await createAttendancePattern(studentId, 'immediate_exit',
                        student.full_name + ' left immediately after entering - suspicious behavior', 'high');
                }
            }
        }
        
        // Check for frequent late entries (3+ times in last 7 days)
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: lateLogs } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', studentId)
            .eq('status', 'Late')
            .gte('time_in', weekAgo);
        
        if (lateLogs && lateLogs.length >= 3) {
            await createAttendancePattern(studentId, 'frequent_late',
                student.full_name + ' was late ' + lateLogs.length + ' times this week', 'medium');
        }
        
        // Check for frequent early exits
        const { data: earlyExitLogs } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', studentId)
            .eq('status', 'Early Exit')
            .gte('time_in', weekAgo);
        
        if (earlyExitLogs && earlyExitLogs.length >= 3) {
            await createAttendancePattern(studentId, 'frequent_early_exit',
                student.full_name + ' left early ' + earlyExitLogs.length + ' times this week', 'medium');
        }
    } catch (error) {
        console.error('Error in detectAttendancePatterns:', error);
    }
}

/**
 * Create attendance pattern record
 */
async function createAttendancePattern(studentId, patternType, description, severity) {
    try {
        // Check if pattern already exists today
        const today = new Date().toISOString().split('T')[0];
        const { data: existing } = await supabase
            .from('attendance_patterns')
            .select('*')
            .eq('student_id', studentId)
            .eq('pattern_type', patternType)
            .gte('created_at', today);
        
        if (existing && existing.length > 0) return;
        
        await supabase.from('attendance_patterns').insert({
            student_id: studentId,
            pattern_type: patternType,
            description: description,
            severity: severity
        });
    } catch (error) {
        console.error('Error creating attendance pattern:', error);
    }
}

/**
 * Create admin alert for concerning attendance patterns
 */
async function createAdminAlert(student, direction, status) {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Check recent patterns for this student (last 24 hours)
        const { data: recentPatterns } = await supabase
            .from('attendance_patterns')
            .select('*')
            .eq('student_id', student.id)
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .in('severity', ['high', 'medium']);
        
        if (!recentPatterns || recentPatterns.length === 0) return;
        
        const hasHighSeverity = recentPatterns.some(function(p) { return p.severity === 'high'; });
        const mediumCount = recentPatterns.filter(function(p) { return p.severity === 'medium'; }).length;
        
        if (hasHighSeverity || mediumCount >= 2) {
            var gradeLevel = 'Unknown';
            if (student.classes) {
                gradeLevel = student.classes.grade_level || 'Unknown';
            }
            
            await supabase.from('admin_alerts').insert({
                alert_type: 'attendance_pattern',
                title: 'Student Attendance Alert',
                message: student.full_name + ' (' + gradeLevel + ') has multiple attendance irregularities. Please review.',
                severity: hasHighSeverity ? 'high' : 'medium',
                metadata: {
                    student_id: student.id,
                    student_name: student.full_name,
                    patterns: recentPatterns.map(function(p) { return p.pattern_type; })
                }
            });
        }
    } catch (error) {
        console.error('Error creating admin alert:', error);
    }
}
