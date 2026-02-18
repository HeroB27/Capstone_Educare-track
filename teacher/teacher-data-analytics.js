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
        renderCharts(logs);
    } catch (err) {
        console.error("Analytics fetch error:", err);
    }
}

async function loadAttendancePieChart() {
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
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            dates.push(date.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }));
            
            // Get students in this class first
            const { data: students } = await supabase
                .from('students')
                .select('id')
                .eq('class_id', advisory.id);
            
            const studentIds = students?.map(s => s.id) || [];
            
            // Query attendance logs filtered by class students
            const { data: logs } = await supabase
                .from('attendance_logs')
                .select('status')
                .eq('log_date', dateStr)
                .in('student_id', studentIds);
            
            let present = 0, absent = 0;
            logs?.forEach(log => {
                if (log.status === 'On Time' || log.status === 'Present' || log.status === 'Late') present++;
                else if (log.status === 'Absent') absent++;
            });
            
            presentData.push(present);
            absentData.push(absent);
        }
        
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dates,
                datasets: [
                    { label: 'Present', data: presentData, backgroundColor: '#22c55e' },
                    { label: 'Absent', data: absentData, backgroundColor: '#ef4444' }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Weekly Attendance Trend'
                    }
                },
                scales: {
                    x: { stacked: false },
                    y: { stacked: false, beginAtZero: true }
                }
            }
        });
        
    } catch (err) {
        console.error('Error loading bar chart:', err);
    }
}

async function loadSummaryStats() {
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
        
        const total = attendanceLogs?.length || 1;
        document.getElementById('present-rate').innerText = Math.round((present / total) * 100) + '%';
        document.getElementById('absent-rate').innerText = Math.round((absent / total) * 100) + '%';
        document.getElementById('late-rate').innerText = Math.round((late / total) * 100) + '%';
        document.getElementById('excused-rate').innerText = Math.round((excused / total) * 100) + '%';
        
    } catch (err) {
        console.error('Error loading summary stats:', err);
    }
}
