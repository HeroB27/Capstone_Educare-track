// teacher-subject-attendance.js - Colored squares, batch save, no auto-save
let currentSubjectId = null;
let currentClassId = null;
let currentSubjectName = '';
let subjectStudents = [];
let subjectAttendance = {};      // { student_id: { id, status, hasGateScan } }
let pendingUpdates = {};         // { student_id: newStatus }
let selectedDate = new Date().toISOString().split('T')[0];
let homeroomTeacherId = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.currentUser) {
        window.location.href = '../index.html';
        return;
    }
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
    document.getElementById('load-subject').addEventListener('click', async () => {
        currentSubjectId = document.getElementById('subject-select').value;
        if (!currentSubjectId) return;

        const { data: subj } = await supabase
            .from('subject_loads')
            .select('subject_name, class_id')
            .eq('id', currentSubjectId)
            .single();

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

    const saveBtn = document.getElementById('save-subject-attendance-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveAllPending);

    const viewTableBtn = document.getElementById('view-subject-table-btn');
    if (viewTableBtn) {
        viewTableBtn.addEventListener('click', () => {
            window.location.href = 'teacher-subject-attendance-table.html';
        });
    }
}

async function loadSubjectStudents() {
    const { data } = await supabase
        .from('students')
        .select('id, full_name, parent_id')
        .eq('class_id', currentClassId)
        .eq('status', 'Enrolled')
        .order('full_name');
    subjectStudents = data || [];
}

async function loadSubjectAttendance() {
    if (!subjectStudents.length) return;
    const { data: logs } = await supabase
        .from('attendance_logs')
        .select('id, student_id, status, time_in')
        .eq('log_date', selectedDate)
        .in('student_id', subjectStudents.map(s => s.id));

    subjectAttendance = {};
    logs?.forEach(log => {
        subjectAttendance[log.student_id] = {
            id: log.id,
            status: log.status || 'Absent',
            hasGateScan: !!log.time_in
        };
    });
}

function renderSubjectChecklist() {
    const tbody = document.getElementById('subject-checklist-tbody');
    if (!subjectStudents.length) {
        tbody.innerHTML = '<tr><td colspan="2" class="text-center py-8">No students in this class</td></tr>';
        return;
    }

    tbody.innerHTML = subjectStudents.map(student => {
        const original = subjectAttendance[student.id] || { status: 'Absent', hasGateScan: false };
        const isLocked = original.hasGateScan === true;
        const status = pendingUpdates[student.id] !== undefined ? pendingUpdates[student.id] : original.status;
        let bgColor = '', displayText = '';
        switch (status) {
            case 'On Time': bgColor = 'bg-green-500'; displayText = 'Present'; break;
            case 'Late': bgColor = 'bg-orange-500'; displayText = 'Late'; break;
            case 'Absent': bgColor = 'bg-red-500'; displayText = 'Absent'; break;
            case 'Excused': bgColor = 'bg-blue-500'; displayText = 'Excused'; break;
            default: bgColor = 'bg-gray-300'; displayText = '—';
        }
        const lockClass = isLocked ? 'locked-square opacity-60' : '';
        const lockIcon = isLocked ? '🔒 ' : '';
        return `
            <tr class="border-b">
                <td class="px-4 py-3 font-medium sticky left-0 bg-white">${lockIcon}${escapeHtml(student.full_name)}</td>
                <td class="px-4 py-3">
                    <div class="status-square ${bgColor} ${lockClass} text-white"
                         data-student="${student.id}" data-locked="${isLocked}">
                        ${displayText}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Attach click handlers (only if not locked)
    document.querySelectorAll('.status-square').forEach(square => {
        const isLocked = square.dataset.locked === 'true';
        if (isLocked) return;
        square.addEventListener('click', async (e) => {
            e.stopPropagation();
            const studentId = square.dataset.student;
            const original = subjectAttendance[studentId] || { status: 'Absent', hasGateScan: false };
            const currentStatus = pendingUpdates[studentId] !== undefined ? pendingUpdates[studentId] : original.status;
            const nextStatus = getNextStatus(currentStatus);
            pendingUpdates[studentId] = nextStatus;
            renderSubjectChecklist();
        });
    });
}

function getNextStatus(current) {
    const order = ['On Time', 'Late', 'Absent', 'Excused'];
    let idx = order.indexOf(current);
    if (idx === -1) idx = 0;
    return order[(idx + 1) % order.length];
}

async function saveAllPending() {
    if (Object.keys(pendingUpdates).length === 0) {
        showNotification('No changes to save', 'info');
        return;
    }

    const upserts = [];
    for (const [studentId, newStatus] of Object.entries(pendingUpdates)) {
        const original = subjectAttendance[studentId] || {};
        if (original.hasGateScan) continue;
        const payload = {
            student_id: parseInt(studentId),
            log_date: selectedDate,
            status: newStatus,
            time_in: original.time_in || null,
            remarks: `[${currentSubjectName}: ${newStatus}]`
        };
        if (original.id) payload.id = original.id;
        upserts.push(payload);
    }

    if (upserts.length === 0) {
        showNotification('No editable changes to save', 'info');
        return;
    }

    try {
        const { error } = await supabase
            .from('attendance_logs')
            .upsert(upserts, { onConflict: 'student_id, log_date' });

        if (error) throw error;

        await loadSubjectAttendance();
        pendingUpdates = {};
        renderSubjectChecklist();
        showNotification(`Saved ${upserts.length} attendance record(s) for ${currentSubjectName}`, 'success');

        // Notify parent and homeroom for Late/Absent
        for (const upd of upserts) {
            if (upd.status === 'Late' || upd.status === 'Absent') {
                await notifyParentAndHomeroom(upd.student_id, upd.status);
            }
        }
    } catch (err) {
        console.error(err);
        showNotification('Error saving subject attendance', 'error');
    }
}

async function notifyParentAndHomeroom(studentId, status) {
    const student = subjectStudents.find(s => s.id == studentId);
    if (!student) return;

    if (student.parent_id) {
        await supabase.from('notifications').insert({
            recipient_id: student.parent_id,
            recipient_role: 'parent',
            title: `Subject Alert: ${status} in ${currentSubjectName}`,
            message: `Your child ${student.full_name} was marked ${status} in ${currentSubjectName} on ${selectedDate}.`,
            type: 'attendance_alert',
            created_at: new Date().toISOString()
        });
    }

    if (homeroomTeacherId) {
        await supabase.from('notifications').insert({
            recipient_id: homeroomTeacherId,
            recipient_role: 'teachers',
            title: `Subject Alert: ${status}`,
            message: `Student ${student.full_name} was marked ${status} in ${currentSubjectName} on ${selectedDate}.`,
            type: 'attendance_alert',
            created_at: new Date().toISOString()
        });
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

function showNotification(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type);
    else alert(msg);
}