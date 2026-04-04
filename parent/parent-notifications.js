// parent/parent-notifications.js
// Notifications handling for parents


let allNotifications = [];
let currentFilter = 'all';
let notificationsChannel = null;

/**
 * Initialize notifications page
 */
document.addEventListener('DOMContentLoaded', async () => {
    // FIX: Prevent fatal TypeError crash if the session drops or is still loading
    if (!currentUser || !currentUser.id) return;

    await loadNotifications();
    setupNotificationsRealtime();
});

/**
 * Setup real-time subscription for notifications
 * UPDATED: Phase 2 - Added UPDATE event subscription for is_read changes
 * UPDATED: Added announcement real-time subscription
 */
function setupNotificationsRealtime() {
    // Remove existing channel if any
    if (notificationsChannel) {
        supabase.removeChannel(notificationsChannel);
    }

    notificationsChannel = supabase
        .channel('parent-notifications')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${currentUser.id}`
        }, async (payload) => {
            if (DEBUG) console.log('New notification received:', payload);
            const newNotification = payload.new;
            
            // Add to local notifications
            allNotifications.unshift(newNotification);
            
            // Show toast notification (use core helper)
            if (typeof showNotificationToast === 'function') {
                showNotificationToast(newNotification);
            } else {
                // Fallback to local function
                showNotificationToastLocal(newNotification);
            }
            
            // Re-render
            renderNotifications();
            
            // Update badge
            updateNotificationBadgeCount();
            
            // Dispatch event for dashboard badge update
            window.dispatchEvent(new CustomEvent('notificationsUpdated'));
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${currentUser.id}`
        }, async (payload) => {
            if (DEBUG) console.log('Notification updated:', payload);
            const updatedNotification = payload.new;
            
            // Update local state
            const index = allNotifications.findIndex(n => n.id === updatedNotification.id);
            if (index !== -1) {
                allNotifications[index] = updatedNotification;
            }
            
            // Re-render
            renderNotifications();
            
            // Update badge
            updateNotificationBadgeCount();
        })
        // NEW: Listen for new announcements targeted to parents
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'announcements',
            filter: 'target_parents=eq.true'
        }, async (payload) => {
            if (DEBUG) console.log('New announcement received:', payload);
            const newAnnouncement = payload.new;
            
            // Convert to notification format
            const announcementNotification = {
                id: `ann_${newAnnouncement.id}`,
                title: newAnnouncement.title,
                message: newAnnouncement.content,
                type: 'announcement',
                is_read: false,
                created_at: newAnnouncement.created_at,
                is_announcement: true,
                announcement_id: newAnnouncement.id
            };
            
            // Add to local notifications
            allNotifications.unshift(announcementNotification);
            
            // Sort by date
            allNotifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            // Show toast notification
            showNotificationToastLocal(announcementNotification);
            
            // Re-render
            renderNotifications();
            
            // Update badge
            updateNotificationBadgeCount();
            
            // Dispatch event for dashboard badge update
            window.dispatchEvent(new CustomEvent('notificationsUpdated'));
        })
        .subscribe();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (notificationsChannel) {
            supabase.removeChannel(notificationsChannel);
        }
    });
}

/**
 * Update notification badge count locally
 * Phase 2: Helper for badge updates
 */
function updateNotificationBadgeCount() {
    const unreadCount = allNotifications.filter(n => !n.is_read).length;
    const badge = document.getElementById('notif-badge-quick-action');
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

/**
 * Load all notifications for parent
 * UPDATED: Fixed recipient_role to 'parents' (plural), extract parentId from localStorage
 * FIXED: Also fetch announcements from announcements table where target_parents = true
 */
async function loadNotifications() {
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
        
        if (DEBUG) console.log('Loading notifications for parentId:', parentId, 'role: parents');
        
        const now = new Date().toISOString();
        
        // FIX: Query the correct 'notifications' table with proper recipient_role 'parents' (plural)
        const { data: notifications, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('recipient_id', parentId)
            .eq('recipient_role', 'parents')  // FIX: Use 'parents' (plural) not 'parent'
            .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error('Error loading notifications:', error);
            showEmptyState();
            return;
        }

        // NEW: Also fetch announcements where target_parents = true
        const { data: announcements, error: annError } = await supabase
            .from('announcements')
            .select('*')
            .eq('target_parents', true)
            .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
            .order('created_at', { ascending: false })
            .limit(20);

        if (annError) {
            console.error('Error loading announcements:', annError);
        }

        // Convert announcements to notification format and merge
        const announcementNotifications = (announcements || []).map(ann => ({
            id: `ann_${ann.id}`,  // Prefix to distinguish from regular notifications
            title: ann.title,
            message: ann.content,
            type: 'announcement',
            is_read: false,
            created_at: ann.created_at,
            is_announcement: true,  // Flag to identify announcement-derived notifications
            announcement_id: ann.id
        }));

        // Merge notifications and announcements, then sort by date
        allNotifications = [...(notifications || []), ...announcementNotifications]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 100);  // Limit total to 100

        if (DEBUG) console.log('Notifications loaded:', allNotifications.length, '(includes', announcementNotifications.length, 'announcements)');
        renderNotifications();

        document.getElementById('loading-indicator').classList.add('hidden');
        
        if (allNotifications.length > 0) {
            document.getElementById('notifications-list').classList.remove('hidden');
        } else {
            showEmptyState();
        }

    } catch (err) {
        console.error('Error in loadNotifications:', err);
        showEmptyState();
    }
}

/**
 * Show notification toast for new notifications
 * UPDATED: Phase 2 - Uses core helper if available
 */
function showNotificationToast(notification) {
    // Use core helper if available
    if (typeof window.showNotificationToast === 'function' && window.showNotificationToast !== showNotificationToast) {
        window.showNotificationToast(notification);
        return;
    }
    
    // Fallback: Local toast implementation
    showNotificationToastLocal(notification);
}

/**
 * Fallback toast function (local implementation)
 */
function showNotificationToastLocal(notification) {
    const icon = getNotificationIcon(notification.type);
    const colors = getNotificationColor(notification.type);
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `fixed top-4 left-4 right-4 ${colors.bg} rounded-lg shadow-lg p-4 z-50 animate-slide-in border-l-4 ${colors.border}`;
    toast.innerHTML = `
        <div class="flex items-start gap-3">
            <span class="text-2xl">${icon}</span>
            <div class="flex-1">
                <p class="font-bold text-gray-800">${notification.title}</p>
                <p class="text-sm text-gray-600 truncate">${notification.message}</p>
            </div>
            <button onclick="this.parentElement.remove()" class="text-gray-400 hover:text-gray-600">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.classList.add('animate-slide-out');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

/**
 * Render notifications list
 */
function renderNotifications() {
    const container = document.getElementById('notifications-list');
    
    // Filter notifications by category or exact type
    let filtered;
    if (currentFilter === 'all') {
        filtered = allNotifications;
    } else if (currentFilter === 'gate') {
        // Gate category: gate_entry, gate_exit
        filtered = allNotifications.filter(n => n.type === 'gate_entry' || n.type === 'gate_exit');
    } else if (currentFilter === 'excuse') {
        // Excuse category: excuse_approved, excuse_rejected, excuse_pending
        filtered = allNotifications.filter(n => 
            n.type === 'excuse_approved' || 
            n.type === 'excuse_rejected' || 
            n.type === 'excuse_pending' ||
            n.type === 'excuse'
        );
    } else if (currentFilter === 'announcement') {
        filtered = allNotifications.filter(n => n.type === 'announcement');
    } else if (currentFilter === 'clinic') {
        filtered = allNotifications.filter(n => n.type === 'clinic' || n.type === 'clinic_visit');
    } else {
        filtered = allNotifications.filter(n => n.type === currentFilter);
    }

    if (filtered.length === 0) {
        // Show message for empty filtered results
        const filterLabels = {
            'all': 'No notifications',
            'gate': 'No gate activity notifications',
            'clinic': 'No clinic notifications',
            'excuse': 'No excuse letter notifications',
            'announcement': 'No announcements',
            'early_exit': 'No alert notifications'
        };
        container.innerHTML = `
            <div class="bg-white/80 backdrop-blur-xl rounded-2xl p-8 border border-gray-200/50 text-center">
                <p class="text-gray-500">${filterLabels[currentFilter] || 'No notifications of this type'}</p>
            </div>
        `;
        container.classList.remove('hidden');
        return;
    }

    container.innerHTML = filtered.map(notification => {
        const icon = getNotificationIcon(notification.type);
        const colors = getNotificationColor(notification.type);
        const label = getNotificationLabel(notification.type);
        const isUnread = !notification.is_read;
        const unreadBadge = isUnread ? '<span class="w-2 h-2 bg-blue-500 rounded-full ml-2"></span>' : '';
        
        // Use title/message directly without student_id lookup
        return `
            <div 
                onclick="showNotificationDetail('${notification.id}')"
                class="bg-white rounded-xl shadow-md p-4 cursor-pointer transition hover:bg-gray-50 ${colors.border} border-l-4"
            >
                <div class="flex items-start gap-3">
                    <span class="text-2xl">${icon}</span>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1">
                            <p class="font-bold text-gray-800 truncate">${notification.title}</p>
                            ${unreadBadge}
                        </div>
                        <p class="text-sm text-gray-600 line-clamp-2">${notification.message}</p>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-xs ${colors.icon} font-medium">${label}</span>
                            <span class="text-xs text-gray-400">• ${getRelativeTime(notification.created_at)}</span>
                        </div>
                    </div>
                    <button onclick="event.stopPropagation(); deleteNotification('${notification.id}')" class="text-gray-300 hover:text-red-500 p-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Get notification icon based on type
 * UPDATED: Added gate_entry, gate_exit, late_notification, critical_absence
 */
function getNotificationIcon(type) {
    switch (type) {
        case 'gate_entry': return '🚪';
        case 'gate_exit': return '🚪';
        case 'early_exit': return '⚠️';
        case 'clinic': return '🏥';
        case 'clinic_visit': return '🏥';
        case 'attendance': return '📋';
        case 'late_notification': return '⏰';
        case 'critical_absence': return '⚠️';
        case 'announcement': return '📢';
        case 'excuse_approved': return '✅';
        case 'excuse_rejected': return '❌';
        case 'excuse_pending': return '⏳';
        case 'excuse': return '📝';
        default: return '🔔';
    }
}

/**
 * Get notification color classes based on type
 * UPDATED: Phase 2 - Color coding per notification type
 */
function getNotificationColor(type) {
    switch (type) {
        case 'gate_entry': return { bg: 'bg-green-50', border: 'border-l-green-500', icon: 'text-green-600' };
        case 'gate_exit': return { bg: 'bg-gray-50', border: 'border-l-gray-500', icon: 'text-gray-600' };
        case 'early_exit': return { bg: 'bg-red-50', border: 'border-l-red-500', icon: 'text-red-600' };
        case 'clinic':
        case 'clinic_visit': return { bg: 'bg-red-50', border: 'border-l-red-500', icon: 'text-red-600' };
        case 'attendance': return { bg: 'bg-blue-50', border: 'border-l-blue-500', icon: 'text-blue-600' };
        case 'late_notification': return { bg: 'bg-yellow-50', border: 'border-l-yellow-500', icon: 'text-yellow-600' };
        case 'critical_absence': return { bg: 'bg-red-50', border: 'border-l-red-600', icon: 'text-red-700' };
        case 'announcement': return { bg: 'bg-blue-50', border: 'border-l-blue-500', icon: 'text-blue-600' };
        case 'excuse_approved': return { bg: 'bg-green-50', border: 'border-l-green-500', icon: 'text-green-600' };
        case 'excuse_rejected': return { bg: 'bg-red-50', border: 'border-l-red-500', icon: 'text-red-600' };
        case 'excuse_pending': return { bg: 'bg-yellow-50', border: 'border-l-yellow-500', icon: 'text-yellow-600' };
        case 'excuse': return { bg: 'bg-purple-50', border: 'border-l-purple-500', icon: 'text-purple-600' };
        default: return { bg: 'bg-gray-50', border: 'border-l-gray-500', icon: 'text-gray-600' };
    }
}

/**
 * Get notification label for display
 * UPDATED: Phase 2 - Category labels
 */
function getNotificationLabel(type) {
    switch (type) {
        case 'gate_entry': return 'Gate Entry';
        case 'gate_exit': return 'Gate Exit';
        case 'early_exit': return 'Early Exit Alert';
        case 'clinic':
        case 'clinic_visit': return 'Clinic Visit';
        case 'attendance': return 'Attendance';
        case 'late_notification': return 'Late Arrival';
        case 'critical_absence': return 'Critical Absence';
        case 'announcement': return 'Announcement';
        case 'excuse_approved': return 'Excuse Approved';
        case 'excuse_rejected': return 'Excuse Rejected';
        case 'excuse_pending': return 'Excuse Pending';
        case 'excuse': return 'Excuse Letter';
        default: return 'Notification';
    }
}

/**
 * Filter notifications by type
 * UPDATED: Added gate, excuse, announcement filter categories
 */
function filterNotifications(type) {
    currentFilter = type;
    
    // Update button styles using data-filter attribute
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.dataset.filter === type || 
            (type === 'all' && btn.dataset.filter === 'all')) {
            btn.className = 'filter-btn px-4 py-2 rounded-xl text-sm font-medium bg-green-600 text-white whitespace-nowrap transition-all duration-200';
        } else {
            btn.className = 'filter-btn px-4 py-2 rounded-xl text-sm font-medium bg-white text-gray-600 border border-gray-200 whitespace-nowrap transition-all duration-200';
        }
    });

    renderNotifications();
}

/**
 * Show notification detail modal
 */
async function showNotificationDetail(notificationId) {
    const notification = allNotifications.find(n => n.id == notificationId);
    if (!notification) return;

    // Mark as read
    if (!notification.is_read) {
        await markAsRead(notificationId);
        notification.is_read = true;
        renderNotifications();
    }

    // Show modal
    document.getElementById('modal-icon').textContent = getNotificationIcon(notification.type);
    document.getElementById('modal-title').textContent = notification.title;
    document.getElementById('modal-time').textContent = formatDate(notification.created_at);
    
    // Use textContent for message to prevent XSS
    const modalMessage = document.getElementById('modal-message');
    modalMessage.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'text-gray-700 whitespace-pre-wrap';
    p.textContent = notification.message;
    modalMessage.appendChild(p);
    
    // Add type-specific divs (these are static, safe to use innerHTML)
    if (notification.type === 'clinic') {
        const div = document.createElement('div');
        div.className = 'mt-4 p-3 bg-blue-50 rounded-lg';
        div.innerHTML = '<p class="text-sm text-blue-700">Please contact the school clinic if you have any concerns.</p>';
        modalMessage.appendChild(div);
    }
    if (notification.type === 'early_exit') {
        const div = document.createElement('div');
        div.className = 'mt-4 p-3 bg-yellow-50 rounded-lg';
        div.innerHTML = '<p class="text-sm text-yellow-700">⚠️ This is an unauthorized early exit. Please explain the reason to the school.</p>';
        modalMessage.appendChild(div);
    }

    document.getElementById('notification-modal').classList.remove('hidden');
}

/**
 * Mark notification as read
 * UPDATED: Handle announcement-derived notifications (prefixed with 'ann_')
 */
async function markAsRead(notificationId) {
    try {
        // Skip marking announcements as read in notifications table (they're not stored there)
        if (notificationId.toString().startsWith('ann_')) {
            if (DEBUG) console.log('Announcement notifications are read-only (not stored in notifications table)');
            return;
        }
        
        await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId);
    } catch (err) {
        console.error('Error marking notification as read:', err);
    }
}

/**
 * Mark all notifications as read
 * UPDATED: Fixed recipient_role to 'parents' (plural)
 */
async function markAllRead() {
    try {
        // FIX: Get parentId from localStorage
        const userStr = localStorage.getItem('educare_user') || sessionStorage.getItem('educare_user');
        if (!userStr) return;
        const user = JSON.parse(userStr);
        const parentId = user.id;
        
        await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('recipient_id', parentId)
            .eq('recipient_role', 'parents')  // FIX: Use 'parents' (plural)
            .eq('is_read', false);

        // Update local state
        allNotifications.forEach(n => n.is_read = true);
        renderNotifications();

        // Dispatch event for dashboard badge update
        window.dispatchEvent(new CustomEvent('notificationsUpdated'));

    } catch (err) {
        console.error('Error marking all as read:', err);
    }
}

/**
 * Delete a notification
 * UPDATED: Handle announcement-derived notifications
 */
async function deleteNotification(notificationId) {
    // Handle announcement-derived notifications (prefixed with 'ann_')
    if (notificationId.toString().startsWith('ann_')) {
        // For announcements, just remove from local display
        if (!confirm('Remove this announcement from your notifications list?')) return;
        
        // Update local state only
        allNotifications = allNotifications.filter(n => n.id != notificationId);
        renderNotifications();
        return;
    }
    
    if (!confirm('Delete this notification?')) return;

    try {
        await supabase
            .from('notifications')
            .delete()
            .eq('id', notificationId);

        // Update local state
        allNotifications = allNotifications.filter(n => n.id != notificationId);
        renderNotifications();

    } catch (err) {
        console.error('Error deleting notification:', err);
    }
}

/**
 * Close modal
 */
function closeModal() {
    document.getElementById('notification-modal').classList.add('hidden');
}

/**
 * Show empty state
 */
function showEmptyState() {
    document.getElementById('loading-indicator').classList.add('hidden');
    document.getElementById('empty-state').classList.remove('hidden');
}

// Close modal on backdrop click
document.getElementById('notification-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        closeModal();
    }
});

// Make functions available globally
window.showNotificationDetail = showNotificationDetail;
window.markAllRead = markAllRead;
window.deleteNotification = deleteNotification;
window.closeModal = closeModal;
window.filterNotifications = filterNotifications;
