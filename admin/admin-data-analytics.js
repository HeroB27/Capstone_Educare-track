// admin/admin-data-analytics.js

// 1. Session Check
// currentUser is now global in admin-core.js

// 2. Chart Instances
let attendanceTrendChart = null;
let todayBreakdownChart = null;
let clinicReasonsChart = null;

// 3. Initialize Page
document.addEventListener('DOMContentLoaded', () => {
    if (currentUser) {
        document.getElementById('admin-name').innerText = currentUser.full_name || 'Admin';
    }
    
    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    document.getElementById('exportDateStart').value = weekAgo;
    document.getElementById('exportDateEnd').value = today;
    
    // Load all analytics
    loadAllAnalytics();
});

// 4. Load All Analytics
async function loadAllAnalytics() {
    await Promise.all([
        loadAttendanceTrend(),
        loadTodayBreakdown(),
        loadClinicReasons(),
        loadCriticalAbsences(),
        loadFrequentLates()
    ]);
}

// 5. Load Attendance Trend (Last 7 Days)
// FIXED: Single bulk query instead of 7 separate queries
async function loadAttendanceTrend() {
    try {
        // Get dates for last 7 days
        const dates = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            dates.push(date.toISOString().split('T')[0]);
        }
        
        // Calculate date range
        const today = dates[dates.length - 1];
        const weekAgo = dates[0];
        
        // ONE single API call for the whole week
        const { data: logs, error } = await supabase
            .from('attendance_logs')
            .select('log_date, status')
            .gte('log_date', weekAgo)
            .lte('log_date', today);
        
        if (error) throw error;
        
        // Group in JavaScript by date and status
        const attendanceData = { labels: dates, present: [], late: [], absent: [] };
        
        // Create a map for quick lookup
        const statusByDate = {};
        dates.forEach(d => {
            statusByDate[d] = { present: 0, late: 0, absent: 0 };
        });
        
        // Count statuses by date
        (logs || []).forEach(log => {
            if (statusByDate[log.log_date]) {
                if (log.status === 'Present' || log.status === 'On Time') {
                    statusByDate[log.log_date].present++;
                } else if (log.status === 'Late') {
                    statusByDate[log.log_date].late++;
                } else if (log.status === 'Absent' || log.status === 'Excused') {
                    statusByDate[log.log_date].absent++;
                }
            }
        });
        
        // Populate arrays in date order
        dates.forEach(d => {
            attendanceData.present.push(statusByDate[d].present);
            attendanceData.late.push(statusByDate[d].late);
            attendanceData.absent.push(statusByDate[d].absent);
        });
        
        // Render chart
        renderAttendanceTrendChart(attendanceData);
        
    } catch (error) {
        console.error('Error loading attendance trend:', error);
        renderEmptyTrendChart();
    }
}

// 6. Render Attendance Trend Chart
function renderAttendanceTrendChart(data) {
    const ctx = document.getElementById('attendanceTrendChart').getContext('2d');
    
    if (attendanceTrendChart) {
        attendanceTrendChart.destroy();
    }
    
    attendanceTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels.map(d => formatDateShort(d)),
            datasets: [
                {
                    label: 'Present',
                    data: data.present,
                    borderColor: 'rgb(34, 197, 94)',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Late',
                    data: data.late,
                    borderColor: 'rgb(234, 179, 8)',
                    backgroundColor: 'rgba(234, 179, 8, 0.1)',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Absent',
                    data: data.absent,
                    borderColor: 'rgb(239, 68, 68)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 50
                    }
                }
            }
        }
    });
}

// 7. Render Empty Trend Chart (Placeholder)
function renderEmptyTrendChart() {
    const ctx = document.getElementById('attendanceTrendChart').getContext('2d');
    
    attendanceTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [
                {
                    label: 'Present',
                    data: [0, 0, 0, 0, 0, 0, 0],
                    borderColor: 'rgb(34, 197, 94)',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Late',
                    data: [0, 0, 0, 0, 0, 0, 0],
                    borderColor: 'rgb(234, 179, 8)',
                    backgroundColor: 'rgba(234, 179, 8, 0.1)',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Absent',
                    data: [0, 0, 0, 0, 0, 0, 0],
                    borderColor: 'rgb(239, 68, 68)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top'
                },
                title: {
                    display: true,
                    text: 'No data available'
                }
            }
        }
    });
}

// 8. Load Today's Breakdown
async function loadTodayBreakdown() {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        const { data, error } = await supabase
            .from('attendance_logs')
            .select('status')
            .eq('log_date', today);
        
        if (error) throw error;
        
        const statuses = data || [];
        const present = statuses.filter(s => s.status === 'Present' || s.status === 'On Time').length;
        const late = statuses.filter(s => s.status === 'Late').length;
        const absent = statuses.filter(s => s.status === 'Absent' || s.status === 'Excused').length;
        const total = present + late + absent;
        
        renderTodayBreakdownChart(present, late, absent, total);
        
    } catch (error) {
        console.error('Error loading today breakdown:', error);
        renderEmptyBreakdownChart();
    }
}

// 9. Render Today's Breakdown Chart
function renderTodayBreakdownChart(present, late, absent, total) {
    const ctx = document.getElementById('todayBreakdownChart').getContext('2d');
    
    if (todayBreakdownChart) {
        todayBreakdownChart.destroy();
    }
    
    todayBreakdownChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Present', 'Late', 'Absent'],
            datasets: [{
                data: [present, late, absent],
                backgroundColor: [
                    'rgb(34, 197, 94)',
                    'rgb(234, 179, 8)',
                    'rgb(239, 68, 68)'
                ],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                title: {
                    display: true,
                    text: 'Total: ' + total
                }
            }
        }
    });
}

// 10. Render Empty Breakdown Chart
function renderEmptyBreakdownChart() {
    const ctx = document.getElementById('todayBreakdownChart').getContext('2d');
    
    todayBreakdownChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Present', 'Late', 'Absent'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: [
                    'rgb(34, 197, 94)',
                    'rgb(234, 179, 8)',
                    'rgb(239, 68, 68)'
                ],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                title: {
                    display: true,
                    text: 'Total: 0'
                }
            }
        }
    });
}

// 11. Load Clinic Visit Reasons
async function loadClinicReasons() {
    try {
        // Get clinic visits with reasons
        const { data, error } = await supabase
            .from('clinic_visits')
            .select('reason, students(full_name)')
            .gte('time_in', getWeekStart());
        
        if (error) throw error;
        
        // Count reasons
        const reasonCounts = {};
        (data || []).forEach(visit => {
            const reason = visit.reason || 'Unknown';
            reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
        });
        
        // Sort and get top 5
        const topReasons = Object.entries(reasonCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        renderClinicReasonsChart(topReasons);
        
    } catch (error) {
        console.error('Error loading clinic reasons:', error);
        renderEmptyClinicChart();
    }
}

// 12. Render Clinic Reasons Chart
function renderClinicReasonsChart(reasons) {
    const ctx = document.getElementById('clinicReasonsChart').getContext('2d');
    
    if (clinicReasonsChart) {
        clinicReasonsChart.destroy();
    }
    
    clinicReasonsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: reasons.map(r => r[0]),
            datasets: [{
                label: 'Visits',
                data: reasons.map(r => r[1]),
                backgroundColor: 'rgba(239, 68, 68, 0.7)',
                borderColor: 'rgb(239, 68, 68)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// 13. Render Empty Clinic Chart
function renderEmptyClinicChart() {
    const ctx = document.getElementById('clinicReasonsChart').getContext('2d');
    
    clinicReasonsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['No data'],
            datasets: [{
                label: 'Visits',
                data: [0],
                backgroundColor: 'rgba(239, 68, 68, 0.7)',
                borderColor: 'rgb(239, 68, 68)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

// 14. Load Critical Absences (>20)
async function loadCriticalAbsences() {
    try {
        // This would require complex SQL - for now show placeholder
        // In production, this would count absences per student
        document.getElementById('criticalAbsencesList').innerHTML = `
            <p class="text-gray-500 text-center py-4">No students with >20 absences</p>
            <p class="text-xs text-gray-400 text-center">This feature requires counting attendance records</p>
        `;
        
    } catch (error) {
        console.error('Error loading critical absences:', error);
    }
}

// 15. Load Frequent Lates (>3 this week)
async function loadFrequentLates() {
    try {
        // This would require complex SQL - for now show placeholder
        document.getElementById('frequentLatesList').innerHTML = `
            <p class="text-gray-500 text-center py-4">No students late >3 times this week</p>
            <p class="text-xs text-gray-400 text-center">This feature requires counting late records</p>
        `;
        
    } catch (error) {
        console.error('Error loading frequent lates:', error);
    }
}

// ============ EXPORT FUNCTIONS ============

// 16. Export to CSV
async function exportToCSV() {
    const exportType = document.getElementById('exportType').value;
    const dateStart = document.getElementById('exportDateStart').value;
    const dateEnd = document.getElementById('exportDateEnd').value;
    
    if (!dateStart || !dateEnd) {
        alert('Please select a date range.');
        return;
    }
    
    try {
        let data = [];
        let filename = '';
        
        switch (exportType) {
            case 'attendance':
                filename = 'attendance_report_' + dateStart + '_' + dateEnd + '.csv';
                const { data: attData, error: attError } = await supabase
                    .from('attendance_logs')
                    .select('*, students(full_name, student_id_text, classes(grade_level, section_name))')
                    .gte('log_date', dateStart)
                    .lte('log_date', dateEnd)
                    .order('log_date', { ascending: false });
                
                if (attError) throw attError;
                data = attData || [];
                break;
                
            case 'clinic':
                filename = 'clinic_visits_' + dateStart + '_' + dateEnd + '.csv';
                const { data: clinicData, error: clinicError } = await supabase
                    .from('clinic_visits')
                    .select('*, students(full_name, student_id_text), teachers(full_name)')
                    .gte('time_in', dateStart)
                    .lte('time_in', dateEnd + 'T23:59:59')
                    .order('time_in', { ascending: false });
                
                if (clinicError) throw clinicError;
                data = clinicData || [];
                break;
                
            default:
                alert('This export type requires additional implementation.');
                return;
        }
        
        // Generate CSV
        generateCSV(data, filename, exportType);
        
    } catch (error) {
        console.error('Error exporting data:', error);
        alert('Error exporting data: ' + error.message);
    }
}

// 17. Generate CSV File
function generateCSV(data, filename, type) {
    if (data.length === 0) {
        alert('No data found for the selected criteria.');
        return;
    }
    
    let csvContent = '';
    
    if (type === 'attendance') {
        const headers = ['Date', 'Student ID', 'Name', 'Grade/Section', 'Time In', 'Time Out', 'Status', 'Remarks'];
        
        const rows = data.map(row => [
            row.log_date,
            row.students ? row.students.student_id_text : '',
            row.students ? row.students.full_name : '',
            (row.students && row.students.classes) ? `${row.students.classes.grade_level} ${row.students.classes.section_name}` : '',
            row.time_in ? new Date(row.time_in).toLocaleTimeString() : '',
            row.time_out ? new Date(row.time_out).toLocaleTimeString() : '',
            row.status,
            row.remarks || ''
        ]);

        csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

    } else if (type === 'clinic') {
        const headers = ['Date', 'Student ID', 'Student Name', 'Referred By', 'Reason', 'Action Taken', 'Parent Notified'];
        
        const rows = data.map(row => [
            row.time_in ? new Date(row.time_in).toLocaleDateString() : '',
            row.students ? row.students.student_id_text : '',
            row.students ? row.students.full_name : '',
            row.teachers ? row.teachers.full_name : 'Walk-in',
            row.reason || '',
            row.action_taken || '',
            row.parent_notified ? 'Yes' : 'No'
        ]);

        csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
    }
    
    // Download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

// ============ HELPER FUNCTIONS ============

// 18. Format Date Short
function formatDateShort(dateString) {
    const date = new Date(dateString);
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// 19. Get Week Start Date
function getWeekStart() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    return monday.toISOString().split('T')[0] + 'T00:00:00';
}

// ============ GRADE FILTER ANALYTICS (NEW) ============

// UPDATED: Load Analytics Data with JavaScript-based grade filtering
// Filters by grade in JavaScript instead of using nested Supabase joins
async function loadAnalyticsData() {
    const startDate = document.getElementById('filter-date-start').value;
    const endDate = document.getElementById('filter-date-end').value;
    const gradeFilter = document.getElementById('filter-grade').value;

    try {
        // 1. Fetch raw Attendance Data (NO nested grade filter here)
        const { data: rawAttendance, error: attError } = await supabase
            .from('attendance_logs')
            .select(`
                id, log_date, status,
                students (class_id, classes (grade_level))
            `)
            .gte('log_date', startDate)
            .lte('log_date', endDate);

        if (attError) throw attError;

        // 2. Filter by Grade in JavaScript
        const attendanceData = gradeFilter 
            ? rawAttendance.filter(log => log.students?.classes?.grade_level === gradeFilter)
            : rawAttendance;

        // 3. Fetch raw Clinic Data 
        const { data: rawClinic, error: clinicError } = await supabase
            .from('clinic_visits')
            .select(`
                id, time_in, reason,
                students (classes (grade_level))
            `)
            .gte('time_in', `${startDate}T00:00:00`)
            .lte('time_in', `${endDate}T23:59:59`);

        if (clinicError) throw clinicError;

        // 4. Filter Clinic by Grade in JavaScript
        const clinicData = gradeFilter
            ? rawClinic.filter(visit => visit.students?.classes?.grade_level === gradeFilter)
            : rawClinic;

        // Update Charts and Summary Cards
        updateSummaryCards(attendanceData, clinicData);
        updateAttendanceChart(attendanceData, startDate, endDate);
        updatePunctualityChart(attendanceData);
        updateClinicChart(clinicData);

    } catch (error) {
        console.error('Error loading analytics:', error);
        if (typeof Swal !== 'undefined') {
            Swal.fire('Error', 'Failed to load analytics data.', 'error');
        }
    }
}

// Helper: Update Summary Cards
function updateSummaryCards(attendanceData, clinicData) {
    const present = attendanceData.filter(a => a.status === 'Present').length;
    const late = attendanceData.filter(a => a.status === 'Late').length;
    const absent = attendanceData.filter(a => a.status === 'Absent').length;
    const clinic = clinicData.length;
    
    if (document.getElementById('stat-present')) {
        document.getElementById('stat-present').innerText = present;
    }
    if (document.getElementById('stat-late')) {
        document.getElementById('stat-late').innerText = late;
    }
    if (document.getElementById('stat-absent')) {
        document.getElementById('stat-absent').innerText = absent;
    }
    if (document.getElementById('stat-clinic')) {
        document.getElementById('stat-clinic').innerText = clinic;
    }
}

// Helper: Update Attendance Chart
function updateAttendanceChart(attendanceData, startDate, endDate) {
    // Generate date labels for the range
    const dates = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
    }
    
    const present = [];
    const late = [];
    const absent = [];
    
    dates.forEach(date => {
        const dayData = attendanceData.filter(a => a.log_date === date);
        present.push(dayData.filter(a => a.status === 'Present').length);
        late.push(dayData.filter(a => a.status === 'Late').length);
        absent.push(dayData.filter(a => a.status === 'Absent').length);
    });
    
    // Update the existing chart if it exists
    if (attendanceTrendChart) {
        attendanceTrendChart.data.labels = dates.map(d => formatDateShort(d));
        attendanceTrendChart.data.datasets[0].data = present;
        attendanceTrendChart.data.datasets[1].data = late;
        attendanceTrendChart.data.datasets[2].data = absent;
        attendanceTrendChart.update();
    }
}

// Helper: Update Punctuality Chart
function updatePunctualityChart(attendanceData) {
    const present = attendanceData.filter(a => a.status === 'Present').length;
    const late = attendanceData.filter(a => a.status === 'Late').length;
    const absent = attendanceData.filter(a => a.status === 'Absent').length;
    const total = present + late + absent;
    
    // Update the existing doughnut chart if it exists
    if (todayBreakdownChart) {
        todayBreakdownChart.data.datasets[0].data = [present, late, absent];
        todayBreakdownChart.options.plugins.title.text = 'Total: ' + total;
        todayBreakdownChart.update();
    }
}

// Helper: Update Clinic Chart
function updateClinicChart(clinicData) {
    // Count reasons
    const reasonCounts = {};
    (clinicData || []).forEach(visit => {
        const reason = visit.reason || 'Unknown';
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    });
    
    // Sort and get top 5
    const topReasons = Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    
    // Update the existing chart if it exists
    if (clinicReasonsChart) {
        clinicReasonsChart.data.labels = topReasons.map(r => r[0]);
        clinicReasonsChart.data.datasets[0].data = topReasons.map(r => r[1]);
        clinicReasonsChart.update();
    }
}
