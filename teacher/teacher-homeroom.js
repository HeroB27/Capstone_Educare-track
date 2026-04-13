// teacher-homeroom.js - Colored squares, batch save, no auto-save, gate scan locking
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

    const { data: logs } = await supabase
        .from('attendance_logs')
        .select('id, student_id, status, time_in')
        .eq('log_date', selectedDate)
        .in('student_id', allStudents.map(s => s.id));

    currentAttendance = {};
    logs?.forEach(log => {
        currentAttendance[log.student_id] = {
            id: log.id,
            status: log.status || '',
            hasGateScan: !!log.time_in
        };
    });
    pendingUpdates = {};
}

function renderChecklist() {
    const tbody = document.getElementById('checklist-tbody');
    if (!tbody) return;

    if (!allStudents.length) {
        tbody.innerHTML = '<tr><td colspan="2" class="text-center py-8">No students found.</td></tr>';
        return;
    }

    tbody.innerHTML = allStudents.map(student => {
        const original = currentAttendance[student.id] || { status: '', hasGateScan: false };
        const status = pendingUpdates[student.id] !== undefined ? pendingUpdates[student.id] : (original.status || '');
        let statusClass = 'status-empty', displayText = '—';
        switch (status) {
            case 'On Time': statusClass = 'status-present'; displayText = 'Present'; break;
            case 'Late': statusClass = 'status-late'; displayText = 'Late'; break;
            case 'Absent': statusClass = 'status-absent'; displayText = 'Absent'; break;
            case 'Excused': statusClass = 'status-excused'; displayText = 'Excused'; break;
            case 'Excused Absent': statusClass = 'status-excused-absent'; displayText = 'Excused Absent'; break;
        }
        return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-4 py-2 font-medium sticky left-0 bg-white">${escapeHtml(student.full_name)}</td>
                <td class="px-4 py-2">
                    <div class="status-square ${statusClass}"
                         data-student="${student.id}">
                        ${displayText}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    document.querySelectorAll('.status-square').forEach(square => {
        square.addEventListener('click', (e) => {
            e.stopPropagation();
            const studentId = square.dataset.student;
            const original = currentAttendance[studentId] || { status: '', hasGateScan: false };
            const currentStatus = pendingUpdates[studentId] !== undefined ? pendingUpdates[studentId] : (original.status || '');
            const nextStatus = getNextStatus(currentStatus);
            pendingUpdates[studentId] = nextStatus;
            renderChecklist();
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
    if (Object.keys(pendingUpdates).length === 0) {
        showNotification('No changes to save', 'info');
        return;
    }

    const upserts = [];
    for (const [studentId, newStatus] of Object.entries(pendingUpdates)) {
        const original = currentAttendance[studentId] || {};
        // ALL can be edited now - removed gate scan lock
        const payload = {
            student_id: parseInt(studentId),
            log_date: selectedDate,
            status: newStatus || null,
            time_in: original.time_in || null
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
            if (upd.status === 'Late' || upd.status === 'Absent') {
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

    // Avoid duplicate notification for same student + date + status
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

// Use general-core showNotification (has modal support)

// Export functions to window for HTML onclick handlers
window.renderChecklist = renderChecklist;
window.getNextStatus = getNextStatus;
window.saveAllPending = saveAllPending;
window.escapeHtml = escapeHtml;
window.showNotification = showNotification;