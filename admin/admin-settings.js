// admin/admin-settings.js

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkSession === 'function') {
        if (!checkSession('admins')) return;
    }
    
    // Load existing thresholds and notification settings
    await loadAllSettings();
    loadPasswordResetBadge(); // For the new tab badge
    injectDeviceSettingsUI();
    injectPasswordChangeUI();
    injectStyles();
});

function switchTab(tabId) {
    const tabs = ['gate-logic', 'auto-alerts', 'password-resets'];
    tabs.forEach(t => {
        document.getElementById(`section-${t}`)?.classList.add('hidden');
        const btn = document.getElementById(`btn-${t}`);
        if (btn) {
            btn.classList.remove('active', 'border-violet-500', 'text-violet-600');
            btn.classList.add('border-transparent', 'text-gray-400');
        }
    });
    
    const section = document.getElementById(`section-${tabId}`);
    const activeBtn = document.getElementById(`btn-${tabId}`);
    
    if (section) section.classList.remove('hidden');
    if (activeBtn) {
        activeBtn.classList.add('active', 'border-violet-500', 'text-violet-600');
        activeBtn.classList.remove('border-transparent', 'text-gray-400');
    }

    // Load content for the password reset tab when it's clicked
    if (tabId === 'password-resets') {
        loadPasswordResets();
    }
}

// --- DB INTERACTION: SETTINGS TABLE ---

async function loadAllSettings() {
    try {
        const { data, error } = await supabase.from('settings').select('*');
        if (!error && data) {
            data.forEach(s => {
                const el = document.getElementById(s.setting_key);
                if (el) {
                    if (el.type === 'checkbox') el.checked = (s.setting_value === 'true');
                    else el.value = s.setting_value;
                }
            });
        }
    } catch (err) {
        console.error("Error loading settings:", err);
    }
}

async function performBulkUpsert(keys) {
    const payload = keys.map(key => {
        const el = document.getElementById(key);
        return el ? { 
            setting_key: key, 
            setting_value: el.type === 'checkbox' ? el.checked.toString() : el.value 
        } : null;
    }).filter(p => p !== null);

    const { error } = await supabase.from('settings').upsert(payload, { onConflict: 'setting_key' });
    if (error) throw error;
}

async function saveThresholds() {
    const btn = event.currentTarget;
    const originalText = btn.innerText;
    btn.innerText = "Syncing...";
    try {
        await performBulkUpsert(['am_gate_open', 'am_late_threshold', 'pm_dismissal_time', 'pm_early_cutoff']);
        showNotification("Gate Logic Thresholds Saved!", "success");
    } catch (e) { 
        showNotification("Update failed: " + e.message, "error"); 
    }
    btn.innerText = originalText;
}

async function saveNotificationSettings() {
    const btn = event.currentTarget;
    const originalText = btn.innerText;
    btn.innerText = "Saving...";
    try {
        await performBulkUpsert(['notify_late', 'notify_absent']);
        showNotification("Notification Alerts Updated!", "success");
    } catch (e) { 
        showNotification("Update failed: " + e.message, "error"); 
    }
    btn.innerText = originalText;
}

function injectDeviceSettingsUI() {
    const container = document.getElementById('section-notifications');
    if (!container) return;

    const html = `
        <div class="mt-8 pt-6 border-t border-gray-100">
            <h3 class="text-lg font-bold text-gray-800 mb-2">Device Preferences</h3>
            <p class="text-sm text-gray-500 mb-4">These settings are saved on this device only and will not sync across computers.</p>
            <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div class="flex items-center justify-between">
                    <div>
                        <h4 class="font-bold text-gray-800">Do Not Disturb</h4>
                        <p class="text-sm text-gray-500">Mute all notification sounds and vibrations on this device.</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="dnd_enabled" onchange="saveDevicePreferences()" class="sr-only peer">
                        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                    </label>
                </div>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
    
    const dndEnabled = localStorage.getItem('educare_dnd_enabled') === 'true';
    const dndToggle = document.getElementById('dnd_enabled');
    if (dndToggle) dndToggle.checked = dndEnabled;
}

function saveDevicePreferences() {
    localStorage.setItem('educare_dnd_enabled', document.getElementById('dnd_enabled').checked);
    showNotification("Device preferences updated!", "success");
}

function injectPasswordChangeUI() {
    // Inject Change Password Button
    const btn = document.createElement('button');
    btn.className = 'fixed bottom-6 left-6 px-6 py-3 bg-white text-gray-700 border border-gray-200 rounded-xl font-bold text-sm uppercase tracking-widest shadow-lg hover:bg-gray-50 transition-all z-40 flex items-center gap-2';
    btn.innerHTML = '<i data-lucide="lock" class="w-4 h-4"></i> Change Password';
    btn.onclick = () => document.getElementById('changePasswordModal').classList.remove('hidden');
    document.body.appendChild(btn);

    // Inject Modal
    const modal = document.createElement('div');
    modal.id = 'changePasswordModal';
    modal.className = 'fixed inset-0 bg-black/50 z-[70] hidden flex items-center justify-center backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 m-4 animate-fade-in-up">
            <h3 class="text-xl font-black text-gray-800 mb-6">Change Password</h3>
            <div class="space-y-4">
                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Current Password</label>
                    <input type="password" id="cp-current" class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-800 focus:outline-none focus:border-violet-500 transition-all">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">New Password</label>
                    <input type="password" id="cp-new" class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-800 focus:outline-none focus:border-violet-500 transition-all">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Confirm Password</label>
                    <input type="password" id="cp-confirm" class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-800 focus:outline-none focus:border-violet-500 transition-all">
                </div>
            </div>
            <div class="flex gap-3 mt-8">
                <button onclick="document.getElementById('changePasswordModal').classList.add('hidden')" class="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-gray-200 transition-all">Cancel</button>
                <button onclick="submitPasswordChange()" class="flex-1 py-3 bg-violet-600 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-violet-700 transition-all shadow-lg shadow-violet-200">Update</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    if(window.lucide) lucide.createIcons();
}

async function submitPasswordChange() {
    const current = document.getElementById('cp-current').value;
    const newPass = document.getElementById('cp-new').value;
    const confirmPass = document.getElementById('cp-confirm').value;
    if(!current || !newPass || !confirmPass) return showNotification("All fields are required", "error");
    if(newPass !== confirmPass) return showNotification("New passwords do not match", "error");
    
    const user = JSON.parse(localStorage.getItem('educare_user') || sessionStorage.getItem('educare_user'));
    if(!user) return;

    const { data, error } = await supabase.from('admins').select('*').eq('id', user.id).eq('password', current).single();
    if(error || !data) return showNotification("Incorrect current password", "error");

    const { error: updateErr } = await supabase.from('admins').update({ password: newPass }).eq('id', user.id);
    if(updateErr) showNotification(updateErr.message, "error");
    else { showNotification("Password updated successfully", "success"); document.getElementById('changePasswordModal').classList.add('hidden'); document.getElementById('cp-current').value=''; document.getElementById('cp-new').value=''; document.getElementById('cp-confirm').value=''; }
}

async function loadPasswordResetBadge() {
    const badge = document.getElementById('password-reset-badge');
    if (!badge) return;

    const fetchCount = async () => {
        try {
            const { count, error } = await supabase
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('recipient_role', 'admins')
                .eq('type', 'system_alert')
                .eq('is_read', false);

            if (error) throw error;

            badge.innerText = count;
            badge.classList.toggle('hidden', count === 0);
        } catch (e) { console.error("Error loading password reset badge:", e); }
    };

    await fetchCount();

    supabase.channel('password-reset-notifications')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_role=eq.admins` }, payload => {
            fetchCount();
        })
        .subscribe();
}

async function loadPasswordResets() {
    const list = document.getElementById('password-reset-list');
    const query = document.getElementById('password-reset-search')?.value || '';
    list.innerHTML = '<tr><td class="px-8 py-12 text-center text-gray-400 italic">Loading requests...</td></tr>';

    let queryBuilder = supabase
        .from('notifications')
        .select('*')
        .eq('recipient_role', 'admins')
        .eq('type', 'system_alert')
        .eq('is_read', false);

    if (query) {
        // The username is in the message, so we search there.
        queryBuilder = queryBuilder.ilike('message', `%${query}%`);
    }

    const { data, error } = await queryBuilder.order('created_at', { ascending: true });

    if (error) {
        list.innerHTML = '<tr><td class="px-8 py-12 text-center text-red-500">Error loading requests.</td></tr>';
        return;
    }

    if (data.length === 0) {
        list.innerHTML = '<tr><td class="px-8 py-12 text-center text-gray-400 italic">No pending password reset requests.</td></tr>';
        return;
    }

    list.innerHTML = data.map(req => `
        <tr class="hover:bg-violet-50/50 transition-colors">
            <td class="px-8 py-5 font-medium text-gray-700">${req.message}</td>
            <td class="px-8 py-5 text-sm text-gray-500">${new Date(req.created_at).toLocaleString()}</td>
            <td class="px-8 py-5 text-right">
                <button onclick="resolvePasswordRequest(${req.id})" class="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-emerald-200 transition-all">Mark Resolved</button>
            </td>
        </tr>
    `).join('');
}

async function resolvePasswordRequest(id) {
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    if (error) showNotification("Failed to resolve request.", "error");
    else {
        showNotification("Request marked as resolved.", "success");
        loadPasswordResets(); // Refresh the list
    }
}

async function deleteAllResolved() {
    if (!confirm("Are you sure you want to delete all resolved password reset requests? This action cannot be undone.")) return;

    try {
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('recipient_role', 'admins')
            .eq('type', 'system_alert')
            .eq('is_read', true);

        if (error) throw error;
        showNotification("All resolved requests have been deleted.", "success");
    } catch (e) {
        showNotification("Error deleting requests: " + e.message, "error");
    }
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
        // Feedback: Vibrate (Mobile) & Sound (Desktop)
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