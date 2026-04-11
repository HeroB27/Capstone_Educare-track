// teacher-homeroom-table.js - Month view + per-student stats + YTD absences + DepEd warning + gate scan lock
// UPDATED: SF2-style AM/PM cells per date (half-day support)
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

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    let schoolYearStartYear = currentMonth >= 8 ? currentYear : currentYear - 1;
    schoolYearStart = `${schoolYearStartYear}-08-01`;

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
        for (let date of dates) {
            if (holidaysMap.has(date)) continue;
            if (isWeekend(date)) continue;
            if (date > todayStr) continue;
            
            const original = attendanceData[student.id]?.[date] || { status: 'Absent' };
            const pending = pendingUpdates[student.id]?.[date];
            const status = pending?.status !== undefined ? pending.status : original.status;
            const morningAbsent = pending?.morning_absent !== undefined ? pending.morning_absent : (original.morning_absent || false);
            const afternoonAbsent = pending?.afternoon_absent !== undefined ? pending.afternoon_absent : (original.afternoon_absent || false);
            
            const isFullDayAbsent = morningAbsent && afternoonAbsent;
            const isHalfDay = morningAbsent !== afternoonAbsent && !isFullDayAbsent;
            
            if (isHalfDay) {
                halfday++;
            } else if (isFullDayAbsent) {
                absent++;
            } else {
                switch (status) {
                    case 'On Time': present++; break;
                    case 'Late': late++; break;
                    case 'Absent': absent++; break;
                    case 'Excused': excused++; break;
                    default: present++;
                }
            }
        }
        const totalSchoolDays = dates.filter(d => !holidaysMap.has(d) && !isWeekend(d) && d <= todayStr).length;
        const attendanceRate = totalSchoolDays > 0 ? Math.round(((present + late + halfday * 0.5) / totalSchoolDays) * 100) : 0;
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

            const originalRecord = attendanceData[student.id]?.[date] || { status: 'Absent', time_in: null, morning_absent: false, afternoon_absent: false };
            const isLocked = !!originalRecord.time_in;
            
            const pending = pendingUpdates[student.id]?.[date];
            const morningAbsent = pending?.morning_absent !== undefined ? pending.morning_absent : (originalRecord.morning_absent || false);
            const afternoonAbsent = pending?.afternoon_absent !== undefined ? pending.afternoon_absent : (originalRecord.afternoon_absent || false);
            
            const amBgColor = morningAbsent ? 'bg-red-500' : 'bg-green-500';
            const pmBgColor = afternoonAbsent ? 'bg-red-500' : 'bg-green-500';
            const amDisplay = morningAbsent ? 'ABS' : 'PR';
            const pmDisplay = afternoonAbsent ? 'ABS' : 'PR';
            
            // Allow editing even if locked (gate scanner may malfunction)
            const lockedStyle = isLocked ? 'ring-2 ring-yellow-400' : '';

            cellsHtml += `<td class="border-b px-0.5 py-1 text-center border-l border-gray-200">
                            <div class="attendance-cell ${amBgColor} text-white rounded py-1 text-[8px] font-bold ${lockedStyle}"
                                 data-student="${student.id}" data-date="${date}" data-period="am" data-current="${morningAbsent}" data-locked="${isLocked}">
                                ${amDisplay}
                            </div>
                          </td>
                          <td class="border-b px-0.5 py-1 text-center border-r border-gray-200">
                            <div class="attendance-cell ${pmBgColor} text-white rounded py-1 text-[8px] font-bold ${lockedStyle}"
                                 data-student="${student.id}" data-date="${date}" data-period="pm" data-current="${afternoonAbsent}" data-locked="${isLocked}">
                                ${pmDisplay}
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
            const currentValue = cell.dataset.current === 'true';
            const nextValue = !currentValue;
            
            if (!pendingUpdates[studentId]) pendingUpdates[studentId] = {};
            if (!pendingUpdates[studentId][date]) {
                const original = attendanceData[studentId]?.[date] || { status: 'Absent', morning_absent: false, afternoon_absent: false };
                pendingUpdates[studentId][date] = {
                    status: original.status || 'On Time',
                    morning_absent: original.morning_absent || false,
                    afternoon_absent: original.afternoon_absent || false
                };
            }
            
            if (period === 'am') {
                pendingUpdates[studentId][date].morning_absent = nextValue;
            } else if (period === 'pm') {
                pendingUpdates[studentId][date].afternoon_absent = nextValue;
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
    const order = ['On Time', 'Late', 'Absent', 'Excused'];
    let idx = order.indexOf(current);
    if (idx === -1) idx = 0;
    return order[(idx + 1) % order.length];
}

function getNextHalfDayStatus(isAbsent) {
    return !isAbsent;
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
            const payload = {
                student_id: parseInt(studentId),
                log_date: date,
                status: updateData.status || 'On Time',
                morning_absent: updateData.morning_absent || false,
                afternoon_absent: updateData.afternoon_absent || false,
                time_in: originalRecord.time_in || null
            };
            if (originalRecord.id) {
                updates.push({ 
                    id: originalRecord.id, 
                    status: updateData.status || 'On Time',
                    morning_absent: updateData.morning_absent || false,
                    afternoon_absent: updateData.afternoon_absent || false
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

// ========== SF2 EXPORT FUNCTION ==========
async function exportHomeroomAttendanceToCSV() {
    if (!students.length || !currentYearMonth) {
        showNotification('No data to export', 'info');
        return;
    }

    // 1. Get class details (grade, section, school name)
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
        // Fetch school name if school_id exists
        if (schoolId) {
            const { data: school } = await supabase
                .from('schools')
                .select('name')
                .eq('id', schoolId)
                .single();
            if (school) schoolName = school.name;
        }
    } catch (err) { console.warn('Could not fetch school details', err); }

    // 2. Prepare dates (only school days – no weekends, no holidays, not future)
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

    // 3. Helper: get final status for a student on a given date
    function getFinalStatus(studentId, date) {
        // pending takes precedence
        const pending = pendingUpdates[studentId]?.[date];
        if (pending && pending.status !== undefined) return pending.status;

        const original = attendanceData[studentId]?.[date] || {};
        // If we have half‑day info, we might treat a single missed session as "Tardy"
        const morningAbsent = pending?.morning_absent !== undefined ? pending.morning_absent : (original.morning_absent || false);
        const afternoonAbsent = pending?.afternoon_absent !== undefined ? pending.afternoon_absent : (original.afternoon_absent || false);
        const halfDayAbsent = (morningAbsent && !afternoonAbsent) || (!morningAbsent && afternoonAbsent);
        
        let status = original.status || 'On Time';
        if (pending && pending.status !== undefined) status = pending.status;
        
        // If half‑day absent but status is not already Late/Absent, treat as Tardy
        if (halfDayAbsent && status === 'On Time') return 'Late';
        return status;
    }

    // 4. Map internal status to SF2 codes
    function statusToSF2Code(status) {
        switch (status) {
            case 'On Time': return '';      // blank = Present
            case 'Late':    return 'T';     // Tardy
            case 'Absent':  return 'X';     // Absent
            case 'Excused': return 'E';
            default:        return '';
        }
    }

    // 5. Build CSV rows
    let csvRows = [];

    // --- Header block (SF2 style) ---
    csvRows.push(['"School Form 2 (SF2) Daily Attendance Report of Learners"', '', '', '', '', '', '', '', '', '']);
    csvRows.push(['(This replaced Form 1, Form 2 & STS Form 4 - Absenteeism and Dropout Profile)', '', '', '', '', '', '', '', '', '']);
    csvRows.push([]);
    csvRows.push([`"School ID: ${schoolId}"`, '', '', '', '', `"School Year: ${schoolYear}"`, '', '', `"Report for the Month of: ${monthName}"`, '']);
    csvRows.push([`"School Name: ${schoolName}"`, '', '', '', '', '', '', '', `"Grade Level: ${gradeLevel}"`, `"Section: ${section}"`]);
    csvRows.push([]);

    // Column headers: Learner's Name, then each day's date (day number)
    const dayColumns = schoolDays.map(d => new Date(d).getDate().toString());
    const headerRow = [
        'LEARNER\'S NAME (Last Name, First Name, Middle Name)',
        ...dayColumns,
        'ABSENT', 'TARDY', 'REMARK/S'
    ];
    csvRows.push(headerRow);

    // 6. Per‑student data
    let totalAbsentAll = 0;
    let totalTardyAll = 0;
    const dailyPresentCount = new Array(schoolDays.length).fill(0);

    for (const student of students) {
        const fullName = student.full_name || '';
        // Parse name: assume "Last, First Middle" or simple
        let formattedName = fullName;
        if (fullName.includes(',')) {
            formattedName = fullName; // already last, first
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
            // For daily present count: count if present (blank) or excused (E)
            if (code === '' || code === 'E') dailyPresentCount[idx]++;
        }
        
        totalAbsentAll += absentCount;
        totalTardyAll += tardyCount;
        
        const studentRow = [formattedName, ...dailyCodes, absentCount, tardyCount, ''];
        csvRows.push(studentRow);
    }

    // 7. Summary rows (MALE/FEMALE totals – we skip gender if not available)
    // Add daily total row
    const totalPresentRow = ['TOTAL Present (Daily)'];
    for (let idx = 0; idx < schoolDays.length; idx++) {
        totalPresentRow.push(dailyPresentCount[idx]);
    }
    totalPresentRow.push('', '', '');
    csvRows.push(totalPresentRow);
    csvRows.push([]);

    // Enrolment & attendance summary
    const enrolledMale = 0;   // not tracked – leave 0
    const enrolledFemale = 0;
    const enrolledTotal = students.length;
    const endOfMonthEnrolled = students.length; // assuming no transfers
    const percentageEnrolment = ((endOfMonthEnrolled / enrolledTotal) * 100).toFixed(1);
    const totalSchoolDays = schoolDays.length;
    const avgDailyAttendance = (dailyPresentCount.reduce((a,b) => a+b,0) / totalSchoolDays).toFixed(1);
    const attendancePercent = ((avgDailyAttendance / endOfMonthEnrolled) * 100).toFixed(1);

    csvRows.push(['Summary for the Month', '', '', '', '', '', '', '', '', '']);
    csvRows.push(['', 'M', 'F', 'TOTAL', '', '', '', '', '', '']);
    csvRows.push([`Enrolment as of 1st Friday of June`, enrolledMale, enrolledFemale, enrolledTotal, '', '', '', '', '', '']);
    csvRows.push([`Registered Learner as of end of the month`, '', '', endOfMonthEnrolled, '', '', '', '', '', '']);
    csvRows.push([`Percentage of Enrolment as of end of the month`, `${percentageEnrolment}%`, '', '', '', '', '', '', '', '', '']);
    csvRows.push([`Average Daily Attendance`, avgDailyAttendance, '', '', '', '', '', '', '', '', '']);
    csvRows.push([`Percentage of Attendance for the month`, `${attendancePercent}%`, '', '', '', '', '', '', '', '', '']);
    csvRows.push([`Number of students with 5 consecutive days of absences:`, '', '', '', '', '', '', '', '', '', '']); // optional
    csvRows.push([`Drop out`, '', '', '', '', '', '', '', '', '', '']);
    csvRows.push([`Transferred out`, '', '', '', '', '', '', '', '', '', '']);
    csvRows.push([`Transferred in`, '', '', '', '', '', '', '', '', '', '']);
    csvRows.push([]);
    csvRows.push([`I certify that this is a true and correct report.`, '', '', '', '', '', '', '', '', '', '']);
    csvRows.push([`(Signature of Teacher over Printed Name)`, '', '', '', '', '', '', '', '', '', '']);
    csvRows.push([`Attested by:`, '', '', '', '', '', '', '', '', '', '']);
    csvRows.push([`(Signature of School Head over Printed Name)`, '', '', '', '', '', '', '', '', '', '']);

    // 8. Create and download CSV
    const csvContent = csvRows.map(row => 
        row.map(cell => {
            if (cell === undefined || cell === null) return '';
            const str = String(cell);
            // Escape quotes and wrap if contains comma or newline
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
    link.setAttribute('download', `SF2_${gradeLevel}_${section}_${currentYearMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotification('SF2 CSV exported successfully', 'success');
}

// Overwrite the old function
window.exportHomeroomAttendanceToCSV = exportHomeroomAttendanceToCSV;