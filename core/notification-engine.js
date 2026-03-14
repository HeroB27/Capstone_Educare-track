// core/notification-engine.js
// ==========================================
// AUTOMATED ATTENDANCE NOTIFICATION ENGINE
// ==========================================
// Handles Time-Bound Fractional Attendance (Half-Days vs. Whole Days)
// and routes notifications only to the specifically affected Subject Teachers and Parents.
//
// Business Logic:
// 1. WHOLE_DAY Absent: Student never tapped in -> Notify ALL teachers
// 2. AM_HALF: Student tapped in after 12:00 PM -> Notify ONLY morning teachers
// 3. PM_HALF: Student tapped out 12-1 PM and never returned -> Notify ONLY afternoon teachers
// 4. Excused Absences: Same routing but skip parent notifications

/**
 * Evaluates an absence and routes notifications to the correct stakeholders.
 * This is the MASTER notification routing function for the Educare system.
 * 
 * @param {string} studentId - The ID of the absent student
 * @param {string} date - YYYY-MM-DD format
 * @param {string} absenceType - 'WHOLE_DAY', 'AM_HALF', 'PM_HALF'
 * @param {boolean} isExcused - True if triggered by an approved excuse letter
 */
window.dispatchAbsenceNotifications = async function(studentId, date, absenceType, isExcused = false) {
    try {
        console.log(`[NotificationEngine] Processing: Student ${studentId}, Date ${date}, Type ${absenceType}, Excused ${isExcused}`);
        
        // 1. Fetch Student, Parent, and Homeroom Info
        const { data: student, error: studentError } = await supabase
            .from('students')
            .select('id, full_name, parent_id, class_id, classes(id, adviser_id, grade_level, section_name)')
            .eq('id', studentId)
            .single();
            
        if (studentError || !student) {
            console.error('[NotificationEngine] Student not found:', studentError);
            return;
        }

        // 2. Fetch Subject Loads for this Class on this specific Day
        // Get the day code from the date (M, T, W, TH, F)
        const dateObj = new Date(date + 'T00:00:00'); // Force local time
        const dayMap = {0: 'S', 1: 'M', 2: 'T', 3: 'W', 4: 'TH', 5: 'F', 6: 'S'};
        const dayCode = dayMap[dateObj.getDay()];
        
        // Skip weekends - no subject loads on weekends
        if (dayCode === 'S') {
            console.log('[NotificationEngine] Weekend - skipping subject load fetch');
        }

        const { data: subjects, error: subjectError } = await supabase
            .from('subject_loads')
            .select('id, teacher_id, subject_name, schedule_time_start, schedule_time_end, schedule_days')
            .eq('class_id', student.class_id);

        // Handle error but continue with empty subjects
        if (subjectError) {
            console.error('[NotificationEngine] Error fetching subject loads:', subjectError);
        }

        let targetTeacherIds = new Set();
        
        // 3. Time-Bound Routing Logic
        if (subjects && subjects.length > 0) {
            subjects.forEach(sub => {
                // Parse start time to check if AM or PM class
                const startTime = sub.schedule_time_start;
                if (!startTime) return; // Skip if no time set
                
                const hour = parseInt(startTime.split(':')[0]);
                const isMorningClass = hour < 12; // Before 12 PM = morning

                if (absenceType === 'WHOLE_DAY') {
                    // Notify ALL teachers for whole day absence
                    targetTeacherIds.add(sub.teacher_id);
                } else if (absenceType === 'AM_HALF' && isMorningClass) {
                    // Notify ONLY morning teachers for AM half-day
                    targetTeacherIds.add(sub.teacher_id);
                } else if (absenceType === 'PM_HALF' && !isMorningClass) {
                    // Notify ONLY afternoon teachers for PM half-day
                    targetTeacherIds.add(sub.teacher_id);
                }
            });
        }

        // 4. Construct Notification Messages
        const notifications = [];
        const statusText = isExcused ? 'Excused Absence' : 'Unexcused Absence';
        let timeText = 'the whole day';
        if (absenceType === 'AM_HALF') timeText = 'the morning session';
        if (absenceType === 'PM_HALF') timeText = 'the afternoon session';

        const baseMessage = `${student.full_name} is marked as ${statusText} for ${timeText} on ${date}.`;
        const classInfo = student.classes ? `${student.classes.grade_level}-${student.classes.section_name}` : 'Unknown Class';

        // Notify Subject Teachers (affected ones only based on time)
        if (targetTeacherIds.size > 0) {
            targetTeacherIds.forEach(tid => {
                notifications.push({
                    recipient_role: 'teachers',
                    recipient_id: tid,
                    title: `Subject Attendance Alert - ${classInfo}`,
                    message: baseMessage,
                    type: 'attendance_alert',
                    is_read: false
                });
            });
            console.log(`[NotificationEngine] Notifying ${targetTeacherIds.size} subject teachers`);
        }

        // Notify Parent (only for unexcused absences)
        // For excused absences, the excuse letter approval already notifies them
        if (!isExcused && student.parent_id) {
            notifications.push({
                recipient_role: 'parents',
                recipient_id: student.parent_id,
                title: `Absence Notice`,
                message: baseMessage,
                type: 'attendance_alert',
                is_read: false
            });
            console.log('[NotificationEngine] Notifying parent:', student.parent_id);
        }

        // Notify Homeroom Adviser (only for unexcused absences)
        if (!isExcused && student.classes?.adviser_id) {
            notifications.push({
                recipient_role: 'teachers',
                recipient_id: student.classes.adviser_id,
                title: `Advisory Absence - ${classInfo}`,
                message: baseMessage,
                type: 'attendance_alert',
                is_read: false
            });
            console.log('[NotificationEngine] Notifying homeroom adviser:', student.classes.adviser_id);
        }

        // 5. Fire Payload - Insert all notifications at once
        if (notifications.length > 0) {
            const { error: insertError } = await supabase.from('notifications').insert(notifications);
            if (insertError) {
                console.error('[NotificationEngine] Error inserting notifications:', insertError);
            } else {
                console.log(`[NotificationEngine] Successfully dispatched ${notifications.length} targeted absence notifications.`);
            }
        } else {
            console.log('[NotificationEngine] No notifications to send.');
        }

    } catch (err) {
        console.error("[NotificationEngine] Error in notification engine:", err);
    }
};

/**
 * Helper function to determine absence type based on attendance records
 * Used by verifyGateData to detect half-days
 * 
 * @param {Array} records - Array of attendance records for the student
 * @returns {Object} - { absenceType: 'WHOLE_DAY'|'AM_HALF'|'PM_HALF'|'NONE', status: string }
 */
window.determineAbsenceType = function(records) {
    if (!records || records.length === 0) {
        return { absenceType: 'WHOLE_DAY', status: 'Absent' };
    }

    const latest = records[records.length - 1];
    
    // No scan at all
    if (!latest.time_in) {
        return { absenceType: 'WHOLE_DAY', status: 'Absent' };
    }

    // Check if Late and arrived after 12 PM (AM Half-Day)
    if (latest.status === 'Late' && latest.time_in) {
        const timeInDate = new Date(latest.time_in);
        const hour = timeInDate.getHours();
        
        if (hour >= 12) {
            return { absenceType: 'AM_HALF', status: 'Half-Day AM Absent' };
        }
    }

    // Check if they have both time_in and time_out
    // And time_out is during lunch hour (12-13) with no return
    if (latest.time_in && latest.time_out) {
        const timeOutDate = new Date(latest.time_out);
        const hour = timeOutDate.getHours();
        
        // If they left during lunch (12 PM - 1 PM) and no return
        if (hour >= 12 && hour <= 13) {
            return { absenceType: 'PM_HALF', status: 'Half-Day PM Absent' };
        }
    }

    // Normal attendance - no absence
    return { absenceType: 'NONE', status: latest.status || 'Present' };
};

/**
 * Wrapper function for backward compatibility
 * Redirects the old notifySubjectTeachersOfExcuse to the new engine
 * 
 * @param {string} studentId - The ID of the student
 * @param {string} dateAbsent - Date of absence (YYYY-MM-DD)
 * @param {string} studentName - Student's full name
 */
window.notifySubjectTeachersOfExcuse = async function(studentId, dateAbsent, studentName) {
    console.log('[NotificationEngine] Wrapper: Redirecting to dispatchAbsenceNotifications for excuse');
    // For excuse letters, we default to WHOLE_DAY since excuse letters 
    // typically cover the full day. The UI could be extended to allow 
    // selecting AM_HALF or PM_HALF scope.
    await dispatchAbsenceNotifications(studentId, dateAbsent, 'WHOLE_DAY', true);
};

console.log('[NotificationEngine] Attendance Notification Engine loaded successfully');
