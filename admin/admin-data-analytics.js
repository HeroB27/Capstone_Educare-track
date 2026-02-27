// admin/admin-data-analytics.js
let charts = {};

document.addEventListener('DOMContentLoaded', () => {
    if (!checkSession('admins')) return;
    changeDateRange('week');
});

function changeDateRange(range) {
    const end = new Date(); let start = new Date();
    if (range === 'week') start.setDate(end.getDate() - 7);
    else if (range === 'month') start.setMonth(end.getMonth() - 1);
    document.getElementById('dateEnd').value = end.toISOString().split('T')[0];
    document.getElementById('dateStart').value = start.toISOString().split('T')[0];
    ['today', 'week', 'month'].forEach(r => {
        const btn = document.getElementById(`btn-${r}`);
        if (btn) btn.className = r === range ? "px-4 py-2 bg-violet-600 text-white rounded-xl font-medium text-sm shadow-md shadow-violet-200" : "px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-xl font-medium text-sm";
    });
    loadAllAnalytics();
}

async function loadAllAnalytics() {
    const start = document.getElementById('dateStart').value;
    const end = document.getElementById('dateEnd').value;
    try {
        const [logs, clinic, classes] = await Promise.all([
            supabase.from('attendance_logs').select('*, students(full_name, class_id)').gte('log_date', start).lte('log_date', end),
            supabase.from('clinic_visits').select('*').gte('time_in', start).lte('time_in', end),
            supabase.from('classes').select('id, grade_level')
        ]);
        renderTrendChart(logs.data);
        renderStatusPie(logs.data);
        renderReasonBars(logs.data, clinic.data);
        renderClassPerformance(logs.data, classes.data);
        processInsights(logs.data);
    } catch (err) { console.error(err); }
}

function renderTrendChart(logs) {
    if (!logs || logs.length === 0) return;
    const daily = logs.reduce((acc, l) => { if(!acc[l.log_date]) acc[l.log_date] = {p:0, l:0}; l.status==='Present'?acc[l.log_date].p++:acc[l.log_date].l++; return acc; }, {});
    const labels = Object.keys(daily).sort();
    updateChart('attendanceChart', 'line', labels, [
        { label: 'Present', data: labels.map(d=>daily[d].p), borderColor: '#8b5cf6', fill: true, tension: 0.4 },
        { label: 'Late', data: labels.map(d=>daily[d].l), borderColor: '#f59e0b', tension: 0.4 }
    ]);
}

function renderStatusPie(logs) {
    if (!logs || logs.length === 0) return;
    const stats = { Present: 0, Late: 0, Absent: 0, 'Excused Absent': 0 };
    logs.forEach(l => { if(stats[l.status] !== undefined) stats[l.status]++; });
    updateChart('statusPie', 'pie', Object.keys(stats), [{ data: Object.values(stats), backgroundColor: ['#8b5cf6', '#f59e0b', '#ef4444', '#3b82f6'] }]);
}

function renderReasonBars(logs, visits) {
    if (!visits || visits.length === 0) return;
    const clcReasons = visits.reduce((acc, v) => { acc[v.reason] = (acc[v.reason] || 0) + 1; return acc; }, {});
    updateChart('reasonBar', 'bar', Object.keys(clcReasons), [{ label: 'Clinic Visits', data: Object.values(clcReasons), backgroundColor: '#ef4444' }]);
}

function renderClassPerformance(logs, classes) {
    if (!classes || classes.length === 0) return;
    const classData = classes.map(c => {
        const classLogs = logs.filter(l => l.students?.class_id === c.id);
        const present = classLogs.filter(l => l.status === 'Present' || l.status === 'Late').length;
        return { label: c.grade_level, rate: classLogs.length > 0 ? (present/classLogs.length)*100 : 0 };
    });
    updateChart('classBar', 'bar', classData.map(d=>d.label), [{ label: 'Attendance Rate %', data: classData.map(d=>d.rate), backgroundColor: '#8b5cf6' }]);
}

function processInsights(logs) {
    if (!logs) return;
    const absenceMap = logs.filter(l => l.status === 'Absent').reduce((acc, l) => {
        const name = l.students?.full_name || 'Unknown';
        acc[name] = (acc[name] || 0) + 1; return acc;
    }, {});
    const list = document.getElementById('criticalAbsencesList');
    // CRITICAL ABSENCE RULE: Flag at 10 (halfway to 20)
    const critical = Object.entries(absenceMap).filter(([_, count]) => count >= 10);
    list.innerHTML = critical.length ? critical.map(([name, count]) => `
        <div class="flex justify-between items-center p-4 bg-red-50 rounded-xl border border-red-100 mb-2">
            <div><p class="font-bold text-red-900">${name}</p><p class="text-[10px] text-red-600 font-black uppercase">Reached Halfway mark (${count}/20)</p></div>
            <span class="bg-red-600 text-white px-3 py-1 rounded-lg font-bold">${count}</span>
        </div>`).join('') : '<p class="text-center text-gray-400 py-4 italic">No critical absences.</p>';
}

function updateChart(id, type, labels, datasets) {
    const ctx = document.getElementById(id).getContext('2d');
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, { type, data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false } });
}