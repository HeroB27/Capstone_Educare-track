// admin/admin-data-analytics.js
// Real‑time Data Analytics with proper excused handling and date range filters

let trendChart, pieChart, barChart, classChart;
let analyticsData = {};

document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    document.getElementById('dateEnd').value = today.toISOString().split('T')[0];
    document.getElementById('dateStart').value = lastWeek.toISOString().split('T')[0];

    document.getElementById('dateStart').addEventListener('change', () => loadAnalyticsData());
    document.getElementById('dateEnd').addEventListener('change', () => loadAnalyticsData());

    initializeEmptyCharts();
    loadAnalyticsData();
});

async function loadAnalyticsData(event) {
    const btn = event?.currentTarget;
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>';
        lucide.createIcons();
    }
    const dateStart = document.getElementById('dateStart').value;
    const dateEnd = document.getElementById('dateEnd').value;

    try {
        const { data: suspensions } = await supabase
            .from('holidays')
            .select('holiday_date')
            .eq('is_suspended', true)
            .gte('holiday_date', dateStart)
            .lte('holiday_date', dateEnd);
        const suspensionDays = suspensions?.length || 0;

        const [trendData, statusData, reasonsData, classData, criticalData, lateData] = await Promise.all([
            fetchAttendanceTrend(dateStart, dateEnd),
            fetchStatusDistribution(dateStart, dateEnd),
            fetchCommonReasons(dateStart, dateEnd),
            fetchClassPerformance(dateStart, dateEnd),
            fetchCriticalAbsences(dateStart, dateEnd),
            fetchFrequentLate(dateStart, dateEnd)
        ]);

        analyticsData = { attendanceTrend: trendData, statusDistribution: statusData, commonReasons: reasonsData, classPerformance: classData, criticalStudents: criticalData, frequentLate: lateData, suspensionDays };

        updateTrendChart(trendData, { dateStart, dateEnd, suspensionDays });
        updatePieChart(statusData);
        updateBarChart(reasonsData);
        updateClassChart(classData, { suspensionDays });
        updateCriticalList(criticalData);
        updateLateList(lateData);
    } catch (error) { console.error(error); }
    finally { if (btn) { btn.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4"></i>'; lucide.createIcons(); } }
}

async function fetchAttendanceTrend(dateStart, dateEnd) {
    const { data: logs } = await supabase
        .from('attendance_logs')
        .select('student_id, log_date, status')
        .gte('log_date', dateStart)
        .lte('log_date', dateEnd)
        .order('log_date');
    if (!logs?.length) return { labels: [], present: [], late: [], absent: [], excused: [] };

    const { data: excuses } = await supabase
        .from('excuse_letters')
        .select('student_id, date_absent')
        .eq('status', 'Approved')
        .gte('date_absent', dateStart)
        .lte('date_absent', dateEnd);
    const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);

    const dateGroups = {};
    logs.forEach(log => {
        const date = log.log_date;
        if (!dateGroups[date]) dateGroups[date] = { Present: 0, Late: 0, Absent: 0, Excused: 0 };
        const isExcused = excusedSet.has(`${log.student_id}-${log.log_date}`);
        if (isExcused) dateGroups[date].Excused++;
        else if (log.status === 'Present' || log.status === 'On Time') dateGroups[date].Present++;
        else if (log.status === 'Late') dateGroups[date].Late++;
        else if (log.status === 'Absent') dateGroups[date].Absent++;
    });
    const sortedDates = Object.keys(dateGroups).sort();
    return {
        labels: sortedDates.map(d => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })),
        present: sortedDates.map(d => dateGroups[d].Present),
        late: sortedDates.map(d => dateGroups[d].Late),
        absent: sortedDates.map(d => dateGroups[d].Absent),
        excused: sortedDates.map(d => dateGroups[d].Excused)
    };
}

async function fetchStatusDistribution(dateStart, dateEnd) {
    const { data: logs } = await supabase
        .from('attendance_logs')
        .select('student_id, log_date, status')
        .gte('log_date', dateStart)
        .lte('log_date', dateEnd);
    if (!logs?.length) return { Present: 0, Late: 0, Absent: 0, Excused: 0 };

    const { data: excuses } = await supabase
        .from('excuse_letters')
        .select('student_id, date_absent')
        .eq('status', 'Approved')
        .gte('date_absent', dateStart)
        .lte('date_absent', dateEnd);
    const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);

    const counts = { Present: 0, Late: 0, Absent: 0, Excused: 0 };
    logs.forEach(log => {
        const isExcused = excusedSet.has(`${log.student_id}-${log.log_date}`);
        if (isExcused) counts.Excused++;
        else if (log.status === 'Present' || log.status === 'On Time') counts.Present++;
        else if (log.status === 'Late') counts.Late++;
        else if (log.status === 'Absent') counts.Absent++;
    });
    return counts;
}

async function fetchCommonReasons(dateStart, dateEnd) {
    const reasons = {};
    const { data: excuses } = await supabase.from('excuse_letters').select('reason').gte('date_absent', dateStart).lte('date_absent', dateEnd);
    excuses?.forEach(e => { const r = e.reason || 'Other'; reasons[r] = (reasons[r] || 0) + 1; });
    const { data: clinic } = await supabase.from('clinic_visits').select('reason').gte('time_in', `${dateStart}T00:00:00`).lte('time_in', `${dateEnd}T23:59:59`);
    clinic?.forEach(v => { const r = v.reason || 'Other'; reasons[r] = (reasons[r] || 0) + 1; });
    const sorted = Object.entries(reasons).sort((a,b) => b[1] - a[1]).slice(0,8);
    return { labels: sorted.map(s => s[0]), data: sorted.map(s => s[1]) };
}

async function fetchClassPerformance(dateStart, dateEnd) {
    const { data: classes } = await supabase.from('classes').select('id, grade_level');
    if (!classes?.length) return { labels: [], data: [] };
    const { data: students } = await supabase.from('students').select('id, class_id');
    const studentClassMap = Object.fromEntries(students?.map(s => [s.id, s.class_id]) || []);
    const { data: logs } = await supabase.from('attendance_logs').select('student_id, log_date, status').gte('log_date', dateStart).lte('log_date', dateEnd);
    const { data: excuses } = await supabase.from('excuse_letters').select('student_id, date_absent').eq('status', 'Approved').gte('date_absent', dateStart).lte('date_absent', dateEnd);
    const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);

    const classStats = {};
    classes.forEach(c => { classStats[c.id] = { total: 0, present: 0 }; });
    logs?.forEach(log => {
        const classId = studentClassMap[log.student_id];
        if (classId && classStats[classId]) {
            classStats[classId].total++;
            const isExcused = excusedSet.has(`${log.student_id}-${log.log_date}`);
            if (log.status === 'Present' || log.status === 'On Time' || isExcused) classStats[classId].present++;
        }
    });
    const rates = Object.entries(classStats)
        .filter(([_, s]) => s.total > 0)
        .map(([id, s]) => ({ label: classes.find(c => c.id == id)?.grade_level || 'Unknown', rate: Math.round((s.present / s.total) * 100) }))
        .sort((a,b) => b.rate - a.rate).slice(0,10);
    return { labels: rates.map(r => r.label), data: rates.map(r => r.rate) };
}

async function fetchCriticalAbsences(dateStart, dateEnd) {
    const { data: students } = await supabase.from('students').select('id, full_name, student_id_text');
    if (!students?.length) return [];
    const { data: excuses } = await supabase.from('excuse_letters').select('student_id, date_absent').eq('status', 'Approved').gte('date_absent', dateStart).lte('date_absent', dateEnd);
    const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);
    const { data: logs } = await supabase.from('attendance_logs').select('student_id, log_date, status').gte('log_date', dateStart).lte('log_date', dateEnd);
    const absenceCount = {};
    students.forEach(s => { absenceCount[s.id] = { name: s.full_name, id: s.student_id_text, absent: 0 }; });
    logs?.forEach(log => {
        if (absenceCount[log.student_id] && log.status === 'Absent') {
            const key = `${log.student_id}-${log.log_date}`;
            if (!excusedSet.has(key)) absenceCount[log.student_id].absent++;
        }
    });
    return Object.values(absenceCount).filter(s => s.absent > 10).sort((a,b) => b.absent - a.absent).slice(0,10);
}

async function fetchFrequentLate(dateStart, dateEnd) {
    const { data: logs } = await supabase.from('attendance_logs').select('student_id').eq('status', 'Late').gte('log_date', dateStart).lte('log_date', dateEnd);
    if (!logs?.length) return [];
    const lateCounts = {};
    logs.forEach(log => lateCounts[log.student_id] = (lateCounts[log.student_id] || 0) + 1);
    const studentIds = Object.keys(lateCounts).map(Number);
    if (!studentIds.length) return [];
    const { data: students } = await supabase.from('students').select('id, full_name, student_id_text').in('id', studentIds);
    const studentMap = Object.fromEntries(students?.map(s => [s.id, s]) || []);
    return Object.entries(lateCounts).map(([id, count]) => ({ name: studentMap[id]?.full_name || 'Unknown', id: studentMap[id]?.student_id_text || '', count })).sort((a,b) => b.count - a.count).slice(0,10);
}

// Chart update functions
function updateTrendChart(data, options) {
    if (!data || !data.labels || data.labels.length === 0) {
        if (trendChart) trendChart.destroy();
        const ctx = document.getElementById('trendChart').getContext('2d');
        trendChart = new Chart(ctx, { type: 'line', data: { labels: ['No Data'], datasets: [{ label: 'No Data', data: [0], borderColor: '#cbd5e1', borderDash: [5,5] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
        return;
    }
    if (!trendChart) {
        const ctx = document.getElementById('trendChart').getContext('2d');
        trendChart = new Chart(ctx, { type: 'line', options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } } });
    }
    trendChart.data.labels = data.labels;
    trendChart.data.datasets = [
        { label: 'Present', data: data.present, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.4 },
        { label: 'Late', data: data.late, borderColor: '#eab308', backgroundColor: 'rgba(234,179,8,0.1)', fill: true, tension: 0.4 },
        { label: 'Absent', data: data.absent, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.4 },
        { label: 'Excused', data: data.excused, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.4 }
    ];
    trendChart.update();
}

function updatePieChart(data) {
    if (!pieChart) {
        const ctx = document.getElementById('pieChart').getContext('2d');
        pieChart = new Chart(ctx, { type: 'doughnut', options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '70%' } });
    }
    pieChart.data.labels = ['Present', 'Late', 'Absent', 'Excused'];
    pieChart.data.datasets = [{ data: [data.Present || 0, data.Late || 0, data.Absent || 0, data.Excused || 0], backgroundColor: ['#22c55e', '#eab308', '#ef4444', '#3b82f6'] }];
    pieChart.update();
}

function updateBarChart(data) {
    if (!barChart) {
        const ctx = document.getElementById('barChart').getContext('2d');
        barChart = new Chart(ctx, { type: 'bar', options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
    }
    barChart.data.labels = data.labels || [];
    barChart.data.datasets = [{ label: 'Incidents', data: data.data || [], backgroundColor: '#8b5cf6', borderRadius: 6 }];
    barChart.update();
}

function updateClassChart(data, options) {
    if (!data || !data.labels || data.labels.length === 0) {
        if (classChart) classChart.destroy();
        const ctx = document.getElementById('classChart').getContext('2d');
        classChart = new Chart(ctx, { type: 'bar', data: { labels: ['No Data'], datasets: [{ label: 'Attendance Rate', data: [0], backgroundColor: '#cbd5e1' }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v+'%' } } } } });
        return;
    }
    if (!classChart) {
        const ctx = document.getElementById('classChart').getContext('2d');
        classChart = new Chart(ctx, { type: 'bar', options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v+'%' } } } } });
    }
    classChart.data.labels = data.labels;
    classChart.data.datasets = [{ label: 'Attendance Rate (%)', data: data.data, backgroundColor: data.data.map(r => r >= 90 ? '#22c55e' : r >= 75 ? '#eab308' : '#ef4444'), borderRadius: 6 }];
    classChart.update();
}

function updateCriticalList(students) {
    const container = document.getElementById('criticalListContainer');
    if (!students || students.length === 0) { container.innerHTML = '<div class="text-center text-gray-400 py-4 italic">No critical cases found</div>'; return; }
    container.innerHTML = students.map(s => `
        <div class="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-xl">
            <div><div class="h-10 w-10 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-bold">${s.name.charAt(0)}</div></div>
            <div class="flex-1 px-3"><p class="font-bold text-gray-900 text-sm">${escapeHtml(s.name)}</p><p class="text-xs text-gray-400">ID: ${s.id}</p></div>
            <div class="text-right"><p class="font-black text-red-600 text-lg">${s.absent}</p><p class="text-[10px] text-gray-400 font-bold uppercase">absences</p></div>
        </div>
    `).join('');
}

function updateLateList(students) {
    const container = document.getElementById('lateListContainer');
    if (!students || students.length === 0) { container.innerHTML = '<div class="text-center text-gray-400 py-4 italic">No late incidents found</div>'; return; }
    container.innerHTML = students.map(s => `
        <div class="flex items-center justify-between p-3 bg-amber-50 border border-amber-100 rounded-xl">
            <div><div class="h-10 w-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 font-bold">${s.name.charAt(0)}</div></div>
            <div class="flex-1 px-3"><p class="font-bold text-gray-900 text-sm">${escapeHtml(s.name)}</p><p class="text-xs text-gray-400">ID: ${s.id}</p></div>
            <div class="text-right"><p class="font-black text-amber-600 text-lg">${s.count}</p><p class="text-[10px] text-gray-400 font-bold uppercase">lates</p></div>
        </div>
    `).join('');
}

function exportToCSV() {
    const start = document.getElementById('dateStart').value;
    const end = document.getElementById('dateEnd').value;
    let csv = `Educare Analytics Report\nDate Range: ${start} to ${end}\n\n`;
    csv += `STATUS DISTRIBUTION\nStatus,Count\nPresent,${analyticsData.statusDistribution?.Present || 0}\nLate,${analyticsData.statusDistribution?.Late || 0}\nAbsent,${analyticsData.statusDistribution?.Absent || 0}\nExcused,${analyticsData.statusDistribution?.Excused || 0}\n\n`;
    csv += `COMMON REASONS\nReason,Count\n${analyticsData.commonReasons?.labels?.map((l,i)=>`${l},${analyticsData.commonReasons.data[i]}`).join('\n') || ''}\n\n`;
    csv += `CLASS PERFORMANCE\nClass,Attendance Rate (%)\n${analyticsData.classPerformance?.labels?.map((l,i)=>`${l},${analyticsData.classPerformance.data[i]}`).join('\n') || ''}\n\n`;
    csv += `CRITICAL WATCHLIST (>10 Absences)\nStudent Name,Student ID,Absence Count\n${analyticsData.criticalStudents?.map(s=>`${s.name},${s.id},${s.absent}`).join('\n') || ''}\n\n`;
    csv += `FREQUENT LATE ARRIVALS\nStudent Name,Student ID,Late Count\n${analyticsData.frequentLate?.map(s=>`${s.name},${s.id},${s.count}`).join('\n') || ''}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Educare_Analytics_${start}_to_${end}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

function initializeEmptyCharts() {
    const ctx1 = document.getElementById('trendChart').getContext('2d');
    trendChart = new Chart(ctx1, { type: 'line', data: { labels: ['No Data'], datasets: [{ label: 'No Data', data: [0], borderColor: '#cbd5e1', borderDash: [5,5] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
    const ctx2 = document.getElementById('pieChart').getContext('2d');
    pieChart = new Chart(ctx2, { type: 'doughnut', data: { labels: ['Present','Late','Absent','Excused'], datasets: [{ data: [0,0,0,0], backgroundColor: ['#f1f5f9','#e2e8f0','#cbd5e1','#94a3b8'] }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '70%' } });
    const ctx3 = document.getElementById('barChart').getContext('2d');
    barChart = new Chart(ctx3, { type: 'bar', data: { labels: ['No Data'], datasets: [{ label: 'Incidents', data: [0], backgroundColor: '#cbd5e1' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
    const ctx4 = document.getElementById('classChart').getContext('2d');
    classChart = new Chart(ctx4, { type: 'bar', data: { labels: ['No Data'], datasets: [{ label: 'Attendance Rate', data: [0], backgroundColor: '#cbd5e1' }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v+'%' } } } } });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.loadAnalyticsData = loadAnalyticsData;
window.exportToCSV = exportToCSV;