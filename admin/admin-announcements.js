let currentAnnTab = 'active';

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkSession === 'function') {
        if (!checkSession('admins')) return;
    }
    loadAnnouncements();
    injectStyles();

    // Setup modal close handlers for each modal
    setupModalClose('announcementModal');

    // BACKGROUND JOB SIMULATION: Auto-refresh every 60 seconds
    // This automatically "moves" scheduled items to active when their time comes
    setInterval(loadAnnouncements, 60000);
});

// --- STANDARD ANNOUNCEMENT LOGIC ---

async function loadAnnouncements() {
    const list = document.getElementById('announcementList');
    const filterType = document.getElementById('filterType').value;
    list.innerHTML = '<tr><td colspan="4" class="px-10 py-8 text-center text-gray-400 italic">Loading broadcasts...</td></tr>';

    try {
        let query = supabase.from('announcements').select('*').order('created_at', { ascending: false });
        
        // Filter by Type if not 'all'
        if (filterType !== 'all') {
            query = query.eq('type', filterType);
        }

        const { data, error } = await query;
        if (error) throw error;

        const now = new Date().toISOString();
        
        // Filter by Tab (Active vs Scheduled)
        const filteredData = data.filter(ann => {
            const isScheduled = ann.scheduled_at && ann.scheduled_at > now;
            if (currentAnnTab === 'active') return !isScheduled;
            return isScheduled; // 'scheduled' tab
        });

        if (filteredData.length === 0) {
            list.innerHTML = `<tr><td colspan="4" class="px-10 py-8 text-center text-gray-400 italic">No ${currentAnnTab} broadcasts found.</td></tr>`;
            return;
        }

        list.innerHTML = filteredData.map(ann => {
            const dateDisplay = ann.scheduled_at 
                ? `<span class="text-blue-500 font-bold">Scheduled: ${new Date(ann.scheduled_at).toLocaleString('en-US', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}</span>`
                : `<span class="text-emerald-500 font-bold">Posted: ${new Date(ann.created_at).toLocaleDateString()}</span>`;
            
            const typeColor = ann.type === 'Emergency' ? 'bg-red-100 text-red-700' : ann.type === 'Event' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700';

            return `
            <tr class="hover:bg-violet-50/30 transition-colors border-b border-gray-50 last:border-0">
                <td class="px-10 py-5">
                    <div class="flex items-start gap-3">
                        <span class="px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest mt-0.5 ${typeColor}">${ann.type || 'General'}</span>
                        <div>
                            <p class="font-bold text-gray-800 text-sm mb-1">${ann.title}</p>
                            <p class="text-xs text-gray-500 line-clamp-1 max-w-md">${ann.content}</p>
                        </div>
                    </div>
                </td>
                <td class="px-10 py-5">
                    <div class="flex flex-wrap gap-1">
                        ${ann.target_teachers ? '<span class="px-2.5 py-1 bg-violet-50 text-violet-700 text-[9px] font-black tracking-widest rounded-md border border-violet-100">TEACHERS</span>' : ''}
                        ${ann.target_parents ? '<span class="px-2.5 py-1 bg-blue-50 text-blue-700 text-[9px] font-black tracking-widest rounded-md border border-blue-100">PARENTS</span>' : ''}
                        ${ann.target_students ? '<span class="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[9px] font-black tracking-widest rounded-md border border-emerald-100">STUDENTS</span>' : ''}
                    </div>
                </td>
                <td class="px-10 py-5 text-xs text-gray-500">
                    ${dateDisplay}
                </td>
                <td class="px-10 py-5 text-right">
                    <div class="flex justify-end gap-2">
                        <button onclick="editAnnouncement(${ann.id})" class="p-2 bg-white border border-gray-200 text-gray-500 rounded-lg hover:border-violet-500 hover:text-violet-600 transition-all shadow-sm" title="Edit"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                        <button onclick="deleteAnnouncement(${ann.id})" class="p-2 bg-white border border-gray-200 text-gray-500 rounded-lg hover:border-red-500 hover:text-red-500 transition-all shadow-sm" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
        lucide.createIcons();
    } catch (err) {
        console.error(err);
        list.innerHTML = '<tr><td colspan="4" class="px-10 py-8 text-center text-red-500 font-bold">Error loading broadcasts.</td></tr>';
    }
}

// Edit Announcement - loads existing announcement into the modal for editing
async function editAnnouncement(id) {
    try {
        const { data, error } = await supabase.from('announcements').select('*').eq('id', id).single();
        if (error) throw error;

        document.getElementById('annId').value = data.id;
        document.getElementById('annTitle').value = data.title;
        document.getElementById('annType').value = data.type || 'General';
        document.getElementById('annContent').value = data.content;
        
        document.getElementById('targetTeachers').checked = data.target_teachers;
        document.getElementById('targetParents').checked = data.target_parents;
        document.getElementById('targetStudents').checked = data.target_students;

        if (data.scheduled_at) {
            const dt = new Date(data.scheduled_at);
            // Convert to local YYYY-MM-DD and HH:MM format for the HTML inputs
            document.getElementById('annDate').value = dt.toLocaleDateString('en-CA'); 
            document.getElementById('annTime').value = dt.toTimeString().slice(0,5);
        } else {
            document.getElementById('annDate').value = '';
            document.getElementById('annTime').value = '';
        }

        document.getElementById('annModalTitle').textContent = 'Edit Broadcast';
        openAnnouncementModal();
    } catch (err) {
        showNotification("Error loading announcement details.", "error");
    }
}

async function deleteAnnouncement(id) {
    showConfirmationModal(
        "Delete Announcement?",
        "Are you sure you want to delete this announcement?",
        async () => {
            const { error } = await supabase.from('announcements').delete().eq('id', id);
            if(error) showNotification("Error: " + error.message, "error");
            else {
                showNotification("Announcement deleted successfully", "success");
                loadAnnouncements();
            }
        }
    );
}

// NEW: Switch between Active and Scheduled announcements
function switchAnnouncementTab(tab) {
    currentAnnTab = tab;
    // Update tab UI
    document.getElementById('tab-active')?.classList.toggle('border-violet-600', tab === 'active');
    document.getElementById('tab-active')?.classList.toggle('text-violet-600', tab === 'active');
    document.getElementById('tab-active')?.classList.toggle('border-transparent', tab !== 'active');
    document.getElementById('tab-active')?.classList.toggle('text-gray-500', tab !== 'active');
    document.getElementById('tab-scheduled')?.classList.toggle('border-violet-600', tab === 'scheduled');
    document.getElementById('tab-scheduled')?.classList.toggle('text-violet-600', tab === 'scheduled');
    document.getElementById('tab-scheduled')?.classList.toggle('border-transparent', tab !== 'scheduled');
    document.getElementById('tab-scheduled')?.classList.toggle('text-gray-500', tab !== 'scheduled');
    // Reload announcements
    loadAnnouncements();
}

// Helper: Loading Spinner
function setLoading(btn, isLoading, text) {
    btn.disabled = isLoading;
    btn.innerHTML = isLoading ? `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ${text}` : text;
    lucide.createIcons();
}

function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `@keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } .animate-fade-in-up { animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; } .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }`;
    document.head.appendChild(style);
}

// showConfirmationModal REMOVED - now using general-core.js showConfirm
// showNotification REMOVED - now using general-core.js showNotification

// --- MODAL UTILITY FUNCTIONS ---

// Sets up close handlers for a modal (X button + background click)
function setupModalClose(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    // Find close buttons by looking for elements with class 'modal-close', 'close-btn', or 'modal-close-btn'
    const closeButtons = modal.querySelectorAll('.modal-close, .close-btn, .modal-close-btn');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            modal.classList.add('hidden');
        });
    });
    
    // Add background click handler to close modal when clicking directly on the backdrop
    modal.addEventListener('click', (e) => {
        // Only close if clicking directly on the modal backdrop (not on its children)
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
}

// --- MODAL FUNCTIONS ---
// Opens the announcement modal to create/edit broadcasts
function openAnnouncementModal() {
    document.getElementById('announcementModal').classList.remove('hidden');
}

// Closes the announcement modal
function closeAnnouncementModal() {
    document.getElementById('announcementModal').classList.add('hidden');
    // Clear form fields
    document.getElementById('annId').value = '';
    document.getElementById('annTitle').value = '';
    document.getElementById('annType').value = 'General';
    document.getElementById('annContent').value = '';
    document.getElementById('targetTeachers').checked = false;
    document.getElementById('targetParents').checked = false;
    document.getElementById('targetStudents').checked = false;
    document.getElementById('annDate').value = '';
    document.getElementById('annTime').value = '';
    document.getElementById('annModalTitle').textContent = 'Post Broadcast';
}

// Make functions globally available
window.openAnnouncementModal = openAnnouncementModal;
window.closeAnnouncementModal = closeAnnouncementModal;
window.switchAnnouncementTab = switchAnnouncementTab;
window.deleteAnnouncement = deleteAnnouncement;
window.loadAnnouncements = loadAnnouncements;
window.editAnnouncement = editAnnouncement;

// Save announcement - with posted_by_admin_id support
// UPDATED: Added button locking pattern to prevent double-clicks
async function saveAnnouncement(event) {
    if (event) event.preventDefault();
    
    const btn = document.getElementById('save-announcement-btn');
    const origText = btn ? btn.innerHTML : '';
    
    // 1. Lock UI
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i> Processing...';
        btn.disabled = true;
    }
    
    const annId = document.getElementById('annId').value;
    const annTitle = document.getElementById('annTitle').value.trim();
    const annType = document.getElementById('annType').value;
    const annContent = document.getElementById('annContent').value.trim();
    const annDate = document.getElementById('annDate').value;
    const annTime = document.getElementById('annTime').value;
    
    const targetTeachers = document.getElementById('targetTeachers').checked;
    const targetParents = document.getElementById('targetParents').checked;
    const targetStudents = document.getElementById('targetStudents').checked;
    
    if (!annTitle || !annContent) {
        showNotification("Please fill in title and content", "error");
        btn.innerHTML = origText;
        btn.disabled = false;
        return;
    }
    if (!targetTeachers && !targetParents && !targetStudents) {
        showNotification("Please select at least one target audience", "error");
        btn.innerHTML = origText;
        btn.disabled = false;
        return;
    }

    const adminUser = checkSession('admins');
    if (!adminUser) {
        showNotification("Authentication error. Please log in again.", "error");
        btn.innerHTML = origText;
        btn.disabled = false;
        return;
    }

    try {
        const payload = {
            title: annTitle,
            content: annContent,
            type: annType,
            priority: annType === 'Emergency' ? 'High' : 'Normal',
            target_teachers: targetTeachers,
            target_parents: targetParents,
            target_students: targetStudents,
            target_guards: false, 
            target_clinic: false,
            posted_by_admin_id: adminUser.id
        };
        
        // Handle Scheduling strictly
        if (annDate) {
            const timeStr = annTime || '00:00';
            payload.scheduled_at = new Date(`${annDate}T${timeStr}:00`).toISOString();
        } else {
            payload.scheduled_at = null;
        }
        
        let error;
        if (annId) {
            ({ error } = await supabase.from('announcements').update(payload).eq('id', annId));
        } else {
            ({ error } = await supabase.from('announcements').insert([payload]));
        }
        
        if (error) throw error;
        
        // 2. Clear Form & Notify Success
        showNotification(annId ? "Broadcast updated!" : "Broadcast posted successfully!", "success");
        closeAnnouncementModal();
        loadAnnouncements();
        
    } catch (err) {
        console.error("Error saving announcement:", err);
        // 3. Catch & Notify Error
        showNotification(err.message || "Action failed. Please try again.", "error");
    } finally {
        // 4. Unlock UI
        if (btn) {
            btn.innerHTML = origText;
            btn.disabled = false;
            if (window.lucide) lucide.createIcons();
        }
    }
}

window.saveAnnouncement = saveAnnouncement;
