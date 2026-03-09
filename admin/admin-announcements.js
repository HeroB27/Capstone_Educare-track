let selectedCategory = '';
let currentAnnTab = 'active';

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkSession === 'function') {
        if (!checkSession('admins')) return;
    }
    loadAnnouncements();
    injectStyles();

    // Setup modal close handlers for each modal
    setupModalClose('announcementModal');
    setupModalClose('suspensionModal');

    // BACKGROUND JOB SIMULATION: Auto-refresh every 60 seconds
    // This automatically "moves" scheduled items to active when their time comes
    setInterval(loadAnnouncements, 60000);
});

// --- STANDARD ANNOUNCEMENT LOGIC ---

async function loadAnnouncements() {
    const list = document.getElementById('announcementList');
    const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
    if (error) {
        console.error("Failed to load announcements:", error);
        showNotification("Failed to load announcements. Please try again.", "error");
        return;
    }

    list.innerHTML = data.map(ann => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-6 py-4">
                <p class="font-bold text-slate-800 text-sm">${ann.title}</p>
                <p class="text-[11px] text-slate-400 truncate max-w-xs">${ann.content}</p>
            </td>
            <td class="px-6 py-4">
                <div class="flex gap-1">
                    ${ann.target_teachers ? '<span class="px-2 py-0.5 bg-violet-100 text-violet-700 text-[9px] font-black rounded">TEACHERS</span>' : ''}
                    ${ann.target_parents ? '<span class="px-2 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-black rounded">PARENTS</span>' : ''}
                </div>
            </td>
            <td class="px-6 py-4 text-[11px] font-bold text-slate-400">
                ${new Date(ann.created_at).toLocaleDateString()}
            </td>
            <td class="px-6 py-4 text-right">
                <button onclick="deleteAnnouncement(${ann.id})" class="text-slate-300 hover:text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </td>
        </tr>
    `).join('');
    lucide.createIcons();
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

// NEW: Category selection for announcements - FIXED with null safety
function setCategory(event, category) {
    if (event) event.preventDefault();
    selectedCategory = category;
    // Update UI to show selected category - with null safety
    const categoryButtons = document.querySelectorAll('.category-btn');
    if (categoryButtons && categoryButtons.length > 0) {
        categoryButtons.forEach(btn => {
            if (btn) {
                btn.classList.remove('border-violet-500', 'bg-violet-50');
                btn.classList.add('border-gray-50');
            }
        });
    }
    const selectedBtn = document.getElementById('cat-' + category);
    if (selectedBtn) {
        selectedBtn.classList.remove('border-gray-50');
        selectedBtn.classList.add('border-violet-500', 'bg-violet-50');
    }
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

function showConfirmationModal(title, message, onConfirm, type = 'danger') {
    const existing = document.getElementById('confirmation-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'confirmation-modal';
    modal.className = 'fixed inset-0 bg-black/50 z-[90] flex items-center justify-center animate-fade-in p-4';

    let iconColor = 'text-red-500';
    let iconBg = 'bg-red-50';
    let btnBg = 'bg-red-600 hover:bg-red-700 shadow-red-200';
    let iconName = 'alert-triangle';

    if (type === 'warning') {
        iconColor = 'text-amber-500';
        iconBg = 'bg-amber-50';
        btnBg = 'bg-amber-500 hover:bg-amber-600 shadow-amber-200';
        iconName = 'alert-circle';
    } else if (type === 'info') {
        iconColor = 'text-blue-500';
        iconBg = 'bg-blue-50';
        btnBg = 'bg-blue-600 hover:bg-blue-700 shadow-blue-200';
        iconName = 'info';
    }

    modal.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-auto p-6 transform transition-all animate-fade-in-up"><div class="text-center"><div class="w-16 h-16 ${iconBg} ${iconColor} rounded-full flex items-center justify-center mb-4 mx-auto"><i data-lucide="${iconName}" class="w-8 h-8"></i></div><h3 class="text-xl font-black text-gray-800 mb-2">${title}</h3><p class="text-sm text-gray-500 font-medium mb-6">${message}</p><div class="flex gap-3"><button id="confirm-cancel-btn" class="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-gray-200 transition-all">Cancel</button><button id="confirm-action-btn" class="flex-1 py-3 ${btnBg} text-white rounded-xl font-bold text-sm uppercase tracking-widest transition-all shadow-lg">Confirm</button></div></div></div>`;

    document.body.appendChild(modal);

    document.getElementById('confirm-cancel-btn').onclick = () => modal.remove();
    document.getElementById('confirm-action-btn').onclick = () => {
        modal.remove();
        if (onConfirm) onConfirm();
    };
    
    if (window.lucide) lucide.createIcons();
}

function showNotification(msg, type='info', callback=null) {
    const existing = document.getElementById('notification-modal');
    if(existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'notification-modal';
    modal.className = 'fixed inset-0 bg-black/50 z-[60] flex items-center justify-center animate-fade-in';
    const iconColor = type === 'success' ? 'text-emerald-500' : type === 'error' ? 'text-red-500' : 'text-violet-600';
    const bgColor = type === 'success' ? 'bg-emerald-50' : type === 'error' ? 'bg-red-50' : 'bg-violet-50';
    const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info';
    const title = type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Information';

    const dndEnabled = localStorage.getItem('educare_dnd_enabled') === 'true';
    if (!dndEnabled) {
        if (navigator.vibrate) navigator.vibrate(type === 'error' ? [100, 50, 100] : 200);
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = type === 'error' ? 220 : 550;
            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
            osc.start(); osc.stop(ctx.currentTime + 0.2);
        } catch(e){}
    }

    modal.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 transform transition-all animate-fade-in-up"><div class="flex flex-col items-center text-center"><div class="w-16 h-16 ${bgColor} ${iconColor} rounded-full flex items-center justify-center mb-4"><i data-lucide="${iconName}" class="w-8 h-8"></i></div><h3 class="text-xl font-black text-gray-800 mb-2">${title}</h3><p class="text-sm text-gray-500 font-medium mb-6">${msg}</p><button id="notif-btn" class="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-gray-800 transition-all">Okay, Got it</button></div></div>`;
    document.body.appendChild(modal);
    document.getElementById('notif-btn').onclick = () => { modal.remove(); if(callback) callback(); };
    if(window.lucide) lucide.createIcons();
}

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

// Opens the suspension modal
function openSuspensionModal() {
    document.getElementById('suspensionModal').classList.remove('hidden');
}

// Closes the suspension modal
function closeSuspensionModal() {
    document.getElementById('suspensionModal').classList.add('hidden');
}

// Make functions globally available
window.openAnnouncementModal = openAnnouncementModal;
window.closeAnnouncementModal = closeAnnouncementModal;
window.openSuspensionModal = openSuspensionModal;
window.closeSuspensionModal = closeSuspensionModal;
window.setCategory = setCategory;
window.switchAnnouncementTab = switchAnnouncementTab;
window.deleteAnnouncement = deleteAnnouncement;
window.loadAnnouncements = loadAnnouncements;

// Save suspension/holiday logic
function saveLogicSuspension() {
    const category = selectedCategory;
    if (!category) {
        showNotification("Please select a suspension type", "error");
        return;
    }
    
    const eventDate = document.getElementById('eventDate').value;
    const scheduleType = document.getElementById('scheduleType').value;
    const eventNotes = document.getElementById('eventNotes').value;
    const autoAnnounce = document.getElementById('autoAnnounce').checked;
    
    if (!eventDate) {
        showNotification("Please select a date", "error");
        return;
    }
    
    // Show the dynamic fields
    document.getElementById('dynamicFields').classList.remove('hidden');
    
    // Save to database
    saveSuspensionToDatabase(category, eventDate, scheduleType, eventNotes, autoAnnounce);
}

async function saveSuspensionToDatabase(category, eventDate, scheduleType, eventNotes, autoAnnounce) {
    try {
        // FIX #1: Insert into HOLIDAYS table (not suspensions) with is_suspended: true
        const { error } = await supabase.from('holidays').insert([{
            holiday_date: eventDate,
            description: eventNotes || `${category} - ${scheduleType}`,
            is_suspended: true,
            target_grades: 'All'
        }]);
        
        if (error) {
            // Handle unique constraint violation (date already exists)
            if (error.code === '23505') {
                showNotification("A suspension/holiday already exists for this date. Please choose another date.", "error");
                return;
            }
            throw error;
        }
        
        // Auto-announce if checked - insert into announcements table
        if (autoAnnounce) {
            await supabase.from('announcements').insert([{
                title: `🚨 ${category} ALERT`,
                content: `School will be suspended on ${eventDate}. ${eventNotes || ''}`,
                target_parents: true,
                target_teachers: true,
                priority: 'high'
            }]);
        }
        
        showNotification("Suspension declared successfully!", "success");
        closeSuspensionModal();
        // Reload page to show new suspension
        location.reload();
        
    } catch (err) {
        console.error("Error saving suspension:", err);
        showNotification("Error: " + err.message, "error");
    }
}

// Save announcement
function saveAnnouncement() {
    const annId = document.getElementById('annId').value;
    const annTitle = document.getElementById('annTitle').value;
    const annType = document.getElementById('annType').value;
    const annContent = document.getElementById('annContent').value;
    const annDate = document.getElementById('annDate').value;
    const annTime = document.getElementById('annTime').value;
    
    const targetTeachers = document.getElementById('targetTeachers').checked;
    const targetParents = document.getElementById('targetParents').checked;
    const targetStudents = document.getElementById('targetStudents').checked;
    
    if (!annTitle || !annContent) {
        showNotification("Please fill in title and content", "error");
        return;
    }
    
    saveAnnouncementToDatabase(annId, annTitle, annType, annContent, annDate, annTime, targetTeachers, targetParents, targetStudents);
}

async function saveAnnouncementToDatabase(id, title, type, content, date, time, targetTeachers, targetParents, targetStudents) {
    try {
        const payload = {
            title: title,
            content: content,
            priority: type,           // CHANGED: type -> priority (DB field name)
            target_teachers: targetTeachers,
            target_parents: targetParents,
            target_students: targetStudents,   // FIXED: was incorrectly assigned to target_guards
            target_clinic: false      // ADDED: default value for missing field
        };
        
        // Add scheduled date if provided
        if (date) {
            payload.scheduled_at = time ? `${date}T${time}:00` : `${date}T00:00:00`;
        }
        
        let error;
        if (id) {
            // Update existing
            ({ error } = await supabase.from('announcements').update(payload).eq('id', id));
        } else {
            // Insert new
            ({ error } = await supabase.from('announcements').insert([payload]));
        }
        
        if (error) throw error;
        
        showNotification(id ? "Announcement updated!" : "Announcement posted!", "success");
        closeAnnouncementModal();
        loadAnnouncements();
        
    } catch (err) {
        console.error("Error saving announcement:", err);
        showNotification("Error: " + err.message, "error");
    }
}

window.saveLogicSuspension = saveLogicSuspension;
window.saveAnnouncement = saveAnnouncement;
