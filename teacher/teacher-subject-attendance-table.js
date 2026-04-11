// teacher-subject-attendance-table.js - Month view, batch save, holiday detection, per-student stats, YTD absences, DepEd warning, gate scan lock
let currentSubjectId = null;
let currentClassId = null;
let students = [];
let attendanceData = {};
let pendingUpdates = {};
let currentYearMonth = null;
let holidaysMap = new Map();
let currentStart = null, currentEnd = null;
let ytdAbsences = new Map();
let schoolYearStart = null;
const todayStr = new Date().toISOString().split('T')[0];

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.currentUser) { const user = checkSession('teachers'); if (!user) return (location.href = '../index.html'); window.currentUser = user; }
    document.getElementById('teacher-name').innerText = `Hi, ${window.currentUser.full_name?.split(' ')[0] || 'Teacher'}`;
    await loadSubjectList();
    setupEventListeners();
    const now = new Date(), currentYear = now.getFullYear(), currentMonth = now.getMonth() + 1;
    schoolYearStart = `${currentMonth >= 8 ? currentYear : currentYear - 1}-08-01`;
});

async function loadSubjectList() {
    const { data: loads } = await supabase.from('subject_loads').select('id, subject_name, class_id').eq('teacher_id', window.currentUser.id);
    const select = document.getElementById('subject-select');
    select.innerHTML = '<option value="">-- Select Subject --</option>';
    loads?.forEach(load => { const option = document.createElement('option'); option.value = load.id; option.textContent = `${load.subject_name} (Class ${load.class_id})`; select.appendChild(option); });
}

function setupEventListeners() {
    const subjectSelect = document.getElementById('subject-select');
    subjectSelect.addEventListener('change', async () => {
        currentSubjectId = subjectSelect.value;
        if (!currentSubjectId) return;
        const { data: subj } = await supabase.from('subject_loads').select('class_id').eq('id', currentSubjectId).single();
        currentClassId = subj.class_id;
        const today = new Date();
        currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        document.getElementById('month-year-display').innerText = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        await loadStudents();
        await loadMonthData();
        await loadYtdAbsences();
        renderTable();
        checkAndNotifyHighAbsences();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });
    document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
    document.getElementById('next-month').addEventListener('click', () => changeMonth(1));
    document.getElementById('save-attendance-btn').addEventListener('click', saveAllPending);
}

async function loadStudents() { const { data } = await supabase.from('students').select('id, full_name').eq('class_id', currentClassId).eq('status', 'Enrolled').order('full_name'); students = data || []; }
async function changeMonth(delta) { let [year, month] = currentYearMonth.split('-').map(Number); let newDate = new Date(year, month - 1 + delta, 1); currentYearMonth = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`; document.getElementById('month-year-display').innerText = newDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); pendingUpdates = {}; await loadMonthData(); await loadYtdAbsences(); renderTable(); checkAndNotifyHighAbsences(); if (typeof lucide !== 'undefined') lucide.createIcons(); }
async function loadMonthData() {
    if (!currentClassId || !students.length) return;
    const [year, month] = currentYearMonth.split('-');
    currentStart = `${year}-${month}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    currentEnd = `${year}-${month}-${lastDay}`;
    const { data: holidays } = await supabase.from('holidays').select('holiday_date, is_suspended, description').gte('holiday_date', currentStart).lte('holiday_date', currentEnd);
    holidaysMap.clear(); holidays?.forEach(h => holidaysMap.set(h.holiday_date, { isSuspended: h.is_suspended, description: h.description }));
    const studentIds = students.map(s => s.id);
    const { data: logs } = await supabase.from('attendance_logs').select('id, student_id, log_date, status, time_in').in('student_id', studentIds).gte('log_date', currentStart).lte('log_date', currentEnd);
    attendanceData = {}; students.forEach(s => { attendanceData[s.id] = {}; });
    logs?.forEach(log => { attendanceData[log.student_id][log.log_date] = { id: log.id, status: log.status || 'Absent', time_in: log.time_in }; });
}
async function loadYtdAbsences() { if (!students.length) return; const studentIds = students.map(s => s.id); const { data: logs } = await supabase.from('attendance_logs').select('student_id, status').in('student_id', studentIds).eq('status', 'Absent').gte('log_date', schoolYearStart); ytdAbsences.clear(); logs?.forEach(log => { const current = ytdAbsences.get(log.student_id) || 0; ytdAbsences.set(log.student_id, current + 1); }); }
function isWeekend(dateStr) { const day = new Date(dateStr).getDay(); return day === 0 || day === 6; }

function renderTable() {
    if (!currentStart || !currentEnd || !students.length) { document.getElementById('table-body').innerHTML = '<tr><td colspan="20" class="text-center py-10 text-gray-400">Select a subject and month to view data.</td></tr>'; return; }
    const dates = getAllDatesInMonth();
    const studentStats = students.map(student => {
        let present = 0, late = 0, absent = 0, excused = 0;
        for (let date of dates) {
            if (holidaysMap.has(date) || isWeekend(date) || date > todayStr) continue;
            const pending = pendingUpdates[student.id]?.[date];
            const original = attendanceData[student.id]?.[date] || { status: 'Absent' };
            const status = pending !== undefined ? pending : original.status;
            switch (status) { case 'On Time': present++; break; case 'Late': late++; break; case 'Absent': absent++; break; case 'Excused': excused++; break; }
        }
        const totalSchoolDays = dates.filter(d => !holidaysMap.has(d) && !isWeekend(d) && d <= todayStr).length;
        const attendanceRate = totalSchoolDays > 0 ? Math.round(((present + late) / totalSchoolDays) * 100) : 0;
        const ytdAbs = ytdAbsences.get(student.id) || 0;
        return { student, present, late, absent, excused, attendanceRate, ytdAbs };
    });
    const totalPresent = studentStats.reduce((s, st) => s + st.present, 0);
    const totalLate = studentStats.reduce((s, st) => s + st.late, 0);
    const totalAbsent = studentStats.reduce((s, st) => s + st.absent, 0);
    const totalExcused = studentStats.reduce((s, st) => s + st.excused, 0);
    const avgYtdAbs = studentStats.length ? Math.round(studentStats.reduce((s, st) => s + st.ytdAbs, 0) / studentStats.length) : 0;
    document.getElementById('stat-present').innerText = totalPresent; document.getElementById('stat-late').innerText = totalLate; document.getElementById('stat-absent').innerText = totalAbsent; document.getElementById('stat-excused').innerText = totalExcused; document.getElementById('stat-ytd-avg').innerText = avgYtdAbs;
    document.getElementById('table-header').innerHTML = `<tr><th class="sticky left-0 bg-gray-50 z-10 px-4 py-3 text-left font-bold text-gray-600 min-w-[180px]">Student</th><th class="px-2 py-3 text-center font-bold text-gray-600 bg-gray-50">Present<br><span class="text-xs font-normal">(Month)</span></th><th class="px-2 py-3 text-center font-bold text-gray-600 bg-gray-50">Late<br><span class="text-xs font-normal">(Month)</span></th><th class="px-2 py-3 text-center font-bold text-gray-600 bg-gray-50">Absent<br><span class="text-xs font-normal">(Month)</span></th><th class="px-2 py-3 text-center font-bold text-gray-600 bg-gray-50">Excused<br><span class="text-xs font-normal">(Month)</span></th><th class="px-2 py-3 text-center font-bold text-gray-600 bg-gray-50">Rate</th><th class="px-2 py-3 text-center font-bold text-gray-600 bg-gray-50">YTD<br>Absences</th>${dates.map(d => `<th class="px-2 py-3 text-center text-xs font-bold text-gray-500">${new Date(d).toLocaleDateString(undefined, { month:'short', day:'numeric' })}</th>`).join('')}</tr>`;
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = studentStats.map(stat => {
        const student = stat.student;
        let cellsHtml = '';
        for (let date of dates) {
            if (date > todayStr) { cellsHtml += `<td class="border-b px-2 py-2 text-center"><div class="attendance-cell disabled-cell bg-gray-300 text-gray-600 rounded-lg py-2 px-1 text-xs font-bold">—</div></td>`; continue; }
            const holiday = holidaysMap.get(date);
            if (holiday) { const label = holiday.isSuspended ? 'SUSPENDED' : 'HOLIDAY'; const bgColor = holiday.isSuspended ? 'bg-red-200 text-red-800' : 'bg-amber-100 text-amber-800'; cellsHtml += `<td class="border-b px-2 py-2 text-center"><div class="attendance-cell disabled-cell ${bgColor} rounded-lg px-2 py-2 text-[10px] font-black uppercase">${label}</div></td>`; continue; }
            if (isWeekend(date)) { cellsHtml += `<td class="border-b px-2 py-2 text-center"><div class="attendance-cell disabled-cell bg-gray-200 text-gray-500 rounded-lg py-2 px-1 text-xs font-bold">WEEKEND</div></td>`; continue; }
            const originalRecord = attendanceData[student.id]?.[date] || { status: 'Absent', time_in: null };
            const isLocked = !!originalRecord.time_in;
            const pendingStatus = pendingUpdates[student.id]?.[date];
            const status = pendingStatus !== undefined ? pendingStatus : originalRecord.status;
            let bgColor = '', displayText = '';
            switch (status) { case 'On Time': bgColor = 'bg-green-500'; displayText = 'Present'; break; case 'Late': bgColor = 'bg-orange-500'; displayText = 'Late'; break; case 'Absent': bgColor = 'bg-red-500'; displayText = 'Absent'; break; case 'Excused': bgColor = 'bg-blue-500'; displayText = 'Excused'; break; default: bgColor = 'bg-gray-300'; displayText = '—'; }
            // Allow editing even if locked (gate scanner may malfunction) - show indicator but allow click
            const lockIndicator = isLocked ? '<span class="text-[8px] block opacity-75">🔒</span>' : '';
            const lockedStyle = isLocked ? 'ring-2 ring-yellow-400' : '';
            cellsHtml += `<td class="border-b px-2 py-2 text-center"><div class="attendance-cell ${bgColor} ${lockedStyle} text-white rounded-lg py-2 px-1 text-xs font-bold" data-student="${student.id}" data-date="${date}" data-current="${status}" data-locked="${isLocked}">${lockIndicator}${displayText}</div></td>`;
        }
        const rowWarningClass = stat.ytdAbs >= 15 ? 'bg-red-50' : '';
        return `<tr class="${rowWarningClass}"><td class="sticky left-0 bg-white font-bold px-4 py-3 border-b">${escapeHtml(student.full_name)}</td><td class="student-stats-cell text-green-700 font-bold">${stat.present}</td><td class="student-stats-cell text-orange-700 font-bold">${stat.late}</td><td class="student-stats-cell text-red-700 font-bold">${stat.absent}</td><td class="student-stats-cell text-blue-700 font-bold">${stat.excused}</td><td class="student-stats-cell text-purple-700 font-bold">${stat.attendanceRate}%</td><td class="student-stats-cell ${stat.ytdAbs >= 15 ? 'bg-red-100 text-red-800 font-black' : 'text-gray-700'} font-bold">${stat.ytdAbs}</td>${cellsHtml}</tr>`;
    }).join('');
    document.querySelectorAll('.attendance-cell').forEach(cell => { 
        // Allow editing even if locked (gate scanner may malfunction)
        // Still prevent editing future dates
        if (cell.dataset.date > todayStr) return;
        // Skip holidays and weekends
        if (holidaysMap.has(cell.dataset.date) || isWeekend(cell.dataset.date)) return;
        
        cell.addEventListener('click', () => { 
            const studentId = cell.dataset.student, date = cell.dataset.date, currentStatus = cell.dataset.current;
            const nextStatus = getNextStatus(currentStatus);
            if (!pendingUpdates[studentId]) pendingUpdates[studentId] = {};
            pendingUpdates[studentId][date] = nextStatus;
            renderTable(); 
        }); 
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
}
function getAllDatesInMonth() { const dates = []; let current = new Date(currentStart); const last = new Date(currentEnd); while (current <= last) { dates.push(current.toISOString().split('T')[0]); current.setDate(current.getDate() + 1); } return dates; }
function getNextStatus(current) { const order = ['On Time', 'Late', 'Absent', 'Excused']; let idx = order.indexOf(current); if (idx === -1) idx = 0; return order[(idx + 1) % order.length]; }
async function saveAllPending() {
    const updates = [];
    const inserts = [];
    for (let studentId in pendingUpdates) {
        for (let date in pendingUpdates[studentId]) {
            if (date > todayStr || holidaysMap.has(date) || isWeekend(date)) continue;
            const originalRecord = attendanceData[studentId]?.[date] || {};
            // Allow editing even if record has time_in (gate scanner may have malfunctioned)
            const newStatus = pendingUpdates[studentId][date];
            if (originalRecord.id) {
                updates.push({ id: originalRecord.id, student_id: parseInt(studentId), date: date, status: newStatus });
            } else {
                inserts.push({ student_id: parseInt(studentId), log_date: date, status: newStatus, subject_load_id: parseInt(currentSubjectId) });
            }
        }
    }
    if (updates.length === 0 && inserts.length === 0) { showNotification('No changes to save', 'info'); return; }
    try {
        for (const upd of updates) {
            const { error } = await supabase.from('attendance_logs').update({ status: upd.status }).eq('id', upd.id);
            if (error) throw error;
        }
        if (inserts.length) {
            const { error } = await supabase.from('attendance_logs').insert(inserts);
            if (error) throw error;
        }
        await loadMonthData();
        await loadYtdAbsences();
        pendingUpdates = {};
        renderTable();
        checkAndNotifyHighAbsences();
        showNotification('Subject attendance successfully saved!', 'success');
        if (typeof lucide !== 'undefined') lucide.createIcons();
        // Recompute half-day for affected students
        if (typeof recomputeHalfDayBatch === 'function') {
            const affected = [];
            for (const upd of updates) affected.push({ studentId: upd.student_id, date: upd.date });
            for (const ins of inserts) affected.push({ studentId: ins.student_id, date: ins.log_date });
            await recomputeHalfDayBatch(affected);
        }
    } catch (err) { console.error(err); showNotification('Error saving: ' + err.message, 'error'); }
}
async function checkAndNotifyHighAbsences() { const highAbsenceStudents = students.filter(s => (ytdAbsences.get(s.id) || 0) >= 15); const warningBanner = document.getElementById('absence-warning-banner'); if (highAbsenceStudents.length > 0) { const names = highAbsenceStudents.map(s => s.full_name).join(', '); document.getElementById('warning-message').innerHTML = `⚠️ ${highAbsenceStudents.length} student(s) have reached 15+ absences (DepEd dropout threshold): ${names}. Please counsel.`; warningBanner.classList.remove('hidden'); } else { warningBanner.classList.add('hidden'); } for (let student of highAbsenceStudents) { const absences = ytdAbsences.get(student.id) || 0; const { data: existing } = await supabase.from('notifications').select('created_at').eq('recipient_id', window.currentUser.id).eq('type', 'absence_warning').ilike('title', `%${student.full_name}%`).order('created_at', { ascending: false }).limit(1); let shouldNotify = true; if (existing && existing.length > 0) { const lastNotif = new Date(existing[0].created_at); const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7); if (lastNotif > sevenDaysAgo) shouldNotify = false; } if (shouldNotify) { await supabase.from('notifications').insert({ recipient_id: window.currentUser.id, recipient_role: 'teachers', title: `⚠️ Attendance Warning: ${student.full_name}`, message: `${student.full_name} has accumulated ${absences} absences since ${schoolYearStart}. DepEd rule: 20 absences leads to dropout. Please intervene.`, type: 'absence_warning', created_at: new Date().toISOString() }); const { data: parentData } = await supabase.from('students').select('parent_id').eq('id', student.id).single(); if (parentData?.parent_id) { await supabase.from('notifications').insert({ recipient_id: parentData.parent_id, recipient_role: 'parent', title: `Attendance Concern for ${student.full_name}`, message: `Your child has missed ${absences} days of school since ${schoolYearStart}. Please ensure regular attendance.`, type: 'absence_warning', created_at: new Date().toISOString() }); } showNotification(`Warning sent for ${student.full_name} (${absences} absences)`, 'warning'); } } }
function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }
// Use general-core showNotification (has modal support)

// ========== SF2 EXPORT FOR SUBJECT ATTENDANCE ==========
async function exportSubjectTableToCSV() {
    if (!students.length || !currentYearMonth) {
        showNotification('No data to export', 'info');
        return;
    }

    // 1. Get subject, class, school details
    let subjectName = '';
    let gradeLevel = '';
    let section = '';
    let schoolName = '';
    let schoolId = '';
    try {
        // Get subject name
        const { data: subjectLoad } = await supabase
            .from('subject_loads')
            .select('subject_name, class_id')
            .eq('id', currentSubjectId)
            .single();
        if (subjectLoad) {
            subjectName = subjectLoad.subject_name;
            const classId = subjectLoad.class_id;
            // Get class details
            const { data: classData } = await supabase
                .from('classes')
                .select('grade_level, department, school_id')
                .eq('id', classId)
                .single();
            if (classData) {
                gradeLevel = classData.grade_level || '';
                section = classData.department || '';
                schoolId = classData.school_id || '';
            }
        }
        // Get school name
        if (schoolId) {
            const { data: school } = await supabase
                .from('schools')
                .select('name')
                .eq('id', schoolId)
                .single();
            if (school) schoolName = school.name;
        }
    } catch (err) { console.warn('Could not fetch details', err); }

    // 2. Prepare school days (no weekends, no holidays, not future)
    const allDates = getAllDatesInMonth();
    const schoolDays = allDates.filter(date => {
        if (date > todayStr) return false;
        if (isWeekend(date)) return false;
        if (holidaysMap.has(date)) return false;
        return true;
    });
    const monthYear = new Date(currentYearMonth + '-01');
    const monthName = monthYear.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const schoolYear = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

    // 3. Helper: get final status for a student on a date (respecting pending changes)
    function getFinalStatus(studentId, date) {
        const pending = pendingUpdates[studentId]?.[date];
        if (pending !== undefined) return pending;
        const original = attendanceData[studentId]?.[date] || { status: 'Absent' };
        return original.status;
    }

    function statusToSF2Code(status) {
        switch (status) {
            case 'On Time': return '';
            case 'Late':    return 'T';
            case 'Absent':  return 'X';
            case 'Excused': return 'E';
            default:        return '';
        }
    }

    // 4. Build CSV rows
    let csvRows = [];

    // Header block
    csvRows.push([`"Subject Attendance Report (SF2 Style) – ${subjectName}"`, '', '', '', '', '', '', '', '', '']);
    csvRows.push([`"School ID: ${schoolId}"`, '', '', '', '', `"School Year: ${schoolYear}"`, '', '', `"Month: ${monthName}"`, '']);
    csvRows.push([`"School: ${schoolName}"`, '', '', '', '', '', '', '', `"Grade: ${gradeLevel}"`, `"Section: ${section}"`]);
    csvRows.push([]);

    // Column headers: Learner's Name, then day numbers
    const dayNumbers = schoolDays.map(d => new Date(d).getDate().toString());
    const headerRow = [
        'LEARNER\'S NAME (Last Name, First Name, Middle Name)',
        ...dayNumbers,
        'ABSENT', 'TARDY', 'REMARK/S'
    ];
    csvRows.push(headerRow);

    // Per‑student data
    let totalAbsentAll = 0;
    let totalTardyAll = 0;
    const dailyPresentCount = new Array(schoolDays.length).fill(0);

    for (const student of students) {
        let fullName = student.full_name || '';
        // Format name as "Last, First Middle" if possible
        let formattedName = fullName;
        if (fullName.includes(',')) {
            formattedName = fullName;
        } else {
            const parts = fullName.split(' ');
            if (parts.length >= 2) {
                formattedName = `${parts[parts.length-1]}, ${parts.slice(0, -1).join(' ')}`;
            }
        }

        let absentCount = 0;
        let tardyCount = 0;
        const dailyCodes = [];

        for (let idx = 0; idx < schoolDays.length; idx++) {
            const date = schoolDays[idx];
            const status = getFinalStatus(student.id, date);
            const code = statusToSF2Code(status);
            dailyCodes.push(code);
            if (code === 'X') absentCount++;
            if (code === 'T') tardyCount++;
            if (code === '' || code === 'E') dailyPresentCount[idx]++;
        }

        totalAbsentAll += absentCount;
        totalTardyAll += tardyCount;

        const studentRow = [formattedName, ...dailyCodes, absentCount, tardyCount, ''];
        csvRows.push(studentRow);
    }

    // Daily totals row
    const totalPresentRow = ['TOTAL Present (Daily)'];
    for (let idx = 0; idx < schoolDays.length; idx++) {
        totalPresentRow.push(dailyPresentCount[idx]);
    }
    totalPresentRow.push('', '', '');
    csvRows.push(totalPresentRow);
    csvRows.push([]);

    // Summary statistics
    const enrolledTotal = students.length;
    const endOfMonthEnrolled = enrolledTotal; // no transfers tracked here
    const percentageEnrolment = ((endOfMonthEnrolled / enrolledTotal) * 100).toFixed(1);
    const totalSchoolDays = schoolDays.length;
    const avgDailyAttendance = (dailyPresentCount.reduce((a,b) => a+b,0) / totalSchoolDays).toFixed(1);
    const attendancePercent = ((avgDailyAttendance / endOfMonthEnrolled) * 100).toFixed(1);

    csvRows.push(['Summary for the Month', '', '', '', '', '', '', '', '', '']);
    csvRows.push(['', 'M', 'F', 'TOTAL', '', '', '', '', '', '']);
    csvRows.push([`Enrolment as of 1st Friday of June`, 0, 0, enrolledTotal, '', '', '', '', '', '']);
    csvRows.push([`Registered Learner as of end of the month`, '', '', endOfMonthEnrolled, '', '', '', '', '', '']);
    csvRows.push([`Percentage of Enrolment as of end of the month`, `${percentageEnrolment}%`, '', '', '', '', '', '', '', '']);
    csvRows.push([`Average Daily Attendance`, avgDailyAttendance, '', '', '', '', '', '', '', '']);
    csvRows.push([`Percentage of Attendance for the month`, `${attendancePercent}%`, '', '', '', '', '', '', '', '']);
    csvRows.push([`Number of students with 5 consecutive days of absences:`, '', '', '', '', '', '', '', '', '']);
    csvRows.push([`Drop out`, '', '', '', '', '', '', '', '', '']);
    csvRows.push([`Transferred out`, '', '', '', '', '', '', '', '', '']);
    csvRows.push([`Transferred in`, '', '', '', '', '', '', '', '', '']);
    csvRows.push([]);
    csvRows.push([`I certify that this is a true and correct report.`, '', '', '', '', '', '', '', '', '']);
    csvRows.push([`(Signature of Teacher over Printed Name)`, '', '', '', '', '', '', '', '', '']);
    csvRows.push([`Attested by:`, '', '', '', '', '', '', '', '', '']);
    csvRows.push([`(Signature of School Head over Printed Name)`, '', '', '', '', '', '', '', '', '']);

    // 5. Create and download CSV
    const csvContent = csvRows.map(row => 
        row.map(cell => {
            if (cell === undefined || cell === null) return '';
            const str = String(cell);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        }).join(',')
    ).join('\n');

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', `SF2_Subject_${subjectName}_${currentYearMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotification('Subject attendance exported as SF2-style CSV', 'success');
}
window.exportSubjectTableToCSV = exportSubjectTableToCSV;