// parent/parent-notifications.js
// Notifications handling for parents

let allNotifications = [];
let currentFilter = 'all';
let notificationsChannel = null;

/**
 * Initialize notifications page
 */
document.addEventListener('DOMContentLoaded', async () => {
    await loadNotifications();
    setupNotificationsRealtime();
});

/**
 * Setup real-time subscription for notifications
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
            console.log('New notification received:', payload);
            const newNotification = payload.new;
            
            // Add to local notifications
            allNotifications.unshift(newNotification);
            
            // Show toast notification
            showNotificationToast(newNotification);
            
            // Re-render
            renderNotifications();
            
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
 * Load all notifications for parent
 */
async function loadNotifications() {
    try {
        const { data: notifications, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('recipient_id', currentUser.id)
            .eq('recipient_role', 'parent')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error('Error loading notifications:', error);
            showEmptyState();
            return;
        }

        allNotifications = notifications || [];
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
 */
function showNotificationToast(notification) {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 left-4 right-4 bg-white rounded-lg shadow-lg p-4 z-50 animate-slide-in';
    toast.innerHTML = `
        <div class="flex items-start gap-3">
            <span class="text-2xl">${getNotificationIcon(notification.type)}</span>
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
    
    // Filter notifications
    const filtered = currentFilter === 'all' 
        ? allNotifications 
        : allNotifications.filter(n => n.type === currentFilter);

    if (filtered.length === 0) {
        // Show message for empty filtered results
        const filterLabels = {
            'all': 'No notifications',
            'attendance': 'No attendance notifications',
            'clinic': 'No clinic notifications',
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
        const isUnread = !notification.is_read;
        const unreadBadge = isUnread ? '<span class="w-2 h-2 bg-blue-500 rounded-full ml-2"></span>' : '';
        
        // Use title/message directly without student_id lookup
        return `
            <div 
                onclick="showNotificationDetail('${notification.id}')"
                class="bg-white rounded-xl shadow-md p-4 cursor-pointer transition hover:bg-gray-50 ${isUnread ? 'border-l-4 border-green-500' : ''}"
            >
                <div class="flex items-start gap-3">
                    <span class="text-2xl">${icon}</span>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1">
                            <p class="font-bold text-gray-800 truncate">${notification.title}</p>
                            ${unreadBadge}
                        </div>
                        <p class="text-sm text-gray-600 line-clamp-2">${notification.message}</p>
                        <p class="text-xs text-gray-400 mt-1">${getRelativeTime(notification.created_at)}</p>
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
 */
function getNotificationIcon(type) {
    switch (type) {
        case 'early_exit': return '⚠️';
        case 'clinic': return '🏥';
        case 'attendance': return '📋';
        case 'announcement': return '📢';
        case 'excuse_approved': return '✅';
        case 'excuse_rejected': return '❌';
        case 'excuse_pending': return '⏳';
        default: return '🔔';
    }
}

/**
 * Filter notifications by type
 */
function filterNotifications(type) {
    currentFilter = type;
    
    // Update button styles using data-filter attribute
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.dataset.filter === type || 
            (type === 'all' && btn.dataset.filter === 'all')) {
            btn.className = 'filter-btn px-4 py-2 rounded-full text-sm bg-green-700 text-white whitespace-nowrap';
        } else {
            btn.className = 'filter-btn px-4 py-2 rounded-full text-sm bg-white text-gray-600 border whitespace-nowrap';
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
 */
async function markAsRead(notificationId) {
    try {
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
 */
async function markAllRead() {
    try {
        await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('recipient_id', currentUser.id)
            .eq('recipient_role', 'parent')
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
 */
async function deleteNotification(notificationId) {
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
