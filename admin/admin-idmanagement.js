// admin/admin-idmanagement.js

let studentRecords = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkSession === 'function') {
        if (!checkSession('admins')) return;
    }
    loadStudentIDs();
    injectStyles();
});

async function loadStudentIDs() {
    const grid = document.getElementById('idGrid');
    const { data } = await supabase.from('students').select('*, classes(grade_level, section_name), parents(full_name, contact_number)').order('full_name');
    studentRecords = data || [];
    renderIDGrid(studentRecords);
}

function renderIDGrid(list) {
    const grid = document.getElementById('idGrid');
    grid.innerHTML = list.map(s => `
        <div class="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm hover:shadow-md transition-all">
            <div class="flex items-center gap-4 mb-5">
                <div class="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center font-black text-violet-600 uppercase text-xs">${s.full_name.charAt(0)}</div>
                <div class="min-w-0">
                    <h4 class="font-bold text-gray-800 text-sm truncate">${s.full_name}</h4>
                    <p class="text-[10px] text-gray-400 font-mono tracking-tighter uppercase">${s.student_id_text}</p>
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="reissueID(${s.id})" class="flex-1 py-2.5 bg-violet-600 text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-lg shadow-violet-100 transition-all hover:scale-105">Re-Issue ID</button>
            </div>
        </div>`).join('');
}

async function reissueID(dbId) {
    if (!confirm("Are you sure you want to re-issue this ID? This will invalidate the previous QR code.")) return;
    const student = studentRecords.find(x => x.id === dbId);
    const year = new Date().getFullYear();
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const last4 = student.lrn.toString().slice(-4);
    const newID = `EDU-${year}-${last4}-${suffix}`;

    const { error } = await supabase.from('students').update({ student_id_text: newID }).eq('id', dbId);
    if (!error) {
        showNotification(`New ID Issued: ${newID}`, "success");
        loadStudentIDs();
    } else {
        showNotification(error.message, "error");
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