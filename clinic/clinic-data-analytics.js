// clinic/clinic-data-analytics.js

let visitData = [];
let reasonsChart = null;
let dailyChart = null;

document.addEventListener('DOMContentLoaded', () => {
    setToday();
});

async function applyDateFilter() {
    const dateFrom = document.getElementById('date-from').value;
    const dateTo = document.getElementById('date-to').value;

    if (!dateFrom || !dateTo) {
        showToast('Please select a valid date range.', 'warning');
        return;
    }

    visitData = await fetchVisitsByDateRange(dateFrom, dateTo);
    renderReasonsChart(visitData);
    renderDailyTrendChart(visitData);
    renderDetailedLogs(visitData);
}

function renderReasonsChart(visits) {
    const ctx = document.getElementById('reasons-chart').getContext('2d');
    const reasonCounts = {};
    visits.forEach(v => {
        const reason = (v.reason || 'Not Specified').trim();
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    });

    const sortedReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (reasonsChart) reasonsChart.destroy();
    reasonsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedReasons.map(r => r[0]),
            datasets: [{
                label: 'Number of Visits',
                data: sortedReasons.map(r => r[1]),
                backgroundColor: 'rgba(239, 68, 68, 0.6)',
                borderColor: 'rgba(239, 68, 68, 1)',
                borderWidth: 1
            }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false }
    });
}

function renderDailyTrendChart(visits) {
    const ctx = document.getElementById('daily-chart').getContext('2d');
    const dailyCounts = {};
    visits.forEach(v => {
        const date = new Date(v.time_in).toISOString().split('T')[0];
        dailyCounts[date] = (dailyCounts[date] || 0) + 1;
    });

    const sortedDays = Object.entries(dailyCounts).sort((a, b) => new Date(a[0]) - new Date(b[0]));

    if (dailyChart) dailyChart.destroy();
    dailyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedDays.map(d => d[0]),
            datasets: [{
                label: 'Daily Visits',
                data: sortedDays.map(d => d[1]),
                borderColor: 'rgba(220, 38, 38, 1)',
                backgroundColor: 'rgba(220, 38, 38, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderDetailedLogs(visits) {
    const tbody = document.getElementById('detailed-logs-body');
    if (visits.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-gray-500">No records for this period.</td></tr>';
        return;
    }

    tbody.innerHTML = visits.map(v => `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4 text-sm text-gray-500">${formatDate(v.time_in)} ${formatTime(v.time_in)}</td>
            <td class="px-6 py-4 font-medium text-gray-800">${v.students?.full_name || 'N/A'}</td>
            <td class="px-6 py-4 text-sm text-gray-600">${v.reason || 'N/A'}</td>
            <td class="px-6 py-4 text-sm text-gray-600">${v.action_taken || 'N/A'}</td>
            <td class="px-6 py-4 text-sm font-mono text-red-600">${calculateDuration(v.time_in, v.time_out)}</td>
        </tr>
    `).join('');
}

function setToday() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date-from').value = today;
    document.getElementById('date-to').value = today;
    applyDateFilter();
}

function setThisWeek() {
    const today = new Date();
    const first = today.getDate() - today.getDay();
    const firstDay = new Date(today.setDate(first)).toISOString().split('T')[0];
    const lastDay = new Date(today.setDate(first + 6)).toISOString().split('T')[0];
    document.getElementById('date-from').value = firstDay;
    document.getElementById('date-to').value = lastDay;
    applyDateFilter();
}

function setThisMonth() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
    document.getElementById('date-from').value = firstDay;
    document.getElementById('date-to').value = lastDay;
    applyDateFilter();
}

function exportData() {
    if (visitData.length === 0) {
        showToast('No data to export.', 'warning');
        return;
    }
    const exportable = visitData.map(v => ({
        Date: formatDate(v.time_in),
        Time_In: formatTime(v.time_in),
        Time_Out: v.time_out ? formatTime(v.time_out) : 'N/A',
        Student_Name: v.students?.full_name,
        Class: `${v.students?.classes?.grade_level} - ${v.students?.classes?.section_name}`,
        Reason: v.reason,
        Referred_By: v.teachers?.full_name || 'Walk-in',
        Action_Taken: v.action_taken,
        Nurse_Notes: v.nurse_notes,
        Duration: calculateDuration(v.time_in, v.time_out)
    }));
    exportToCSV(exportable, `clinic_report_${document.getElementById('date-from').value}_to_${document.getElementById('date-to').value}`);
}

window.applyDateFilter = applyDateFilter;
window.setToday = setToday;
window.setThisWeek = setThisWeek;
window.setThisMonth = setThisMonth;
window.exportData = exportData;