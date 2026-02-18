// clinic/clinic-notifications.js

// ============================================================================
// CLINIC NOTIFICATIONS - JavaScript Logic
// ============================================================================
// Features: View and manage clinic notifications, alerts, and clearances
// ============================================================================

// Session Check
// currentUser is now global in clinic-core.js

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================
let allNotifications = [];
let currentFilter = 'all';

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    if (currentUser) {
        // Set clinic staff name
        const sidebarName = document.getElementById('clinic-name-sidebar');
        if (sidebarName) sidebarName.textContent = currentUser.full_name || 'Nurse';
        
        const headerName = document.getElementById('clinic-name');
        if (headerName) headerName.textContent = currentUser.full_name || 'Nurse';
        
        // Load notifications
        await loadNotifications();
    }
});

// ============================================================================
// DATA LOADING
// ============================================================================

/**
 * Fetch clinic notifications from database
 */
async function fetchClinicNotifications() {
    try {
        const { data: notifications, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('recipient_role', 'clinic')
            .order('created_at', { ascending: false })
            .limit(100);
        
        if (error) {
            console.error('Error fetching notifications:', error);
            return [];
        }
        
        return notifications || [];
        
    } catch (error) {
        console.error('Error fetching clinic notifications:', error);
        return [];
    }
}

/**
 * Load notifications
 */
async function loadNotifications() {
    try {
        allNotifications = await fetchClinicNotifications();
        renderNotifications();
        updateNotificationStats();
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

/**
 * Update notification statistics
 */
function updateNotificationStats() {
    const total = allNotifications.length;
    const unread = allNotifications.filter(n => !n.is_read).length;
    const clinicAlerts = allNotifications.filter(n => 
        n.type === 'clinic_alert' || n.type === 'emergency'
    ).length;
    
    document.getElementById('notif-total').textContent = total;
    document.getElementById('notif-unread').textContent = unread;
    document.getElementById('notif-clinic').textContent = clinicAlerts;
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Render notifications to the list
 */
function renderNotifications() {
    const container = document.getElementById('notifications-list');
    
    let filtered = allNotifications;
    
    if (currentFilter === 'unread') {
        filtered = allNotifications.filter(n => !n.is_read);
    } else if (currentFilter === 'clinic_alert') {
        filtered = allNotifications.filter(n => n.type === 'clinic_alert' || n.type === 'emergency');
    } else if (currentFilter === 'clinic_clearance') {
        filtered = allNotifications.filter(n => n.type === 'clearance_request');
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="p-12 text-center">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                    </svg>
                </div>
                <p class="text-gray-500">No notifications found</p>
                <p class="text-sm text-gray-400 mt-1">Check back later for updates</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filtered.map(notification => {
        const date = new Date(notification.created_at);
        const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const formattedTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        const isUnread = !notification.is_read;
        const typeStyles = getNotificationTypeStyles(notification.type);
        
        return `
            <div onclick="viewNotification('${notification.id}')" 
                class="p-5 hover:bg-gray-50 cursor-pointer transition-all duration-200 border-l-4 ${isUnread ? typeStyles.borderColor : 'border-l-transparent'}">
                <div class="flex items-start justify-between">
                    <div class="flex items-start gap-4">
                        <div class="w-10 h-10 ${typeStyles.bgColor} rounded-xl flex items-center justify-center flex-shrink-0">
                            ${typeStyles.icon}
                        </div>
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                ${isUnread ? '<span class="w-2 h-2 bg-red-500 rounded-full"></span>' : ''}
                                <h4 class="font-semibold text-gray-800">${escapeHtml(notification.title)}</h4>
                            </div>
                            <p class="text-sm text-gray-600 line-clamp-2">${escapeHtml(notification.message)}</p>
                            <div class="flex items-center gap-4 mt-2 text-xs text-gray-400">
                                <span>${formattedDate} ${formattedTime}</span>
                                ${notification.students ? `<span>• ${notification.students.full_name}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        ${notification.priority === 'high' ? '<span class="px-2 py-1 bg-red-100 text-red-600 text-xs rounded-lg font-medium">High Priority</span>' : ''}
                        <svg class="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Get notification type styles
 */
function getNotificationTypeStyles(type) {
    const styles = {
        'clinic_alert': {
            bgColor: 'bg-red-100',
            borderColor: 'border-l-red-500',
            icon: `<svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`
        },
        'clearance_request': {
            bgColor: 'bg-green-100',
            borderColor: 'border-l-green-500',
            icon: `<svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
        },
        'emergency': {
            bgColor: 'bg-red-100',
            borderColor: 'border-l-red-600',
            icon: `<svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
        },
        'visit_update': {
            bgColor: 'bg-blue-100',
            borderColor: 'border-l-blue-500',
            icon: `<svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
        }
    };
    
    return styles[type] || {
        bgColor: 'bg-gray-100',
        borderColor: 'border-l-gray-300',
        icon: `<svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>`
    };
}

// ============================================================================
// FILTERING
// ============================================================================

/**
 * Filter notifications by type
 */
function filterNotifications(filter) {
    currentFilter = filter;
    
    // Update tab styling
    document.querySelectorAll('[id^="tab-"]').forEach(tab => {
        tab.classList.remove('bg-red-500', 'text-white');
        tab.classList.add('bg-white/80', 'text-gray-500');
    });
    
    const activeTab = document.getElementById(`tab-${filter}`);
    if (activeTab) {
        activeTab.classList.remove('bg-white/80', 'text-gray-500');
        activeTab.classList.add('bg-red-500', 'text-white');
    }
    
    renderNotifications();
}

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * View notification details
 */
function viewNotification(notificationId) {
    const notification = allNotifications.find(n => n.id === notificationId);
    if (!notification) return;
    
    // Mark as read
    markAsRead(notificationId);
    
    // Show modal
    const modal = document.getElementById('notification-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content');
    
    modalTitle.textContent = notification.title;
    
    const date = new Date(notification.created_at);
    const formattedDate = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const formattedTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    modalContent.innerHTML = `
        <div class="space-y-4">
            <div class="flex items-center gap-2 text-sm text-gray-500">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span>${formattedDate} at ${formattedTime}</span>
            </div>
            ${notification.students ? `
                <div class="p-4 bg-gray-50 rounded-xl">
                    <p class="text-sm font-medium text-gray-500">Student</p>
                    <p class="font-semibold text-gray-800">${notification.students.full_name}</p>
                    <p class="text-sm text-gray-500">${notification.students.student_id} - ${notification.students.grade_level} ${notification.students.section}</p>
                </div>
            ` : ''}
            <div class="p-4 bg-gray-50 rounded-xl">
                <p class="text-sm font-medium text-gray-500">Message</p>
                <p class="text-gray-800">${escapeHtml(notification.message)}</p>
            </div>
            ${notification.action_url ? `
                <a href="${notification.action_url}" class="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                    </svg>
                    Take Action
                </a>
            ` : ''}
        </div>
    `;
    
    modal.classList.remove('hidden');
}

/**
 * Mark notification as read
 */
async function markAsRead(notificationId) {
    try {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId);
        
        if (error) throw error;
        
        // Update local state
        const notification = allNotifications.find(n => n.id === notificationId);
        if (notification) {
            notification.is_read = true;
        }
        
        renderNotifications();
        updateNotificationStats();
        
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

/**
 * Mark all notifications as read
 */
async function markAllAsRead() {
    try {
        const unreadIds = allNotifications.filter(n => !n.is_read).map(n => n.id);
        
        if (unreadIds.length === 0) {
            alert('No unread notifications');
            return;
        }
        
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .in('id', unreadIds)
            .eq('recipient_id', currentUser.id); // THE SAFETY LOCK
        
        if (error) throw error;
        
        // Update local state
        allNotifications.forEach(n => {
            if (!n.is_read) n.is_read = true;
        });
        
        renderNotifications();
        updateNotificationStats();
        
    } catch (error) {
        console.error('Error marking all as read:', error);
    }
}

/**
 * Close notification modal
 */
function closeNotificationModal() {
    document.getElementById('notification-modal').classList.add('hidden');
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Close modal on outside click
document.addEventListener('click', (e) => {
    const modal = document.getElementById('notification-modal');
    if (modal && !modal.classList.contains('hidden') && e.target === modal) {
        closeNotificationModal();
    }
});
