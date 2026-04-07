// teacher-homeroom.js - Colored squares, batch save, no auto-save
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
            status: log.status || 'Absent',
            hasGateScan: !!log.time_in
        };
    });
    // Clear pending updates when date changes
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
        const original = currentAttendance[student.id] || { status: 'Absent', hasGateScan: false };
        const isLocked = original.hasGateScan === true;
        // Use pending status if exists, otherwise original
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
            const original = currentAttendance[studentId] || { status: 'Absent', hasGateScan: false };
            const currentStatus = pendingUpdates[studentId] !== undefined ? pendingUpdates[studentId] : original.status;
            const nextStatus = getNextStatus(currentStatus);
            // Update pending
            pendingUpdates[studentId] = nextStatus;
            // Re-render to show new color
            renderChecklist();
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

    // Prepare upsert operations for each pending student
    const upserts = [];
    for (const [studentId, newStatus] of Object.entries(pendingUpdates)) {
        const original = currentAttendance[studentId] || {};
        // Skip locked students (should not happen, but safety)
        if (original.hasGateScan) continue;
        const payload = {
            student_id: parseInt(studentId),
            log_date: selectedDate,
            status: newStatus,
            time_in: original.time_in || null
        };
        if (original.id) payload.id = original.id;
        upserts.push(payload);
    }

    if (upserts.length === 0) {
        showNotification('No editable changes to save', 'info');
        return;
    }

    try {
        // Use upsert in batch (Supabase supports array upsert)
        const { error } = await supabase
            .from('attendance_logs')
            .upsert(upserts, { onConflict: 'student_id, log_date' });

        if (error) throw error;

        // After successful save, refresh data from DB and clear pending
        await fetchAttendanceForDate();
        pendingUpdates = {};
        renderChecklist();
        showNotification(`Saved ${upserts.length} attendance record(s)`, 'success');

        // Optionally notify parents for Late/Absent (can be done server-side or here)
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

    // Avoid duplicate notifications for same day (optional check)
    const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('recipient_id', student.parent_id)
        .eq('type', 'attendance_alert')
        .eq('title', `Attendance Alert: ${status}`)
        .single();

    if (existing) return;

    await supabase.from('notifications').insert({
        recipient_id: student.parent_id,
        recipient_role: 'parent',
        title: `Attendance Alert: ${status}`,
        message: `Your child ${student.full_name} was marked ${status} on ${date}.`,
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
        }, async (payload) => {
            const studentId = payload.new.student_id;
            if (allStudents.some(s => s.id === studentId)) {
                await fetchAttendanceForDate();
                pendingUpdates = {}; // clear pending because external change
                renderChecklist();
                showNotification('Gate scan detected – list updated', 'info');
            }
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

function showNotification(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type);
    else alert(msg);
}