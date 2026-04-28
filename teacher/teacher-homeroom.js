// teacher-homeroom.js - Colored squares, batch save, no auto-save, gate scan locking
const USE_NEW_ATTENDANCE_LOGIC = true;

// Attendance status constants
const STATUS = window.ATTENDANCE_STATUS || {
    PRESENT: 'Present', ON_TIME: 'Present', LATE: 'Late', ABSENT: 'Absent',
    EXCUSED: 'Excused', EXCUSED_ABSENT: 'Excused Absent',
    NA: 'N/A'
};

let currentClassId = null;
let allStudents = [];
let currentAttendance = {};      // { student_id: { id, status, hasGateScan } }
let pendingUpdates = {};         // { student_id: newStatus } only for editable (non-locked)
let selectedDate = new Date().toISOString().split('T')[0];
let attendanceChannel = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.currentUser) {
        window.location.href = '../index.html';
        return;
    }
    document.getElementById('teacher-name').innerText = `Hi, ${window.currentUser.full_name?.split(' ')[0] || 'Teacher'}`;
    await loadHomeroomData();
    setupEventListeners();
    setupRealTimeSubscription();
});

async function loadHomeroomData() {
    const { data: homeroom, error: classError } = await supabase
        .from('classes')
        .select('id, grade_level, department')
        .eq('adviser_id', window.currentUser.id)
        .single();

    if (classError || !homeroom) {
        document.getElementById('homeroom-class-info').textContent = 'No Class Assigned';
        document.getElementById('student-count').textContent = '0';
        const tbody = document.getElementById('checklist-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="2" class="text-center text-red-500">No homeroom class assigned.</td></tr>';
        return;
    }

    currentClassId = homeroom.id;
    document.getElementById('homeroom-class-info').textContent = `${homeroom.grade_level} - ${homeroom.department}`;

    const { data: students } = await supabase
        .from('students')
        .select('id, full_name, parent_id')
        .eq('class_id', currentClassId)
        .eq('status', 'Enrolled')
        .order('full_name');
    allStudents = students || [];
    document.getElementById('student-count').textContent = `${allStudents.length}`;

    await fetchAttendanceForDate();
    renderChecklist();
}

async function fetchAttendanceForDate() {
    const dateInput = document.getElementById('attendance-date');
    if (dateInput) selectedDate = dateInput.value || new Date().toISOString().split('T')[0];

    // Fetch homeroom logs (no subject_load_id)
    const { data: logs } = await supabase
        .from('attendance_logs')
        .select('id, student_id, status, time_in, morning_absent, afternoon_absent')
        .eq('log_date', selectedDate)
        .is('subject_load_id', null)
        .in('student_id', allStudents.map(s => s.id));

    // Also fetch daily summary for existing morning/afternoon status
    const { data: summaries } = await supabase
        .from('attendance_daily_summary')
        .select('student_id, morning_status, afternoon_status')
        .eq('date', selectedDate)
        .in('student_id', allStudents.map(s => s.id));

    const summaryMap = {};
    summaries?.forEach(s => {
        summaryMap[s.student_id] = { morning: s.morning_status, afternoon: s.afternoon_status };
    });

    currentAttendance = {};
    logs?.forEach(log => {
        // Use summary if available, else fall back to log
        const summary = summaryMap[log.student_id];
        currentAttendance[log.student_id] = {
            id: log.id,
            morningStatus: summary?.morning || log.status || '',
            afternoonStatus: summary?.afternoon || '',
            hasGateScan: !!log.time_in
        };
    });

    // Initialize absent students from summary if no logs
    allStudents.forEach(student => {
        if (!currentAttendance[student.id] && summaryMap[student.id]) {
            currentAttendance[student.id] = {
                id: null,
                morningStatus: summaryMap[student.id].morning,
                afternoonStatus: summaryMap[student.id].afternoon,
                hasGateScan: false
            };
        }
    });

    pendingUpdates = {};
}

function renderChecklist() {
    const tbody = document.getElementById('checklist-tbody');
    if (!tbody) return;

    if (!allStudents.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center py-8">No students found.</td></tr>';
        return;
    }

    tbody.innerHTML = allStudents.map(student => {
        const original = currentAttendance[student.id] || { morningStatus: '', afternoonStatus: '', hasGateScan: false };
        const pending = pendingUpdates[student.id] || {};
        const morningStatus = pending.morning !== undefined ? pending.morning : (original.morningStatus || '');
        const afternoonStatus = pending.afternoon !== undefined ? pending.afternoon : (original.afternoonStatus || '');
        
        const morningClass = getStatusClass(morningStatus);
        const afternoonClass = getStatusClass(afternoonStatus);
        
        return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-4 py-2 font-medium sticky left-0 bg-white">
                    <span class="cursor-pointer text-blue-600 hover:underline" 
                          onclick="openStudentSubjectAttendanceModal(${student.id}, '${escapeHtml(student.full_name)}')"
                          title="View subject attendance">
                        ${escapeHtml(student.full_name)}
                    </span>
                </td>
                <td class="px-4 py-2 text-center">
                    <div class="status-square ${morningClass}"
                         data-student="${student.id}" data-half="morning">
                        ${morningStatus || '—'}
                    </div>
                </td>
                <td class="px-4 py-2 text-center">
                    <div class="status-square ${afternoonClass}"
                         data-student="${student.id}" data-half="afternoon">
                        ${afternoonStatus || '—'}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Add click handlers for status squares
    document.querySelectorAll('.status-square').forEach(square => {
        square.addEventListener('click', (e) => {
            e.stopPropagation();
            const studentId = square.dataset.student;
            const half = square.dataset.half;
            const original = currentAttendance[studentId] || { morningStatus: '', afternoonStatus: '' };
            
            const currentHalfStatus = pendingUpdates[studentId]?.[half] ?? original[half + 'Status'];
            const nextStatus = getNextStatus(currentHalfStatus);
            
            // Initialize pendingUpdates for this student if needed
            if (!pendingUpdates[studentId]) {
                pendingUpdates[studentId] = {};
            }
            pendingUpdates[studentId][half] = nextStatus;
            renderChecklist();
        });
    });
}

function getStatusClass(status) {
    switch (status) {
        case STATUS.ON_TIME: 
        case STATUS.PRESENT: return 'status-present';
        case STATUS.LATE: return 'status-late';
        case STATUS.ABSENT: return 'status-absent';
        case STATUS.EXCUSED: return 'status-excused';
        case STATUS.EXCUSED_ABSENT: return 'status-excused-absent';
        case STATUS.NA: return 'status-empty';
        default: return 'status-empty';
    }
}

function getNextStatus(current) { 
    // Cycle: blank -> Present (On Time) -> Late -> Absent -> Excused -> Excused Absent -> blank
    const order = ['', STATUS.ON_TIME, STATUS.LATE, STATUS.ABSENT, STATUS.EXCUSED, STATUS.EXCUSED_ABSENT]; 
    let idx = order.indexOf(current); 
    if (idx === -1) idx = 0; // Default to start (blank)
    return order[(idx + 1) % order.length]; 
}

async function saveAllPending() {
    if (Object.keys(pendingUpdates).length === 0) {
        showNotification('No changes to save', 'info');
        return;
    }

    // VALIDATION: Prevent future date edits
    const selectedDateObj = new Date(selectedDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    
    if (selectedDateObj > today) {
        showNotification('Cannot edit attendance for future dates', 'error');
        return;
    }

    if (USE_NEW_ATTENDANCE_LOGIC) {
        await saveHomeroomStatusV2();
    } else {
        await saveHomeroomStatusLegacy();
    }
}

async function saveHomeroomStatusV2() {
    console.log('[TeacherHomeroom] Using new attendance logic');
    
    // Process each student with their updates
    const logUpserts = [];
    const summaryUpserts = [];
    
    for (const [studentIdStr, updates] of Object.entries(pendingUpdates)) {
        const studentId = parseInt(studentIdStr);
        const original = currentAttendance[studentId] || {};
        
        const morningStatus = updates.morning !== undefined ? updates.morning : original.morningStatus;
        const afternoonStatus = updates.afternoon !== undefined ? updates.afternoon : original.afternoonStatus;
        
        // Determine combined status for logs (use morning status as primary)
        const logStatus = morningStatus || STATUS.PRESENT;
        
        // Determine half-day absent flags based on overridden statuses
        const morningAbsent = (morningStatus === STATUS.ABSENT);
        const afternoonAbsent = (afternoonStatus === STATUS.ABSENT);

        // Upsert to attendance_logs for audit trail, including half-day flags
        const payload = {
            student_id: studentId,
            log_date: selectedDate,
            status: logStatus,
            time_in: original.hasGateScan ? '08:00:00' : null,
            morning_absent: morningAbsent,
            afternoon_absent: afternoonAbsent
        };
        if (original.id) payload.id = original.id;
        logUpserts.push(payload);
        
        // Upsert to attendance_daily_summary with both statuses
        summaryUpserts.push({
            student_id: studentId,
            date: selectedDate,
            morning_status: morningStatus || STATUS.PRESENT,
            afternoon_status: afternoonStatus || (morningStatus === STATUS.NA ? STATUS.NA : STATUS.PRESENT),
            last_modified_by: window.currentUser.full_name,
            last_modified_at: new Date().toISOString()
        });
        
        // Notify parent if morning changed to Absent
        if (morningStatus === 'Absent' || morningStatus === 'Late') {
            await notifyParentOfAbsence(studentId, selectedDate, morningStatus);
        }
    }

    if (logUpserts.length === 0) {
        showNotification('No changes to save', 'info');
        return;
    }

    try {
        // Upsert logs for audit trail
        if (logUpserts.length > 0) {
            await supabase
                .from('attendance_logs')
                .upsert(logUpserts, { onConflict: 'student_id, log_date' });
        }

        // Upsert daily summary (primary record)
        if (summaryUpserts.length > 0) {
            await supabase
                .from('attendance_daily_summary')
                .upsert(summaryUpserts, { onConflict: 'student_id, date' });
        }

        // Recompute half-day flags (with error handling)
        for (const upd of logUpserts) {
            try {
                if (typeof recomputeHalfDayStatus === 'function') {
                    await recomputeHalfDayStatus(upd.student_id, selectedDate);
                }
            } catch (recErr) {
                console.warn('[TeacherHomeroom] Half-day recompute failed for student ' + upd.student_id + ':', recErr);
            }
        }

        await fetchAttendanceForDate();
        pendingUpdates = {};
        renderChecklist();
        showNotification('Homeroom attendance saved! (morning & afternoon updated)', 'success');
    } catch (err) {
        console.error(err);
        showNotification('Error saving attendance', 'error');
    }
}

async function saveHomeroomStatusLegacy() {
    const upserts = [];
    
    // Handle both old format (string) and new format (object)
    for (const [studentId, value] of Object.entries(pendingUpdates)) {
        const original = currentAttendance[studentId] || {};
        const originalAm = original.morningStatus || original.status || '';
        const status = (typeof value === 'string') ? value : (value?.morning || originalAm);
        
        const payload = {
            student_id: parseInt(studentId),
            log_date: selectedDate,
            status: status || null,
            time_in: original.hasGateScan ? '08:00:00' : null
        };
        if (original.id) payload.id = original.id;
        upserts.push(payload);
    }

    if (upserts.length === 0) {
        showNotification('No changes to save', 'info');
        return;
    }

    try {
        const { error } = await supabase
            .from('attendance_logs')
            .upsert(upserts, { onConflict: 'student_id, log_date' });

        if (error) throw error;

        await fetchAttendanceForDate();
        pendingUpdates = {};
        renderChecklist();
        showNotification('Homeroom attendance successfully saved!', 'success');

        for (const upd of upserts) {
            if (upd.status === STATUS.LATE || upd.status === STATUS.ABSENT) {
                await notifyParentOfAbsence(upd.student_id, upd.log_date, upd.status);
            }
        }
    } catch (err) {
        console.error(err);
        showNotification('Error saving attendance', 'error');
    }
}

async function notifyParentOfAbsence(studentId, date, status) {
    const student = allStudents.find(s => s.id == studentId);
    if (!student?.parent_id) return;

    // Use centralized createNotification if available
    if (typeof window.createNotification === 'function') {
        const title = `Attendance Alert: ${status}`;
        const message = `Your child ${escapeHtml(student.full_name)} was marked ${status} on ${date}.`;
        await window.createNotification(student.parent_id, 'parent', title, message, 'attendance_alert');
        return;
    }

    // Fallback: inline with duplicate check
    const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('recipient_id', student.parent_id)
        .eq('type', 'attendance_alert')
        .eq('title', `Attendance Alert: ${status}`)
        .maybeSingle();

    if (existing) return;

    await supabase.from('notifications').insert({
        recipient_id: student.parent_id,
        recipient_role: 'parent',
        title: `Attendance Alert: ${status}`,
        message: `Your child ${escapeHtml(student.full_name)} was marked ${status} on ${date}.`,
        type: 'attendance_alert',
        created_at: new Date().toISOString()
    });
}

function setupRealTimeSubscription() {
    if (attendanceChannel) supabase.removeChannel(attendanceChannel);
    attendanceChannel = supabase.channel('homeroom-realtime')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'attendance_logs',
            filter: `log_date=eq.${selectedDate}`
        }, async () => {
            await fetchAttendanceForDate();
            pendingUpdates = {};
            renderChecklist();
            showNotification('Gate scan detected – list updated', 'info');
        })
        .subscribe();
}

function setupEventListeners() {
    const dateInput = document.getElementById('attendance-date');
    if (dateInput) {
        dateInput.value = selectedDate;
        dateInput.addEventListener('change', async () => {
            selectedDate = dateInput.value;
            await fetchAttendanceForDate();
            pendingUpdates = {};
            renderChecklist();
            setupRealTimeSubscription();
        });
    }

    const saveBtn = document.getElementById('save-attendance-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveAllPending);

    const viewTableBtn = document.getElementById('view-table-btn');
    if (viewTableBtn) {
        viewTableBtn.addEventListener('click', () => {
            window.location.href = 'teacher-homeroom-table.html';
        });
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

/**
 * Open modal to view student's subject attendance breakdown
 */
async function openStudentSubjectAttendanceModal(studentId, studentName) {
    const modal = document.getElementById('student-subject-modal');
    if (!modal) {
        showNotification('Modal not found', 'error');
        return;
    }
    
    // Set default date range (current month)
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const fromDate = firstDayOfMonth.toISOString().split('T')[0];
    const toDate = today.toISOString().split('T')[0];
    
    // Update modal title
    document.getElementById('student-subject-modal-title').textContent = `Subject Attendance - ${escapeHtml(studentName)}`;
    document.getElementById('student-subject-from-date').value = fromDate;
    document.getElementById('student-subject-to-date').value = toDate;
    document.getElementById('student-subject-modal').dataset.studentId = studentId;
    
    // Show modal
    modal.classList.remove('hidden');
    
    // Load initial data
    await loadStudentSubjectAttendanceData(studentId, fromDate, toDate);
}

/**
 * Load student subject attendance data for date range
 */
async function loadStudentSubjectAttendanceData(studentId, fromDate, toDate) {
    const tbody = document.getElementById('student-subject-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="10" class="text-center py-4">Loading...</td></tr>';
    
    try {
        // Get student's class
        const { data: student } = await supabase
            .from('students')
            .select('class_id')
            .eq('id', studentId)
            .single();
        
        if (!student?.class_id) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-red-500">Student class not found</td></tr>';
            return;
        }
        
        // Get all subject loads for this class
        const { data: subjectLoads } = await supabase
            .from('subject_loads')
            .select('id, subject_name')
            .eq('class_id', student.class_id);
        
        // Get attendance logs for this student in date range
        const { data: logs } = await supabase
            .from('attendance_logs')
            .select('id, log_date, status, subject_load_id')
            .eq('student_id', studentId)
            .gte('log_date', fromDate)
            .lte('log_date', toDate)
            .not('subject_load_id', 'is', null)
            .order('log_date');
        
        // Build date range array
        const dates = [];
        const current = new Date(fromDate);
        const end = new Date(toDate);
        while (current <= end) {
            dates.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
        }
        
        // Build subject → date matrix
        const subjectDataMap = {};
        subjectLoads?.forEach(sl => {
            subjectDataMap[sl.id] = { subject_name: sl.subject_name, dates: {} };
        });
        
        logs?.forEach(log => {
            if (subjectDataMap[log.subject_load_id]) {
                subjectDataMap[log.subject_load_id].dates[log.log_date] = log.status;
            }
        });
        
        // Render table
        let html = '';
        
        // Header row with dates (limit to last 14 days for display)
        const displayDates = dates.slice(-14);
        
        html += `<tr><th class="px-2 py-2 text-left bg-gray-100 sticky left-0">Subject</th>`;
        displayDates.forEach(d => {
            const dateObj = new Date(d);
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            const dayNum = dateObj.getDate();
            html += `<th class="px-1 py-2 text-xs text-center bg-gray-100">${dayName}<br>${dayNum}</th>`;
        });
        html += `<th class="px-2 py-2 text-left bg-gray-100">Pattern</th></tr>`;
        
        // Data rows
        const subjectLoadsList = Object.entries(subjectDataMap);
        
        if (subjectLoadsList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center py-4">No subjects found for this class</td></tr>';
            return;
        }
        
        for (const [loadId, data] of subjectLoadsList) {
            html += `<tr><td class="px-2 py-2 font-medium sticky left-0 bg-white">${escapeHtml(data.subject_name)}</td>`;
            
            let lateCount = 0;
            let absentCount = 0;
            let presentCount = 0;
            
            displayDates.forEach(d => {
                const status = data.dates[d];
                let cellClass = 'status-empty';
                let displayText = '—';
                
                if (status) {
                    switch (status) {
                        case 'On Time':
                        case 'Present': cellClass = 'status-present'; displayText = 'P'; presentCount++; break;
                        case 'Late': cellClass = 'status-late'; displayText = 'L'; lateCount++; break;
                        case 'Absent': cellClass = 'status-absent'; displayText = 'A'; absentCount++; break;
                        case 'Excused': cellClass = 'status-excused'; displayText = 'E'; presentCount++; break;
                        case 'Excused Absent': cellClass = 'status-excused-absent'; displayText = 'EA'; presentCount++; break;
                        default: displayText = '?';
                    }
                }
                
                html += `<td class="px-1 py-2 text-center"><div class="status-square ${cellClass} text-xs">${displayText}</div></td>`;
            });
            
            // Calculate pattern
            const totalDays = displayDates.length;
            let pattern = 'OK';
            let patternClass = 'text-green-600';
            
            if (lateCount > 3) {
                pattern = `Late (${lateCount})`;
                patternClass = 'text-orange-600';
            }
            if (absentCount > 0 && (absentCount / totalDays) > 0.2) {
                pattern = `High absence (${absentCount})`;
                patternClass = 'text-red-600';
            } else if (absentCount > 0) {
                pattern = `Absent (${absentCount})`;
                patternClass = 'text-yellow-600';
            }
            
            html += `<td class="px-2 py-2 text-sm ${patternClass}">${pattern}</td></tr>`;
        }
        
        tbody.innerHTML = html;
        
    } catch (err) {
        console.error('Error loading student subject attendance:', err);
        tbody.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-red-500">Error loading data</td></tr>';
    }
}

/**
 * Close the student subject attendance modal
 */
function closeStudentSubjectModal() {
    const modal = document.getElementById('student-subject-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Apply date range filter in modal
 */
async function applyStudentSubjectDateFilter() {
    const modal = document.getElementById('student-subject-modal');
    if (!modal) return;
    
    const studentId = modal.dataset.studentId;
    const fromDate = document.getElementById('student-subject-from-date').value;
    const toDate = document.getElementById('student-subject-to-date').value;
    
    if (!studentId || !fromDate || !toDate) {
        showNotification('Please select valid date range', 'error');
        return;
    }
    
    await loadStudentSubjectAttendanceData(parseInt(studentId), fromDate, toDate);
}

// Use general-core showNotification (has modal support)

// Export functions to window for HTML onclick handlers
window.renderChecklist = renderChecklist;
window.getNextStatus = getNextStatus;
window.saveAllPending = saveAllPending;
window.escapeHtml = escapeHtml;
window.showNotification = showNotification;
window.openStudentSubjectAttendanceModal = openStudentSubjectAttendanceModal;
window.closeStudentSubjectModal = closeStudentSubjectModal;
window.applyStudentSubjectDateFilter = applyStudentSubjectDateFilter;