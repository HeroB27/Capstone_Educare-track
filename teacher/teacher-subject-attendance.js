// teacher-subject-attendance.js - Colored squares, batch save, gate scan lock
let currentSubjectId = null;
let currentClassId = null;
let currentSubjectName = '';
let subjectStudents = [];
let subjectAttendance = {};      // { student_id: { id, status, hasGateScan } }
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
        const { data: subj } = await supabase.from('subject_loads').select('subject_name, class_id').eq('id', currentSubjectId).single();
        currentSubjectName = subj.subject_name;
        currentClassId = subj.class_id;
        document.getElementById('subject-name-display').innerText = currentSubjectName;
        await loadSubjectStudents();
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

function renderSubjectChecklist() {
    const tbody = document.getElementById('subject-checklist-tbody');
    if (!subjectStudents.length) { tbody.innerHTML = '<tr><td colspan="2" class="text-center py-8">No students in this class</td></tr>'; return; }
    tbody.innerHTML = subjectStudents.map(student => {
        const original = subjectAttendance[student.id] || { status: '', hasGateScan: false };
        const status = pendingUpdates[student.id] !== undefined ? pendingUpdates[student.id] : (original.status || '');
        let statusClass = 'status-empty', displayText = '—';
        switch (status) {
            case 'On Time': statusClass = 'status-present'; displayText = 'Present'; break;
            case 'Late': statusClass = 'status-late'; displayText = 'Late'; break;
            case 'Absent': statusClass = 'status-absent'; displayText = 'Absent'; break;
            case 'Excused': statusClass = 'status-excused'; displayText = 'Excused'; break;
            case 'Excused Absent': statusClass = 'status-excused-absent'; displayText = 'Excused Absent'; break;
        }
        return `<tr class="hover:bg-gray-50 transition-colors"><td class="px-4 py-2 font-medium sticky left-0 bg-white">${escapeHtml(student.full_name)}</td>
                <td class="px-4 py-2"><div class="status-square ${statusClass}" data-student="${student.id}">${displayText}</div></td></tr>`;
    }).join('');
    document.querySelectorAll('.status-square').forEach(square => {
        square.addEventListener('click', () => {
            const studentId = square.dataset.student;
            const original = subjectAttendance[studentId] || { status: '', hasGateScan: false };
            const currentStatus = pendingUpdates[studentId] !== undefined ? pendingUpdates[studentId] : (original.status || '');
            const nextStatus = getNextStatus(currentStatus);
            pendingUpdates[studentId] = nextStatus;
            renderSubjectChecklist();
        });
    });
}

function getNextStatus(current) { 
    // Cycle: blank -> Present (On Time) -> Late -> Absent -> Excused -> Excused Absent -> blank
    const order = ['', 'On Time', 'Late', 'Absent', 'Excused', 'Excused Absent']; 
    let idx = order.indexOf(current); 
    if (idx === -1) idx = 0; // Default to start (blank)
    return order[(idx + 1) % order.length]; 
}

async function saveAllPending() {
    if (Object.keys(pendingUpdates).length === 0) { showNotification('No changes to save', 'info'); return; }
    if (selectedDate > todayStr) { showNotification('Cannot mark attendance for future dates', 'error'); return; }
    
    const updates = [];
    const inserts = [];
    
    // First, check which records already exist for this date
    const studentIds = Object.keys(pendingUpdates).map(id => parseInt(id));
    const { data: existingRecords } = await supabase
        .from('attendance_logs')
        .select('id, student_id, status, subject_load_id')
        .in('student_id', studentIds)
        .eq('log_date', selectedDate);
    
    const existingMap = {};
    existingRecords?.forEach(rec => {
        existingMap[rec.student_id] = rec;
    });
    
    for (const [studentId, newStatus] of Object.entries(pendingUpdates)) {
        const studentIdInt = parseInt(studentId);
        const existing = existingMap[studentIdInt];
        
        if (existing) {
            // Record exists - update it
            updates.push({ id: existing.id, status: newStatus, subject_load_id: parseInt(currentSubjectId) });
        } else {
            // No record - insert new
            const payload = { student_id: studentIdInt, log_date: selectedDate, status: newStatus, subject_load_id: parseInt(currentSubjectId), remarks: newStatus ? `[${currentSubjectName}: ${newStatus}]` : null };
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
        for (const rec of allSaved) {
            if (rec.status === 'Late' || rec.status === 'Absent') await notifyParentAndHomeroom(rec.student_id, rec.status);
            await recomputeHomeroomAttendance(rec.student_id, selectedDate);
        }
        // Recompute half-day for affected students
        if (typeof recomputeHalfDayBatch === 'function') {
            const affected = allSaved.map(rec => ({ studentId: rec.student_id, date: selectedDate }));
            await recomputeHalfDayBatch(affected);
        }
    } catch (err) { console.error(err); showNotification('Error saving subject attendance: ' + err.message, 'error'); }
}

async function notifyParentAndHomeroom(studentId, status) {
    const student = subjectStudents.find(s => s.id == studentId);
    if (!student) return;
    if (student.parent_id) {
        const { data: existingParent } = await supabase.from('notifications').select('id').eq('recipient_id', student.parent_id).eq('type', 'attendance_alert').eq('title', `Subject Alert: ${status} in ${currentSubjectName}`).maybeSingle();
        if (!existingParent) await supabase.from('notifications').insert({ recipient_id: student.parent_id, recipient_role: 'parent', title: `Subject Alert: ${status} in ${currentSubjectName}`, message: `Your child ${escapeHtml(student.full_name)} was marked ${status} in ${currentSubjectName} on ${selectedDate}.`, type: 'attendance_alert', created_at: new Date().toISOString() });
    }
    if (homeroomTeacherId) {
        const { data: existingTeacher } = await supabase.from('notifications').select('id').eq('recipient_id', homeroomTeacherId).eq('type', 'attendance_alert').eq('title', `Subject Alert: ${status}`).maybeSingle();
        if (!existingTeacher) await supabase.from('notifications').insert({ recipient_id: homeroomTeacherId, recipient_role: 'teachers', title: `Subject Alert: ${status}`, message: `Student ${escapeHtml(student.full_name)} was marked ${status} in ${currentSubjectName} on ${selectedDate}.`, type: 'attendance_alert', created_at: new Date().toISOString() });
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