// teacher/teacher-data-analytics.js - Teacher Data Analytics
// UPDATED: Uses school-year-core.js for dynamic dates

const USE_SUMMARY_ANALYTICS = true; // Feature flag for gradual rollout - now using attendance_daily_summary as source of truth

let trendChart, pieChart, barChart, studentChart;
let currentHomeroomClass = null;
let studentIdsInHomeroom = [];
let dateStart = null;
let dateEnd = null;
let currentSelectedStudentId = null;
let currentWeekMonth = '';
let currentSelectedStudentName = null;
let currentTrendGrouping = 'month';
let currentWeekMonth = '';
let dynamicSchoolYearStart = null;
let dynamicSchoolYearEnd = null;
let dynamicQuarters = null;
let isLoadingAnalytics = false;

// Helper functions for loading modal
function showLoadingModal() {
    const modal = document.getElementById('loadingModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function hideLoadingModal() {
    const modal = document.getElementById('loadingModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Main entry point - loads all analytics data
async function loadAnalyticsData(event) {
    // Prevent concurrent loads
    if (isLoadingAnalytics) return;
    isLoadingAnalytics = true;

    // STEP 1: Show modal FIRST, before any async operations
    showLoadingModal();
    
    // STEP 2: Force browser to paint the modal
    // Use setTimeout to push to next tick, then requestAnimationFrame
    await new Promise(resolve => {
        setTimeout(() => {
            requestAnimationFrame(resolve);
        }, 100);
    });

    try {
        // Initialize settings if not already done
        if (!dynamicQuarters) {
            dynamicSchoolYearStart = await getSchoolYearStart();
            dynamicSchoolYearEnd = await getSchoolYearEnd();
            dynamicQuarters = await getQuarters();
        }
        
        // Set up date filters
        const startInput = document.getElementById('dateStart');
        const endInput = document.getElementById('dateEnd');
        
        if (!dateStart || !dateEnd) {
            const today = new Date();
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(today.getDate() - 30);
            dateStart = thirtyDaysAgo.toISOString().split('T')[0];
            dateEnd = today.toISOString().split('T')[0];
        }
        
        if (startInput) dateStart = startInput.value || dateStart;
        if (endInput) dateEnd = endInput.value || dateEnd;

        // Get homeroom class
        const { data: homeroom, error: homeroomError } = await supabase
            .from('classes')
            .select('id, grade_level, department')
            .eq('adviser_id', currentUser.id)
            .single();

        if (homeroomError || !homeroom) {
            showNoHomeroomMessage();
            hideLoadingModal();
            isLoadingAnalytics = false;
            return;
        }
        currentHomeroomClass = homeroom;

        // Get students
        const { data: students, error: studentsError } = await supabase
            .from('students')
            .select('id')
            .eq('class_id', homeroom.id)
            .eq('status', 'Enrolled');

        if (studentsError || !students || students.length === 0) {
            showNoStudentsMessage();
            hideLoadingModal();
            isLoadingAnalytics = false;
            return;
        }
        studentIdsInHomeroom = students.map(s => Number(s.id));

        // Load all data in parallel
        await Promise.all([
            loadPeriodStats(dateStart, dateEnd),
            loadTrendData(dateStart, dateEnd),
            loadStudentPerformanceChart(dateStart, dateEnd),
            loadHomeroomClassAttendanceTable(dateStart, dateEnd),
            loadCommonReasons(dateStart, dateEnd),
            loadCriticalAbsences(dateStart, dateEnd)
        ]);
        
    } catch (err) {
        console.error('Error in loadAnalyticsData:', err);
        showErrorMessage('Failed to load analytics data.');
    } finally {
        hideLoadingModal();
        isLoadingAnalytics = false;
    }
}

async function switchTrendGrouping(mode) {
    currentTrendGrouping = mode;
    
    // Update button styles
    const btnMonth = document.getElementById('btnMonth');
    const btnWeek = document.getElementById('btnWeek');
    
    if (btnMonth) btnMonth.className = mode === 'month' 
        ? 'px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold' 
        : 'px-3 py-1.5 bg-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-300';
    if (btnWeek) btnWeek.className = mode === 'week' 
        ? 'px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold' 
        : 'px-3 py-1.5 bg-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-300';
    
    const weekFilter = document.getElementById('weekMonthFilter');
    if (weekFilter) {
        weekFilter.classList.toggle('hidden', mode !== 'week');
        if (mode === 'week' && !currentWeekMonth) {
            const now = new Date();
            currentWeekMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            weekFilter.value = currentWeekMonth;
        }
    }
    
    // Reload trend data
    await loadTrendData(dateStart, dateEnd);
}

function handleWeekMonthChange() {
    const filter = document.getElementById('weekMonthFilter');
    if (!filter) return;
    currentWeekMonth = filter.value;
    if (currentWeekMonth && currentTrendGrouping === 'week') {
        loadTrendData(dateStart, dateEnd);
    }
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
        // NEW: Use attendance_daily_summary as source of truth (same as admin)
        const { data: summaries, error } = await supabase
            .from('attendance_daily_summary')
            .select('student_id, date, morning_status, afternoon_status')
            .in('student_id', studentIdsInHomeroom)
            .gte('date', startDate)
            .lte('date', endDate);

        if (error) throw error;
        
        // Fetch holidays for the period
        const { data: holidays } = await supabase
            .from('holidays')
            .select('holiday_date')
            .gte('holiday_date', startDate)
            .lte('holiday_date', endDate);
        
        const holidaySet = new Set(holidays?.map(h => h.holiday_date) || []);
        
        if (!summaries?.length) {
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

        // Get student grade mapping to handle Kinder (no afternoon count)
        const { data: students } = await supabase
            .from('students')
            .select('id, class_id')
            .in('id', studentIdsInHomeroom);
        const { data: classes } = await supabase
            .from('classes')
            .select('id, grade_level');
        const gradeMap = Object.fromEntries(classes?.map(c => [c.id, c.grade_level]) || []);
        const studentGrade = Object.fromEntries(students?.map(s => [s.id, gradeMap[s.class_id]]) || []);

        // Count stats - same logic as admin fetchStatusDistribution
        const counts = { Present: 0, Late: 0, Absent: 0, Excused: 0, HalfDay: 0 };
        
        function addStatus(c, status) {
            if (status === 'Present') c.Present++;
            else if (status === 'Late') { c.Late++; c.Present++; }
            else if (status === 'Excused') { c.Excused++; c.Present++; }
            else if (status === 'Absent') c.Absent++;
        }

        for (const row of summaries) {
            const isExcused = excusedSet.has(`${row.student_id}-${row.date}`);
            const isKinder = studentGrade[row.student_id] === 'Kinder';
            
            // Morning session
            if (isExcused) {
                counts.Excused++;
                counts.Present++;
            } else {
                addStatus(counts, row.morning_status);
            }
            
            // Afternoon session (skip Kinder, skip if null)
            if (!isKinder && row.afternoon_status) {
                if (isExcused) {
                    counts.Excused++;
                    counts.Present++;
                } else {
                    addStatus(counts, row.afternoon_status);
                }
            }
        }

        // Calculate average attendance rate (same method as admin fetchAverageAttendanceRate)
        let presentCount = 0;
        let totalCount = 0;
        for (const row of summaries) {
            const isKinder = studentGrade[row.student_id] === 'Kinder';
            const isExcused = excusedSet.has(`${row.student_id}-${row.date}`);
            
            // Morning
            totalCount++;
            if (isExcused || ['Present','Late','Excused'].includes(row.morning_status)) presentCount++;
            
            // Afternoon (skip Kinder)
            if (!isKinder && row.afternoon_status) {
                totalCount++;
                if (isExcused || ['Present','Late','Excused'].includes(row.afternoon_status)) presentCount++;
            }
        }
        const presentPercent = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;
        
        const avgEl = document.getElementById('avgAttendanceRate');
        if (avgEl) avgEl.innerText = presentPercent + '%';
        
        // Render status distribution pie chart
        renderPieChart({
            Present: counts.Present,
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
    if (!studentIdsInHomeroom.length) {
        renderEmptyTrendChart();
        return;
    }

    try {
        if (USE_SUMMARY_ANALYTICS) {
            // NEW: Use attendance_daily_summary as source of truth
            const { data: summaries } = await supabase
                .from('attendance_daily_summary')
                .select('student_id, date, morning_status, afternoon_status')
                .in('student_id', studentIdsInHomeroom)
                .gte('date', startDate)
                .lte('date', endDate);

            if (!summaries?.length) {
                renderEmptyTrendChart();
                return;
            }

            const schoolYearMonthMap = { '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec', '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr' };
            let result;

            if (currentTrendGrouping === 'month') {
                const monthGroups = {};
                summaries.forEach(summary => {
                    const logDate = new Date(summary.date);
                    const monthKey = \-\;
                    if (!monthGroups[monthKey]) {
                        monthGroups[monthKey] = { Present: 0, Late: 0, Absent: 0, Excused: 0, HalfDay: 0 };
                    }
                    if (summary.morning_status === 'Present') monthGroups[monthKey].Present++;
                    else if (summary.morning_status === 'Late') { monthGroups[monthKey].Late++; monthGroups[monthKey].Present++; }
                    else if (summary.morning_status === 'Excused') { monthGroups[monthKey].Excused++; monthGroups[monthKey].Present++; }
                    else if (summary.morning_status === 'Absent') monthGroups[monthKey].Absent++;
                    if (summary.afternoon_status) {
                        if (summary.afternoon_status === 'Present') monthGroups[monthKey].Present++;
                        else if (summary.afternoon_status === 'Late') { monthGroups[monthKey].Late++; monthGroups[monthKey].Present++; }
                        else if (summary.afternoon_status === 'Excused') { monthGroups[monthKey].Excused++; monthGroups[monthKey].Present++; }
                        else if (summary.afternoon_status === 'Absent') monthGroups[monthKey].Absent++;
                    }
                });
                const sortedMonths = Object.keys(monthGroups).sort((a, b) => {
                    const [yA, mA] = a.split('-').map(Number);
                    const [yB, mB] = b.split('-').map(Number);
                    return (yA === 2026 ? 100 : 0) + mA - ((yB === 2026 ? 100 : 0) + mB);
                });
                result = {
                    labels: sortedMonths.map(m => schoolYearMonthMap[m.split('-')[1]] || m.split('-')[1]),
                    present: sortedMonths.map(m => monthGroups[m].Present),
                    late: sortedMonths.map(m => monthGroups[m].Late),
                    absent: sortedMonths.map(m => monthGroups[m].Absent),
                    excused: sortedMonths.map(m => monthGroups[m].Excused),
                    halfday: sortedMonths.map(m => monthGroups[m].HalfDay)
                };
            } else if (currentTrendGrouping === 'week') {
                const weekGroups = {};
                const weekLabelsMap = {};
                const selMonth = currentWeekMonth || '';
                const [selYear, selMonthNum] = selMonth.split('-');
                summaries.forEach(summary => {
                    const logDate = new Date(summary.date);
                    const logMonth = String(logDate.getMonth() + 1).padStart(2, '0');
                    const logYear = String(logDate.getFullYear());
                    if (logMonth !== selMonthNum || logYear !== selYear) return;
                    const day = logDate.getDate();
                    const weekNum = Math.ceil(day / 7);
                    const weekKey = \Week \;
                    if (!weekGroups[weekKey]) {
                        weekGroups[weekKey] = { Present: 0, Late: 0, Absent: 0, Excused: 0, HalfDay: 0 };
                        const startDay = (weekNum - 1) * 7 + 1;
                        const endDay = Math.min(weekNum * 7, new Date(parseInt(selYear), parseInt(selMonthNum), 0).getDate());
                        weekLabelsMap[weekKey] = \-\;
                    }
                    if (summary.morning_status === 'Present') weekGroups[weekKey].Present++;
                    else if (summary.morning_status === 'Late') { weekGroups[weekKey].Late++; weekGroups[weekKey].Present++; }
                    else if (summary.morning_status === 'Excused') { weekGroups[weekKey].Excused++; weekGroups[weekKey].Present++; }
                    else if (summary.morning_status === 'Absent') weekGroups[weekKey].Absent++;
                    if (summary.afternoon_status) {
                        if (summary.afternoon_status === 'Present') weekGroups[weekKey].Present++;
                        else if (summary.afternoon_status === 'Late') { weekGroups[weekKey].Late++; weekGroups[weekKey].Present++; }
                        else if (summary.afternoon_status === 'Excused') { weekGroups[weekKey].Excused++; weekGroups[weekKey].Present++; }
                        else if (summary.afternoon_status === 'Absent') weekGroups[weekKey].Absent++;
                    }
                });
                const sortedWeeks = Object.keys(weekGroups).sort((a, b) => {
                    const numA = parseInt(a.replace('Week ', ''));
                    const numB = parseInt(b.replace('Week ', ''));
                    return numA - numB;
                });
                result = {
                    labels: sortedWeeks.map(w => \ (\)\),
                    present: sortedWeeks.map(w => weekGroups[w].Present),
                    late: sortedWeeks.map(w => weekGroups[w].Late),
                    absent: sortedWeeks.map(w => weekGroups[w].Absent),
                    excused: sortedWeeks.map(w => weekGroups[w].Excused),
                    halfday: sortedWeeks.map(w => weekGroups[w].HalfDay)
                };
            } else {
                renderEmptyTrendChart();
                return;
            }
            renderTrendChart(result.labels, result);
        } else {
            // LEGACY: Use attendance_logs (existing implementation)
            let allLogs = [];
            let from = 0;
            const pageSize = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data: logs, error } = await supabase
                    .from('attendance_logs')
                    .select('student_id, log_date, status, morning_absent, afternoon_absent')
                    .in('student_id', studentIdsInHomeroom)
                    .gte('log_date', startDate)
                    .lte('log_date', endDate)
                    .range(from, from + pageSize - 1);

                if (error) throw error;
                if (!logs || logs.length === 0) break;
                allLogs = allLogs.concat(logs);
                from += pageSize;
                hasMore = logs.length === pageSize;
            }

            if (allLogs.length === 0) {
                renderEmptyTrendChart();
                return;
            }

            let effectiveDateStart = startDate;
            let effectiveDateEnd = endDate;
            if (currentTrendGrouping === 'week' && currentWeekMonth) {
                effectiveDateStart = \-01\;
                const [year, month] = currentWeekMonth.split('-');
                const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                effectiveDateEnd = \-\;
            }

            const { data: excuses } = await supabase
                .from('excuse_letters')
                .select('student_id, date_absent')
                .eq('status', 'Approved')
                .in('student_id', studentIdsInHomeroom)
                .gte('date_absent', effectiveDateStart)
                .lte('date_absent', effectiveDateEnd);
            
            const excusedSet = new Set(excuses?.map(e => \-\) || []);

            const schoolYearMonthMap = { '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec', '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr' };

            let result = { labels: [], present: [], late: [], absent: [], excused: [], halfday: [] };

            if (currentTrendGrouping === 'month') {
                const monthGroups = {};
                
                allLogs.forEach(log => {
                    const logDate = new Date(log.log_date);
                    const monthKey = \-\;
                    if (!monthGroups[monthKey]) {
                        monthGroups[monthKey] = { Present: 0, Late: 0, Absent: 0, Excused: 0, HalfDay: 0 };
                    }
                    
                    const morningAbsent = log.morning_absent || false;
                    const afternoonAbsent = log.afternoon_absent || false;
                    const isFullDayAbsent = morningAbsent && afternoonAbsent;
                    const isHalfDay = (morningAbsent !== afternoonAbsent && !isFullDayAbsent) || log.status === 'Half Day';
                    
                    const isExcused = excusedSet.has(\-\);
                    if (isExcused) {
                        monthGroups[monthKey].Excused++;
                    } else if (isHalfDay) {
                        monthGroups[monthKey].HalfDay++;
                        monthGroups[monthKey].Present += 0.5;
                    } else if (isFullDayAbsent) {
                        monthGroups[monthKey].Absent++;
                    } else if (log.status === 'Present' || log.status === 'On Time') {
                        monthGroups[monthKey].Present++;
                    } else if (log.status === 'Late') {
                        monthGroups[monthKey].Late++;
                    } else if (log.status === 'Absent') {
                        monthGroups[monthKey].Absent++;
                    }
                });

                const sortedMonths = Object.keys(monthGroups).sort((a, b) => {
                    const [yearA, monthA] = a.split('-');
                    const [yearB, monthB] = b.split('-');
                    const orderA = (yearA === '2026' ? 100 : 0) + parseInt(monthA);
                    const orderB = (yearB === '2026' ? 100 : 0) + parseInt(monthB);
                    return orderA - orderB;
                });
                
                const monthLabels = sortedMonths.map(m => {
                    const [, month] = m.split('-');
                    return schoolYearMonthMap[month] || month;
                });

                result = {
                    labels: monthLabels,
                    present: sortedMonths.map(m => monthGroups[m].Present),
                    late: sortedMonths.map(m => monthGroups[m].Late),
                    absent: sortedMonths.map(m => monthGroups[m].Absent),
                    excused: sortedMonths.map(m => monthGroups[m].Excused),
                    halfday: sortedMonths.map(m => monthGroups[m].HalfDay)
                };
            }
            else if (currentTrendGrouping === 'week') {
                const weekGroups = {};
                const weekLabelsMap = {};
                
                const selectedMonth = currentWeekMonth || '';
                const [selectedYear, selectedMonthNum] = selectedMonth.split('-');
                
                allLogs.forEach(log => {
                    const logDate = new Date(log.log_date);
                    const logMonth = String(logDate.getMonth() + 1).padStart(2, '0');
                    const logYear = String(logDate.getFullYear());
                    
                    if (logMonth !== selectedMonthNum || logYear !== selectedYear) return;
                    
                    const day = logDate.getDate();
                    const weekNum = Math.ceil(day / 7);
                    const weekKey = \Week \;
                    
                    if (!weekGroups[weekKey]) {
                        weekGroups[weekKey] = { Present: 0, Late: 0, Absent: 0, Excused: 0, HalfDay: 0 };
                        const startDay = (weekNum - 1) * 7 + 1;
                        const endDay = Math.min(weekNum * 7, new Date(parseInt(selectedYear), parseInt(selectedMonthNum), 0).getDate());
                        weekLabelsMap[weekKey] = \-\;
                    }
                    
                    const morningAbsent = log.morning_absent || false;
                    const afternoonAbsent = log.afternoon_absent || false;
                    const isFullDayAbsent = morningAbsent && afternoonAbsent;
                    const isHalfDay = (morningAbsent !== afternoonAbsent && !isFullDayAbsent) || log.status === 'Half Day';
                    
                    const isExcused = excusedSet.has(\-\);
                    if (isExcused) {
                        weekGroups[weekKey].Excused++;
                    } else if (isHalfDay) {
                        weekGroups[weekKey].HalfDay++;
                        weekGroups[weekKey].Present += 0.5;
                    } else if (isFullDayAbsent) {
                        weekGroups[weekKey].Absent++;
                    } else if (log.status === 'Present' || log.status === 'On Time') {
                        weekGroups[weekKey].Present++;
                    } else if (log.status === 'Late') {
                        weekGroups[weekKey].Late++;
                    } else if (log.status === 'Absent') {
                        weekGroups[weekKey].Absent++;
                    }
                });
                
                const sortedWeeks = Object.keys(weekGroups).sort((a, b) => {
                    const numA = parseInt(a.replace('Week ', ''));
                    const numB = parseInt(b.replace('Week ', ''));
                    return numA - numB;
                });
                
                const weekLabels = sortedWeeks.map(w => \ (\)\);
                
                result = {
                    labels: weekLabels,
                    present: sortedWeeks.map(w => weekGroups[w].Present),
                    late: sortedWeeks.map(w => weekGroups[w].Late),
                    absent: sortedWeeks.map(w => weekGroups[w].Absent),
                    excused: sortedWeeks.map(w => weekGroups[w].Excused),
                    halfday: sortedWeeks.map(w => weekGroups[w].HalfDay)
                };
            }
            else {
                renderEmptyTrendChart();
                return;
            }

            renderTrendChart(result.labels, result);
        }
    } catch (err) {
        console.error('Error in loadTrendData:', err);
        renderEmptyTrendChart();
    }
}

function renderEmptyTrendChart() {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    if (trendChart) trendChart.destroy();
    const ctx = canvas.getContext('2d');
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['No Data'],
            datasets: [{ label: 'No attendance records', data: [0], borderColor: '#cbd5e1', borderDash: [5, 5] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function renderTrendChart(labels, data) {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    if (trendChart) trendChart.destroy();

    if (!labels || labels.length === 0) {
        renderEmptyTrendChart();
        return;
    }

    // Match admin's exact format: raw counts (not percentages)
    const datasets = [];
    datasets.push({ 
        label: 'Present', 
        data: data.present || [], 
        borderColor: '#22c55e', 
        backgroundColor: 'rgba(34,197,94,0.15)', 
        fill: true, 
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2
    });
    datasets.push({ 
        label: 'Late', 
        data: data.late || [], 
        borderColor: '#eab308', 
        backgroundColor: 'rgba(234,179,8,0.15)', 
        fill: true, 
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2
    });
    datasets.push({ 
        label: 'Absent', 
        data: data.absent || [], 
        borderColor: '#ef4444', 
        backgroundColor: 'rgba(239,68,68,0.15)', 
        fill: true, 
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2
    });
    datasets.push({ 
        label: 'Excused', 
        data: data.excused || [], 
        borderColor: '#3b82f6', 
        backgroundColor: 'rgba(59,130,246,0.15)', 
        fill: true, 
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2
    });
    datasets.push({ 
        label: 'Half Day', 
        data: data.halfday || [], 
        borderColor: '#f59e0b', 
        backgroundColor: 'rgba(245,158,11,0.15)', 
        fill: true, 
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2
    });

    const ctx = canvas.getContext('2d');
    trendChart = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } },
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
            labels: ['PR (Present)', 'ABS (Absent)', 'LTE (Late)', 'EXC (Excused)', 'Half Day'],
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
            const status = isExcused ? 'Excused' : ((log.status === 'Present' || log.status === 'On Time') ? 'PR' : (log.status || 'Unknown'));
            return `
                <tr class="border-b border-gray-50">
                    <td class="py-3 px-4 text-gray-800">${new Date(log.log_date).toLocaleDateString()}</td>
                    <td class="text-center py-3 px-4">
                        <span class="px-2 py-1 rounded-full text-xs font-bold ${status === 'PR' ? 'bg-green-100 text-green-700' : status === 'Late' ? 'bg-yellow-100 text-yellow-700' : status === 'Excused' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}">${status}</span>
                    </td>
                    <td class="text-center py-3 px-4 ${log.morning_absent ? 'text-red-600 font-bold' : 'text-green-600'}">${log.morning_absent ? 'ABS' : 'PR'}</td>
                    <td class="text-center py-3 px-4 ${log.afternoon_absent ? 'text-red-600 font-bold' : 'text-green-600'}">${log.afternoon_absent ? 'ABS' : 'PR'}</td>
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
        // Get students with class_id for Kinder check
        const { data: students, error: studentsErr } = await supabase
            .from('students')
            .select('id, full_name, class_id')
            .in('id', studentIdsInHomeroom)
            .order('full_name');
        if (studentsErr) throw studentsErr;

        // NEW: Use attendance_daily_summary as source of truth
        const { data: summaries, error: summariesErr } = await supabase
            .from('attendance_daily_summary')
            .select('student_id, date, morning_status, afternoon_status')
            .in('student_id', studentIdsInHomeroom)
            .gte('date', startDate)
            .lte('date', endDate);
        if (summariesErr) throw summariesErr;

        if (!summaries?.length) {
            // No data - render empty chart (all zeros)
            const emptyData = (students || []).map(s => ({ name: s.full_name.split(' ')[0], rate: 0 }));
            renderStudentPerformanceChart(emptyData);
            return;
        }

        // Fetch excuses
        const { data: excuses } = await supabase
            .from('excuse_letters')
            .select('student_id, date_absent')
            .eq('status', 'Approved')
            .in('student_id', studentIdsInHomeroom)
            .gte('date_absent', startDate)
            .lte('date_absent', endDate);
        const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);

        // Get class mapping for Kinder
        const classIds = [...new Set(students.map(s => s.class_id).filter(Boolean))];
        const { data: classes } = await supabase
            .from('classes')
            .select('id, grade_level')
            .in('id', classIds);
        const classMap = Object.fromEntries(classes?.map(c => [c.id, c.grade_level]) || []);
        const studentClassMap = Object.fromEntries(students.map(s => [s.id, classMap[s.class_id]]));

        // Compute stats per student
        const stats = {};
        students.forEach(s => {
            stats[s.id] = { name: s.full_name, present: 0, total: 0 };
        });

        summaries.forEach(summary => {
            const s = stats[summary.student_id];
            if (!s) return;
            const isExcused = excusedSet.has(`${summary.student_id}-${summary.date}`);
            const isKinder = studentClassMap[summary.student_id] === 'Kinder';

            // Morning session
            s.total += 1;
            if (isExcused || ['Present','Late','Excused'].includes(summary.morning_status)) {
                s.present += 1;
            }

            // Afternoon session (skip Kinder, skip if null)
            if (!isKinder && summary.afternoon_status) {
                s.total += 1;
                if (isExcused || ['Present','Late','Excused'].includes(summary.afternoon_status)) {
                    s.present += 1;
                }
            }
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
        // NEW: Use school-year-wide calculation (same as admin fetchCriticalAbsences)
        const schoolYearStart = await getSchoolYearStart();
        const schoolYearEnd = await getSchoolYearEnd();

        // Get homeroom students with class_id and parent_id
        const { data: students } = await supabase
            .from('students')
            .select('id, full_name, student_id_text, class_id, parent_id')
            .in('id', studentIdsInHomeroom)
            .eq('status', 'Enrolled');

        if (!students?.length) {
            container.innerHTML = '<p class="text-center text-gray-400 py-4 italic">No students found.</p>';
            return;
        }

        // Get class grade mapping
        const classIds = [...new Set(students.map(s => s.class_id).filter(Boolean))];
        const { data: classes } = await supabase
            .from('classes')
            .select('id, grade_level')
            .in('id', classIds);
        const classMap = Object.fromEntries(classes?.map(c => [c.id, c.grade_level]) || []);

        const criticalStudents = [];
        for (const student of students) {
            const gradeLevel = classMap[student.class_id];
            // Use AttendanceHelpers (same as admin)
            const totalDays = await AttendanceHelpers.getTotalSchoolDays(schoolYearStart, schoolYearEnd, gradeLevel);
            const unexcusedDays = await AttendanceHelpers.countUnexcusedAbsentDays(student.id, schoolYearStart, schoolYearEnd);
            const absenceRate = (unexcusedDays / totalDays) * 100;

            if (absenceRate >= 20) {
                criticalStudents.push({
                    studentId: student.id,
                    name: student.full_name,
                    id: student.student_id_text,
                    parent_id: student.parent_id,
                    absent: Math.floor(unexcusedDays),
                    halfday: Math.round((unexcusedDays % 1) * 2),
                    adjustedAbsence: unexcusedDays,
                    rate: absenceRate
                });
            }
        }

        // Sort by adjustedAbsence desc
        criticalStudents.sort((a, b) => b.adjustedAbsence - a.adjustedAbsence);

        if (criticalStudents.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-400 py-4 italic">No students with critical absences (20%+ absence rate).</p>';
            return;
        }

        let html = '';
        for (const student of criticalStudents.slice(0, 10)) {
            const initials = getInitials(student.name);
            const absenceRate = Math.round(student.rate);
            html += `
                <div class="flex items-center gap-3 p-3 bg-red-50 rounded-xl">
                    <div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-bold">${initials}</div>
                    <div class="flex-1">
                        <p class="font-medium text-gray-800">${escapeHtml(student.name)}</p>
                        <p class="text-xs text-gray-500">${student.id || 'N/A'} • ${absenceRate}% absence rate</p>
                    </div>
                    <div class="text-right mr-2">
                        <p class="text-lg font-bold text-red-600">${student.adjustedAbsence.toFixed(1)}</p>
                        <p class="text-xs text-gray-500">absences</p>
                    </div>
                    ${student.parent_id ? 
                        `<button onclick="alertParent(${student.parent_id}, '${escapeHtml(student.name)}', ${student.adjustedAbsence})" 
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
        container.innerHTML = '<p class="text-center text-gray-400 py-4 italic">Error loading data: ' + (err?.message || err) + '</p>';
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

console.log('[TeacherAnalytics] Teacher data analytics loaded');

