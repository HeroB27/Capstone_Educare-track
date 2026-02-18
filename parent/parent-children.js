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
 */
async function loadAllChildren() {
    try {
        const { data: children, error } = await supabase
            .from('students')
            .select(`
                *,
                classes (grade_level, section_name, strand, adviser_id)
            `)
            .eq('parent_id', currentUser.id);

        if (error) {
            console.error('Error loading children:', error);
            showEmptyState();
            return;
        }

        childrenData = children || [];
        
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
 */
async function renderChildrenList() {
    const container = document.getElementById('children-list');
    
    for (const child of childrenData) {
        // Get today's attendance status
        const status = await getChildTodayStatus(child.id);
        child.todayStatus = status;
    }

    container.innerHTML = childrenData.map((child, index) => {
        const statusColor = getStatusColor(child.todayStatus);
        const statusText = getStatusText(child.todayStatus);
        
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
                            <p class="text-sm text-gray-500">${child.classes?.grade_level} - ${child.classes?.section_name}</p>
                            <p class="text-xs text-gray-400">LRN: ${child.lrn}</p>
                        </div>
                        <div class="text-right">
                            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColor}">
                                ${statusText}
                            </span>
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
 * Show child detail modal
 */
async function showChildDetail(index) {
    const child = childrenData[index];
    if (!child) return;

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
                <p class="text-sm text-gray-500">${child.classes?.grade_level || 'N/A'} - ${child.classes?.section_name || 'N/A'}</p>
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
    `;

    // Store selected child for navigation
    window.selectedChildForNav = child;
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

// Close modal on backdrop click
document.getElementById('child-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        closeModal();
    }
});

// Make functions available globally
window.showChildDetail = showChildDetail;
window.closeModal = closeModal;

// Listen for child changed event to reload children data
window.addEventListener('childChanged', () => {
    loadAllChildren();
});
