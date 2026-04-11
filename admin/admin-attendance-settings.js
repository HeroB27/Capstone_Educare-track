// admin/admin-attendance-settings.js

// 1. Initialize Page
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkSession === 'function') {
        if (!checkSession('admins')) return;
    }
    
    await loadAllSettings();
    injectStyles();
    
    const satToggle = document.getElementById('weekend_saturday_enabled');
    if (satToggle) {
        satToggle.addEventListener('change', handleSaturdayToggle);
    }
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

// ===== GLOBAL WINDOW ATTACHMENTS FOR HTML ONCLICK HANDLERS =====
window.switchTab = switchTab;
window.saveThresholds = saveThresholds;
window.saveAttendanceRules = saveAttendanceRules;
window.saveWeekendSettings = saveWeekendSettings;
window.saveNotificationSettings = saveNotificationSettings;

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

    const keys = ['am_gate_open', 'am_late_threshold', 'am_absent_threshold', 'pm_dismissal_time', 'pm_early_cutoff', 'school_start_time', 'school_end_time'];
    
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
