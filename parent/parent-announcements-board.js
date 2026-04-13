// parent-announcements-board.js – simplified, with modal

let announcements = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadAnnouncements();
});

async function loadAnnouncements() {
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from('announcements')
        .select('*, admins(full_name), teachers(full_name)')
        .or('target_parents.eq.true, target_students.eq.true')
        .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
        .order('created_at', { ascending: false })
        .limit(30);
    if (error) console.error(error);
    announcements = data || [];
    renderAnnouncements();
    const loading = document.getElementById('loading-indicator');
    const list = document.getElementById('announcements-list');
    const empty = document.getElementById('empty-state');
    if (loading) loading.classList.add('hidden');
    if (list) list.classList.remove('hidden');
}

function renderAnnouncements() {
    const container = document.getElementById('announcements-list');
    if (!announcements.length) {
        container.innerHTML = '<div class="text-center py-8 text-gray-400">No announcements yet</div>';
        return;
    }
    container.innerHTML = announcements.map(a => {
        const postedBy = a.admins?.full_name || a.teachers?.full_name || 'Administrator';
        return `
        <div class="bg-white rounded-xl shadow-md p-4 cursor-pointer" onclick="showDetail(${a.id})">
            <h3 class="font-bold text-gray-800">${escapeHtml(a.title)}</h3>
            <p class="text-sm text-gray-500 mt-1">${escapeHtml(a.content.substring(0, 100))}${a.content.length > 100 ? '...' : ''}</p>
            ${a.image_url ? `<img src="${a.image_url}" class="mt-2 mx-auto max-w-full h-auto rounded-lg border border-gray-200 max-h-32 object-contain">` : ''}
            <div class="flex justify-between mt-3 text-xs text-gray-400">
                <span>${escapeHtml(postedBy)}</span>
                <span>${getRelativeTime(a.created_at)}</span>
            </div>
        </div>
    `}).join('');
}

window.showDetail = (id) => {
    const a = announcements.find(x => x.id == id);
    if (!a) return;
    const modal = document.getElementById('announcement-modal');
    if (!modal) {
        alert(`${a.title}\n\n${a.content}`);
        return;
    }
    const postedBy = a.admins?.full_name || a.teachers?.full_name || 'Administrator';
    document.getElementById('modal-title').innerText = a.title;
    document.getElementById('modal-date').innerText = formatDate(a.created_at);
    document.getElementById('modal-posted-by').innerText = postedBy;
    document.getElementById('modal-content').innerHTML = escapeHtml(a.content) + (a.image_url ? `<img src="${a.image_url}" class="mt-4 mx-auto max-w-full h-auto rounded-lg border border-gray-200">` : '');
    modal.classList.remove('hidden');
};

window.closeModal = () => {
    const modal = document.getElementById('announcement-modal');
    if (modal) modal.classList.add('hidden');
};

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}