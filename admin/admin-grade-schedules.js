// admin/admin-grade-schedules.js
// Manages Grade-Level Attendance Schedules

// Default grade levels with their display names and IDs
const GRADE_LEVELS = [
    { id: 'kinder', name: 'Kindergarten', shortName: 'Kinder', icon: 'baby' },
    { id: 'grades1_3', name: 'Grades 1-3', shortName: 'G1-3', icon: 'shapes' },
    { id: 'grades4_6', name: 'Grades 4-6', shortName: 'G4-6', icon: 'book-open' },
    { id: 'jhs', name: 'Junior High School', shortName: 'JHS', icon: 'graduation-cap' },
    { id: 'shs', name: 'Senior High School', shortName: 'SHS', icon: 'school' }
];

// 1. Initialize Page
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkSession === 'function') {
        if (!checkSession('admins')) return;
    }
    
    await initializePage();
});

async function initializePage() {
    await loadGlobalThresholds();
    await ensureGradeSchedulesTable();
    await loadGradeSchedules();
}

// 2. Load Global Thresholds from Settings
async function loadGlobalThresholds() {
    try {
        const { data, error } = await supabase.from('settings').select('*');
        if (error) throw error;

        const settings = {};
        data?.forEach(s => settings[s.setting_key] = s.setting_value);

        document.getElementById('global-am-gate').innerText = settings.am_gate_open || '--:--';
        document.getElementById('global-am-late').innerText = settings.am_late_threshold || '--:--';
        document.getElementById('global-pm-dismissal').innerText = settings.pm_dismissal_time || '--:--';
        document.getElementById('global-pm-early').innerText = settings.pm_early_cutoff || '--:--';

    } catch (err) {
        console.error("Error loading global thresholds:", err);
    }
}

// 3. Ensure grade_schedules table exists (check and create via settings if needed)
// Note: In production, you'd run migrations. Here we use settings as a fallback storage.
async function ensureGradeSchedulesTable() {
    // We'll store grade schedules in the settings table with prefixed keys
    // This is simpler than creating a new table and works with existing infrastructure
    // Keys format: grade_{id}_start, grade_{id}_end, grade_{id}_late_threshold
}

// 4. Load Grade Schedules
async function loadGradeSchedules() {
    const container = document.getElementById('grade-schedules-container');
    container.innerHTML = '';

    try {
        // Load all settings
        const { data: settingsData, error } = await supabase.from('settings').select('*');
        if (error) throw error;

        // Create settings lookup
        const settings = {};
        settingsData?.forEach(s => settings[s.setting_key] = s.setting_value);

        // Build the grid
        container.innerHTML = GRADE_LEVELS.map(grade => {
            const startTime = settings[`grade_${grade.id}_start`] || '07:00';
            const endTime = settings[`grade_${grade.id}_end`] || '15:00';
            const lateThreshold = settings[`grade_${grade.id}_late_threshold`] || '08:00';
            const earlyCutoff = settings[`grade_${grade.id}_early_cutoff`] || '14:00';

            return `
                <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div class="px-6 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center gap-3">
                        <div class="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
                            <i data-lucide="${grade.icon}" class="w-5 h-5 text-violet-600"></i>
                        </div>
                        <div>
                            <h3 class="font-black text-gray-800">${grade.name}</h3>
                            <p class="text-xs text-gray-400">${grade.shortName}</p>
                        </div>
                    </div>
                    <div class="p-6 space-y-5">
                        <!-- Morning Schedule -->
                        <div>
                            <p class="text-xs font-bold text-gray-400 uppercase mb-3">Morning (AM)</p>
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="text-[10px] font-black text-gray-400 uppercase ml-1">Gate Open</label>
                                    <input type="time" id="grade_${grade.id}_start" value="${startTime}" 
                                        class="w-full border-2 border-gray-100 rounded-xl px-3 py-2 mt-1 font-bold text-sm outline-none focus:border-violet-300 transition-all">
                                </div>
                                <div>
                                    <label class="text-[10px] font-black text-gray-400 uppercase ml-1">Late Cutoff</label>
                                    <input type="time" id="grade_${grade.id}_late_threshold" value="${lateThreshold}" 
                                        class="w-full border-2 border-amber-100 bg-amber-50/30 rounded-xl px-3 py-2 mt-1 font-bold text-sm outline-none focus:border-amber-300 transition-all">
                                </div>
                            </div>
                        </div>
                        
                        <!-- Afternoon Schedule -->
                        <div>
                            <p class="text-xs font-bold text-gray-400 uppercase mb-3">Afternoon (PM)</p>
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="text-[10px] font-black text-gray-400 uppercase ml-1">Dismissal</label>
                                    <input type="time" id="grade_${grade.id}_end" value="${endTime}" 
                                        class="w-full border-2 border-gray-100 rounded-xl px-3 py-2 mt-1 font-bold text-sm outline-none focus:border-violet-300 transition-all">
                                </div>
                                <div>
                                    <label class="text-[10px] font-black text-gray-400 uppercase ml-1">Early Cutoff</label>
                                    <input type="time" id="grade_${grade.id}_early_cutoff" value="${earlyCutoff}" 
                                        class="w-full border-2 border-amber-100 bg-amber-50/30 rounded-xl px-3 py-2 mt-1 font-bold text-sm outline-none focus:border-amber-300 transition-all">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        lucide.createIcons();

    } catch (err) {
        console.error("Error loading grade schedules:", err);
        container.innerHTML = `
            <div class="col-span-full text-center py-12">
                <p class="text-red-500">Error loading grade schedules.</p>
            </div>
        `;
    }
}

// 5. Save All Grade Schedules
async function saveAllSchedules() {
    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving...';
    btn.disabled = true;

    try {
        const payloads = [];

        // Collect all grade schedule settings
        GRADE_LEVELS.forEach(grade => {
            const startTime = document.getElementById(`grade_${grade.id}_start`)?.value;
            const endTime = document.getElementById(`grade_${grade.id}_end`)?.value;
            const lateThreshold = document.getElementById(`grade_${grade.id}_late_threshold`)?.value;
            const earlyCutoff = document.getElementById(`grade_${grade.id}_early_cutoff`)?.value;

            if (startTime) payloads.push({ setting_key: `grade_${grade.id}_start`, setting_value: startTime });
            if (endTime) payloads.push({ setting_key: `grade_${grade.id}_end`, setting_value: endTime });
            if (lateThreshold) payloads.push({ setting_key: `grade_${grade.id}_late_threshold`, setting_value: lateThreshold });
            if (earlyCutoff) payloads.push({ setting_key: `grade_${grade.id}_early_cutoff`, setting_value: earlyCutoff });
        });

        // Bulk upsert
        const { error } = await supabase.from('settings').upsert(payloads, { onConflict: 'setting_key' });
        
        if (error) throw error;

        showNotification("All grade schedules saved successfully!", "success");

    } catch (err) {
        console.error("Error saving grade schedules:", err);
        showNotification("Error saving schedules: " + err.message, "error");
    }

    btn.innerHTML = originalText;
    btn.disabled = false;
    lucide.createIcons();
}

// Helper: Show notification
function showNotification(msg, type = 'info') {
    const existing = document.getElementById('notification-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'notification-modal';
    modal.className = 'fixed inset-0 bg-black/50 z-[60] flex items-center justify-center animate-fade-in';

    const iconColor = type === 'success' ? 'text-emerald-500' : type === 'error' ? 'text-red-500' : 'text-violet-600';
    const bgColor = type === 'success' ? 'bg-emerald-50' : type === 'error' ? 'bg-red-50' : 'bg-violet-50';
    const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info';
    const title = type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Information';

    // Play sound
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = type === 'error' ? 220 : 550;
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    } catch (e) { }

    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 transform transition-all animate-fade-in-up">
            <div class="flex flex-col items-center text-center">
                <div class="w-16 h-16 ${bgColor} ${iconColor} rounded-full flex items-center justify-center mb-4">
                    <i data-lucide="${iconName}" class="w-8 h-8"></i>
                </div>
                <h3 class="text-xl font-black text-gray-800 mb-2">${title}</h3>
                <p class="text-sm text-gray-500 font-medium mb-6">${msg}</p>
                <button id="notif-btn" class="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-gray-800 transition-all">Okay, Got it</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    document.getElementById('notif-btn').onclick = () => modal.remove();
    if (window.lucide) lucide.createIcons();
}
