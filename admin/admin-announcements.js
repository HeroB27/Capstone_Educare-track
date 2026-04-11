let currentAnnTab = 'active';

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkSession === 'function') {
        if (!checkSession('admins')) return;
    }
    loadAnnouncements();
    injectStyles();

    setupModalClose('announcementModal');

    // Auto-refresh every 60 seconds (moves scheduled to active when time comes)
    setInterval(loadAnnouncements, 60000);
});

// --- Core Functions ---

async function loadAnnouncements() {
    const list = document.getElementById('announcementList');
    const filterType = document.getElementById('filterType').value;
    list.innerHTML = '<tr><td colspan="4" class="px-10 py-8 text-center text-gray-400 italic">Loading broadcasts...</td></tr>';

    try {
        let query = supabase.from('announcements').select('*').order('created_at', { ascending: false });
        if (filterType !== 'all') {
            query = query.eq('type', filterType);
        }

        const { data, error } = await query;
        if (error) throw error;

        const now = new Date().toISOString();

        // Filter by tab: active = no scheduled_at OR scheduled_at <= now
        // scheduled = scheduled_at > now
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
                            <p class="font-bold text-gray-800 text-sm mb-1">${escapeHtml(ann.title)}</p>
                            <p class="text-xs text-gray-500 line-clamp-1 max-w-md">${escapeHtml(ann.content)}</p>
                        </div>
                    </div>
                </td>
                <td class="px-10 py-5">
                    <div class="flex flex-wrap gap-1">
                        ${ann.target_teachers ? '<span class="px-2.5 py-1 bg-violet-50 text-violet-700 text-[9px] font-black tracking-widest rounded-md border border-violet-100">TEACHERS</span>' : ''}
                        ${ann.target_parents ? '<span class="px-2.5 py-1 bg-blue-50 text-blue-700 text-[9px] font-black tracking-widest rounded-md border border-blue-100">PARENTS</span>' : ''}
                        ${ann.target_clinic ? '<span class="px-2.5 py-1 bg-red-50 text-red-700 text-[9px] font-black tracking-widest rounded-md border border-red-100">CLINIC</span>' : ''}
                        ${ann.target_guards ? '<span class="px-2.5 py-1 bg-amber-50 text-amber-700 text-[9px] font-black tracking-widest rounded-md border border-amber-100">GUARDS</span>' : ''}
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

        // Re-initialize Lucide icons
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    } catch (err) {
        console.error(err);
        list.innerHTML = '<tr><td colspan="4" class="px-10 py-8 text-center text-red-500 font-bold">Error loading broadcasts.</td></tr>';
        showNotification('Failed to load announcements: ' + err.message, 'error');
    }
}

async function editAnnouncement(id) {
    try {
        const { data, error } = await supabase.from('announcements').select('*').eq('id', id).single();
        if (error) throw error;

        document.getElementById('annId').value = data.id;
        document.getElementById('annTitle').value = data.title;
        document.getElementById('annType').value = data.type || 'General';
        document.getElementById('annContent').value = data.content;

        // Set checkbox states safely using querySelector
        const setChecked = (id, val) => {
            const element = document.querySelector(`#${id}`);
            if (element) element.checked = val;
        };
        
        setChecked('targetTeachers', !!data.target_teachers);
        setChecked('targetParents', !!data.target_parents);
        setChecked('targetClinic', !!data.target_clinic);
        setChecked('targetGuards', !!data.target_guards);

        if (data.scheduled_at) {
            const dt = new Date(data.scheduled_at);
            document.getElementById('annDate').value = dt.toLocaleDateString('en-CA');
            document.getElementById('annTime').value = dt.toTimeString().slice(0, 5);
        } else {
            document.getElementById('annDate').value = '';
            document.getElementById('annTime').value = '';
        }

        document.getElementById('annModalTitle').textContent = 'Edit Broadcast';
        openAnnouncementModal();
    } catch (err) {
        console.error(err);
        showNotification('Error loading announcement details.', 'error');
    }
}

async function deleteAnnouncement(id) {
    const confirmFn = typeof showConfirmationModal === 'function' 
        ? showConfirmationModal 
        : (title, msg, onConfirm) => {
            if (confirm(`${title}\n${msg}`)) onConfirm();
        };
    
    confirmFn(
        'Delete Announcement?',
        'Are you sure you want to delete this announcement? This action cannot be undone.',
        async () => {
            try {
                const { error } = await supabase.from('announcements').delete().eq('id', id);
                if (error) throw error;
                showNotification('Announcement deleted successfully', 'success');
                loadAnnouncements();
            } catch (err) {
                showNotification('Error: ' + err.message, 'error');
            }
        }
    );
}

function switchAnnouncementTab(tab) {
    currentAnnTab = tab;
    const activeBtn = document.getElementById('tab-active');
    const scheduledBtn = document.getElementById('tab-scheduled');
    
    if (activeBtn && scheduledBtn) {
        if (tab === 'active') {
            activeBtn.classList.add('border-violet-600', 'text-violet-600');
            activeBtn.classList.remove('border-transparent', 'text-gray-500');
            scheduledBtn.classList.add('border-transparent', 'text-gray-500');
            scheduledBtn.classList.remove('border-violet-600', 'text-violet-600');
        } else {
            scheduledBtn.classList.add('border-violet-600', 'text-violet-600');
            scheduledBtn.classList.remove('border-transparent', 'text-gray-500');
            activeBtn.classList.add('border-transparent', 'text-gray-500');
            activeBtn.classList.remove('border-violet-600', 'text-violet-600');
        }
    }
    loadAnnouncements();
}

// Helper: escape HTML to prevent XSS
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function injectStyles() {
    if (document.getElementById('injected-styles')) return;
    const style = document.createElement('style');
    style.id = 'injected-styles';
    style.textContent = `
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in-up { animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }
    `;
    document.head.appendChild(style);
}

// Modal helpers
function setupModalClose(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    const closeButtons = modal.querySelectorAll('.modal-close, .close-btn, .modal-close-btn');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            closeAnnouncementModal();
        });
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAnnouncementModal();
    });
}

function openAnnouncementModal() {
    document.getElementById('announcementModal').classList.remove('hidden');
}

function closeAnnouncementModal() {
    document.getElementById('announcementModal').classList.add('hidden');
    // Clear all form fields completely
    document.getElementById('annId').value = '';
    document.getElementById('annTitle').value = '';
    document.getElementById('annType').value = 'General';
    document.getElementById('annContent').value = '';
    
    // Clear checkboxes using querySelector for safer element selection
    const checkboxes = ['targetTeachers', 'targetParents', 'targetClinic', 'targetGuards'];
    checkboxes.forEach(id => {
        const element = document.querySelector(`#${id}`);
        if (element) element.checked = false;
    });
    
    document.getElementById('annDate').value = '';
    document.getElementById('annTime').value = '';
    document.getElementById('annModalTitle').textContent = 'Post Broadcast';
}

async function saveAnnouncement(event) {
    if (event) event.preventDefault();
    
    const btn = document.getElementById('save-announcement-btn');
    const origText = btn ? btn.innerHTML : '';
    
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i> Processing...';
        btn.disabled = true;
    }
    
    try {
        const annId = document.getElementById('annId').value;
        const annTitle = document.getElementById('annTitle').value.trim();
        const annType = document.getElementById('annType').value;
        const annContent = document.getElementById('annContent').value.trim();
        const annDate = document.getElementById('annDate').value;
        const annTime = document.getElementById('annTime').value;
        
        const targetTeachers = document.getElementById('targetTeachers')?.checked || false;
        const targetParents = document.getElementById('targetParents')?.checked || false;
        const targetClinic = document.getElementById('targetClinic')?.checked || false;
        const targetGuards = document.getElementById('targetGuards')?.checked || false;
        
        if (!annTitle || !annContent) {
            showNotification('Please fill in title and content', 'error');
            return;
        }
        if (!targetTeachers && !targetParents && !targetClinic && !targetGuards) {
            showNotification('Please select at least one target audience', 'error');
            return;
        }
        
        const adminUser = checkSession('admins');
        if (!adminUser) {
            showNotification('Authentication error. Please log in again.', 'error');
            return;
        }
        
        const payload = {
            title: annTitle,
            content: annContent,
            type: annType,
            priority: annType === 'Emergency' ? 'High' : 'Normal',
            target_teachers: targetTeachers,
            target_parents: targetParents,
            target_clinic: targetClinic,
            target_guards: targetGuards,
            posted_by_admin_id: adminUser.id
        };
        
        if (annDate) {
            const timeStr = annTime || '00:00';
            payload.scheduled_at = new Date(`${annDate}T${timeStr}:00`).toISOString();
        } else {
            payload.scheduled_at = null;
        }
        
        let error;
        let retries = 3;
        let lastError = null;
        
        while (retries > 0) {
            if (annId) {
                ({ error } = await supabase.from('announcements').update(payload).eq('id', annId));
            } else {
                ({ error } = await supabase.from('announcements').insert([payload]));
            }
            
            if (!error) break;
            lastError = error;
            retries--;
            if (retries > 0) {
                console.log(`Retrying... (${retries} attempts left)`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        if (error) {
            let errorMsg = 'Action failed. Please try again.';
            if (error.message && error.message.includes('fetch')) {
                errorMsg = 'Network error. Please check your connection and try again.';
            } else if (error.message) {
                errorMsg = error.message;
            }
            throw new Error(errorMsg);
        }
        
        showNotification(annId ? 'Broadcast updated!' : 'Broadcast posted successfully!', 'success');
        closeAnnouncementModal();
        loadAnnouncements();
        
    } catch (err) {
        console.error('Error saving announcement:', err);
        showNotification(err.message || 'Action failed. Please try again.', 'error');
    } finally {
        if (btn) {
            btn.innerHTML = origText;
            btn.disabled = false;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        }
    }
}

// Expose globals
window.openAnnouncementModal = openAnnouncementModal;
window.closeAnnouncementModal = closeAnnouncementModal;
window.switchAnnouncementTab = switchAnnouncementTab;
window.deleteAnnouncement = deleteAnnouncement;
window.loadAnnouncements = loadAnnouncements;
window.editAnnouncement = editAnnouncement;
window.saveAnnouncement = saveAnnouncement;