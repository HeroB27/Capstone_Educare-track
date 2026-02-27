// admin/admin-attendance-settings.js

// 1. Initialize Page
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkSession === 'function') {
        if (!checkSession('admins')) return;
    }
    
    // Load all settings from the database into the inputs
    await loadAllSettings();
    injectStyles();
});

// 2. Load Settings from Supabase
async function loadAllSettings() {
    try {
        const { data, error } = await supabase.from('settings').select('*');
        if (error) throw error;

        // Map the database rows directly to the UI inputs
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
    } catch (err) {
        console.error("Error loading settings:", err);
    }
}

// 3. The Switch Tab Function (Fixed to prevent "null" error)
function switchTab(tabId) {
    const tabs = ['thresholds', 'attendance-rules', 'notifications'];
    
    tabs.forEach(t => {
        const contentArea = document.getElementById(`${t}Tab`);
        const navBtn = document.getElementById(`tab-${t}`);

        // Only try to modify if the element actually exists in the HTML
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

// 4. Save Logic: Time Thresholds
async function saveThresholds() {
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

// 5. Save Logic: Notification Toggles
async function saveNotificationSettings() {
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

// 6. The "Simplifier" Utility: Bulk Upsert
async function performBulkUpsert(keys) {
    const payload = keys.map(key => {
        const el = document.getElementById(key);
        if (!el) return null;
        
        const val = el.type === 'checkbox' ? el.checked.toString() : el.value;
        return { 
            setting_key: key, 
            setting_value: val,
            // Optional: add a description so the DB stays readable
            setting_description: `Admin setting for ${key}` 
        };
    }).filter(item => item !== null);

    const { error } = await supabase
        .from('settings')
        .upsert(payload, { onConflict: 'setting_key' });

    if (error) throw error;
}

// Helper: Loading Spinner
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