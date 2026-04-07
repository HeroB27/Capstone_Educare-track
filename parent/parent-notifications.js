// parent-notifications.js – Full notification management

let allNotifications = [];
let currentFilter = 'all';
let notifChannel = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.currentUser) {
        const interval = setInterval(() => {
            if (window.currentUser) { clearInterval(interval); init(); }
        }, 100);
        setTimeout(() => clearInterval(interval), 5000);
    } else {
        init();
    }
});

async function init() {
    await loadNotifications();
    setupRealtime();
}

async function loadNotifications() {
    const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', window.currentUser.id)
        .in('recipient_role', ['parent', 'parents'])
        .order('created_at', { ascending: false });
    allNotifications = data || [];
    renderNotifications();
    document.getElementById('loading-indicator')?.classList.add('hidden');
}

function renderNotifications() {
    const container = document.getElementById('notifications-list');
    let filtered = allNotifications;
    if (currentFilter === 'gate') filtered = allNotifications.filter(n => n.type === 'gate_entry' || n.type === 'gate_exit');
    else if (currentFilter === 'clinic') filtered = allNotifications.filter(n => n.type === 'clinic');
    else if (currentFilter === 'excuse') filtered = allNotifications.filter(n => n.type?.includes('excuse'));
    else if (currentFilter === 'announcement') filtered = allNotifications.filter(n => n.type === 'announcement');

    if (!filtered.length) {
        container.innerHTML = '<div class="text-center py-8 text-gray-400">No notifications</div>';
        return;
    }
    container.innerHTML = filtered.map(n => `
        <div class="bg-white rounded-xl p-4 shadow-sm border-l-4 border-${getColor(n.type)}-500 cursor-pointer" onclick="showDetail(${n.id})">
            <div class="flex justify-between"><span class="font-bold">${escapeHtml(n.title)}</span><span class="text-xs text-gray-400">${getRelativeTime(n.created_at)}</span></div>
            <p class="text-sm text-gray-600 mt-1">${escapeHtml(n.message.substring(0, 80))}${n.message.length > 80 ? '...' : ''}</p>
            ${!n.is_read ? '<span class="inline-block w-2 h-2 bg-blue-500 rounded-full mt-1"></span>' : ''}
        </div>
    `).join('');
}

function getColor(type) {
    if (type === 'gate_entry') return 'green';
    if (type === 'gate_exit') return 'gray';
    if (type === 'clinic') return 'red';
    if (type?.includes('excuse')) return 'yellow';
    return 'blue';
}

async function showDetail(id) {
    const n = allNotifications.find(x => x.id == id);
    if (!n) return;
    if (!n.is_read) {
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
        n.is_read = true;
        renderNotifications();
    }
    alert(`${n.title}\n\n${n.message}`);
}

function filterNotifications(type) {
    currentFilter = type;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        const isActive = btn.dataset.filter === type;
        btn.classList.toggle('bg-green-600', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('bg-white', !isActive);
        btn.classList.toggle('text-gray-600', !isActive);
    });
    renderNotifications();
}

async function markAllRead() {
    await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', window.currentUser.id).eq('is_read', false);
    allNotifications.forEach(n => n.is_read = true);
    renderNotifications();
}

function setupRealtime() {
    if (notifChannel) supabase.removeChannel(notifChannel);
    if (!window.currentUser) return;
    notifChannel = supabase.channel('parent-notif')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${window.currentUser.id}` }, payload => {
            allNotifications.unshift(payload.new);
            renderNotifications();
        })
        .subscribe();
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

window.showDetail = showDetail;
window.filterNotifications = filterNotifications;
window.markAllRead = markAllRead;