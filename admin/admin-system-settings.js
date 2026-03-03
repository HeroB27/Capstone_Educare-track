// admin/admin-system-settings.js

let selectedCategory = '';

document.addEventListener('DOMContentLoaded', () => {
    if (!checkSession('admins')) return;
    
    // Setup Dropdowns
    const monthSelect = document.getElementById('holidayMonth');
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    monthSelect.innerHTML = months.map((m, i) => `<option value="${i}">${m}</option>`).join('');
    
    const yearSelect = document.getElementById('holidayYear');
    const curYear = new Date().getFullYear();
    for(let y=curYear-1; y<=curYear+1; y++) yearSelect.add(new Option(y, y));

    monthSelect.value = new Date().getMonth();
    yearSelect.value = curYear;
    
    loadSuspensions();
    injectStyles();
});

// ROBUST DATE HANDLER: Calculates exact month end to prevent timezone data-loss
async function loadSuspensions() {
    const list = document.getElementById('suspensionList');
    if (!list) return;
    list.innerHTML = '<tr><td colspan="4" class="px-6 py-12 text-center text-gray-400 italic">Syncing...</td></tr>';

    const month = parseInt(document.getElementById('holidayMonth').value);
    const year = parseInt(document.getElementById('holidayYear').value);

    // FIX: Manually build the YYYY-MM-DD string to bypass UTC shifting
    const monthStr = String(month + 1).padStart(2, '0');
    const lastDay = new Date(year, month + 1, 0).getDate(); // Gets 28, 30, or 31 accurately
    
    const start = `${year}-${monthStr}-01`;
    const end = `${year}-${monthStr}-${lastDay}`;

    try {
        const { data, error } = await supabase
            .from('holidays')
            .select('*')
            .gte('holiday_date', start)
            .lte('holiday_date', end)
            .order('holiday_date', { ascending: true });

        if (error) throw error;

        list.innerHTML = data.length ? data.map(h => `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4 font-mono text-[11px] font-bold text-slate-500">${h.holiday_date}</td>
                <td class="px-6 py-4">
                    <p class="text-sm font-bold text-slate-800">${h.description}</p>
                    <p class="text-[10px] text-slate-400 italic">${h.notes || ''}</p>
                </td>
                <td class="px-6 py-4">
                    <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase ${h.target_grades === 'All' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}">
                        ${h.target_grades}
                    </span>
                </td>
                <td class="px-6 py-4 text-right">
                    <button onclick="deleteRecord(${h.id})" class="text-slate-300 hover:text-red-500 transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </td>
            </tr>`).join('') : '<tr><td colspan="4" class="px-6 py-12 text-center text-slate-400">No events scheduled.</td></tr>';
        lucide.createIcons();
    } catch (err) {
        console.error("Error loading suspensions:", err);
        list.innerHTML = '<tr><td colspan="4" class="px-6 py-12 text-center text-red-500">Error loading data.</td></tr>';
    }
}

function setCategory(cat) {
    selectedCategory = cat;
    document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`cat-${cat}`).classList.add('active');
    document.getElementById('dynamicFields').classList.remove('hidden');
    
    const typeSelect = document.getElementById('eventType');
    const options = {
        'Calamity': ['Typhoon', 'Earthquake', 'Fire', 'Outbreak'],
        'Holiday': ['National Holiday', 'Local Holiday', 'School Holiday'],
        'Others': ['NAT Testing', 'Shortened Period', 'Emergency']
    };
    typeSelect.innerHTML = `<option value="">Select Type...</option>` + options[cat].map(o => `<option value="${o}">${o}</option>`).join('');
    handleTypeChange();
}

function handleTypeChange() {
    const type = document.getElementById('eventType').value;
    const container = document.getElementById('typeSelection');
    const ruleInfo = document.getElementById('ruleInfo');

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

async function saveLogicSuspension() {
    const btn = event.currentTarget;
    btn.disabled = true;

    const payload = {
        holiday_date: document.getElementById('eventDate').value,
        description: `${document.getElementById('eventType').value}${document.getElementById('signalLevel') ? ' (S#'+document.getElementById('signalLevel').value+')' : ''} - ${document.getElementById('scheduleType').value}`,
        target_grades: document.getElementById('ruleInfo').dataset.target || "All",
        is_suspended: true,
        notes: document.getElementById('eventNotes').value
    };

    const { error } = await supabase.from('holidays').insert([payload]);
    if (!error) {
        if (document.getElementById('autoAnnounce').checked) {
            await supabase.from('announcements').insert([{
                title: `SUSPENSION: ${payload.description}`,
                content: `Suspension active for [${payload.target_grades}] on ${payload.holiday_date}. ${payload.notes}`,
                target_parents: true, target_teachers: true
            }]);
        }
        showNotification("Suspension/Holiday Declared Successfully!", "success");
        closeSuspensionModal();
        loadSuspensions();
    }
    btn.disabled = false;
}

function openSuspensionModal() { document.getElementById('suspensionModal').classList.remove('hidden'); }
function closeSuspensionModal() { document.getElementById('suspensionModal').classList.add('hidden'); }
async function deleteRecord(id) {
    showConfirmationModal(
        "Lift Suspension?",
        "Are you sure you want to lift this suspension?",
        async () => {
            await supabase.from('holidays').delete().eq('id', id);
            showNotification("Suspension lifted.", "success");
            loadSuspensions();
        }
    );
}

function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `@keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } .animate-fade-in-up { animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; } .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }`;
    document.head.appendChild(style);
}

function showConfirmationModal(title, message, onConfirm) {
    const existing = document.getElementById('confirmation-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'confirmation-modal';
    modal.className = 'fixed inset-0 bg-black/50 z-[90] flex items-center justify-center animate-fade-in p-4';

    modal.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-auto p-6 transform transition-all animate-fade-in-up"><div class="text-center"><div class="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4 mx-auto"><i data-lucide="alert-triangle" class="w-8 h-8"></i></div><h3 class="text-xl font-black text-gray-800 mb-2">${title}</h3><p class="text-sm text-gray-500 font-medium mb-6">${message}</p><div class="flex gap-3"><button id="confirm-cancel-btn" class="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-gray-200 transition-all">Cancel</button><button id="confirm-action-btn" class="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-200">Confirm</button></div></div></div>`;

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