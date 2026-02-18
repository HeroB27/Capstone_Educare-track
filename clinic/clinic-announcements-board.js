// clinic/clinic-announcements-board.js

// ============================================================================
// CLINIC ANNOUNCEMENTS BOARD - JavaScript Logic
// ============================================================================
// Features: View announcements targeted at clinic staff
// ============================================================================

// Session Check
// currentUser is now global in clinic-core.js

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (currentUser) {
        // Set clinic staff name in sidebar
        const sidebarName = document.getElementById('clinic-name-sidebar');
        if (sidebarName) sidebarName.textContent = currentUser.full_name || 'Clinic Staff';
        
        // Set header name
        const headerName = document.getElementById('clinic-name');
        if (headerName) headerName.textContent = currentUser.full_name || 'Clinic Staff';
    }
    
    // Set current date
    setCurrentDate();
    
    // Load announcements
    loadAnnouncements();
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

// ============================================================================
// DATA LOADING
// ============================================================================

/**
 * Load announcements from database
 */
async function loadAnnouncements() {
    const container = document.getElementById('announcements-list');
    
    try {
        // FIXED: Use correct boolean column
        const { data: announcements, error } = await supabase
            .from('announcements')
            .select(`
                *,
                admins(full_name)
            `)
            .eq('target_clinic', true)
            .eq('is_active', true)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Error loading announcements:', error);
            container.innerHTML = `
                <div class="bg-white rounded-2xl p-12 border border-gray-100 text-center">
                    <div class="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                    </div>
                    <h3 class="text-lg font-semibold text-gray-800 mb-2">Error Loading Announcements</h3>
                    <p class="text-gray-500">Please try again later</p>
                </div>
            `;
            return;
        }
        
        if (!announcements || announcements.length === 0) {
            container.innerHTML = `
                <div class="bg-white rounded-2xl p-12 border border-gray-100 text-center">
                    <div class="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/>
                        </svg>
                    </div>
                    <h3 class="text-lg font-semibold text-gray-800 mb-2">No Announcements</h3>
                    <p class="text-gray-500">There are no announcements for clinic staff at the moment</p>
                </div>
            `;
            return;
        }
        
        // Render announcements
        renderAnnouncements(announcements);
        
    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = `
            <div class="bg-white rounded-2xl p-12 border border-gray-100 text-center">
                <div class="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
                <h3 class="text-lg font-semibold text-gray-800 mb-2">Error</h3>
                <p class="text-gray-500">Something went wrong</p>
            </div>
        `;
    }
}

/**
 * Render announcements to the list
 */
function renderAnnouncements(announcements) {
    const container = document.getElementById('announcements-list');
    
    container.innerHTML = announcements.map(announcement => {
        const date = new Date(announcement.created_at);
        const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const formattedTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        const priorityClass = announcement.priority === 'high' 
            ? 'border-l-red-500' 
            : 'border-l-gray-300';
        
        const priorityBadge = announcement.priority === 'high'
            ? '<span class="px-2 py-1 bg-red-100 text-red-600 text-xs rounded-lg font-medium">Important</span>'
            : '<span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg">General</span>';
        
        return `
            <div class="bg-white rounded-2xl border border-gray-100 border-l-4 ${priorityClass} p-6 hover:shadow-lg hover:border-red-200 transition-all duration-200 cursor-pointer" onclick="viewAnnouncement('${announcement.id}')">
                <div class="flex items-start justify-between mb-3">
                    <div class="flex items-center gap-3">
                        ${priorityBadge}
                        <span class="text-xs text-gray-500 font-mono">${formattedDate} ${formattedTime}</span>
                    </div>
                </div>
                <h3 class="font-bold text-gray-800 text-lg mb-2">${escapeHtml(announcement.title)}</h3>
                <p class="text-gray-600 text-sm line-clamp-2">${escapeHtml(announcement.content)}</p>
                <div class="mt-4 flex items-center gap-2 text-xs text-gray-500">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                    </svg>
                    <span>${announcement.admins?.full_name || 'Admin'}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================================
// FILTERING
// ============================================================================

/**
 * Filter announcements by category
 */
function filterAnnouncements(category) {
    // Update tab styling
    document.querySelectorAll('[id^="tab-"]').forEach(tab => {
        tab.classList.remove('bg-red-500', 'text-white');
        tab.classList.add('text-gray-500', 'hover:bg-gray-100');
    });
    
    const activeTab = document.getElementById(`tab-${category}`);
    if (activeTab) {
        activeTab.classList.remove('text-gray-500', 'hover:bg-gray-100');
        activeTab.classList.add('bg-red-500', 'text-white');
    }
    
    // Reload announcements with filter
    loadAnnouncementsFiltered(category);
}

/**
 * Load announcements with category filter
 */
async function loadAnnouncementsFiltered(category) {
    const container = document.getElementById('announcements-list');
    
    try {
            // FIXED: Use correct boolean column
            let query = supabase
                .from('announcements')
                .select(`
                    *,
                    admins(full_name)
                `)
                .eq('target_clinic', true)
                .eq('is_active', true);
        
        if (category === 'important') {
            query = query.eq('priority', 'high');
        }
        
        const { data: announcements, error } = await query
            .order('created_at', { ascending: false })
            .limit(30); // THE FIX: Add the bandwidth cap
        
        if (error) throw error;
        
        renderAnnouncements(announcements || []);
        
    } catch (error) {
        console.error('Error filtering announcements:', error);
    }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * View announcement details
 */
function viewAnnouncement(announcementId) {
    // Could open a modal with full announcement details
    console.log('View announcement:', announcementId);
    // For now, just log the ID - modal implementation can be added
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
