// admin/admin-announcements.js

// 1. Session Check
// currentUser is now global in admin-core.js
let allAnnouncements = []; // Store for local filtering

// 2. Initialize Page
document.addEventListener('DOMContentLoaded', () => {
    if (currentUser) {
        document.getElementById('admin-name').innerText = currentUser.full_name || 'Admin';
    }
    
    loadAnnouncements();
    
    // Subscribe to real-time announcement updates
    subscribeToAnnouncements();
    
    // Setup filter button event listeners
    setupFilterButtons();
});

// Setup Filter Button Event Listeners
function setupFilterButtons() {
    const filterAll = document.getElementById('filterAll');
    const filterRecent = document.getElementById('filterRecent');
    const filterStaff = document.getElementById('filterStaff');
    
    if (filterAll) filterAll.addEventListener('click', () => filterAnnouncements('all'));
    if (filterRecent) filterRecent.addEventListener('click', () => filterAnnouncements('recent'));
    if (filterStaff) filterStaff.addEventListener('click', () => filterAnnouncements('staff-only'));
}

// 3. Load Announcements
// UPDATED: Added limit(50) to prevent data avalanche
async function loadAnnouncements() {
    try {
        const { data, error } = await supabase
            .from('announcements')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (error) throw error;
        
        allAnnouncements = data || []; // Store for local filtering
        renderAnnouncements(allAnnouncements);
        
    } catch (error) {
        console.error('Error loading announcements:', error);
        document.getElementById('announcementsList').innerHTML = `
            <div class="p-8 text-center text-red-500">
                Error loading announcements. Please try again.
            </div>
        `;
    }
}

/**
 * Filter Logic for UI Tabs (All, Recent, Staff-only)
 * UPDATED: Added filter logic for All/Recent/Staff-only tabs
 */
function filterAnnouncements(criteria) {
    let filtered = [...allAnnouncements];
    const now = new Date();

    if (criteria === 'recent') {
        // Last 48 hours
        filtered = allAnnouncements.filter(a => {
            const created = new Date(a.created_at);
            return (now - created) < (48 * 60 * 60 * 1000);
        });
    } else if (criteria === 'staff-only') {
        // Only announcements targeting staff roles (teachers, guards, clinic)
        filtered = allAnnouncements.filter(a => a.target_teachers || a.target_guards || a.target_clinic);
    }
    
    // Update active filter button styling
    updateFilterButtons(criteria);
    
    renderAnnouncements(filtered);
}

// Update Filter Button Active Styling
function updateFilterButtons(activeFilter) {
    const buttons = {
        'all': document.getElementById('filterAll'),
        'recent': document.getElementById('filterRecent'),
        'staff-only': document.getElementById('filterStaff')
    };
    
    Object.keys(buttons).forEach(key => {
        const btn = buttons[key];
        if (!btn) return;
        
        if (key === activeFilter) {
            btn.className = 'px-4 py-2 bg-white/80 backdrop-blur-sm border border-gray-200/50 rounded-xl text-sm font-medium text-gray-900 shadow-sm transition-all duration-200';
        } else {
            btn.className = 'px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-all duration-200';
        }
    });
}

// 3b. Subscribe to Real-time Announcements Updates
// Listens for INSERT, UPDATE, DELETE on announcements table
function subscribeToAnnouncements() {
    supabase
        .channel('announcements_changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'announcements'
            },
            (payload) => {
                console.log('Announcement change received:', payload);
                // Reload announcements on any change
                loadAnnouncements();
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Subscribed to announcements changes');
            }
        });
}

// 4. Render Announcements List
function renderAnnouncements(announcements) {
    const container = document.getElementById('announcementsList');
    
    if (announcements.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <p>No announcements yet.</p>
                <p class="text-sm mt-2">Create your first announcement to get started.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = announcements.map(announcement => {
        const targets = getTargetBadges(announcement);
        const preview = announcement.content.length > 150 ? 
            announcement.content.substring(0, 150) + '...' : 
            announcement.content;
        
        // UPDATED: Changed "All Staff" to "Community-wide"
        return `
            <div class="p-6 hover:bg-gray-50 transition cursor-pointer" onclick="viewAnnouncement(${announcement.id})">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <h4 class="text-lg font-semibold text-gray-900">${escapeHtml(announcement.title)}</h4>
                            ${targets.length === 4 ? '<span class="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">Community-wide</span>' : ''}
                        </div>
                        <p class="text-gray-600 mb-2">${escapeHtml(preview)}</p>
                        <div class="flex items-center gap-4 text-sm text-gray-500">
                            <span>${formatDate(announcement.created_at)}</span>
                            <div class="flex gap-1">
                                ${targets.map(t => '<span class="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">' + t + '</span>').join('')}
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="event.stopPropagation(); deleteAnnouncement(${announcement.id})" class="text-red-600 hover:text-red-800 p-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 5. Get Target Badges
function getTargetBadges(announcement) {
    const badges = [];
    if (announcement.target_teachers) badges.push('Teachers');
    if (announcement.target_parents) badges.push('Parents');
    if (announcement.target_guards) badges.push('Guards');
    if (announcement.target_clinic) badges.push('Clinic');
    return badges;
}

// 6. Format Date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Utility: Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============ CREATE ANNOUNCEMENT ============

// 7. Open Create Announcement Modal
function openCreateAnnouncementModal() {
    document.getElementById('announcementTitle').value = '';
    document.getElementById('announcementContent').value = '';
    document.getElementById('targetTeachers').checked = true;
    document.getElementById('targetParents').checked = true;
    document.getElementById('targetGuards').checked = true;
    document.getElementById('targetClinic').checked = true;
    document.getElementById('createAnnouncementModal').classList.remove('hidden');
}

// 8. Close Create Announcement Modal
function closeCreateAnnouncementModal() {
    document.getElementById('createAnnouncementModal').classList.add('hidden');
}

// 9. Publish Announcement
// UPDATED: Added loading state for Publish button
async function publishAnnouncement() {
    const title = document.getElementById('announcementTitle').value.trim();
    const content = document.getElementById('announcementContent').value.trim();
    const targetTeachers = document.getElementById('targetTeachers').checked;
    const targetParents = document.getElementById('targetParents').checked;
    const targetGuards = document.getElementById('targetGuards').checked;
    const targetClinic = document.getElementById('targetClinic').checked;
    
    // Validation
    if (!title || !content) {
        alert('Please fill in the title and content.');
        return;
    }
    
    if (!targetTeachers && !targetParents && !targetGuards && !targetClinic) {
        alert('Please select at least one target audience.');
        return;
    }
    
    // Get the publish button and show loading state
    const btn = document.querySelector('button[onclick="publishAnnouncement()"]');
    if (!btn) {
        console.error('Publish button not found');
        return;
    }
    
    const originalBtnText = btn.innerHTML;
    
    try {
        // Start Loading State
        btn.disabled = true;
        btn.innerHTML = `<svg class="animate-spin h-4 w-4 mr-2 inline" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Publishing...`;

        const { error } = await supabase
            .from('announcements')
            .insert({
                title: title,
                content: content,
                posted_by_admin_id: currentUser.id,
                target_teachers: targetTeachers,
                target_parents: targetParents,
                target_guards: targetGuards,
                target_clinic: targetClinic
            });
        
        if (error) throw error;
        
        closeCreateAnnouncementModal();
        loadAnnouncements();
        
    } catch (error) {
        console.error('Error publishing announcement:', error);
        alert('Error publishing announcement: ' + error.message);
    } finally {
        // Restore button state
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
    }
}

// ============ VIEW ANNOUNCEMENT ============

// 10. View Announcement Details
async function viewAnnouncement(id) {
    try {
        const { data, error } = await supabase
            .from('announcements')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        
        document.getElementById('viewTitle').innerText = data.title;
        document.getElementById('viewContent').innerText = data.content;
        document.getElementById('viewDate').innerText = formatDate(data.created_at);
        
        // Render target badges
        const targets = getTargetBadges(data);
        document.getElementById('viewTargets').innerHTML = targets.map(t => {
            const icons = { Teachers: '👨‍🏫', Parents: '👨‍👩‍👧', Guards: '👮', Clinic: '🏥' };
            return '<span class="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">' + icons[t] + ' ' + t + '</span>';
        }).join('');
        
        document.getElementById('viewAnnouncementModal').classList.remove('hidden');
        
    } catch (error) {
        console.error('Error loading announcement:', error);
        alert('Error loading announcement details.');
    }
}

// 11. Close View Announcement Modal
function closeViewAnnouncementModal() {
    document.getElementById('viewAnnouncementModal').classList.add('hidden');
}

// ============ DELETE ANNOUNCEMENT ============

// 12. Delete Announcement
async function deleteAnnouncement(id) {
    if (!confirm('Are you sure you want to delete this announcement?')) {
        return;
    }
    
    try {
        const { error } = await supabase
            .from('announcements')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        loadAnnouncements();
        
    } catch (error) {
        console.error('Error deleting announcement:', error);
        alert('Error deleting announcement: ' + error.message);
    }
}
