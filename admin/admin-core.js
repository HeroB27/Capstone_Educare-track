// admin/admin-core.js

document.addEventListener('DOMContentLoaded', () => {
    const user = checkSession('admins');
    if (!user) return;
    
    // UI Branding
    const adminNameEl = document.getElementById('admin-name');
    if (adminNameEl) adminNameEl.innerText = user.full_name || 'Admin';
    
    // Auto-run if elements exist
    if (document.getElementById('stat-present')) {
        loadDashboardStats(); // Initial load
        
        // Real-time subscription for dashboard stats
        supabase.channel('dashboard-stats-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => loadDashboardStats())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'clinic_visits' }, () => loadDashboardStats())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => loadDashboardStats())
            .subscribe();
    }
    if (document.getElementById('recent-announcements-list')) loadRecentAnnouncements();
    
    lucide.createIcons();
});

async function loadDashboardStats() {
    const today = new Date().toISOString().split('T')[0];
    try {
        // Parallel execution for maximum speed
        const [students, present, late, absent, clinic] = await Promise.all([
            supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'Enrolled'),
            supabase.from('attendance_logs').select('*', { count: 'exact', head: true }).eq('log_date', today).eq('status', 'Present'),
            supabase.from('attendance_logs').select('*', { count: 'exact', head: true }).eq('log_date', today).eq('status', 'Late'),
            supabase.from('attendance_logs').select('*', { count: 'exact', head: true }).eq('log_date', today).eq('status', 'Absent'),
            supabase.from('clinic_visits').select('*', { count: 'exact', head: true }).is('time_out', null)
        ]);

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

    supabase.channel('public-announcements-dashboard')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, payload => {
            fetchAndRender();
        })
        .subscribe();
}