// parent/parent-core.js
// Core logic for Parent Module - handles session, child switching, and real-time sync

// ============================================
// SESSION MANAGEMENT
// ============================================

var currentUser = checkSession('parents');

// Initialize user info
document.addEventListener('DOMContentLoaded', async () => {
    if (currentUser) {
        // Update welcome message
        const welcomeEl = document.getElementById('parent-name');
        if (welcomeEl) {
            welcomeEl.innerText = `Welcome, ${currentUser.full_name.split(' ')[0]}`;
        }

        // Add listener for child changes to update header
        document.addEventListener('childChanged', (e) => {
            const childNameEl = document.getElementById('current-child-name');
            if (childNameEl) childNameEl.innerText = e.detail.full_name;
        });
        
        // Load children and initialize child switcher
        await loadChildren();
        
        // Setup real-time subscriptions
        setupRealtimeSubscriptions();
    }
});

// ============================================
// CHILD MANAGEMENT
// ============================================

let allChildren = [];
let currentChild = null;
let currentChildLiveStatus = null; // Cache for live status

/**
 * Load all children for the logged-in parent
 * fetches students linked to parent's account
 */
async function loadChildren() {
    try {
        const { data: children, error } = await supabase
            .from('students')
            .select(`
                *,
                classes (grade_level, section_name, strand)
            `)
            .eq('parent_id', currentUser.id);

        if (error) {
            console.error('Error loading children:', error);
            return;
        }

        allChildren = children || [];
        
        // Get selected child from localStorage or default to first
        const savedChildId = localStorage.getItem('educare_selected_child');
        currentChild = savedChildId 
            ? allChildren.find(c => c.id == savedChildId) 
            : allChildren[0];

        // If no saved selection and no children, handle gracefully
        if (!currentChild && allChildren.length > 0) {
            currentChild = allChildren[0];
        }

        // Update UI with child info
        updateChildSwitcher();
        
        // Load live status for current child
        await loadChildLiveStatus();
        
        // Trigger child loaded event for other scripts
        if (currentChild) {
            localStorage.setItem('educare_selected_child', currentChild.id);
            document.dispatchEvent(new CustomEvent('childChanged', { detail: { ...currentChild } }));
        }

    } catch (err) {
        console.error('Error in loadChildren:', err);
    }
}

/**
 * Load live status for the current child
 * Fetches the very latest log for today to determine In/Out status
 */
async function loadChildLiveStatus() {
    if (!currentChild) {
        currentChildLiveStatus = null;
        return null;
    }
    
    const today = new Date().toISOString().split('T')[0];

    try {
        const { data: log, error } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', currentChild.id)
            .eq('log_date', today)
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Error loading live status:', error);
            currentChildLiveStatus = null;
            return null;
        }
        
        currentChildLiveStatus = log;
        
        // Update UI if status indicator exists
        const statusIndicator = document.getElementById('live-status-indicator');
        if (statusIndicator) {
            updateStatusUI(log);
        }
        
        return log;
        
    } catch (err) {
        console.error('Error in loadChildLiveStatus:', err);
        currentChildLiveStatus = null;
        return null;
    }
}

/**
 * Update status UI based on log data
 * @param {Object|null} log - The attendance log entry
 */
function updateStatusUI(log) {
    const statusIndicator = document.getElementById('live-status-indicator');
    if (!statusIndicator) return;
    
    if (!log) {
        statusIndicator.className = 'px-3 py-1 rounded-full text-sm font-bold bg-gray-100 text-gray-700';
        statusIndicator.innerHTML = '<span class="inline-block w-2 h-2 bg-gray-500 rounded-full mr-2"></span>Not Yet Arrived';
        return;
    }

    if (log.status === 'Excused') {
        statusIndicator.className = 'px-3 py-1 rounded-full text-sm font-bold bg-purple-100 text-purple-700';
        statusIndicator.innerHTML = '<span class="inline-block w-2 h-2 bg-purple-500 rounded-full mr-2"></span>Excused Absence';
        return;
    }
    if (log.status === 'Absent') {
        statusIndicator.className = 'px-3 py-1 rounded-full text-sm font-bold bg-red-100 text-red-700';
        statusIndicator.innerHTML = '<span class="inline-block w-2 h-2 bg-red-500 rounded-full mr-2"></span>Absent';
        return;
    }
    
    if (log.time_in && !log.time_out) {
        statusIndicator.className = 'px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-700';
        statusIndicator.innerHTML = '<span class="inline-block w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>Inside School';
    } else if (log.time_out) {
        statusIndicator.className = 'px-3 py-1 rounded-full text-sm font-bold bg-gray-100 text-gray-700';
        statusIndicator.innerHTML = '<span class="inline-block w-2 h-2 bg-gray-500 rounded-full mr-2"></span>Outside School';
    } else {
        statusIndicator.className = 'px-3 py-1 rounded-full text-sm font-bold bg-yellow-100 text-yellow-700';
        statusIndicator.innerHTML = 'Status Unknown';
    }
}

/**
 * Update the child switcher dropdown with all children
 */
function updateChildSwitcher() {
    const switcherContainer = document.getElementById('child-switcher');
    if (!switcherContainer) return;

    let html = '';
    
    if (allChildren.length === 0) {
        html = '<p class="text-gray-500 text-sm">No children linked to your account</p>';
    } else if (allChildren.length === 1) {
        // Single child - show name only
        const child = allChildren[0];
        html = `
            <div class="flex items-center gap-2">
                <div class="h-10 w-10 rounded-full bg-green-600 flex items-center justify-center text-white font-bold">
                    ${getInitials(child.full_name)}
                </div>
                <div>
                    <p class="font-bold text-gray-800">${child.full_name}</p>
                    <p class="text-xs text-gray-500">${child.classes?.grade_level} - ${child.classes?.section_name}</p>
                </div>
            </div>
        `;
    } else {
        // Multiple children - show dropdown
        html = `
            <select id="child-select" onchange="switchChild(this.value)" class="w-full p-2 border rounded-lg bg-white">
                ${allChildren.map(child => `
                    <option value="${child.id}" ${currentChild?.id === child.id ? 'selected' : ''}>
                        ${child.full_name} (${child.classes?.grade_level || 'N/A'})
                    </option>
                `).join('')}
            </select>
        `;
    }
    
    switcherContainer.innerHTML = html;
}

/**
 * Switch to a different child
 * @param {number} childId - The ID of the child to switch to
 */
async function switchChild(childId) {
    // 1. Update the local state
    const child = allChildren.find(c => c.id == childId);
    if (!child) return;

    currentChild = child;
    localStorage.setItem('educare_selected_child', childId);
    
    // 2. Update the UI header
    const childNameEl = document.getElementById('current-child-name');
    if (childNameEl) {
        childNameEl.innerText = currentChild.full_name;
    }
    
    // 3. BROADCAST: Tell other pages to refresh their data
    const event = new CustomEvent('childChanged', { detail: { ...child } });
    window.dispatchEvent(event);
    
    // Close modal if open (ignore if function doesn't exist)
    if (typeof closeChildModal === 'function') {
        closeChildModal();
    }
    
    // RE-FETCH: Crucial step to get new data for this child
    await loadChildLiveStatus();
    
    // Re-setup real-time subscriptions for new child
    setupRealtimeSubscriptions();
    
    // Refresh current page data
    if (typeof refreshDashboard === 'function') {
        refreshDashboard();
    }
    if (typeof loadAttendanceCalendar === 'function') {
        loadAttendanceCalendar();
    }
}

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================

let realtimeChannel = null;

/**
 * Setup real-time subscriptions for attendance and clinic updates
 */
function setupRealtimeSubscriptions() {
    if (!currentChild) return;

    // Remove existing channel
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
    }

    realtimeChannel = supabase
        .channel('parent-updates')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'attendance_logs',
            filter: `student_id=eq.${currentChild.id}`
        }, async (payload) => {
            console.log('Attendance change received:', payload);
            await loadChildLiveStatus(); // Re-fetch the latest status
            // Refresh dashboard or calendar if the functions exist on the current page
            if (typeof refreshDashboard === 'function') {
                refreshDashboard();
            }
        })
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'clinic_visits',
            filter: `student_id=eq.${currentChild.id}`
        }, async (payload) => {
            console.log('Clinic visit change received:', payload);
            if (typeof refreshDashboard === 'function') {
                refreshDashboard();
            }
        })
        .subscribe();
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get initials from a full name
 */
function getInitials(fullName) {
    if (!fullName) return '?';
    return fullName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

/**
 * Format time for display
 */
function formatTime(dateString) {
    if (!dateString) return '--:--';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
}

/**
 * Format date for display
 */
function formatDate(dateString) {
    if (!dateString) return '--';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
    });
}

/**
 * Format relative time (e.g., "5 minutes ago")
 */
function getRelativeTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hr ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return formatDate(dateString);
}

/**
 * Navigate to a different page in the parent module
 */
function navigateTo(page) {
    const pageMap = {
        'dashboard': 'parent-dashboard.html',
        'children': 'parent-children.html',
        'attendance': 'parent-childs-attendance.html',
        'excuse': 'parent-excuse-letter-template.html',
        'notifications': 'parent-notifications.html',
        'announcements': 'parent-announcements-board.html',
        'schedule': 'parent-schedule.html' // NEW: Add schedule page route
    };
    
    if (pageMap[page]) {
        window.location.href = pageMap[page];
    }
}

// Export functions for use in other files
window.switchChild = switchChild;
window.navigateTo = navigateTo;
window.getInitials = getInitials;
window.formatTime = formatTime;
window.formatDate = formatDate;
window.getRelativeTime = getRelativeTime;
