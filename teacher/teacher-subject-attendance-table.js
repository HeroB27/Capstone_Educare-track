// teacher-subject-attendance-table.js - Month view, batch save, holiday detection, per-student stats + YTD absences + DepEd warning
let currentSubjectId = null;
let currentClassId = null;
let students = [];
let attendanceData = {};        // { student_id: { date: { id, status } } }
let pendingUpdates = {};        // { student_id: { date: newStatus } }
let currentYearMonth = null;    // 'YYYY-MM'
let holidaysMap = new Map();     // { date: { is_suspended, description } }
let currentStart = null, currentEnd = null;

// YTD absences cache
let ytdAbsences = new Map();     // student_id -> count
let schoolYearStart = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.currentUser) {
        const user = checkSession('teachers');
        if (!user) return (location.href = '../index.html');
        window.currentUser = user;
    }
    document.getElementById('teacher-name').innerText = `Hi, ${window.currentUser.full_name?.split(' ')[0] || 'Teacher'}`;

    await loadSubjectList();
    setupEventListeners();
    
    // Compute school year start (August 1)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    let schoolYearStartYear = currentMonth >= 8 ? currentYear : currentYear - 1;
    schoolYearStart = `${schoolYearStartYear}-08-01`;
});

async function loadSubjectList() {
    const { data: loads } = await supabase
        .from('subject_loads')
        .select('id, subject_name, class_id')
        .eq('teacher_id', window.currentUser.id);

    const select = document.getElementById('subject-select');
    select.innerHTML = '<option value="">-- Select Subject --</option>';
    loads?.forEach(load => {
        const option = document.createElement('option');
        option.value = load.id;
        option.textContent = `${load.subject_name} (Class ${load.class_id})`;
        select.appendChild(option);
    });
}

function setupEventListeners() {
    const subjectSelect = document.getElementById('subject-select');
    subjectSelect.addEventListener('change', async () => {
        currentSubjectId = subjectSelect.value;
        if (!currentSubjectId) return;
        const { data: subj } = await supabase
            .from('subject_loads')
            .select('class_id')
            .eq('id', currentSubjectId)
            .single();
        currentClassId = subj.class_id;

        const today = new Date();
        currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        document.getElementById('month-year-display').innerText = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        await loadStudents();
        await loadMonthData();
        await loadYtdAbsences();
        renderTable();
        checkAndNotifyHighAbsences();
    });

    document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
    document.getElementById('next-month').addEventListener('click', () => changeMonth(1));
    document.getElementById('save-attendance-btn').addEventListener('click', saveAllPending);
}

async function loadStudents() {
    const { data } = await supabase
        .from('students')
        .select('id, full_name')
        .eq('class_id', currentClassId)
        .eq('status', 'Enrolled')
        .order('full_name');
    students = data || [];
}

async function changeMonth(delta) {
    let [year, month] = currentYearMonth.split('-').map(Number);
    let newDate = new Date(year, month - 1 + delta, 1);
    currentYearMonth = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('month-year-display').innerText = newDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    await loadMonthData();
    await loadYtdAbsences();
    renderTable();
    checkAndNotifyHighAbsences();
}

async function loadMonthData() {
    if (!currentClassId || !students.length) return;

    const [year, month] = currentYearMonth.split('-');
    currentStart = `${year}-${month}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    currentEnd = `${year}-${month}-${lastDay}`;

    // Load holidays
    const { data: holidays } = await supabase
        .from('holidays')
        .select('holiday_date, is_suspended, description')
        .gte('holiday_date', currentStart)
        .lte('holiday_date', currentEnd);
    holidaysMap.clear();
    holidays?.forEach(h => {
        holidaysMap.set(h.holiday_date, { isSuspended: h.is_suspended, description: h.description });
    });

    // Load attendance logs for the month
    const studentIds = students.map(s => s.id);
    const { data: logs } = await supabase
        .from('attendance_logs')
        .select('id, student_id, log_date, status')
        .in('student_id', studentIds)
        .gte('log_date', currentStart)
        .lte('log_date', currentEnd);

    attendanceData = {};
    students.forEach(s => { attendanceData[s.id] = {}; });
    logs?.forEach(log => {
        attendanceData[log.student_id][log.log_date] = {
            id: log.id,
            status: log.status || 'Absent'
        };
    });
    pendingUpdates = {};
}

async function loadYtdAbsences() {
    if (!students.length) return;
    const studentIds = students.map(s => s.id);
    const { data: logs } = await supabase
        .from('attendance_logs')
        .select('student_id, status')
        .in('student_id', studentIds)
        .eq('status', 'Absent')
        .gte('log_date', schoolYearStart);
    
    ytdAbsences.clear();
    logs?.forEach(log => {
        const current = ytdAbsences.get(log.student_id) || 0;
        ytdAbsences.set(log.student_id, current + 1);
    });
}

function renderTable() {
    if (!currentStart || !currentEnd || !students.length) {
        document.getElementById('table-body').innerHTML = '<tr><td colspan="20" class="text-center py-10 text-gray-400">Select a subject and month to view data.</td></tr>';
        return;
    }

    const dates = getAllDatesInMonth();
    
    // Compute per-student monthly stats
    const studentStats = students.map(student => {
        let present = 0, late = 0, absent = 0, excused = 0;
        for (let date of dates) {
            if (holidaysMap.has(date)) continue;
            const pending = pendingUpdates[student.id]?.[date];
            const original = attendanceData[student.id]?.[date] || { status: 'Absent' };
            const status = pending !== undefined ? pending : original.status;
            switch (status) {
                case 'On Time': present++; break;
                case 'Late': late++; break;
                case 'Absent': absent++; break;
                case 'Excused': excused++; break;
            }
        }
        const totalSchoolDays = dates.filter(d => !holidaysMap.has(d)).length;
        const attendanceRate = totalSchoolDays > 0 ? Math.round(((present + late) / totalSchoolDays) * 100) : 0;
        const ytdAbs = ytdAbsences.get(student.id) || 0;
        return { student, present, late, absent, excused, attendanceRate, ytdAbs };
    });

    // Update summary cards
    const totalPresent = studentStats.reduce((s, st) => s + st.present, 0);
    const totalLate = studentStats.reduce((s, st) => s + st.late, 0);
    const totalAbsent = studentStats.reduce((s, st) => s + st.absent, 0);
    const totalExcused = studentStats.reduce((s, st) => s + st.excused, 0);
    const avgYtdAbs = studentStats.length ? Math.round(studentStats.reduce((s, st) => s + st.ytdAbs, 0) / studentStats.length) : 0;
    document.getElementById('stat-present').innerText = totalPresent;
    document.getElementById('stat-late').innerText = totalLate;
    document.getElementById('stat-absent').innerText = totalAbsent;
    document.getElementById('stat-excused').innerText = totalExcused;
    document.getElementById('stat-ytd-avg').innerText = avgYtdAbs;

    // Build header
    const thead = document.getElementById('table-header');
    thead.innerHTML = `
        <tr>
            <th class="sticky left-0 bg-gray-50 z-10 px-4 py-3 text-left font-bold text-gray-600 min-w-[180px]">Student</th>
            <th class="px-2 py-3 text-center font-bold text-gray-600 bg-gray-50">Present<br><span class="text-xs font-normal">(Month)</span></th>
            <th class="px-2 py-3 text-center font-bold text-gray-600 bg-gray-50">Late<br><span class="text-xs font-normal">(Month)</span></th>
            <th class="px-2 py-3 text-center font-bold text-gray-600 bg-gray-50">Absent<br><span class="text-xs font-normal">(Month)</span></th>
            <th class="px-2 py-3 text-center font-bold text-gray-600 bg-gray-50">Excused<br><span class="text-xs font-normal">(Month)</span></th>
            <th class="px-2 py-3 text-center font-bold text-gray-600 bg-gray-50">Rate</th>
            <th class="px-2 py-3 text-center font-bold text-gray-600 bg-gray-50">YTD<br>Absences</th>
            ${dates.map(d => `<th class="px-2 py-3 text-center text-xs font-bold text-gray-500">${new Date(d).toLocaleDateString(undefined, { month:'short', day:'numeric' })}</th>`).join('')}
        </tr>
    `;

    const tbody = document.getElementById('table-body');
    tbody.innerHTML = studentStats.map(stat => {
        const student = stat.student;
        let cellsHtml = '';
        for (let date of dates) {
            const holiday = holidaysMap.get(date);
            if (holiday) {
                const label = holiday.isSuspended ? 'SUSPENDED' : 'HOLIDAY';
                const bgColor = holiday.isSuspended ? 'bg-red-200 text-red-800' : 'bg-amber-100 text-amber-800';
                cellsHtml += `<td class="border-b px-2 py-2 text-center"><div class="attendance-cell disabled-cell ${bgColor} rounded-lg px-2 py-2 text-[10px] font-black uppercase">${label}</div></td>`;
                continue;
            }
            const pendingStatus = pendingUpdates[student.id]?.[date];
            const original = attendanceData[student.id]?.[date] || { status: 'Absent' };
            const status = pendingStatus !== undefined ? pendingStatus : original.status;
            let bgColor = '', displayText = '';
            switch (status) {
                case 'On Time': bgColor = 'bg-green-500'; displayText = 'Present'; break;
                case 'Late': bgColor = 'bg-orange-500'; displayText = 'Late'; break;
                case 'Absent': bgColor = 'bg-red-500'; displayText = 'Absent'; break;
                case 'Excused': bgColor = 'bg-blue-500'; displayText = 'Excused'; break;
                default: bgColor = 'bg-gray-300'; displayText = '—';
            }
            cellsHtml += `<td class="border-b px-2 py-2 text-center">
                            <div class="attendance-cell ${bgColor} text-white rounded-lg py-2 px-1 text-xs font-bold"
                                 data-student="${student.id}" data-date="${date}" data-current="${status}">
                                ${displayText}
                            </div>
                          </td>`;
        }
        const rowWarningClass = stat.ytdAbs >= 15 ? 'bg-red-50' : '';
        return `
            <tr class="${rowWarningClass}">
                <td class="sticky left-0 bg-white font-bold px-4 py-3 border-b">${escapeHtml(student.full_name)}</td>
                <td class="student-stats-cell text-green-700 font-bold">${stat.present}</td>
                <td class="student-stats-cell text-orange-700 font-bold">${stat.late}</td>
                <td class="student-stats-cell text-red-700 font-bold">${stat.absent}</td>
                <td class="student-stats-cell text-blue-700 font-bold">${stat.excused}</td>
                <td class="student-stats-cell text-purple-700 font-bold">${stat.attendanceRate}%</td>
                <td class="student-stats-cell ${stat.ytdAbs >= 15 ? 'bg-red-100 text-red-800 font-black' : 'text-gray-700'} font-bold">${stat.ytdAbs}</td>
                ${cellsHtml}
            </tr>
        `;
    }).join('');

    // Attach click handlers
    document.querySelectorAll('.attendance-cell:not(.disabled-cell)').forEach(cell => {
        cell.addEventListener('click', (e) => {
            e.stopPropagation();
            const studentId = cell.dataset.student;
            const date = cell.dataset.date;
            const currentStatus = cell.dataset.current;
            const nextStatus = getNextStatus(currentStatus);
            if (!pendingUpdates[studentId]) pendingUpdates[studentId] = {};
            pendingUpdates[studentId][date] = nextStatus;
            cell.dataset.current = nextStatus;
            const newColor = getStatusColor(nextStatus);
            cell.className = `attendance-cell ${newColor} text-white rounded-lg py-2 px-1 text-xs font-bold`;
            cell.innerText = getStatusDisplay(nextStatus);
            updateStats();
        });
    });
}

function getAllDatesInMonth() {
    const dates = [];
    let current = new Date(currentStart);
    const last = new Date(currentEnd);
    while (current <= last) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
    }
    return dates;
}

function getNextStatus(current) {
    const order = ['On Time', 'Late', 'Absent', 'Excused'];
    let idx = order.indexOf(current);
    if (idx === -1) idx = 0;
    return order[(idx + 1) % order.length];
}

function getStatusColor(status) {
    switch (status) {
        case 'On Time': return 'bg-green-500';
        case 'Late': return 'bg-orange-500';
        case 'Absent': return 'bg-red-500';
        case 'Excused': return 'bg-blue-500';
        default: return 'bg-gray-300';
    }
}

function getStatusDisplay(status) {
    switch (status) {
        case 'On Time': return 'Present';
        case 'Late': return 'Late';
        case 'Absent': return 'Absent';
        case 'Excused': return 'Excused';
        default: return '—';
    }
}

function updateStats() {
    renderTable(); // simple re-render to update stats after each click
}

async function saveAllPending() {
    const upserts = [];
    for (let studentId in pendingUpdates) {
        for (let date in pendingUpdates[studentId]) {
            const newStatus = pendingUpdates[studentId][date];
            const existing = attendanceData[studentId]?.[date] || {};
            upserts.push({
                student_id: parseInt(studentId),
                log_date: date,
                status: newStatus,
                time_in: existing.time_in || null,
                id: existing.id || undefined
            });
        }
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
        await loadMonthData();
        await loadYtdAbsences();
        pendingUpdates = {};
        renderTable();
        checkAndNotifyHighAbsences();
        showNotification(`Saved ${upserts.length} attendance changes`, 'success');
    } catch (err) {
        console.error(err);
        showNotification('Error saving: ' + err.message, 'error');
    }
}

async function checkAndNotifyHighAbsences() {
    // Find students with YTD absences >= 15
    const highAbsenceStudents = students.filter(s => (ytdAbsences.get(s.id) || 0) >= 15);
    const warningBanner = document.getElementById('absence-warning-banner');
    if (highAbsenceStudents.length > 0) {
        const names = highAbsenceStudents.map(s => s.full_name).join(', ');
        document.getElementById('warning-message').innerHTML = `⚠️ ${highAbsenceStudents.length} student(s) have reached 15+ absences (DepEd dropout threshold): ${names}. Please counsel.`;
        warningBanner.classList.remove('hidden');
    } else {
        warningBanner.classList.add('hidden');
    }

    // For each student, send a notification if not sent in last 7 days
    for (let student of highAbsenceStudents) {
        const absences = ytdAbsences.get(student.id) || 0;
        const { data: existing } = await supabase
            .from('notifications')
            .select('created_at')
            .eq('recipient_id', window.currentUser.id)
            .eq('type', 'absence_warning')
            .ilike('title', `%${student.full_name}%`)
            .order('created_at', { ascending: false })
            .limit(1);
        
        let shouldNotify = true;
        if (existing && existing.length > 0) {
            const lastNotif = new Date(existing[0].created_at);
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            if (lastNotif > sevenDaysAgo) shouldNotify = false;
        }
        
        if (shouldNotify) {
            await supabase.from('notifications').insert({
                recipient_id: window.currentUser.id,
                recipient_role: 'teachers',
                title: `⚠️ Attendance Warning: ${student.full_name}`,
                message: `${student.full_name} has accumulated ${absences} absences since ${schoolYearStart}. DepEd rule: 20 absences leads to dropout. Please intervene.`,
                type: 'absence_warning',
                created_at: new Date().toISOString()
            });
            // Also notify parent
            const { data: parentData } = await supabase
                .from('students')
                .select('parent_id')
                .eq('id', student.id)
                .single();
            if (parentData?.parent_id) {
                await supabase.from('notifications').insert({
                    recipient_id: parentData.parent_id,
                    recipient_role: 'parent',
                    title: `Attendance Concern for ${student.full_name}`,
                    message: `Your child has missed ${absences} days of school since ${schoolYearStart}. Please ensure regular attendance.`,
                    type: 'absence_warning',
                    created_at: new Date().toISOString()
                });
            }
            showNotification(`Warning sent for ${student.full_name} (${absences} absences)`, 'warning');
        }
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