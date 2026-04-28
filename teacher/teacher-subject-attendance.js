// teacher-subject-attendance.js - Colored squares, batch save, gate scan lock
const ENABLE_SUBJECT_AUTOINIT = true; // Feature flag: auto-initialization from homeroom

// Attendance status constants
const STATUS = window.ATTENDANCE_STATUS || {
    PRESENT: 'Present', ON_TIME: 'Present', LATE: 'Late', ABSENT: 'Absent',
    EXCUSED: 'Excused', EXCUSED_ABSENT: 'Excused Absent',
    NA: 'N/A'
};

let currentSubjectId = null;
let currentClassId = null;
let currentSubjectName = '';
let currentTimeSlot = 'morning'; // morning or afternoon
let subjectStudents = [];
let subjectAttendance = {};      // { student_id: { id, status, hasGateScan } }
let initialAutoFillStatuses = {}; // { student_id: 'Present' | 'Absent' } - tracks auto-filled from homeroom
let pendingUpdates = {};
let selectedDate = new Date().toISOString().split('T')[0];
const todayStr = new Date().toISOString().split('T')[0];
let homeroomTeacherId = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.currentUser) { window.location.href = '../index.html'; return; }
    document.getElementById('teacher-name').innerText = `Hi, ${window.currentUser.full_name?.split(' ')[0] || 'Teacher'}`;
    await loadSubjectList();
    setupEvents();
});

async function loadSubjectList() {
    const { data: loads } = await supabase
        .from('subject_loads')
        .select('id, subject_name, class_id, classes(adviser_id)')
        .eq('teacher_id', window.currentUser.id);
    const select = document.getElementById('subject-select');
    select.innerHTML = '<option value="">-- Select Subject --</option>';
    loads?.forEach(load => {
        const option = document.createElement('option');
        option.value = load.id;
        option.textContent = `${load.subject_name} (Class ${load.class_id})`;
        select.appendChild(option);
        if (load.classes) homeroomTeacherId = load.classes.adviser_id;
    });
}

function setupEvents() {
    document.getElementById('subject-select').addEventListener('change', async () => {
        currentSubjectId = document.getElementById('subject-select').value;
        if (!currentSubjectId) return;
        const { data: subj } = await supabase.from('subject_loads').select('subject_name, class_id, time_slot').eq('id', currentSubjectId).single();
        currentSubjectName = subj.subject_name;
        currentClassId = subj.class_id;
        currentTimeSlot = subj.time_slot || 'morning';
        document.getElementById('subject-name-display').innerText = currentSubjectName;
        await loadSubjectStudents();
        // Auto-initialize from homeroom attendance (if feature enabled)
        if (ENABLE_SUBJECT_AUTOINIT) {
            await loadInitialSubjectAttendance();
        }
        await loadSubjectAttendance();
        pendingUpdates = {};
        renderSubjectChecklist();
    });

    const dateInput = document.getElementById('attendance-date');
    if (dateInput) {
        dateInput.value = selectedDate;
    dateInput.addEventListener('change', async () => {
        selectedDate = dateInput.value;
        if (currentSubjectId) {
            // Auto-initialize from homeroom attendance (if feature enabled)
            if (ENABLE_SUBJECT_AUTOINIT) {
                await loadInitialSubjectAttendance();
            }
            await loadSubjectAttendance();
            pendingUpdates = {};
            renderSubjectChecklist();
        }
    });
    }

    document.getElementById('save-subject-attendance-btn')?.addEventListener('click', saveAllPending);
    document.getElementById('view-subject-table-btn')?.addEventListener('click', () => { window.location.href = 'teacher-subject-attendance-table.html'; });
}

async function loadSubjectStudents() {
    const { data } = await supabase.from('students').select('id, full_name, parent_id').eq('class_id', currentClassId).eq('status', 'Enrolled').order('full_name');
    subjectStudents = data || [];
}

async function loadSubjectAttendance() {
    if (!subjectStudents.length) return;
    const { data: logs } = await supabase.from('attendance_logs').select('id, student_id, status, time_in').eq('log_date', selectedDate).in('student_id', subjectStudents.map(s => s.id));
    subjectAttendance = {};
    logs?.forEach(log => { subjectAttendance[log.student_id] = { id: log.id, status: log.status || '', hasGateScan: !!log.time_in }; });
}

/**
 * Auto-initialize subject attendance from homeroom (morning/afternoon) status.
 * This provides pre-filled suggestions based on whether the student was present in the morning/afternoon session.
 * 
 * Improved logic (per spec):
 * 1. Ensure attendance_daily_summary exists for these students (targeted sync)
 * 2. Fetch homeroom summary (morning or afternoon depending on subject time_slot)
 * 3. Fetch existing subject attendance logs for this subject+date
 * 4. Merge: existing log status > auto-fill from homeroom > default Present
 */
async function loadInitialSubjectAttendance() {
    if (!subjectStudents.length || !selectedDate) {
        initialAutoFillStatuses = {};
        return;
    }

    // STEP 1: Ensure daily summary exists for these students (targeted, not full sync)
    // We only sync for students in this class to avoid heavy operation
    if (typeof syncStudentDailySummary === 'function') {
        for (const student of subjectStudents) {
            await syncStudentDailySummary(student.id, selectedDate);
        }
    }

    const studentIds = subjectStudents.map(s => s.id);
    const isMorningSubject = currentTimeSlot === 'morning';

    // STEP 2: Get daily summary for the selected date
    const { data: summaries } = await supabase
        .from('attendance_daily_summary')
        .select('student_id, morning_status, afternoon_status')
        .in('student_id', studentIds)
        .eq('date', selectedDate);

    const summaryMap = {};
    summaries?.forEach(s => {
        summaryMap[s.student_id] = { morning: s.morning_status, afternoon: s.afternoon_status };
    });

    // STEP 3: Get existing subject attendance logs for this subject+date (to respect manual overrides)
    const { data: existingLogs } = await supabase
        .from('attendance_logs')
        .select('student_id, status')
        .eq('subject_load_id', currentSubjectId)
        .eq('log_date', selectedDate);

    const existingMap = new Map();
    existingLogs?.forEach(log => {
        existingMap.set(log.student_id, log.status);
    });

    // STEP 4: Build initial statuses
    initialAutoFillStatuses = {};
    for (const student of subjectStudents) {
        const summary = summaryMap[student.id];
        const homeroomStatus = isMorningSubject ? summary?.morning_status : summary?.afternoon_status;

        // Priority order:
        // 1. If existing log for this subject today → use that (teacher already saved)
        // 2. Else if homeroom status is 'Absent' → prefill 'Absent'
        // 3. Else if homeroom status in ('Present','Late','Excused') → prefill 'Present' (On Time)
        // 4. Else (no summary) → default 'Present' (teacher will fill)

        let suggestedStatus = STATUS.ON_TIME; // Default

        if (existingMap.has(student.id)) {
            // Already have subject attendance saved - keep it
            suggestedStatus = existingMap.get(student.id);
        } else if (homeroomStatus === STATUS.ABSENT) {
            suggestedStatus = STATUS.ABSENT;
        } else if (homeroomStatus && [STATUS.PRESENT, STATUS.LATE, STATUS.EXCUSED].includes(homeroomStatus)) {
            suggestedStatus = STATUS.ON_TIME; // Present
        } else {
            // No summary or unknown status → default Present (teacher to mark)
            suggestedStatus = STATUS.ON_TIME;
        }

        initialAutoFillStatuses[student.id] = suggestedStatus;
    }

    console.log('[SubjectAttendance] Auto-initialized for ' + Object.keys(initialAutoFillStatuses).length + ' students, time_slot: ' + currentTimeSlot);
}

function renderSubjectChecklist() {
    const tbody = document.getElementById('subject-checklist-tbody');
    if (!subjectStudents.length) { tbody.innerHTML = '<tr><td colspan="2" class="text-center py-8">No students in this class</td></tr>'; return; }
    tbody.innerHTML = subjectStudents.map(student => {
        const original = subjectAttendance[student.id] || { status: '', hasGateScan: false };
        // Priority: pending update > existing record > auto-fill
        const autoFill = initialAutoFillStatuses[student.id];
        const status = pendingUpdates[student.id] !== undefined ? pendingUpdates[student.id] : (original.status || autoFill || '');
        
        // Determine auto-fill indicator
        const hasExistingRecord = !!original.status;
        const isAutoFilled = !hasExistingRecord && autoFill && status === autoFill;
        const autoFillIcon = isAutoFilled ? '<span class="text-gray-400 text-xs ml-1" title="Auto-filled from homeroom">⟳</span>' : '';
        
        let statusClass = 'status-empty', displayText = '—';
        switch (status) {
            case STATUS.ON_TIME: statusClass = 'status-present'; displayText = 'Present'; break;
            case STATUS.LATE: statusClass = 'status-late'; displayText = 'Late'; break;
            case STATUS.ABSENT: statusClass = 'status-absent'; displayText = 'Absent'; break;
            case STATUS.EXCUSED: statusClass = 'status-excused'; displayText = 'Excused'; break;
            case STATUS.EXCUSED_ABSENT: statusClass = 'status-excused-absent'; displayText = 'Excused Absent'; break;
        }
        return `<tr class="hover:bg-gray-50 transition-colors"><td class="px-4 py-2 font-medium sticky left-0 bg-white">${escapeHtml(student.full_name)}${autoFillIcon}</td>
                <td class="px-4 py-2"><div class="status-square ${statusClass}" data-student="${student.id}">${displayText}</div></td></tr>`;
    }).join('');
    document.querySelectorAll('.status-square').forEach(square => {
        square.addEventListener('click', () => {
            const studentId = square.dataset.student;
            const original = subjectAttendance[studentId] || { status: '', hasGateScan: false };
            const autoFill = initialAutoFillStatuses[studentId];
            const currentStatus = pendingUpdates[studentId] !== undefined ? pendingUpdates[studentId] : (original.status || autoFill || '');
            const nextStatus = getNextStatus(currentStatus);
            pendingUpdates[studentId] = nextStatus;
            renderSubjectChecklist();
        });
    });
}

function getNextStatus(current) { 
    // Cycle: blank -> Present (On Time) -> Late -> Absent -> Excused -> Excused Absent -> blank
    const order = ['', STATUS.ON_TIME, STATUS.LATE, STATUS.ABSENT, STATUS.EXCUSED, STATUS.EXCUSED_ABSENT]; 
    let idx = order.indexOf(current); 
    if (idx === -1) idx = 0; // Default to start (blank)
    return order[(idx + 1) % order.length]; 
}

async function saveAllPending() {
    // Build list of students to save: pending updates + auto-filled (if no existing record)
    const studentsToSave = [];
    
    // First, add all students with pending updates
    for (const [studentId, newStatus] of Object.entries(pendingUpdates)) {
        studentsToSave.push({ studentId: parseInt(studentId), status: newStatus, hasPendingUpdate: true });
    }
    
    // Then, add students with auto-fill but no existing record AND no pending update
    for (const student of subjectStudents) {
        const existing = subjectAttendance[student.id];
        const hasPending = pendingUpdates[student.id] !== undefined;
        const autoFill = initialAutoFillStatuses[student.id];
        
        if (!existing && !hasPending && autoFill) {
            // Auto-filled and no manual change - save the auto-fill
            studentsToSave.push({ studentId: student.id, status: autoFill, hasPendingUpdate: false });
        }
    }
    
    if (studentsToSave.length === 0) { showNotification('No changes to save', 'info'); return; }
    if (selectedDate > todayStr) { showNotification('Cannot mark attendance for future dates', 'error'); return; }
    
    const updates = [];
    const inserts = [];
    
    // First, check which records already exist for this date
    const studentIds = studentsToSave.map(s => s.studentId);
    const { data: existingRecords } = await supabase
        .from('attendance_logs')
        .select('id, student_id, status, subject_load_id')
        .in('student_id', studentIds)
        .eq('log_date', selectedDate);
    
    const existingMap = {};
    existingRecords?.forEach(rec => {
        existingMap[rec.student_id] = rec;
    });
    
    for (const { studentId, status: newStatus } of studentsToSave) {
        const existing = existingMap[studentId];
        
        if (existing) {
            // Record exists - update it
            updates.push({ id: existing.id, status: newStatus, subject_load_id: parseInt(currentSubjectId) });
        } else {
            // No record - insert new
            const payload = { student_id: studentId, log_date: selectedDate, status: newStatus, subject_load_id: parseInt(currentSubjectId), remarks: newStatus ? `[${currentSubjectName}: ${newStatus}]` : null };
            inserts.push(payload);
        }
    }
    
    if (updates.length === 0 && inserts.length === 0) { showNotification('No changes to save', 'info'); return; }
    try {
        for (const upd of updates) {
            const { error } = await supabase.from('attendance_logs').update({ status: upd.status, subject_load_id: upd.subject_load_id }).eq('id', upd.id);
            if (error) throw error;
        }
        if (inserts.length) {
            const { error } = await supabase.from('attendance_logs').insert(inserts);
            if (error) throw error;
        }
        await loadSubjectAttendance();
        pendingUpdates = {};
        renderSubjectChecklist();
        showNotification(`Attendance successfully saved for ${currentSubjectName}!`, 'success');
        const allSaved = [...updates, ...inserts];

        // Process each saved record
        for (const rec of allSaved) {
            // Notify parents/homeroom for Late/Absent
            if (rec.status === STATUS.LATE || rec.status === STATUS.ABSENT) {
                await notifyParentAndHomeroom(rec.student_id, rec.status);
            }

            // Update homeroom attendance flags (morning_absent/afternoon_absent)
            await recomputeHomeroomAttendance(rec.student_id, selectedDate);

            // CRITICAL: Directly update attendance_daily_summary to keep it in sync
            // This ensures analytics see the latest subject attendance immediately
            if (typeof syncStudentDailySummary === 'function') {
                await syncStudentDailySummary(rec.student_id, selectedDate);
            }
        }

        // Also batch recompute half-day (redundant but safe)
        if (typeof recomputeHalfDayBatch === 'function') {
            const affected = allSaved.map(rec => ({ studentId: rec.student_id, date: selectedDate }));
            await recomputeHalfDayBatch(affected);
        }
    } catch (err) { console.error(err); showNotification('Error saving subject attendance: ' + err.message, 'error'); }
}

async function notifyParentAndHomeroom(studentId, status) {
    const student = subjectStudents.find(s => s.id == studentId);
    if (!student) return;

    // Use centralized notification if available
    const notify = typeof window.createNotification === 'function' 
        ? window.createNotification 
        : async (recipientId, role, title, message, type) => {
            // Fallback: simple insert with duplicate check inline
            const { data: existing } = await supabase.from('notifications')
                .select('id')
                .eq('recipient_id', recipientId)
                .eq('type', type)
                .eq('title', title)
                .maybeSingle();
            if (!existing) {
                await supabase.from('notifications').insert({
                    recipient_id: recipientId,
                    recipient_role: role,
                    title,
                    message,
                    type,
                    created_at: new Date().toISOString()
                });
            }
          };

    // Notify parent
    if (student.parent_id) {
        const parentTitle = `Subject Alert: ${status} in ${currentSubjectName}`;
        const parentMessage = `Your child ${escapeHtml(student.full_name)} was marked ${status} in ${currentSubjectName} on ${selectedDate}.`;
        await notify(student.parent_id, 'parent', parentTitle, parentMessage, 'attendance_alert');
    }

    // Notify homeroom teacher
    if (homeroomTeacherId) {
        const teacherTitle = `Subject Alert: ${status}`;
        const teacherMessage = `Student ${escapeHtml(student.full_name)} was marked ${status} in ${currentSubjectName} on ${selectedDate}.`;
        await notify(homeroomTeacherId, 'teacher', teacherTitle, teacherMessage, 'attendance_alert');
    }
}

function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }
// Use general-core showNotification (has modal support)

async function recomputeHomeroomAttendance(studentId, date) {
    const { data: logs } = await supabase
        .from('attendance_logs')
        .select('id, status, subject_load_id')
        .eq('student_id', studentId)
        .eq('log_date', date)
        .not('subject_load_id', 'is', null);
    
    if (!logs || logs.length === 0) return;
    
    const { data: loads } = await supabase
        .from('subject_loads')
        .select('id, time_slot')
        .in('id', logs.map(l => l.subject_load_id));
    
    const loadMap = new Map(loads?.map(l => [l.id, l.time_slot]) || []);
    
    let morningAbsent = false;
    let afternoonAbsent = false;
    
    for (const log of logs) {
        const timeSlot = loadMap.get(log.subject_load_id) || 'morning';
        // Both Absent and Late count as not present for half-day calculation
        if (log.status === 'Absent' || log.status === 'Late') {
            if (timeSlot === 'morning') morningAbsent = true;
            if (timeSlot === 'afternoon') afternoonAbsent = true;
        }
    }
    
    const { data: existingHomeroom } = await supabase
        .from('attendance_logs')
        .select('id, time_in')
        .eq('student_id', studentId)
        .eq('log_date', date)
        .is('subject_load_id', null)
        .single();
    
    if (existingHomeroom) {
        await supabase
            .from('attendance_logs')
            .update({ morning_absent: morningAbsent, afternoon_absent: afternoonAbsent })
            .eq('id', existingHomeroom.id);
    } else {
        await supabase
            .from('attendance_logs')
            .insert({ student_id: studentId, log_date: date, status: 'On Time', morning_absent: morningAbsent, afternoon_absent: afternoonAbsent });
    }
}

function exportSubjectAttendanceToCSV() {
    if (!subjectStudents.length || !currentSubjectName) {
        showNotification('No data to export', 'info');
        return;
    }
    
    let csv = `Subject Attendance - ${currentSubjectName}\n`;
    csv += `Date: ${selectedDate}\n\n`;
    csv += 'Student Name,Status\n';
    
for (const student of subjectStudents) {
        const original = subjectAttendance[student.id] || { status: '' };
        const status = pendingUpdates[student.id] !== undefined ? pendingUpdates[student.id] : (original.status || '');
        csv += `"${student.full_name}",${status || '(blank)'}\n`;
    }
    
    // Add summary - count all statuses
    const counts = { 'On Time': 0, 'Late': 0, 'Absent': 0, 'Excused': 0, '': 0 };
    for (const student of subjectStudents) {
        const original = subjectAttendance[student.id] || { status: '' };
        const status = pendingUpdates[student.id] !== undefined ? pendingUpdates[student.id] : original.status;
        counts[status] = (counts[status] || 0) + 1;
    }
    
    csv += `\nSummary\n`;
    csv += `Status,Count\n`;
    csv += `Present (On Time),${counts['On Time']}\n`;
    csv += `Late,${counts['Late']}\n`;
    csv += `Absent,${counts['Absent']}\n`;
    csv += `Excused,${counts['Excused']}\n`;
    csv += `Total,${subjectStudents.length}\n`;
    
    const attendanceRate = ((counts['On Time'] + counts['Late'] + counts['Excused']) / subjectStudents.length * 100).toFixed(1);
    csv += `Attendance Rate,${attendanceRate}%\n`;
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Subject_Attendance_${currentSubjectName}_${selectedDate}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showNotification('Subject attendance exported to CSV', 'success');
}

// Export functions to window for HTML onclick handlers
window.renderSubjectChecklist = renderSubjectChecklist;
window.getNextStatus = getNextStatus;
window.escapeHtml = escapeHtml;
window.showNotification = showNotification;
window.exportSubjectAttendanceToCSV = exportSubjectAttendanceToCSV;