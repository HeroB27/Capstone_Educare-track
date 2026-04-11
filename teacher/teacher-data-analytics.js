// teacher/teacher-data-analytics.js - Teacher Data Analytics (FULL)
// Enhanced: Student Performance Chart, Homeroom Table, Student Modals

let analyticsCharts = {};
let trendChart, pieChart, barChart, studentChart;
let currentHomeroomClass = null;
let studentIdsInHomeroom = [];
let dateStart = null;
let dateEnd = null;
let currentSelectedStudentId = null;
let currentSelectedStudentName = null;
let currentTrendGrouping = 'quarter';

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof supabase === 'undefined') {
        console.error('Supabase client not loaded!');
        showErrorMessage('Supabase client failed to load. Refresh the page.');
        return;
    }
    await waitForCurrentUser();
    setupDateFilters();
    await loadAnalytics();
});

function setupDateFilters() {
    const startInput = document.getElementById('dateStart');
    const endInput = document.getElementById('dateEnd');
    const today = new Date();
    
    // Default to quarter (last 3 months)
    const quarterAgo = new Date();
    quarterAgo.setMonth(today.getMonth() - 3);
    
    if (startInput) {
        startInput.value = quarterAgo.toISOString().split('T')[0];
    }
    if (endInput) {
        endInput.value = today.toISOString().split('T')[0];
    }
    
    dateStart = startInput?.value || quarterAgo.toISOString().split('T')[0];
    dateEnd = endInput?.value || today.toISOString().split('T')[0];
}

function waitForCurrentUser() {
    return new Promise((resolve) => {
        if (typeof currentUser !== 'undefined' && currentUser) return resolve();
        const checkInterval = setInterval(() => {
            if (typeof currentUser !== 'undefined' && currentUser) {
                clearInterval(checkInterval);
                resolve();
            }
        }, 200);
    });
}

async function loadAnalytics() {
    try {
        const startInput = document.getElementById('dateStart');
        const endInput = document.getElementById('dateEnd');
        dateStart = startInput?.value || dateStart;
        dateEnd = endInput?.value || dateEnd;
        
        if (!dateStart || !dateEnd) {
            const today = new Date();
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            dateStart = thirtyDaysAgo.toISOString().split('T')[0];
            dateEnd = today.toISOString().split('T')[0];
        }

        const { data: homeroom, error: homeroomError } = await supabase
            .from('classes')
            .select('id, grade_level, department')
            .eq('adviser_id', currentUser.id)
            .single();

        if (homeroomError || !homeroom) {
            console.log('No homeroom class found for this teacher');
            showNoHomeroomMessage();
            return;
        }
        currentHomeroomClass = homeroom;

        const { data: students, error: studentsError } = await supabase
            .from('students')
            .select('id')
            .eq('class_id', homeroom.id)
            .eq('status', 'Enrolled');

        if (studentsError || !students || students.length === 0) {
            console.log('No students found in homeroom');
            showNoStudentsMessage();
            return;
        }
        studentIdsInHomeroom = students.map(s => Number(s.id));

        await Promise.all([
            loadPeriodStats(dateStart, dateEnd),
            loadTrendData(dateStart, dateEnd),
            loadStudentPerformanceChart(dateStart, dateEnd),
            loadHomeroomClassAttendanceTable(dateStart, dateEnd),
            loadCommonReasons(dateStart, dateEnd),
            loadCriticalAbsences(dateStart, dateEnd)
        ]);

    } catch (err) {
        console.error('Error in loadAnalytics:', err);
        showErrorMessage('Failed to load analytics data.');
    }
}

async function loadAnalyticsData(event) {
    if (event) event.preventDefault();
    
    const startInput = document.getElementById('dateStart');
    const endInput = document.getElementById('dateEnd');
    if (startInput) dateStart = startInput.value;
    if (endInput) dateEnd = endInput.value;
    
    await loadAnalytics();
}

async function switchTrendGrouping(mode) {
    currentTrendGrouping = mode;
    
    // Update button styles
    const btnQuarter = document.getElementById('btnQuarter');
    const btnMonth = document.getElementById('btnMonth');
    const btnWeek = document.getElementById('btnWeek');
    
    if (btnQuarter) btnQuarter.className = mode === 'quarter' 
        ? 'px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold' 
        : 'px-3 py-1.5 bg-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-300';
    if (btnMonth) btnMonth.className = mode === 'month' 
        ? 'px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold' 
        : 'px-3 py-1.5 bg-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-300';
    if (btnWeek) btnWeek.className = mode === 'week' 
        ? 'px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold' 
        : 'px-3 py-1.5 bg-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-300';
    
    const weekFilter = document.getElementById('weekMonthFilter');
    if (weekFilter) weekFilter.classList.toggle('hidden', mode !== 'week');
    
    // Adjust date range based on mode
    const today = new Date();
    let startDate = new Date();
    
    if (mode === 'quarter') {
        // Last 3 months (school quarter)
        startDate.setMonth(today.getMonth() - 3);
    } else if (mode === 'month') {
        // Last 30 days
        startDate.setDate(today.getDate() - 30);
    } else if (mode === 'week') {
        // Last 7 days
        startDate.setDate(today.getDate() - 7);
    }
    
    // Update date inputs
    const dateStartInput = document.getElementById('dateStart');
    const dateEndInput = document.getElementById('dateEnd');
    
    if (dateStartInput) dateStartInput.value = startDate.toISOString().split('T')[0];
    if (dateEndInput) dateEndInput.value = today.toISOString().split('T')[0];
    
    // Update global date variables
    dateStart = startDate.toISOString().split('T')[0];
    dateEnd = today.toISOString().split('T')[0];
    
    await loadAnalytics();
}

function handleWeekMonthChange() {
    loadAnalytics();
}

function showNoHomeroomMessage() {
    const avgEl = document.getElementById('avgAttendanceRate');
    if (avgEl) avgEl.innerText = 'N/A';
    const tbody = document.getElementById('homeroomAttendanceTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400 italic">No homeroom class assigned.</td></tr>';
}

function showNoStudentsMessage() {
    const tbody = document.getElementById('homeroomAttendanceTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400 italic">No students enrolled in your homeroom.</td></tr>';
}

async function loadPeriodStats(startDate, endDate) {
    if (!studentIdsInHomeroom.length) return;
    
    try {
        // Fetch ALL attendance logs - same as admin
        const { data: logs, error } = await supabase
            .from('attendance_logs')
            .select('student_id, log_date, status, morning_absent, afternoon_absent')
            .in('student_id', studentIdsInHomeroom)
            .gte('log_date', startDate)
            .lte('log_date', endDate);

        if (error) throw error;
        if (!logs?.length) {
            // No records - show empty
            const avgEl = document.getElementById('avgAttendanceRate');
            if (avgEl) avgEl.innerText = '0%';
            renderPieChart({ Present: 0, Absent: 0, Late: 0, Excused: 0, HalfDay: 0 });
            return;
        }

        // Get excused letters - same as admin
        const { data: excuses } = await supabase
            .from('excuse_letters')
            .select('student_id, date_absent')
            .eq('status', 'Approved')
            .in('student_id', studentIdsInHomeroom)
            .gte('date_absent', startDate)
            .lte('date_absent', endDate);

        // Create excused set for quick lookup
        const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);

        // Count stats - same logic as admin
        const counts = { Present: 0, Late: 0, Absent: 0, Excused: 0, HalfDay: 0 };
        
        logs.forEach(log => {
            const morningAbsent = log.morning_absent || false;
            const afternoonAbsent = log.afternoon_absent || false;
            const isFullDayAbsent = morningAbsent && afternoonAbsent;
            const isHalfDay = (morningAbsent !== afternoonAbsent && !isFullDayAbsent) || log.status === 'Half Day';
            
            const isExcused = excusedSet.has(`${log.student_id}-${log.log_date}`);
            
            if (isExcused) {
                counts.Excused++;
                counts.Present++;
            } else if (isHalfDay) {
                counts.HalfDay++;
                counts.Present += 0.5;
            } else if (isFullDayAbsent) {
                counts.Absent++;
            } else if (log.status === 'Present' || log.status === 'On Time') {
                counts.Present++;
            } else if (log.status === 'Late') {
                counts.Late++;
                counts.Present++;
            } else if (log.status === 'Absent') {
                counts.Absent++;
            } else {
                // Any other status or empty - treat as present
                counts.Present++;
            }
        });

        // Calculate average attendance rate - same as admin: present / totalRecords
        const totalRecords = logs.length;
        const presentPercent = Math.round((counts.Present / totalRecords) * 100);
        
        const avgEl = document.getElementById('avgAttendanceRate');
        if (avgEl) avgEl.innerText = presentPercent + '%';
        
        // Render status distribution pie chart
        renderPieChart({
            Present: Math.round(counts.Present),
            Absent: counts.Absent,
            Late: counts.Late,
            Excused: counts.Excused,
            HalfDay: counts.HalfDay
        });
    } catch (err) {
        console.error('Error in loadPeriodStats:', err);
    }
}

function countSchoolDays(startDate, endDate) {
    let count = 0;
    let current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) count++;
        current.setDate(current.getDate() + 1);
    }
    return Math.max(1, count);
}

async function loadTrendData(startDate, endDate) {
    if (!studentIdsInHomeroom.length) return;
    const totalStudents = studentIdsInHomeroom.length;
    try {
        // Fetch attendance logs
        const { data: logs, error } = await supabase
            .from('attendance_logs')
            .select('student_id, log_date, status, morning_absent, afternoon_absent')
            .in('student_id', studentIdsInHomeroom)
            .gte('log_date', startDate)
            .lte('log_date', endDate);

        if (error) throw error;

        // Fetch holidays to exclude suspended dates
        const { data: holidays } = await supabase
            .from('holidays')
            .select('holiday_date')
            .eq('is_suspended', true)
            .gte('holiday_date', startDate)
            .lte('holiday_date', endDate);

        const holidaySet = new Set(holidays?.map(h => h.holiday_date) || []);

        // Fetch excused letters
        const { data: excuses } = await supabase
            .from('excuse_letters')
            .select('student_id, date_absent')
            .eq('status', 'Approved')
            .in('student_id', studentIdsInHomeroom)
            .gte('date_absent', startDate)
            .lte('date_absent', endDate);

        const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);

        // Create date groups for all dates (including weekends for tracking) - will filter out holidays
        const dateGroups = {};
        const start = new Date(startDate);
        const end = new Date(endDate);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            // Skip if holiday is suspended
            if (holidaySet.has(dateStr)) continue;
            dateGroups[dateStr] = { present: 0, absent: 0, late: 0, halfday: 0, excused: 0, total: 0 };
        }

        // Group logs by date
        const logMap = {};
        (logs || []).forEach(log => {
            // Skip holidays
            if (holidaySet.has(log.log_date)) return;
            if (!logMap[log.log_date]) logMap[log.log_date] = {};
            logMap[log.log_date][log.student_id] = log;
        });

        // Count all attendance records
        for (const dateStr in dateGroups) {
            const dayLogs = logMap[dateStr] || {};
            
            for (const studentId of studentIdsInHomeroom) {
                const log = dayLogs[studentId];
                
                // If no record, skip (not counted as absent)
                if (!log) continue;
                
                dateGroups[dateStr].total++;
                
                const status = log.status || '';
                const morningAbsent = log.morning_absent || false;
                const afternoonAbsent = log.afternoon_absent || false;
                const isFullDayAbsent = morningAbsent && afternoonAbsent;
                const isHalfDay = morningAbsent !== afternoonAbsent && !isFullDayAbsent;
                const isExcused = excusedSet.has(`${studentId}-${dateStr}`);

                if (isExcused) {
                    dateGroups[dateStr].excused++;
                    dateGroups[dateStr].present++;
                } else if (isHalfDay) {
                    dateGroups[dateStr].halfday++;
                    dateGroups[dateStr].present += 0.5;
                } else if (isFullDayAbsent) {
                    dateGroups[dateStr].absent++;
                } else if (status === 'Late') {
                    dateGroups[dateStr].late++;
                    dateGroups[dateStr].present++;
                } else if (status === 'Absent') {
                    dateGroups[dateStr].absent++;
                } else if (status === 'Present' || status === 'On Time' || status === '') {
                    dateGroups[dateStr].present++;
                } else {
                    // Any other status - treat as present
                    dateGroups[dateStr].present++;
                }
            }
        }

        const sortedDates = Object.keys(dateGroups).sort();
        
        // If no data, show empty chart
        if (sortedDates.length === 0 || dateGroups[sortedDates[0]]?.total === 0) {
            renderTrendChart([], { present: [], absent: [], late: [], halfday: [], excused: [] });
            return;
        }

        const labels = sortedDates.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        
        // Calculate percentages based on TOTAL records (same as admin)
        const dataPoints = {
            present: sortedDates.map(d => {
                const total = dateGroups[d].total || 1;
                return Math.round((dateGroups[d].present / total) * 100);
            }),
            absent: sortedDates.map(d => {
                const total = dateGroups[d].total || 1;
                return Math.round((dateGroups[d].absent / total) * 100);
            }),
            late: sortedDates.map(d => {
                const total = dateGroups[d].total || 1;
                return Math.round((dateGroups[d].late / total) * 100);
            }),
            halfday: sortedDates.map(d => {
                const total = dateGroups[d].total || 1;
                return Math.round((dateGroups[d].halfday / total) * 100);
            }),
            excused: sortedDates.map(d => {
                const total = dateGroups[d].total || 1;
                return Math.round((dateGroups[d].excused / total) * 100);
            })
        };
        
        console.log('[loadTrendData] dateGroups:', dateGroups);
        console.log('[loadTrendData] dataPoints:', dataPoints);
        
        renderTrendChart(labels, dataPoints);
    } catch (err) {
        console.error('Error in loadTrendData:', err);
    }
}

function renderTrendChart(labels, data) {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    if (trendChart) trendChart.destroy();
    
    // Build datasets - only include non-empty ones
    const datasets = [];
    
    if (data.present?.some(v => v > 0)) {
        datasets.push({ label: 'Present', data: data.present, borderColor: '#22c55e', backgroundColor: '#22c55e20', fill: true, tension: 0.4 });
    }
    if (data.absent?.some(v => v > 0)) {
        datasets.push({ label: 'Absent', data: data.absent, borderColor: '#ef4444', backgroundColor: '#ef444420', fill: true, tension: 0.4 });
    }
    if (data.late?.some(v => v > 0)) {
        datasets.push({ label: 'Late', data: data.late, borderColor: '#eab308', backgroundColor: '#eab30820', fill: true, tension: 0.4 });
    }
    if (data.halfday?.some(v => v > 0)) {
        datasets.push({ label: 'Half Day', data: data.halfday, borderColor: '#f59e0b', backgroundColor: '#f59e0b20', fill: true, tension: 0.4 });
    }
    if (data.excused?.some(v => v > 0)) {
        datasets.push({ label: 'Excused', data: data.excused, borderColor: '#3b82f6', backgroundColor: '#3b82f620', fill: true, tension: 0.4 });
    }
    
    // If no data, show empty message
    if (datasets.length === 0) {
        datasets.push({ label: 'No Data', data: [], borderColor: '#9ca3af', backgroundColor: '#9ca3af20', fill: true, tension: 0.4 });
    }
    
    const ctx = canvas.getContext('2d');
    trendChart = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (value) => value + '%' } } },
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

function renderPieChart(counts) {
    const canvas = document.getElementById('attendancePieChart');
    if (!canvas) return;
    if (pieChart) pieChart.destroy();
    const ctx = canvas.getContext('2d');
    pieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Present', 'Absent', 'Late', 'Excused', 'Half Day'],
            datasets: [{
                data: [counts.Present, counts.Absent, counts.Late, counts.Excused, counts.HalfDay || 0],
                backgroundColor: ['#22c55e', '#ef4444', '#eab308', '#3b82f6', '#f59e0b'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } } }
        }
    });
}

async function loadHomeroomClassAttendanceTable(startDate, endDate) {
    const tbody = document.getElementById('homeroomAttendanceTableBody');
    if (!tbody) return;
    if (!studentIdsInHomeroom.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400 italic">No students in homeroom.</td></tr>';
        return;
    }

    try {
        const { data: students, error: studentsErr } = await supabase
            .from('students')
            .select('id, full_name, student_id_text')
            .in('id', studentIdsInHomeroom)
            .order('full_name');

        if (studentsErr) {
            console.error('Error loading students:', studentsErr);
            throw studentsErr;
        }

        const { data: logs, error: logsErr } = await supabase
            .from('attendance_logs')
            .select('student_id, log_date, status, morning_absent, afternoon_absent')
            .in('student_id', studentIdsInHomeroom)
            .gte('log_date', startDate)
            .lte('log_date', endDate);

        if (logsErr) {
            console.error('Error loading logs:', logsErr);
            throw logsErr;
        }

        const { data: excuses, error: excusesErr } = await supabase
            .from('excuse_letters')
            .select('student_id, date_absent')
            .eq('status', 'Approved')
            .in('student_id', studentIdsInHomeroom)
            .gte('date_absent', startDate)
            .lte('date_absent', endDate);

        if (excusesErr) {
            console.error('Error loading excuses:', excusesErr);
            throw excusesErr;
        }

        const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);

        const stats = {};
        students.forEach(s => {
            // Store both numeric ID (key) and text ID (for display)
            stats[s.id] = { name: s.full_name, id: s.student_id_text, numericId: s.id, present: 0, late: 0, absent: 0, excused: 0, halfday: 0, total: 0 };
        });

        (logs || []).forEach(log => {
            if (!stats[log.student_id]) return;
            const s = stats[log.student_id];
            
            const morningAbsent = log.morning_absent || false;
            const afternoonAbsent = log.afternoon_absent || false;
            const status = log.status || '';
            
            // Check if excused (from excuse_letters table)
            const isExcused = excusedSet.has(`${log.student_id}-${log.log_date}`);
            
            // Determine attendance status
            let isFullDayAbsent = morningAbsent && afternoonAbsent;
            let isHalfDay = morningAbsent !== afternoonAbsent && !isFullDayAbsent;
            
            if (isExcused) {
                // Excused absence - counts as present
                s.excused++;
                s.present++;
            } else if (isHalfDay) {
                // Half day absence - counts as 0.5 present
                s.halfday++;
                s.present += 0.5;
            } else if (isFullDayAbsent || status === 'Absent') {
                // Full day absent
                s.absent++;
            } else if (status === 'Late') {
                // Late but present
                s.late++;
                s.present++;
            } else if (status === 'Present' || status === 'On Time' || status === 'Excused') {
                // Present
                s.present++;
            } else if (status === '') {
                // No status but has a record - assume present if not marked absent
                s.present++;
            } else {
                // Any other status - treat as present (has attended but unclear)
                s.present++;
            }
            
            // Count every record as part of total
            s.total++;
        });

        const rows = Object.values(stats).map(s => ({
            ...s,
            attendancePercent: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0
        })).sort((a, b) => a.name.localeCompare(b.name));

        tbody.innerHTML = rows.map(s => `
            <tr class="border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors" onclick="openStudentAttendanceModal(${s.numericId}, '${escapeHtml(s.name)}')">
                <td class="py-3 px-4 font-medium text-gray-800">${escapeHtml(s.name)}</td>
                <td class="text-center py-3 px-4 text-green-600 font-bold">${s.present.toFixed(1)}</td>
                <td class="text-center py-3 px-4 text-yellow-600 font-bold">${s.late}</td>
                <td class="text-center py-3 px-4 text-red-600 font-bold">${s.absent}</td>
                <td class="text-center py-3 px-4 text-blue-600 font-bold">${s.excused}</td>
                <td class="text-center py-3 px-4 text-orange-600 font-bold">${s.halfday}</td>
                <td class="text-center py-3 px-4">
                    <span class="px-2 py-1 rounded-full text-xs font-bold ${s.attendancePercent >= 90 ? 'bg-green-100 text-green-700' : s.attendancePercent >= 75 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}">${s.attendancePercent}%</span>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Error loading homeroom table:', err);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400 italic">Error loading data.</td></tr>';
    }
}

function openStudentAttendanceModal(studentId, studentName) {
    currentSelectedStudentId = Number(studentId);
    currentSelectedStudentName = studentName;
    document.getElementById('studentAttendanceTitle').textContent = `${studentName} Attendance`;
    
    const startInput = document.getElementById('studentAttendanceStartDate');
    const endInput = document.getElementById('studentAttendanceEndDate');
    if (startInput) startInput.value = dateStart;
    if (endInput) endInput.value = dateEnd;
    
    document.getElementById('studentAttendanceModal').classList.remove('hidden');
    populateStudentAttendanceTable();
    lucide.createIcons();
}

function closeStudentAttendanceModal() {
    document.getElementById('studentAttendanceModal').classList.add('hidden');
}

async function populateStudentAttendanceTable() {
    const tbody = document.getElementById('studentAttendanceTableBody');
    if (!tbody) return;
    
    const startDate = document.getElementById('studentAttendanceStartDate')?.value;
    const endDate = document.getElementById('studentAttendanceEndDate')?.value;
    
    if (!startDate || !endDate) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400 italic">Select a date range.</td></tr>';
        return;
    }

    try {
        const { data: logs, error: logsErr } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', currentSelectedStudentId)
            .gte('log_date', startDate)
            .lte('log_date', endDate)
            .order('log_date', { ascending: false });

        if (logsErr) {
            console.error('Error loading logs:', logsErr);
            throw logsErr;
        }

        const { data: excuses, error: excusesErr } = await supabase
            .from('excuse_letters')
            .select('date_absent')
            .eq('student_id', currentSelectedStudentId)
            .eq('status', 'Approved')
            .gte('date_absent', startDate)
            .lte('date_absent', endDate);

        if (excusesErr) {
            console.error('Error loading excuses:', excusesErr);
            throw excusesErr;
        }

        const excusedDates = new Set(excuses?.map(e => e.date_absent) || []);

        tbody.innerHTML = (logs || []).map(log => {
            const isExcused = excusedDates.has(log.log_date);
            const status = isExcused ? 'Excused' : (log.status || 'Unknown');
            return `
                <tr class="border-b border-gray-50">
                    <td class="py-3 px-4 text-gray-800">${new Date(log.log_date).toLocaleDateString()}</td>
                    <td class="text-center py-3 px-4">
                        <span class="px-2 py-1 rounded-full text-xs font-bold ${status === 'Present' || status === 'On Time' ? 'bg-green-100 text-green-700' : status === 'Late' ? 'bg-yellow-100 text-yellow-700' : status === 'Excused' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}">${status}</span>
                    </td>
                    <td class="text-center py-3 px-4 ${log.morning_absent ? 'text-red-600 font-bold' : 'text-green-600'}">${log.morning_absent ? 'Absent' : 'Present'}</td>
                    <td class="text-center py-3 px-4 ${log.afternoon_absent ? 'text-red-600 font-bold' : 'text-green-600'}">${log.afternoon_absent ? 'Absent' : 'Present'}</td>
                    <td class="text-center py-3 px-4">${isExcused ? '<i data-lucide="check" class="w-4 h-4 text-green-500 inline"></i>' : '-'}</td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="5" class="text-center py-8 text-gray-400 italic">No records found.</td></tr>';
        
        lucide.createIcons();
    } catch (err) {
        console.error('Error loading student attendance:', err);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400 italic">Error loading data.</td></tr>';
    }
}

function refreshStudentAttendance() {
    populateStudentAttendanceTable();
}

function showStudentInfoModal() {
    if (!currentSelectedStudentId) return;
    loadStudentInfo();
    document.getElementById('studentInfoModal').classList.remove('hidden');
}

function closeStudentInfoModal() {
    document.getElementById('studentInfoModal').classList.add('hidden');
}

async function loadStudentInfo() {
    const content = document.getElementById('studentInfoContent');
    if (!content) return;

    try {
        const { data: student } = await supabase
            .from('students')
            .select('*')
            .eq('id', currentSelectedStudentId)
            .single();

        if (!student) {
            content.innerHTML = '<div class="text-center text-gray-400 py-4">Student not found.</div>';
            return;
        }

        // Get parent info if available
        let parentName = 'N/A';
        let parentPhone = 'N/A';
        let parentAddress = 'N/A';
        
        if (student.parent_id) {
            const { data: parent } = await supabase
                .from('parents')
                .select('full_name, contact_number, address')
                .eq('id', student.parent_id)
                .single();
            if (parent) {
                parentName = parent.full_name || 'N/A';
                parentPhone = parent.contact_number || 'N/A';
                parentAddress = parent.address || 'N/A';
            }
        }

        // Picture or initials
        const photoHtml = student.profile_photo_url 
            ? `<img src="${student.profile_photo_url}" alt="Photo" class="w-20 h-20 rounded-full object-cover">`
            : `<div class="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-black text-2xl">${getInitials(student.full_name)}</div>`;

        // Address: prefer parent address, fall back to student address
        const displayAddress = parentAddress !== 'N/A' ? parentAddress : (student.address || 'N/A');
        
        // Phone: prefer student phone, fall back to parent phone
        const displayPhone = student.phone || parentPhone;

        content.innerHTML = `
            <div class="flex flex-col items-center mb-4">
                ${photoHtml}
                <h4 class="font-bold text-gray-800 text-lg mt-2">${escapeHtml(student.full_name)}</h4>
                <p class="text-sm text-gray-500 font-medium">${student.student_id_text || 'N/A'}</p>
            </div>
            <div class="space-y-3">
                <div class="flex justify-between border-b border-gray-100 py-2">
                    <span class="text-gray-500 text-sm">LRN</span>
                    <span class="text-gray-800 text-sm font-medium">${student.lrn || 'N/A'}</span>
                </div>
                <div class="flex justify-between border-b border-gray-100 py-2">
                    <span class="text-gray-500 text-sm">Phone</span>
                    <span class="text-gray-800 text-sm font-medium">${displayPhone}</span>
                </div>
                <div class="flex justify-between border-b border-gray-100 py-2">
                    <span class="text-gray-500 text-sm">Address</span>
                    <span class="text-gray-800 text-sm font-medium text-right max-w-[180px]">${displayAddress}</span>
                </div>
                <div class="flex justify-between border-b border-gray-100 py-2">
                    <span class="text-gray-500 text-sm">Parent Name</span>
                    <span class="text-gray-800 text-sm font-medium">${parentName}</span>
                </div>
            </div>
        `;
    } catch (err) {
        console.error('Error loading student info:', err);
        content.innerHTML = '<div class="text-center text-gray-400 py-4">Error loading data.</div>';
    }
}

async function loadStudentPerformanceChart(startDate, endDate) {
    if (!studentIdsInHomeroom.length) return;
    
    try {
        const { data: students, error: studentsErr } = await supabase
            .from('students')
            .select('id, full_name')
            .in('id', studentIdsInHomeroom)
            .order('full_name');

        if (studentsErr) {
            console.error('Error loading students:', studentsErr);
            throw studentsErr;
        }

        const { data: logs, error: logsErr } = await supabase
            .from('attendance_logs')
            .select('student_id, log_date, status, morning_absent, afternoon_absent')
            .in('student_id', studentIdsInHomeroom)
            .gte('log_date', startDate)
            .lte('log_date', endDate);

        if (logsErr) {
            console.error('Error loading logs:', logsErr);
            throw logsErr;
        }

        const { data: excuses, error: excusesErr } = await supabase
            .from('excuse_letters')
            .select('student_id, date_absent')
            .eq('status', 'Approved')
            .in('student_id', studentIdsInHomeroom)
            .gte('date_absent', startDate)
            .lte('date_absent', endDate);

        if (excusesErr) {
            console.error('Error loading excuses:', excusesErr);
            throw excusesErr;
        }

        const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);

        const stats = {};
        students.forEach(s => stats[s.id] = { name: s.full_name, present: 0, total: 0 });

        (logs || []).forEach(log => {
            if (!stats[log.student_id]) return;
            const s = stats[log.student_id];
            const status = log.status || '';
            
            const morningAbsent = log.morning_absent || false;
            const afternoonAbsent = log.afternoon_absent || false;
            const isFullDayAbsent = morningAbsent && afternoonAbsent;
            const isHalfDay = morningAbsent !== afternoonAbsent && !isFullDayAbsent;
            const isExcused = excusedSet.has(`${log.student_id}-${log.log_date}`);
            
            if (isExcused || isHalfDay) {
                s.present += 0.5;
            } else if (isFullDayAbsent || status === 'Absent') {
                // Absent - no present increment
            } else if (status === 'Late' || status === 'Present' || status === 'On Time' || status === 'Excused') {
                s.present++;
            } else if (status === '') {
                // No status but has record - assume present
                s.present++;
            } else {
                // Any other status - treat as present
                s.present++;
            }
            
            s.total++;
        });

        const data = Object.values(stats).map(s => ({
            name: s.name.split(' ')[0],
            rate: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0
        })).sort((a, b) => b.rate - a.rate);

        renderStudentPerformanceChart(data);
    } catch (err) {
        console.error('Error loading student performance chart:', err);
    }
}

function renderStudentPerformanceChart(data) {
    const canvas = document.getElementById('studentPerformanceChart');
    if (!canvas) return;
    if (studentChart) studentChart.destroy();
    
    const ctx = canvas.getContext('2d');
    studentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.name),
            datasets: [{
                label: 'Attendance Rate (%)',
                data: data.map(d => d.rate),
                backgroundColor: data.map(r => r.rate >= 90 ? '#22c55e' : r.rate >= 75 ? '#eab308' : '#ef4444'),
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                x: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } },
                y: { ticks: { font: { size: 11 } } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

async function loadCommonReasons(startDate, endDate) {
    if (!studentIdsInHomeroom.length) return;
    try {
        const reasons = {};
        
        const { data: excuses, error: excuseErr } = await supabase
            .from('excuse_letters')
            .select('reason')
            .in('student_id', studentIdsInHomeroom)
            .gte('date_absent', startDate)
            .lte('date_absent', endDate);
        
        if (excuseErr) {
            console.error('Error loading excuses:', excuseErr);
        } else {
            excuses?.forEach(e => {
                const r = e.reason || 'Other';
                reasons[r] = (reasons[r] || 0) + 1;
            });
        }

        const { data: clinic, error: clinicErr } = await supabase
            .from('clinic_visits')
            .select('reason')
            .in('student_id', studentIdsInHomeroom)
            .gte('time_in', `${startDate}T00:00:00`)
            .lte('time_in', `${endDate}T23:59:59`);

        if (clinicErr) {
            console.error('Error loading clinic:', clinicErr);
        } else {
            clinic?.forEach(v => {
                const r = v.reason || 'Clinic Visit';
                reasons[r] = (reasons[r] || 0) + 1;
            });
        }

        const sorted = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 8);
        renderCommonReasonsChart({ labels: sorted.map(s => s[0]), data: sorted.map(s => s[1]) });
    } catch (err) {
        console.error('Error loading common reasons:', err);
    }
}

function renderCommonReasonsChart(data) {
    const canvas = document.getElementById('barChart');
    if (!canvas) return;
    if (barChart) barChart.destroy();
    
    const ctx = canvas.getContext('2d');
    barChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels || [],
            datasets: [{ label: 'Incidents', data: data.data || [], backgroundColor: '#3b82f6', borderRadius: 6 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function exportHomeroomAttendanceCSV() {
    const tbody = document.getElementById('homeroomAttendanceTableBody');
    if (!tbody) return;
    
    let csv = 'Student Name,Present,Late,Absent,Excused,Half Day,Attendance %\n';
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length > 1) {
            csv += Array.from(cells).map(c => c.textContent.trim()).join(',') + '\n';
        }
    });

    const link = document.createElement('a');
    link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    link.download = `Homeroom_Attendance_${dateStart}_${dateEnd}.csv`;
    link.click();
}

function exportStudentAttendanceCSV() {
    const tbody = document.getElementById('studentAttendanceTableBody');
    if (!tbody) return;
    
    let csv = 'Date,Status,Morning,Afternoon,Excuse\n';
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length > 1) {
            csv += Array.from(cells).map(c => c.textContent.trim().replace(/,/g, '')).join(',') + '\n';
        }
    });

    const link = document.createElement('a');
    link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    const studentName = currentSelectedStudentName || 'Student';
    link.download = `${studentName}_Attendance_${dateStart}_${dateEnd}.csv`;
    link.click();
}

function showErrorMessage(msg) {
    console.error(msg);
    if (typeof showToast === 'function') showToast(msg, 'error');
    else alert(msg);
}

function getInitials(fullName) {
    if (!fullName) return '?';
    const parts = fullName.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length-1].charAt(0)).toUpperCase();
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

async function loadCriticalAbsences(startDate, endDate) {
    const container = document.getElementById('critical-absences-list');
    if (!container) return;
    if (!studentIdsInHomeroom.length) {
        container.innerHTML = '<p class="text-center text-gray-400 py-4 italic">No students in homeroom.</p>';
        return;
    }

    try {
        console.log('[CriticalAbsences] Loading for date range:', startDate, 'to', endDate);
        
        // Fetch ALL attendance logs with full field selection
        const { data: logs } = await supabase
            .from('attendance_logs')
            .select('student_id, log_date, status, morning_absent, afternoon_absent')
            .in('student_id', studentIdsInHomeroom)
            .gte('log_date', startDate)
            .lte('log_date', endDate);

        console.log('[CriticalAbsences] Found logs:', logs?.length || 0);

        if (!logs || logs.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-400 py-4 italic">No attendance records found for this period.</p>';
            return;
        }

        // Count absences per student - INCLUDE ALL ABSENCES (Absent, Excused, Half-day)
        const absenceData = {};
        studentIdsInHomeroom.forEach(id => {
            absenceData[id] = { absent: 0, halfday: 0, totalRecords: 0 };
        });

        for (const log of logs) {
            const s = absenceData[log.student_id];
            if (!s) continue;
            
            s.totalRecords++;
            
            const morningAbsent = !!log.morning_absent;
            const afternoonAbsent = !!log.afternoon_absent;
            const statusAbsent = log.status === 'Absent' || log.status === 'Excused';
            
            // Count full-day absences (status = Absent OR both half-days = true)
            if (statusAbsent || (morningAbsent && afternoonAbsent)) {
                s.absent++;
            }
            // Count half-day absences (one half = true, but not both)
            else if (morningAbsent || afternoonAbsent) {
                s.halfday++;
            }
        }

        // Calculate adjusted absences and find critical students
        const criticalStudents = [];
        for (const [studentId, data] of Object.entries(absenceData)) {
            const adjustedAbsence = data.absent + (data.halfday * 0.5);
            
            console.log('[CriticalAbsences] Student', studentId, '- Full:', data.absent, 'Half:', data.halfday, 'Total:', adjustedAbsence.toFixed(1));
            
            // Threshold: 10+ absences OR 20%+ absence rate
            if (adjustedAbsence >= 10 || (data.totalRecords > 0 && (adjustedAbsence / data.totalRecords) > 0.2)) {
                criticalStudents.push({
                    studentId: studentId,
                    absent: data.absent,
                    halfday: data.halfday,
                    adjustedAbsence: adjustedAbsence,
                    totalRecords: data.totalRecords
                });
            }
        }

        console.log('[CriticalAbsences] Critical students found:', criticalStudents.length);

        // Fetch student details for display
        const studentMap = {};
        const { data: students } = await supabase
            .from('students')
            .select('id, full_name, student_id_text, parent_id')
            .in('id', studentIdsInHomeroom);
        
        students?.forEach(s => { studentMap[s.id] = s; });
        
        // Sort by absence count and map to display format
        criticalStudents.sort((a, b) => b.adjustedAbsence - a.adjustedAbsence);
        
        if (criticalStudents.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-400 py-4 italic">No students with critical absences (10+ absences or 20%+ absence rate).</p>';
            return;
        }

        let html = '';
        for (const student of criticalStudents.slice(0, 10)) {
            const s = studentMap[student.studentId];
            if (!s) continue;
            
            const initials = getInitials(s.full_name);
            const absenceRate = student.totalRecords > 0 ? Math.round((student.adjustedAbsence / student.totalRecords) * 100) : 0;
            
            html += `
                <div class="flex items-center gap-3 p-3 bg-red-50 rounded-xl">
                    <div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-bold">${initials}</div>
                    <div class="flex-1">
                        <p class="font-medium text-gray-800">${escapeHtml(s.full_name)}</p>
                        <p class="text-xs text-gray-500">${s.student_id_text || 'N/A'} • ${absenceRate}% absence rate</p>
                    </div>
                    <div class="text-right mr-2">
                        <p class="text-lg font-bold text-red-600">${student.adjustedAbsence.toFixed(1)}</p>
                        <p class="text-xs text-gray-500">absences</p>
                    </div>
                    ${s.parent_id ? 
                        `<button onclick="alertParent(${s.parent_id}, '${escapeHtml(s.full_name)}', ${student.adjustedAbsence})" 
                            class="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-bold hover:bg-orange-600 flex items-center gap-1">
                            <i data-lucide="bell" class="w-3 h-3"></i> Alert Parent
                        </button>` : 
                        `<span class="text-xs text-gray-400 italic">No parent</span>`
                    }
                </div>`;
        }
        
        container.innerHTML = html;
        lucide.createIcons();
    } catch (err) {
        console.error('Error loading critical absences:', err);
        container.innerHTML = '<p class="text-center text-gray-400 py-4 italic">Error loading data: ' + err.message + '</p>';
    }
}

// Global variables for alert parent modal
let alertParentId = null;
let alertStudentName = null;
let alertAbsenceCount = 0;

async function alertParent(parentId, studentName, absenceCount) {
    if (!parentId) {
        showErrorMessage('No parent linked to this student.');
        return;
    }

    // Store for confirmSendAlert
    alertParentId = parentId;
    alertStudentName = studentName;
    alertAbsenceCount = absenceCount;
    
    // Populate modal
    document.getElementById('alert-student-initials').textContent = getInitials(studentName);
    document.getElementById('alert-student-name').textContent = studentName;
    document.getElementById('alert-absence-count').textContent = absenceCount.toFixed(1);
    document.getElementById('alert-message-preview').textContent = `Your child ${studentName} has ${absenceCount.toFixed(1)} absences in the current period. Please contact the school immediately.`;
    document.getElementById('alert-urgent').checked = true;
    
    // Show modal
    document.getElementById('alert-parent-modal').classList.remove('hidden');
    lucide.createIcons();
}

function closeAlertParentModal() {
    document.getElementById('alert-parent-modal').classList.add('hidden');
    alertParentId = null;
    alertStudentName = null;
    alertAbsenceCount = 0;
}

async function confirmSendAlert() {
    if (!alertParentId) return;
    
    const isUrgent = document.getElementById('alert-urgent').checked;
    
    try {
        const { error: notifyError } = await supabase
            .from('notifications')
            .insert({
                recipient_id: alertParentId,
                recipient_role: 'parent',
                title: 'Critical Absence Alert',
                message: `Your child ${alertStudentName} has ${alertAbsenceCount.toFixed(1)} absences in the current period. Please contact the school immediately.`,
                type: isUrgent ? 'urgent' : 'attendance_alert',
                is_urgent: isUrgent,
                sender_id: currentUser?.id
            });

        if (notifyError) throw notifyError;

        showErrorMessage('Alert sent to parent successfully!');
        closeAlertParentModal();
    } catch (err) {
        console.error('Error sending alert:', err);
        showErrorMessage('Failed to send alert. Please try again.');
    }
}

window.loadAnalyticsData = loadAnalyticsData;
window.switchTrendGrouping = switchTrendGrouping;
window.handleWeekMonthChange = handleWeekMonthChange;
window.openStudentAttendanceModal = openStudentAttendanceModal;
window.closeStudentAttendanceModal = closeStudentAttendanceModal;
window.refreshStudentAttendance = refreshStudentAttendance;
window.showStudentInfoModal = showStudentInfoModal;
window.closeStudentInfoModal = closeStudentInfoModal;
window.exportHomeroomAttendanceCSV = exportHomeroomAttendanceCSV;
window.exportStudentAttendanceCSV = exportStudentAttendanceCSV;
window.alertParent = alertParent;
window.closeAlertParentModal = closeAlertParentModal;
window.confirmSendAlert = confirmSendAlert;

console.log('[TeacherAnalytics] Teacher data analytics loaded (FULL)');