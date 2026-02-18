// UPDATED: Admin Dashboard Stats with real Supabase queries
// Queries attendance_logs and clinic_visits tables for live data

async function loadDashboardStats() {
    console.log("Fetching live dashboard data...");
    const today = new Date().toISOString().split('T')[0];

    try {
        // 1. Fetch Present Count (includes both Present and On Time)
        const { count: presentCount, error: pError } = await supabase
            .from('attendance_logs')
            .select('*', { count: 'exact', head: true })
            .eq('log_date', today)
            .in('status', ['Present', 'On Time']);

        // 2. Fetch Late Count
        const { count: lateCount, error: lError } = await supabase
            .from('attendance_logs')
            .select('*', { count: 'exact', head: true })
            .eq('log_date', today)
            .eq('status', 'Late');

        // 3. Fetch Clinic Visits (Today)
        const { count: clinicCount, error: cError } = await supabase
            .from('clinic_visits')
            .select('*', { count: 'exact', head: true })
            .gte('time_in', `${today}T00:00:00`)
            .lte('time_in', `${today}T23:59:59`);

        // Update UI
        if (!pError) document.getElementById('stat-present').innerText = presentCount || 0;
        if (!lError) document.getElementById('stat-late').innerText = lateCount || 0;
        if (!cError) document.getElementById('stat-clinic').innerText = clinicCount || 0;

    } catch (err) {
        console.error("Dashboard error:", err);
    }
}

// UPDATED: Load Recent Activity with clinic visits support
// Fetches from both attendance_logs and clinic_visits tables based on filter
async function loadRecentActivity(filter = 'all') {
    const list = document.getElementById('recent-activity-list');
    if (!list) return;

    list.innerHTML = '<div class="p-4 text-center text-gray-500">Loading activity...</div>';

    try {
        let logs = [];

        // 1. Fetch Gate Attendance Logs
        if (filter === 'all' || filter === 'entry' || filter === 'exit') {
            const { data: attendanceData, error: attError } = await supabase
                .from('attendance_logs')
                .select(`
                    id, time_in, time_out, status, log_date,
                    students (full_name, classes(grade_level, section_name))
                `)
                .eq('log_date', today)
                .order('time_in', { ascending: false })
                .limit(15);

            if (attError) throw attError;

            const attendanceActivities = (attendanceData || []).map(log => {
                const isExit = log.time_out !== null && filter === 'exit';
                const timeStr = isExit ? log.time_out : log.time_in;
                
                return {
                    type: isExit ? 'exit' : 'entry',
                    time: timeStr ? new Date(timeStr) : new Date(log.log_date),
                    student: log.students?.full_name || 'Unknown Student',
                    details: `${log.students?.classes?.grade_level || 'N/A'} - ${log.status}`,
                    status: log.status,
                    icon: '🚶',
                    color: log.status === 'Late' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                };
            });

            logs = [...logs, ...attendanceActivities.filter(a => filter === 'all' || a.type === filter)];
        }

        // 2. Fetch Clinic Visits
        if (filter === 'all' || filter === 'clinic') {
            const { data: clinicData, error: clinicError } = await supabase
                .from('clinic_visits')
                .select(`
                    id, time_in, reason, status,
                    students (full_name, classes(grade_level))
                `)
                .order('time_in', { ascending: false })
                .limit(20);

            if (clinicError) throw clinicError;

            const clinicActivities = (clinicData || []).map(visit => ({
                type: 'clinic',
                time: new Date(visit.time_in),
                student: visit.students?.full_name || 'Unknown',
                details: `Clinic: ${visit.reason}`,
                status: visit.status,
                icon: '🏥',
                color: 'bg-red-100 text-red-700'
            }));

            logs = [...logs, ...clinicActivities];
        }

        // 3. Sort combined logs by time (newest first) and render
        logs.sort((a, b) => b.time - a.time);
        
        if (logs.length === 0) {
            list.innerHTML = '<div class="p-4 text-center text-gray-500">No recent activity found.</div>';
            return;
        }

        list.innerHTML = logs.slice(0, 15).map(log => `
            <div class="flex items-start gap-4 p-3 hover:bg-gray-50 rounded-lg transition border-b border-gray-100 last:border-0">
                <div class="h-10 w-10 rounded-full flex items-center justify-center text-xl shrink-0 ${log.color.split(' ')[0]}">
                    ${log.icon}
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-gray-800 truncate">${log.student}</p>
                    <p class="text-xs text-gray-500 truncate">${log.details}</p>
                </div>
                <div class="text-right shrink-0">
                    <p class="text-xs text-gray-400">${log.time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                    <span class="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${log.color}">
                        ${log.status}
                    </span>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading activity:', error);
        list.innerHTML = '<div class="p-4 text-center text-red-500">Failed to load activity.</div>';
    }
}