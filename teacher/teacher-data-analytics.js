// teacher-data-analytics.js
// Teacher Analytics Dashboard - Per-subject attendance tracking

let pieChart, barChart;
let currentTeacher = null;
let currentClassId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Check session
    currentTeacher = checkSession('teachers');
    if (!currentTeacher) {
        window.location.href = '../index.html';
        return;
    }
    
    // FIX: Timezone-adjusted dates to prevent "yesterday" bug during morning defense
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    // Only set these if the elements exist on the page
    const dateEndEl = document.getElementById('dateEnd');
    const dateStartEl = document.getElementById('dateStart');
    if (dateEndEl) dateEndEl.value = today.toISOString().split('T')[0];
    if (dateStartEl) dateStartEl.value = lastWeek.toISOString().split('T')[0];
    
    // Set teacher name in header
    const teacherNameEl = document.getElementById('teacher-name');
    if(teacherNameEl) teacherNameEl.textContent = currentTeacher.full_name;
    
    // Load teacher's classes
    await loadTeacherClasses();
    
    // Initialize empty charts
    initializeCharts();
    
    // Load initial data if class is selected
    const classSelect = document.getElementById('analytics-class-select');
    if (classSelect && classSelect.value) {
        await updateAnalytics();
    }

    // FIX: Add real-time subscription to keep analytics fresh.
    const analyticsSub = supabase.channel('teacher-analytics-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => updateAnalytics())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'excuse_letters' }, () => updateAnalytics())
        .subscribe();
    
    // Assumes addSubscription is available from teacher-core.js or general-core.js
    if (typeof addSubscription === 'function') addSubscription(analyticsSub);
});

async function loadTeacherClasses() {
    const classSelect = document.getElementById('analytics-class-select');
    
    try {
        // Get homeroom class
        const { data: homeroomClass } = await supabase
            .from('classes')
            .select('id, grade_level, section_name')
            .eq('adviser_id', currentTeacher.id)
            .single();
        
        // Get subject loads
        const { data: subjectLoads } = await supabase
            .from('subject_loads')
            .select('id, subject_name, class_id, classes(grade_level, section_name)')
            .eq('teacher_id', currentTeacher.id);
        
        // Build options - include homeroom class first, then subjects
        let options = '<option value="">Select Class</option>';
        
        // Add homeroom class option
        if (homeroomClass) {
            const homeroomLabel = `${homeroomClass.grade_level}${homeroomClass.section_name ? ' - ' + homeroomClass.section_name : ''} (Homeroom)`;
            options += `<option value="homeroom:${homeroomClass.id}">${homeroomLabel}</option>`;
            currentClassId = homeroomClass.id;
        }
        
        // Add subject classes (unique)
        const uniqueClasses = [];
        subjectLoads?.forEach(sl => {
            if (sl.class_id !== homeroomClass?.id && !uniqueClasses.find(c => c.id === sl.class_id)) {
                uniqueClasses.push({
                    id: sl.class_id,
                    grade_level: sl.classes?.grade_level,
                    section_name: sl.classes?.section_name,
                    subject: sl.subject_name
                });
            }
        });
        
        uniqueClasses.forEach(c => {
            const label = `${c.grade_level}${c.section_name ? ' - ' + c.section_name : ''} (${c.subject})`;
            options += `<option value="subject:${c.id}:${c.subject}">${label}</option>`;
        });
        
        classSelect.innerHTML = options;
        
        // Auto-select homeroom if available
        if (homeroomClass) {
            classSelect.value = `homeroom:${homeroomClass.id}`;
            await updateAnalytics();
        }
        
    } catch (error) {
        console.error("Error loading classes:", error);
    }
}

async function updateAnalytics() {
    const classSelect = document.getElementById('analytics-class-select');
    const value = classSelect.value;
    
    if (!value) return;
    
    const [type, classId] = value.split(':');
    
    // Show loading state
    document.getElementById('present-rate').textContent = '--%';
    document.getElementById('absent-rate').textContent = '--%';
    document.getElementById('late-rate').textContent = '--%';
    document.getElementById('excused-rate').textContent = '--%';
    
    try {
        // Get today's date
        const today = new Date().toISOString().split('T')[0];
        
        // Get students in class
        const { data: students } = await supabase
            .from('students')
            .select('id, full_name')
            .eq('class_id', classId)
            .eq('is_active', true);
        
        if (!students || students.length === 0) {
            updateEmptyState();
            return;
        }
        
        const studentIds = students.map(s => s.id);
        
        // Get today's attendance
        const { data: attendance } = await supabase
            .from('attendance_logs')
            .select('student_id, status, remarks')
            .eq('log_date', today)
            .in('student_id', studentIds);
        
        // Get excused letters for today
        const { data: excuses } = await supabase
            .from('excuse_letters')
            .select('student_id, date_absent, status')
            .in('student_id', studentIds)
            .eq('date_absent', today)
            .eq('status', 'Approved');
        
        const excusedStudentIds = new Set(excuses?.map(e => e.student_id) || []);

        // Calculate stats
        const stats = calculateStats(attendance, excusedStudentIds, students);

        // Update UI
        document.getElementById('present-rate').textContent = stats.presentRate + '%';
        document.getElementById('absent-rate').textContent = stats.absentRate + '%';
        document.getElementById('late-rate').textContent = stats.lateRate + '%';
        document.getElementById('excused-rate').textContent = stats.excusedRate + '%';

        // Update charts
        updatePieChart(stats);
        await updateWeeklyTrend(classId);
        await loadCriticalAbsences(studentIds);

    } catch (error) {
        console.error("Error updating analytics:", error);
    }
}

function calculateStats(attendance, excusedStudentIds, allStudents) {
    let present = 0, absent = 0, late = 0, excused = 0;
    const totalStudents = allStudents.length;

    // Create attendance lookup
    const attendanceMap = {};
    attendance?.forEach(a => {
        attendanceMap[a.student_id] = a;
    });

    // FIX: Iterate over all students in the class, not just those with attendance logs.
    for (const student of allStudents) {
        // Check if excused
        if (excusedStudentIds.has(student.id)) {
            excused++;
            continue;
        }
        
        const record = attendanceMap[student.id];
        if (!record) {
            absent++;
        } else if (record.status === 'Present' || record.status === 'On Time') {
            present++;
        } else if (record.status === 'Late') {
            late++;
        } else {
            absent++;
        }
    }

    return {
        present,
        absent,
        late,
        excused,
        total: totalStudents,
        presentRate: totalStudents > 0 ? Math.round((present / totalStudents) * 100) : 0,
        absentRate: totalStudents > 0 ? Math.round((absent / totalStudents) * 100) : 0,
        lateRate: totalStudents > 0 ? Math.round((late / totalStudents) * 100) : 0,
        excusedRate: totalStudents > 0 ? Math.round((excused / totalStudents) * 100) : 0
    };
}

async function updateWeeklyTrend(classId) {
    const days = [];
    const presentData = [];
    const absentData = [];
    const lateData = [];
    const excusedData = [];
    
    // Get last 7 days
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        
        days.push(dayName);
        
        // Get students
        const { data: students } = await supabase
            .from('students')
            .select('id')
            .eq('class_id', classId);
        
        if (!students || students.length === 0) {
            presentData.push(0);
            absentData.push(0);
            lateData.push(0);
            excusedData.push(0);
            continue;
        }
        
        const studentIds = students.map(s => s.id);
        
        // Get attendance for this day
        const { data: attendance } = await supabase
            .from('attendance_logs')
            .select('student_id, status')
            .eq('log_date', dateStr)
            .in('student_id', studentIds);
        
        // Get excused
        const { data: excuses } = await supabase
            .from('excuse_letters')
            .select('student_id')
            .in('student_id', studentIds)
            .eq('date_absent', dateStr)
            .eq('status', 'Approved');
        
        const excusedIds = new Set(excuses?.map(e => e.student_id) || []);
        
        let p = 0, a = 0, l = 0, e = 0;
        
        attendance?.forEach(record => {
            if (excusedIds.has(record.student_id)) {
                e++;
            } else if (record.status === 'Present' || record.status === 'On Time') {
                p++;
            } else if (record.status === 'Late') {
                l++;
            } else if (record.status === 'Absent') {
                a++;
            }
        });
        
        // Unrecorded = absent
        a += (students.length - (p + a + l + e));
        
        presentData.push(p);
        absentData.push(a);
        lateData.push(l);
        excusedData.push(e);
    }
    
    // Update bar chart
    if (barChart) {
        barChart.data.labels = days;
        barChart.data.datasets[0].data = presentData;
        barChart.data.datasets[1].data = absentData;
        barChart.data.datasets[2].data = lateData;
        barChart.data.datasets[3].data = excusedData;
        barChart.update();
    }
}

async function loadCriticalAbsences(studentIds) {
    const container = document.getElementById('critical-absences-list');
    
    try {
        // Get all attendance for these students
        const { data: allAttendance } = await supabase
            .from('attendance_logs')
            .select('student_id, status, log_date')
            .in('student_id', studentIds);
        
        // Get excused dates
        const { data: allExcuses } = await supabase
            .from('excuse_letters')
            .select('student_id, date_absent')
            .in('student_id', studentIds)
            .eq('status', 'Approved');
        
        const excusedSet = new Set(allExcuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);
        
        // Count absences per student
        const absenceCounts = {};
        allAttendance?.forEach(record => {
            if (record.status === 'Absent' && !excusedSet.has(`${record.student_id}-${record.log_date}`)) {
                absenceCounts[record.student_id] = (absenceCounts[record.student_id] || 0) + 1;
            }
        });
        
        // Get student names
        const { data: students } = await supabase
            .from('students')
            .select('id, full_name')
            .in('id', Object.keys(absenceCounts));
        
        // Filter to >10 absences and sort
        const critical = Object.entries(absenceCounts)
            .filter(([id, count]) => count > 10)
            .map(([id, count]) => {
                const student = students?.find(s => s.id === parseInt(id));
                return { name: student?.full_name || 'Unknown', count };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
        
        if (critical.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-400 py-4 italic">No critical absence cases found</p>';
            return;
        }
        
        container.innerHTML = critical.map(s => `
            <div class="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-xl">
                <div class="flex items-center gap-3">
                    <div class="h-10 w-10 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-bold">
                        ${s.name.charAt(0)}
                    </div>
                    <div>
                        <p class="font-bold text-gray-900 text-sm">${s.name}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-black text-red-600 text-lg">${s.count}</p>
                    <p class="text-[10px] text-gray-400 font-bold uppercase">absences</p>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error("Error loading critical absences:", error);
        container.innerHTML = '<p class="text-center text-gray-400 py-4 italic">Error loading data</p>';
    }
}

function updateEmptyState() {
    document.getElementById('present-rate').textContent = '0%';
    document.getElementById('absent-rate').textContent = '0%';
    document.getElementById('late-rate').textContent = '0%';
    document.getElementById('excused-rate').textContent = '0%';
    document.getElementById('critical-absences-list').innerHTML = '<p class="text-center text-gray-400 py-4 italic">No students in class</p>';
}

function initializeCharts() {
    // Pie Chart
    const pieCtx = document.getElementById('attendancePieChart').getContext('2d');
    pieChart = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
            labels: ['Present', 'Absent', 'Late', 'Excused'],
            datasets: [{
                data: [0, 0, 0, 0],
                backgroundColor: ['#22c55e', '#ef4444', '#eab308', '#3b82f6']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            cutout: '60%'
        }
    });
    
    // Bar Chart
    const barCtx = document.getElementById('monthlyBarChart').getContext('2d');
    barChart = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
                { label: 'Present', data: [], backgroundColor: '#22c55e' },
                { label: 'Absent', data: [], backgroundColor: '#ef4444' },
                { label: 'Late', data: [], backgroundColor: '#eab308' },
                { label: 'Excused', data: [], backgroundColor: '#3b82f6' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true }
            }
        }
    });
}

function updatePieChart(stats) {
    if (pieChart) {
        pieChart.data.datasets[0].data = [
            stats.present,
            stats.absent,
            stats.late,
            stats.excused
        ];
        pieChart.update();
    }
}

function exportToCSV() {
    const classSelect = document.getElementById('analytics-class-select');
    const className = classSelect.options[classSelect.selectedIndex]?.text || 'Class';
    const today = new Date().toISOString().split('T')[0];
    
    let csvContent = `Educare Teacher Analytics Report\n`;
    csvContent += `Class: ${className}\n`;
    csvContent += `Date: ${today}\n\n`;
    
    csvContent += 'SUMMARY\n';
    csvContent += `Present,${document.getElementById('present-rate').textContent}\n`;
    csvContent += `Absent,${document.getElementById('absent-rate').textContent}\n`;
    csvContent += `Late,${document.getElementById('late-rate').textContent}\n`;
    csvContent += `Excused,${document.getElementById('excused-rate').textContent}\n`;
    
    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Teacher_Analytics_${className}_${today}.csv`;
    link.click();
}
