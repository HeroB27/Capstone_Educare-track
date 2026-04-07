// parent-core.js – Core session, child switcher, realtime, sidebar navigation
// Must be loaded after supabase-client.js and general-core.js

let currentUser = null;
let allChildren = [];
let currentChild = null;
let realtimeChannel = null;
let notificationChannel = null;

// Wait for DOM and Supabase
document.addEventListener('DOMContentLoaded', async () => {
    // Check session
    currentUser = checkSession('parents');
    if (!currentUser) return;
    window.currentUser = currentUser;

    // Update welcome message if element exists
    const welcomeEl = document.getElementById('parent-name');
    if (welcomeEl) {
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
        welcomeEl.innerText = `${greeting}, ${currentUser.full_name.split(' ')[0]}`;
    }

    // Load children
    await loadChildren();

    // Setup realtime subscriptions
    setupRealtimeSubscriptions();
    setupNotificationRealtime();
    await updateNotificationBadge();

    // Initialize sidebar (injects HTML, CSS, toggle button)
    initSidebar();

    // Update sidebar header after children loaded
    updateSidebarHeader();

    // Trigger initial dashboard refresh if on dashboard page
    if (typeof refreshDashboard === 'function') await refreshDashboard();
    if (typeof loadAttendanceCalendar === 'function') await loadAttendanceCalendar();
    if (typeof loadAnnouncements === 'function') await loadAnnouncements();
});

// -------------------- Child Management --------------------
async function loadChildren() {
    try {
        const { data: children, error } = await supabase
            .from('students')
            .select('*, classes(grade_level, department)')
            .eq('parent_id', currentUser.id);
        if (error) throw error;

        allChildren = children || [];
        const savedId = localStorage.getItem('educare_selected_child');
        currentChild = savedId ? allChildren.find(c => c.id == savedId) : allChildren[0] || null;

        window.allChildren = allChildren;
        window.currentChild = currentChild;

        updateChildSwitcher();
        if (currentChild) {
            localStorage.setItem('educare_selected_child', currentChild.id);
            document.dispatchEvent(new CustomEvent('childChanged', { detail: currentChild }));
        }
    } catch (err) {
        console.error('loadChildren error:', err);
    }
}

function updateChildSwitcher() {
    const container = document.getElementById('child-switcher');
    if (!container) return;

    if (allChildren.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No children linked</p>';
        return;
    }

    if (allChildren.length === 1) {
        const child = allChildren[0];
        container.innerHTML = `
            <div class="flex items-center gap-2">
                <div class="h-10 w-10 rounded-full bg-green-600 flex items-center justify-center text-white font-bold">
                    ${getInitials(child.full_name)}
                </div>
                <div>
                    <p class="font-bold text-gray-800">${escapeHtml(child.full_name)}</p>
                    <p class="text-xs text-gray-500">${child.classes?.grade_level || ''} ${child.classes?.department || ''}</p>
                </div>
            </div>
        `;
    } else {
        container.innerHTML = `
            <select id="child-select" class="w-full p-2 border rounded-lg bg-white">
                ${allChildren.map(child => `
                    <option value="${child.id}" ${currentChild?.id === child.id ? 'selected' : ''}>
                        ${escapeHtml(child.full_name)} (${child.classes?.grade_level || 'N/A'})
                    </option>
                `).join('')}
            </select>
        `;
        document.getElementById('child-select')?.addEventListener('change', (e) => switchChild(e.target.value));
    }
}

async function switchChild(childId) {
    const child = allChildren.find(c => c.id == childId);
    if (!child) return;
    currentChild = child;
    window.currentChild = currentChild;
    localStorage.setItem('educare_selected_child', childId);
    updateChildSwitcher();
    updateSidebarHeader();

    // Recreate realtime subscriptions for new child
    setupRealtimeSubscriptions();

    document.dispatchEvent(new CustomEvent('childChanged', { detail: child }));
    if (typeof refreshDashboard === 'function') await refreshDashboard();
    if (typeof loadAttendanceCalendar === 'function') await loadAttendanceCalendar();
}

// -------------------- Realtime Subscriptions --------------------
function setupRealtimeSubscriptions() {
    if (!currentChild) return;
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);

    realtimeChannel = supabase
        .channel(`parent-updates-${currentChild.id}`)
        .on('postgres_changes', {
            event: '*', schema: 'public', table: 'attendance_logs',
            filter: `student_id=eq.${currentChild.id}`
        }, async () => {
            if (typeof refreshDashboard === 'function') await refreshDashboard();
            if (typeof loadAttendanceCalendar === 'function') await loadAttendanceCalendar();
        })
        .on('postgres_changes', {
            event: '*', schema: 'public', table: 'clinic_visits',
            filter: `student_id=eq.${currentChild.id}`
        }, async () => {
            if (typeof refreshDashboard === 'function') await refreshDashboard();
        })
        .subscribe();
}

function setupNotificationRealtime() {
    if (!currentUser) return;
    if (notificationChannel) supabase.removeChannel(notificationChannel);

    notificationChannel = supabase
        .channel('parent-notifications')
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'notifications',
            filter: `recipient_id=eq.${currentUser.id}`
        }, async () => {
            await updateNotificationBadge();
            if (typeof loadNotificationsPreview === 'function') await loadNotificationsPreview();
        })
        .subscribe();
}

async function updateNotificationBadge() {
    const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', currentUser.id)
        .eq('is_read', false);
    const badges = document.querySelectorAll('#notif-badge-quick-action, #notif-badge-quick-action-2');
    badges.forEach(badge => {
        if (count > 0) {
            badge.textContent = count > 9 ? '9+' : count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    });
}

// -------------------- Navigation --------------------
function navigateTo(page) {
    const pages = {
        dashboard: 'parent-dashboard.html',
        children: 'parent-children.html',
        announcements: 'parent-announcements-board.html',
        excuse: 'parent-excuse-letter-template.html',
        schedule: 'parent-schedule.html',
        calendar: 'parent-calendar.html',
        attendance: 'parent-childs-attendance.html',
        notifications: 'parent-notifications.html',
        settings: 'parent-settings.html'
    };
    const url = pages[page];
    if (url) window.location.href = url;
    else console.error('Unknown page:', page);
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        sessionStorage.removeItem('educare_user');
        localStorage.removeItem('educare_selected_child');
        window.location.href = '../index.html';
    }
}

// -------------------- Sidebar --------------------
function initSidebar() {
    // Inject CSS if not present
    if (!document.querySelector('#parent-sidebar-style')) {
        const style = document.createElement('style');
        style.id = 'parent-sidebar-style';
        style.textContent = `
            /* Parent Sidebar Styles */
            #sidebar-backdrop {
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.5); backdrop-filter: blur(8px);
                z-index: 1000; opacity: 0; visibility: hidden;
                transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
            }
            #sidebar-backdrop.show { opacity: 1; visibility: visible; }
            #parent-sidebar {
                position: fixed; top: 0; left: 0; height: 100vh; width: 280px; max-width: 85vw;
                background: linear-gradient(135deg, #fff 0%, #f8fafc 50%, #f1f5f9 100%);
                border-right: 1px solid #e2e8f0; box-shadow: 4px 0 24px rgba(0,0,0,0.15);
                transform: translateX(-100%); transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
                z-index: 1001; display: flex; flex-direction: column; overflow-y: auto;
            }
            #parent-sidebar.show { transform: translateX(0); }
            .sidebar-header { padding: 1.5rem; background: linear-gradient(135deg, #10b981, #059669); color: white; }
            .sidebar-header h2 { font-size: 1.25rem; font-weight: 800; margin: 0; }
            .sidebar-header p { margin: 0.25rem 0 0; opacity: 0.9; font-size: 0.875rem; }
            .sidebar-nav { flex: 1; padding: 0.5rem 0; }
            .sidebar-item {
                display: flex; align-items: center; gap: 1rem; padding: 0.875rem 1.5rem;
                color: #64748b; font-weight: 500; text-decoration: none; transition: all 0.2s ease;
                border-left: 3px solid transparent; cursor: pointer;
            }
            .sidebar-item:hover { background: #f1f5f9; color: #10b981; border-left-color: #10b981; }
            .sidebar-item.active { background: #dcfce7; color: #059669; border-left-color: #10b981; font-weight: 600; }
            .sidebar-icon { width: 20px; height: 20px; flex-shrink: 0; opacity: 0.8; }
            .sidebar-bottom { padding: 1rem 1.5rem 1.5rem; border-top: 1px solid #e2e8f0; }
            .sidebar-divider { height: 1px; background: #e2e8f0; margin: 1rem 0; }
            #sidebar-toggle { background: none; border: none; padding: 0.75rem; border-radius: 0.75rem; cursor: pointer; }
            #sidebar-toggle:hover { background: #f3f4f6; }
            #sidebar-toggle svg { width: 20px; height: 20px; stroke-width: 2.5; stroke: #6b7280; }
            #sidebar-toggle:hover svg { stroke: #10b981; }
            body.sidebar-open { overflow: hidden; position: fixed; width: 100%; }
        `;
        document.head.appendChild(style);
    }

    // Inject sidebar HTML if not exists
    if (!document.getElementById('parent-sidebar')) {
        const sidebarHTML = `
            <div id="parent-sidebar">
                <div class="sidebar-header">
                    <h2 id="sidebar-parent-name">Parent Portal</h2>
                    <p id="sidebar-child-name">Select child</p>
                </div>
                <nav class="sidebar-nav">
                    <a class="sidebar-item" data-page="dashboard" onclick="sidebarNavigate('dashboard')">
                        <svg class="sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                        <span>Home</span>
                    </a>
                    <a class="sidebar-item" data-page="children" onclick="sidebarNavigate('children')">
                        <svg class="sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                        <span>My Children</span>
                    </a>
                    <a class="sidebar-item" data-page="announcements" onclick="sidebarNavigate('announcements')">
                        <svg class="sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg>
                        <span>Announcements</span>
                    </a>
                    <a class="sidebar-item" data-page="excuse" onclick="sidebarNavigate('excuse')">
                        <svg class="sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        <span>Excuse Letters</span>
                    </a>
                    <a class="sidebar-item" data-page="schedule" onclick="sidebarNavigate('schedule')">
                        <svg class="sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        <span>Schedule</span>
                    </a>
                    <a class="sidebar-item" data-page="calendar" onclick="sidebarNavigate('calendar')">
                        <svg class="sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2zM12 9v3m0 0l3 3m-3-3h3m-3 4H9m12 0h-.01"/></svg>
                        <span>Calendar</span>
                    </a>
                </nav>
                <div class="sidebar-bottom">
                    <div class="sidebar-divider"></div>
                    <a class="sidebar-item" data-page="settings" onclick="sidebarNavigate('settings')">
                        <svg class="sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        <span>Settings</span>
                    </a>
                    <button onclick="logout()" class="sidebar-item w-full text-left">
                        <svg class="sidebar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                        <span>Logout</span>
                    </button>
                </div>
            </div>
            <div id="sidebar-backdrop" onclick="closeSidebar()"></div>
        `;
        document.body.insertAdjacentHTML('beforeend', sidebarHTML);
    }

    // Add hamburger toggle button to header
    addHamburgerToggle();

    // Set active sidebar item based on current page
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '');
    const pageMap = {
        'parent-dashboard': 'dashboard',
        'parent-children': 'children',
        'parent-announcements-board': 'announcements',
        'parent-excuse-letter-template': 'excuse',
        'parent-schedule': 'schedule',
        'parent-calendar': 'calendar',
        'parent-childs-attendance': 'attendance',
        'parent-settings': 'settings'
    };
    const activePage = pageMap[currentPage] || 'dashboard';
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === activePage) item.classList.add('active');
    });
}

function addHamburgerToggle() {
    if (document.getElementById('sidebar-toggle')) return;
    const headerRow = document.querySelector('header .flex.items-center.justify-between');
    if (!headerRow) return;
    const firstDiv = headerRow.children[0];
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'sidebar-toggle';
    toggleBtn.className = 'p-2 hover:bg-gray-100 rounded-xl transition-colors mr-2';
    toggleBtn.innerHTML = `<svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>`;
    toggleBtn.onclick = () => toggleSidebar();
    firstDiv.insertBefore(toggleBtn, firstDiv.firstChild);
}

function toggleSidebar() {
    const sidebar = document.getElementById('parent-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    sidebar.classList.toggle('show');
    backdrop.classList.toggle('show');
    document.body.classList.toggle('sidebar-open');
}

function closeSidebar() {
    const sidebar = document.getElementById('parent-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    sidebar.classList.remove('show');
    backdrop.classList.remove('show');
    document.body.classList.remove('sidebar-open');
}

function sidebarNavigate(page) {
    closeSidebar();
    navigateTo(page);
}

function updateSidebarHeader() {
    const parentNameEl = document.getElementById('sidebar-parent-name');
    const childNameEl = document.getElementById('sidebar-child-name');
    if (parentNameEl) parentNameEl.textContent = currentUser?.full_name || 'Parent Portal';
    if (childNameEl) childNameEl.textContent = currentChild ? currentChild.full_name : 'No child selected';
}

// Helper
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Expose globals
window.navigateTo = navigateTo;
window.logout = logout;
window.switchChild = switchChild;
window.updateNotificationBadge = updateNotificationBadge;
window.sidebarNavigate = sidebarNavigate;
window.closeSidebar = closeSidebar;
window.toggleSidebar = toggleSidebar;