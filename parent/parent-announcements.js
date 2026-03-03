// parent/parent-announcements.js

document.addEventListener('DOMContentLoaded', async () => {
    // Assuming checkSession is available globally or via parent-core.js
    if (typeof checkSession === 'function') {
        const user = checkSession('parents');
        if (!user) return;
    }
    
    await loadParentAnnouncements();
});

async function loadParentAnnouncements() {
    const container = document.getElementById('announcements-container');
    if (!container) return;

    // Show loading state
    container.innerHTML = '<div class="p-8 text-center text-gray-400 italic">Loading announcements...</div>';

    try {
        const { data, error } = await supabase
            .from('announcements')
            .select('*')
            .eq('target_parents', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = '<div class="p-8 text-center text-gray-400 italic">No announcements found.</div>';
            return;
        }

        container.innerHTML = data.map(ann => {
            let badgeClass = 'bg-gray-100 text-gray-600';
            if (ann.type === 'Emergency') badgeClass = 'bg-red-100 text-red-600';
            else if (ann.type === 'Event') badgeClass = 'bg-blue-100 text-blue-600';

            const date = new Date(ann.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

            return `
                <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm mb-4 hover:shadow-md transition-all">
                    <div class="flex justify-between items-start mb-3">
                        <div class="flex items-center gap-3">
                            <span class="px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${badgeClass}">${ann.type || 'General'}</span>
                            <span class="text-xs text-gray-400 font-bold">${date}</span>
                        </div>
                    </div>
                    <h3 class="font-bold text-gray-800 text-lg mb-2">${ann.title}</h3>
                    <p class="text-sm text-gray-600 leading-relaxed">${ann.content}</p>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error loading announcements:', err);
        container.innerHTML = '<div class="p-8 text-center text-red-500">Failed to load announcements.</div>';
    }
}