// guard/guard-basic-analytics.js - Guard Analytics Dashboard

// Session check
// currentUser is now global in guard-core.js

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    if (currentUser) {
        // Set guard name in sidebar
        const sidebarName = document.getElementById('guard-name-sidebar');
        if (sidebarName) sidebarName.textContent = currentUser.full_name || 'Guard';
        
        // Set header name
        const headerName = document.getElementById('guard-name');
        if (headerName) headerName.textContent = currentUser.full_name || 'Guard';
    }
    
    // Set current date
    setCurrentDate();
    
    loadTodayStats();
    loadTodayBreakdown();
    loadTopLates();
    loadTopAbsentees();
    loadWeeklyTrend();
});

/**
 * Set current date in sidebar
 */
function setCurrentDate() {
    const now = new Date();
    const dateEl = document.getElementById('current-date');
    const dayEl = document.getElementById('current-day');
    
    if (dateEl) {
        dateEl.textContent = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    }
    if (dayEl) {
        dayEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
}

// ============================================
// Today's Statistics
// ============================================
async function loadTodayStats() {
    // FIX: Timezone-adjusted date for accurate morning analytics
    const localDate = new Date();
    localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
    const today = localDate.toISOString().split('T')[0];
    
    try {
        // Total enrolled students
        const totalResult = await supabase
            .from('students')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'Enrolled');
        
        // Present today (status: On Time, Present, or Excused)
        const presentResult = await supabase
            .from('attendance_logs')
            .select('id', { count: 'exact', head: true })
            .eq('log_date', today)
            .in('status', ['On Time', 'Present', 'Excused']);
        
        // Late today
        const lateResult = await supabase
            .from('attendance_logs')
            .select('id', { count: 'exact', head: true })
            .eq('log_date', today)
            .eq('status', 'Late');
        
        // Explicit Absent today (teachers can mark students as Absent)
        const absentResult = await supabase
            .from('attendance_logs')
            .select('id', { count: 'exact', head: true })
            .eq('log_date', today)
            .eq('status', 'Absent');
        
        // Get count of students who have ANY record today (to calculate unrecorded)
        const recordedResult = await supabase
            .from('attendance_logs')
            .select('student_id', { count: 'exact', head: true })
            .eq('log_date', today);
        
        const totalStudents = totalResult.count || 0;
        const presentCount = presentResult.count || 0;
        const lateCount = lateResult.count || 0;
        const absentCount = absentResult.count || 0;
        const recordedCount = recordedResult.count || 0;
        
        // Unrecorded = total students who haven't been logged at all today
        const unrecordedCount = Math.max(0, totalStudents - recordedCount);
        
        // Update DOM
        const elTotal = document.getElementById('stat-total-students');
        const elPresent = document.getElementById('stat-present');
        const elLate = document.getElementById('stat-late');
        const elAbsent = document.getElementById('stat-absent');
        
        if (elTotal) elTotal.textContent = totalStudents;
        if (elPresent) elPresent.textContent = presentCount;
        if (elLate) elLate.textContent = lateCount;
        if (elAbsent) elAbsent.textContent = absentCount;
        
        console.log('Today stats:', { 
            total: totalStudents, 
            present: presentCount, 
            late: lateCount, 
            absent: absentCount,
            unrecorded: unrecordedCount 
        });
        
    } catch (err) {
        console.error('Error loading stats:', err);
    }
}

// ============================================
// Today's Breakdown Pie Chart
// ============================================
async function loadTodayBreakdown() {
    const canvas = document.getElementById('breakdownPieChart');
    if (!canvas) return;

    // FIX: Timezone-adjusted date for accurate morning analytics
    const localDate = new Date();
    localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
    const today = localDate.toISOString().split('T')[0];
    
    try {
        // Get total enrolled students
        const totalResult = await supabase
            .from('students')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'Enrolled');
        
        // Present today (status: On Time, Present, or Excused)
        const presentResult = await supabase
            .from('attendance_logs')
            .select('id', { count: 'exact', head: true })
            .eq('log_date', today)
            .in('status', ['On Time', 'Present', 'Excused']);
        
        // Late today
        const lateResult = await supabase
            .from('attendance_logs')
            .select('id', { count: 'exact', head: true })
            .eq('log_date', today)
            .eq('status', 'Late');
        
        // Explicit Absent today (teachers can mark students as Absent)
        const absentResult = await supabase
            .from('attendance_logs')
            .select('id', { count: 'exact', head: true })
            .eq('log_date', today)
            .eq('status', 'Absent');
        
        const totalStudents = totalResult.count || 0;
        const presentCount = presentResult.count || 0;
        const lateCount = lateResult.count || 0;
        const absentCount = absentResult.count || 0;
        
        console.log('Today breakdown:', { present: presentCount, late: lateCount, absent: absentCount, total: totalStudents });
        
        renderBreakdownChart(presentCount, lateCount, absentCount);
        
    } catch (err) {
        console.error('Error loading breakdown:', err);
    }
}

function renderBreakdownChart(present, late, absent) {
    const canvas = document.getElementById('breakdownPieChart');
    if (!canvas) return;
    
    // Destroy existing chart if it exists
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
        existingChart.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Present', 'Late', 'Absent'],
            datasets: [{
                data: [present, late, absent],
                backgroundColor: [
                    '#22c55e', // green-500
                    '#eab308', // yellow-500
                    '#ef4444'  // red-500
                ],
                borderColor: [
                    '#15803d', // green-700
                    '#a16207', // yellow-700
                    '#b91c1c'  // red-700
                ],
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#9ca3af',
                        font: {
                            family: 'Inter',
                            size: 12
                        },
                        padding: 20,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: '#1f2937',
                    titleColor: '#fff',
                    bodyColor: '#d1d5db',
                    borderColor: '#374151',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            const total = present + late + absent;
                            const value = context.raw;
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${context.label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            },
            cutout: '60%'
        }
    });
}

// ============================================
// Top Late Students This Week
// ============================================
async function loadTopLates() {
    const container = document.getElementById('top-lates-container');
    if (!container) return;
    
    try {
        // Get Monday of current week
        const d = new Date();
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + (day === 0 ? -6 : 1));
        const weekStart = monday.toISOString().split('T')[0];
        
        console.log('Week start:', weekStart); // Debug log
        
        // First, get all late attendance logs this week
        const logsResult = await supabase
            .from('attendance_logs')
            .select('student_id, log_date, status')
            .eq('status', 'Late')
            .gte('log_date', weekStart);
        
        if (logsResult.error) {
            console.error('Logs query error:', logsResult.error);
            throw logsResult.error;
        }
        
        console.log('Late logs:', logsResult.data); // Debug log
        
        // Get unique student IDs who were late
        const studentIds = [...new Set((logsResult.data || []).map(log => log.student_id))];
        
        if (studentIds.length === 0) {
            renderTopLates([]);
            return;
        }
        
        // Query students table directly for these IDs with class info
        const studentsResult = await supabase
            .from('students')
            .select('id, full_name, student_id_text, classes(id, grade_level, section_name)')
            .in('id', studentIds)
            .eq('status', 'Enrolled');
        
        if (studentsResult.error) {
            console.error('Students query error:', studentsResult.error);
            throw studentsResult.error;
        }
        
        console.log('Students data:', studentsResult.data); // Debug log
        
        // Count lates per student
        const counts = {};
        (logsResult.data || []).forEach(rec => {
            if (rec.student_id) {
                counts[rec.student_id] = (counts[rec.student_id] || 0) + 1;
            }
        });
        
        // Create a map for quick student lookup
        const studentMap = {};
        (studentsResult.data || []).forEach(s => {
            studentMap[s.id] = s;
        });
        
        // Sort and get top 10
        const topLates = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([sid, count]) => {
                const student = studentMap[sid];
                return {
                    id: sid,
                    name: student?.full_name || 'Unknown',
                    studentId: student?.student_id_text || '-',
                    grade: student?.classes?.grade_level || '-',
                    section: student?.classes?.section_name || '-',
                    count: count
                };
            });
        
        console.log('Top lates:', topLates); // Debug log
        renderTopLates(topLates);
        
    } catch (err) {
        console.error('Error loading lates:', err);
        container.innerHTML = '<p class="text-center text-gray-400 py-4">Error loading data</p>';
    }
}

function renderTopLates(list) {
    const container = document.getElementById('top-lates-container');
    if (!container) return;
    
    if (!list || list.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 py-4">No late arrivals this week</p>';
        return;
    }
    
    const badges = ['bg-yellow-500 text-gray-900', 'bg-gray-400 text-gray-900', 'bg-amber-600 text-white'];
    
    container.innerHTML = list.map((s, i) => {
        const badge = badges[i] || badges[2];
        return `
            <div class="flex items-center justify-between p-3 border-b border-gray-200 hover:bg-gray-50 transition-colors">
                <div class="flex items-center gap-3">
                    <span class="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${badge}">${i + 1}</span>
                    <div>
                        <p class="font-medium text-gray-900">${s.name}</p>
                        <p class="text-xs text-gray-500">${s.grade} - ${s.section}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-bold text-yellow-600">${s.count}x</p>
                    <p class="text-xs text-gray-400">late</p>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// Top Absentees This Week
// ============================================
async function loadTopAbsentees() {
    const container = document.getElementById('top-absentees-container');
    if (!container) return;
    
    try {
        // Get Monday of current week
        const d = new Date();
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + (day === 0 ? -6 : 1));
        const weekStart = monday.toISOString().split('T')[0];
        
        console.log('Absences - Week start:', weekStart);
        
        // Get attendance records with Absent status this week
        const absentResult = await supabase
            .from('attendance_logs')
            .select('student_id, log_date, status')
            .eq('status', 'Absent')
            .gte('log_date', weekStart);
        
        if (absentResult.error) {
            console.error('Absent query error:', absentResult.error);
            throw absentResult.error;
        }
        
        console.log('Absent logs:', absentResult.data);
        
        // Count unique absent days per student
        const absentDaysCount = {};
        (absentResult.data || []).forEach(rec => {
            if (!absentDaysCount[rec.student_id]) {
                absentDaysCount[rec.student_id] = new Set();
            }
            absentDaysCount[rec.student_id].add(rec.log_date);
        });
        
        // Get unique student IDs who were absent
        const studentIds = Object.keys(absentDaysCount);
        
        if (studentIds.length === 0) {
            renderTopAbsentees([]);
            return;
        }
        
        // Query students table for these IDs with class info
        const studentsResult = await supabase
            .from('students')
            .select('id, full_name, student_id_text, classes(grade_level, section_name)')
            .in('id', studentIds)
            .eq('status', 'Enrolled');
        
        if (studentsResult.error) {
            console.error('Students query error:', studentsResult.error);
            throw studentsResult.error;
        }
        
        // Create a map for quick student lookup
        const studentMap = {};
        (studentsResult.data || []).forEach(s => {
            studentMap[s.id] = s;
        });
        
        // Build absences list
        const absences = studentIds.map(sid => {
            const student = studentMap[sid];
            return {
                id: sid,
                name: student?.full_name || 'Unknown',
                grade: student?.classes?.grade_level || '-',
                section: student?.classes?.section_name || '-',
                absentDays: absentDaysCount[sid].size
            };
        });
        
        // Sort and get top 10
        const topAbsentees = absences.sort((a, b) => b.absentDays - a.absentDays).slice(0, 10);
        
        console.log('Top absentees:', topAbsentees);
        renderTopAbsentees(topAbsentees);
        
    } catch (err) {
        console.error('Error loading absentees:', err);
        container.innerHTML = '<p class="text-center text-gray-400 py-4">Error loading data</p>';
    }
}

function renderTopAbsentees(list) {
    const container = document.getElementById('top-absentees-container');
    if (!container) return;
    
    if (!list || list.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-4">No significant absences this week</p>';
        return;
    }
    
    const badges = ['bg-red-100 text-red-800', 'bg-orange-100 text-orange-800', 'bg-red-50 text-red-600'];
    
    container.innerHTML = list.map((s, i) => {
        const badge = badges[i] || badges[2];
        const risk = s.absentDays >= 3 ? '🔴 High Risk' : s.absentDays >= 2 ? '🟡 Moderate' : '🟢 Low';
        return `
            <div class="flex items-center justify-between p-3 border-b border-gray-200 hover:bg-gray-50 transition-colors">
                <div class="flex items-center gap-3">
                    <span class="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${badge}">${i + 1}</span>
                    <div>
                        <p class="font-medium text-gray-900">${s.name}</p>
                        <p class="text-xs text-gray-500">${s.grade} - ${s.section}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-bold text-red-600">${s.absentDays}x</p>
                    <p class="text-xs text-gray-400">absent</p>
                    <p class="text-xs ${s.absentDays >= 3 ? 'text-red-600 font-bold' : 'text-gray-500'}">${risk}</p>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// Weekly Attendance Trend
// ============================================
async function loadWeeklyTrend() {
    const container = document.getElementById('weekly-trend-container');
    const legendContainer = document.getElementById('trend-legend');
    if (!container) return;
    
    try {
        const weekData = [];
        
        // FIX: Timezone-adjusted date for accurate analytics
        const localNow = new Date();
        localNow.setMinutes(localNow.getMinutes() - localNow.getTimezoneOffset());
        const today = new Date(localNow);
        
        // Get last 7 days
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            // Use local date directly without ISO conversion
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            const dayName = d.toLocaleDateString('en-PH', { weekday: 'short' });
            
            // Query for all "present" statuses: On Time, Present, Excused
            const presentRes = await supabase
                .from('attendance_logs')
                .select('id', { count: 'exact', head: true })
                .eq('log_date', dateStr)
                .in('status', ['On Time', 'Present', 'Excused']);
            
            // Query for late
            const lateRes = await supabase
                .from('attendance_logs')
                .select('id', { count: 'exact', head: true })
                .eq('log_date', dateStr)
                .eq('status', 'Late');
            
            // Query for absent
            const absentRes = await supabase
                .from('attendance_logs')
                .select('id', { count: 'exact', head: true })
                .eq('log_date', dateStr)
                .eq('status', 'Absent');
            
            weekData.push({
                day: dayName,
                date: dateStr,
                present: presentRes.count || 0,
                late: lateRes.count || 0,
                absent: absentRes.count || 0
            });
        }
        
        // Render
        const maxVal = Math.max(...weekData.map(d => d.present + d.late + d.absent), 1);
        
        // FIX: Use timezone-adjusted date for today comparison
        const todayObj = new Date();
        todayObj.setMinutes(todayObj.getMinutes() - todayObj.getTimezoneOffset());
        const todayYear = todayObj.getFullYear();
        const todayMonth = String(todayObj.getMonth() + 1).padStart(2, '0');
        const todayDay = String(todayObj.getDate()).padStart(2, '0');
        const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;
        
        container.innerHTML = weekData.map(d => {
            const total = d.present + d.late + d.absent;
            const pPct = (d.present / maxVal) * 100;
            const lPct = (d.late / maxVal) * 100;
            const aPct = (d.absent / maxVal) * 100;
            const isToday = d.date === todayStr;
            const bgClass = isToday ? 'bg-blue-50 border-blue-200' : '';
            
            return `
                <div class="flex items-center gap-2 p-2 rounded ${bgClass}">
                    <span class="w-8 text-xs text-gray-400 font-medium">${d.day}</span>
                    <div class="flex-1">
                        <div class="flex h-4 rounded overflow-hidden bg-gray-700">
                            <div class="bg-green-500" title="Present: ${d.present}" style="width: ${pPct}%"></div>
                            <div class="bg-yellow-500" title="Late: ${d.late}" style="width: ${lPct}%"></div>
                            <div class="bg-red-500" title="Absent: ${d.absent}" style="width: ${aPct}%"></div>
                        </div>
                    </div>
                    <span class="w-12 text-xs text-gray-400 text-right">${total}</span>
                </div>
            `;
        }).join('');
        
        if (legendContainer) {
            legendContainer.innerHTML = `
                <div class="flex items-center gap-4 text-xs">
                    <span class="flex items-center gap-1">
                        <span class="w-3 h-3 bg-green-500 rounded"></span> Present
                    </span>
                    <span class="flex items-center gap-1">
                        <span class="w-3 h-3 bg-yellow-500 rounded"></span> Late
                    </span>
                    <span class="flex items-center gap-1">
                        <span class="w-3 h-3 bg-red-500 rounded"></span> Absent
                    </span>
                </div>
            `;
        }
        
    } catch (err) {
        console.error('Error loading trend:', err);
        container.innerHTML = '<p class="text-center text-gray-500 py-4">Error loading trend</p>';
    }
}
