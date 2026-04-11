// clinic/clinic-notifications.js

// ============================================================================
// CLINIC NOTIFICATIONS - FIXED (Buttons, Error Handling, Student Data)
// ============================================================================

// Session Check – ensure currentUser exists
if (typeof currentUser === 'undefined' || !currentUser) {
    console.error('No user session. Redirecting to login...');
    window.location.href = '../login.html';
}

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
        // Set clinic staff name in sidebar and header
        const sidebarName = document.getElementById('clinic-name-sidebar');
        if (sidebarName) sidebarName.textContent = currentUser.full_name || 'Nurse';
        
        const headerName = document.getElementById('clinic-name');
        if (headerName) headerName.textContent = currentUser.full_name || 'Nurse';
        
        await loadNotifications();
        attachGlobalFunctions(); // Ensure all functions are globally accessible
    } else {
        window.location.href = '../login.html';
    }
});

/**
 * Explicitly attach notification handlers to window
 * (Fixes "function not defined" errors for onclick attributes)
 */
function attachGlobalFunctions() {
    window.filterNotifications = filterNotifications;
    window.markAllAsRead = markAllAsRead;
    window.viewNotification = viewNotification;
    window.closeNotificationModal = closeNotificationModal;
}

// ============================================================================
// DATA LOADING (with student join)
// ============================================================================

/**
 * Fetch clinic notifications with student details (JOIN)
 */
async function fetchClinicNotifications() {
    try {
        // Join with students table to get student info directly
        const { data: notifications, error } = await supabase
            .from('notifications')
            .select(`
                *,
                students:student_id (
                    id,
                    full_name,
                    student_id_text,
                    grade_level,
                    section
                )
            `)
            .eq('recipient_id', currentUser.id)          
            .eq('recipient_role', 'clinic_staff')        
            .order('created_at', { ascending: false })
            .limit(100);
        
        if (error) {
            console.error('Error fetching notifications:', error);
            return [];
        }
        
        // Transform to match expected structure
        return (notifications || []).map(n => ({
            ...n,
            students: n.students || null
        }));
        
    } catch (error) {
        console.error('Error fetching clinic notifications:', error);
        return [];
    }
}

/**
 * Load notifications and update UI
 */
async function loadNotifications() {
    try {
        allNotifications = await fetchClinicNotifications();
        renderNotifications();
        updateNotificationStats();
    } catch (error) {
        console.error('Error loading notifications:', error);
        showToast('Failed to load notifications', 'error');
    }
}

/**
 * Update notification statistics cards
 */
function updateNotificationStats() {
    const total = allNotifications.length;
    const unread = allNotifications.filter(n => !n.is_read).length;
    const clinicAlerts = allNotifications.filter(n => 
        n.type === 'clinic_alert' || n.type === 'emergency'
    ).length;
    
    const totalEl = document.getElementById('notif-total');
    const unreadEl = document.getElementById('notif-unread');
    const clinicEl = document.getElementById('notif-clinic');
    
    if (totalEl) totalEl.textContent = total;
    if (unreadEl) unreadEl.textContent = unread;
    if (clinicEl) clinicEl.textContent = clinicAlerts;
}

// ============================================================================
// RENDERING (Fixed empty state & dynamic student display)
// ============================================================================

function renderNotifications() {
    const container = document.getElementById('notifications-list');
    if (!container) return;
    
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
        const formattedTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        
        const isUnread = !notification.is_read;
        const typeStyles = getNotificationTypeStyles(notification.type);
        const studentName = notification.students?.full_name || '';
        
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
                                ${studentName ? `<span>• ${escapeHtml(studentName)}</span>` : ''}
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
 * Get notification type styles (unchanged, kept for reference)
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
// FILTERING (Fixed active tab highlighting)
// ============================================================================

function filterNotifications(filter) {
    currentFilter = filter;
    
    // Update tab styling – more robust selector
    const tabs = ['all', 'unread', 'clinic_alert', 'clinic_clearance'];
    tabs.forEach(tab => {
        const tabEl = document.getElementById(`tab-${tab}`);
        if (tabEl) {
            if (tab === filter) {
                tabEl.classList.remove('bg-white/80', 'text-gray-500');
                tabEl.classList.add('bg-red-500', 'text-white');
            } else {
                tabEl.classList.remove('bg-red-500', 'text-white');
                tabEl.classList.add('bg-white/80', 'text-gray-500');
            }
        }
    });
    
    renderNotifications();
}

// ============================================================================
// ACTIONS (Fixed async error handling)
// ============================================================================

async function viewNotification(notificationId) {
    try {
        const notification = allNotifications.find(n => n.id === notificationId);
        if (!notification) {
            console.warn('Notification not found:', notificationId);
            return;
        }
        
        // Mark as read (don't await to avoid blocking modal)
        markAsRead(notificationId).catch(err => console.error('Mark read error:', err));
        
        // Show modal
        const modal = document.getElementById('notification-modal');
        const modalTitle = document.getElementById('modal-title');
        const modalContent = document.getElementById('modal-content');
        
        if (!modal || !modalTitle || !modalContent) return;
        
        modalTitle.textContent = notification.title;
        
        const date = new Date(notification.created_at);
        const formattedDate = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        const formattedTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        
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
                        <p class="font-semibold text-gray-800">${escapeHtml(notification.students.full_name || '')}</p>
                        <p class="text-sm text-gray-500">${escapeHtml(notification.students.student_id_text || '')} ${escapeHtml(notification.students.grade_level || '')} ${escapeHtml(notification.students.section || '')}</p>
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
    } catch (error) {
        console.error('Error showing notification modal:', error);
        showToast('Could not open notification', 'error');
    }
}

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
            .eq('recipient_id', currentUser.id);
        
        if (error) throw error;
        
        // Update local state
        allNotifications.forEach(n => {
            if (!n.is_read) n.is_read = true;
        });
        
        renderNotifications();
        updateNotificationStats();
        showToast('All notifications marked as read', 'success');
        
    } catch (error) {
        console.error('Error marking all as read:', error);
        showToast('Failed to mark all as read', 'error');
    }
}

function closeNotificationModal() {
    const modal = document.getElementById('notification-modal');
    if (modal) modal.classList.add('hidden');
}

// Close modal on outside click
document.addEventListener('click', (e) => {
    const modal = document.getElementById('notification-modal');
    if (modal && !modal.classList.contains('hidden') && e.target === modal) {
        closeNotificationModal();
    }
});

// ============================================================================
// UTILITIES
// ============================================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const existingToast = document.getElementById('clinic-notif-toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.id = 'clinic-notif-toast';
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transition-all duration-300 ${
        type === 'success' ? 'bg-green-500' :
        type === 'error' ? 'bg-red-500' :
        'bg-blue-500'
    } text-white font-medium`;
    toast.innerText = message;
    
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}