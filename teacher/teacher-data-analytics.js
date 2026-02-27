// teacher-data-analytics.js
// Standalone script for data analytics page

document.addEventListener('DOMContentLoaded', async () => {
    await loadAnalytics();
});

async function loadAnalytics() {
    await loadAnalyticsData();
}

/**
 * Load Analytics Data
 * Fetches analytics data filtered by teacher's advisory class
 */
async function loadAnalyticsData() {
    try {
        // 1. Get teacher's advisory class ID
        const { data: teacherData } = await supabase
            .from('teachers')
            .select('class_id')
            .eq('id', currentUser.id)
            .single();

        if (!teacherData?.class_id) return;
        
        // 2. ONLY fetch logs for students in THIS class (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const { data: logs, error } = await supabase
            .from('attendance_logs')
            .select(`
                *,
                students!inner(class_id, full_name)
            `)
            .eq('students.class_id', teacherData.class_id)
            .gte('log_date', thirtyDaysAgo) // THE PARANOIA SHIELD: Only fetch last 30 days
            .order('log_date', { ascending: false });

        if (error) throw error;

        // UPDATED: Call all new and existing chart functions
        renderTrendChart(logs);
        renderStatusPie(logs);
        processInsights(logs);

    } catch (err) {
        console.error("Analytics fetch error:", err);
    }
}

/**
 * Renders all charts based on the provided log data.
 * @param {Array} logs - The attendance logs for the class.
 */
function renderCharts(logs) {
    const ctx = document.getElementById('attendancePieChart');
    if (!ctx) return;
    
    try {
        const { data: teacherClass } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();
        
        if (!teacherClass) return;
        
        const today = new Date().toISOString().split('T')[0];
        const { data: students } = await supabase
            .from('students')
            .select('id')
            .eq('class_id', teacherClass.id);
        
        const studentIds = students?.map(s => s.id) || [];
        const { data: attendanceLogs } = await supabase
            .from('attendance_logs')
            .select('status')
            .eq('log_date', today)
            .in('student_id', studentIds);
        
        let present = 0, absent = 0, late = 0, excused = 0;
        attendanceLogs?.forEach(log => {
            if (log.status === 'On Time' || log.status === 'Present') present++;
            else if (log.status === 'Absent') absent++;
            else if (log.status === 'Late') late++;
            else if (log.status === 'Excused') excused++;
        });
        
        new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Present', 'Absent', 'Late', 'Excused'],
                datasets: [{
                    data: [present, absent, late, excused],
                    backgroundColor: ['#22c55e', '#ef4444', '#eab308', '#3b82f6']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: "Today's Attendance"
                    }
                }
            }
        });
        
    } catch (err) {
        console.error('Error loading pie chart:', err);
    }
}

async function loadMonthlyBarChart() {
    const ctx = document.getElementById('monthlyBarChart');
    if (!ctx) return;
    
    try {
        // Get teacher's advisory class
        const { data: advisory } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();
        
        if (!advisory) return;
        
        const dates = [];
        const presentData = [];
        const absentData = [];
    } catch (err) {
        console.error('Error rendering charts:', err);
    }
}

/**
 * Renders the attendance trend chart.
 * @param {Array} logs - The attendance logs.
 */
function renderTrendChart(logs) {
    const ctx = document.getElementById('attendanceTrendChart');
    if (!ctx || !logs) return;

    const daily = logs.reduce((acc, l) => {
        if (!acc[l.log_date]) acc[l.log_date] = { p: 0, l: 0, a: 0 };
        if (l.status === 'Present' || l.status === 'On Time') acc[l.log_date].p++;
        else if (l.status === 'Late') acc[l.log_date].l++;
        else if (l.status === 'Absent') acc[l.log_date].a++;
        return acc;
    }, {});

    const labels = Object.keys(daily).sort();
    updateChart(ctx, 'line', labels, [
        { label: 'Present', data: labels.map(d => daily[d].p), borderColor: '#22c55e', tension: 0.3 },
        { label: 'Late', data: labels.map(d => daily[d].l), borderColor: '#f59e0b', tension: 0.3 },
        { label: 'Absent', data: labels.map(d => daily[d].a), borderColor: '#ef4444', tension: 0.3 }
    ]);
}

/**
 * Renders the status pie chart.
 * @param {Array} logs - The attendance logs.
 */
function renderStatusPie(logs) {
    const ctx = document.getElementById('statusPieChart');
    if (!ctx || !logs) return;

    const stats = { 'On Time': 0, 'Late': 0, 'Absent': 0, 'Excused': 0 };
    logs.forEach(l => {
        if (stats[l.status] !== undefined) stats[l.status]++;
    });

    updateChart(ctx, 'pie', Object.keys(stats), [{
        data: Object.values(stats),
        backgroundColor: ['#22c55e', '#f59e0b', '#ef4444', '#3b82f6']
    }]);
}

/**
 * Processes and displays critical absence insights.
 * @param {Array} logs - The attendance logs.
 */
function processInsights(logs) {
    const list = document.getElementById('criticalAbsencesList');
    if (!list || !logs) return;

    const absenceMap = logs.filter(l => l.status === 'Absent').reduce((acc, l) => {
        const name = l.students?.full_name || 'Unknown';
        acc[name] = (acc[name] || 0) + 1;
        return acc;
    }, {});

    // CRITICAL ABSENCE RULE: Flag at 10 (halfway to 20)
    const critical = Object.entries(absenceMap).filter(([_, count]) => count >= 10);

    if (critical.length > 0) {
        list.innerHTML = critical.map(([name, count]) => `
            <div class="flex justify-between items-center p-4 bg-red-50 rounded-xl border border-red-100 mb-2">
                <div>
                    <p class="font-bold text-red-900">${name}</p>
                    <p class="text-[10px] text-red-600 font-black uppercase">Reached Halfway Mark (${count}/20)</p>
                </div>
                <span class="bg-red-600 text-white px-3 py-1 rounded-lg font-bold">${count}</span>
            </div>`).join('');
    } else {
        list.innerHTML = '<p class="text-center text-gray-400 py-4 italic">No students with critical absences.</p>';
    }
}

/**
 * Helper function to create or update a Chart.js instance.
 * @param {CanvasRenderingContext2D} ctx - The canvas context.
 * @param {string} type - The chart type (e.g., 'line', 'pie').
 * @param {Array} labels - The chart labels.
 * @param {Array} datasets - The chart datasets.
 */
function updateChart(ctx, type, labels, datasets) {
    if (ctx.chart) {
        ctx.chart.destroy();
    }
    ctx.chart = new Chart(ctx, {
        type,
        data: { labels, datasets },
        options: { responsive: true, maintainAspectRatio: false }
    });
}
