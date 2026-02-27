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
    const today = new Date().toISOString().split('T')[0];
    
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
        
        const totalStudents = totalResult.count || 0;
        const presentCount = presentResult.count || 0;
        const lateCount = lateResult.count || 0;
        const absentCount = totalStudents - (presentCount + lateCount);
        
        // Update DOM
        const elTotal = document.getElementById('stat-total-students');
        const elPresent = document.getElementById('stat-present');
        const elLate = document.getElementById('stat-late');
        const elAbsent = document.getElementById('stat-absent');
        
        if (elTotal) elTotal.textContent = totalStudents;
        if (elPresent) elPresent.textContent = presentCount;
        if (elLate) elLate.textContent = lateCount;
        if (elAbsent) elAbsent.textContent = absentCount > 0 ? absentCount : 0;
        
    } catch (err) {
        console.error('Error loading stats:', err);
    }
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
        const monday = new Date(d.setDate(diff));
        const weekStart = monday.toISOString().split('T')[0];
        
        // Query late arrivals with student info
        const result = await supabase
            .from('attendance_logs')
            .select(`
                student_id,
                students!inner(full_name, student_id_text, classes(grade_level, section_name))
            `)
            .eq('status', 'Late')
            .gte('log_date', weekStart);
        
        if (result.error) throw result.error;
        
        // Count lates per student
        const counts = {};
        (result.data || []).forEach(rec => {
            if (rec.student_id) {
                counts[rec.student_id] = (counts[rec.student_id] || 0) + 1;
            }
        });
        
        // Sort and get top 10
        const topLates = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([sid, count]) => {
                const rec = result.data.find(r => r.student_id === sid);
                const student = rec?.students;
                return {
                    id: sid,
                    name: student?.full_name || 'Unknown',
                    grade: student?.classes?.grade_level || '-',
                    section: student?.classes?.section_name || '-',
                    count: count
                };
            });
        
        renderTopLates(topLates);
        
    } catch (err) {
        console.error('Error loading lates:', err);
        container.innerHTML = '<p class="text-center text-gray-500 py-4">Error loading data</p>';
    }
}

function renderTopLates(list) {
    const container = document.getElementById('top-lates-container');
    if (!container) return;
    
    if (!list || list.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-4">No late arrivals this week</p>';
        return;
    }
    
    const badges = ['bg-yellow-100 text-yellow-800', 'bg-gray-100 text-gray-800', 'bg-orange-100 text-orange-800'];
    
    container.innerHTML = list.map((s, i) => {
        const badge = badges[i] || badges[2];
        return `
            <div class="flex items-center justify-between p-3 border-b">
                <div class="flex items-center gap-3">
                    <span class="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${badge}">${i + 1}</span>
                    <div>
                        <p class="font-medium text-gray-800">${s.name}</p>
                        <p class="text-xs text-gray-500">${s.grade} - ${s.section}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-bold text-yellow-600">${s.count}x</p>
                    <p class="text-xs text-gray-500">late</p>
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
        const monday = new Date(d.setDate(diff));
        const weekStart = monday.toISOString().split('T')[0];
        
        // Get all enrolled students
        const studentsResult = await supabase
            .from('students')
            .select('id, full_name, student_id_text, classes(grade_level, section_name)')
            .eq('status', 'Enrolled');
        
        if (studentsResult.error) throw studentsResult.error;
        
        // Get attendance records this week
        const attendanceResult = await supabase
            .from('attendance_logs')
            .select('student_id, log_date')
            .gte('log_date', weekStart);
        
        if (attendanceResult.error) throw attendanceResult.error;
        
        // Count unique days present per student
        const presentDays = {};
        (attendanceResult.data || []).forEach(rec => {
            if (!presentDays[rec.student_id]) {
                presentDays[rec.student_id] = new Set();
            }
            presentDays[rec.student_id].add(rec.log_date);
        });
        
        // Calculate absences (5 school days)
        const absences = [];
        (studentsResult.data || []).forEach(s => {
            const daysPresent = presentDays[s.id]?.size || 0;
            const absentDays = 5 - daysPresent;
            if (absentDays > 0) {
                absences.push({
                    id: s.id,
                    name: s.full_name,
                    grade: s.classes?.grade_level || '-',
                    section: s.classes?.section_name || '-',
                    absentDays: absentDays
                });
            }
        });
        
        // Sort and get top 10
        const topAbsentees = absences.sort((a, b) => b.absentDays - a.absentDays).slice(0, 10);
        
        renderTopAbsentees(topAbsentees);
        
    } catch (err) {
        console.error('Error loading absentees:', err);
        container.innerHTML = '<p class="text-center text-gray-500 py-4">Error loading data</p>';
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
            <div class="flex items-center justify-between p-3 border-b">
                <div class="flex items-center gap-3">
                    <span class="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${badge}">${i + 1}</span>
                    <div>
                        <p class="font-medium text-gray-800">${s.name}</p>
                        <p class="text-xs text-gray-500">${s.grade} - ${s.section}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-bold text-red-600">${s.absentDays}x</p>
                    <p class="text-xs text-gray-500">absent</p>
                    <p class="text-xs ${s.absentDays >= 3 ? 'text-red-600 font-bold' : 'text-gray-400'}">${risk}</p>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// Weekly Trend
// ============================================
async function loadWeeklyTrend() {
    const container = document.getElementById('weekly-trend-container');
    const legendContainer = document.getElementById('trend-legend');
    if (!container) return;
    
    try {
        const weekData = [];
        const today = new Date();
        
        // Get last 7 days
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const dayName = d.toLocaleDateString('en-PH', { weekday: 'short' });
            
            const presentRes = await supabase
                .from('attendance_logs')
                .select('id', { count: 'exact', head: true })
                .eq('log_date', dateStr)
                .eq('status', 'On Time');
            
            const lateRes = await supabase
                .from('attendance_logs')
                .select('id', { count: 'exact', head: true })
                .eq('log_date', dateStr)
                .eq('status', 'Late');
            
            weekData.push({
                day: dayName,
                date: dateStr,
                present: presentRes.count || 0,
                late: lateRes.count || 0
            });
        }
        
        // Render
        const maxVal = Math.max(...weekData.map(d => d.present + d.late), 1);
        const todayStr = new Date().toISOString().split('T')[0];
        
        container.innerHTML = weekData.map(d => {
            const total = d.present + d.late;
            const pPct = (d.present / maxVal) * 100;
            const lPct = (d.late / maxVal) * 100;
            const isToday = d.date === todayStr;
            const bgClass = isToday ? 'bg-blue-50 border-blue-200' : '';
            
            return `
                <div class="flex items-center gap-2 p-2 rounded ${bgClass}">
                    <span class="w-8 text-xs text-gray-600 font-medium">${d.day}</span>
                    <div class="flex-1">
                        <div class="flex h-4 rounded overflow-hidden bg-gray-100">
                            <div class="bg-green-500" style="width: ${pPct}%"></div>
                            <div class="bg-yellow-500" style="width: ${lPct}%"></div>
                        </div>
                    </div>
                    <span class="w-12 text-xs text-gray-600 text-right">${total}</span>
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
                </div>
            `;
        }
        
    } catch (err) {
        console.error('Error loading trend:', err);
        container.innerHTML = '<p class="text-center text-gray-500 py-4">Error loading trend</p>';
    }
}
