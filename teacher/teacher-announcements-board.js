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
            .eq('target_parents', true)
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (error) {
            console.error('Error loading announcements:', error);
            return;
        }
        
        list.innerHTML = '';
        
        announcements?.forEach(ann => {
            const div = document.createElement('div');
            div.className = 'bg-white p-4 border rounded mb-3';
            div.innerHTML = `
                <h4 class="font-bold text-lg">${ann.title}</h4>
                <p class="text-gray-600 mt-1">${ann.content}</p>
                <p class="text-sm text-gray-400 mt-2">Posted: ${new Date(ann.created_at).toLocaleString()}</p>
            `;
            list.appendChild(div);
        });
        
    } catch (err) {
        console.error('Error in loadExistingAnnouncements:', err);
    }
}
