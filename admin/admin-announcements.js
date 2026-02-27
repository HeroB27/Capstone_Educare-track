let selectedCategory = '';

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkSession === 'function') {
        if (!checkSession('admins')) return;
    }
    loadAnnouncements();
    injectStyles();
});

// --- SUSPENSION MODAL LOGIC (MOVED FROM SYSTEM SETTINGS) ---

function openSuspensionModal() { document.getElementById('suspensionModal').classList.remove('hidden'); }
function closeSuspensionModal() { document.getElementById('suspensionModal').classList.add('hidden'); }

function setCategory(cat) {
    selectedCategory = cat;
    document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`cat-${cat}`).classList.add('active');
    document.getElementById('dynamicFields').classList.remove('hidden');
    
    const typeSelect = document.getElementById('eventType');
    const options = {
        'Calamity': ['Typhoon', 'Earthquake', 'Outbreak'],
        'Holiday': ['National Holiday', 'Local Holiday', 'School Holiday'],
        'Others': ['NAT Testing', 'Emergency']
    };
    typeSelect.innerHTML = `<option value="">Select Type...</option>` + options[cat].map(o => `<option value="${o}">${o}</option>`).join('');
}

function handleTypeChange() {
    const type = document.getElementById('eventType').value;
    const ruleInfo = document.getElementById('ruleInfo');
    const container = document.getElementById('typeSelection');
    
    // Logic for Signal Levels (Typhoon)
    const existing = document.getElementById('signalContainer');
    if (existing) existing.remove();

    if (type === 'Typhoon') {
        const html = `
            <div id="signalContainer" class="mt-2 p-3 bg-violet-50 rounded-xl border border-violet-100">
                <label class="block text-[9px] font-black text-violet-500 uppercase mb-1">Signal Level</label>
                <select id="signalLevel" onchange="calculateSuspensionRules()" class="w-full border-none bg-transparent p-0 text-sm outline-none font-bold">
                    <option value="1">Signal No. 1</option>
                    <option value="2">Signal No. 2</option>
                    <option value="3">Signal No. 3+</option>
                </select>
            </div>`;
        container.insertAdjacentHTML('beforeend', html);
        calculateSuspensionRules();
    } else {
        ruleInfo.classList.add('hidden');
        ruleInfo.dataset.target = "All";
    }
}

function calculateSuspensionRules() {
    const signal = document.getElementById('signalLevel').value;
    const info = document.getElementById('ruleInfo');
    const desc = document.getElementById('ruleDesc');
    const title = document.getElementById('ruleTitle');
    
    info.classList.remove('hidden');
    if (signal === "1") {
        title.innerText = "Signal No. 1 Policy";
        desc.innerText = "Automatic suspension for Kinder only. Other levels proceed.";
        info.dataset.target = "Kinder";
    } else if (signal === "2") {
        title.innerText = "Signal No. 2 Policy";
        desc.innerText = "Suspension for Kinder to JHS (G10). Shift to Modular Learning.";
        info.dataset.target = "Elementary,Junior High";
    } else {
        title.innerText = "Signal No. 3+ Policy";
        desc.innerText = "Total suspension of all classes and school work.";
        info.dataset.target = "All";
    }
}

// THE DUAL-SAVE LOGIC
async function saveLogicSuspension() {
    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    setLoading(btn, true, 'Processing...');

    const payload = {
        holiday_date: document.getElementById('eventDate').value,
        description: `${document.getElementById('eventType').value}${document.getElementById('signalLevel') ? ' (S#'+document.getElementById('signalLevel').value+')' : ''} - ${document.getElementById('scheduleType').value}`,
        target_grades: document.getElementById('ruleInfo').dataset.target || "All",
        is_suspended: true,
        notes: document.getElementById('eventNotes').value
    };

    // 1. Insert into Holidays Table (For the Calendar)
    const { error: holidayError } = await supabase.from('holidays').insert([payload]);

    if (!holidayError) {
        // 2. Insert into Announcements Table (For Portals)
        if (document.getElementById('autoAnnounce').checked) {
            await supabase.from('announcements').insert([{
                title: `🚨 SUSPENSION: ${payload.description}`,
                content: `Class suspension declared for ${payload.target_grades} on ${payload.holiday_date}. ${payload.notes}`,
                target_parents: true, target_teachers: true, target_guards: true, target_clinic: true
            }]);
        }
        showNotification("Suspension Recorded and Broadcasted!", "success");
        closeSuspensionModal();
        loadAnnouncements();
    } else {
        showNotification("Failed to save: " + holidayError.message, "error");
    }
    setLoading(btn, false, originalText);
}

// --- STANDARD ANNOUNCEMENT LOGIC ---

async function loadAnnouncements() {
    const list = document.getElementById('announcementList');
    const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
    if (error) return;

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
    if(!confirm("Are you sure you want to delete this announcement?")) return;
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if(error) showNotification("Error: " + error.message, "error");
    else {
        showNotification("Announcement deleted successfully", "success");
        loadAnnouncements();
    }
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