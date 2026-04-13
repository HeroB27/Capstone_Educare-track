// teacher-homeroom-table.js - Month view + per-student stats + YTD absences + DepEd warning + gate scan lock
// UPDATED: Uses school-year-core.js for dynamic dates
let classId = null;
let students = [];
let attendanceData = {};       // { studentId: { date: { id, status, time_in, morning_absent, afternoon_absent } } }
let pendingUpdates = {};       // { studentId: { date: { status, morning_absent, afternoon_absent } } }
let pendingHalfDays = {};      // { studentId: { date: { am: boolean, pm: boolean } } } - legacy support
let currentYearMonth = null;
let holidaysMap = new Map();
let currentStart = null, currentEnd = null;
let ytdAbsences = new Map();
let schoolYearStart = null;
const todayStr = new Date().toISOString().split('T')[0];

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.currentUser) {
        const user = checkSession('teachers');
        if (!user) return (location.href = '../index.html');
        window.currentUser = user;
    }
    document.getElementById('teacher-name').innerText = `Hi, ${window.currentUser.full_name?.split(' ')[0] || 'Teacher'}`;

    const { data: homeroom } = await supabase
        .from('classes')
        .select('id')
        .eq('adviser_id', window.currentUser.id)
        .single();

    if (!homeroom) {
        document.getElementById('table-body').innerHTML = '<tr><td colspan="20" class="text-center text-red-500 py-10">No homeroom class assigned.</td></tr>';
        return;
    }
    classId = homeroom.id;

    const { data: studentList } = await supabase
        .from('students')
        .select('id, full_name')
        .eq('class_id', classId)
        .eq('status', 'Enrolled')
        .order('full_name');
    students = studentList || [];

    const today = new Date();
    currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('month-year-display').innerText = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Use school-year-core.js for dynamic school year start
    schoolYearStart = await getSchoolYearStart();

    await loadMonthData();
    await loadYtdAbsences();
    renderTable();
    checkAndNotifyHighAbsences();

    document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
    document.getElementById('next-month').addEventListener('click', () => changeMonth(1));
    document.getElementById('save-attendance-btn').addEventListener('click', saveAllPending);
});

async function changeMonth(delta) {
    let [year, month] = currentYearMonth.split('-').map(Number);
    let newDate = new Date(year, month - 1 + delta, 1);
    currentYearMonth = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('month-year-display').innerText = newDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    pendingUpdates = {};
    await loadMonthData();
    await loadYtdAbsences();
    renderTable();
    checkAndNotifyHighAbsences();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function loadMonthData() {
    if (!classId || !students.length) return;
    const [year, month] = currentYearMonth.split('-');
    currentStart = `${year}-${month}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    currentEnd = `${year}-${month}-${lastDay}`;

    const { data: holidays } = await supabase
        .from('holidays')
        .select('holiday_date, is_suspended, description')
        .gte('holiday_date', currentStart)
        .lte('holiday_date', currentEnd);
    holidaysMap.clear();
    holidays?.forEach(h => holidaysMap.set(h.holiday_date, { isSuspended: h.is_suspended, description: h.description }));

    const studentIds = students.map(s => s.id);
    const { data: logs } = await supabase
        .from('attendance_logs')
        .select('id, student_id, log_date, status, time_in, morning_absent, afternoon_absent')
        .in('student_id', studentIds)
        .gte('log_date', currentStart)
        .lte('log_date', currentEnd);

    attendanceData = {};
    students.forEach(s => { attendanceData[s.id] = {}; });
    logs?.forEach(log => {
        attendanceData[log.student_id][log.log_date] = {
            id: log.id,
            status: log.status || 'Absent',
            time_in: log.time_in,
            morning_absent: log.morning_absent || false,
            afternoon_absent: log.afternoon_absent || false
        };
    });
}

async function loadYtdAbsences() {
    if (!students.length) return;
    const studentIds = students.map(s => s.id);
    const { data: logs } = await supabase
        .from('attendance_logs')
        .select('student_id, status, morning_absent, afternoon_absent')
        .in('student_id', studentIds)
        .gte('log_date', schoolYearStart);
    ytdAbsences.clear();
    logs?.forEach(log => {
        const isFullDayAbsent = (log.status === 'Absent') || (log.morning_absent && log.afternoon_absent);
        const isHalfDayAbsent = log.morning_absent !== log.afternoon_absent;
        if (isFullDayAbsent || isHalfDayAbsent) {
            const current = ytdAbsences.get(log.student_id) || 0;
            ytdAbsences.set(log.student_id, current + 1);
        }
    });
}

function isWeekend(dateStr) {
    const date = new Date(dateStr);
    const day = date.getDay();
    return day === 0 || day === 6;
}

function renderTable() {
    if (!currentStart || !currentEnd || !students.length) return;
    const dates = getAllDatesInMonth();
    const studentStats = students.map(student => {
        let present = 0, late = 0, absent = 0, halfday = 0, excused = 0;
        let totalPresentFraction = 0;      // accumulates (AM_present + PM_present)/2 per day
        let schoolDaysCount = 0;

        for (let date of dates) {
            if (holidaysMap.has(date)) continue;
            if (isWeekend(date)) continue;
            if (date > todayStr) continue;
            schoolDaysCount++;

            const original = attendanceData[student.id]?.[date] || {};
            const pending = pendingUpdates[student.id]?.[date];

            // Get period statuses (PR / LTE / ABS / EXC)
            const morningStatus = pending?.morning_status ?? (original.morning_absent ? 'ABS' : 'PR');
            const afternoonStatus = pending?.afternoon_status ?? (original.afternoon_absent ? 'ABS' : 'PR');

            const amPresent = morningStatus !== 'ABS';
            const pmPresent = afternoonStatus !== 'ABS';
            const dayFraction = (amPresent + pmPresent) / 2;
            totalPresentFraction += dayFraction;

            // Count whole‑day stats for display (optional, but kept for UI consistency)
            const amAbsent = morningStatus === 'ABS';
            const pmAbsent = afternoonStatus === 'ABS';
            if (amAbsent && pmAbsent) {
                absent++;
            } else if (amAbsent || pmAbsent) {
                halfday++;
            } else {
                // Both periods present – check for late/excused
                const hasLate = (morningStatus === 'LTE' || afternoonStatus === 'LTE');
                const hasExcused = (morningStatus === 'EXC' || afternoonStatus === 'EXC');
                if (hasLate && !hasExcused) late++;
                else if (hasExcused && !hasLate) excused++;
                else if (hasLate && hasExcused) excused++;  // excused takes precedence
                else present++;
            }
        }

        // Attendance rate based on actual period‑by‑period presence
        const attendanceRate = schoolDaysCount > 0
            ? Math.round((totalPresentFraction / schoolDaysCount) * 100)
            : 0;
        const ytdAbs = ytdAbsences.get(student.id) || 0;

        return { student, present, late, absent, halfday, excused, attendanceRate, ytdAbs };
    });

    const totalPresent = studentStats.reduce((s, st) => s + st.present, 0);
    const totalLate = studentStats.reduce((s, st) => s + st.late, 0);
    const totalAbsent = studentStats.reduce((s, st) => s + st.absent, 0);
    const totalHalfDay = studentStats.reduce((s, st) => s + st.halfday, 0);
    const totalExcused = studentStats.reduce((s, st) => s + st.excused, 0);
    const avgYtdAbs = studentStats.length ? Math.round(studentStats.reduce((s, st) => s + st.ytdAbs, 0) / studentStats.length) : 0;
    document.getElementById('stat-present').innerText = totalPresent;
    document.getElementById('stat-late').innerText = totalLate;
    document.getElementById('stat-absent').innerText = totalAbsent;
    document.getElementById('stat-halfday').innerText = totalHalfDay;
    document.getElementById('stat-excused').innerText = totalExcused;
    document.getElementById('stat-ytd-avg').innerText = avgYtdAbs;

    const thead = document.getElementById('table-header');
    thead.innerHTML = `
        <tr>
            <th class="sticky left-0 bg-gray-50 z-10 px-4 py-3 text-left font-bold text-gray-600 min-w-[180px]">Student</th>
            <th class="px-2 py-3 text-center font-bold text-gray-600 bg-gray-50">Present<br><span class="text-xs font-normal">(Month)</span></th>
            <th class="px-2 py-3 text-center font-bold text-gray-600 bg-gray-50">Late<br><span class="text-xs font-normal">(Month)</span></th>
            <th class="px-2 py-3 text-center font-bold text-gray-600 bg-gray-50">Absent<br><span class="text-xs font-normal">(Month)</span></th>
            <th class="px-2 py-3 text-center font-bold text-gray-600 bg-amber-50">Half<br><span class="text-xs font-normal">Day</span></th>
            <th class="px-2 py-3 text-center font-bold text-gray-600 bg-gray-50">Excused<br><span class="text-xs font-normal">(Month)</span></th>
            <th class="px-2 py-3 text-center font-bold text-gray-600 bg-gray-50">Rate</th>
            <th class="px-2 py-3 text-center font-bold text-gray-600 bg-gray-50">YTD<br>Absences</th>
            ${dates.map(d => `
                <th class="px-1 py-1 text-center text-[9px] font-bold text-gray-500 border-l border-gray-200 bg-gray-50" colspan="2">${new Date(d).toLocaleDateString(undefined, { month:'short', day:'numeric' })}</th>
            `).join('')}
        </tr>
        <tr>
            <th class="sticky left-0 bg-gray-50 z-10 px-4 py-2 border-b font-bold text-gray-600"></th>
            <th class="px-2 py-2 text-center font-bold text-gray-600 bg-gray-50 border-b"></th>
            <th class="px-2 py-2 text-center font-bold text-gray-600 bg-gray-50 border-b"></th>
            <th class="px-2 py-2 text-center font-bold text-gray-600 bg-gray-50 border-b"></th>
            <th class="px-2 py-2 text-center font-bold text-gray-600 bg-amber-50 border-b"></th>
            <th class="px-2 py-2 text-center font-bold text-gray-600 bg-gray-50 border-b"></th>
            <th class="px-2 py-2 text-center font-bold text-gray-600 bg-gray-50 border-b"></th>
            <th class="px-2 py-2 text-center font-bold text-gray-600 bg-gray-50 border-b"></th>
            ${dates.map(d => `
                <th class="px-1 py-2 text-center text-[9px] font-bold text-gray-500 border-l border-gray-200 bg-gray-50">AM</th>
                <th class="px-1 py-2 text-center text-[9px] font-bold text-gray-500 border-r border-gray-200 bg-gray-50">PM</th>
            `).join('')}
        </tr>
    `;

    const tbody = document.getElementById('table-body');
    tbody.innerHTML = studentStats.map(stat => {
        const student = stat.student;
        let cellsHtml = '';
        for (let date of dates) {
            if (date > todayStr) {
                cellsHtml += `<td class="border-b px-0.5 py-1 text-center border-l border-gray-200"><div class="attendance-cell disabled-cell bg-gray-300 text-gray-600 rounded py-1 text-[8px] font-bold">—</div></td>
                    <td class="border-b px-0.5 py-1 text-center border-r border-gray-200"><div class="attendance-cell disabled-cell bg-gray-300 text-gray-600 rounded py-1 text-[8px] font-bold">—</div></td>`;
                continue;
            }
            const holiday = holidaysMap.get(date);
            if (holiday) {
                const label = holiday.isSuspended ? 'SUSP' : 'HOL';
                const bgColor = holiday.isSuspended ? 'bg-red-200 text-red-800' : 'bg-amber-100 text-amber-800';
                cellsHtml += `<td class="border-b px-0.5 py-1 text-center border-l border-gray-200" colspan="2"><div class="attendance-cell disabled-cell ${bgColor} rounded px-1 py-1 text-[8px] font-black uppercase">${label}</div></td>`;
                continue;
            }
            if (isWeekend(date)) {
                cellsHtml += `<td class="border-b px-0.5 py-1 text-center border-l border-gray-200" colspan="2"><div class="attendance-cell disabled-cell bg-gray-200 text-gray-500 rounded py-1 text-[8px] font-bold">WK</div></td>`;
                continue;
            }

            const originalRecord = attendanceData[student.id]?.[date] || { status: '', time_in: null, morning_absent: false, afternoon_absent: false };
            const isLocked = !!originalRecord.time_in;
            
            const pending = pendingUpdates[student.id]?.[date];
            // Get period-specific status or fall back to absent flags
            const morningStatus = pending?.morning_status || (originalRecord.morning_absent ? 'ABS' : 'PR');
            const afternoonStatus = pending?.afternoon_status || (originalRecord.afternoon_absent ? 'ABS' : 'PR');
            
            // Get color based on status
            function getPeriodColor(status) {
                switch (status) {
                    case 'PR': return 'bg-green-500';
                    case 'LTE': return 'bg-orange-500';
                    case 'ABS': return 'bg-red-500';
                    case 'EXC': return 'bg-blue-500';
                    default: return 'bg-green-500';
                }
            }
            const amBgColor = getPeriodColor(morningStatus);
            const pmBgColor = getPeriodColor(afternoonStatus);
            
            // Allow editing even if locked (gate scanner may malfunction)
            const lockedStyle = isLocked ? 'ring-2 ring-yellow-400' : '';

            cellsHtml += `<td class="border-b px-0.5 py-1 text-center border-l border-gray-200">
                            <div class="attendance-cell ${amBgColor} text-white rounded py-1 text-[8px] font-bold ${lockedStyle}"
                                 data-student="${student.id}" data-date="${date}" data-period="am" data-status="${morningStatus}" data-locked="${isLocked}">
                                ${morningStatus}
                            </div>
                          </td>
                          <td class="border-b px-0.5 py-1 text-center border-r border-gray-200">
                            <div class="attendance-cell ${pmBgColor} text-white rounded py-1 text-[8px] font-bold ${lockedStyle}"
                                 data-student="${student.id}" data-date="${date}" data-period="pm" data-status="${afternoonStatus}" data-locked="${isLocked}">
                                ${afternoonStatus}
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
                <td class="student-stats-cell text-amber-600 font-bold">${stat.halfday}</td>
                <td class="student-stats-cell text-blue-700 font-bold">${stat.excused}</td>
                <td class="student-stats-cell text-purple-700 font-bold">${stat.attendanceRate}%</td>
                <td class="student-stats-cell ${stat.ytdAbs >= 15 ? 'bg-red-100 text-red-800 font-black' : 'text-gray-700'} font-bold">${stat.ytdAbs}</td>
                ${cellsHtml}
            </tr>
        `;
    }).join('');

    // Allow editing even if locked (gate scanner may malfunction) - show indicator
    document.querySelectorAll('.attendance-cell').forEach(cell => {
        const isLocked = cell.dataset.locked === 'true';
        // Add lock indicator
        if (isLocked) {
            cell.innerHTML = '<span class="text-[8px] block opacity-75">🔒</span>' + cell.innerHTML;
            cell.classList.add('ring-2', 'ring-yellow-400');
        }
        // Prevent editing future dates
        if (cell.dataset.date > todayStr) return;
        // Skip holidays and weekends
        if (holidaysMap.has(cell.dataset.date) || isWeekend(cell.dataset.date)) return;
        
        cell.addEventListener('click', (e) => {
            e.stopPropagation();
            const studentId = cell.dataset.student;
            const date = cell.dataset.date;
            const period = cell.dataset.period;
            const currentStatus = cell.dataset.status || 'PR';
            const nextStatus = getNextPeriodStatus(currentStatus);
            
            if (!pendingUpdates[studentId]) pendingUpdates[studentId] = {};
            if (!pendingUpdates[studentId][date]) {
                const original = attendanceData[studentId]?.[date] || { status: '', morning_absent: false, afternoon_absent: false };
                pendingUpdates[studentId][date] = {
                    status: original.status || 'On Time',
                    morning_absent: original.morning_absent || false,
                    afternoon_absent: original.afternoon_absent || false
                };
            }
            
            // Update period-specific status and absence flags
            if (period === 'am') {
                pendingUpdates[studentId][date].morning_status = nextStatus;
                pendingUpdates[studentId][date].morning_absent = (nextStatus === 'ABS');
            } else if (period === 'pm') {
                pendingUpdates[studentId][date].afternoon_status = nextStatus;
                pendingUpdates[studentId][date].afternoon_absent = (nextStatus === 'ABS');
            }
            renderTable();
        });
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
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
    // Cycle: blank -> Present (On Time) -> Late -> Absent -> Excused -> Excused Absent -> blank
    const order = ['', 'On Time', 'Late', 'Absent', 'Excused', 'Excused Absent'];
    let idx = order.indexOf(current);
    if (idx === -1) idx = 0; // Default to start (blank)
    return order[(idx + 1) % order.length];
}

function getNextHalfDayStatus(isAbsent) {
    return !isAbsent;
}

// Cycle through per-period statuses: PR -> LTE -> ABS -> EXC -> PR
function getNextPeriodStatus(current) {
    const statusOrder = ['PR', 'LTE', 'ABS', 'EXC'];
    let idx = statusOrder.indexOf(current);
    if (idx === -1) idx = 0;
    return statusOrder[(idx + 1) % statusOrder.length];
}

async function saveAllPending() {
    const upserts = [];
    const updates = [];
    
    for (let studentId in pendingUpdates) {
        for (let date in pendingUpdates[studentId]) {
            if (date > todayStr) continue;
            if (holidaysMap.has(date)) continue;
            if (isWeekend(date)) continue;

            const originalRecord = attendanceData[studentId]?.[date] || {};
            // Allow editing even if record has time_in (gate scanner may have malfunctioned)

            const updateData = pendingUpdates[studentId][date];
            
            // Get period-specific statuses
            const morningStatus = updateData.morning_status || 'PR';
            const afternoonStatus = updateData.afternoon_status || 'PR';
            
            // Derive absent flags from status strings
            const morningAbsent = (morningStatus === 'ABS');
            const afternoonAbsent = (afternoonStatus === 'ABS');
            
            // Determine overall status - use Late if any period is late but none are absent
            let finalStatus = 'On Time';
            if (morningStatus === 'LTE' || afternoonStatus === 'LTE') {
                finalStatus = 'Late';
            } else if (morningStatus === 'EXC' || afternoonStatus === 'EXC') {
                finalStatus = 'Excused';
            } else if (morningAbsent && afternoonAbsent) {
                finalStatus = 'Absent';
            }
            
            const payload = {
                student_id: parseInt(studentId),
                log_date: date,
                status: finalStatus,
                morning_absent: morningAbsent,
                afternoon_absent: afternoonAbsent,
                time_in: originalRecord.time_in || null
            };
            if (originalRecord.id) {
                updates.push({ 
                    id: originalRecord.id, 
                    status: finalStatus,
                    morning_absent: morningAbsent,
                    afternoon_absent: afternoonAbsent
                });
            } else {
                upserts.push(payload);
            }
        }
    }

    if (upserts.length === 0 && updates.length === 0) {
        showNotification('No changes to save', 'info');
        return;
    }

    try {
        let totalSaved = 0;
        
        if (upserts.length > 0) {
            const { error: upsertError } = await supabase
                .from('attendance_logs')
                .upsert(upserts, { onConflict: 'student_id, log_date' });
            if (upsertError) throw upsertError;
            totalSaved += upserts.length;
        }
        
        if (updates.length > 0) {
            for (const update of updates) {
                const { error: updateError } = await supabase
                    .from('attendance_logs')
                    .update({ 
                        status: update.status,
                        morning_absent: update.morning_absent || false,
                        afternoon_absent: update.afternoon_absent || false
                    })
                    .eq('id', update.id);
                if (updateError) throw updateError;
            }
            totalSaved += updates.length;
        }
        
        await loadMonthData();
        await loadYtdAbsences();
        pendingUpdates = {};
        pendingHalfDays = {};
        renderTable();
        checkAndNotifyHighAbsences();
        showNotification('Homeroom attendance table successfully saved!', 'success');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error(err);
        showNotification('Error saving: ' + err.message, 'error');
    }
}

async function checkAndNotifyHighAbsences() {
    const highAbsenceStudents = students.filter(s => (ytdAbsences.get(s.id) || 0) >= 15);
    const warningBanner = document.getElementById('absence-warning-banner');
    if (highAbsenceStudents.length > 0) {
        const names = highAbsenceStudents.map(s => s.full_name).join(', ');
        document.getElementById('warning-message').innerHTML = `⚠️ ${highAbsenceStudents.length} student(s) have reached 15+ absences (DepEd dropout threshold): ${names}. Please counsel.`;
        warningBanner.classList.remove('hidden');
    } else {
        warningBanner.classList.add('hidden');
    }

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

// Use general-core showNotification (has modal support)

// ========== EXPORT FUNCTION (AM/PM Matrix Format) ==========
// UPDATED: Exports two columns per date (AM/PM) with PR/ABS codes for easy SF2 transcription
async function exportHomeroomAttendanceToCSV() {
    if (!students.length || !currentYearMonth) {
        showNotification('No data to export', 'info');
        return;
    }

    // 1. Get school & class details
    let gradeLevel = '', section = '', schoolName = '', schoolId = '';
    try {
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
        if (schoolId) {
            const { data: school } = await supabase
                .from('schools')
                .select('name')
                .eq('id', schoolId)
                .single();
            if (school) schoolName = school.name;
        }
    } catch (err) { console.warn(err); }

    // 2. Get all dates in month (including weekends/holidays – we'll mark them)
    const allDates = getAllDatesInMonth();
    const monthYear = new Date(currentYearMonth + '-01');
    const monthName = monthYear.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const schoolYear = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

    // 3. Helper: get final AM/PM status for a student on a given date
    function getPeriodStatus(studentId, date, period) {
        const pending = pendingUpdates[studentId]?.[date];
        const original = attendanceData[studentId]?.[date] || {};
        
        // Get period-specific status from pending or derive from absent flags
        let periodStatus;
        if (period === 'am') {
            periodStatus = pending?.morning_status || (original.morning_absent ? 'ABS' : 'PR');
        } else {
            periodStatus = pending?.afternoon_status || (original.afternoon_absent ? 'ABS' : 'PR');
        }
        
return periodStatus;
    }

    // 4. Build CSV rows
    const csvRows = [];

    // ---- Header (simple, easy to read) ----
    csvRows.push([`"School: ${schoolName}"`, `"School ID: ${schoolId}"`, `"Grade: ${gradeLevel}"`, `"Section: ${section}"`]);
    csvRows.push([`"Month: ${monthName}"`, `"School Year: ${schoolYear}"`, `"Report generated: ${new Date().toLocaleString()}"`]);
    csvRows.push([]); // blank line

    // ---- Column headers: Learner Name, then for each date: "Date (AM)", "Date (PM)" ----
    const headers = ['LEARNER\'S NAME'];
    for (const date of allDates) {
        const displayDate = new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        headers.push(`${displayDate} AM`, `${displayDate} PM`);
    }
    headers.push('FULL DAY ABSENT', 'HALF DAYS', 'YTD ABSENCES');
    csvRows.push(headers);

    // ---- Per‑student data ----
    for (const student of students) {
        const fullName = student.full_name || '';
        const row = [fullName];
        let fullDayAbsent = 0;
        let halfDays = 0;

        for (const date of allDates) {
            // Skip future dates, weekends, holidays? We'll still export but mark clearly.
            if (date > todayStr) {
                row.push('--', '--');
                continue;
            }
            if (isWeekend(date)) {
                row.push('W/E', 'W/E');
                continue;
            }
            if (holidaysMap.has(date)) {
                const holiday = holidaysMap.get(date);
                const label = holiday.isSuspended ? 'SUSP' : 'HOL';
                row.push(label, label);
                continue;
            }

            const amStatus = getPeriodStatus(student.id, date, 'am');
            const pmStatus = getPeriodStatus(student.id, date, 'pm');
            row.push(amStatus, pmStatus);

            // Count full‑day absent (both AM & PM = ABS)
            if (amStatus === 'ABS' && pmStatus === 'ABS') fullDayAbsent++;
            // Count half‑day (exactly one ABS)
            if ((amStatus === 'ABS' && pmStatus === 'PR') || (amStatus === 'PR' && pmStatus === 'ABS')) halfDays++;
        }

        const ytdAbs = ytdAbsences.get(student.id) || 0;
        row.push(fullDayAbsent, halfDays, ytdAbs);
        csvRows.push(row);
    }

    // ---- Summary row (totals) ----
    const totalFullDay = csvRows.slice(4).reduce((sum, row) => sum + (parseInt(row[row.length-3]) || 0), 0);
    const totalHalfDays = csvRows.slice(4).reduce((sum, row) => sum + (parseInt(row[row.length-2]) || 0), 0);
    csvRows.push([]);
    csvRows.push(['TOTALS', '', '', '', '', '', '', '', '', `Full-day: ${totalFullDay}`, `Half-day: ${totalHalfDays}`, '']);

    // ---- Instructions for DepEd SF2 transcription ----
    csvRows.push([]);
    csvRows.push(['HOW TO USE THIS EXPORT:']);
    csvRows.push(['1. "PR" = Present (leave blank in official SF2)']);
    csvRows.push(['2. "ABS" = Absent (mark X in official SF2)']);
    csvRows.push(['3. For half‑day absences (one ABS, one PR): shade half of the SF2 cell (upper for AM absent, lower for PM absent)']);
    csvRows.push(['4. Use "FULL DAY ABSENT" column to quickly fill the "ABSENT" total in SF2']);
    csvRows.push(['5. Use "HALF DAYS" column to count tardy interventions if needed']);

    // ---- Legend ----
    csvRows.push([]);
    csvRows.push(['LEGEND:']);
    csvRows.push(['CODE', 'MEANING']);
    csvRows.push(['PR', 'Present']);
    csvRows.push(['ABS', 'Absent (excused and not excused)']);
    csvRows.push(['LTE', 'Late']);
    csvRows.push(['EXC', 'Excused']);
    csvRows.push(['W/E', 'Weekend']);
    csvRows.push(['SUSP', 'Class suspended (no classes)']);
    csvRows.push(['HOL', 'Holiday']);
    csvRows.push(['--', 'Future date / Not recorded']);

    // ---- Create and download CSV ----
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
    link.setAttribute('download', `Attendance_${gradeLevel}_${section}_${currentYearMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotification('CSV exported – easy to read & transfer to SF2', 'success');
}

// Expose to global scope for button onclick
window.exportHomeroomAttendanceToCSV = exportHomeroomAttendanceToCSV;