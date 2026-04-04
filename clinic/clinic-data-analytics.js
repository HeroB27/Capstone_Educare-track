// clinic/clinic-data-analytics.js

let visitData = [];
let reasonsChart = null;
let dailyChart = null;

document.addEventListener('DOMContentLoaded', () => {
    setToday();
});

async function applyDateFilter() {
    const dateFrom = document.getElementById('start-date').value;
    const dateTo = document.getElementById('end-date').value;

    if (!dateFrom || !dateTo) {
        showToast('Please select a valid date range.', 'warning');
        return;
    }
    
    try {
        visitData = await fetchVisitsByDateRange(dateFrom, dateTo);
        
        // Update stats cards
        updateStatsCards(visitData);
        
        renderReasonsChart(visitData);
        renderDailyTrendChart(visitData);
        renderDetailedLogs(visitData);
        
        showToast(`Loaded ${visitData.length} visit records.`, 'success');
    } catch (error) {
        showToast('Error loading data. Please check console for details.', 'error');
    }
}

function updateStatsCards(visits) {
    // Total visits in the date range
    const totalVisits = visits.length;
    
    // Returned to Class - visits with action_taken for returned to class
    const returnedToClass = visits.filter(v => 
        v.time_out && 
        (v.action_taken === 'Returned to Class' || 
         v.action_taken === 'First Aid Provided' ||
         v.action_taken === 'Medication Given' ||
         v.action_taken === 'Observed and Released')
    ).length;
    
    // Sent Home - visits with action_taken for sent home
    const sentHome = visits.filter(v => 
        v.time_out &&
        (v.action_taken === 'Sent Home' || 
         v.action_taken === 'Picked up by Parent' ||
         v.action_taken === 'Sent to Hospital')
    ).length;
    
    // Average Duration - calculate average time spent in clinic
    let avgDuration = '0m';
    const visitsWithDuration = visits.filter(v => v.time_in && v.time_out);
    if (visitsWithDuration.length > 0) {
        const totalMs = visitsWithDuration.reduce((sum, v) => {
            const duration = new Date(v.time_out) - new Date(v.time_in);
            return sum + duration;
        }, 0);
        const avgMs = totalMs / visitsWithDuration.length;
        const minutes = Math.round(avgMs / 60000);
        if (minutes < 60) {
            avgDuration = `${minutes}m`;
        } else {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            avgDuration = `${hours}h ${mins}m`;
        }
    }
    
    // Update the stat elements
    const statTotal = document.getElementById('stat-total');
    const statReturned = document.getElementById('stat-returned');
    const statSentHome = document.getElementById('stat-sent-home');
    const statAvgDuration = document.getElementById('stat-avg-duration');
    
    if (statTotal) statTotal.innerText = totalVisits;
    if (statReturned) statReturned.innerText = returnedToClass;
    if (statSentHome) statSentHome.innerText = sentHome;
    if (statAvgDuration) statAvgDuration.innerText = avgDuration;
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
    const ctx = document.getElementById('trend-chart').getContext('2d');
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
    const tbody = document.getElementById('recent-visits-body');
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
    // FIX: Timezone adjustment
    const localDate = new Date();
    localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
    const today = localDate.toISOString().split('T')[0];
    
    // FIX: Make sure these IDs exactly match your HTML file! 
    // If your HTML uses 'start-date' and 'end-date', change 'date-from' and 'date-to' below.
    const dateFrom = document.getElementById('start-date');
    const dateTo = document.getElementById('end-date');
    
    if (!dateFrom || !dateTo) return; // Exit gracefully if inputs don't exist

    dateFrom.value = today;
    dateTo.value = today;
    applyDateFilter();
}

function setThisWeek() {
    // FIX: Use local timezone-adjusted date
    const localDate = new Date();
    localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
    const today = new Date(localDate);
    const first = today.getDate() - today.getDay();
    const firstDay = new Date(today.setDate(first));
    firstDay.setMinutes(firstDay.getMinutes() - firstDay.getTimezoneOffset());
    const lastDay = new Date(today.setDate(first + 6));
    lastDay.setMinutes(lastDay.getMinutes() - lastDay.getTimezoneOffset());
    document.getElementById('start-date').value = firstDay.toISOString().split('T')[0];
    document.getElementById('end-date').value = lastDay.toISOString().split('T')[0];
    applyDateFilter();
}

function setThisMonth() {
    // FIX: Use local timezone-adjusted date
    const localDate = new Date();
    localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
    const today = new Date(localDate);
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    firstDay.setMinutes(firstDay.getMinutes() - firstDay.getTimezoneOffset());
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    lastDay.setMinutes(lastDay.getMinutes() - lastDay.getTimezoneOffset());
    document.getElementById('start-date').value = firstDay.toISOString().split('T')[0];
    document.getElementById('end-date').value = lastDay.toISOString().split('T')[0];
    applyDateFilter();
}

function setAllTime() {
    // Set a wide date range to capture all data
    document.getElementById('start-date').value = '2020-01-01';
    document.getElementById('end-date').value = '2030-12-31';
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
        // FIX: Prevent "undefined" from rendering in official CSV reports
        Class: `${v.students?.classes?.grade_level || ''} ${v.students?.classes?.department || ''}`.trim() || 'Unassigned',
        Reason: v.reason,
        Referred_By: v.teachers?.full_name || 'Walk-in',
        Action_Taken: v.action_taken,
        Nurse_Notes: v.nurse_notes,
        Duration: calculateDuration(v.time_in, v.time_out)
    }));
    exportToCSV(exportable, `clinic_report_${document.getElementById('start-date').value}_to_${document.getElementById('end-date').value}`);
}

window.applyDateFilter = applyDateFilter;
window.setToday = setToday;
window.setThisWeek = setThisWeek;
window.setThisMonth = setThisMonth;
window.setAllTime = setAllTime;
window.exportData = exportData;