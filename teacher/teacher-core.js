// teacher-core.js - Teacher Module Core Logic (FULLY FIXED)

const DEBUG = true;

var currentUser = checkSession('teachers');
var currentTeacher = null;

// ============================================================================
// HOLIDAY/WEEKEND CHECK FUNCTIONS
// ============================================================================

function isWeekend(dateStr) {
    const day = new Date(dateStr).getDay();
    return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

async function checkIsHoliday(dateStr) {
    try {
        const { data, error } = await supabase
            .from('holidays')
            .select('holiday_date, is_suspended, description')
            .eq('holiday_date', dateStr)
            .single();
        
        if (data && data.is_suspended) {
            return { 
                isHoliday: true, 
                isSuspended: true, 
                description: data.description
            };
        }
        return { isHoliday: false, isSuspended: false, description: null };
    } catch (e) {
        return { isHoliday: false, isSuspended: false, description: null };
    }
}

async function isSchoolDay(dateStr) {
    const weekendCheck = isWeekend(dateStr);
    const holidayCheck = await checkIsHoliday(dateStr);
    return !weekendCheck && !holidayCheck.isSuspended;
}

async function getSchoolDayInfo(dateStr) {
    const weekend = isWeekend(dateStr);
    const holiday = await checkIsHoliday(dateStr);
    
    if (weekend) {
        return { isSchoolDay: false, reason: weekend ? 'Weekend' : null };
    }
    if (holiday.isHoliday) {
        return { isSchoolDay: false, reason: holiday.description || 'Holiday/Suspended' };
    }
    return { isSchoolDay: true, reason: null };
}

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    if (currentUser) {
        await fetchTeacherData();
        updateUserDisplay();
    }
});

async function fetchTeacherData() {
    try {
        const { data, error } = await supabase
            .from('teachers')
            .select('*')
            .eq('id', currentUser.id)
            .single();
        
        if (error) {
            console.error('Error fetching teacher:', error);
            return;
        }
        
        currentTeacher = data;
    } catch (err) {
        console.error('Error in fetchTeacherData:', err);
    }
}

function updateUserDisplay() {
    const nameEl = document.getElementById('teacher-name');
    if (nameEl && currentTeacher) {
        const now = new Date();
        const day = now.getDay();
        const hour = now.getHours();
        
        let greeting;
        if (day === 0) greeting = 'Happy Sunday';
        else if (day === 6) greeting = 'Happy Saturday';
        else if (hour < 12) greeting = 'Good Morning';
        else if (hour < 18) greeting = 'Good Afternoon';
        else greeting = 'Good Evening';
        
        nameEl.innerText = `${greeting}, ${currentTeacher.full_name.split(' ')[0]}`;
    }
    
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl && currentTeacher) {
        const initials = getInitials(currentTeacher.full_name);
        avatarEl.innerText = initials;
    }
}

// ============================================================================
// DASHBOARD STATS (FIXED - Holiday/Weekend Aware)
// ============================================================================

async function loadLiveDashboardStats() {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Check if today is a school day
        const schoolDayInfo = await getSchoolDayInfo(today);
        
        // If not a school day, show appropriate message
        if (!schoolDayInfo.isSchoolDay) {
            const statsContainer = document.getElementById('stats-container');
            const presentEl = document.getElementById('present-count');
            const lateEl = document.getElementById('late-count');
            
            if (presentEl) {
                if (schoolDayInfo.reason === 'Weekend') {
                    presentEl.innerText = '—';
                    if (lateEl) lateEl.innerText = '—';
                } else {
                    presentEl.innerText = '—';
                    if (lateEl) lateEl.innerText = '—';
                }
            }
            
            // Hide attendance stats and show message
            if (statsContainer) {
                statsContainer.setAttribute('data-school-day', 'false');
                statsContainer.setAttribute('data-reason', schoolDayInfo.reason || '');
            }
            
            // Update clinic and excuse counts (these still apply)
            await loadClinicCount();
            await loadExcuseCount();
            return;
        }

        // It's a school day - show normal attendance stats
        const { data: homeroom } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();

        if (!homeroom) {
            setStatsToZero();
            return;
        }

        const { data: students } = await supabase
            .from('students')
            .select('id')
            .eq('class_id', homeroom.id)
            .eq('status', 'Enrolled');
        const studentIds = students?.map(s => s.id) || [];

        if (studentIds.length === 0) {
            setStatsToZero();
            return;
        }

        // Present = On Time OR Late
        const { count: presentCount } = await supabase
            .from('attendance_logs')
            .select('id', { count: 'exact', head: true })
            .in('student_id', studentIds)
            .eq('log_date', today)
            .in('status', ['On Time', 'Late']);

        const { count: lateCount } = await supabase
            .from('attendance_logs')
            .select('id', { count: 'exact', head: true })
            .in('student_id', studentIds)
            .eq('log_date', today)
            .eq('status', 'Late');

        document.getElementById('present-count').innerText = presentCount || 0;
        document.getElementById('late-count').innerText = lateCount || 0;
        
        // Load clinic and excuse counts
        await loadClinicCount();
        await loadExcuseCount();

    } catch (err) {
        console.error('Error in loadLiveDashboardStats:', err);
        setStatsToZero();
    }
}

async function loadClinicCount() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const { count: clinicCount } = await supabase
            .from('clinic_visits')
            .select('id', { count: 'exact', head: true })
            .eq('referred_by_teacher_id', currentUser.id)
            .gte('time_in', today + 'T00:00:00')
            .not('status', 'in', '("Completed","Dismissed")');
        
        const clinicEl = document.getElementById('clinic-count');
        if (clinicEl) clinicEl.innerText = clinicCount || 0;
    } catch (err) {
        console.error('Error loading clinic count:', err);
    }
}

async function loadExcuseCount() {
    try {
        const { data: homeroom } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();
        
        if (!homeroom) return;
        
        const { data: students } = await supabase
            .from('students')
            .select('id')
            .eq('class_id', homeroom.id)
            .eq('status', 'Enrolled');
        const studentIds = students?.map(s => s.id) || [];
        
        if (studentIds.length === 0) return;
        
        const { count: excuseCount } = await supabase
            .from('excuse_letters')
            .select('id', { count: 'exact', head: true })
            .in('student_id', studentIds)
            .eq('status', 'Pending');
        
        const excuseEl = document.getElementById('excuse-count');
        if (excuseEl) excuseEl.innerText = excuseCount || 0;
    } catch (err) {
        console.error('Error loading excuse count:', err);
    }
}

function setStatsToZero() {
    const ids = ['present-count', 'late-count', 'clinic-count', 'excuse-count'];
    ids.forEach(id => { if(document.getElementById(id)) document.getElementById(id).innerText = '0'; });
}

async function loadDashboardHomeroomData() {
    try {
        const { data: homeroom } = await supabase
            .from('classes')
            .select('id, grade_level, department')
            .eq('adviser_id', currentUser.id)
            .single();
        
        const homeroomSection = document.getElementById('homeroom-section');
        const noHomeroomMsg = document.getElementById('no-homeroom-message');
        
        if (!homeroom) {
            if (homeroomSection) homeroomSection.classList.add('hidden');
            if (noHomeroomMsg) noHomeroomMsg.classList.remove('hidden');
            return;
        }
        
        if (homeroomSection) homeroomSection.classList.remove('hidden');
        if (noHomeroomMsg) noHomeroomMsg.classList.add('hidden');
        
        const today = new Date().toISOString().split('T')[0];
        
        // Check if today is a school day
        const schoolDayInfo = await getSchoolDayInfo(today);
        
        const presentList = document.getElementById('present-list');
        const absentList = document.getElementById('absent-list');
        
        if (!schoolDayInfo.isSchoolDay) {
            // Show appropriate message for non-school days
            const message = schoolDayInfo.reason === 'Weekend' 
                ? '<p class="text-gray-500 text-center py-4">No school on weekends.</p>' 
                : `<p class="text-gray-500 text-center py-4">School suspended: ${schoolDayInfo.reason || 'Holiday'}</p>`;
            
            if (presentList) presentList.innerHTML = message;
            if (absentList) absentList.innerHTML = message;
            return;
        }
        
        // It's a school day - load normal data
        await loadPresentList(homeroom.id, today);
        await loadAbsentList(homeroom.id, today);
        await loadCriticalAbsences(homeroom.id);
        await loadMostLates(homeroom.id);
        await loadGoodPerformance(homeroom.id);
        await loadLatestAnnouncements();
        await loadPendingExcuses();
        
    } catch (err) {
        console.error('Error in loadDashboardHomeroomData:', err);
    }
}

async function loadPresentList(classId, date) {
    const container = document.getElementById('present-list');
    if (!container) return;
    
    try {
        const { data: students } = await supabase
            .from('students')
            .select('id, full_name')
            .eq('class_id', classId)
            .eq('status', 'Enrolled');
        
        const studentIds = students?.map(s => s.id) || [];
        if (studentIds.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No students in homeroom.</p>';
            return;
        }
        
        const { data: logs } = await supabase
            .from('attendance_logs')
            .select('student_id, status')
            .in('student_id', studentIds)
            .eq('log_date', date)
            .in('status', ['On Time', 'Late']);
        
        if (!logs || logs.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No present students today.</p>';
            return;
        }
        
        const studentMap = {};
        for (const s of students) studentMap[s.id] = s;
        
        let html = '';
        logs.forEach(log => {
            const student = studentMap[log.student_id];
            const name = student?.full_name || 'Unknown';
            const initials = getInitials(name);
            html += `<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-bold text-xs">${initials}</div>
                <span class="text-sm font-medium text-gray-700">${escapeHtml(name)}</span>
                <span class="ml-auto text-xs ${log.status === 'Late' ? 'text-amber-600' : 'text-green-600'}">${log.status === 'On Time' ? 'Present' : 'Late'}</span>
            </div>`;
        });
        container.innerHTML = html;
    } catch (err) {
        console.error('Error in loadPresentList:', err);
        container.innerHTML = '<p class="text-gray-500 text-sm">Error loading data.</p>';
    }
}

async function loadAbsentList(classId, date) {
    const container = document.getElementById('absent-list');
    if (!container) return;
    
    try {
        const { data: students } = await supabase
            .from('students')
            .select('id, full_name')
            .eq('class_id', classId)
            .eq('status', 'Enrolled');
        
        const studentIds = students?.map(s => s.id) || [];
        const studentMap = {};
        for (const s of students) studentMap[s.id] = s;
        
        if (studentIds.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No students in homeroom.</p>';
            return;
        }
        
        const { data: logs } = await supabase
            .from('attendance_logs')
            .select('student_id')
            .in('student_id', studentIds)
            .eq('log_date', date);
        
        const loggedStudentIds = new Set((logs || []).map(l => l.student_id));
        const absentStudentIds = studentIds.filter(id => !loggedStudentIds.has(id));
        
        if (absentStudentIds.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No absences today.</p>';
            return;
        }
        
        let html = '';
        absentStudentIds.forEach(studentId => {
            const student = studentMap[studentId];
            const name = student?.full_name || 'Unknown';
            const initials = getInitials(name);
            html += `<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                <div class="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-bold text-xs">${initials}</div>
                <span class="text-sm font-medium text-gray-700">${escapeHtml(name)}</span>
            </div>`;
        });
        container.innerHTML = html;
    } catch (err) {
        console.error('Error in loadAbsentList:', err);
        container.innerHTML = '<p class="text-gray-500 text-sm">Error loading data.</p>';
    }
}

async function loadCriticalAbsences(classId) {
    const container = document.getElementById('critical-absences-list');
    if (!container) return;
    
    try {
        // Get students in class
        const { data: students } = await supabase
            .from('students')
            .select('id, full_name')
            .eq('class_id', classId)
            .eq('status', 'Enrolled');
        
        if (!students || students.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No students found.</p>';
            return;
        }
        
        // Get full year date range (January 1 to today)
        const currentYear = new Date().getFullYear();
        const yearStart = `${currentYear}-01-01`;
        const today = new Date().toISOString().split('T')[0];
        
        console.log('[CriticalAbsences] Checking year:', currentYear, 'Range:', yearStart, 'to', today);
        
        // Fetch all holidays for the year to exclude suspended days
        const { data: holidays } = await supabase
            .from('holidays')
            .select('holiday_date')
            .gte('holiday_date', yearStart)
            .lte('holiday_date', today);
        const holidaySet = new Set(holidays?.map(h => h.holiday_date) || []);
        
        // Count absences for each student (whole year)
        const studentAbsences = [];
        
        for (const student of students) {
            // Get all attendance logs - include both status AND half-day fields
            const { data: logs } = await supabase
                .from('attendance_logs')
                .select('id, log_date, status, morning_absent, afternoon_absent')
                .eq('student_id', student.id)
                .gte('log_date', yearStart)
                .lte('log_date', today);
            
            // Count ALL absences - status field OR half-day fields
            let absenceCount = 0;
            for (const log of logs || []) {
                // Skip weekends
                const logDate = new Date(log.log_date);
                const dayOfWeek = logDate.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const isHoliday = holidaySet.has(log.log_date);
                
                if (isWeekend || isHoliday) continue;
                
                const morningAbsent = !!log.morning_absent;
                const afternoonAbsent = !!log.afternoon_absent;
                const statusAbsent = log.status === 'Absent' || log.status === 'Excused';
                
                // Count full day (status = Absent/Excused OR both half-days)
                if (statusAbsent || (morningAbsent && afternoonAbsent)) {
                    absenceCount++;
                }
                // Count half day (one half true, one false)
                else if (morningAbsent || afternoonAbsent) {
                    absenceCount += 0.5;
                }
            }
            
            // Round to nearest whole number
            absenceCount = Math.round(absenceCount);
            
            console.log('[CriticalAbsences] Student:', student.full_name, 'Absences:', absenceCount);
            
            // Alert threshold: 10+ absences in a school year
            if (absenceCount >= 10) {
                studentAbsences.push({
                    id: student.id,
                    full_name: student.full_name,
                    count: absenceCount
                });
            }
        }
        
        // Sort by absence count descending
        studentAbsences.sort((a, b) => b.count - a.count);
        
        let html = '';
        if (studentAbsences.length === 0) {
            html = '<p class="text-gray-500 text-sm">No critical absences (10+ in school year).</p>';
        } else {
            for (const student of studentAbsences) {
                const initials = getInitials(student.full_name);
                html += `<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                    <div class="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-bold text-xs">${initials}</div>
                    <div>
                        <p class="text-sm font-medium text-gray-700">${escapeHtml(student.full_name)}</p>
                        <p class="text-xs text-red-600 font-semibold">${student.count} absences (${currentYear})</p>
                    </div>
                </div>`;
            }
        }
        
        container.innerHTML = html;
    } catch (err) {
        console.error('Error in loadCriticalAbsences:', err);
        container.innerHTML = '<p class="text-gray-500 text-sm">Error loading data.</p>';
    }
}

async function loadMostLates(classId) {
    const container = document.getElementById('most-lates-list');
    if (!container) return;
    
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dateStr = thirtyDaysAgo.toISOString().split('T')[0];
        
        const { data: students } = await supabase
            .from('students')
            .select('id, full_name')
            .eq('class_id', classId)
            .eq('status', 'Enrolled');
        
        const studentMap = {};
        for (const s of students || []) studentMap[s.id] = s;
        const studentIds = students?.map(s => s.id) || [];
        
        if (studentIds.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No students in homeroom.</p>';
            return;
        }
        
        const { data: logs } = await supabase
            .from('attendance_logs')
            .select('student_id')
            .in('student_id', studentIds)
            .eq('status', 'Late')
            .gte('log_date', dateStr);
        
        const lateCounts = {};
        (logs || []).forEach(record => {
            const sid = record.student_id;
            const student = studentMap[sid];
            const name = student?.full_name || 'Unknown';
            if (!lateCounts[sid]) lateCounts[sid] = { name, count: 0 };
            lateCounts[sid].count++;
        });
        
        const sorted = Object.values(lateCounts).sort((a, b) => b.count - a.count).slice(0, 5);
        
        if (sorted.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No late records.</p>';
            return;
        }
        
        let html = '';
        sorted.forEach(item => {
            const initials = getInitials(item.name);
            html += `<div class="flex items-center gap-3 p-2 rounded-lg">
                <div class="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold text-xs">${initials}</div>
                <div>
                    <p class="text-sm font-medium text-gray-700">${escapeHtml(item.name)}</p>
                    <p class="text-xs text-orange-600">${item.count} lates (30 days)</p>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch (err) {
        console.error('Error in loadMostLates:', err);
        container.innerHTML = '<p class="text-gray-500 text-sm">Error loading data.</p>';
    }
}

async function loadGoodPerformance(classId) {
    const container = document.getElementById('good-performance-list');
    if (!container) return;
    
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dateStr = thirtyDaysAgo.toISOString().split('T')[0];
        
        const { data: students } = await supabase
            .from('students')
            .select('id, full_name')
            .eq('class_id', classId)
            .eq('status', 'Enrolled');
        
        let html = '';
        for (const student of students || []) {
            const { count: absentCount } = await supabase
                .from('attendance_logs')
                .select('id', { count: 'exact', head: true })
                .eq('student_id', student.id)
                .eq('status', 'Absent')
                .gte('log_date', dateStr);
            
            const { count: lateCount } = await supabase
                .from('attendance_logs')
                .select('id', { count: 'exact', head: true })
                .eq('student_id', student.id)
                .eq('status', 'Late')
                .gte('log_date', dateStr);
            
            if ((absentCount || 0) === 0 && (lateCount || 0) === 0) {
                const initials = getInitials(student.full_name);
                html += `<div class="flex items-center gap-3 p-2 rounded-lg">
                    <div class="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 font-bold text-xs">${initials}</div>
                    <span class="text-sm font-medium text-gray-700">${escapeHtml(student.full_name)}</span>
                </div>`;
            }
        }
        
        if (!html) html = '<p class="text-gray-500 text-sm">No perfect attendance records.</p>';
        container.innerHTML = html;
    } catch (err) {
        console.error('Error in loadGoodPerformance:', err);
        container.innerHTML = '<p class="text-gray-500 text-sm">Error loading data.</p>';
    }
}

async function loadLatestAnnouncements() {
    const container = document.getElementById('latest-announcements-list');
    if (!container) return;
    
    try {
        const { data } = await supabase
            .from('announcements')
            .select('*')
            .eq('target_teachers', true)
            .order('created_at', { ascending: false })
            .limit(5);
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No announcements.</p>';
            return;
        }
        
        let html = '';
        data.forEach(item => {
            const date = new Date(item.created_at).toLocaleDateString();
            html += `<div class="p-3 bg-blue-50 rounded-lg">
                <p class="font-medium text-gray-800 text-sm">${escapeHtml(item.title)}</p>
                <p class="text-xs text-gray-500 mt-1">${escapeHtml(item.content || '').substring(0, 100)}...</p>
                <p class="text-xs text-gray-400 mt-2">${date}</p>
            </div>`;
        });
        container.innerHTML = html;
    } catch (err) {
        console.error('Error in loadLatestAnnouncements:', err);
        container.innerHTML = '<p class="text-gray-500 text-sm">Error loading announcements.</p>';
    }
}

async function loadPendingExcuses() {
    const container = document.getElementById('pending-excuses-list');
    if (!container) return;
    
    try {
        const { data: homeroom } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();
        
        if (!homeroom) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No homeroom class assigned.</p>';
            return;
        }
        
        const { data: students } = await supabase
            .from('students')
            .select('id')
            .eq('class_id', homeroom.id);
        const studentIds = students?.map(s => s.id) || [];
        
        if (studentIds.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No students in homeroom.</p>';
            return;
        }
        
        const { data } = await supabase
            .from('excuse_letters')
            .select(`
                id,
                created_at,
                students:student_id (full_name)
            `)
            .in('student_id', studentIds)
            .eq('status', 'Pending')
            .order('created_at', { ascending: false })
            .limit(5);
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No pending excuse letters.</p>';
            return;
        }
        
        let html = '';
        data.forEach(item => {
            const date = new Date(item.created_at).toLocaleDateString();
            const studentName = item.students?.full_name || 'Unknown';
            html += `<div class="p-3 bg-yellow-50 rounded-lg flex items-center justify-between">
                <div>
                    <p class="font-medium text-gray-800 text-sm">${escapeHtml(studentName)}</p>
                    <p class="text-xs text-gray-500">${date}</p>
                </div>
                <a href="teacher-excuse-letter-approval.html" class="text-xs text-blue-600 hover:underline">Review</a>
            </div>`;
        });
        container.innerHTML = html;
    } catch (err) {
        console.error('Error in loadPendingExcuses:', err);
        container.innerHTML = '<p class="text-gray-500 text-sm">Error loading excuses.</p>';
    }
}

function startRealTimeStats() {
    setInterval(async () => {
        const homeroomSection = document.getElementById('homeroom-section');
        if (homeroomSection && !homeroomSection.classList.contains('hidden')) {
            await loadLiveDashboardStats();
        }
    }, 30000);
}

// ============================================================================
// CLINIC PASS FUNCTIONS (FIXED)
// ============================================================================

async function loadClinicPassInterface() {
    const container = document.getElementById('recent-clinic-passes');
    if (!container) return;

    const today = new Date().toISOString().split('T')[0];

    try {
        const { data: passes, error } = await supabase
            .from('clinic_visits')
            .select(`
                id,
                time_in,
                status,
                reason,
                students:student_id (full_name)
            `)
            .eq('referred_by_teacher_id', currentUser.id)
            .gte('time_in', today + 'T00:00:00')
            .order('time_in', { ascending: false });

        if (error) throw error;

        const todayCount = passes?.length || 0;
        const activeCount = passes?.filter(p => p.status !== 'Completed' && p.status !== 'Dismissed').length || 0;
        const completedCount = passes?.filter(p => p.status === 'Completed' || p.status === 'Dismissed').length || 0;

        const todayPassesEl = document.getElementById('today-passes');
        const activePassesEl = document.getElementById('active-passes');
        const completedPassesEl = document.getElementById('completed-passes');
        if (todayPassesEl) todayPassesEl.innerText = todayCount;
        if (activePassesEl) activePassesEl.innerText = activeCount;
        if (completedPassesEl) completedPassesEl.innerText = completedCount;

        if (!passes || passes.length === 0) {
            container.innerHTML = `<div class="text-center py-8 text-gray-500">No clinic passes issued today.</div>`;
            return;
        }

        let html = '';
        passes.forEach(pass => {
            const studentName = pass.students?.full_name || 'Unknown';
            const initials = getInitials(studentName);
            const time = new Date(pass.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
            let statusColor = 'bg-yellow-100 text-yellow-700';
            if (pass.status === 'Completed' || pass.status === 'Dismissed') statusColor = 'bg-green-100 text-green-700';
            if (pass.status === 'In Clinic') statusColor = 'bg-red-100 text-red-700';

            html += `
                <div class="p-4 bg-gray-50 rounded-xl border">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center font-bold text-sm">${initials}</div>
                            <div>
                                <p class="font-semibold text-gray-800">${escapeHtml(studentName)}</p>
                                <p class="text-xs text-gray-500">${time}</p>
                            </div>
                        </div>
                        <span class="px-3 py-1 rounded-full text-xs font-bold ${statusColor}">${pass.status || 'Pending'}</span>
                    </div>
                    <p class="text-sm text-gray-600">${escapeHtml(pass.reason || 'No reason provided')}</p>
                </div>
            `;
        });
        container.innerHTML = html;
        if (window.lucide) lucide.createIcons();

        await loadStudentsForClinic();

    } catch (err) {
        console.error('Error loading clinic passes:', err);
        container.innerHTML = '<p class="text-center text-gray-400 py-4">Error loading clinic passes.</p>';
    }
}

async function loadStudentsForClinic() {
    const selectEl = document.getElementById('clinic-student-select');
    if (!selectEl) return;

    try {
        const { data: homeroom } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();

        let students;
        if (homeroom) {
            const { data: hrStudents } = await supabase
                .from('students')
                .select('id, full_name')
                .eq('class_id', homeroom.id)
                .eq('status', 'Enrolled')
                .order('full_name');
            students = hrStudents;
        } else {
            const { data: allStudents } = await supabase
                .from('students')
                .select('id, full_name')
                .eq('status', 'Enrolled')
                .order('full_name')
                .limit(100);
            students = allStudents;
        }

        if (!students || students.length === 0) {
            selectEl.innerHTML = '<option value="">No students found</option>';
            return;
        }

        selectEl.innerHTML = '<option value="">Select a student</option>' +
            students.map(s => `<option value="${s.id}">${escapeHtml(s.full_name)}</option>`).join('');

    } catch (err) {
        console.error('Error loading students:', err);
        selectEl.innerHTML = '<option value="">Error loading students</option>';
    }
}

async function issueClinicPass() {
    const selectEl = document.getElementById('clinic-student-select');
    const reasonEl = document.getElementById('clinic-reason');
    const sendNotificationEl = document.getElementById('send-notification');

    const studentId = selectEl?.value;
    const reason = reasonEl?.value?.trim();
    const sendNotification = sendNotificationEl?.checked ?? true;

    if (!studentId) {
        showToast('Please select a student', 'error');
        return;
    }
    if (!reason) {
        showToast('Please provide a reason for the clinic visit', 'error');
        return;
    }

    try {
        const { data, error } = await supabase
            .from('clinic_visits')
            .insert({
                student_id: studentId,
                referred_by_teacher_id: currentUser.id,
                reason: reason,
                status: 'Pending',
                time_in: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        showToast('Clinic pass issued successfully!', 'success');

        selectEl.value = '';
        const searchInput = document.getElementById('clinic-student-search');
        if (searchInput) searchInput.value = '';
        reasonEl.value = '';
        const clearBtn = document.getElementById('clear-search-btn');
        if (clearBtn) clearBtn.classList.add('hidden');

        if (typeof loadClinicPassInterface === 'function') loadClinicPassInterface();

    } catch (err) {
        console.error('Error issuing clinic pass:', err);
        showToast('Failed to issue clinic pass', 'error');
    }
}

// ============================================================================
// EXCUSE LETTER APPROVAL FUNCTIONS (FIXED)
// ============================================================================

let currentExcuseFilter = 'pending';

async function loadExcuseLetters(filter = 'pending') {
    currentExcuseFilter = filter;
    const container = document.getElementById('excuse-letter-list');
    if (!container) return;

    try {
        const { data: homeroom } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();

        let studentIds = [];
        if (homeroom) {
            const { data: hrStudents } = await supabase
                .from('students')
                .select('id')
                .eq('class_id', homeroom.id);
            studentIds = hrStudents?.map(s => s.id) || [];
        }

        if (studentIds.length === 0) {
            container.innerHTML = `<div class="text-center py-12 text-gray-500">No homeroom class assigned.</div>`;
            return;
        }

        const { data: letters, error } = await supabase
            .from('excuse_letters')
            .select(`
                id,
                reason,
                date_absent,
                status,
                created_at,
                students:student_id (full_name, student_id_text),
                parents:parent_id (full_name, contact_number)
            `)
            .in('student_id', studentIds)
            .ilike('status', filter)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!letters || letters.length === 0) {
            container.innerHTML = `<div class="text-center py-12 text-gray-500">No ${filter} excuse letters.</div>`;
            return;
        }

        let html = '';
        letters.forEach(letter => {
            const studentName = letter.students?.full_name || 'Unknown';
            const initials = getInitials(studentName);
            const date = new Date(letter.created_at).toLocaleDateString();
            let statusBadge = 'bg-yellow-100 text-yellow-700';
            if (filter === 'approved') statusBadge = 'bg-green-100 text-green-700';
            if (filter === 'rejected') statusBadge = 'bg-red-100 text-red-700';

            html += `
                <div class="bg-white rounded-3xl p-6 border shadow-sm cursor-pointer hover:shadow-md transition"
                     onclick="viewExcuseLetterDetail('${letter.id}')">
                    <div class="flex items-start justify-between">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-bold">${initials}</div>
                            <div>
                                <p class="font-semibold text-gray-800">${escapeHtml(studentName)}</p>
                                <p class="text-sm text-gray-500">Absent: ${letter.date_absent || 'N/A'}</p>
                            </div>
                        </div>
                        <span class="px-3 py-1 rounded-full text-xs font-bold ${statusBadge}">${letter.status}</span>
                    </div>
                    <p class="mt-3 text-sm text-gray-600 line-clamp-2">${escapeHtml(letter.reason || '')}</p>
                    <p class="mt-2 text-xs text-gray-400">Submitted: ${date}</p>
                </div>
            `;
        });
        container.innerHTML = html;
        if (window.lucide) lucide.createIcons();

    } catch (err) {
        console.error('Error loading excuse letters:', err);
        container.innerHTML = '<p class="text-center text-gray-400 py-4">Error loading excuse letters.</p>';
    }
}

async function loadExcuseLetterStats() {
    try {
        const { data: homeroom } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();

        let studentIds = [];
        if (homeroom) {
            const { data: hrStudents } = await supabase
                .from('students')
                .select('id')
                .eq('class_id', homeroom.id);
            studentIds = hrStudents?.map(s => s.id) || [];
        }

        if (studentIds.length === 0) {
            document.getElementById('pending-count').textContent = '0';
            document.getElementById('approved-count').textContent = '0';
            document.getElementById('rejected-count').textContent = '0';
            return;
        }

        const { data: letters, error } = await supabase
            .from('excuse_letters')
            .select('status')
            .in('student_id', studentIds);

        if (error) throw error;

        let pending = 0, approved = 0, rejected = 0;
        (letters || []).forEach(l => {
            const st = l.status.toLowerCase();
            if (st === 'pending') pending++;
            else if (st === 'approved') approved++;
            else if (st === 'rejected') rejected++;
        });

        document.getElementById('pending-count').textContent = pending;
        document.getElementById('approved-count').textContent = approved;
        document.getElementById('rejected-count').textContent = rejected;
    } catch (err) {
        console.error('Error loading excuse letter stats:', err);
    }
}

async function viewExcuseLetterDetail(letterId) {
    try {
        const { data: letter, error } = await supabase
            .from('excuse_letters')
            .select(`
                *,
                students:student_id (full_name, student_id_text, lrn),
                parents:parent_id (full_name, contact_number)
            `)
            .eq('id', letterId)
            .single();

        if (error) throw error;

        const modal = document.getElementById('detail-modal');
        const content = document.getElementById('modal-content');
        const actions = document.getElementById('modal-actions');

        const studentName = letter.students?.full_name || 'Unknown';
        const initials = getInitials(studentName);

        content.innerHTML = `
            <div class="flex items-center gap-4 mb-6">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-bold text-xl">${initials}</div>
                <div>
                    <p class="font-bold text-xl text-gray-800">${escapeHtml(studentName)}</p>
                    <p class="text-gray-500">ID: ${escapeHtml(letter.students?.student_id_text || 'N/A')}</p>
                </div>
            </div>
            <div class="space-y-4">
                <div>
                    <p class="text-sm font-bold text-gray-400 uppercase">Reason</p>
                    <p class="text-gray-700">${escapeHtml(letter.reason || 'No reason provided')}</p>
                </div>
                <div>
                    <p class="text-sm font-bold text-gray-400 uppercase">Date Absent</p>
                    <p class="text-gray-700">${letter.date_absent || 'Not specified'}</p>
                </div>
                <div>
                    <p class="text-sm font-bold text-gray-400 uppercase">Parent Contact</p>
                    <p class="text-gray-700">${escapeHtml(letter.parents?.full_name || 'N/A')} - ${escapeHtml(letter.parents?.contact_number || 'N/A')}</p>
                </div>
                <div>
                    <p class="text-sm font-bold text-gray-400 uppercase">Submitted</p>
                    <p class="text-gray-700">${new Date(letter.created_at).toLocaleString()}</p>
                </div>
                ${letter.image_proof_url ? `
                <div>
                    <p class="text-sm font-bold text-gray-400 uppercase">Proof</p>
                    <a href="${letter.image_proof_url}" target="_blank" class="text-blue-600 hover:underline">View Image</a>
                </div>
                ` : ''}
            </div>
        `;

        if (letter.status.toLowerCase() === 'pending') {
            actions.innerHTML = `
                <button onclick="rejectExcuseLetter('${letterId}')" class="px-6 py-3 bg-red-100 text-red-700 rounded-xl font-bold hover:bg-red-200 transition-all">Reject</button>
                <button onclick="approveExcuseLetter('${letterId}')" class="px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all">Approve</button>
            `;
        } else {
            actions.innerHTML = `<button onclick="closeDetailModal()" class="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all">Close</button>`;
        }

        modal?.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();

    } catch (err) {
        console.error('Error loading excuse letter detail:', err);
        showToast('Error loading details', 'error');
    }
}

async function approveExcuseLetter(letterId) {
    try {
        // First, get the excuse letter details for updating attendance
        const { data: letter, error: fetchError } = await supabase
            .from('excuse_letters')
            .select('*, students:student_id(id, full_name), parents:parent_id(id, full_name)')
            .eq('id', letterId)
            .single();
        
        if (fetchError) throw fetchError;
        
        const { error } = await supabase
            .from('excuse_letters')
            .update({ status: 'Approved', updated_at: new Date().toISOString() })
            .eq('id', letterId);

        if (error) throw error;

        // FIX: Update attendance log to mark student as excused for that date
        if (letter?.student_id && letter?.date_absent) {
            const dateAbsent = new Date(letter.date_absent).toISOString().split('T')[0];
            
            // Check if attendance log exists for that date
            const { data: existingLog } = await supabase
                .from('attendance_logs')
                .select('id')
                .eq('student_id', letter.student_id)
                .eq('log_date', dateAbsent)
                .maybeSingle();
            
            if (existingLog) {
                // Update existing log to Excused
                await supabase
                    .from('attendance_logs')
                    .update({ status: 'Excused', remarks: 'Excused via approved letter' })
                    .eq('id', existingLog.id);
            } else {
                // Create new excused log
                await supabase
                    .from('attendance_logs')
                    .insert({
                        student_id: letter.student_id,
                        log_date: dateAbsent,
                        status: 'Excused',
                        remarks: 'Excused via approved letter'
                    });
            }
            
            // Notify parent about approval
            if (letter.parents?.id) {
                await supabase.from('notifications').insert({
                    recipient_id: letter.parents.id,
                    recipient_role: 'parent',
                    title: 'Excuse Letter Approved',
                    message: `The excuse letter for ${letter.students?.full_name} on ${dateAbsent} has been approved.`,
                    type: 'excuse_approved'
                });
            }
        }

        showToast('Excuse letter approved!', 'success');
        closeDetailModal();
        loadExcuseLetters(currentExcuseFilter);
        loadExcuseLetterStats();

    } catch (err) {
        console.error('Error approving excuse letter:', err);
        showToast('Failed to approve', 'error');
    }
}

async function rejectExcuseLetter(letterId) {
    try {
        const { error } = await supabase
            .from('excuse_letters')
            .update({ status: 'Rejected', updated_at: new Date().toISOString() })
            .eq('id', letterId);

        if (error) throw error;

        showToast('Excuse letter rejected', 'success');
        closeDetailModal();
        loadExcuseLetters(currentExcuseFilter);
        loadExcuseLetterStats();

    } catch (err) {
        console.error('Error rejecting excuse letter:', err);
        showToast('Failed to reject', 'error');
    }
}

function filterLetters(filter) {
    document.querySelectorAll('[id^="tab-"]').forEach(el => {
        el.classList.remove('bg-yellow-100', 'text-yellow-700');
        el.classList.add('text-gray-600', 'hover:bg-gray-100');
    });
    const activeTab = document.getElementById(`tab-${filter}`);
    if (activeTab) {
        activeTab.classList.add('bg-yellow-100', 'text-yellow-700');
        activeTab.classList.remove('text-gray-600', 'hover:bg-gray-100');
    }
    loadExcuseLetters(filter);
}

function closeDetailModal() {
    document.getElementById('detail-modal')?.classList.add('hidden');
}

// ============================================================================
// ANNOUNCEMENT FUNCTIONS
// ============================================================================

async function loadAnnouncementsInterface() {
    const container = document.getElementById('announcements-container');
    if (!container) return;

    try {
        const { data: announcements, error } = await supabase
            .from('announcements')
            .select('*')
            .or('target_teachers.eq.true,target_all.eq.true')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        if (!announcements || announcements.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-8">No announcements.</p>';
            return;
        }

        let html = '';
        announcements.forEach(ann => {
            const date = new Date(ann.created_at).toLocaleDateString();
            const priorityColor = ann.priority === 'urgent' ? 'border-red-500 bg-red-50' : 'border-gray-200';
            html += `
                <div class="bg-white rounded-2xl p-6 border-l-4 ${priorityColor} shadow-sm">
                    <div class="flex items-start justify-between mb-3">
                        <h3 class="font-bold text-lg text-gray-800">${escapeHtml(ann.title)}</h3>
                        ${ann.priority === 'urgent' ? '<span class="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-bold">URGENT</span>' : ''}
                    </div>
                    <p class="text-gray-600 whitespace-pre-wrap">${escapeHtml(ann.content)}</p>
                    <p class="text-xs text-gray-400 mt-3">Posted: ${date}</p>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (err) {
        console.error('Error loading announcements:', err);
        container.innerHTML = '<p class="text-center text-gray-400 py-4">Error loading announcements.</p>';
    }
}

async function postAnnouncement() {
    const titleInput = document.getElementById('announcement-title');
    const contentInput = document.getElementById('announcement-content');
    const prioritySelect = document.getElementById('announcement-priority');

    const title = titleInput?.value?.trim();
    const content = contentInput?.value?.trim();
    const priority = prioritySelect?.value || 'normal';

    if (!title || !content) {
        showToast('Please fill in both title and content', 'error');
        return;
    }

    try {
        const { error } = await supabase
            .from('announcements')
            .insert({
                title: title,
                content: content,
                posted_by_teacher_id: currentUser.id,
                target_teachers: true,
                target_students: true,
                priority: priority,
                type: 'Teacher'
            });

        if (error) throw error;

        showToast('Announcement posted successfully!', 'success');
        titleInput.value = '';
        contentInput.value = '';

        if (typeof loadAnnouncementsInterface === 'function') loadAnnouncementsInterface();

    } catch (err) {
        console.error('Error posting announcement:', err);
        showToast('Failed to post announcement', 'error');
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getInitials(fullName) {
    if (!fullName) return '?';
    const parts = fullName.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatTime12(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHours = h % 12 || 12;
    return `${displayHours}:${minutes} ${ampm}`;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

let toastActive = false;
function showToast(message, type = 'info') {
    if (toastActive) {
        console.log(`[${type}] ${message}`);
        return;
    }
    toastActive = true;
    console.log(`[${type}] ${message}`);
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type} fixed bottom-4 right-4 p-4 rounded shadow-lg z-50`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.remove();
        toastActive = false;
    }, 3000);
}

function closeModal() {
    document.getElementById('success-modal')?.classList.add('hidden');
}

// ============================================================================
// CLINIC SENT HOME APPROVAL (NEW)
// ============================================================================

let clinicApprovalChannel = null;

/**
 * Fetch clinic visits awaiting teacher approval
 * Status: 'Awaiting Teacher Approval' - where this teacher referred the student
 */
async function loadClinicApprovalRequests() {
    try {
        const { data, error } = await supabase
            .from('clinic_visits')
            .select(`
                id,
                status,
                nurse_notes,
                action_taken,
                time_in,
                created_at,
                students:student_id (id, full_name, student_id_text, classes (grade_level, department))
            `)
            .eq('referred_by_teacher_id', currentUser.id)
            .eq('status', 'Awaiting Teacher Approval')
            .order('time_in', { ascending: true });
        
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error loading clinic approval requests:', err);
        return [];
    }
}

/**
 * Display clinic approval requests in the dashboard
 */
async function displayClinicApprovalRequests() {
    const container = document.getElementById('clinic-approval-list');
    const countBadge = document.getElementById('clinic-approval-count');
    const section = document.getElementById('clinic-approval-section');
    const badgeSmall = document.getElementById('clinic-approval-count-small');
    if (!container) return;
    
    const requests = await loadClinicApprovalRequests();
    
    // Show/hide the entire section based on pending requests
    if (section) {
        if (requests.length > 0) {
            section.classList.remove('hidden');
        } else {
            section.classList.add('hidden');
        }
    }
    
    // Update count badges
    if (countBadge) {
        countBadge.textContent = requests.length;
    }
    if (badgeSmall) {
        badgeSmall.textContent = requests.length;
        if (requests.length > 0) {
            badgeSmall.classList.remove('hidden');
        } else {
            badgeSmall.classList.add('hidden');
        }
    }
    
    if (requests.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No pending clinic approvals</p>';
        return;
    }
    
    container.innerHTML = requests.map(req => {
        const studentName = req.students?.full_name || 'Unknown';
        const gradeLevel = req.students?.classes?.grade_level || '';
        const studentId = req.students?.student_id_text || '';
        const initials = getInitials(studentName);
        const time = new Date(req.time_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        
        return `
            <div class="p-4 bg-orange-50 border border-orange-200 rounded-xl mb-3">
                <div class="flex items-start justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold text-sm">${initials}</div>
                        <div>
                            <p class="font-semibold text-gray-800">${escapeHtml(studentName)}</p>
                            <p class="text-xs text-gray-500">${gradeLevel} • ${studentId}</p>
                            <p class="text-xs text-gray-400 mt-1">At clinic since: ${time}</p>
                        </div>
                    </div>
                    <span class="px-2 py-1 bg-orange-200 text-orange-700 text-xs rounded-full font-bold">Pending</span>
                </div>
                <div class="mt-3 p-3 bg-white rounded-lg">
                    <p class="text-xs font-bold text-gray-400 uppercase mb-1">Clinic Recommendation</p>
                    <p class="text-sm text-gray-700 font-medium">${escapeHtml(req.action_taken || 'Send Home')}</p>
                    ${req.nurse_notes ? `<p class="text-xs text-gray-500 mt-1"><span class="font-medium">Nurse notes:</span> ${escapeHtml(req.nurse_notes)}</p>` : ''}
                </div>
                <div class="mt-3 flex gap-2">
                    <button onclick="handleClinicApproval(${req.id}, false)" class="flex-1 py-2 px-3 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
                        Stay in Clinic
                    </button>
                    <button onclick="handleClinicApproval(${req.id}, true)" class="flex-1 py-2 px-3 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors">
                        Approve Send Home
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Handle clinic approval decision
 * @param {number} visitId - The clinic visit ID
 * @param {boolean} approved - True to approve (send home), false to disapprove (stay in clinic)
 */
async function handleClinicApproval(visitId, approved) {
    const remarks = approved ? 'Approved send home' : 'Disapproved - student stays in clinic';
    
    try {
        if (approved) {
            // Teacher approved - complete the discharge (send home)
            const { error } = await supabase
                .from('clinic_visits')
                .update({
                    status: 'Completed',
                    time_out: new Date().toISOString(),
                    teacher_approval: true,
                    teacher_remarks: remarks
                })
                .eq('id', visitId);
            
            if (error) throw error;
            
            // Notify parent that student is being sent home
            const { data: visit } = await supabase
                .from('clinic_visits')
                .select('students:student_id(parent_id, full_name)')
                .eq('id', visitId)
                .single();
            
            if (visit?.students?.parent_id) {
                await supabase.from('notifications').insert({
                    recipient_id: visit.students.parent_id,
                    recipient_role: 'parent',
                    title: 'Student Sent Home',
                    message: `${visit.students.full_name} has been sent home from the clinic. Please pick up your child.`,
                    type: 'clinic_discharge'
                });
            }
            
            showToast('Send home approved. Parent notified.', 'success');
        } else {
            // Teacher disapproved - student stays in clinic
            const { error } = await supabase
                .from('clinic_visits')
                .update({
                    status: 'In Clinic',
                    teacher_approval: false,
                    teacher_remarks: remarks
                })
                .eq('id', visitId);
            
            if (error) throw error;
            showToast('Student will remain in clinic.', 'info');
        }
        
        // Refresh the list
        await displayClinicApprovalRequests();
        
        // Update stats if on dashboard
        if (typeof loadLiveDashboardStats === 'function') {
            loadLiveDashboardStats();
        }
        
    } catch (err) {
        console.error('Error handling clinic approval:', err);
        showToast('Failed to process approval', 'error');
    }
}

/**
 * Setup realtime subscription for clinic approval notifications
 */
function setupClinicApprovalRealtime() {
    if (clinicApprovalChannel) {
        supabase.removeChannel(clinicApprovalChannel);
    }
    
    clinicApprovalChannel = supabase
        .channel('clinic-approval-notifications')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${currentUser.id}`
        }, async (payload) => {
            const notif = payload.new;
            if (notif.type === 'clinic_approval_required') {
                // Refresh clinic approval list
                await displayClinicApprovalRequests();
                // Show notification
                showToast(`Clinic Alert: ${notif.title}`, 'warning');
            }
        })
        .subscribe();
}

// ============================================================================
// END CLINIC SENT HOME APPROVAL
// ============================================================================

// Export functions to window
window.loadLiveDashboardStats = loadLiveDashboardStats;
window.loadDashboardHomeroomData = loadDashboardHomeroomData;
window.startRealTimeStats = startRealTimeStats;
window.getInitials = getInitials;
window.escapeHtml = escapeHtml;
window.loadClinicPassInterface = loadClinicPassInterface;
window.issueClinicPass = issueClinicPass;
window.loadExcuseLetters = loadExcuseLetters;
window.viewExcuseLetterDetail = viewExcuseLetterDetail;
window.approveExcuseLetter = approveExcuseLetter;
window.rejectExcuseLetter = rejectExcuseLetter;
window.filterLetters = filterLetters;
window.closeDetailModal = closeDetailModal;
window.loadAnnouncementsInterface = loadAnnouncementsInterface;
window.postAnnouncement = postAnnouncement;
window.closeModal = closeModal;
window.loadExcuseLetterStats = loadExcuseLetterStats;
window.loadClinicApprovalRequests = loadClinicApprovalRequests;
window.displayClinicApprovalRequests = displayClinicApprovalRequests;
window.handleClinicApproval = handleClinicApproval;
window.setupClinicApprovalRealtime = setupClinicApprovalRealtime;

// New exports for weekend/holiday check
window.isWeekend = isWeekend;
window.checkIsHoliday = checkIsHoliday;
window.isSchoolDay = isSchoolDay;
window.getSchoolDayInfo = getSchoolDayInfo;

console.log('[TeacherCore] Teacher core functions loaded (FULLY FIXED)');