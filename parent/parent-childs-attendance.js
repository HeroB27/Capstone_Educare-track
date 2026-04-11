// parent-childs-attendance.js – Clean calendar with correct attendance logic

let currentViewDate = new Date();
let attendanceData = {};
let holidaysInMonth = [];
let attendanceChart = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (window.currentChild) await loadAttendanceCalendar();
    document.addEventListener('childChanged', () => loadAttendanceCalendar());
});

async function loadAttendanceCalendar() {
    if (!window.currentChild) return;
    document.getElementById('loading-indicator')?.classList.remove('hidden');
    document.getElementById('attendance-content')?.classList.add('hidden');

    await Promise.all([loadMonthAttendance(), loadMonthHolidays()]);
    renderCalendar();
    await calculateStatsAndChart();
    document.getElementById('loading-indicator')?.classList.add('hidden');
    document.getElementById('attendance-content')?.classList.remove('hidden');
}

async function loadMonthAttendance() {
    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();
    const { start, end } = getMonthBounds(year, month);
    const { data, error } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('student_id', window.currentChild.id)
        .gte('log_date', start)
        .lte('log_date', end);
    if (!error) {
        attendanceData = {};
        data?.forEach(log => { attendanceData[log.log_date] = log; });
    }
}

async function loadMonthHolidays() {
    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();
    const { start, end } = getMonthBounds(year, month);
    holidaysInMonth = await fetchHolidays(start, end);
}

function renderCalendar() {
    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('current-month').innerText = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = getLocalDateString();

    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    // Empty cells for days before month starts (shift for Sun=0)
    for (let i = 0; i < firstDay; i++) grid.appendChild(document.createElement('div'));

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = dateStr === todayStr;
        const holiday = holidaysInMonth.find(h => h.holiday_date === dateStr);
        const log = attendanceData[dateStr];
        const dayStatus = getDayStatus(log, holiday, dateStr);
        const cell = document.createElement('div');
        cell.className = `h-12 rounded-lg flex items-center justify-center text-sm font-medium cursor-pointer transition ${dayStatus.class}`;
        if (isToday) cell.classList.add('ring-2', 'ring-green-600');
        cell.innerText = day;
        cell.onclick = () => showDayDetails(dateStr, log, holiday);
        grid.appendChild(cell);
    }
}

function getDayStatus(log, holiday, dateStr) {
    const today = getLocalDateString();
    if (dateStr > today) return { class: 'bg-gray-100 text-gray-400' };
    if (holiday?.is_suspended) return { class: 'bg-gray-200 text-gray-400' };
    if (holiday) return { class: 'bg-purple-200 text-purple-800' };
    if (isWeekend(dateStr)) return { class: 'bg-gray-100 text-gray-400' };
    if (!log) return { class: 'bg-red-200 text-red-800' };
    
    const status = (log.status || '').toLowerCase();
    const morningAbsent = log.morning_absent || false;
    const afternoonAbsent = log.afternoon_absent || false;
    
    // Check for half-day (one session absent, one present)
    const isHalfDay = morningAbsent !== afternoonAbsent;
    
    if (isHalfDay) return { class: 'bg-orange-200 text-orange-800' };
    if (status === 'late') return { class: 'bg-yellow-200 text-yellow-800' };
    if (status === 'excused') return { class: 'bg-purple-200 text-purple-800' };
    if (status === 'absent') return { class: 'bg-red-200 text-red-800' };
    return { class: 'bg-green-200 text-green-800' }; // present / on time
}

function showDayDetails(dateStr, log, holiday) {
    const detailsDiv = document.getElementById('day-details');
    const contentDiv = document.getElementById('day-content');
    detailsDiv.classList.remove('hidden');
    if (holiday) {
        contentDiv.innerHTML = `<div class="font-bold text-purple-700">${escapeHtml(holiday.description)}</div><div class="text-gray-600">${formatDate(dateStr)}</div>`;
    } else if (!log) {
        contentDiv.innerHTML = `<div class="font-bold text-gray-700">No record</div><div class="text-gray-600">${formatDate(dateStr)}</div>`;
    } else {
        const morningAbsent = log.morning_absent || false;
        const afternoonAbsent = log.afternoon_absent || false;
        const isHalfDay = morningAbsent !== afternoonAbsent;
        
        let icon = '✅';
        if (log.status?.toLowerCase() === 'late') icon = '⏰';
        else if (log.status?.toLowerCase() === 'excused') icon = '📝';
        else if (isHalfDay) icon = '🕐';
        
        let statusLabel = log.status || 'Present';
        if (isHalfDay) {
            statusLabel = 'Half Day';
            if (morningAbsent) statusLabel += ' (AM Absent)';
            else statusLabel += ' (PM Absent)';
        }
        
        contentDiv.innerHTML = `
            <div class="flex items-center gap-2 mb-2"><span class="text-3xl">${icon}</span><span class="font-bold">${escapeHtml(statusLabel)}</span></div>
            <div class="text-gray-600">${formatDate(dateStr)}</div>
            ${log.time_in ? `<div class="mt-2">Time in: ${formatTime(log.time_in)}</div>` : ''}
            ${log.time_out ? `<div>Time out: ${formatTime(log.time_out)}</div>` : ''}
            ${log.remarks ? `<div class="mt-2 text-sm">Remarks: ${escapeHtml(log.remarks)}</div>` : ''}
        `;
    }
}

async function calculateStatsAndChart() {
    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();
    const stats = await calculateAttendanceStats(window.currentChild.id, year, month);
    document.getElementById('stat-present').innerText = stats.present;
    document.getElementById('stat-late').innerText = stats.late;
    document.getElementById('stat-absent').innerText = stats.absent;
    document.getElementById('stat-halfday')?.insertAdjacentHTML('beforeend', `<span class="text-orange-600 font-bold">${stats.halfday || 0}</span>`);
    document.getElementById('stat-percent').innerText = `${stats.percentage}%`;
    renderTrendChart(stats);
}

function renderTrendChart(stats) {
    const ctx = document.getElementById('attendanceChart')?.getContext('2d');
    if (!ctx) return;
    if (attendanceChart) attendanceChart.destroy();
    attendanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Present', 'Late', 'Excused', 'Absent'],
            datasets: [{ label: 'Days', data: [stats.present, stats.late, stats.excused, stats.absent], backgroundColor: ['#22c55e', '#f59e0b', '#3b82f6', '#ef4444'] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }
    });
}

function changeMonth(delta) {
    currentViewDate.setMonth(currentViewDate.getMonth() + delta);
    loadAttendanceCalendar();
}

function exportToCSV() {
    if (!Object.keys(attendanceData).length) return alert('No data to export');
    let csv = 'Date,Status,Time In,Time Out,Remarks\n';
    for (const [date, log] of Object.entries(attendanceData)) {
        csv += `${date},${log.status || ''},${formatTime(log.time_in)},${formatTime(log.time_out)},"${(log.remarks || '').replace(/"/g, '""')}"\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `attendance_${window.currentChild.full_name}_${getLocalDateString(currentViewDate)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

window.loadAttendanceCalendar = loadAttendanceCalendar;
window.changeMonth = changeMonth;
window.exportToCSV = exportToCSV;