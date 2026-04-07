// parent-utils.js – Shared helpers

function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getMonthBounds(year, month) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    return {
        start: getLocalDateString(firstDay),
        end: getLocalDateString(lastDay)
    };
}

function isWeekend(dateStr) {
    const date = new Date(dateStr);
    const day = date.getDay();
    return day === 0 || day === 6;
}

async function fetchHolidays(startDate, endDate) {
    const { data, error } = await supabase
        .from('holidays')
        .select('holiday_date, description, is_suspended')
        .gte('holiday_date', startDate)
        .lte('holiday_date', endDate);
    if (error) {
        console.error('Error fetching holidays:', error);
        return [];
    }
    return data || [];
}

function getSchoolDaysList(startDate, endDate, maxDate = null) {
    const schoolDays = [];
    let current = new Date(startDate);
    const end = new Date(endDate);
    const limit = maxDate ? new Date(maxDate) : end;

    while (current <= end && current <= limit) {
        const dateStr = getLocalDateString(current);
        if (!isWeekend(dateStr)) {
            schoolDays.push(dateStr);
        }
        current.setDate(current.getDate() + 1);
    }
    return schoolDays;
}

async function calculateAttendanceStats(studentId, year, month) {
    const { start, end } = getMonthBounds(year, month);
    const today = getLocalDateString();

    const { data: logs, error } = await supabase
        .from('attendance_logs')
        .select('log_date, status')
        .eq('student_id', studentId)
        .gte('log_date', start)
        .lte('log_date', end);
    if (error) throw error;

    const holidays = await fetchHolidays(start, end);
    const holidaySet = new Set(holidays.filter(h => h.is_suspended).map(h => h.holiday_date));

    const schoolDaysList = getSchoolDaysList(start, end, today);
    const schoolDays = schoolDaysList.filter(d => !holidaySet.has(d));

    let present = 0, late = 0, excused = 0, absent = 0;
    for (const date of schoolDays) {
        const log = logs?.find(l => l.log_date === date);
        if (!log) {
            absent++;
        } else {
            const status = (log.status || '').toLowerCase();
            if (status === 'late') late++;
            else if (status === 'excused') excused++;
            else if (status === 'absent') absent++;
            else present++;
        }
    }

    const percentage = schoolDays.length > 0
        ? Math.round(((present + excused) / schoolDays.length) * 100)
        : 100;

    return { present, late, excused, absent, percentage, totalSchoolDays: schoolDays.length };
}

function formatTime(timeStr) {
    if (!timeStr) return '--:--';
    let date;
    if (typeof timeStr === 'string' && timeStr.includes(':') && !timeStr.includes('T')) {
        date = new Date(`1970-01-01T${timeStr}`);
    } else {
        date = new Date(timeStr);
    }
    if (isNaN(date.getTime())) return '--:--';
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDate(dateStr) {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getRelativeTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hr ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return formatDate(dateStr);
}

function getInitials(fullName) {
    if (!fullName) return '?';
    return fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// Expose globally
window.getLocalDateString = getLocalDateString;
window.getMonthBounds = getMonthBounds;
window.isWeekend = isWeekend;
window.fetchHolidays = fetchHolidays;
window.getSchoolDaysList = getSchoolDaysList;
window.calculateAttendanceStats = calculateAttendanceStats;
window.formatTime = formatTime;
window.formatDate = formatDate;
window.getRelativeTime = getRelativeTime;
window.getInitials = getInitials;