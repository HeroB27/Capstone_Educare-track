// parent-dashboard.js – Dashboard with accurate stats and live schedule

let clinicStatus = null;
let todaySchedule = [];
let summaryChart = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (window.currentChild) await refreshDashboard();
    document.addEventListener('childChanged', () => refreshDashboard());
    window.addEventListener('notificationsUpdated', () => loadNotificationsPreview());
});

async function refreshDashboard() {
    if (!window.currentChild) return;
    const loading = document.getElementById('loading-indicator');
    const content = document.getElementById('dashboard-content');
    if (loading) loading.classList.remove('hidden');
    if (content) content.classList.add('hidden');

    await Promise.all([
        loadTodaySchedule(),
        loadClinicStatus(),
        loadClinicHistory(),
        loadAttendanceSummary(),
        loadNotificationsPreview()
    ]);

    updateUI();
    if (loading) loading.classList.add('hidden');
    if (content) content.classList.remove('hidden');
}

async function loadTodaySchedule() {
    const container = document.getElementById('today-schedule-container');
    if (!container) return;
    if (!window.currentChild?.class_id) {
        container.innerHTML = '<p class="text-gray-400 text-sm">No class assigned</p>';
        return;
    }

    const today = new Date();
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = daysOfWeek[today.getDay()];

    const { data, error } = await supabase
        .from('subject_loads')
        .select('subject_name, schedule_time_start, schedule_time_end, schedule_days, teachers(full_name)')
        .eq('class_id', window.currentChild.class_id)
        .ilike('schedule_days', `%${todayName}%`)
        .order('schedule_time_start');

    if (error || !data?.length) {
        container.innerHTML = '<p class="text-gray-400 text-sm">No classes today</p>';
        return;
    }

    todaySchedule = data;
    container.innerHTML = data.map(subj => `
        <div class="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
            <div class="flex-1 min-w-0">
                <p class="font-medium text-gray-800 truncate">${escapeHtml(subj.subject_name)}</p>
                <p class="text-xs text-gray-500 truncate">${escapeHtml(subj.teachers?.full_name || 'Teacher')}</p>
            </div>
            <p class="text-sm font-mono text-gray-600 whitespace-nowrap ml-2">
                ${formatTime(subj.schedule_time_start)} – ${formatTime(subj.schedule_time_end)}
            </p>
        </div>
    `).join('');
}

async function loadClinicStatus() {
    const { data } = await supabase
        .from('clinic_visits')
        .select('*')
        .eq('student_id', window.currentChild.id)
        .is('time_out', null)
        .order('time_in', { ascending: false })
        .limit(1);
    clinicStatus = data?.[0] || null;
}

async function loadClinicHistory() {
    const container = document.getElementById('clinic-history');
    if (!container) return;
    const { data } = await supabase
        .from('clinic_visits')
        .select('*')
        .eq('student_id', window.currentChild.id)
        .order('time_in', { ascending: false })
        .limit(5);

    if (!data?.length) {
        container.innerHTML = '<div class="text-center py-6 text-gray-400">No clinic visits</div>';
        return;
    }

    container.innerHTML = data.map(visit => `
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div class="flex-1 min-w-0">
                <p class="font-medium text-gray-800 truncate">${escapeHtml(visit.reason || 'Clinic visit')}</p>
                <p class="text-xs text-gray-500">${formatDate(visit.time_in)} at ${formatTime(visit.time_in)}</p>
            </div>
            <span class="px-2 py-1 rounded-lg text-xs font-bold bg-${visit.status === 'Completed' ? 'green' : 'yellow'}-100 text-${visit.status === 'Completed' ? 'green' : 'yellow'}-700 whitespace-nowrap ml-2">
                ${escapeHtml(visit.status)}
            </span>
        </div>
    `).join('');
}

// Show all clinic visits in modal
async function showAllClinicVisits() {
    const modal = document.getElementById('clinic-modal');
    const content = document.getElementById('clinic-modal-content');
    if (!modal || !content || !window.currentChild) return;
    
    modal.classList.remove('hidden');
    
    // Fetch all clinic visits (no limit)
    const { data } = await supabase
        .from('clinic_visits')
        .select('*')
        .eq('student_id', window.currentChild.id)
        .order('time_in', { ascending: false });
    
    if (!data?.length) {
        content.innerHTML = '<div class="text-center py-8 text-gray-400">No clinic visits</div>';
        return;
    }
    
    content.innerHTML = data.map(visit => `
        <div class="p-4 bg-gray-50 rounded-xl">
            <div class="flex justify-between items-start mb-2">
                <div>
                    <p class="font-bold text-gray-800">${escapeHtml(visit.reason || 'Clinic visit')}</p>
                    <p class="text-xs text-gray-500">${formatDate(visit.time_in)} at ${formatTime(visit.time_in)}</p>
                </div>
                <span class="px-2 py-1 rounded-lg text-xs font-bold bg-${visit.status === 'Completed' ? 'green' : 'yellow'}-100 text-${visit.status === 'Completed' ? 'green' : 'yellow'}-700">
                    ${escapeHtml(visit.status)}
                </span>
            </div>
            ${visit.nurse_notes ? `<p class="text-sm text-gray-600 mt-2"><span class="font-medium">Nurse notes:</span> ${escapeHtml(visit.nurse_notes)}</p>` : ''}
            ${visit.action_taken ? `<p class="text-sm text-gray-600 mt-1"><span class="font-medium">Action:</span> ${escapeHtml(visit.action_taken)}</p>` : ''}
            ${visit.time_out ? `<p class="text-xs text-gray-400 mt-2">Discharged: ${formatTime(visit.time_out)}</p>` : ''}
        </div>
    `).join('');
}

function closeClinicModal() {
    const modal = document.getElementById('clinic-modal');
    if (modal) modal.classList.add('hidden');
}

async function loadAttendanceSummary() {
    const percentageEl = document.getElementById('summary-percentage');
    if (!percentageEl) return;
    
    const now = new Date();
    const stats = await calculateAttendanceStats(window.currentChild.id, now.getFullYear(), now.getMonth());
    percentageEl.innerText = `${stats.percentage}%`;

    const ctx = document.getElementById('summary-pie-chart')?.getContext('2d');
    if (!ctx) return;
    if (summaryChart) summaryChart.destroy();

    summaryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Present', 'Late', 'Excused', 'Absent'],
            datasets: [{
                data: [stats.present, stats.late, stats.excused, stats.absent],
                backgroundColor: ['#22c55e', '#f59e0b', '#3b82f6', '#ef4444'],
                borderWidth: 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
    });
}

async function loadNotificationsPreview() {
    if (!window.currentUser) return;
    const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', window.currentUser.id)
        .order('created_at', { ascending: false })
        .limit(5);
    window.notificationsPreview = data || [];
    updateNotificationsPreview();
}

function updateNotificationsPreview() {
    const container = document.getElementById('notifications-preview');
    if (!container) return; // Element not found, exit
    
    const notifs = window.notificationsPreview || [];
    if (!notifs.length) {
        container.innerHTML = '<div class="text-center py-6 text-gray-400">No recent alerts</div>';
        return;
    }
    container.innerHTML = notifs.map(n => `
        <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
            <span class="text-2xl flex-shrink-0">${n.type === 'clinic' ? '🏥' : n.type === 'attendance' ? '📋' : '🔔'}</span>
            <div class="flex-1 min-w-0">
                <p class="font-medium text-gray-800 truncate">${escapeHtml(n.title)}</p>
                <p class="text-xs text-gray-500 truncate">${escapeHtml(n.message)}</p>
                <p class="text-xs text-gray-400 mt-1">${getRelativeTime(n.created_at)}</p>
            </div>
        </div>
    `).join('');
}

function updateUI() {
    const childNameEl = document.getElementById('child-name');
    const childClassEl = document.getElementById('child-class');
    const currentChildName = document.getElementById('current-child-name');
    const childAvatarHeader = document.getElementById('child-avatar-header');
    const parentNameHeader = document.getElementById('parent-name-header');
    
    const grade = window.currentChild.classes?.grade_level || '';
    const strand = window.currentChild.classes?.strand || '';
    const dept = window.currentChild.classes?.department || '';
    const isSHS = grade.includes('11') || grade.includes('12');
    const classDisplay = isSHS && strand ? `${grade} - ${strand}` : (grade || dept);
    
    // Update parent name in header
    if (parentNameHeader && window.currentUser) {
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
        parentNameHeader.textContent = `${greeting}, ${window.currentUser.full_name?.split(' ')[0] || 'Parent'}`;
    }
    
    if (childNameEl) childNameEl.innerText = window.currentChild.full_name;
    if (currentChildName) currentChildName.innerText = window.currentChild.full_name;
    if (childClassEl) childClassEl.innerText = classDisplay;
    if (childAvatarHeader) childAvatarHeader.innerText = getInitials(window.currentChild.full_name);
    
    const alertDiv = document.getElementById('clinic-alert');
    if (clinicStatus) {
        if (alertDiv) alertDiv.classList.remove('hidden');
        const reasonEl = document.getElementById('clinic-reason');
        const timeEl = document.getElementById('clinic-time');
        if (reasonEl) reasonEl.innerText = clinicStatus.reason || 'No reason';
        if (timeEl) timeEl.innerText = `Since ${formatTime(clinicStatus.time_in)}`;
    } else {
        if (alertDiv) alertDiv.classList.add('hidden');
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

window.refreshDashboard = refreshDashboard;
window.loadClinicHistory = loadClinicHistory;
window.showAllClinicVisits = showAllClinicVisits;
window.closeClinicModal = closeClinicModal;