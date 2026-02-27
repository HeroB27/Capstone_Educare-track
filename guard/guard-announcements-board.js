// guard/guard-announcements-board.js

// ============================================================================
// GUARD ANNOUNCEMENTS BOARD - JavaScript Logic
// ============================================================================

// Session Check
// currentUser is now global in guard-core.js

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
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
        const { data: announcements, error } = await supabase
            .from('announcements')
            .select(`
                *,
                admins(full_name)
            `)
            .eq('target_guards', true)
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (error) {
            console.error('Error loading announcements:', error);
            container.innerHTML = `
                <div class="bg-gray-800/80 backdrop-blur-xl rounded-2xl p-12 border border-gray-700 text-center">
                    <div class="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                    </div>
                    <h3 class="text-lg font-semibold text-white mb-2">Error Loading Announcements</h3>
                    <p class="text-gray-500">Please try again later</p>
                </div>
            `;
            return;
        }
        
        if (!announcements || announcements.length === 0) {
            container.innerHTML = `
                <div class="bg-gray-800/80 backdrop-blur-xl rounded-2xl p-12 border border-gray-700 text-center">
                    <div class="w-16 h-16 bg-yellow-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/>
                        </svg>
                    </div>
                    <h3 class="text-lg font-semibold text-white mb-2">No Announcements</h3>
                    <p class="text-gray-500">There are no announcements at the moment</p>
                </div>
            `;
            return;
        }
        
        // Render announcements
        renderAnnouncements(announcements);
        
    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = `
            <div class="bg-gray-800/80 backdrop-blur-xl rounded-2xl p-12 border border-gray-700 text-center">
                <h3 class="text-lg font-semibold text-white mb-2">Error</h3>
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
            ? 'border-l-yellow-500' 
            : 'border-l-gray-600';
        
        const priorityBadge = announcement.priority === 'high'
            ? '<span class="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-lg">Important</span>'
            : '<span class="px-2 py-1 bg-gray-700 text-gray-400 text-xs rounded-lg">General</span>';
        
        return `
            <div class="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700 border-l-4 ${priorityClass} p-6 hover:border-gray-600 transition-all duration-200 cursor-pointer" onclick="viewAnnouncement('${announcement.id}')">
                <div class="flex items-start justify-between mb-3">
                    <div class="flex items-center gap-3">
                        ${priorityBadge}
                        <span class="text-xs text-gray-500 font-mono">${formattedDate} ${formattedTime}</span>
                    </div>
                </div>
                <h3 class="font-bold text-white text-lg mb-2">${escapeHtml(announcement.title)}</h3>
                <p class="text-gray-400 text-sm line-clamp-2">${escapeHtml(announcement.content)}</p>
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
        tab.classList.remove('bg-yellow-500', 'text-gray-900');
        tab.classList.add('text-gray-400', 'hover:bg-gray-700');
    });
    
    const activeTab = document.getElementById(`tab-${category}`);
    if (activeTab) {
        activeTab.classList.remove('text-gray-400', 'hover:bg-gray-700');
        activeTab.classList.add('bg-yellow-500', 'text-gray-900');
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
        let query = supabase
            .from('announcements')
            .select(`
                *,
                admins(full_name)
            `)
            .eq('target_guards', true);
        
        if (category === 'important') {
            query = query.eq('priority', 'high');
        }
        
        const { data: announcements, error } = await query.order('created_at', { ascending: false });
        
        if (error) throw error;
        
        renderAnnouncements(announcements || []);
        
    } catch (error) {
        console.error('Error filtering announcements:', error);
    }
}

// ============================================================================
// MODAL
// ============================================================================

/**
 * View announcement details in modal
 */
async function viewAnnouncement(id) {
    const modal = document.getElementById('detail-modal');
    const modalContent = document.getElementById('modal-content');
    const modalTitle = document.getElementById('modal-title');
    
    try {
        const { data: announcement, error } = await supabase
            .from('announcements')
            .select(`
                *,
                admins(full_name)
            `)
            .eq('id', id)
            .single();
        
        if (error) throw error;
        
        const date = new Date(announcement.created_at);
        const formattedDate = date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        modalTitle.textContent = announcement.title;
        
        modalContent.innerHTML = `
            <div class="space-y-4">
                <div class="flex items-center gap-4 text-sm text-gray-400">
                    <div class="flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                        </svg>
                        <span>${formattedDate}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                        </svg>
                        <span>${announcement.admins?.full_name || 'Admin'}</span>
                    </div>
                </div>
                <div class="prose prose-invert max-w-none">
                    <p class="text-gray-300 whitespace-pre-wrap">${escapeHtml(announcement.content)}</p>
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
        
    } catch (error) {
        console.error('Error loading announcement:', error);
    }
}

/**
 * Close modal
 */
function closeModal() {
    const modal = document.getElementById('detail-modal');
    modal.classList.add('hidden');
}

// Close modal when clicking outside
document.getElementById('detail-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'detail-modal') {
        closeModal();
    }
});

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Logout function
 */
function logout() {
    localStorage.removeItem('educare_session');
    localStorage.removeItem('educare_user');
    window.location.href = '../index.html';
}
