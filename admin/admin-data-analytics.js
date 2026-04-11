// admin/admin-data-analytics.js – Fully debugged version with half-day support
// Includes console logs to trace data flow and ensure charts render

const SCHOOL_YEAR_START = '2025-08-01';
const SCHOOL_YEAR_END = '2026-04-28';
const QUARTERS = [
    { name: 'Q1', start: '2025-08-01', end: '2025-10-31' },
    { name: 'Q2', start: '2025-11-01', end: '2026-01-31' },
    { name: 'Q3', start: '2026-02-01', end: '2026-04-28' }
];

let trendChart, pieChart, barChart, classChart;
let analyticsData = {};
let currentSelectedClassId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Verify supabase client
    if (typeof supabase === 'undefined') {
        console.error('Supabase client not loaded!');
        showErrorMessage('Supabase client failed to load. Refresh the page.');
        return;
    }

    // Set default date range (matches seeder)
    const startInput = document.getElementById('dateStart');
    const endInput = document.getElementById('dateEnd');
    const today = new Date().toISOString().split('T')[0];
    if (startInput) startInput.value = '2025-08-01';
    if (endInput) endInput.value = today;

    startInput?.addEventListener('change', () => loadAnalyticsData());
    endInput?.addEventListener('change', () => loadAnalyticsData());
    document.getElementById('class-filter')?.addEventListener('change', () => loadAnalyticsData());

    // Initialize empty charts (placeholders)
    initializeEmptyCharts();

    // Initialize button states for trend grouping
    await switchTrendGrouping('quarter');

    await populateClassFilter();
    await loadAnalyticsData();
});

async function populateClassFilter() {
    const filter = document.getElementById('class-filter');
    if (!filter) return;
    try {
        const { data: classes, error } = await supabase
            .from('classes')
            .select('id, grade_level')
            .order('grade_level');
        if (error) throw error;
        if (!classes?.length) {
            filter.innerHTML = '<option value="">No classes found</option>';
            return;
        }
        filter.innerHTML = '<option value="">All Classes</option>' +
            classes.map(c => `<option value="${c.id}">${escapeHtml(c.grade_level)}</option>`).join('');
        lucide?.createIcons();
    } catch (err) {
        console.error('populateClassFilter error:', err);
        filter.innerHTML = '<option value="">Error loading classes</option>';
    }
}

async function loadAnalyticsData(event) {
    const btn = event?.currentTarget;
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>';
        lucide?.createIcons();
    }

    // Show loading modal
    const loadingModal = document.getElementById('loadingModal');
    if (loadingModal) loadingModal.classList.remove('hidden');

    const dateStart = document.getElementById('dateStart')?.value;
    const dateEnd = document.getElementById('dateEnd')?.value;
    const classFilter = document.getElementById('class-filter')?.value || null;

    if (!dateStart || !dateEnd) {
        showErrorMessage('Please select a valid date range.');
        if (btn) resetButton(btn);
        if (loadingModal) loadingModal.classList.add('hidden');
        return;
    }

    console.log(`[Analytics] Loading: ${dateStart} → ${dateEnd}, class: ${classFilter || 'All'}`);

    try {
        // 1. Quick count check
        const { count, error: countErr } = await supabase
            .from('attendance_logs')
            .select('*', { count: 'exact', head: true })
            .gte('log_date', dateStart)
            .lte('log_date', dateEnd);
        if (countErr) throw countErr;
        console.log(`[Analytics] Total logs in range: ${count}`);

        if (count === 0) {
            showErrorMessage(`No attendance records found between ${dateStart} and ${dateEnd}.`);
            if (btn) resetButton(btn);
            const loadingModal = document.getElementById('loadingModal');
            if (loadingModal) loadingModal.classList.add('hidden');
            return;
        }

        // 2. Fetch all required data in parallel
        const [
            trendData,
            statusData,
            reasonsData,
            classData,
            criticalData,
            lateData,
            riskData,
            avgAttendance,
            combinedData,
            classAttendanceResult,
            holidaysData
        ] = await Promise.all([
            fetchAttendanceTrend(dateStart, dateEnd, classFilter, currentTrendGrouping, currentWeekMonth),
            fetchStatusDistribution(dateStart, dateEnd, classFilter),
            fetchCommonReasons(dateStart, dateEnd, classFilter),
            fetchClassPerformance(dateStart, dateEnd, classFilter),
            fetchCriticalAbsences(dateStart, dateEnd, classFilter),
            fetchFrequentLate(dateStart, dateEnd, classFilter),
            fetchPredictiveRisk(dateStart, dateEnd, classFilter),
            fetchAverageAttendanceRate(dateStart, dateEnd, classFilter),
            fetchCombinedLatesAbsences(dateStart, dateEnd, classFilter),
            loadClassAttendanceTableFast(dateStart, dateEnd),
            fetchHolidays(dateStart, dateEnd)
        ]);

        // Log fetched data for debugging
        console.log('[Analytics] trendData:', trendData);
        console.log('[Analytics] statusData:', statusData);
        console.log('[Analytics] reasonsData:', reasonsData);
        console.log('[Analytics] classData:', classData);
        console.log('[Analytics] criticalData:', criticalData?.length || 0);
        console.log('[Analytics] lateData:', lateData?.length || 0);
        console.log('[Analytics] riskData:', riskData?.length || 0);
        console.log('[Analytics] avgAttendance:', avgAttendance);
        console.log('[Analytics] combinedData:', combinedData?.length || 0);
        console.log('[Analytics] holidays:', holidaysData?.length || 0);

        // Store globally
        analyticsData = {
            attendanceTrend: trendData,
            statusDistribution: statusData,
            commonReasons: reasonsData,
            classPerformance: classData,
            criticalStudents: criticalData,
            frequentLate: lateData,
            riskStudents: riskData,
            avgAttendance: avgAttendance,
            combinedLatesAbsences: combinedData,
            holidays: holidaysData
        };

        // Update UI
        updateTrendChart(trendData, holidaysData);
        updatePieChart(statusData);
        updateBarChart(reasonsData);
        updateClassChart(classData);
        updateCriticalList(criticalData);
        updateLateList(lateData);
        updateRiskList(riskData);
        updateAvgAttendance(avgAttendance);
        updateCombinedList(combinedData);
        updateClassAttendanceTable(classAttendanceResult);

        console.log('[Analytics] All UI updates completed.');
    } catch (err) {
        console.error('[Analytics] Fatal error:', err);
        showErrorMessage('Failed to load analytics data. Check console.');
    } finally {
        if (btn) resetButton(btn);
        // Hide loading modal
        const loadingModal = document.getElementById('loadingModal');
        if (loadingModal) loadingModal.classList.add('hidden');
    }
}

// ========== DATA FETCHING FUNCTIONS ==========

async function fetchAttendanceTrend(dateStart, dateEnd, classId = null, groupBy = 'quarter', weekMonthFilter = '') {
    try {
        let studentIds = null;
        if (classId) {
            const { data: students } = await supabase.from('students').select('id').eq('class_id', classId);
            studentIds = students?.map(s => s.id).filter(id => id != null) || [];
            if (studentIds.length === 0) return { labels: [], present: [], late: [], absent: [], excused: [], halfday: [] };
        }

        // If week filter with specific month, adjust date range
        let effectiveDateStart = dateStart;
        let effectiveDateEnd = dateEnd;
        if (groupBy === 'week' && weekMonthFilter) {
            // Filter to just the selected month
            effectiveDateStart = `${weekMonthFilter}-01`;
            // Get last day of month
            const [year, month] = weekMonthFilter.split('-');
            const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
            effectiveDateEnd = `${weekMonthFilter}-${String(lastDay).padStart(2, '0')}`;
            console.log(`[Trend] Week filter: ${effectiveDateStart} to ${effectiveDateEnd}`);
        }

        // Fetch ALL logs with pagination
        let allLogs = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
            let baseQuery = supabase
                .from('attendance_logs')
                .select('student_id, log_date, status, morning_absent, afternoon_absent')
                .gte('log_date', dateStart)
                .lte('log_date', dateEnd)
                .not('student_id', 'is', null)
                .range(from, from + pageSize - 1);
            
            if (studentIds?.length) baseQuery = baseQuery.in('student_id', studentIds);
            
            const { data: logs, error } = await baseQuery;
            if (error) throw error;
            if (!logs || logs.length === 0) break;
            
            allLogs = allLogs.concat(logs);
            from += pageSize;
            hasMore = logs.length === pageSize;
        }

        if (allLogs.length === 0) return { labels: [], present: [], late: [], absent: [], excused: [], halfday: [] };

        let excusesQuery = supabase
            .from('excuse_letters')
            .select('student_id, date_absent')
            .eq('status', 'Approved')
            .gte('date_absent', effectiveDateStart)
            .lte('date_absent', effectiveDateEnd);
        if (studentIds?.length) excusesQuery = excusesQuery.in('student_id', studentIds);
        const { data: excuses } = await excusesQuery;
        const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);

        if (groupBy === 'quarter') {
            const quarterGroups = {
                'Q1': { Present: 0, Late: 0, Absent: 0, Excused: 0, HalfDay: 0 },
                'Q2': { Present: 0, Late: 0, Absent: 0, Excused: 0, HalfDay: 0 },
                'Q3': { Present: 0, Late: 0, Absent: 0, Excused: 0, HalfDay: 0 }
            };

            allLogs.forEach(log => {
                const logDate = new Date(log.log_date);
                let quarter = 'Q3';
                if (logDate >= new Date('2025-08-01') && logDate <= new Date('2025-10-31')) quarter = 'Q1';
                else if (logDate >= new Date('2025-11-01') && logDate <= new Date('2026-01-31')) quarter = 'Q2';
                
                const morningAbsent = log.morning_absent || false;
                const afternoonAbsent = log.afternoon_absent || false;
                const isFullDayAbsent = morningAbsent && afternoonAbsent;
                const isHalfDay = (morningAbsent !== afternoonAbsent && !isFullDayAbsent) || log.status === 'Half Day';
                
                const isExcused = excusedSet.has(`${log.student_id}-${log.log_date}`);
                if (isExcused) {
                    quarterGroups[quarter].Excused++;
                } else if (isHalfDay) {
                    quarterGroups[quarter].HalfDay++;
                    quarterGroups[quarter].Present += 0.5;
                } else if (isFullDayAbsent) {
                    quarterGroups[quarter].Absent++;
                } else if (log.status === 'Present' || log.status === 'On Time') {
                    quarterGroups[quarter].Present++;
                } else if (log.status === 'Late') {
                    quarterGroups[quarter].Late++;
                } else if (log.status === 'Absent') {
                    quarterGroups[quarter].Absent++;
                }
            });

            return {
                labels: ['Q1 (Aug-Oct)', 'Q2 (Nov-Jan)', 'Q3 (Feb-Apr)'],
                present: [quarterGroups['Q1'].Present, quarterGroups['Q2'].Present, quarterGroups['Q3'].Present],
                late: [quarterGroups['Q1'].Late, quarterGroups['Q2'].Late, quarterGroups['Q3'].Late],
                absent: [quarterGroups['Q1'].Absent, quarterGroups['Q2'].Absent, quarterGroups['Q3'].Absent],
                excused: [quarterGroups['Q1'].Excused, quarterGroups['Q2'].Excused, quarterGroups['Q3'].Excused],
                halfday: [quarterGroups['Q1'].HalfDay, quarterGroups['Q2'].HalfDay, quarterGroups['Q3'].HalfDay]
            };
        } else if (groupBy === 'month') {
            // Group by month (all months in range)
            const monthGroups = {};
            // School year month mapping (Aug=8, Sep=9, Oct=10, Nov=11, Dec=12, Jan=1, Feb=2, Mar=3, Apr=4)
            const schoolYearMonthMap = { '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec', '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr' };
            
            allLogs.forEach(log => {
                const logDate = new Date(log.log_date);
                const monthKey = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}`;
                if (!monthGroups[monthKey]) {
                    monthGroups[monthKey] = { Present: 0, Late: 0, Absent: 0, Excused: 0, HalfDay: 0 };
                }
                
                const morningAbsent = log.morning_absent || false;
                const afternoonAbsent = log.afternoon_absent || false;
                const isFullDayAbsent = morningAbsent && afternoonAbsent;
                const isHalfDay = (morningAbsent !== afternoonAbsent && !isFullDayAbsent) || log.status === 'Half Day';
                
                const isExcused = excusedSet.has(`${log.student_id}-${log.log_date}`);
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

            // Sort months chronologically (accounting for school year Aug-Apr)
            const sortedMonths = Object.keys(monthGroups).sort((a, b) => {
                const [yearA, monthA] = a.split('-');
                const [yearB, monthB] = b.split('-');
                // Convert to sortable value (year * 100 + month order for school year)
                const orderA = (yearA === '2026' ? 100 : 0) + parseInt(monthA);
                const orderB = (yearB === '2026' ? 100 : 0) + parseInt(monthB);
                return orderA - orderB;
            });
            
            const monthLabels = sortedMonths.map(m => {
                const [year, month] = m.split('-');
                return schoolYearMonthMap[month] || `${month}`;
            });

            return {
                labels: monthLabels,
                present: sortedMonths.map(m => monthGroups[m].Present),
                late: sortedMonths.map(m => monthGroups[m].Late),
                absent: sortedMonths.map(m => monthGroups[m].Absent),
                excused: sortedMonths.map(m => monthGroups[m].Excused),
                halfday: sortedMonths.map(m => monthGroups[m].HalfDay)
            };
        } else if (groupBy === 'week') {
            // Group by week within the selected month
            const weekGroups = {};
            const weekLabelsMap = {};
            
            // Get selected month from weekMonthFilter (e.g., "2025-08")
            const selectedMonth = weekMonthFilter || '';
            const [selectedYear, selectedMonthNum] = selectedMonth.split('-');
            
            allLogs.forEach(log => {
                const logDate = new Date(log.log_date);
                const logMonth = String(logDate.getMonth() + 1).padStart(2, '0');
                const logYear = String(logDate.getFullYear());
                
                // Only include logs from selected month
                if (logMonth !== selectedMonthNum || logYear !== selectedYear) return;
                
                // Calculate week number (1st-4th or 5th week of month)
                const day = logDate.getDate();
                const weekNum = Math.ceil(day / 7);
                const weekKey = `Week ${weekNum}`;
                
                if (!weekGroups[weekKey]) {
                    weekGroups[weekKey] = { Present: 0, Late: 0, Absent: 0, Excused: 0, HalfDay: 0 };
                    // Also store the day range for display
                    const startDay = (weekNum - 1) * 7 + 1;
                    const endDay = Math.min(weekNum * 7, new Date(parseInt(selectedYear), parseInt(selectedMonthNum), 0).getDate());
                    weekLabelsMap[weekKey] = `${startDay}-${endDay}`;
                }
                
                const morningAbsent = log.morning_absent || false;
                const afternoonAbsent = log.afternoon_absent || false;
                const isFullDayAbsent = morningAbsent && afternoonAbsent;
                const isHalfDay = (morningAbsent !== afternoonAbsent && !isFullDayAbsent) || log.status === 'Half Day';
                
                const isExcused = excusedSet.has(`${log.student_id}-${log.log_date}`);
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

            // Sort weeks in order (Week 1, Week 2, etc.)
            const sortedWeeks = Object.keys(weekGroups).sort((a, b) => {
                const numA = parseInt(a.replace('Week ', ''));
                const numB = parseInt(b.replace('Week ', ''));
                return numA - numB;
            });
            
            const weekLabels = sortedWeeks.map(w => `${w} (${weekLabelsMap[w]})`);

            return {
                labels: weekLabels,
                present: sortedWeeks.map(w => weekGroups[w].Present),
                late: sortedWeeks.map(w => weekGroups[w].Late),
                absent: sortedWeeks.map(w => weekGroups[w].Absent),
                excused: sortedWeeks.map(w => weekGroups[w].Excused),
                halfday: sortedWeeks.map(w => weekGroups[w].HalfDay)
            };
        }
    } catch (err) {
        console.error('fetchAttendanceTrend error:', err);
        return { labels: [], present: [], late: [], absent: [], excused: [], halfday: [] };
    }
}

async function fetchStatusDistribution(dateStart, dateEnd, classId = null) {
    try {
        let studentIds = null;
        if (classId) {
            const { data: students } = await supabase.from('students').select('id').eq('class_id', classId);
            studentIds = students?.map(s => s.id).filter(id => id != null) || [];
            if (studentIds.length === 0) return { Present: 0, Late: 0, Absent: 0, Excused: 0, HalfDay: 0 };
        }

        // Fetch ALL logs with pagination
        let allLogs = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
            let baseQuery = supabase
                .from('attendance_logs')
                .select('student_id, log_date, status, morning_absent, afternoon_absent')
                .gte('log_date', dateStart)
                .lte('log_date', dateEnd)
                .not('student_id', 'is', null)
                .range(from, from + pageSize - 1);
            
            if (studentIds?.length) baseQuery = baseQuery.in('student_id', studentIds);
            
            const { data: logs } = await baseQuery;
            if (!logs || logs.length === 0) break;
            
            allLogs = allLogs.concat(logs);
            from += pageSize;
            hasMore = logs.length === pageSize;
        }

        if (allLogs.length === 0) return { Present: 0, Late: 0, Absent: 0, Excused: 0, HalfDay: 0 };

        let excusesQuery = supabase
            .from('excuse_letters')
            .select('student_id, date_absent')
            .eq('status', 'Approved')
            .gte('date_absent', dateStart)
            .lte('date_absent', dateEnd);
        if (studentIds?.length) excusesQuery = excusesQuery.in('student_id', studentIds);
        const { data: excuses } = await excusesQuery;
        const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);

        const counts = { Present: 0, Late: 0, Absent: 0, Excused: 0, HalfDay: 0 };
        allLogs.forEach(log => {
            const morningAbsent = log.morning_absent || false;
            const afternoonAbsent = log.afternoon_absent || false;
            const isFullDayAbsent = morningAbsent && afternoonAbsent;
            const isHalfDay = (morningAbsent !== afternoonAbsent && !isFullDayAbsent) || log.status === 'Half Day';
            
            const isExcused = excusedSet.has(`${log.student_id}-${log.log_date}`);
            if (isExcused) counts.Excused++;
            else if (isHalfDay) {
                counts.HalfDay++;
                counts.Present += 0.5;
            }
            else if (isFullDayAbsent) counts.Absent++;
            else if (log.status === 'Present' || log.status === 'On Time') counts.Present++;
            else if (log.status === 'Late') counts.Late++;
            else if (log.status === 'Absent') counts.Absent++;
        });
        return counts;
    } catch (err) {
        console.error('fetchStatusDistribution error:', err);
        return { Present: 0, Late: 0, Absent: 0, Excused: 0, HalfDay: 0 };
    }
}

async function fetchCommonReasons(dateStart, dateEnd, classId = null) {
    try {
        const reasons = {};
        let studentIds = null;
        if (classId) {
            const { data: students } = await supabase.from('students').select('id').eq('class_id', classId);
            studentIds = students?.map(s => s.id).filter(id => id != null) || [];
        }

        let excusesQuery = supabase.from('excuse_letters').select('reason, student_id').gte('date_absent', dateStart).lte('date_absent', dateEnd);
        if (studentIds?.length) excusesQuery = excusesQuery.in('student_id', studentIds);
        const { data: excuses } = await excusesQuery;
        excuses?.forEach(e => { const r = e.reason || 'Other'; reasons[r] = (reasons[r] || 0) + 1; });

        let clinicQuery = supabase.from('clinic_visits').select('reason, student_id').gte('time_in', `${dateStart}T00:00:00`).lte('time_in', `${dateEnd}T23:59:59`);
        if (studentIds?.length) clinicQuery = clinicQuery.in('student_id', studentIds);
        const { data: clinic } = await clinicQuery;
        clinic?.forEach(v => { const r = v.reason || 'Other'; reasons[r] = (reasons[r] || 0) + 1; });

        const sorted = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 8);
        return { labels: sorted.map(s => s[0]), data: sorted.map(s => s[1]) };
    } catch (err) {
        console.error('fetchCommonReasons error:', err);
        return { labels: [], data: [] };
    }
}

async function fetchHolidays(dateStart, dateEnd) {
    try {
        const { data: holidays, error } = await supabase
            .from('holidays')
            .select('holiday_date, description')
            .gte('holiday_date', dateStart)
            .lte('holiday_date', dateEnd);
        if (error) throw error;
        return holidays || [];
    } catch (err) {
        console.error('fetchHolidays error:', err);
        return [];
    }
}

async function fetchClassPerformance(dateStart, dateEnd, classId = null) {
    try {
        let classesQuery = supabase.from('classes').select('id, grade_level, strand').order('grade_level');
        if (classId) classesQuery = classesQuery.eq('id', classId);
        const { data: classes } = await classesQuery;
        if (!classes?.length) return { labels: [], data: [] };

        // Build student class map with number keys
        const { data: students } = await supabase.from('students').select('id, class_id');
        const studentClassMap = {};
        students?.forEach(s => {
            if (s.class_id) studentClassMap[s.id] = Number(s.class_id);
        });

        // Fetch all logs (no limit) - similar to class attendance table
        let allLogs = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        let baseQuery = supabase
            .from('attendance_logs')
            .select('student_id, log_date, status, morning_absent, afternoon_absent')
            .gte('log_date', dateStart)
            .lte('log_date', dateEnd)
            .not('student_id', 'is', null);

        while (hasMore) {
            const { data: logs, error } = await baseQuery
                .range(from, from + pageSize - 1);
            
            if (error) throw error;
            if (!logs || logs.length === 0) break;
            
            allLogs = allLogs.concat(logs);
            from += pageSize;
            hasMore = logs.length === pageSize;
        }

        const { data: excuses } = await supabase
            .from('excuse_letters')
            .select('student_id, date_absent')
            .eq('status', 'Approved')
            .gte('date_absent', dateStart)
            .lte('date_absent', dateEnd);
        const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);

        const classStats = {};
        classes.forEach(c => { 
            classStats[c.id] = { total: 0, present: 0, name: c.grade_level }; 
        });

        allLogs.forEach(log => {
            const cid = studentClassMap[log.student_id];
            if (cid && classStats[cid]) {
                const morningAbsent = log.morning_absent === true;
                const afternoonAbsent = log.afternoon_absent === true;
                const isFullDayAbsent = morningAbsent && afternoonAbsent;
                const isHalfDay = (morningAbsent !== afternoonAbsent && !isFullDayAbsent) || log.status === 'Half Day';
                
                classStats[cid].total++;
                const isExcused = excusedSet.has(`${log.student_id}-${log.log_date}`);
                if (isExcused) classStats[cid].present++;
                else if (isHalfDay) classStats[cid].present += 0.5;
                else if (log.status === 'Present' || log.status === 'On Time') classStats[cid].present++;
                else if (log.status === 'Late') classStats[cid].present++;
            }
        });

        // Include ALL classes, sort by grade level
        const gradeSortOrder = { 'Grade 1': 1, 'Grade 2': 2, 'Grade 3': 3, 'Grade 4': 4, 'Grade 5': 5, 'Grade 6': 6, 'Grade 7': 7, 'Grade 8': 8, 'Grade 9': 9, 'Grade 10': 10, 'Grade 11': 11, 'Grade 12': 12, 'Kinder': 0 };
        
        const rates = Object.entries(classStats)
            .map(([id, s]) => ({
                label: [s.name, classes.find(c => c.id == id)?.strand].filter(Boolean).join(' '),
                rate: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0,
                grade: gradeSortOrder[s.name] || 99
            }))
            .sort((a, b) => a.grade - b.grade);

        return { labels: rates.map(r => r.label), data: rates.map(r => r.rate) };
    } catch (err) {
        console.error('fetchClassPerformance error:', err);
        return { labels: [], data: [] };
    }
}

async function fetchCriticalAbsences(dateStart, dateEnd, classId = null) {
    try {
        let studentsQuery = supabase.from('students').select('id, full_name, student_id_text, class_id');
        if (classId) studentsQuery = studentsQuery.eq('class_id', classId);
        const { data: students } = await studentsQuery;
        if (!students?.length) return [];

        const { data: excuses } = await supabase
            .from('excuse_letters')
            .select('student_id, date_absent')
            .eq('status', 'Approved')
            .gte('date_absent', dateStart)
            .lte('date_absent', dateEnd);
        const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);

        let logsQuery = supabase
            .from('attendance_logs')
            .select('student_id, log_date, status, morning_absent, afternoon_absent')
            .gte('log_date', dateStart)
            .lte('log_date', dateEnd)
            .not('student_id', 'is', null);
        if (classId) {
            const studentIds = students.map(s => s.id).filter(id => id != null);
            if (studentIds.length) logsQuery = logsQuery.in('student_id', studentIds);
        }
        const { data: logs } = await logsQuery;

        const absenceCount = {};
        students.forEach(s => { absenceCount[s.id] = { name: s.full_name, id: s.student_id_text, absent: 0, halfday: 0 }; });
        
        logs?.forEach(log => {
            if (!log.student_id || !absenceCount[log.student_id]) return;
            const morningAbsent = log.morning_absent || false;
            const afternoonAbsent = log.afternoon_absent || false;
            const isFullDayAbsent = morningAbsent && afternoonAbsent;
            const isHalfDay = morningAbsent !== afternoonAbsent && !isFullDayAbsent;

            if (isExcused(`${log.student_id}-${log.log_date}`)) return;
            
            if (isFullDayAbsent) {
                absenceCount[log.student_id].absent++;
            } else if (isHalfDay) {
                absenceCount[log.student_id].halfday++;
            } else if (log.status === 'Absent') {
                absenceCount[log.student_id].absent++;
            }
        });

        function isExcused(key) { return excusedSet.has(key); }

        // Calculate adjusted absences (half-day = 0.5)
        const result = Object.values(absenceCount).map(s => ({
            ...s,
            adjustedAbsence: s.absent + (s.halfday * 0.5)
        })).filter(s => s.adjustedAbsence > 10).sort((a, b) => b.adjustedAbsence - a.adjustedAbsence).slice(0, 10);
        
        return result;
    } catch (err) {
        console.error('fetchCriticalAbsences error:', err);
        return [];
    }
}

async function fetchFrequentLate(dateStart, dateEnd, classId = null) {
    try {
        let logsQuery = supabase
            .from('attendance_logs')
            .select('student_id')
            .eq('status', 'Late')
            .gte('log_date', dateStart)
            .lte('log_date', dateEnd)
            .not('student_id', 'is', null);
        if (classId) {
            const { data: students } = await supabase.from('students').select('id').eq('class_id', classId);
            const studentIds = students?.map(s => s.id).filter(id => id != null) || [];
            if (studentIds.length) logsQuery = logsQuery.in('student_id', studentIds);
            else return [];
        }
        const { data: logs } = await logsQuery;
        if (!logs?.length) return [];

        const lateCounts = {};
        logs.forEach(log => { if (log.student_id) lateCounts[log.student_id] = (lateCounts[log.student_id] || 0) + 1; });

        const studentIds = Object.keys(lateCounts).map(Number).filter(id => !isNaN(id) && id > 0);
        if (!studentIds.length) return [];
        const { data: students } = await supabase.from('students').select('id, full_name, student_id_text').in('id', studentIds);
        const studentMap = Object.fromEntries(students?.map(s => [s.id, s]) || []);
        return Object.entries(lateCounts).map(([id, count]) => ({
            name: studentMap[Number(id)]?.full_name || 'Unknown',
            id: studentMap[Number(id)]?.student_id_text || '',
            count
        })).sort((a, b) => b.count - a.count).slice(0, 10);
    } catch (err) {
        console.error('fetchFrequentLate error:', err);
        return [];
    }
}

async function fetchPredictiveRisk(dateStart, dateEnd, classId = null) {
    try {
        let studentsQuery = supabase.from('students').select('id, full_name, student_id_text');
        if (classId) studentsQuery = studentsQuery.eq('class_id', classId);
        const { data: students } = await studentsQuery;
        if (!students?.length) return [];

        const { data: excuses } = await supabase
            .from('excuse_letters')
            .select('student_id, date_absent')
            .eq('status', 'Approved')
            .gte('date_absent', dateStart)
            .lte('date_absent', dateEnd);
        const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);

        let logsQuery = supabase
            .from('attendance_logs')
            .select('student_id, status, log_date, morning_absent, afternoon_absent')
            .gte('log_date', dateStart)
            .lte('log_date', dateEnd)
            .not('student_id', 'is', null);
        if (classId) {
            const studentIds = students.map(s => s.id).filter(id => id != null);
            if (studentIds.length) logsQuery = logsQuery.in('student_id', studentIds);
        }
        const { data: logs } = await logsQuery;

        const stats = {};
        students.forEach(s => { stats[s.id] = { name: s.full_name, id: s.student_id_text, total: 0, absent: 0, late: 0, halfday: 0 }; });
        logs?.forEach(log => {
            if (!log.student_id || !stats[log.student_id]) return;
            const s = stats[log.student_id];
            const morningAbsent = log.morning_absent || false;
            const afternoonAbsent = log.afternoon_absent || false;
            const isFullDayAbsent = morningAbsent && afternoonAbsent;
            const isHalfDay = morningAbsent !== afternoonAbsent && !isFullDayAbsent;
            
            s.total++;
            const isExcused = excusedSet.has(`${log.student_id}-${log.log_date}`);
            if (!isExcused) {
                if (isHalfDay) s.halfday++;
                else if (isFullDayAbsent) s.absent++;
                else if (log.status === 'Absent') s.absent++;
                else if (log.status === 'Late') s.late++;
            }
        });

        const riskStudents = [];
        for (const s of Object.values(stats)) {
            if (s.total === 0) continue;
            // Calculate effective absence rate (half-day = 0.5)
            const effectiveAbsent = s.absent + (s.halfday * 0.5);
            const absenceRate = (effectiveAbsent / s.total) * 100;
            const lateRate = (s.late / s.total) * 100;
            let riskLevel = 'none', reason = '';
            if (absenceRate > 15) { riskLevel = 'high'; reason = `High absence risk (${Math.round(absenceRate)}% absent)`; }
            else if (absenceRate > 10) { riskLevel = 'medium'; reason = `Moderate absence risk (${Math.round(absenceRate)}% absent)`; }
            else if (lateRate > 25) { riskLevel = 'medium'; reason = `Excessive tardiness (${Math.round(lateRate)}% late)`; }
            else if (lateRate > 15) { riskLevel = 'low'; reason = `Frequent lateness (${Math.round(lateRate)}% late)`; }
            if (riskLevel !== 'none') riskStudents.push({ ...s, riskLevel, reason, absenceRate: Math.round(absenceRate), lateRate: Math.round(lateRate) });
        }
        return riskStudents.sort((a, b) => b.absenceRate - a.absenceRate).slice(0, 15);
    } catch (err) {
        console.error('fetchPredictiveRisk error:', err);
        return [];
    }
}

async function fetchAverageAttendanceRate(dateStart, dateEnd, classId = null) {
    try {
        let logsQuery = supabase
            .from('attendance_logs')
            .select('status, morning_absent, afternoon_absent')
            .gte('log_date', dateStart)
            .lte('log_date', dateEnd)
            .not('student_id', 'is', null);
        if (classId) {
            const { data: students } = await supabase.from('students').select('id').eq('class_id', classId);
            const studentIds = students?.map(s => s.id).filter(id => id != null) || [];
            if (studentIds.length) logsQuery = logsQuery.in('student_id', studentIds);
            else return 0;
        }
        const { data: logs } = await logsQuery;
        if (!logs?.length) return 0;
        
        let present = 0;
        logs.forEach(log => {
            const morningAbsent = log.morning_absent || false;
            const afternoonAbsent = log.afternoon_absent || false;
            const isFullDayAbsent = morningAbsent && afternoonAbsent;
            const isHalfDay = morningAbsent !== afternoonAbsent && !isFullDayAbsent;
            
            if (isHalfDay) present += 0.5;
            else if (isFullDayAbsent) {} // absent
            else if (log.status === 'Present') present++;
            else if (log.status === 'Late') present++;
            else if (log.status === 'Excused') present++;
        });
        
        return Math.round((present / logs.length) * 100);
    } catch (err) {
        console.error('fetchAverageAttendanceRate error:', err);
        return 0;
    }
}

async function fetchCombinedLatesAbsences(dateStart, dateEnd, classId = null) {
    try {
        let studentsQuery = supabase.from('students').select('id, full_name, student_id_text, class_id');
        if (classId) studentsQuery = studentsQuery.eq('class_id', classId);
        const { data: students } = await studentsQuery;
        if (!students?.length) return [];

        const { data: excuses } = await supabase
            .from('excuse_letters')
            .select('student_id, date_absent')
            .eq('status', 'Approved')
            .gte('date_absent', dateStart)
            .lte('date_absent', dateEnd);
        const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);

        let logsQuery = supabase
            .from('attendance_logs')
            .select('student_id, status, log_date, morning_absent, afternoon_absent')
            .gte('log_date', dateStart)
            .lte('log_date', dateEnd)
            .not('student_id', 'is', null);
        if (classId) {
            const studentIds = students.map(s => s.id).filter(id => id != null);
            if (studentIds.length) logsQuery = logsQuery.in('student_id', studentIds);
        }
        const { data: logs } = await logsQuery;
        if (!logs?.length) return [];

        const stats = {};
        students.forEach(s => { stats[s.id] = { name: s.full_name, student_id_text: s.student_id_text, lates: 0, absences: 0, halfday: 0 }; });
        logs.forEach(log => {
            if (!log.student_id || !stats[log.student_id]) return;
            const morningAbsent = log.morning_absent || false;
            const afternoonAbsent = log.afternoon_absent || false;
            const isFullDayAbsent = morningAbsent && afternoonAbsent;
            const isHalfDay = morningAbsent !== afternoonAbsent && !isFullDayAbsent;
            
            const isExcused = excusedSet.has(`${log.student_id}-${log.log_date}`);
            if (isExcused) return;
            
            if (isHalfDay) {
                stats[log.student_id].halfday++;
            } else if (log.status === 'Late') {
                stats[log.student_id].lates++;
            } else if (isFullDayAbsent || log.status === 'Absent') {
                stats[log.student_id].absences++;
            }
        });
        return Object.values(stats)
            .map(s => ({ ...s, total: s.lates + s.absences + s.halfday }))
            .filter(s => s.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);
    } catch (err) {
        console.error('fetchCombinedLatesAbsences error:', err);
        return [];
    }
}

// ========== UI UPDATE FUNCTIONS (with safety checks) ==========

function updateTrendChart(data, holidays = []) {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (trendChart) trendChart.destroy();

    if (!data.labels || data.labels.length === 0) {
        trendChart = new Chart(ctx, {
            type: 'line',
            data: { labels: ['No Data'], datasets: [{ label: 'No Data', data: [0], borderColor: '#cbd5e1', borderDash: [5, 5] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
        return;
    }

    if (holidays?.length) {
        console.log('[Trend Chart] Holidays in date range:', holidays.map(h => `${h.holiday_date}: ${h.description}`));
    }

    // Enhanced chart for data analyst friendly visualization
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                { 
                    label: 'Present', 
                    data: data.present, 
                    borderColor: '#22c55e', 
                    backgroundColor: 'rgba(34,197,94,0.15)', 
                    fill: true, 
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 2
                },
                { 
                    label: 'Late', 
                    data: data.late, 
                    borderColor: '#eab308', 
                    backgroundColor: 'rgba(234,179,8,0.15)', 
                    fill: true, 
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 2
                },
                { 
                    label: 'Absent', 
                    data: data.absent, 
                    borderColor: '#ef4444', 
                    backgroundColor: 'rgba(239,68,68,0.15)', 
                    fill: true, 
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 2
                },
                { 
                    label: 'Excused', 
                    data: data.excused, 
                    borderColor: '#3b82f6', 
                    backgroundColor: 'rgba(59,130,246,0.15)', 
                    fill: true, 
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 2
                },
                { 
                    label: 'Half Day', 
                    data: data.halfday, 
                    borderColor: '#f59e0b', 
                    backgroundColor: 'rgba(245,158,11,0.15)', 
                    fill: true, 
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 2
                }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: { 
                legend: { 
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: { size: 11, weight: 'bold' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + Math.round(context.parsed.y * 10) / 10;
                        }
                    }
                }
            },
            scales: { 
                y: { 
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0,0,0,0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        stepSize: 1,
                        font: { size: 11 }
                    },
                    title: {
                        display: true,
                        text: 'Number of Students',
                        font: { size: 12, weight: 'bold' }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: { size: 11, weight: 'bold' }
                    }
                }
            }
        }
    });
}

function updatePieChart(data) {
    const canvas = document.getElementById('pieChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (pieChart) pieChart.destroy();
    pieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Present', 'Late', 'Absent', 'Excused', 'Half Day'],
            datasets: [{ data: [data.Present || 0, data.Late || 0, data.Absent || 0, data.Excused || 0, data.HalfDay || 0], backgroundColor: ['#22c55e', '#eab308', '#ef4444', '#3b82f6', '#f59e0b'] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '70%' }
    });
}

function updateBarChart(data) {
    const canvas = document.getElementById('barChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (barChart) barChart.destroy();
    barChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: data.labels || [], datasets: [{ label: 'Incidents', data: data.data || [], backgroundColor: '#8b5cf6', borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function updateClassChart(data) {
    const canvas = document.getElementById('classChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (classChart) classChart.destroy();
    if (!data.labels || data.labels.length === 0) {
        classChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: ['No Data'], datasets: [{ label: 'Attendance Rate', data: [0], backgroundColor: '#cbd5e1' }] },
            options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } } }
        });
        return;
    }
    
    // Use horizontal bars for better label display with many classes
    const isManyClasses = data.labels.length > 8;
    classChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Attendance Rate (%)',
                data: data.data,
                backgroundColor: data.data.map(r => r >= 90 ? '#22c55e' : r >= 75 ? '#eab308' : '#ef4444'),
                borderRadius: 6
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            indexAxis: isManyClasses ? 'y' : 'x',
            scales: { 
                x: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } },
                y: { ticks: { font: { size: 11 } } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function updateCriticalList(students) {
    const container = document.getElementById('criticalListContainer');
    if (!container) return;
    if (!students || students.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-4 italic">No critical cases found</div>';
        return;
    }
    container.innerHTML = students.map(s => `
        <div class="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-xl">
            <div><div class="h-10 w-10 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-bold">${s.name?.charAt(0) || '?'}</div></div>
            <div class="flex-1 px-3"><p class="font-bold text-gray-900 text-sm">${escapeHtml(s.name)}</p><p class="text-xs text-gray-400">ID: ${escapeHtml(s.id)}</p></div>
            <div class="text-right"><p class="font-black text-red-600 text-lg">${s.absent}</p><p class="text-[10px] text-gray-400 font-bold uppercase">absences</p></div>
        </div>
    `).join('');
}

function updateLateList(students) {
    const container = document.getElementById('lateListContainer');
    if (!container) return;
    if (!students || students.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-4 italic">No late incidents found</div>';
        return;
    }
    container.innerHTML = students.map(s => `
        <div class="flex items-center justify-between p-3 bg-amber-50 border border-amber-100 rounded-xl">
            <div><div class="h-10 w-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 font-bold">${s.name?.charAt(0) || '?'}</div></div>
            <div class="flex-1 px-3"><p class="font-bold text-gray-900 text-sm">${escapeHtml(s.name)}</p><p class="text-xs text-gray-400">ID: ${escapeHtml(s.id)}</p></div>
            <div class="text-right"><p class="font-black text-amber-600 text-lg">${s.count}</p><p class="text-[10px] text-gray-400 font-bold uppercase">lates</p></div>
        </div>
    `).join('');
}

function updateRiskList(students) {
    const container = document.getElementById('riskListContainer');
    if (!container) return;
    if (!students || students.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-4 italic">No at-risk students detected</div>';
        return;
    }
    container.innerHTML = students.map(s => `
        <div class="flex items-center justify-between p-3 ${s.riskLevel === 'high' ? 'bg-red-50 border-red-200' : s.riskLevel === 'medium' ? 'bg-orange-50 border-orange-200' : 'bg-yellow-50 border-yellow-200'} border rounded-xl">
            <div><div class="h-10 w-10 rounded-full flex items-center justify-center font-bold ${s.riskLevel === 'high' ? 'bg-red-100 text-red-600' : s.riskLevel === 'medium' ? 'bg-orange-100 text-orange-600' : 'bg-yellow-100 text-yellow-600'}">${s.name?.charAt(0) || '?'}</div></div>
            <div class="flex-1 px-3"><p class="font-bold text-gray-900 text-sm">${escapeHtml(s.name)}</p><p class="text-xs text-gray-400">ID: ${escapeHtml(s.id)}</p><p class="text-xs ${s.riskLevel === 'high' ? 'text-red-600' : 'text-orange-600'}">${escapeHtml(s.reason)}</p></div>
            <div class="text-right"><p class="font-black text-lg ${s.riskLevel === 'high' ? 'text-red-600' : 'text-orange-600'}">${s.absenceRate}% absent</p><p class="text-[10px] text-gray-400">${s.lateRate}% late</p></div>
        </div>
    `).join('');
}

function updateAvgAttendance(rate) {
    const el = document.getElementById('avgAttendanceRate');
    if (el) el.innerText = `${rate}%`;
}

function updateCombinedList(students) {
    const container = document.getElementById('combinedListContainer');
    if (!container) return;
    if (!students || students.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-4 italic">No data for the selected period</div>';
        return;
    }
    container.innerHTML = students.map(s => `
        <div class="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
            <div><div class="h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold">${s.name?.charAt(0) || '?'}</div></div>
            <div class="flex-1 px-3"><p class="font-bold text-gray-900 text-sm">${escapeHtml(s.name)}</p><p class="text-xs text-gray-400">ID: ${escapeHtml(s.student_id_text)}</p></div>
            <div class="text-right flex gap-4">
                <div><p class="font-black text-amber-600 text-sm">${s.lates}</p><p class="text-[10px] text-gray-400">Lates</p></div>
                <div><p class="font-black text-red-600 text-sm">${s.absences}</p><p class="text-[10px] text-gray-400">Absences</p></div>
                <div><p class="font-black text-orange-500 text-sm">${s.halfday || 0}</p><p class="text-[10px] text-gray-400">Half Days</p></div>
                <div><p class="font-black text-indigo-600 text-base">${s.total}</p><p class="text-[10px] text-gray-400">Total</p></div>
            </div>
        </div>
    `).join('');
}

function initializeEmptyCharts() {
    // Placeholder empty charts – actual data will replace them
    const ctx1 = document.getElementById('trendChart')?.getContext('2d');
    if (ctx1) {
        trendChart = new Chart(ctx1, {
            type: 'line',
            data: { labels: ['Loading...'], datasets: [{ label: 'Please wait', data: [0], borderColor: '#cbd5e1' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }
    const ctx2 = document.getElementById('pieChart')?.getContext('2d');
    if (ctx2) {
        pieChart = new Chart(ctx2, {
            type: 'doughnut',
            data: { labels: ['Present', 'Late', 'Absent', 'Excused'], datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#e2e8f0', '#e2e8f0', '#e2e8f0', '#e2e8f0'] }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
        });
    }
    const ctx3 = document.getElementById('barChart')?.getContext('2d');
    if (ctx3) {
        barChart = new Chart(ctx3, {
            type: 'bar',
            data: { labels: ['Loading...'], datasets: [{ data: [0], backgroundColor: '#cbd5e1' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }
    const ctx4 = document.getElementById('classChart')?.getContext('2d');
    if (ctx4) {
        classChart = new Chart(ctx4, {
            type: 'bar',
            data: { labels: ['Loading...'], datasets: [{ data: [0], backgroundColor: '#cbd5e1' }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } }
        });
    }
}

function exportToCSV() {
    const start = document.getElementById('dateStart')?.value || 'N/A';
    const end = document.getElementById('dateEnd')?.value || 'N/A';
    let csv = `Educare Analytics Report\nDate Range: ${start} to ${end}\n\n`;
    csv += `STATUS DISTRIBUTION\nStatus,Count\nPresent,${analyticsData.statusDistribution?.Present || 0}\nLate,${analyticsData.statusDistribution?.Late || 0}\nAbsent,${analyticsData.statusDistribution?.Absent || 0}\nExcused,${analyticsData.statusDistribution?.Excused || 0}\nHalf Day,${analyticsData.statusDistribution?.HalfDay || 0}\n\n`;
    csv += `COMMON REASONS\nReason,Count\n${analyticsData.commonReasons?.labels?.map((l, i) => `${l},${analyticsData.commonReasons.data[i]}`).join('\n') || ''}\n\n`;
    csv += `CLASS PERFORMANCE\nClass,Attendance Rate (%)\n${analyticsData.classPerformance?.labels?.map((l, i) => `${l},${analyticsData.classPerformance.data[i]}`).join('\n') || ''}\n\n`;
    csv += `CRITICAL WATCHLIST (>10 Absences)\nStudent Name,Student ID,Full Absences,Half Days,Adjusted Absences\n${analyticsData.criticalStudents?.map(s => `${s.name},${s.id},${s.absent},${s.halfday || 0},${s.adjustedAbsence?.toFixed(1) || s.absent}`).join('\n') || ''}\n\n`;
    csv += `FREQUENT LATE ARRIVALS\nStudent Name,Student ID,Late Count\n${analyticsData.frequentLate?.map(s => `${s.name},${s.id},${s.count}`).join('\n') || ''}\n\n`;
    csv += `PREDICTIVE RISK ANALYSIS\nStudent Name,Student ID,Risk Level,Reason,Absence Rate (%),Late Rate (%),Full Absences,Half Days\n${analyticsData.riskStudents?.map(s => `${s.name},${s.id},${s.riskLevel},${s.reason},${s.absenceRate},${s.lateRate},${s.absent},${s.halfday || 0}`).join('\n') || ''}\n\n`;
    csv += `MOST LATES & ABSENCES (COMBINED)\nStudent Name,Student ID,Lates,Absences,Half Days,Total\n${analyticsData.combinedLatesAbsences?.map(s => `${s.name},${s.student_id_text},${s.lates},${s.absences},${s.halfday || 0},${s.total}`).join('\n') || ''}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Educare_Analytics_${start}_to_${end}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

function showErrorMessage(msg) {
    const containers = ['combinedListContainer', 'criticalListContainer', 'lateListContainer', 'riskListContainer'];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<div class="text-center text-red-500 py-4 italic">${escapeHtml(msg)}</div>`;
    });
    const avgEl = document.getElementById('avgAttendanceRate');
    if (avgEl) avgEl.innerText = '0%';
}

function resetButton(btn) {
    btn.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4"></i>';
    lucide?.createIcons();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== CLASS ATTENDANCE TABLE (OPTIMIZED) ==========

async function loadClassAttendanceTableFast(dateStart, dateEnd) {
    const tbody = document.getElementById('classAttendanceTableBody');
    if (!tbody) return null;

    try {
        // 1. Fetch all classes
        const { data: classes } = await supabase
            .from('classes')
            .select('id, grade_level, strand')
            .order('grade_level');
        if (!classes?.length) return [];

        // 2. Fetch all students (id + class_id)
        const { data: students } = await supabase
            .from('students')
            .select('id, class_id');
        if (!students?.length) return [];

        // Build student -> class map (use strings for keys)
        const studentClassMap = {};
        students.forEach(s => {
            if (s.class_id) studentClassMap[String(s.id)] = Number(s.class_id);
        });

        // 3. Fetch ALL attendance logs using pagination
        let allLogs = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data: logs, error } = await supabase
                .from('attendance_logs')
                .select('student_id, status, morning_absent, afternoon_absent')
                .gte('log_date', dateStart)
                .lte('log_date', dateEnd)
                .range(from, from + pageSize - 1);

            if (error) throw error;
            if (!logs || logs.length === 0) break;

            allLogs = allLogs.concat(logs);
            from += pageSize;
            hasMore = logs.length === pageSize;
        }

        console.log(`[Class Attendance] Total logs fetched (paginated): ${allLogs.length}`);

        // 4. Aggregate per class
        const classStats = {};
        classes.forEach(c => {
            classStats[c.id] = { present: 0, late: 0, absent: 0, excused: 0, halfDay: 0, total: 0 };
        });

        allLogs.forEach(log => {
            const classId = studentClassMap[String(log.student_id)];
            if (classId && classStats[classId]) {
                const stats = classStats[classId];
                
                // Check for half day (morning OR afternoon absent, but not both)
                const morningAbsent = log.morning_absent === true;
                const afternoonAbsent = log.afternoon_absent === true;
                const isFullDayAbsent = morningAbsent && afternoonAbsent;
                const isHalfDay = (morningAbsent || afternoonAbsent) && !isFullDayAbsent;
                
                // Count half day separately, only count present/late for actual present time
                if (isHalfDay) {
                    stats.halfDay++;
                    stats.present += 0.5; // Half day counts as 0.5 present
                    stats.total++; // Still counts as a day's attendance record
                } else if (isFullDayAbsent) {
                    stats.absent++;
                    stats.total++;
                } else {
                    // Regular status
                    const status = log.status;
                    if (status === 'Present') stats.present++;
                    else if (status === 'Late') stats.late++;
                    else if (status === 'Absent') stats.absent++;
                    else if (status === 'Excused') stats.excused++;
                    else if (status === 'Half Day') stats.halfDay++;
                    stats.total++;
                }
            }
        });

        // 5. Build result
        const classData = classes.map(c => {
            const stats = classStats[c.id];
            const total = stats.total;
            return {
                id: c.id,
                name: [c.grade_level, c.strand].filter(Boolean).join(' '),
                gradeLevel: c.grade_level || '',
                presentRate: total > 0 ? Math.round((stats.present / total) * 100) : 0,
                lateRate: total > 0 ? Math.round((stats.late / total) * 100) : 0,
                absentRate: total > 0 ? Math.round((stats.absent / total) * 100) : 0,
                excusedRate: total > 0 ? Math.round((stats.excused / total) * 100) : 0,
                halfDayCount: stats.halfDay
            };
        });

        console.log('[Class Attendance] Final data:', classData.map(c => `${c.name}: ${c.presentRate}%`));
        return classData;
    } catch (err) {
        console.error('loadClassAttendanceTableFast error:', err);
        return null;
    }
}

function updateClassAttendanceTable(classData) {
    const tbody = document.getElementById('classAttendanceTableBody');
    if (!tbody) return;

    if (!classData || classData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400 italic">No classes found</td></tr>';
        return;
    }

    tbody.innerHTML = classData.map(c => {
        const rating = getOverallRating(c.presentRate);
        const ratingColor = rating === 'Excellent' ? 'text-green-600' : rating === 'Good' ? 'text-blue-600' : rating === 'Fair' ? 'text-amber-600' : 'text-red-600';
        
        return `
            <tr onclick="openIndividualClassAttendanceModal(${c.id}, '${c.name.replace(/'/g, "\\'")}')" class="border-b border-gray-100 hover:bg-indigo-50 cursor-pointer transition-all">
                <td class="py-3 px-4 font-bold text-gray-700">${escapeHtml(c.name)}</td>
                <td class="py-3 px-4 text-center font-black text-green-600">${c.presentRate}%</td>
                <td class="py-3 px-4 text-center font-bold text-amber-600">${c.lateRate}%</td>
                <td class="py-3 px-4 text-center font-bold text-red-600">${c.absentRate}%</td>
                <td class="py-3 px-4 text-center font-bold text-blue-600">${c.excusedRate}%</td>
                <td class="py-3 px-4 text-center font-bold text-gray-600">${c.halfDayCount}</td>
                <td class="py-3 px-4 text-center font-bold ${ratingColor}">${rating}</td>
            </tr>
        `;
    }).join('');

    lucide?.createIcons();
}

// Legacy function kept for individual modal refresh (can be removed if not needed)
async function loadClassAttendanceTable(dateStart, dateEnd) {
    const tbody = document.getElementById('classAttendanceTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400 italic">Loading class attendance data...</td></tr>';

    try {
        const { data: classes, error: classesError } = await supabase
            .from('classes')
            .select('id, grade_level, strand')
            .order('grade_level')
            .order('strand');

        if (classesError) throw classesError;
        if (!classes || classes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400 italic">No classes found</td></tr>';
            return;
        }

        const classDataPromises = classes.map(async (c) => {
            const className = [c.grade_level, c.strand].filter(Boolean).join(' ');
            const stats = await calculateClassAttendanceStats(c.id, dateStart, dateEnd);
            return { id: c.id, name: className, ...stats };
        });

        const classData = await Promise.all(classDataPromises);

        tbody.innerHTML = classData.map(c => {
            const rating = getOverallRating(c.presentRate);
            const ratingColor = rating === 'Excellent' ? 'text-green-600' : rating === 'Good' ? 'text-blue-600' : rating === 'Fair' ? 'text-amber-600' : 'text-red-600';
            
            return `
                <tr onclick="openIndividualClassAttendanceModal(${c.id}, '${c.name.replace(/'/g, "\\'")}')" class="border-b border-gray-100 hover:bg-indigo-50 cursor-pointer transition-all">
                    <td class="py-3 px-4 font-bold text-gray-700">${escapeHtml(c.name)}</td>
                    <td class="py-3 px-4 text-center font-black text-green-600">${c.presentRate}%</td>
                    <td class="py-3 px-4 text-center font-bold text-amber-600">${c.lateRate}%</td>
                    <td class="py-3 px-4 text-center font-bold text-red-600">${c.absentRate}%</td>
                    <td class="py-3 px-4 text-center font-bold text-blue-600">${c.excusedRate}%</td>
                    <td class="py-3 px-4 text-center font-bold text-gray-600">${c.halfDayCount}</td>
                    <td class="py-3 px-4 text-center font-bold ${ratingColor}">${rating}</td>
                </tr>
            `;
        }).join('');

        lucide?.createIcons();
    } catch (err) {
        console.error('loadClassAttendanceTable error:', err);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500 italic">Error loading data</td></tr>';
    }
}

async function calculateClassAttendanceStats(classId, dateStart, dateEnd) {
    try {
        const { data: students } = await supabase
            .from('students')
            .select('id')
            .eq('class_id', classId)
            .eq('status', 'Enrolled');

        if (!students || students.length === 0) {
            return { presentRate: 0, lateRate: 0, absentRate: 0, excusedRate: 0, halfDayCount: 0, totalDays: 0 };
        }

        const studentIds = students.map(s => s.id);
        const totalDays = studentIds.length;

        const { data: logs } = await supabase
            .from('attendance_logs')
            .select('student_id, status, morning_absent, afternoon_absent')
            .in('student_id', studentIds)
            .gte('log_date', dateStart)
            .lte('log_date', dateEnd)
            .is('subject_load_id', null);

        if (!logs || logs.length === 0) {
            return { presentRate: 0, lateRate: 0, absentRate: 0, excusedRate: 0, halfDayCount: 0, totalDays: 0 };
        }

        let present = 0, late = 0, absent = 0, excused = 0, halfDay = 0;

        logs.forEach(log => {
            const status = log.status;
            if (status === 'Present') present++;
            else if (status === 'Late') late++;
            else if (status === 'Absent') absent++;
            else if (status === 'Excused') excused++;
            else if (status === 'Half Day') halfDay++;
        });

        const totalRecords = present + late + absent + excused + halfDay;
        if (totalRecords === 0) {
            return { presentRate: 0, lateRate: 0, absentRate: 0, excusedRate: 0, halfDayCount: 0, totalDays };
        }

        return {
            presentRate: Math.round((present / totalRecords) * 100),
            lateRate: Math.round((late / totalRecords) * 100),
            absentRate: Math.round((absent / totalRecords) * 100),
            excusedRate: Math.round((excused / totalRecords) * 100),
            halfDayCount: halfDay,
            totalDays
        };
    } catch (err) {
        console.error('calculateClassAttendanceStats error:', err);
        return { presentRate: 0, lateRate: 0, absentRate: 0, excusedRate: 0, halfDayCount: 0, totalDays: 0 };
    }
}

function getOverallRating(presentRate) {
    if (presentRate >= 90) return 'Excellent';
    if (presentRate >= 80) return 'Good';
    if (presentRate >= 70) return 'Fair';
    return 'Needs Improvement';
}

function openIndividualClassAttendanceModal(classId, className) {
    currentSelectedClassId = classId;
    currentSelectedClassName = className;
    
    document.getElementById('individualClassAttendanceTitle').textContent = `${className} - Attendance`;
    
    const dateStart = document.getElementById('dateStart')?.value || '2025-08-01';
    const dateEnd = document.getElementById('dateEnd')?.value || '2026-04-08';
    
    document.getElementById('individualAttendanceStartDate').value = dateStart;
    document.getElementById('individualAttendanceEndDate').value = dateEnd;
    
    document.getElementById('individualClassAttendanceModal').classList.remove('hidden');
    lucide?.createIcons();
    
    loadIndividualClassAttendance(classId, dateStart, dateEnd);
}

function closeIndividualClassAttendanceModal() {
    document.getElementById('individualClassAttendanceModal').classList.add('hidden');
    currentSelectedClassId = null;
    currentSelectedClassName = '';
}

async function loadIndividualClassAttendance(classId, dateStart, dateEnd) {
    const tbody = document.getElementById('individualAttendanceTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400 italic">Loading student attendance data...</td></tr>';

    try {
        // Fetch all students in class (filter status in JS to avoid RLS issues)
        const { data: students, error: studentsError } = await supabase
            .from('students')
            .select('id, full_name')
            .eq('class_id', classId)
            .order('full_name');

        if (studentsError) {
            console.error('Students query error:', studentsError);
            throw studentsError;
        }
        if (!students || students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400 italic">No students in this class</td></tr>';
            return;
        }

        // Filter to only enrolled students in JS
        const enrolledStudents = students.filter(s => s.full_name && s.full_name.trim() !== '');
        
        if (enrolledStudents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400 italic">No enrolled students in this class</td></tr>';
            return;
        }

        const studentIds = enrolledStudents.map(s => s.id);

        // Fetch all attendance logs for these students in one query
        const { data: logs, error: logsError } = await supabase
            .from('attendance_logs')
            .select('student_id, status, morning_absent, afternoon_absent')
            .in('student_id', studentIds)
            .gte('log_date', dateStart)
            .lte('log_date', dateEnd)
            .is('subject_load_id', null);

        if (logsError) throw logsError;

        // Group logs by student_id
        const logsByStudent = {};
        if (logs) {
            logs.forEach(log => {
                if (!logsByStudent[log.student_id]) logsByStudent[log.student_id] = [];
                logsByStudent[log.student_id].push(log);
            });
        }

        // Calculate stats for each student
        const studentData = students.map(s => {
            const studentLogs = logsByStudent[s.id] || [];
            let present = 0, late = 0, absent = 0, excused = 0, halfDay = 0;

            studentLogs.forEach(log => {
                const morningAbsent = log.morning_absent === true;
                const afternoonAbsent = log.afternoon_absent === true;
                const isFullDayAbsent = morningAbsent && afternoonAbsent;
                const isHalfDay = (morningAbsent !== afternoonAbsent && !isFullDayAbsent) || log.status === 'Half Day';
                
                if (isHalfDay) {
                    halfDay++;
                    present += 0.5; // Half day counts as 0.5 present
                } else if (isFullDayAbsent) {
                    absent++;
                } else if (log.status === 'Present' || log.status === 'On Time') {
                    present++;
                } else if (log.status === 'Late') {
                    late++;
                } else if (log.status === 'Absent') {
                    absent++;
                } else if (log.status === 'Excused') {
                    excused++;
                } else if (log.status === 'Half Day') {
                    halfDay++;
                    present += 0.5;
                }
            });

            return { ...s, present, late, absent, excused, halfDay };
        });

        tbody.innerHTML = studentData.map(s => {
            const total = s.present + s.late + s.absent + s.excused + s.halfDay;
            const attendanceRate = total > 0 ? Math.round(((s.present + s.late) / total) * 100) : 0;
            const rateColor = attendanceRate >= 90 ? 'text-green-600' : attendanceRate >= 80 ? 'text-blue-600' : attendanceRate >= 70 ? 'text-amber-600' : 'text-red-600';
            
            return `
                <tr onclick="openStudentInfoModal(${s.id})" class="border-b border-gray-100 hover:bg-indigo-50 cursor-pointer transition-all">
                    <td class="py-3 px-4 font-bold text-gray-700">${escapeHtml(s.full_name)}</td>
                    <td class="py-3 px-4 text-center font-black text-green-600">${Math.round(s.present)}</td>
                    <td class="py-3 px-4 text-center font-bold text-amber-600">${s.late}</td>
                    <td class="py-3 px-4 text-center font-bold text-red-600">${s.absent}</td>
                    <td class="py-3 px-4 text-center font-bold text-blue-600">${s.excused}</td>
                    <td class="py-3 px-4 text-center font-bold text-gray-600">${s.halfDay}</td>
                    <td class="py-3 px-4 text-center font-black ${rateColor}">${attendanceRate}%</td>
                </tr>
            `;
        }).join('');

        lucide?.createIcons();
    } catch (err) {
        console.error('loadIndividualClassAttendance error:', err);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500 italic">Error loading data</td></tr>';
    }
}

async function calculateStudentAttendanceStats(studentId, dateStart, dateEnd) {
    try {
        const { data: logs } = await supabase
            .from('attendance_logs')
            .select('student_id, status, morning_absent, afternoon_absent')
            .eq('student_id', studentId)
            .gte('log_date', dateStart)
            .lte('log_date', dateEnd)
            .is('subject_load_id', null);

        let present = 0, late = 0, absent = 0, excused = 0, halfDay = 0;

        if (logs) {
            logs.forEach(log => {
                const status = log.status;
                if (status === 'Present') present++;
                else if (status === 'Late') late++;
                else if (status === 'Absent') absent++;
                else if (status === 'Excused') excused++;
                else if (status === 'Half Day') halfDay++;
            });
        }

        return { present, late, absent, excused, halfDay };
    } catch (err) {
        console.error('calculateStudentAttendanceStats error:', err);
        return { present: 0, late: 0, absent: 0, excused: 0, halfDay: 0 };
    }
}

async function refreshIndividualClassAttendance() {
    if (!currentSelectedClassId) return;
    
    const dateStart = document.getElementById('individualAttendanceStartDate')?.value;
    const dateEnd = document.getElementById('individualAttendanceEndDate')?.value;
    
    if (!dateStart || !dateEnd) {
        alert('Please select a date range');
        return;
    }
    
    await loadIndividualClassAttendance(currentSelectedClassId, dateStart, dateEnd);
}

function getOverallRating(presentRate) {
    if (presentRate >= 90) return 'Excellent';
    if (presentRate >= 80) return 'Good';
    if (presentRate >= 70) return 'Fair';
    return 'Needs Improvement';
}

async function exportClassAttendanceCSV() {
    try {
        const dateStart = document.getElementById('dateStart')?.value || SCHOOL_YEAR_START;
        const dateEnd = document.getElementById('dateEnd')?.value || SCHOOL_YEAR_END;
        
        const classData = await loadClassAttendanceTableFast(dateStart, dateEnd);
        if (!classData || classData.length === 0) {
            alert('No class attendance data to export');
            return;
        }

        const csvContent = 'Class Name,Present %,Late %,Absent %,Excused %,Half Day,Overall Rating\n' +
            classData.map(c => {
                const rating = getOverallRating(c.presentRate);
                return `${c.name},${c.presentRate},${c.lateRate},${c.absentRate},${c.excusedRate},${c.halfDayCount},${rating}`;
            }).join('\n');

        downloadCSV(csvContent, `class-attendance-${dateStart}-to-${dateEnd}.csv`);
    } catch (err) {
        console.error('exportClassAttendanceCSV error:', err);
        alert('Failed to export CSV');
    }
}

async function exportFilteredClassCSV() {
    try {
        const dateStart = document.getElementById('dateStart')?.value || SCHOOL_YEAR_START;
        const dateEnd = document.getElementById('dateEnd')?.value || SCHOOL_YEAR_END;
        const classFilter = document.getElementById('class-filter')?.value;

        if (!classFilter) {
            alert('Please select a class to export');
            return;
        }

        const { data: classInfo } = await supabase
            .from('classes')
            .select('id, grade_level, strand')
            .eq('id', classFilter)
            .single();

        if (!classInfo) {
            alert('Class not found');
            return;
        }

        const className = [classInfo.grade_level, classInfo.strand].filter(Boolean).join(' ');
        
        const { data: students } = await supabase
            .from('students')
            .select('id, full_name, student_number')
            .eq('class_id', classFilter)
            .eq('status', 'Enrolled');

        if (!students || students.length === 0) {
            alert('No students found for this class');
            return;
        }

        const studentIds = students.map(s => s.id);
        const CHUNK_SIZE = 800;
        const chunks = [];
        for (let i = 0; i < studentIds.length; i += CHUNK_SIZE) {
            chunks.push(studentIds.slice(i, i + CHUNK_SIZE));
        }

        let allLogs = [];
        for (const chunk of chunks) {
            const { data: logs } = await supabase
                .from('attendance_logs')
                .select('student_id, status')
                .in('student_id', chunk)
                .gte('log_date', dateStart)
                .lte('log_date', dateEnd);
            if (logs) allLogs = allLogs.concat(logs);
        }

        const logsByStudent = {};
        allLogs.forEach(log => {
            if (!logsByStudent[log.student_id]) logsByStudent[log.student_id] = [];
            logsByStudent[log.student_id].push(log.status);
        });

        const csvRows = [['Student Name', 'Student ID', 'Present', 'Late', 'Absent', 'Excused', 'Half Day', 'Attendance %']];
        
        students.forEach(student => {
            const statuses = logsByStudent[student.id] || [];
            let present = 0, late = 0, absent = 0, excused = 0, halfDay = 0;
            statuses.forEach(status => {
                if (status === 'Present') present++;
                else if (status === 'Late') late++;
                else if (status === 'Absent') absent++;
                else if (status === 'Excused') excused++;
                else if (status === 'Half Day') halfDay++;
            });
            const total = present + late + absent + excused + halfDay;
            const attendanceRate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
            
            csvRows.push([
                student.full_name,
                student.student_number || '',
                present,
                late,
                absent,
                excused,
                halfDay,
                attendanceRate + '%'
            ]);
        });

        const csvContent = csvRows.map(row => row.join(',')).join('\n');
        downloadCSV(csvContent, `class-${className.replace(/\s+/g, '-')}-attendance.csv`);
    } catch (err) {
        console.error('exportFilteredClassCSV error:', err);
        alert('Failed to export CSV');
    }
}

function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

async function exportIndividualClassCSV() {
    const classId = currentSelectedClassId;
    const dateStart = document.getElementById('individualAttendanceStartDate')?.value;
    const dateEnd = document.getElementById('individualAttendanceEndDate')?.value;

    if (!classId || !dateStart || !dateEnd) {
        alert('Please ensure class and date range are selected');
        return;
    }

    try {
        // Get class info
        const { data: classData } = await supabase
            .from('classes')
            .select('grade_level, strand')
            .eq('id', classId)
            .single();

        const className = classData ? [classData.grade_level, classData.strand].filter(Boolean).join(' ') : 'Class';

        // Get students
        const { data: students } = await supabase
            .from('students')
            .select('id, full_name')
            .eq('class_id', classId);

        if (!students?.length) {
            alert('No students found');
            return;
        }

        // Get attendance logs with pagination
        let allLogs = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data: logs } = await supabase
                .from('attendance_logs')
                .select('student_id, status, morning_absent, afternoon_absent')
                .in('student_id', students.map(s => s.id))
                .gte('log_date', dateStart)
                .lte('log_date', dateEnd)
                .is('subject_load_id', null)
                .range(from, from + pageSize - 1);

            if (!logs || logs.length === 0) break;
            allLogs = allLogs.concat(logs);
            from += pageSize;
            hasMore = logs.length === pageSize;
        }

        // Group logs by student
        const logsByStudent = {};
        allLogs.forEach(log => {
            if (!logsByStudent[log.student_id]) logsByStudent[log.student_id] = [];
            logsByStudent[log.student_id].push(log);
        });

        // Build CSV
        const csvRows = [['Student Name', 'Present', 'Late', 'Absent', 'Excused', 'Half Day', 'Attendance %']];

        students.forEach(student => {
            const studentLogs = logsByStudent[student.id] || [];
            let present = 0, late = 0, absent = 0, excused = 0, halfDay = 0;

            studentLogs.forEach(log => {
                const morningAbsent = log.morning_absent === true;
                const afternoonAbsent = log.afternoon_absent === true;
                const isFullDayAbsent = morningAbsent && afternoonAbsent;
                const isHalfDay = (morningAbsent !== afternoonAbsent && !isFullDayAbsent) || log.status === 'Half Day';

                if (isHalfDay) {
                    halfDay++;
                    present += 0.5;
                } else if (isFullDayAbsent) {
                    absent++;
                } else if (log.status === 'Present' || log.status === 'On Time') {
                    present++;
                } else if (log.status === 'Late') {
                    late++;
                } else if (log.status === 'Absent') {
                    absent++;
                } else if (log.status === 'Excused') {
                    excused++;
                }
            });

            const total = present + late + absent + excused + halfDay;
            const attendanceRate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

            csvRows.push([
                student.full_name,
                Math.round(present),
                late,
                absent,
                excused,
                halfDay,
                attendanceRate + '%'
            ]);
        });

        const csvContent = csvRows.map(row => row.join(',')).join('\n');
        downloadCSV(csvContent, `class-${className.replace(/\s+/g, '-')}-attendance.csv`);
    } catch (err) {
        console.error('exportIndividualClassCSV error:', err);
        alert('Failed to export CSV');
    }
}

let currentTrendGrouping = 'quarter';
let currentWeekMonth = '';

async function switchTrendGrouping(grouping) {
    currentTrendGrouping = grouping;
    
    // Toggle button styles
    document.getElementById('btnQuarter').className = grouping === 'quarter' 
        ? 'px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-bold' 
        : 'px-3 py-1.5 bg-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-300';
    document.getElementById('btnMonth').className = grouping === 'month' 
        ? 'px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-bold' 
        : 'px-3 py-1.5 bg-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-300';
    document.getElementById('btnWeek').className = grouping === 'week' 
        ? 'px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-bold' 
        : 'px-3 py-1.5 bg-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-300';
    
    // Show/hide week month filter
    const weekMonthFilter = document.getElementById('weekMonthFilter');
    if (grouping === 'week') {
        weekMonthFilter.classList.remove('hidden');
        // Set default to current month or first available
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        weekMonthFilter.value = currentMonth;
        currentWeekMonth = currentMonth;
    } else {
        weekMonthFilter.classList.add('hidden');
        currentWeekMonth = '';
    }
    
    // Show loading overlay on chart
    showTrendChartLoading();
    
    const dateStart = document.getElementById('dateStart')?.value;
    const dateEnd = document.getElementById('dateEnd')?.value;
    const classFilter = document.getElementById('class-filter')?.value || null;
    
    try {
        const trendData = await fetchAttendanceTrend(dateStart, dateEnd, classFilter, currentTrendGrouping, currentWeekMonth);
        updateTrendChart(trendData);
    } finally {
        hideTrendChartLoading();
    }
}

async function handleWeekMonthChange() {
    const weekMonthFilter = document.getElementById('weekMonthFilter');
    currentWeekMonth = weekMonthFilter.value || '';
    
    // Show loading overlay on chart
    showTrendChartLoading();
    
    const dateStart = document.getElementById('dateStart')?.value;
    const dateEnd = document.getElementById('dateEnd')?.value;
    const classFilter = document.getElementById('class-filter')?.value || null;
    
    try {
        const trendData = await fetchAttendanceTrend(dateStart, dateEnd, classFilter, currentTrendGrouping, currentWeekMonth);
        updateTrendChart(trendData);
    } finally {
        hideTrendChartLoading();
    }
}

// Loading overlay functions for trend chart
function showTrendChartLoading() {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    
    // Check if overlay already exists
    let overlay = document.getElementById('trendChartLoading');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'trendChartLoading';
        overlay.className = 'absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg';
        overlay.innerHTML = `
            <div class="flex flex-col items-center">
                <div class="w-8 h-8 border-3 border-violet-200 border-t-violet-600 rounded-full animate-spin mb-2"></div>
                <span class="text-xs font-bold text-violet-600">Loading...</span>
            </div>
        `;
        
        // Get parent container and set position relative
        const container = canvas.parentElement;
        container.style.position = 'relative';
        container.appendChild(overlay);
    }
    overlay.classList.remove('hidden');
}

function hideTrendChartLoading() {
    const overlay = document.getElementById('trendChartLoading');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

// Expose for HTML buttons
window.loadAnalyticsData = loadAnalyticsData;
window.exportToCSV = exportToCSV;
window.openIndividualClassAttendanceModal = openIndividualClassAttendanceModal;
window.closeIndividualClassAttendanceModal = closeIndividualClassAttendanceModal;
window.refreshIndividualClassAttendance = refreshIndividualClassAttendance;
window.exportClassAttendanceCSV = exportClassAttendanceCSV;
window.exportFilteredClassCSV = exportFilteredClassCSV;
window.exportIndividualClassCSV = exportIndividualClassCSV;
window.switchTrendGrouping = switchTrendGrouping;
window.handleWeekMonthChange = handleWeekMonthChange;
window.openStudentInfoModal = openStudentInfoModal;
window.closeStudentInfoModal = closeStudentInfoModal;

// ========== STUDENT INFO MODAL ==========

async function openStudentInfoModal(studentId) {
    const modal = document.getElementById('studentInfoModal');
    const content = document.getElementById('studentInfoContent');
    if (!modal || !content) return;

    modal.classList.remove('hidden');
    content.innerHTML = '<div class="text-center text-gray-400 py-8"><i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto"></i></div>';
    lucide?.createIcons();

    try {
        console.log('Fetching student info for ID:', studentId);
        
        // Fetch student info
        const { data: student, error: studentError } = await supabase
            .from('students')
            .select('*')
            .eq('id', studentId);

        console.log('Student query result:', student, studentError);
        
        if (studentError) {
            content.innerHTML = '<div class="text-center text-red-500 py-8">Error: ' + studentError.message + '</div>';
            return;
        }
        
        if (!student || student.length === 0) {
            content.innerHTML = '<div class="text-center text-red-500 py-8">Student not found</div>';
            return;
        }
        
        const studentData = student[0];

        // Fetch class info
        let classInfo = null;
        if (studentData.class_id) {
            const { data: classData } = await supabase
                .from('classes')
                .select('grade_level, strand')
                .eq('id', studentData.class_id);
            if (classData && classData.length > 0) classInfo = classData[0];
        }

        // Fetch parent info
        let parent = null;
        console.log('Student parent_id:', studentData.parent_id);
        if (studentData.parent_id) {
            const { data: parentData } = await supabase
                .from('parents')
                .select('*')
                .eq('id', studentData.parent_id);
            console.log('Parent query result:', parentData);
            if (parentData && parentData.length > 0) parent = parentData[0];
        }

        const parentDisplay = parent || { full_name: 'N/A', contact_number: 'N/A', relationship_type: 'N/A', address: 'N/A' };

        content.innerHTML = `
            <div class="space-y-4">
                <!-- Student Basic Info -->
                <div class="bg-violet-50 rounded-xl p-4">
                    <h4 class="font-black text-violet-700 text-sm mb-3">STUDENT DETAILS</h4>
                    <div class="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <p class="text-xs text-gray-400 font-bold uppercase">Name</p>
                            <p class="font-bold text-gray-800">${escapeHtml(studentData.full_name || 'N/A')}</p>
                        </div>
                        <div>
                            <p class="text-xs text-gray-400 font-bold uppercase">LRN</p>
                            <p class="font-bold text-gray-800">${escapeHtml(studentData.lrn || 'N/A')}</p>
                        </div>
                        <div>
                            <p class="text-xs text-gray-400 font-bold uppercase">Class</p>
                            <p class="font-bold text-gray-800">${escapeHtml(classInfo?.grade_level || 'N/A')} ${escapeHtml(classInfo?.strand || '')}</p>
                        </div>
                        <div>
                            <p class="text-xs text-gray-400 font-bold uppercase">Gender</p>
                            <p class="font-bold text-gray-800">${escapeHtml(studentData.gender || 'N/A')}</p>
                        </div>
                    </div>
                </div>

                <!-- Parent Info -->
                <div class="bg-amber-50 rounded-xl p-4">
                    <h4 class="font-black text-amber-700 text-sm mb-3">PARENT / GUARDIAN</h4>
                    <div class="space-y-3">
                        <div>
                            <p class="text-xs text-gray-400 font-bold uppercase">Name</p>
                            <p class="font-bold text-gray-800">${escapeHtml(parentDisplay.full_name || 'N/A')}</p>
                        </div>
                        <div>
                            <p class="text-xs text-gray-400 font-bold uppercase">Relationship</p>
                            <p class="font-bold text-gray-800">${escapeHtml(parentDisplay.relationship_type || 'N/A')}</p>
                        </div>
                        <div>
                            <p class="text-xs text-gray-400 font-bold uppercase">Phone Number</p>
                            <p class="font-bold text-amber-600 text-lg">${escapeHtml(parentDisplay.contact_number || 'N/A')}</p>
                        </div>
                        <div>
                            <p class="text-xs text-gray-400 font-bold uppercase">Address</p>
                            <p class="font-bold text-gray-800">${escapeHtml(parentDisplay.address || 'N/A')}</p>
                        </div>
                    </div>
                </div>

                <!-- Quick Actions -->
                <div class="flex gap-2">
                    <a href="tel:${parentDisplay.contact_number || ''}" class="flex-1 bg-green-600 text-white text-center py-2 rounded-xl font-bold text-sm hover:bg-green-700 transition-all">
                        <i data-lucide="phone" class="w-4 h-4 inline mr-1"></i> Call
                    </a>
                    <a href="sms:${parentDisplay.contact_number || ''}" class="flex-1 bg-blue-600 text-white text-center py-2 rounded-xl font-bold text-sm hover:bg-blue-700 transition-all">
                        <i data-lucide="message-circle" class="w-4 h-4 inline mr-1"></i> SMS
                    </a>
                </div>
            </div>
        `;
        lucide?.createIcons();
    } catch (err) {
        console.error('openStudentInfoModal error:', err);
        content.innerHTML = '<div class="text-center text-red-500 py-8">Error loading student details</div>';
    }
}

function closeStudentInfoModal() {
    const modal = document.getElementById('studentInfoModal');
    if (modal) modal.classList.add('hidden');
}