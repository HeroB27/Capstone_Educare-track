// parent/parent-announcements-board.js
// Announcements board for parents
// UPDATED: Added Paranoia Shield for privacy-focused data isolation

let allAnnouncements = [];
let currentFilter = 'all'; // all, class, general, important
let currentAdviserId = null;
let announcementsChannel = null;

/**
 * Initialize announcements page
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize currentAdviserId to null (will be updated if child is selected)
    currentAdviserId = null;
    
    await loadAnnouncements();
    setupRealtimeAnnouncements();
    
    // Listen for child changes to reload with new adviser filtering
    window.addEventListener('childChanged', () => {
        loadAnnouncements();
    });
});

/**
 * Load announcements targeted to parents
 * UPDATED: No longer requires currentChild - shows all parent-targeted announcements
 * PARANOIA SHIELD: Data Isolation - Only fetch Admin posts OR posts from the current child's adviser (if child selected)
 */
async function loadAnnouncements() {
    // REMOVED: No longer require currentChild - announcements should be visible to all parents
    // This allows parents to see announcements even without selecting a child

    try {
        // Get current child if available (for adviser-specific filtering)
        let adviserId = null;
        if (window.currentChild && window.currentChild.id) {
            // 1. Get the child's class and teacher info (optional - for privacy filtering)
            const { data: childData, error: childError } = await supabase
                .from('students')
                .select('class_id, classes(adviser_id)')
                .eq('id', window.currentChild.id)
                .single();

            if (!childError && childData?.classes?.adviser_id) {
                adviserId = childData.classes.adviser_id;
            }
        }

        // 2. PARANOIA SHIELD: Build privacy-focused query
        // Fetch all announcements where target_parents = true
        const now = new Date().toISOString();
        let query = supabase
            .from('announcements')
            .select(`*, teachers (full_name)`)
            .eq('target_parents', true)
            .or(`scheduled_at.is.null,scheduled_at.lte.${now}`);

        // If we have an adviser ID, filter to show admin posts OR adviser posts only
        if (adviserId) {
            query = query.or(`posted_by_teacher_id.is.null,posted_by_teacher_id.eq.${adviserId}`);
            currentAdviserId = adviserId; // Store for real-time filtering
        } else {
            // No child selected - show only admin announcements (no teacher-specific ones)
            query = query.is('posted_by_teacher_id', null);
            currentAdviserId = null; // No adviser filtering
        }

        // UI FILTERS: Apply user-selected filters
        if (currentFilter === 'class' && adviserId) {
            query = query.eq('posted_by_teacher_id', adviserId);
        } else if (currentFilter === 'general') {
            query = query.is('posted_by_teacher_id', null);
        } else if (currentFilter === 'important') {
            query = query.eq('type', 'important');
        }

        // Order by date
        query = query.order('created_at', { ascending: false });
        
        // THE FIX: Protect the parent's bandwidth!
        query = query.limit(20); // Only load the 20 most recent

        const { data: announcements, error } = await query;

        if (error) throw error;

        allAnnouncements = announcements || [];
        renderAnnouncements();

        document.getElementById('loading-indicator').classList.add('hidden');

        if (allAnnouncements.length > 0) {
            document.getElementById('announcements-list').classList.remove('hidden');
        } else {
            showEmptyState();
        }

    } catch (err) {
        console.error('Announcement load error:', err);
        showEmptyState();
    }
}

/**
 * Setup real-time announcements subscription
 * UPDATED: Filter by adviser for privacy isolation (handles no child selected case)
 */
function setupRealtimeAnnouncements() {
    // Remove existing channel if any
    if (announcementsChannel) {
        supabase.removeChannel(announcementsChannel);
    }

    announcementsChannel = supabase
        .channel('parent-announcements')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'announcements',
            filter: 'target_parents=eq.true'
        }, (payload) => {
            console.log('New announcement received:', payload);
            
            const newAnnouncement = payload.new;
            
            // PARANOIA SHIELD: Only add if from admin (null) or current adviser
            // If no child selected (currentAdviserId is null), only show admin announcements
            if (newAnnouncement.posted_by_teacher_id === null || 
                newAnnouncement.posted_by_teacher_id === currentAdviserId) {
                allAnnouncements.unshift(newAnnouncement);
                renderAnnouncements();
                
                // Show toast notification
                showAnnouncementToast(newAnnouncement);
            }
        })
        .subscribe();
}

/**
 * Show announcement toast notification
 */
function showAnnouncementToast(announcement) {
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 left-4 right-4 bg-green-700 text-white rounded-lg shadow-lg p-4 z-50 animate-slide-in';
    toast.innerHTML = `
        <div class="flex items-start gap-3">
            <span class="text-2xl">📢</span>
            <div class="flex-1">
                <p class="font-bold">New Announcement</p>
                <p class="text-sm truncate">${announcement.title}</p>
            </div>
            <button onclick="this.parentElement.remove()" class="text-green-200 hover:text-white">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('animate-slide-out');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

/**
 * Render announcements list
 */
function renderAnnouncements() {
    const container = document.getElementById('announcements-list');
    
    if (allAnnouncements.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = allAnnouncements.map(announcement => {
        // Handle both admin and teacher posted announcements
        const postedBy = announcement.teachers?.full_name || announcement.admins?.full_name || 'Administrator';
        const postedDate = formatDate(announcement.created_at);
        const relativeTime = getRelativeTime(announcement.created_at);
        
        // Generate preview (first 100 characters)
        const preview = announcement.content.length > 100 
            ? announcement.content.substring(0, 100) + '...'
            : announcement.content;

        return `
            <div 
                onclick="showAnnouncementDetail('${announcement.id}')"
                class="bg-white rounded-xl shadow-md overflow-hidden cursor-pointer transition hover:bg-gray-50"
            >
                <div class="p-4">
                    <div class="flex items-start gap-3">
                        <div class="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm flex-shrink-0">
                            ${getInitials(postedBy)}
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="font-bold text-gray-800 truncate">${announcement.title}</h3>
                            <p class="text-sm text-gray-500">${postedBy} • ${relativeTime}</p>
                        </div>
                    </div>
                    <p class="text-sm text-gray-600 mt-3 line-clamp-3">${preview}</p>
                </div>
                <div class="bg-gray-50 px-4 py-2 flex justify-between items-center">
                    <span class="text-xs text-gray-400">${postedDate}</span>
                    <span class="text-xs text-green-600 font-medium">Read More →</span>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Show announcement detail modal
 */
function showAnnouncementDetail(announcementId) {
    const announcement = allAnnouncements.find(a => a.id == announcementId);
    if (!announcement) return;

    const postedBy = announcement.teachers?.full_name || announcement.admins?.full_name || 'Administrator';

    document.getElementById('modal-title').textContent = announcement.title;
    document.getElementById('modal-date').textContent = formatDate(announcement.created_at);
    document.getElementById('modal-posted-by').textContent = `Posted by ${postedBy}`;
    document.getElementById('modal-content').textContent = announcement.content;

    document.getElementById('announcement-modal').classList.remove('hidden');
}

/**
 * Close modal
 */
function closeModal() {
    document.getElementById('announcement-modal').classList.add('hidden');
}

/**
 * Show empty state
 */
function showEmptyState() {
    document.getElementById('loading-indicator').classList.add('hidden');
    document.getElementById('empty-state').classList.remove('hidden');
}

// Close modal on backdrop click
document.getElementById('announcement-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        closeModal();
    }
});

// Make functions available globally
window.showAnnouncementDetail = showAnnouncementDetail;
window.closeModal = closeModal;

// Listen for child changed event to reload announcements
window.addEventListener('childChanged', () => {
    loadAnnouncements();
});
