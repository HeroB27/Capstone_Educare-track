// parent/parent-children.js
// Logic for children management and detail view


let childrenData = [];

/**
 * Initialize children page
 */
document.addEventListener('DOMContentLoaded', async () => {
    await loadAllChildren();
});

/**
 * Load all children for the parent
 * UPDATED: Simplified query - extract parentId directly from localStorage
 */
async function loadAllChildren() {
    try {
        // FIX: Explicitly get parentId from localStorage to ensure it's available
        const userStr = localStorage.getItem('educare_user') || sessionStorage.getItem('educare_user');
        if (!userStr) {
            console.error('No user session found in localStorage');
            showEmptyState();
            return;
        }
        
        const user = JSON.parse(userStr);
        const parentId = user.id;
        
        if (DEBUG) console.log('Loading children for parentId:', parentId);
        
        // FIX: Added classes join to get grade_level and department
        // UPDATED: Also fetch class info for display
        const { data: children, error } = await supabase
            .from('students')
            .select('*, classes(grade_level, department)')
            .eq('parent_id', parentId);

        if (error) {
            console.error('Error loading children:', error);
            showEmptyState();
            return;
        }

        childrenData = children || [];
        if (DEBUG) console.log('Children loaded:', childrenData.length);
        
        if (childrenData.length === 0) {
            showEmptyState();
        } else {
            await renderChildrenList();
        }

        document.getElementById('loading-indicator').classList.add('hidden');
        document.getElementById('children-list').classList.remove('hidden');

    } catch (err) {
        console.error('Error in loadAllChildren:', err);
        showEmptyState();
    }
}

/**
 * Show empty state when no children
 */
function showEmptyState() {
    document.getElementById('loading-indicator').classList.add('hidden');
    document.getElementById('empty-state').classList.remove('hidden');
}

/**
 * Render the list of children
 * UPDATED: Phase 4 - Added attendance percentage and quick stats
 */
async function renderChildrenList() {
    const container = document.getElementById('children-list');
    
    // UPDATED: Use Promise.all to fetch all statuses in parallel
    await Promise.all(childrenData.map(async (child) => {
        child.todayStatus = await getChildTodayStatus(child.id);
        child.attendanceStats = await getChildAttendanceStats(child.id);
    }));

    container.innerHTML = childrenData.map((child, index) => {
        if (DEBUG) console.log('[Parent Children] Rendering child:', child.full_name, 'Attendance stats:', child.attendanceStats);
        
        const statusColor = getStatusColor(child.todayStatus);
        const statusText = getStatusText(child.todayStatus);
        const stats = child.attendanceStats || { present: 0, late: 0, absent: 0, percentage: 100 };
        
        if (DEBUG) console.log('[Parent Children] Stats for', child.full_name, ':', JSON.stringify(stats));
        
        // Get percentage color - show actual data
        const percentageColor = stats.percentage >= 90 ? 'text-green-600' : 
                              stats.percentage >= 75 ? 'text-yellow-600' : 'text-red-600';
        
        if (DEBUG) console.log('[Parent Children] Using percentage:', stats.percentage, 'for color:', percentageColor);
        
        // Fallback for missing photos - show initials if no photo
        const avatar = child.profile_photo_url 
            ? `<img src="${child.profile_photo_url}" class="h-14 w-14 rounded-full object-cover">`
            : `<div class="h-14 w-14 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-lg">
                ${getInitials(child.full_name)}
               </div>`;
        
        return `
            <div class="bg-white rounded-xl shadow-md overflow-hidden" onclick="showChildDetail(${index})">
                <div class="p-4">
                    <div class="flex items-center gap-4">
                        ${avatar}
                        <div class="flex-1">
                            <h3 class="font-bold text-lg text-gray-800">${child.full_name}</h3>
                            <p class="text-sm text-gray-500">${child.classes?.grade_level || 'Unassigned'} - ${child.classes?.department || 'N/A'}</p>
                            <p class="text-xs text-gray-400">LRN: ${child.lrn}</p>
                        </div>
                        <div class="text-right">
                            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColor}">
                                ${statusText}
                            </span>
                        </div>
                    </div>
                    
                    <!-- Phase 4: Quick Stats Banner -->
                    <div class="mt-3 pt-3 border-t border-gray-100">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <span class="text-lg font-bold ${percentageColor}">${stats.percentage}%</span>
                                <span class="text-xs text-gray-500">this month</span>
                            </div>
                            <div class="flex gap-3 text-xs">
                                <span class="text-green-600">✓ ${stats.present}</span>
                                <span class="text-yellow-600">⚠ ${stats.late}</span>
                                <span class="text-red-600">✕ ${stats.absent}</span>
                            </div>
                        </div>
                        <!-- Progress Bar -->
                        <div class="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div class="h-full ${stats.percentage >= 90 ? 'bg-green-500' : stats.percentage >= 75 ? 'bg-yellow-500' : 'bg-red-500'}" style="width: ${stats.percentage}%"></div>
                        </div>
                    </div>
                </div>
                <div class="bg-gray-50 px-4 py-2 flex justify-between items-center text-sm">
                    <span class="text-gray-500">${child.profile_photo_url ? '📷' : '👤'} Profile Photo</span>
                    <span class="text-green-600 font-medium">View Details →</span>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Get today's attendance status for a child
 * UPDATED: Phase 4 - Also fetch attendance percentage
 */
async function getChildTodayStatus(childId) {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        const { data: logs, error } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', childId)
            .eq('log_date', today)
            .order('time_in', { ascending: false })
            .limit(1);

        if (error || !logs || logs.length === 0) {
            return 'none';
        }

        const latestLog = logs[0];
        return latestLog.time_out ? 'outside' : 'inside';

    } catch (err) {
        console.error('Error getting child status:', err);
        return 'unknown';
    }
}

/**
 * Get attendance statistics for a child (monthly)
 * Phase 4: Enhanced to return percentage
 */
async function getChildAttendanceStats(childId) {
    try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

        if (DEBUG) console.log('[Parent Children] Getting attendance stats for child:', childId, 'Date range:', monthStart, 'to', monthEnd);

        const { data: logs, error } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', childId)
            .gte('log_date', monthStart)
            .lte('log_date', monthEnd);

        if (DEBUG) console.log('[Parent Children] Attendance logs found:', logs?.length || 0, 'records');

        // FIX: Also check for empty array since [] is truthy in JS
        if (error || !logs || logs.length === 0) {
            if (DEBUG) console.log('[Parent Children] No logs - returning default 100%');
            return { present: 0, late: 0, absent: 0, percentage: 100 };
        }

        const schoolDays = getSchoolDaysInMonth(now.getFullYear(), now.getMonth());
        if (DEBUG) console.log('[Parent Children] School days in month:', schoolDays);
        
        const present = logs.filter(l => l.status === 'On Time' || l.status === 'Present' || l.status === 'Excused').length;
        const late = logs.filter(l => l.status === 'Late').length;
        const absent = Math.max(0, schoolDays - (present + late));
        const percentage = schoolDays > 0 ? Math.round((present / schoolDays) * 100) : 100;
        
        if (DEBUG) console.log('[Parent Children] Calculated - Present:', present, 'Late:', late, 'Absent:', absent, 'Percentage:', percentage);

        return { present, late, absent, percentage, schoolDays };

    } catch (err) {
        console.error('[Parent Children] Error getting attendance stats:', err);
        return { present: 0, late: 0, absent: 0, percentage: 100 };
    }
}

/**
 * Get school days in month (helper function)
 * Phase 4: Added for percentage calculation
 */
function getSchoolDaysInMonth(year, month) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentDate = now.getDate();
    
    // If viewing current month, only count days up to today
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const targetDate = (year === now.getFullYear() && month === currentMonth) ? currentDate : daysInMonth;
    
    // Count weekdays (Monday to Friday)
    let schoolDays = 0;
    for (let day = 1; day <= targetDate; day++) {
        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday or Saturday
            schoolDays++;
        }
    }
    return schoolDays;
}

/**
 * Get status color class
 */
function getStatusColor(status) {
    switch (status) {
        case 'inside': return 'bg-green-100 text-green-700';
        case 'outside': return 'bg-gray-100 text-gray-600';
        case 'late': return 'bg-yellow-100 text-yellow-700';
        default: return 'bg-gray-100 text-gray-500';
    }
}

/**
 * Get status text
 */
function getStatusText(status) {
    switch (status) {
        case 'inside': return '● Inside';
        case 'outside': return '○ Outside';
        case 'late': return '⚠ Late';
        default: return '? Not Recorded';
    }
}

/**
 * Navigate to child's attendance page
 * Phase 4: New function
 */
function viewChildAttendance() {
    if (window.selectedChildForNav) {
        localStorage.setItem('educare_selected_child', window.selectedChildForNav.id);
        window.location.href = 'parent-childs-attendance.html';
    }
}

/**
 * Navigate to child's schedule page
 * Phase 4: New function
 */
function viewChildSchedule() {
    if (window.selectedChildForNav) {
        localStorage.setItem('educare_selected_child', window.selectedChildForNav.id);
        window.location.href = 'parent-schedule.html';
    }
}

/**
 * Navigate to child's clinic history
 * Phase 4: New function
 */
function viewChildClinic() {
    // For now, navigate to dashboard which shows clinic info
    if (window.selectedChildForNav) {
        localStorage.setItem('educare_selected_child', window.selectedChildForNav.id);
        window.location.href = 'parent-dashboard.html';
    }
}

/**
 * Get recent activities for a child
 * Phase 4: New function - fetches gate logs and clinic visits
 */
async function getChildRecentActivities(childId) {
    try {
        const activities = [];
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        
        // Fetch gate logs (attendance logs)
        const { data: gateLogs } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', childId)
            .gte('log_date', weekAgo.split('T')[0])
            .order('created_at', { ascending: false })
            .limit(5);
        
        if (gateLogs) {
            gateLogs.forEach(log => {
                activities.push({
                    type: 'attendance',
                    icon: log.time_out ? '🚪' : '🚶',
                    title: log.time_out ? 'Gate Exit' : 'Gate Entry',
                    time: log.time_in || log.created_at,
                    details: log.status || 'Recorded'
                });
            });
        }
        
        // Fetch clinic visits
        const { data: clinicVisits } = await supabase
            .from('clinic_visits')
            .select('*')
            .eq('student_id', childId)
            .gte('created_at', weekAgo)
            .order('created_at', { ascending: false })
            .limit(3);
        
        if (clinicVisits) {
            clinicVisits.forEach(visit => {
                activities.push({
                    type: 'clinic',
                    icon: '🏥',
                    title: 'Clinic Visit',
                    time: visit.created_at,
                    details: visit.reason || 'Check-up'
                });
            });
        }
        
        // Sort by time and take top 5
        activities.sort((a, b) => new Date(b.time) - new Date(a.time));
        return activities.slice(0, 5);
        
    } catch (err) {
        console.error('Error getting recent activities:', err);
        return [];
    }
}

/**
 * Show child detail modal
 */
async function showChildDetail(index) {
    const child = childrenData[index];
    if (!child) return;
    const adviser = child.classes?.teachers;

    // Show modal
    document.getElementById('child-modal').classList.remove('hidden');
    document.getElementById('modal-child-name').textContent = child.full_name;

    // Load additional info
    const [attendanceStats, clinicInfo] = await Promise.all([
        getChildAttendanceStats(child.id),
        getActiveClinicVisit(child.id)
    ]);

    // Render modal content
    document.getElementById('modal-content').innerHTML = `
        <!-- Profile Section -->
        <div class="flex items-center gap-4 pb-4 border-b">
            <div class="h-16 w-16 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-xl">
                ${getInitials(child.full_name)}
            </div>
            <div>
                <p class="font-bold text-gray-800">${child.full_name}</p>
                <p class="text-sm text-gray-500">${child.classes?.grade_level || 'N/A'} - ${child.classes?.department || 'N/A'}</p>
                ${child.classes?.strand ? `<p class="text-xs text-gray-400">${child.classes.strand}</p>` : ''}
            </div>
        </div>

        <!-- Info Section -->
        <div class="space-y-3">
            <div class="flex justify-between py-2 border-b">
                <span class="text-gray-500">LRN</span>
                <span class="font-medium text-gray-800">${child.lrn}</span>
            </div>
            <div class="flex justify-between py-2 border-b">
                <span class="text-gray-500">Student ID</span>
                <span class="font-medium text-gray-800">${child.student_id_text || 'N/A'}</span>
            </div>
            <div class="flex justify-between py-2 border-b">
                <span class="text-gray-500">Gender</span>
                <span class="font-medium text-gray-800">${child.gender || 'N/A'}</span>
            </div>
            <div class="flex justify-between py-2 border-b">
                <span class="text-gray-500">Emergency Contact</span>
                <span class="font-medium text-gray-800">${child.emergency_contact || 'N/A'}</span>
            </div>
        </div>

        <!-- Adviser Contact Section -->
        ${adviser ? `
            <div class="mt-4 pt-4 border-t">
                <h4 class="font-medium text-gray-700 mb-2">Homeroom Adviser</h4>
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group">
                    <div class="flex-1">
                        <button onclick="contactAdviser('${adviser.contact_number}')" class="text-left w-full">
                            <p class="font-bold text-gray-800 group-hover:text-green-600 transition-colors">${adviser.full_name}</p>
                            <p class="text-xs text-gray-500">Adviser for ${child.classes?.grade_level || 'Unassigned'} - ${child.classes?.department || 'N/A'}</p>
                        </button>
                    </div>
                    <div class="p-2 text-green-600 opacity-50 group-hover:opacity-100 transition-opacity">
                         <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                    </div>
                </div>
            </div>
        ` : ''}

        <!-- Current Status -->
        <div class="bg-gray-50 rounded-lg p-4 mt-4">
            <h4 class="font-medium text-gray-700 mb-2">Today's Status</h4>
            <div class="flex items-center gap-2">
                <span class="text-2xl">${child.todayStatus === 'inside' ? '🏫' : '🏠'}</span>
                <div>
                    <p class="font-bold ${child.todayStatus === 'inside' ? 'text-green-600' : 'text-gray-600'}">
                        ${child.todayStatus === 'inside' ? 'Inside School' : child.todayStatus === 'outside' ? 'Outside School' : 'Not Recorded'}
                    </p>
                    ${attendanceStats.lastLog ? `<p class="text-xs text-gray-500">Last: ${formatTime(attendanceStats.lastLog)}</p>` : ''}
                </div>
            </div>
            ${clinicInfo ? `
                <div class="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                    <p class="text-sm text-red-700 font-medium">🏥 Currently in Clinic</p>
                    <p class="text-xs text-red-600">${clinicInfo.reason || 'No reason specified'}</p>
                </div>
            ` : ''}
        </div>

        <!-- This Month Stats -->
        <div class="grid grid-cols-3 gap-3 mt-4">
            <div class="bg-green-50 rounded-lg p-3 text-center">
                <p class="text-2xl font-bold text-green-700">${attendanceStats.present}</p>
                <p class="text-xs text-green-600">Present</p>
            </div>
            <div class="bg-yellow-50 rounded-lg p-3 text-center">
                <p class="text-2xl font-bold text-yellow-700">${attendanceStats.late}</p>
                <p class="text-xs text-yellow-600">Late</p>
            </div>
            <div class="bg-red-50 rounded-lg p-3 text-center">
                <p class="text-2xl font-bold text-red-700">${attendanceStats.absent}</p>
                <p class="text-xs text-red-600">Absent</p>
            </div>
        </div>

        <!-- PHASE 4: Action Buttons -->
        <div class="mt-4 pt-4 border-t">
            <h4 class="font-medium text-gray-700 mb-3">Quick Actions</h4>
            <div class="grid grid-cols-3 gap-2">
                <button onclick="viewChildAttendance(); closeModal();" class="flex flex-col items-center justify-center p-3 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors">
                    <span class="text-2xl mb-1">📅</span>
                    <span class="text-xs font-medium text-blue-700">Attendance</span>
                </button>
                <button onclick="viewChildClinic(); closeModal();" class="flex flex-col items-center justify-center p-3 bg-red-50 hover:bg-red-100 rounded-xl transition-colors">
                    <span class="text-2xl mb-1">🏥</span>
                    <span class="text-xs font-medium text-red-700">Clinic</span>
                </button>
                <button onclick="viewChildSchedule(); closeModal();" class="flex flex-col items-center justify-center p-3 bg-purple-50 hover:bg-purple-100 rounded-xl transition-colors">
                    <span class="text-2xl mb-1">📅</span>
                    <span class="text-xs font-medium text-purple-700">Schedule</span>
                </button>
            </div>
        </div>

        <!-- PHASE 4: Recent Activity Feed -->
        <div class="mt-4 pt-4 border-t">
            <h4 class="font-medium text-gray-700 mb-3">Recent Activity</h4>
            <div id="modal-activities" class="space-y-2">
                <div class="flex justify-center py-4">
                    <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                </div>
            </div>
        </div>
    `;

    // Store selected child for navigation
    window.selectedChildForNav = child;

    // PHASE 4: Load recent activities
    loadRecentActivitiesInModal(child.id);
}

/**
 * Close the modal
 */
function closeModal() {
    document.getElementById('child-modal').classList.add('hidden');
}

/**
 * Get attendance statistics for a child
 */
async function getChildAttendanceStats(childId) {
    try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

        const { data: logs, error } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', childId)
            .gte('log_date', monthStart)
            .lte('log_date', monthEnd);

        if (error) {
            console.error('Error getting attendance stats:', error);
            return { present: 0, late: 0, absent: 0, lastLog: null };
        }

        let present = 0;
        let late = 0;
        let lastLog = null;

        logs?.forEach(log => {
            lastLog = log.time_in || log.time_out;
            if (log.status === 'Late') {
                late++;
            } else if (log.status === 'Excused') {
                present++; // excused counts as present
            } else if (log.status === 'Present' || log.time_in) {
                present++;
            }
        });

        // Calculate school days in month (weekdays only)
        const schoolDays = getSchoolDaysInMonth(now.getFullYear(), now.getMonth());
        const absent = Math.max(0, schoolDays - present - late);

        return { present, late, absent, lastLog };

    } catch (err) {
        console.error('Error in getChildAttendanceStats:', err);
        return { present: 0, late: 0, absent: 0, lastLog: null };
    }
}

/**
 * Get number of school days (weekdays) in a month
 */
function getSchoolDaysInMonth(year, month) {
    let days = 0;
    const date = new Date(year, month + 1, 0);
    for (let i = 1; i <= date.getDate(); i++) {
        const dayOfWeek = new Date(year, month, i).getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Exclude Sunday (0) and Saturday (6)
            days++;
        }
    }
    return days;
}

/**
 * Get active clinic visit for a child
 * THE PARANOIA SHIELD: Only check today's visits to prevent 'Forever Clinic' ghost
 */
async function getActiveClinicVisit(childId) {
    try {
        const today = new Date().toISOString().split('T')[0];

        const { data: visits, error } = await supabase
            .from('clinic_visits')
            .select('*')
            .eq('student_id', childId)
            .is('time_out', null)
            .gte('time_in', `${today}T00:00:00`) // THE FIX: Protect against nurse forgetfulness
            .order('time_in', { ascending: false })
            .limit(1);

        if (error) {
            console.error('Error getting clinic visit:', error);
            return null;
        }

        return visits && visits.length > 0 ? visits[0] : null;

    } catch (err) {
        console.error('Error in getActiveClinicVisit:', err);
        return null;
    }
}

// ============================================
// PHASE 2 FEATURE: Compare Children View
// ============================================

/**
 * Show comparison view for all children
 */
async function showCompareChildren() {
    // Show loading
    document.getElementById('compare-modal').classList.remove('hidden');
    document.getElementById('compare-content').innerHTML = `
        <div class="flex justify-center py-12">
            <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600"></div>
        </div>
    `;

    // Fetch stats for all children
    const childrenStats = await Promise.all(childrenData.map(async (child) => {
        const stats = await getChildAttendanceStats(child.id);
        const todayStatus = await getChildTodayStatus(child.id);
        return { ...child, ...stats, todayStatus };
    }));

    // Calculate totals
    const totalPresent = childrenStats.reduce((sum, c) => sum + c.present, 0);
    const totalLate = childrenStats.reduce((sum, c) => sum + c.late, 0);
    const totalAbsent = childrenStats.reduce((sum, c) => sum + c.absent, 0);
    const totalDays = totalPresent + totalLate + totalAbsent;
    const overallRate = totalDays > 0 ? Math.round((totalPresent / totalDays) * 100) : 100;

    const container = document.getElementById('compare-content');
    container.innerHTML = `
        <div class="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-4 mb-4 border border-green-200">
            <h4 class="font-bold text-green-800 mb-2">Overall Summary</h4>
            <div class="grid grid-cols-4 gap-2 text-center">
                <div><p class="text-2xl font-bold text-green-600">${overallRate}%</p><p class="text-xs text-green-700">Rate</p></div>
                <div><p class="text-2xl font-bold text-green-600">${totalPresent}</p><p class="text-xs text-green-700">Present</p></div>
                <div><p class="text-2xl font-bold text-yellow-600">${totalLate}</p><p class="text-xs text-yellow-700">Late</p></div>
                <div><p class="text-2xl font-bold text-red-600">${totalAbsent}</p><p class="text-xs text-red-700">Absent</p></div>
            </div>
        </div>
        <div class="space-y-3">
            ${childrenStats.map(child => {
                const childDays = child.present + child.late + child.absent;
                const childRate = childDays > 0 ? Math.round((child.present / childDays) * 100) : 100;
                const statusColor = child.todayStatus === 'inside' ? 'bg-green-100 text-green-700' : child.todayStatus === 'outside' ? 'bg-gray-100 text-gray-600' : 'bg-gray-100 text-gray-500';
                const statusText = child.todayStatus === 'inside' ? 'Inside' : child.todayStatus === 'outside' ? 'Outside' : 'Unknown';
                return `
                    <div class="bg-white rounded-xl p-4 border border-gray-200">
                        <div class="flex items-center justify-between mb-3">
                            <div class="flex items-center gap-3">
                                <div class="h-10 w-10 rounded-full bg-green-600 flex items-center justify-center text-white font-bold">${getInitials(child.full_name)}</div>
                                <div><p class="font-bold text-gray-800">${child.full_name}</p><p class="text-xs text-gray-500">${child.classes?.grade_level || 'Unassigned'} - ${child.classes?.department || 'N/A'}</p></div>
                            </div>
                            <span class="px-2 py-1 rounded-full text-xs font-medium ${statusColor}">${statusText}</span>
                        </div>
                        <div class="grid grid-cols-4 gap-2 text-center text-sm">
                            <div class="bg-green-50 rounded-lg p-2"><p class="font-bold text-green-700">${child.present}</p><p class="text-xs text-green-600">Present</p></div>
                            <div class="bg-yellow-50 rounded-lg p-2"><p class="font-bold text-yellow-700">${child.late}</p><p class="text-xs text-yellow-600">Late</p></div>
                            <div class="bg-red-50 rounded-lg p-2"><p class="font-bold text-red-700">${child.absent}</p><p class="text-xs text-red-600">Absent</p></div>
                            <div class="bg-blue-50 rounded-lg p-2"><p class="font-bold text-blue-700">${childRate}%</p><p class="text-xs text-blue-600">Rate</p></div>
                        </div>
                    </div>`;
            }).join('')}
        </div>
        <div class="mt-4 flex gap-2">
            <button onclick="closeCompareModal(); navigateTo('attendance');" class="flex-1 bg-green-600 text-white py-3 rounded-xl font-medium hover:bg-green-700">View Details</button>
        </div>`;
}

/**
 * Close compare modal
 */
function closeCompareModal() {
    document.getElementById('compare-modal').classList.add('hidden');
}

// Close modal on backdrop click
document.getElementById('child-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        closeModal();
    }
});

// Close compare modal on backdrop click
document.getElementById('compare-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        closeCompareModal();
    }
});

/**
 * Opens the phone's dialer with the adviser's contact number.
 * UPDATED: Add fallback for desktop - copy to clipboard
 */
function contactAdviser(contactNumber) {
    if (!contactNumber) {
        alert("Adviser's contact information is not available.");
        return;
    }
    
    // Check if mobile device
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        window.location.href = `tel:${contactNumber}`;
    } else {
        // Desktop fallback - copy to clipboard
        navigator.clipboard.writeText(contactNumber).then(() => {
            alert("Adviser's contact number copied to clipboard!");
        }).catch(() => {
            prompt("Copy this number manually:", contactNumber);
        });
    }
}

/**
 * Load recent activities in modal
 * Phase 4: New function - renders activity feed in modal
 */
async function loadRecentActivitiesInModal(childId) {
    const container = document.getElementById('modal-activities');
    if (!container) return;

    try {
        const activities = await getChildRecentActivities(childId);

        if (!activities || activities.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4 text-gray-500">
                    <p class="text-sm">No recent activity</p>
                </div>
            `;
            return;
        }

        container.innerHTML = activities.map(activity => {
            const timeAgo = getRelativeTime(activity.time);
            const typeColor = activity.type === 'clinic' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200';
            return `
                <div class="flex items-start gap-3 p-3 ${typeColor} rounded-lg border">
                    <span class="text-xl">${activity.icon}</span>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-800">${activity.title}</p>
                        <p class="text-xs text-gray-500 truncate">${activity.details}</p>
                    </div>
                    <span class="text-xs text-gray-400 whitespace-nowrap">${timeAgo}</span>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error loading modal activities:', err);
        container.innerHTML = `
            <div class="text-center py-4 text-gray-500">
                <p class="text-sm">Unable to load activities</p>
            </div>
        `;
    }
}

/**
 * Get relative time string (e.g., "2 hours ago")
 * Phase 4: Helper function for activity feed
 */
function getRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

// Make functions available globally
window.showChildDetail = showChildDetail;
window.closeModal = closeModal;
window.contactAdviser = contactAdviser;
window.viewChildAttendance = viewChildAttendance;
window.viewChildSchedule = viewChildSchedule;
window.viewChildClinic = viewChildClinic;

// Listen for child changed event to reload children data
window.addEventListener('childChanged', () => {
    loadAllChildren();
});
