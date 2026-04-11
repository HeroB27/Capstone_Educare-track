// parent-notifications.js – Full notification management

let allNotifications = [];
let currentFilter = 'all';
let notifChannel = null;
let myChildrenIds = [];
let myChildrenNames = [];

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
    await loadMyChildren();
    await loadNotifications();
    setupRealtime();
}

// Load only this parent's children for filtering
async function loadMyChildren() {
    try {
        const { data: children } = await supabase
            .from('students')
            .select('id, full_name, lrn')
            .eq('parent_id', window.currentUser.id);
        
        myChildrenIds = (children || []).map(c => c.id);
        myChildrenNames = (children || []).map(c => c.full_name.toLowerCase());
    } catch (err) {
        console.error('Error loading children:', err);
    }
}

async function loadNotifications() {
    // Get all notifications for this parent
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', window.currentUser.id)
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error('Load notifications error:', error);
    }
    
    // If parent has children, filter to show only notifications about them
    // If no children, show all notifications for this parent
    if (myChildrenIds.length > 0) {
        allNotifications = (data || []).filter(n => {
            const message = (n.message || '').toLowerCase();
            return myChildrenNames.some(name => message.includes(name));
        });
    } else {
        // No children linked - show all notifications for this parent
        allNotifications = data || [];
    }
    
    renderNotifications();
    document.getElementById('loading-indicator')?.classList.add('hidden');
}

function renderNotifications() {
    const container = document.getElementById('notifications-list');
    const loading = document.getElementById('loading-indicator');
    const emptyState = document.getElementById('empty-state');
    let filtered = allNotifications;
    
    if (currentFilter === 'gate') filtered = allNotifications.filter(n => n.type === 'gate_entry' || n.type === 'gate_exit');
    else if (currentFilter === 'clinic') filtered = allNotifications.filter(n => n.type === 'clinic' || n.type === 'clinic_discharge');
    else if (currentFilter === 'excuse') filtered = allNotifications.filter(n => n.type?.includes('excuse'));

    if (loading) loading.classList.add('hidden');
    
    if (!filtered.length) {
        if (container) container.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }
    
    if (container) {
        container.classList.remove('hidden');
        container.innerHTML = filtered.map(n => `
            <div class="bg-white rounded-xl p-4 shadow-sm border-l-4 border-${getColor(n.type)}-500 cursor-pointer" onclick="showDetail('${n.id}')">
                <div class="flex justify-between items-start"><span class="font-bold truncate flex-1">${escapeHtml(n.title)}</span><span class="text-xs text-gray-400 whitespace-nowrap ml-2">${getRelativeTime(n.created_at)}</span></div>
                <p class="text-sm text-gray-600 mt-1 line-clamp-2">${escapeHtml((n.message || '').substring(0, 80))}${(n.message || '').length > 80 ? '...' : ''}</p>
                ${!n.is_read ? '<span class="inline-block w-2 h-2 bg-blue-500 rounded-full mt-1"></span>' : ''}
            </div>
        `).join('');
    }
    if (emptyState) emptyState.classList.add('hidden');
}

function getColor(type) {
    if (type === 'gate_entry') return 'green';
    if (type === 'gate_exit') return 'gray';
    if (type === 'clinic' || type === 'clinic_discharge') return 'red';
    if (type?.includes('excuse')) return 'yellow';
    return 'blue';
}

async function showDetail(id) {
    const n = allNotifications.find(x => String(x.id) === String(id));
    if (!n) return;
    
    if (!n.is_read) {
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
        n.is_read = true;
        renderNotifications();
    }
    
    // Show modal with details
    const modal = document.getElementById('notification-modal');
    if (!modal) {
        alert(`${n.title}\n\n${n.message}`);
        return;
    }
    
    document.getElementById('modal-title').innerText = n.title;
    document.getElementById('modal-time').innerText = getRelativeTime(n.created_at);
    document.getElementById('modal-icon').innerText = n.type === 'clinic' ? '🏥' : n.type?.includes('excuse') ? '📝' : n.type === 'gate_entry' ? '🚪' : '🔔';
    
    document.getElementById('modal-message').innerText = n.message || '';
    modal.classList.remove('hidden');
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
    const myNotifIds = allNotifications.filter(n => !n.is_read).map(n => n.id);
    if (myNotifIds.length > 0) {
        await supabase.from('notifications').update({ is_read: true }).in('id', myNotifIds);
    }
    allNotifications.forEach(n => n.is_read = true);
    renderNotifications();
}

function setupRealtime() {
    if (notifChannel) supabase.removeChannel(notifChannel);
    if (!window.currentUser) return;
    notifChannel = supabase.channel('parent-notif')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${window.currentUser.id}` }, payload => {
            const newNotif = payload.new;
            const message = (newNotif.message || '').toLowerCase();
            // Only add if it's about one of my children
            if (myChildrenNames.some(name => message.includes(name))) {
                allNotifications.unshift(newNotif);
                renderNotifications();
            }
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
window.closeModal = () => {
    const modal = document.getElementById('notification-modal');
    if (modal) modal.classList.add('hidden');
};