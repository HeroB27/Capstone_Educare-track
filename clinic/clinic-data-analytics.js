// clinic/clinic-data-analytics.js

let visitData = [];
let reasonsChart = null;
let dailyChart = null;

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();       // ensure icons are rendered
    setToday();
});

/**
 * Fetch clinic visits from Supabase within date range
 */
async function fetchVisitsByDateRange(dateFrom, dateTo) {
    // Convert dates to ISO strings (YYYY-MM-DD)
    const start = dateFrom;
    const end = dateTo;

    // Build Supabase query with joins
    const { data, error } = await supabase
        .from('clinic_visits')
        .select(`
            *,
            students (
                full_name,
                classes (
                    grade_level,
                    department
                )
            ),
            teachers!clinic_visits_referred_by_teacher_id_fkey (
                full_name
            )
        `)
        .gte('time_in', `${start}T00:00:00`)
        .lte('time_in', `${end}T23:59:59`)
        .order('time_in', { ascending: false });

    if (error) {
        console.error('Supabase error:', error);
        throw error;
    }

    // Transform to match expected structure
    return data.map(visit => ({
        ...visit,
        students: visit.students ? {
            full_name: visit.students.full_name,
            classes: visit.students.classes
        } : null,
        teachers: visit.teachers ? { full_name: visit.teachers.full_name } : null
    }));
}

/**
 * Apply date filter and refresh all visuals
 */
async function applyDateFilter() {
    const dateFrom = document.getElementById('start-date').value;
    const dateTo = document.getElementById('end-date').value;

    if (!dateFrom || !dateTo) {
        showToast('Please select a valid date range.', 'warning');
        return;
    }
    
    try {
        visitData = await fetchVisitsByDateRange(dateFrom, dateTo);
        
        updateStatsCards(visitData);
        renderReasonsChart(visitData);
        renderDailyTrendChart(visitData);
        renderDetailedLogs(visitData);
        
        showToast(`Loaded ${visitData.length} visit records.`, 'success');
    } catch (error) {
        console.error(error);
        showToast('Error loading data. Please check console for details.', 'error');
    }
}

/**
 * Update statistics cards
 */
function updateStatsCards(visits) {
    const totalVisits = visits.length;
    
    // Returned to Class (any action that ends with student back in class)
    const returnedToClass = visits.filter(v => 
        v.time_out && 
        (v.action_taken === 'Returned to Class' || 
         v.action_taken === 'First Aid Provided' ||
         v.action_taken === 'Medication Given' ||
         v.action_taken === 'Observed and Released')
    ).length;
    
    // Sent Home (student dismissed)
    const sentHome = visits.filter(v => 
        v.time_out &&
        (v.action_taken === 'Sent Home' || 
         v.action_taken === 'Picked up by Parent' ||
         v.action_taken === 'Sent to Hospital')
    ).length;
    
    // Average duration (minutes)
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
    
    // Update DOM
    const statTotal = document.getElementById('stat-total');
    const statReturned = document.getElementById('stat-returned');
    const statSentHome = document.getElementById('stat-sent-home');
    const statAvgDuration = document.getElementById('stat-avg-duration');
    
    if (statTotal) statTotal.innerText = totalVisits;
    if (statReturned) statReturned.innerText = returnedToClass;
    if (statSentHome) statSentHome.innerText = sentHome;
    if (statAvgDuration) statAvgDuration.innerText = avgDuration;
}

/**
 * Horizontal bar chart – top 5 reasons for visit
 */
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
        options: { 
            indexAxis: 'y', 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' }
            }
        }
    });
}

/**
 * Line chart – daily visit trend
 */
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
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: {
                tooltip: { callbacks: { label: (ctx) => `${ctx.raw} visits` } }
            }
        }
    });
}

/**
 * Populate detailed logs table (6 columns)
 */
function renderDetailedLogs(visits) {
    const tbody = document.getElementById('recent-visits-body');
    if (visits.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-gray-500">No records for this period.</td></tr>`;
        return;
    }

    tbody.innerHTML = visits.map(v => {
        const dateObj = new Date(v.time_in);
        const dateStr = formatDate(v.time_in);
        const timeInStr = formatTime(v.time_in);
        const timeOutStr = v.time_out ? formatTime(v.time_out) : '—';
        const studentName = v.students?.full_name || 'N/A';
        const reason = v.reason || 'N/A';
        const action = v.action_taken || 'Pending';

        return `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 text-sm text-gray-500">${dateStr}</td>
                <td class="px-6 py-4 font-medium text-gray-800">${studentName}</td>
                <td class="px-6 py-4 text-sm text-gray-600">${reason}</td>
                <td class="px-6 py-4 text-sm text-gray-600">${timeInStr}</td>
                <td class="px-6 py-4 text-sm text-gray-600">${timeOutStr}</td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 text-xs font-semibold rounded-full 
                        ${action === 'Returned to Class' ? 'bg-green-100 text-green-700' : 
                          action === 'Sent Home' ? 'bg-blue-100 text-blue-700' : 
                          'bg-gray-100 text-gray-700'}">
                        ${action}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Set date inputs to today and trigger filter
 */
function setToday() {
    const localDate = new Date();
    localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
    const today = localDate.toISOString().split('T')[0];
    
    const dateFrom = document.getElementById('start-date');
    const dateTo = document.getElementById('end-date');
    if (!dateFrom || !dateTo) return;

    dateFrom.value = today;
    dateTo.value = today;
    applyDateFilter();
}

/**
 * Set this week (Sunday to Saturday)
 */
function setThisWeek() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const start = new Date(now);
    start.setDate(now.getDate() - dayOfWeek);
    const end = new Date(now);
    end.setDate(now.getDate() + (6 - dayOfWeek));
    
    document.getElementById('start-date').value = formatYMD(start);
    document.getElementById('end-date').value = formatYMD(end);
    applyDateFilter();
}

/**
 * Set this month (1st to last day)
 */
function setThisMonth() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    document.getElementById('start-date').value = formatYMD(start);
    document.getElementById('end-date').value = formatYMD(end);
    applyDateFilter();
}

/**
 * Set all-time (wide range)
 */
function setAllTime() {
    document.getElementById('start-date').value = '2020-01-01';
    document.getElementById('end-date').value = '2030-12-31';
    applyDateFilter();
}

/**
 * Reset to today
 */
function resetDateFilter() {
    setToday();
}

/**
 * Export current data to CSV
 */
function exportData() {
    if (visitData.length === 0) {
        showToast('No data to export.', 'warning');
        return;
    }
    
    const exportable = visitData.map(v => ({
        Date: formatDate(v.time_in),
        Time_In: formatTime(v.time_in),
        Time_Out: v.time_out ? formatTime(v.time_out) : 'N/A',
        Student_Name: v.students?.full_name || 'N/A',
        Class: getClassDisplay(v.students?.classes),
        Reason: v.reason || '',
        Referred_By: v.teachers?.full_name || 'Walk-in',
        Action_Taken: v.action_taken || '',
        Nurse_Notes: v.nurse_notes || '',
        Duration: calculateDuration(v.time_in, v.time_out)
    }));
    
    exportToCSV(exportable, `clinic_report_${document.getElementById('start-date').value}_to_${document.getElementById('end-date').value}`);
}

// ========== Helper functions (if not already in general-core.js) ==========
function formatYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatDate(isoString) {
    if (!isoString) return 'N/A';
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(isoString) {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

function calculateDuration(timeIn, timeOut) {
    if (!timeIn || !timeOut) return '—';
    const ms = new Date(timeOut) - new Date(timeIn);
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
}

function getClassDisplay(classObj) {
    if (!classObj) return 'Unassigned';
    const grade = classObj.grade_level || '';
    const dept = classObj.department || '';
    return `${grade} ${dept}`.trim() || 'Unassigned';
}

function exportToCSV(data, filename) {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvRows = [];
    csvRows.push(headers.join(','));
    for (const row of data) {
        const values = headers.map(header => {
            const val = row[header] || '';
            return `"${String(val).replace(/"/g, '""')}"`;
        });
        csvRows.push(values.join(','));
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function showToast(message, type = 'info') {
    // Simple toast implementation; adjust if global toast exists
    const toast = document.createElement('div');
    toast.className = `fixed bottom-5 right-5 px-4 py-2 rounded-lg text-white font-medium z-50 
        ${type === 'error' ? 'bg-red-600' : type === 'warning' ? 'bg-yellow-600' : 'bg-green-600'}`;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Expose global functions
window.applyDateFilter = applyDateFilter;
window.setToday = setToday;
window.setThisWeek = setThisWeek;
window.setThisMonth = setThisMonth;
window.setAllTime = setAllTime;
window.resetDateFilter = resetDateFilter;
window.exportData = exportData;