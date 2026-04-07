// admin/admin-data-analytics.js – Enhanced version with predictive analysis, class filter, average attendance, and combined lates+absences list

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
    document.getElementById('class-filter').addEventListener('change', () => loadAnalyticsData());

    initializeEmptyCharts();
    populateClassFilter();
    loadAnalyticsData();
});

async function populateClassFilter() {
    const { data: classes } = await supabase.from('classes').select('id, grade_level');
    const filter = document.getElementById('class-filter');
    if (filter && classes) {
        filter.innerHTML = '<option value="">All Classes</option>' + classes.map(c => `<option value="${c.id}">${escapeHtml(c.grade_level)}</option>`).join('');
        lucide.createIcons();
    }
}

async function loadAnalyticsData(event) {
    const btn = event?.currentTarget;
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>';
        lucide.createIcons();
    }
    const dateStart = document.getElementById('dateStart').value;
    const dateEnd = document.getElementById('dateEnd').value;
    const classFilter = document.getElementById('class-filter')?.value || null;

    try {
        const { data: suspensions } = await supabase
            .from('holidays')
            .select('holiday_date')
            .eq('is_suspended', true)
            .gte('holiday_date', dateStart)
            .lte('holiday_date', dateEnd);
        const suspensionDays = suspensions?.length || 0;

        const [trendData, statusData, reasonsData, classData, criticalData, lateData, riskData, avgAttendance, combinedData] = await Promise.all([
            fetchAttendanceTrend(dateStart, dateEnd, classFilter),
            fetchStatusDistribution(dateStart, dateEnd, classFilter),
            fetchCommonReasons(dateStart, dateEnd, classFilter),
            fetchClassPerformance(dateStart, dateEnd, classFilter),
            fetchCriticalAbsences(dateStart, dateEnd, classFilter),
            fetchFrequentLate(dateStart, dateEnd, classFilter),
            fetchPredictiveRisk(dateStart, dateEnd, classFilter),
            fetchAverageAttendanceRate(dateStart, dateEnd, classFilter),
            fetchCombinedLatesAbsences(dateStart, dateEnd, classFilter)
        ]);

        analyticsData = {
            attendanceTrend: trendData,
            statusDistribution: statusData,
            commonReasons: reasonsData,
            classPerformance: classData,
            criticalStudents: criticalData,
            frequentLate: lateData,
            suspensionDays,
            riskStudents: riskData,
            avgAttendance,
            combinedLatesAbsences: combinedData
        };

        updateTrendChart(trendData, { dateStart, dateEnd, suspensionDays });
        updatePieChart(statusData);
        updateBarChart(reasonsData);
        updateClassChart(classData, { suspensionDays });
        updateCriticalList(criticalData);
        updateLateList(lateData);
        updateRiskList(riskData);
        updateAvgAttendance(avgAttendance);
        updateCombinedList(combinedData);
    } catch (error) { console.error(error); }
    finally { if (btn) { btn.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4"></i>'; lucide.createIcons(); } }
}

// --- NEW: Combined Lates & Absences (Top 10 by total) ---
async function fetchCombinedLatesAbsences(dateStart, dateEnd, classId = null) {
    let studentsQuery = supabase.from('students').select('id, full_name, student_id_text, class_id');
    if (classId) studentsQuery = studentsQuery.eq('class_id', classId);
    const { data: students } = await studentsQuery;
    if (!students?.length) return [];

    const { data: excuses } = await supabase
        .from('excuse_letters')
        .select('student_id, date_absent')
        .eq('status', 'Approved')
        .gte('date_absent', dateStart)
        .lte('date_absent', dateEnd);
    const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);

    let logsQuery = supabase
        .from('attendance_logs')
        .select('student_id, status, log_date')
        .gte('log_date', dateStart)
        .lte('log_date', dateEnd);
    if (classId) {
        const studentIds = students.map(s => s.id);
        if (studentIds.length) logsQuery = logsQuery.in('student_id', studentIds);
    }
    const { data: logs } = await logsQuery;
    if (!logs?.length) return [];

    const stats = {};
    students.forEach(s => {
        stats[s.id] = {
            name: s.full_name,
            student_id_text: s.student_id_text,
            lates: 0,
            absences: 0
        };
    });

    logs.forEach(log => {
        const studentStat = stats[log.student_id];
        if (!studentStat) return;
        const isExcused = excusedSet.has(`${log.student_id}-${log.log_date}`);
        if (isExcused) return;
        if (log.status === 'Late') {
            studentStat.lates++;
        } else if (log.status === 'Absent') {
            studentStat.absences++;
        }
    });

    const result = Object.values(stats)
        .map(s => ({ ...s, total: s.lates + s.absences }))
        .filter(s => s.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
    return result;
}

function updateCombinedList(students) {
    const container = document.getElementById('combinedListContainer');
    if (!students || students.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-4 italic">No data for the selected period</div>';
        return;
    }
    container.innerHTML = students.map(s => `
        <div class="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
            <div><div class="h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold">${s.name.charAt(0)}</div></div>
            <div class="flex-1 px-3"><p class="font-bold text-gray-900 text-sm">${escapeHtml(s.name)}</p><p class="text-xs text-gray-400">ID: ${s.student_id_text}</p></div>
            <div class="text-right flex gap-4">
                <div><p class="font-black text-amber-600 text-sm">${s.lates}</p><p class="text-[10px] text-gray-400">Lates</p></div>
                <div><p class="font-black text-red-600 text-sm">${s.absences}</p><p class="text-[10px] text-gray-400">Absences</p></div>
                <div><p class="font-black text-indigo-600 text-base">${s.total}</p><p class="text-[10px] text-gray-400">Total</p></div>
            </div>
        </div>
    `).join('');
}

// --- Data fetching functions with class filter support ---
async function fetchAttendanceTrend(dateStart, dateEnd, classId = null) {
    let query = supabase
        .from('attendance_logs')
        .select('student_id, log_date, status, students!inner(class_id)')
        .gte('log_date', dateStart)
        .lte('log_date', dateEnd)
        .order('log_date');
    
    if (classId) query = query.eq('students.class_id', classId);
    
    const { data: logs } = await query;
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

async function fetchStatusDistribution(dateStart, dateEnd, classId = null) {
    let query = supabase
        .from('attendance_logs')
        .select('student_id, log_date, status, students!inner(class_id)')
        .gte('log_date', dateStart)
        .lte('log_date', dateEnd);
    if (classId) query = query.eq('students.class_id', classId);
    const { data: logs } = await query;
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

async function fetchCommonReasons(dateStart, dateEnd, classId = null) {
    const reasons = {};
    let excusesQuery = supabase.from('excuse_letters').select('reason, student_id').gte('date_absent', dateStart).lte('date_absent', dateEnd);
    if (classId) {
        const { data: students } = await supabase.from('students').select('id').eq('class_id', classId);
        const studentIds = students?.map(s => s.id) || [];
        if (studentIds.length) excusesQuery = excusesQuery.in('student_id', studentIds);
    }
    const { data: excuses } = await excusesQuery;
    excuses?.forEach(e => { const r = e.reason || 'Other'; reasons[r] = (reasons[r] || 0) + 1; });

    let clinicQuery = supabase.from('clinic_visits').select('reason, student_id').gte('time_in', `${dateStart}T00:00:00`).lte('time_in', `${dateEnd}T23:59:59`);
    if (classId) {
        const { data: students } = await supabase.from('students').select('id').eq('class_id', classId);
        const studentIds = students?.map(s => s.id) || [];
        if (studentIds.length) clinicQuery = clinicQuery.in('student_id', studentIds);
    }
    const { data: clinic } = await clinicQuery;
    clinic?.forEach(v => { const r = v.reason || 'Other'; reasons[r] = (reasons[r] || 0) + 1; });

    const sorted = Object.entries(reasons).sort((a,b) => b[1] - a[1]).slice(0,8);
    return { labels: sorted.map(s => s[0]), data: sorted.map(s => s[1]) };
}

async function fetchClassPerformance(dateStart, dateEnd, classId = null) {
    let classesQuery = supabase.from('classes').select('id, grade_level');
    if (classId) classesQuery = classesQuery.eq('id', classId);
    const { data: classes } = await classesQuery;
    if (!classes?.length) return { labels: [], data: [] };
    
    const { data: students } = await supabase.from('students').select('id, class_id');
    const studentClassMap = Object.fromEntries(students?.map(s => [s.id, s.class_id]) || []);
    
    let logsQuery = supabase.from('attendance_logs').select('student_id, log_date, status').gte('log_date', dateStart).lte('log_date', dateEnd);
    if (classId) {
        const studentIds = Object.keys(studentClassMap).filter(id => studentClassMap[id] == classId);
        if (studentIds.length) logsQuery = logsQuery.in('student_id', studentIds);
    }
    const { data: logs } = await logsQuery;
    
    const { data: excuses } = await supabase.from('excuse_letters').select('student_id, date_absent').eq('status', 'Approved').gte('date_absent', dateStart).lte('date_absent', dateEnd);
    const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);

    const classStats = {};
    classes.forEach(c => { classStats[c.id] = { total: 0, present: 0 }; });
    logs?.forEach(log => {
        const classIdLog = studentClassMap[log.student_id];
        if (classIdLog && classStats[classIdLog]) {
            classStats[classIdLog].total++;
            const isExcused = excusedSet.has(`${log.student_id}-${log.log_date}`);
            if (log.status === 'Present' || log.status === 'On Time' || isExcused) classStats[classIdLog].present++;
        }
    });
    const rates = Object.entries(classStats)
        .filter(([_, s]) => s.total > 0)
        .map(([id, s]) => ({ label: classes.find(c => c.id == id)?.grade_level || 'Unknown', rate: Math.round((s.present / s.total) * 100) }))
        .sort((a,b) => b.rate - a.rate).slice(0,10);
    return { labels: rates.map(r => r.label), data: rates.map(r => r.rate) };
}

async function fetchCriticalAbsences(dateStart, dateEnd, classId = null) {
    let studentsQuery = supabase.from('students').select('id, full_name, student_id_text, class_id');
    if (classId) studentsQuery = studentsQuery.eq('class_id', classId);
    const { data: students } = await studentsQuery;
    if (!students?.length) return [];
    
    const { data: excuses } = await supabase.from('excuse_letters').select('student_id, date_absent').eq('status', 'Approved').gte('date_absent', dateStart).lte('date_absent', dateEnd);
    const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);
    
    let logsQuery = supabase.from('attendance_logs').select('student_id, log_date, status').gte('log_date', dateStart).lte('log_date', dateEnd);
    if (classId) {
        const studentIds = students.map(s => s.id);
        if (studentIds.length) logsQuery = logsQuery.in('student_id', studentIds);
    }
    const { data: logs } = await logsQuery;
    
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

async function fetchFrequentLate(dateStart, dateEnd, classId = null) {
    let logsQuery = supabase.from('attendance_logs').select('student_id').eq('status', 'Late').gte('log_date', dateStart).lte('log_date', dateEnd);
    if (classId) {
        const { data: students } = await supabase.from('students').select('id').eq('class_id', classId);
        const studentIds = students?.map(s => s.id) || [];
        if (studentIds.length) logsQuery = logsQuery.in('student_id', studentIds);
    }
    const { data: logs } = await logsQuery;
    if (!logs?.length) return [];
    const lateCounts = {};
    logs.forEach(log => lateCounts[log.student_id] = (lateCounts[log.student_id] || 0) + 1);
    const studentIds = Object.keys(lateCounts).map(Number);
    if (!studentIds.length) return [];
    const { data: students } = await supabase.from('students').select('id, full_name, student_id_text').in('id', studentIds);
    const studentMap = Object.fromEntries(students?.map(s => [s.id, s]) || []);
    return Object.entries(lateCounts).map(([id, count]) => ({ name: studentMap[id]?.full_name || 'Unknown', id: studentMap[id]?.student_id_text || '', count })).sort((a,b) => b.count - a.count).slice(0,10);
}

async function fetchPredictiveRisk(dateStart, dateEnd, classId = null) {
    let studentsQuery = supabase.from('students').select('id, full_name, student_id_text, class_id');
    if (classId) studentsQuery = studentsQuery.eq('class_id', classId);
    const { data: students } = await studentsQuery;
    if (!students?.length) return [];
    
    const { data: excuses } = await supabase.from('excuse_letters').select('student_id, date_absent').eq('status', 'Approved').gte('date_absent', dateStart).lte('date_absent', dateEnd);
    const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);
    
    let logsQuery = supabase.from('attendance_logs').select('student_id, status, log_date').gte('log_date', dateStart).lte('log_date', dateEnd);
    if (classId) {
        const studentIds = students.map(s => s.id);
        if (studentIds.length) logsQuery = logsQuery.in('student_id', studentIds);
    }
    const { data: logs } = await logsQuery;
    
    const stats = {};
    students.forEach(s => { stats[s.id] = { name: s.full_name, id: s.student_id_text, total: 0, absent: 0, late: 0 }; });
    logs?.forEach(log => {
        const s = stats[log.student_id];
        if (s) {
            s.total++;
            const isExcused = excusedSet.has(`${log.student_id}-${log.log_date}`);
            if (!isExcused) {
                if (log.status === 'Absent') s.absent++;
                else if (log.status === 'Late') s.late++;
            }
        }
    });
    
    const riskStudents = [];
    for (const [_, s] of Object.entries(stats)) {
        if (s.total === 0) continue;
        const absenceRate = (s.absent / s.total) * 100;
        const lateRate = (s.late / s.total) * 100;
        let riskLevel = 'none';
        let reason = '';
        if (absenceRate > 15) {
            riskLevel = 'high';
            reason = `High absence risk (${Math.round(absenceRate)}% absent)`;
        } else if (absenceRate > 10) {
            riskLevel = 'medium';
            reason = `Moderate absence risk (${Math.round(absenceRate)}% absent)`;
        } else if (lateRate > 25) {
            riskLevel = 'medium';
            reason = `Excessive tardiness (${Math.round(lateRate)}% late)`;
        } else if (lateRate > 15) {
            riskLevel = 'low';
            reason = `Frequent lateness (${Math.round(lateRate)}% late)`;
        }
        if (riskLevel !== 'none') {
            riskStudents.push({ ...s, riskLevel, reason, absenceRate: Math.round(absenceRate), lateRate: Math.round(lateRate) });
        }
    }
    return riskStudents.sort((a,b) => b.absenceRate - a.absenceRate).slice(0,15);
}

async function fetchAverageAttendanceRate(dateStart, dateEnd, classId = null) {
    let query = supabase
        .from('attendance_logs')
        .select('status, students!inner(class_id)')
        .gte('log_date', dateStart)
        .lte('log_date', dateEnd);
    if (classId) query = query.eq('students.class_id', classId);
    const { data: logs } = await query;
    if (!logs?.length) return 0;
    const total = logs.length;
    const present = logs.filter(l => l.status === 'Present' || l.status === 'On Time').length;
    return total ? Math.round((present / total) * 100) : 0;
}

// --- UI Update Functions ---
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

function updateRiskList(students) {
    const container = document.getElementById('riskListContainer');
    if (!students || students.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-4 italic">No at-risk students detected</div>';
        return;
    }
    container.innerHTML = students.map(s => `
        <div class="flex items-center justify-between p-3 ${s.riskLevel === 'high' ? 'bg-red-50 border-red-200' : s.riskLevel === 'medium' ? 'bg-orange-50 border-orange-200' : 'bg-yellow-50 border-yellow-200'} border rounded-xl">
            <div><div class="h-10 w-10 rounded-full flex items-center justify-center font-bold ${s.riskLevel === 'high' ? 'bg-red-100 text-red-600' : s.riskLevel === 'medium' ? 'bg-orange-100 text-orange-600' : 'bg-yellow-100 text-yellow-600'}">${s.name.charAt(0)}</div></div>
            <div class="flex-1 px-3"><p class="font-bold text-gray-900 text-sm">${escapeHtml(s.name)}</p><p class="text-xs text-gray-400">ID: ${s.id}</p><p class="text-xs ${s.riskLevel === 'high' ? 'text-red-600' : 'text-orange-600'}">${escapeHtml(s.reason)}</p></div>
            <div class="text-right"><p class="font-black text-lg ${s.riskLevel === 'high' ? 'text-red-600' : 'text-orange-600'}">${s.absenceRate}% absent</p><p class="text-[10px] text-gray-400">${s.lateRate}% late</p></div>
        </div>
    `).join('');
}

function updateAvgAttendance(rate) {
    const el = document.getElementById('avgAttendanceRate');
    if (el) el.innerText = `${rate}%`;
}

// --- Export CSV with new risk and combined data ---
function exportToCSV() {
    const start = document.getElementById('dateStart').value;
    const end = document.getElementById('dateEnd').value;
    let csv = `Educare Analytics Report\nDate Range: ${start} to ${end}\n\n`;
    csv += `STATUS DISTRIBUTION\nStatus,Count\nPresent,${analyticsData.statusDistribution?.Present || 0}\nLate,${analyticsData.statusDistribution?.Late || 0}\nAbsent,${analyticsData.statusDistribution?.Absent || 0}\nExcused,${analyticsData.statusDistribution?.Excused || 0}\n\n`;
    csv += `COMMON REASONS\nReason,Count\n${analyticsData.commonReasons?.labels?.map((l,i)=>`${l},${analyticsData.commonReasons.data[i]}`).join('\n') || ''}\n\n`;
    csv += `CLASS PERFORMANCE\nClass,Attendance Rate (%)\n${analyticsData.classPerformance?.labels?.map((l,i)=>`${l},${analyticsData.classPerformance.data[i]}`).join('\n') || ''}\n\n`;
    csv += `CRITICAL WATCHLIST (>10 Absences)\nStudent Name,Student ID,Absence Count\n${analyticsData.criticalStudents?.map(s=>`${s.name},${s.id},${s.absent}`).join('\n') || ''}\n\n`;
    csv += `FREQUENT LATE ARRIVALS\nStudent Name,Student ID,Late Count\n${analyticsData.frequentLate?.map(s=>`${s.name},${s.id},${s.count}`).join('\n') || ''}\n\n`;
    csv += `PREDICTIVE RISK ANALYSIS\nStudent Name,Student ID,Risk Level,Reason,Absence Rate (%),Late Rate (%)\n${analyticsData.riskStudents?.map(s=>`${s.name},${s.id},${s.riskLevel},${s.reason},${s.absenceRate},${s.lateRate}`).join('\n') || ''}\n\n`;
    csv += `MOST LATES & ABSENCES (COMBINED)\nStudent Name,Student ID,Lates,Absences,Total\n${analyticsData.combinedLatesAbsences?.map(s=>`${s.name},${s.student_id_text},${s.lates},${s.absences},${s.total}`).join('\n') || ''}`;
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