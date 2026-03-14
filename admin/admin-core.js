// admin/admin-core.js

// Subscription Manager to prevent WebSocket memory leaks from multiplying on page navigation.
let activeRealtimeSubscriptions = [];

/**
 * Unsubscribes from all currently active Supabase real-time channels.
 * This should be called before loading new page content in a Single Page Application.
 */
function cleanupAllSubscriptions() {
    activeRealtimeSubscriptions.forEach(sub => {
        if (sub && typeof sub.unsubscribe === 'function') {
            supabase.removeChannel(sub);
        }
    });
    activeRealtimeSubscriptions = [];
}

/**
 * Registers a new subscription for future cleanup.
 * @param {RealtimeChannel} subscription - The subscription object returned by supabase.channel().
 */
function addSubscription(subscription) {
    activeRealtimeSubscriptions.push(subscription);
}

document.addEventListener('DOMContentLoaded', () => {
    const user = checkSession('admins');
    if (!user) return;
    
    // Load and apply theme preferences
    loadAndApplyTheme();
    
    // UI Branding with time-based greeting and weekend support
    const adminNameEl = document.getElementById('admin-name');
    if (adminNameEl) {
        const now = new Date();
        const day = now.getDay(); // 0 = Sunday, 6 = Saturday
        const hour = now.getHours();
        
        let greeting;
        
        // Check if it's weekend
        if (day === 0) {
            greeting = 'Happy Sunday';
        } else if (day === 6) {
            greeting = 'Happy Saturday';
        } else if (hour < 12) {
            greeting = 'Good Morning';
        } else if (hour < 18) {
            greeting = 'Good Afternoon';
        } else {
            greeting = 'Good Evening';
        }
        
        adminNameEl.innerText = `${greeting}, ${(user.full_name || 'Admin').split(' ')[0]}`;
    }
    
    // Auto-run if elements exist
    if (document.getElementById('stat-present')) {
        loadDashboardStats(); // Initial load
        
        // Real-time subscription for dashboard stats
        const dashboardSub = supabase.channel('dashboard-stats-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => loadDashboardStats())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'clinic_visits' }, () => loadDashboardStats())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => loadDashboardStats())
            .subscribe();
        addSubscription(dashboardSub);
    }
    if (document.getElementById('recent-announcements-list')) loadRecentAnnouncements();
    
    lucide.createIcons();
});

async function loadDashboardStats() {
    // PERMANENT FIX: Force strict Philippine Timezone (Asia/Manila)
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
    const todayStart = today + 'T00:00:00+08:00'; // +08:00 ensures Supabase calculates from midnight PHT
    
    try {
        // Parallel execution for maximum speed
        const [teachers, students, present, late, absent, clinic] = await Promise.all([
            supabase.from('teachers').select('*', { count: 'exact', head: true }).eq('is_active', true),
            supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'Enrolled'),
            supabase.from('attendance_logs').select('*', { count: 'exact', head: true }).eq('log_date', today).in('status', ['Present', 'On Time', 'Excused']),
            supabase.from('attendance_logs').select('*', { count: 'exact', head: true }).eq('log_date', today).eq('status', 'Late'),
            supabase.from('attendance_logs').select('*', { count: 'exact', head: true }).eq('log_date', today).eq('status', 'Absent'),
            // FIX: Explicitly check for 'In Clinic' status along with today's date
            supabase.from('clinic_visits').select('*', { count: 'exact', head: true }).eq('status', 'In Clinic').gte('time_in', todayStart)
        ]);

        document.getElementById('stat-total-teachers').innerText = teachers.count || 0;
        document.getElementById('stat-total-students').innerText = students.count || 0;
        document.getElementById('stat-present').innerText = present.count || 0;
        document.getElementById('stat-late').innerText = late.count || 0;
        document.getElementById('stat-absent').innerText = absent.count || 0;
        document.getElementById('stat-clinic').innerText = clinic.count || 0;
    } catch (err) {
        console.error("Dashboard Stats Error:", err);
    }
}

async function loadRecentAnnouncements() {
    const list = document.getElementById('recent-announcements-list');
    if (!list) return;

    const fetchAndRender = async () => {
        try {
            const { data, error } = await supabase
                .from('announcements')
                .select('title, content, created_at')
                .order('created_at', { ascending: false })
                .limit(5);

            if (error || !data?.length) {
                list.innerHTML = '<tr><td class="px-8 py-12 text-center text-gray-400 font-medium italic">No announcements found.</td></tr>';
                return;
            }

            list.innerHTML = data.map(log => `
                <tr class="hover:bg-violet-50/50 transition-colors">
                    <td class="px-8 py-5">
                        <p class="font-bold text-gray-800 text-sm">${log.title}</p>
                        <p class="text-xs text-gray-500 truncate max-w-md">${log.content}</p>
                    </td>
                    <td class="px-8 py-5 text-right text-xs font-medium text-gray-400">
                        ${new Date(log.created_at).toLocaleDateString()}
                    </td>
                </tr>`).join('');
            lucide.createIcons();
        } catch (e) { console.error(e); }
    };

    await fetchAndRender();

    const announcementsSub = supabase.channel('public-announcements-dashboard')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, payload => {
            fetchAndRender();
        })
        .subscribe();
    addSubscription(announcementsSub);
}

// ===========================================
// THEME SYSTEM - Applied to all admin pages
// ===========================================

function loadAndApplyTheme() {
    const theme = JSON.parse(localStorage.getItem('educare_theme') || '{}');
    
    // Apply accent color theme
    if (theme.accentColor) {
        document.body.classList.remove('theme-violet', 'theme-blue', 'theme-emerald', 'theme-amber', 'theme-rose');
        document.body.classList.add(`theme-${theme.accentColor}`);
        updateAccentColorButtons(theme.accentColor);
    }
    
    // Apply sidebar style
    if (theme.sidebarStyle) {
        document.body.classList.remove('sidebar-dark', 'sidebar-light');
        document.body.classList.add(`sidebar-${theme.sidebarStyle}`);
    }
    
    // Apply compact mode
    if (theme.compactMode) {
        document.body.classList.add('compact-mode');
    }
}

function updateAccentColorButtons(activeColor) {
    // Update any accent color buttons if they exist on the page
    const buttons = document.querySelectorAll('[data-color-btn]');
    buttons.forEach(btn => {
        const color = btn.getAttribute('data-color-btn');
        if (color === activeColor) {
            btn.classList.add('ring-2', 'ring-offset-2');
            btn.classList.remove('ring-transparent');
        } else {
            btn.classList.remove('ring-2', 'ring-offset-2');
            btn.classList.add('ring-transparent');
        }
    });
}

// Clean up real-time subscriptions to prevent memory leaks on page exit
window.addEventListener('beforeunload', cleanupAllSubscriptions);