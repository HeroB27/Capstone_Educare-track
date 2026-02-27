// teacher-announcements-board.js
// Standalone script for announcements board page

document.addEventListener('DOMContentLoaded', async () => {
    await loadAnnouncementsBoard();
});

async function loadAnnouncementsBoard() {
    await loadExistingAnnouncements();
}

async function postAnnouncement() {
    const title = document.getElementById('announcement-title').value;
    const content = document.getElementById('announcement-content').value;
    
    if (!title || !content) {
        alert('Please fill in both title and content.');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('announcements')
            .insert({
                title: title,
                content: content,
                posted_by_admin_id: currentUser.id,
                target_parents: true,
                target_teachers: false,
                target_guards: false,
                target_clinic: false
            });
        
        if (error) {
            alert('Error posting announcement: ' + error.message);
            return;
        }
        
        alert('Announcement posted successfully!');
        document.getElementById('announcement-title').value = '';
        document.getElementById('announcement-content').value = '';
        await loadExistingAnnouncements();
        
    } catch (err) {
        console.error('Error posting announcement:', err);
        alert('Error posting announcement. Please try again.');
    }
}

async function loadExistingAnnouncements() {
    const list = document.getElementById('announcements-list');
    if (!list) return;
    
    try {
        const { data: announcements, error } = await supabase
            .from('announcements')
            .select('*')
            .eq('target_teachers', true) // UPDATED: Show announcements for teachers, not parents
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (error || !announcements) {
            console.error('Error loading announcements:', error);
            return;
        }
        
        list.innerHTML = announcements.map(ann => `
            <div class="bg-white p-6 border border-gray-100 rounded-2xl mb-4 shadow-sm hover:shadow-md transition-all">
                <div class="flex items-start gap-4">
                    <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"></path></svg>
                    </div>
                    <div>
                        <h4 class="font-bold text-lg text-gray-800">${ann.title}</h4>
                        <p class="text-xs text-gray-400 font-semibold">Posted: ${new Date(ann.created_at).toLocaleString()}</p>
                    </div>
                </div>
                <p class="text-gray-600 mt-1">${ann.content}</p>
            </div>
        `).join('');
        
    } catch (err) {
        console.error('Error in loadExistingAnnouncements:', err);
        list.innerHTML = '<p class="text-center text-red-500">Could not load announcements.</p>';
    }
}
