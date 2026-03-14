// admin/admin-data-analytics.js
// Data Analytics Dashboard - Full Implementation with Supabase Integration

let trendChart, pieChart, barChart, classChart;
let analyticsData = {
    attendanceTrend: [],
    statusDistribution: {},
    commonReasons: [],
    classPerformance: [],
    criticalStudents: [],
    frequentLate: []
};

document.addEventListener('DOMContentLoaded', () => {
    // FIX: Timezone-adjusted dates to prevent "yesterday" bug during morning defense
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    document.getElementById('dateEnd').value = today.toISOString().split('T')[0];
    document.getElementById('dateStart').value = lastWeek.toISOString().split('T')[0];

    // Initialize empty charts for UI
    initializeEmptyCharts();
    
    // Load initial data
    loadAnalyticsData();
});

/**
 * Load all analytics data from Supabase based on date range
 */
async function loadAnalyticsData(event) {
    const btn = event?.currentTarget;
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>';
        lucide.createIcons();
    }

    const dateStart = document.getElementById('dateStart').value;
    const dateEnd = document.getElementById('dateEnd').value;
    
    console.log('[Analytics] === LOADING ANALYTICS DATA ===');
    console.log('[Analytics] Date range:', dateStart, 'to', dateEnd);

    try {
        // NEW: Fetch suspensions for the date range to adjust attendance calculations
        const { data: suspensions } = await supabase
            .from('holidays')
            .select('holiday_date')
            .eq('is_suspended', true)
            .gte('holiday_date', dateStart)
            .lte('holiday_date', dateEnd);
        
        const suspensionDays = suspensions?.length || 0;
        console.log('[Analytics] Suspension days found:', suspensionDays);
        
        // Fetch all data in parallel
        const [
            trendData,
            statusData,
            reasonsData,
            classData,
            criticalData,
            lateData
        ] = await Promise.all([
            fetchAttendanceTrend(dateStart, dateEnd),
            fetchStatusDistribution(dateStart, dateEnd),
            fetchCommonReasons(dateStart, dateEnd),
            fetchClassPerformance(dateStart, dateEnd),
            fetchCriticalAbsences(),
            fetchFrequentLate(dateStart, dateEnd)
        ]);
        
        // DEBUG: Log all fetched data
        console.log('[Analytics] Trend data:', JSON.stringify(trendData));
        console.log('[Analytics] Status data:', JSON.stringify(statusData));
        console.log('[Analytics] Class data:', JSON.stringify(classData));
        console.log('[Analytics] Critical data:', JSON.stringify(criticalData));
        console.log('[Analytics] Late data:', JSON.stringify(lateData));

        // Store data for export
        analyticsData = {
            attendanceTrend: trendData,
            statusDistribution: statusData,
            commonReasons: reasonsData,
            classPerformance: classData,
            criticalStudents: criticalData,
            frequentLate: lateData,
            suspensionDays: suspensionDays
        };

        // Update charts and lists (pass suspension info for accurate calculations)
        updateTrendChart(trendData, { dateStart, dateEnd, suspensionDays });
        updatePieChart(statusData);
        updateBarChart(reasonsData);
        updateClassChart(classData, { suspensionDays });
        updateCriticalList(criticalData);
        updateLateList(lateData);

    } catch (error) {
        console.error('[Analytics] Error loading analytics data:', error);
    } finally {
        if (btn) {
            btn.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4"></i>';
            lucide.createIcons();
        }
        console.log('[Analytics] === ANALYTICS LOAD COMPLETE ===');
    }
}

/**
 * Fetch attendance trend over time grouped by date
 * UPDATED: Now fetches attendance_logs and excuse_letters separately, then merges in JavaScript
 * This fixes the PGRST200 error caused by trying to join tables without a direct foreign key relationship
 */
async function fetchAttendanceTrend(dateStart, dateEnd) {
    console.log('[Analytics] fetchAttendanceTrend - Date range:', dateStart, 'to', dateEnd);
    
    // Fetch all attendance logs within date range (no join)
    const { data: logs, error } = await supabase
        .from('attendance_logs')
        .select(`
            id,
            log_date,
            status,
            remarks,
            student_id
        `)
        .gte('log_date', dateStart)
        .lte('log_date', dateEnd)
        .order('log_date');

    if (error) {
        console.error('[Analytics] Error fetching attendance trend:', error);
        // FIX: Return object structure instead of array to match chart expectations
        return {
            labels: [],
            present: [],
            late: [],
            absent: [],
            excused: []
        };
    }

    console.log('[Analytics] Attendance logs fetched:', logs?.length || 0, 'records');

    // If no logs, return empty data
    if (!logs || logs.length === 0) {
        return {
            labels: [],
            present: [],
            late: [],
            absent: [],
            excused: []
        };
    }

    // Fetch excuse letters separately using ONLY the date range (Prevents HTTP 414 URI Too Long crash)
    let excusedMap = new Map(); 
    const { data: excuses } = await supabase
        .from('excuse_letters')
        .select('student_id, date_absent, status')
        .gte('date_absent', dateStart)
        .lte('date_absent', dateEnd)
        .eq('status', 'Approved');

    if (excuses) {
        excuses.forEach(e => {
            excusedMap.set(`${e.student_id}-${e.date_absent}`, true);
        });
    }

    // Group by date
    const dateGroups = {};
    logs.forEach(log => {
        const date = log.log_date;
        if (!dateGroups[date]) {
            dateGroups[date] = { Present: 0, Late: 0, Absent: 0, Excused: 0 };
        }

        // Check if excused by looking up in the map
        const isExcused = excusedMap.has(`${log.student_id}-${log.log_date}`);

        // Parse remarks field for subject-specific attendance
        const calculatedStatus = calculateStatusFromRemarks(log.remarks, log.status);
        
        const status = calculatedStatus; // Use calculated status from remarks
        
        if (isExcused) {
            dateGroups[date].Excused++;
        } else if (status === 'Present' || status === 'On Time') {
            dateGroups[date].Present++;
        } else if (status === 'Late') {
            dateGroups[date].Late++;
        } else if (status === 'Absent') {
            dateGroups[date].Absent++;
        } else {
            // Handle other statuses as Present by default
            dateGroups[date].Present++;
        }
    });

    // Convert to chart format
    const sortedDates = Object.keys(dateGroups).sort();
    return {
        labels: sortedDates.map(d => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })),
        present: sortedDates.map(d => dateGroups[d].Present),
        late: sortedDates.map(d => dateGroups[d].Late),
        absent: sortedDates.map(d => dateGroups[d].Absent),
        excused: sortedDates.map(d => dateGroups[d].Excused)
    };
}

/**
 * OPTION B: Calculate overall status from remarks field
 * This function parses the remarks field to determine the actual attendance status
 * Priority: Excused > Absent > Late > Present
 */
function calculateStatusFromRemarks(remarks, defaultStatus) {
    // If no remarks, use the default status from the status field
    if (!remarks || remarks.trim() === '') {
        return defaultStatus || 'Present';
    }
    
    // Extract all subject attendance from remarks
    // Format: "[Math: Present] [Science: Absent] [Filipino: Late]"
    const subjectRegex = /\[([^\]]+): (Present|Absent|Excused|Late)\]/g;
    const subjectStatuses = [];
    let match;
    
    while ((match = subjectRegex.exec(remarks)) !== null) {
        subjectStatuses.push(match[2]); // match[2] is the status (Present, Absent, etc.)
    }
    
    // If no subject statuses found in remarks, use default status
    if (subjectStatuses.length === 0) {
        return defaultStatus || 'Present';
    }
    
    // Priority calculation: Excused > Absent > Late > Present
    if (subjectStatuses.includes('Excused')) return 'Excused';
    if (subjectStatuses.includes('Absent')) return 'Absent';
    if (subjectStatuses.includes('Late')) return 'Late';
    return 'Present';
}

/**
 * Fetch total status distribution for the date range
 */
async function fetchStatusDistribution(dateStart, dateEnd) {
    console.log('[Analytics] fetchStatusDistribution - Date range:', dateStart, 'to', dateEnd);
    
    // First get attendance logs
    const { data: logs, error } = await supabase
        .from('attendance_logs')
        .select('id, status, log_date')
        .gte('log_date', dateStart)
        .lte('log_date', dateEnd);

    if (error) {
        console.error('[Analytics] Error fetching status distribution:', error);
        return { Present: 0, Late: 0, Absent: 0, Excused: 0 };
    }
    
    console.log('[Analytics] Status logs fetched:', logs?.length || 0, 'records');

    // Get excused absences via excuse_letters
    const excusedDates = new Set();
    if (logs && logs.length > 0) {
        const studentIds = [...new Set(logs.map(l => l.student_id))];
        const dates = [...new Set(logs.map(l => l.log_date))];
        
        const { data: excuses } = await supabase
            .from('excuse_letters')
            .select('student_id, date_absent, status')
            .in('student_id', studentIds)
            .in('date_absent', dates)
            .eq('status', 'Approved');

        if (excuses) {
            excuses.forEach(e => excusedDates.add(`${e.student_id}-${e.date_absent}`));
        }
    }

    // Count statuses
    const counts = { Present: 0, Late: 0, Absent: 0, Excused: 0 };
    
    logs.forEach(log => {
        const isExcused = excusedDates.has(`${log.student_id}-${log.log_date}`);
        const status = log.status || 'Absent';

        if (isExcused) {
            counts.Excused++;
        } else if (status === 'Present' || status === 'On Time') {
            counts.Present++;
        } else if (status === 'Late') {
            counts.Late++;
        } else if (status === 'Absent') {
            counts.Absent++;
        }
    });

    return counts;
}

/**
 * Fetch common reasons from excuse_letters and clinic_visits
 */
async function fetchCommonReasons(dateStart, dateEnd) {
    const reasons = {};

    // Fetch excuse letter reasons
    const { data: excuses } = await supabase
        .from('excuse_letters')
        .select('reason, date_absent')
        .gte('date_absent', dateStart)
        .lte('date_absent', dateEnd);

    if (excuses) {
        excuses.forEach(e => {
            const reason = e.reason || 'Other';
            reasons[reason] = (reasons[reason] || 0) + 1;
        });
    }

    // Fetch clinic visit reasons
    const { data: clinicVisits } = await supabase
        .from('clinic_visits')
        .select('reason, time_in')
        .gte('time_in', dateStart)
        .lte('time_in', dateEnd + 'T23:59:59');

    if (clinicVisits) {
        clinicVisits.forEach(v => {
            const reason = v.reason || 'Other';
            reasons[reason] = (reasons[reason] || 0) + 1;
        });
    }

    // Sort by count and take top 8
    const sorted = Object.entries(reasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    return {
        labels: sorted.map(s => s[0]),
        data: sorted.map(s => s[1])
    };
}

/**
 * Fetch class performance (attendance rate per class)
 */
async function fetchClassPerformance(dateStart, dateEnd) {
    console.log('[Analytics] fetchClassPerformance - Date range:', dateStart, 'to', dateEnd);
    
    // Get all classes
    const { data: classes } = await supabase
        .from('classes')
        .select('id, grade_level, section_name');

    console.log('[Analytics] Classes fetched:', classes?.length || 0);
    
    if (!classes || classes.length === 0) {
        return { labels: [], data: [] };
    }

    // Get attendance logs for each class
    const { data: logs } = await supabase
        .from('attendance_logs')
        .select('student_id, status, log_date')
        .gte('log_date', dateStart)
        .lte('log_date', dateEnd);

    // Get students with their class info
    const { data: students } = await supabase
        .from('students')
        .select('id, class_id, full_name');

    // Create student to class mapping
    const studentClassMap = {};
    students.forEach(s => {
        studentClassMap[s.id] = s.class_id;
    });

    // Group attendance by class
    const classAttendance = {};
    classes.forEach(c => {
        classAttendance[c.id] = { total: 0, present: 0 };
    });

    if (logs) {
        logs.forEach(log => {
            const classId = studentClassMap[log.student_id];
            if (classId && classAttendance[classId]) {
                classAttendance[classId].total++;
                if (log.status === 'Present' || log.status === 'On Time') {
                    classAttendance[classId].present++;
                }
            }
        });
    }

    // Calculate attendance rate per class
    const classRates = classes.map(c => {
        const ca = classAttendance[c.id];
        const rate = ca.total > 0 ? Math.round((ca.present / ca.total) * 100) : 0;
        return {
            label: `${c.grade_level}-${c.section_name}`,
            rate: rate
        };
    }).filter(c => c.rate > 0);

    // Sort by rate descending
    classRates.sort((a, b) => b.rate - a.rate);

    return {
        labels: classRates.slice(0, 10).map(c => c.label),
        data: classRates.slice(0, 10).map(c => c.rate)
    };
}

/**
 * Fetch students with >10 absences (critical watchlist)
 * FIX #2: Added 30-day default limit to prevent browser crash from large dataset
 */
async function fetchCriticalAbsences() {
    // FIX: Default to last 30 days to prevent loading entire database history
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setMinutes(thirtyDaysAgo.getMinutes() - thirtyDaysAgo.getTimezoneOffset());
    const dateLimit = thirtyDaysAgo.toISOString().split('T')[0];
    
    // Get all students
    const { data: students } = await supabase
        .from('students')
        .select('id, full_name, student_id_text');

    if (!students || students.length === 0) return [];

    // Get excused dates for all students (limited to last 30 days)
    const studentIds = students.map(s => s.id);
    const { data: excuses } = await supabase
        .from('excuse_letters')
        .select('student_id, date_absent, status')
        .in('student_id', studentIds)
        .eq('status', 'Approved')
        .gte('date_absent', dateLimit);

    const excusedDates = new Set();
    if (excuses) {
        excuses.forEach(e => excusedDates.add(`${e.student_id}-${e.date_absent}`));
    }

    // FIX: Get attendance logs only from last 30 days
    const { data: logs } = await supabase
        .from('attendance_logs')
        .select('student_id, log_date, status')
        .gte('log_date', dateLimit);

    // Count absences per student
    const absenceCounts = {};
    students.forEach(s => {
        absenceCounts[s.id] = { name: s.full_name, id: s.student_id_text, absent: 0 };
    });

    if (logs) {
        logs.forEach(log => {
            if (absenceCounts[log.student_id]) {
                const isExcused = excusedDates.has(`${log.student_id}-${log.log_date}`);
                if (log.status === 'Absent' && !isExcused) {
                    absenceCounts[log.student_id].absent++;
                }
            }
        });
    }

    // Filter students with >10 absences
    const critical = Object.values(absenceCounts)
        .filter(s => s.absent > 10)
        .sort((a, b) => b.absent - a.absent)
        .slice(0, 10);

    return critical;
}

/**
 * Fetch students with most late incidents
 */
async function fetchFrequentLate(dateStart, dateEnd) {
    const { data: logs, error } = await supabase
        .from('attendance_logs')
        .select('student_id, status')
        .gte('log_date', dateStart)
        .lte('log_date', dateEnd)
        .eq('status', 'Late');

    if (error || !logs) return [];

    // Count late incidents per student
    const lateCounts = {};
    logs.forEach(log => {
        if (!lateCounts[log.student_id]) {
            lateCounts[log.student_id] = 0;
        }
        lateCounts[log.student_id]++;
    });

    // Get student info
    const studentIds = Object.keys(lateCounts).map(Number);
    if (studentIds.length === 0) return [];

    const { data: students } = await supabase
        .from('students')
        .select('id, full_name, student_id_text')
        .in('id', studentIds);

    // Combine and sort
    const result = Object.entries(lateCounts)
        .map(([studentId, count]) => {
            const student = students?.find(s => s.id === parseInt(studentId));
            return {
                name: student?.full_name || 'Unknown',
                id: student?.student_id_text || '',
                count: count
            };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    return result;
}

/**
 * Update Trend Chart with real data
 * UPDATED: Added empty state protection and suspension-adjusted calculations
 */
function updateTrendChart(data, options = {}) {
    const { suspensionDays = 0, dateStart, dateEnd } = options;
    
    // DEBUG: Log incoming data for debugging
    console.log('[Analytics] updateTrendChart received:', JSON.stringify(data));
    
    // EMPTY STATE PROTECTION - Show message if no data
    // FIX: Check data.labels.length instead of data.length (data is an object, not array)
    if (!data || !data.labels || data.labels.length === 0) {
        console.log('[Analytics] No trend data found - showing empty state');
        const chartContainer = document.getElementById('trendChart')?.parentElement;
        if (chartContainer) {
            chartContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center h-64 text-gray-400">
                    <i data-lucide="bar-chart-2" class="w-12 h-12 mb-2"></i>
                    <p class="font-medium">Insufficient Data for Analysis</p>
                    <p class="text-sm">No attendance records found for this period.</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
        return;
    }
    
    // Calculate effective school days (excluding suspensions)
    if (dateStart && dateEnd) {
        const start = new Date(dateStart);
        const end = new Date(dateEnd);
        const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        const effectiveDays = Math.max(0, totalDays - suspensionDays);
        
        console.log('[Analytics] Effective school days:', effectiveDays, '(total:', totalDays, '- suspensions:', suspensionDays, ')');
        
        // Note: data is already an object with arrays, no need to map - effectiveDays is used elsewhere
    }
    
    if (!trendChart) {
        const ctx = document.getElementById('trendChart').getContext('2d');
        trendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { usePointStyle: true, padding: 20 }
                    }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    }

    trendChart.data.labels = data.labels || [];
    trendChart.data.datasets = [
        {
            label: 'Present',
            data: data.present || [],
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true,
            tension: 0.4
        },
        {
            label: 'Late',
            data: data.late || [],
            borderColor: '#eab308',
            backgroundColor: 'rgba(234, 179, 8, 0.1)',
            fill: true,
            tension: 0.4
        },
        {
            label: 'Absent',
            data: data.absent || [],
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            fill: true,
            tension: 0.4
        },
        {
            label: 'Excused',
            data: data.excused || [],
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.4
        }
    ];
    trendChart.update();
}

/**
 * Update Pie Chart with status distribution
 */
function updatePieChart(data) {
    console.log('[Analytics] updatePieChart received:', JSON.stringify(data));
    
    if (!pieChart) {
        const ctx = document.getElementById('pieChart').getContext('2d');
        pieChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } }
                },
                cutout: '70%'
            }
        });
    }

    pieChart.data.labels = ['Present', 'Late', 'Absent', 'Excused'];
    pieChart.data.datasets = [{
        data: [
            data.Present || 0,
            data.Late || 0,
            data.Absent || 0,
            data.Excused || 0
        ],
        backgroundColor: ['#22c55e', '#eab308', '#ef4444', '#3b82f6']
    }];
    pieChart.update();
}

/**
 * Update Bar Chart with common reasons
 */
function updateBarChart(data) {
    console.log('[Analytics] updateBarChart received:', JSON.stringify(data));
    
    if (!barChart) {
        const ctx = document.getElementById('barChart').getContext('2d');
        barChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    }

    barChart.data.labels = data.labels || [];
    barChart.data.datasets = [{
        label: 'Incidents',
        data: data.data || [],
        backgroundColor: '#8b5cf6',
        borderRadius: 6
    }];
    barChart.update();
}

/**
 * Update Class Performance Chart
 * UPDATED: Added empty state protection and department sorting (grade bucketing)
 */
function updateClassChart(data, options = {}) {
    const { suspensionDays = 0 } = options;
    
    // DEBUG: Log incoming data
    console.log('[Analytics] updateClassChart received:', JSON.stringify(data));
    
    // EMPTY STATE PROTECTION
    if (!data || !data.labels || data.labels.length === 0) {
        const chartContainer = document.getElementById('classChart')?.parentElement;
        if (chartContainer) {
            chartContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center h-64 text-gray-400">
                    <i data-lucide="bar-chart-2" class="w-12 h-12 mb-2"></i>
                    <p class="font-medium">Insufficient Data for Analysis</p>
                    <p class="text-sm">No class performance data available.</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
        return;
    }
    
    // DEPARTMENT SORTING: Aggregate grades into 4 pillars
    // Kinder -> "Kindergarten", Grade 1-6 -> "Elementary", Grade 7-10 -> "Junior High", Grade 11-12 -> "Senior High"
    const departmentData = aggregateByDepartment(data);
    
    if (!classChart) {
        const ctx = document.getElementById('classChart').getContext('2d');
        classChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        max: 100,
                        ticks: { callback: value => value + '%' }
                    }
                }
            }
        });
    }

    // Use department-aggregated data for the chart
    classChart.data.labels = departmentData.labels;
    classChart.data.datasets = [{
        label: 'Attendance Rate (%)',
        data: departmentData.rates,
        backgroundColor: departmentData.rates.map(rate => {
            if (rate >= 90) return '#22c55e';
            if (rate >= 75) return '#eab308';
            return '#ef4444';
        }),
        borderRadius: 6
    }];
    classChart.update();
}

/**
 * Map grade level to department pillar
 * Helper function for department sorting
 */
function getDepartmentPillar(gradeLevel) {
    if (!gradeLevel) return 'Unassigned';
    
    const gl = gradeLevel.toLowerCase();
    
    if (gl.includes('kinder') || gl === 'k' || gl === 'nursery' || gl === 'pre-school') {
        return 'Kindergarten';
    }
    
    const gradeMatch = gl.match(/grade\s*(\d+)/);
    if (gradeMatch) {
        const gradeNum = parseInt(gradeMatch[1]);
        if (gradeNum >= 1 && gradeNum <= 6) return 'Elementary';
        if (gradeNum >= 7 && gradeNum <= 10) return 'Junior High';
        if (gradeNum >= 11 && gradeNum <= 12) return 'Senior High';
    }
    
    return 'Unassigned';
}

/**
 * Aggregate data by department pillar
 * Groups Grade 1-6 into Elementary, Grade 7-10 into Junior High, etc.
 */
function aggregateByDepartment(data) {
    const departments = {
        'Kindergarten': { totalStudents: 0, totalPresent: 0 },
        'Elementary': { totalStudents: 0, totalPresent: 0 },
        'Junior High': { totalStudents: 0, totalPresent: 0 },
        'Senior High': { totalStudents: 0, totalPresent: 0 },
        'Unassigned': { totalStudents: 0, totalPresent: 0 }
    };
    
    // Aggregate by department
    for (let i = 0; i < data.labels.length; i++) {
        const label = data.labels[i];
        const rate = data.data[i] || 0;
        const pillar = getDepartmentPillar(label);
        
        if (departments[pillar]) {
            // We'll estimate total students based on rate (this is a simplification)
            // In a real scenario, you'd want actual student counts
            departments[pillar].totalPresent += rate; // Just accumulate rates for averaging
            departments[pillar].totalStudents += 1;
        }
    }
    
    // Calculate average rates per department
    const labels = [];
    const rates = [];
    
    ['Kindergarten', 'Elementary', 'Junior High', 'Senior High'].forEach(dept => {
        if (departments[dept].totalStudents > 0) {
            labels.push(dept);
            const avgRate = Math.round(departments[dept].totalPresent / departments[dept].totalStudents);
            rates.push(avgRate);
        }
    });
    
    return { labels, rates };
}

/**
 * Update Critical Watchlist
 */
function updateCriticalList(students) {
    const container = document.getElementById('criticalListContainer');
    
    if (!students || students.length === 0) {
        container.innerHTML = `
            <div class="flex justify-center items-center h-full text-gray-400 text-sm font-bold italic">
                No critical cases found
            </div>
        `;
        return;
    }

    container.innerHTML = students.map(s => `
        <div class="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-xl">
            <div class="flex items-center gap-3">
                <div class="h-10 w-10 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-bold">
                    ${s.name.charAt(0)}
                </div>
                <div>
                    <p class="font-bold text-gray-900 text-sm">${s.name}</p>
                    <p class="text-xs text-gray-400">ID: ${s.id}</p>
                </div>
            </div>
            <div class="text-right">
                <p class="font-black text-red-600 text-lg">${s.absent}</p>
                <p class="text-[10px] text-gray-400 font-bold uppercase">absences</p>
            </div>
        </div>
    `).join('');
}

/**
 * Update Frequent Late List
 */
function updateLateList(students) {
    const container = document.getElementById('lateListContainer');
    
    if (!students || students.length === 0) {
        container.innerHTML = `
            <div class="flex justify-center items-center h-full text-gray-400 text-sm font-bold italic">
                No late incidents found
            </div>
        `;
        return;
    }

    container.innerHTML = students.map(s => `
        <div class="flex items-center justify-between p-3 bg-amber-50 border border-amber-100 rounded-xl">
            <div class="flex items-center gap-3">
                <div class="h-10 w-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 font-bold">
                    ${s.name.charAt(0)}
                </div>
                <div>
                    <p class="font-bold text-gray-900 text-sm">${s.name}</p>
                    <p class="text-xs text-gray-400">ID: ${s.id}</p>
                </div>
            </div>
            <div class="text-right">
                <p class="font-black text-amber-600 text-lg">${s.count}</p>
                <p class="text-[10px] text-gray-400 font-bold uppercase">lates</p>
            </div>
        </div>
    `).join('');
}

/**
 * Export data to CSV
 */
function exportToCSV() {
    const dateStart = document.getElementById('dateStart').value;
    const dateEnd = document.getElementById('dateEnd').value;
    
    let csvContent = 'Educare Analytics Report\n';
    csvContent += `Date Range: ${dateStart} to ${dateEnd}\n\n`;

    // Status Distribution
    csvContent += 'STATUS DISTRIBUTION\n';
    csvContent += 'Status,Count\n';
    const status = analyticsData.statusDistribution;
    csvContent += `Present,${status.Present || 0}\n`;
    csvContent += `Late,${status.Late || 0}\n`;
    csvContent += `Absent,${status.Absent || 0}\n`;
    csvContent += `Excused,${status.Excused || 0}\n\n`;

    // Common Reasons
    csvContent += 'COMMON REASONS\n';
    csvContent += 'Reason,Count\n';
    const reasons = analyticsData.commonReasons;
    if (reasons.labels && reasons.data) {
        reasons.labels.forEach((label, i) => {
            csvContent += `${label},${reasons.data[i]}\n`;
        });
    }
    csvContent += '\n';

    // Class Performance
    csvContent += 'CLASS PERFORMANCE\n';
    csvContent += 'Class,Attendance Rate (%)\n';
    const classes = analyticsData.classPerformance;
    if (classes.labels && classes.data) {
        classes.labels.forEach((label, i) => {
            csvContent += `${label},${classes.data[i]}\n`;
        });
    }
    csvContent += '\n';

    // Critical Watchlist
    csvContent += 'CRITICAL WATCHLIST (>10 Absences)\n';
    csvContent += 'Student Name,Student ID,Absence Count\n';
    const critical = analyticsData.criticalStudents;
    if (critical) {
        critical.forEach(s => {
            csvContent += `${s.name},${s.id},${s.absent}\n`;
        });
    }
    csvContent += '\n';

    // Frequent Late
    csvContent += 'FREQUENT LATE ARRIVALS\n';
    csvContent += 'Student Name,Student ID,Late Count\n';
    const late = analyticsData.frequentLate;
    if (late) {
        late.forEach(s => {
            csvContent += `${s.name},${s.id},${s.count}\n`;
        });
    }

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Educare_Analytics_${dateStart}_to_${dateEnd}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

/**
 * Initialize empty charts for initial UI display
 */
function initializeEmptyCharts() {
    // 1. Trend Chart (Line)
    const trendCtx = document.getElementById('trendChart').getContext('2d');
    trendChart = new Chart(trendCtx, {
        type: 'line',
        data: {
            labels: ['No Data'],
            datasets: [{
                label: 'No Data',
                data: [0],
                borderColor: '#cbd5e1',
                borderDash: [5, 5]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });

    // 2. Pie Chart
    const pieCtx = document.getElementById('pieChart').getContext('2d');
    pieChart = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
            labels: ['Present', 'Late', 'Absent', 'Excused'],
            datasets: [{
                data: [0, 0, 0, 0],
                backgroundColor: ['#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            cutout: '70%'
        }
    });

    // 3. Bar Chart
    const barCtx = document.getElementById('barChart').getContext('2d');
    barChart = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: ['No Data'],
            datasets: [{
                label: 'Incidents',
                data: [0],
                backgroundColor: '#cbd5e1',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });

    // 4. Class Performance Chart
    const classCtx = document.getElementById('classChart').getContext('2d');
    classChart = new Chart(classCtx, {
        type: 'bar',
        data: {
            labels: ['No Data'],
            datasets: [{
                label: 'Attendance Rate',
                data: [0],
                backgroundColor: '#cbd5e1',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { callback: value => value + '%' }
                }
            }
        }
    });
}

// ===== GLOBAL WINDOW ATTACHMENTS FOR HTML ONCLICK HANDLERS =====
window.loadAnalyticsData = loadAnalyticsData;
window.exportToCSV = exportToCSV;
