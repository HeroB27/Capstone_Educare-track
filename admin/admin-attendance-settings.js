// admin/admin-attendance-settings.js

// 1. Initialize Page
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkSession === 'function') {
        if (!checkSession('admins')) return;
    }
    
    await loadAllSettings();
    await loadSuspensions();
    injectStyles();
    
    const satToggle = document.getElementById('weekend_saturday_enabled');
    if (satToggle) {
        satToggle.addEventListener('change', handleSaturdayToggle);
    }
    
    // Setup modal close handlers
    setupModalClose('suspension-modal');
});

// 2. Load Settings from Supabase
async function loadAllSettings() {
    try {
        const { data, error } = await supabase.from('settings').select('*');
        if (error) throw error;

        if (data) {
            data.forEach(s => {
                const input = document.getElementById(s.setting_key);
                if (input) {
                    if (input.type === 'checkbox') {
                        input.checked = (s.setting_value === 'true');
                    } else {
                        input.value = s.setting_value;
                    }
                }
            });
        }
        handleSaturdayToggle();
    } catch (err) {
        console.error("Error loading settings:", err);
        showNotification("Failed to load settings. Please refresh the page.", "error");
    }
}

function handleSaturdayToggle() {
    const satEnabled = document.getElementById('weekend_saturday_enabled')?.checked;
    const satClassSection = document.getElementById('saturday-class-section');
    if (satClassSection) {
        satClassSection.classList.toggle('hidden', !satEnabled);
    }
}

// Modal Utility: Setup close handlers for a modal
// Finds close buttons by class 'modal-close', 'close-btn', or 'modal-close-btn'
// Adds click handler to close modal by adding 'hidden' class
// Adds background click handler to close modal when clicking backdrop
function setupModalClose(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    // Find close buttons by class
    const closeButtons = modal.querySelectorAll('.modal-close, .close-btn, .modal-close-btn');
    
    // Add click handler to close buttons
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    });
    
    // Add background click handler to close modal when clicking directly on backdrop
    modal.addEventListener('click', (e) => {
        // Only close if clicking directly on the modal backdrop (not on children)
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
}

// 3. Load Suspensions
async function loadSuspensions() {
    const tbody = document.getElementById('suspensions-list');
    if (!tbody) return;
    
    try {
        const { data, error } = await supabase
            .from('suspensions')
            .select('*')
            .order('start_date', { ascending: false });
        
        if (error) throw error;
        renderSuspensions(data || []);
    } catch (err) {
        console.error("Error loading suspensions:", err);
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Error loading data</td></tr>';
    }
}

function renderSuspensions(suspensions) {
    const tbody = document.getElementById('suspensions-list');
    if (!tbody) return;
    
    if (suspensions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-gray-500">No suspensions or breaks recorded</td></tr>';
        return;
    }
    
    tbody.innerHTML = suspensions.map(s => {
        const typeBadge = getSuspensionTypeBadge(s.suspension_type);
        const statusBadge = s.is_active 
            ? '<span class="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">Active</span>'
            : '<span class="px-2 py-1 bg-gray-100 text-gray-500 text-xs font-bold rounded-full">Inactive</span>';
        
        return `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4">
                    <div class="font-bold text-gray-800">${s.title}</div>
                    <div class="text-xs text-gray-500">${s.description || ''}</div>
                </td>
                <td class="px-6 py-4">${typeBadge}</td>
                <td class="px-6 py-4 text-sm">${formatDate(s.start_date)} - ${formatDate(s.end_date)}</td>
                <td class="px-6 py-4">${statusBadge}</td>
                <td class="px-6 py-4">
                    <button onclick="editSuspension(${s.id})" class="text-violet-600 hover:text-violet-800 mr-3"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                    <button onclick="toggleSuspension(${s.id}, ${!s.is_active})" class="text-gray-500 hover:text-gray-700 mr-3"><i data-lucide="power" class="w-4 h-4"></i></button>
                    <button onclick="deleteSuspension(${s.id})" class="text-red-500 hover:text-red-700"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </td>
            </tr>
        `;
    }).join('');
    
    if (window.lucide) lucide.createIcons();
}

function getSuspensionTypeBadge(type) {
    const badges = {
        'suspension': '<span class="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded">Suspension</span>',
        'semestral_break': '<span class="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded">Semestral Break</span>',
        'saturday_class': '<span class="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded">Saturday Class</span>',
        'grade_suspension': '<span class="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded">Grade Suspension</span>'
    };
    return badges[type] || badges['suspension'];
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function openSuspensionModal() {
    document.getElementById('suspension-modal').classList.remove('hidden');
    document.getElementById('modal-title').textContent = 'Add Suspension / Break';
    document.getElementById('suspension-form').reset();
    document.getElementById('suspension-id').value = '';
    handleSuspensionTypeChange();
}

function closeSuspensionModal() {
    document.getElementById('suspension-modal').classList.add('hidden');
}

function handleSuspensionTypeChange() {
    const type = document.getElementById('suspension-type').value;
    const gradeSection = document.getElementById('grade-selection-section');
    const classSection = document.getElementById('class-selection-section');
    const satSection = document.getElementById('saturday-settings-section');
    
    if (gradeSection) gradeSection.classList.add('hidden');
    if (classSection) classSection.classList.add('hidden');
    if (satSection) satSection.classList.add('hidden');
    
    if (type === 'grade_suspension') {
        if (gradeSection) gradeSection.classList.remove('hidden');
        loadGradeLevels();
    } else if (type === 'suspension') {
        if (classSection) classSection.classList.remove('hidden');
        loadClasses();
    } else if (type === 'saturday_class') {
        if (satSection) satSection.classList.remove('hidden');
    }
}

async function loadGradeLevels() {
    const container = document.getElementById('grade-checkboxes');
    if (!container) return;
    
    const gradeLevels = ['Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
    
    container.innerHTML = gradeLevels.map(grade => `
        <label class="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
            <input type="checkbox" name="affected_grades" value="${grade}" class="rounded text-violet-600">
            <span class="text-sm">${grade}</span>
        </label>
    `).join('');
}

async function loadClasses() {
    const container = document.getElementById('class-checkboxes');
    if (!container) return;
    
    try {
        const { data, error } = await supabase
            .from('classes')
            .select('id, grade_level, section_name')
            .order('grade_level')
            .order('section_name');
        
        if (error) throw error;
        
        container.innerHTML = (data || []).map(cls => `
            <label class="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                <input type="checkbox" name="affected_classes" value="${cls.id}" class="rounded text-violet-600">
                <span class="text-sm">${cls.grade_level} - ${cls.section_name}</span>
            </label>
        `).join('');
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500 p-2">No classes available</p>';
        }
    } catch (err) {
        console.error("Error loading classes:", err);
    }
}

async function saveSuspension(event) {
    event.preventDefault();
    
    const id = document.getElementById('suspension-id').value;
    const title = document.getElementById('suspension-title').value;
    const description = document.getElementById('suspension-description').value;
    const startDate = document.getElementById('suspension-start').value;
    const endDate = document.getElementById('suspension-end').value;
    const type = document.getElementById('suspension-type').value;
    const isActive = document.getElementById('suspension-active').checked;
    
    if (!title || !startDate || !endDate || !type) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
        showNotification('Start date must be before end date', 'error');
        return;
    }
    
    let affectedData = { affected_grades: [], affected_classes: [] };
    
    if (type === 'grade_suspension') {
        const checkedGrades = document.querySelectorAll('input[name="affected_grades"]:checked');
        affectedData.affected_grades = Array.from(checkedGrades).map(cb => cb.value);
    } else if (type === 'suspension') {
        const checkedClasses = document.querySelectorAll('input[name="affected_classes"]:checked');
        affectedData.affected_classes = Array.from(checkedClasses).map(cb => cb.value);
    } else if (type === 'saturday_class') {
        affectedData.saturday_enabled = document.getElementById('saturday_enabled')?.checked || false;
    }
    
    const payload = {
        title,
        description,
        start_date: startDate,
        end_date: endDate,
        suspension_type: type,
        is_active: isActive,
        ...affectedData
    };
    
    try {
        let error;
        if (id) {
            ({ error } = await supabase.from('suspensions').update(payload).eq('id', id));
        } else {
            ({ error } = await supabase.from('suspensions').insert(payload));
        }
        
        if (error) throw error;
        
        // CONSOLIDATED LOGIC: Auto-broadcast announcement when suspension is set
        if (isActive) {
            const typeLabel = type.replace(/_/g, ' ').toUpperCase();
            await supabase.from('announcements').insert([{
                title: `📢 ${typeLabel} ALERT: ${title}`,
                content: `A ${typeLabel} has been declared from ${formatDate(startDate)} to ${formatDate(endDate)}. ${description}`,
                priority: 'high',
                target_parents: true,
                target_teachers: true,
                target_guards: true,
                target_clinic: false
            }]);
        }

        showNotification(id ? 'Suspension updated successfully' : 'Suspension added successfully', 'success');
        closeSuspensionModal();
        loadSuspensions();
        
    } catch (err) {
        console.error("Error saving suspension:", err);
        showNotification('Error saving: ' + err.message, 'error');
    }
}

async function editSuspension(id) {
    try {
        const { data, error } = await supabase
            .from('suspensions')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        
        document.getElementById('suspension-modal').classList.remove('hidden');
        document.getElementById('modal-title').textContent = 'Edit Suspension / Break';
        
        document.getElementById('suspension-id').value = data.id;
        document.getElementById('suspension-title').value = data.title;
        document.getElementById('suspension-description').value = data.description || '';
        document.getElementById('suspension-start').value = data.start_date;
        document.getElementById('suspension-end').value = data.end_date;
        document.getElementById('suspension-type').value = data.suspension_type;
        document.getElementById('suspension-active').checked = data.is_active;
        
        handleSuspensionTypeChange();
        
        if (data.suspension_type === 'grade_suspension' && data.affected_grades) {
            await loadGradeLevels();
            data.affected_grades.forEach(grade => {
                const cb = document.querySelector(`input[name="affected_grades"][value="${grade}"]`);
                if (cb) cb.checked = true;
            });
        }
        
        if (data.suspension_type === 'suspension' && data.affected_classes) {
            await loadClasses();
            data.affected_classes.forEach(clsId => {
                const cb = document.querySelector(`input[name="affected_classes"][value="${clsId}"]`);
                if (cb) cb.checked = true;
            });
        }
        
    } catch (err) {
        console.error("Error loading suspension:", err);
        showNotification('Error loading data', 'error');
    }
}

async function toggleSuspension(id, newStatus) {
    try {
        const { error } = await supabase
            .from('suspensions')
            .update({ is_active: newStatus })
            .eq('id', id);
        
        if (error) throw error;
        
        showNotification(newStatus ? 'Suspension activated' : 'Suspension deactivated', 'success');
        loadSuspensions();
    } catch (err) {
        console.error("Error toggling suspension:", err);
        showNotification('Error updating status', 'error');
    }
}

async function deleteSuspension(id) {
    if (!confirm('Are you sure you want to delete this suspension?')) return;
    
    try {
        const { error } = await supabase.from('suspensions').delete().eq('id', id);
        
        if (error) throw error;
        
        showNotification('Suspension deleted', 'success');
        loadSuspensions();
    } catch (err) {
        console.error("Error deleting suspension:", err);
        showNotification('Error deleting', 'error');
    }
}

// ===== GLOBAL WINDOW ATTACHMENTS FOR HTML ONCLICK HANDLERS =====
window.openSuspensionModal = openSuspensionModal;
window.closeSuspensionModal = closeSuspensionModal;
window.editSuspension = editSuspension;
window.toggleSuspension = toggleSuspension;
window.deleteSuspension = deleteSuspension;
window.switchTab = switchTab;
window.saveThresholds = saveThresholds;
window.saveAttendanceRules = saveAttendanceRules;
window.saveWeekendSettings = saveWeekendSettings;
window.saveNotificationSettings = saveNotificationSettings;
window.saveSuspension = saveSuspension;

// ============== ORIGINAL CODE BELOW ==============

function switchTab(event, tabId) {
    const tabs = ['thresholds', 'attendance-rules', 'notifications'];
    
    tabs.forEach(t => {
        const contentArea = document.getElementById(`${t}Tab`);
        const navBtn = document.getElementById(`tab-${t}`);

        if (contentArea) {
            if (t === tabId) {
                contentArea.classList.remove('hidden');
            } else {
                contentArea.classList.add('hidden');
            }
        }

        if (navBtn) {
            if (t === tabId) {
                navBtn.className = 'px-4 py-2 border-b-2 border-violet-500 text-violet-600 font-semibold transition-colors';
            } else {
                navBtn.className = 'px-4 py-2 border-b-2 border-transparent text-gray-500 hover:text-gray-700 transition-colors font-medium';
            }
        }
    });
}

async function saveThresholds(event) {
    const btn = event.currentTarget;
    setLoading(btn, true);

    const keys = ['am_gate_open', 'am_late_threshold', 'am_absent_threshold', 'pm_dismissal_time', 'pm_early_cutoff'];
    
    try {
        await performBulkUpsert(keys);
        showNotification("Gate thresholds updated successfully!", "success");
    } catch (err) {
        showNotification("Update failed: " + err.message, "error");
    } finally {
        setLoading(btn, false, '<i data-lucide="save" class="w-4 h-4"></i> Save Settings');
    }
}

// NEW: Save attendance rules settings
async function saveAttendanceRules(event) {
    const btn = event.currentTarget;
    setLoading(btn, true);

    const keys = ['auto_mark_absent', 'grace_period_minutes', 'require_parent_note'];
    
    try {
        await performBulkUpsert(keys);
        showNotification("Attendance rules updated successfully!", "success");
    } catch (err) {
        showNotification("Update failed: " + err.message, "error");
    } finally {
        setLoading(btn, false, '<i data-lucide="save" class="w-4 h-4"></i> Save Rules');
    }
}

async function saveNotificationSettings(event) {
    const btn = event.currentTarget;
    setLoading(btn, true);

    const keys = ['notify_late', 'notify_absent', 'notify_clinic', 'notify_early_dismissal', 'notify_batch_am', 'notify_batch_pm'];
    
    try {
        await performBulkUpsert(keys);
        showNotification("Notification preferences saved!", "success");
    } catch (err) {
        showNotification("Update failed: " + err.message, "error");
    } finally {
        setLoading(btn, false, '<i data-lucide="save" class="w-4 h-4"></i> Save Settings');
    }
}

async function saveWeekendSettings(event) {
    const btn = event.currentTarget;
    setLoading(btn, true);

    const keys = ['weekend_sunday_enabled', 'weekend_saturday_enabled', 'weekend_saturday_class_enabled'];
    
    try {
        await performBulkUpsert(keys);
        showNotification("Weekend settings saved!", "success");
    } catch (err) {
        showNotification("Update failed: " + err.message, "error");
    } finally {
        setLoading(btn, false, '<i data-lucide="save" class="w-4 h-4"></i> Save Settings');
    }
}

async function performBulkUpsert(keys) {
    const payload = keys.map(key => {
        const el = document.getElementById(key);
        if (!el) return null;
        
        const val = el.type === 'checkbox' ? el.checked.toString() : el.value;
        return { setting_key: key, setting_value: val };
    }).filter(item => item !== null);

    const { error } = await supabase
        .from('settings')
        .upsert(payload, { onConflict: 'setting_key' });

    if (error) throw error;
}

function setLoading(btn, isLoading, originalText) {
    btn.disabled = isLoading;
    btn.innerHTML = isLoading ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving...' : originalText;
    if (window.lucide) lucide.createIcons();
}

function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `@keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } .animate-fade-in-up { animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; } .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }`;
    document.head.appendChild(style);
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

    modal.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 transform transition-all animate-fade-in-up"><div class="flex flex-col items-center text-center"><div class="w-16 h-16 ${bgColor} ${iconColor} rounded-full flex items-center justify-center mb-4"><i data-lucide="${iconName}" class="w-8 h-8"></i></div><h3 class="text-xl font-black text-gray-800 mb-2">${title}</h3><p class="text-sm text-gray-500 font-medium mb-6">${msg}</p><button id="notif-btn" class="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-gray-800 transition-all">Okay, Got it</button></div>`;
    document.body.appendChild(modal);
    document.getElementById('notif-btn').onclick = () => { modal.remove(); if(callback) callback(); };
    if(window.lucide) lucide.createIcons();
}
