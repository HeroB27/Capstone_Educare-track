// admin/admin-idmanagement.js

let studentRecords = [];
let templateSettings = {
    primaryColor: '#4c1d95',
    secondaryColor: '#8b5cf6',
    fields: { qr: true }
};

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkSession === 'function') {
        if (!checkSession('admins')) return;
    }
    await loadTemplateSettings();
    loadStudentIDs();
    injectStyles();
});

// Load template settings from database
async function loadTemplateSettings() {
    const { data } = await supabase.from('id_templates').select('settings').eq('template_type', 'student').single();
    if (data && data.settings) {
        templateSettings = data.settings;
    }
}

// Load all students with their IDs
async function loadStudentIDs() {
    const grid = document.getElementById('idGrid');
    const { data } = await supabase.from('students').select('*, classes(grade_level, section_name), parents(full_name, contact_number)').order('full_name');
    studentRecords = data || [];
    
    // Update student count
    document.getElementById('studentCount').textContent = `${studentRecords.length} Students`;
    
    renderIDGrid(studentRecords);
}

// Filter students by search term
function filterStudents() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    
    if (!searchTerm) {
        renderIDGrid(studentRecords);
        return;
    }
    
    const filtered = studentRecords.filter(s => 
        s.full_name.toLowerCase().includes(searchTerm) ||
        (s.student_id_text && s.student_id_text.toLowerCase().includes(searchTerm)) ||
        (s.lrn && s.lrn.toString().includes(searchTerm))
    );
    
    renderIDGrid(filtered);
}

// Render the student ID grid
function renderIDGrid(list) {
    const grid = document.getElementById('idGrid');
    const emptyState = document.getElementById('emptyState');
    
    if (list.length === 0) {
        grid.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    
    grid.innerHTML = list.map(s => `
        <div class="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm hover:shadow-md transition-all animate-fade-in-up">
            <div class="flex items-center gap-4 mb-5">
                <div class="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center font-black text-violet-600 uppercase text-xs">${s.full_name.charAt(0)}</div>
                <div class="min-w-0">
                    <h4 class="font-bold text-gray-800 text-sm truncate">${s.full_name}</h4>
                    <p class="text-[10px] text-gray-400 font-mono tracking-tighter uppercase">${s.student_id_text || 'No ID'}</p>
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="viewID(${s.id})" class="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all hover:bg-gray-200">View ID</button>
                <button onclick="reissueID(${s.id})" class="flex-1 py-2.5 bg-violet-600 text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-lg shadow-violet-100 transition-all hover:scale-105">Re-Issue</button>
            </div>
        </div>`).join('');
    
    if (window.lucide) lucide.createIcons();
}

// View ID - Opens modal with front/back preview
async function viewID(dbId) {
    const student = studentRecords.find(x => x.id === dbId);
    if (!student) return;
    
    const config = templateSettings;
    const container = document.getElementById('idPreviewContainer');
    
    // Generate the ID card HTML using the same function as template editor
    container.innerHTML = generatePortraitIDHTML(student, config);
    
    // Show modal
    document.getElementById('viewIdModal').classList.remove('hidden');
    document.getElementById('viewIdModal').classList.add('flex');
    
    if (window.lucide) lucide.createIcons();
}

// Close View ID Modal
function closeViewIdModal() {
    document.getElementById('viewIdModal').classList.add('hidden');
    document.getElementById('viewIdModal').classList.remove('flex');
}

// Re-issue ID - Generate new student ID
async function reissueID(dbId) {
    if (!confirm("Are you sure you want to re-issue this ID? This will generate a new student ID.")) return;
    
    const student = studentRecords.find(x => x.id === dbId);
    if (!student) return;
    
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

// MASTER RENDERING ENGINE (Portrait 2x3) - Same as admin-idtemplate.js
function generatePortraitIDHTML(u, config) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${u.student_id_text}`;
    
    // UI Scaling for 2x3 Portrait
    const front = `
        <div class="w-[2in] h-[3in] bg-white shadow-2xl rounded-xl overflow-hidden border border-gray-200 flex flex-col font-sans shrink-0 transform scale-110">
            <div style="background: linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor})" class="h-12 p-2 flex items-center gap-2">
                <div class="w-6 h-6 bg-white rounded-full flex items-center justify-center shrink-0">
                    <i data-lucide="graduation-cap" class="w-4 h-4 text-violet-900"></i>
                </div>
                <div class="text-white overflow-hidden leading-none">
                    <h4 class="text-[7px] font-black uppercase">Educare Colleges Inc</h4>
                    <p class="text-[5px] opacity-80 uppercase tracking-tighter">Purok 4 Irisan Baguio City</p>
                </div>
            </div>
            <div class="flex-1 flex flex-col items-center pt-4 px-3 text-center">
                <div class="w-20 h-20 bg-gray-100 border-2 border-violet-100 p-1 rounded-xl mb-2 overflow-hidden">
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(u.full_name)}&background=f3f4f6&color=4b5563" class="w-full h-full object-cover rounded-lg">
                </div>
                <h2 class="text-[9px] font-black text-gray-900 uppercase leading-tight mt-2">${u.full_name}</h2>
                <div class="w-full text-left mt-4 space-y-2 border-t pt-3 border-gray-50">
                    <div>
                        <p class="text-[5px] text-gray-400 font-bold uppercase leading-none">Address</p>
                        <p class="text-[6px] font-medium text-gray-700 leading-tight">${u.address || 'N/A'}</p>
                    </div>
                    <div>
                        <p class="text-[5px] text-gray-400 font-bold uppercase leading-none">Class</p>
                        <p class="text-[6px] font-bold text-violet-700">${u.classes?.grade_level || 'N/A'}</p>
                    </div>
                </div>
            </div>
            <div style="background: ${config.primaryColor}" class="h-1.5 w-full mt-auto"></div>
        </div>`;

    const back = `
        <div class="w-[2in] h-[3in] bg-white shadow-2xl rounded-xl overflow-hidden border border-gray-200 flex flex-col font-sans shrink-0 transform scale-110">
            <div class="p-4 flex flex-col items-center justify-center flex-1 text-center">
                ${config.fields.qr ? `<img src="${qrUrl}" class="w-16 h-16 border p-1 rounded-lg mb-2 shadow-sm">` : ''}
                <p class="text-[8px] font-mono font-bold text-gray-900 mb-6 uppercase tracking-wider">${u.student_id_text}</p>
                <div class="w-full bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-4 text-left">
                    <p class="text-[5px] text-gray-400 font-bold uppercase mb-1">Guardian / Contact</p>
                    <p class="text-[7px] font-black text-gray-800">${u.parents?.full_name || 'N/A'}</p>
                    <p class="text-[7px] font-bold text-violet-700">${u.parents?.contact_number || 'N/A'}</p>
                </div>
                <p class="text-[5px] text-gray-400 italic px-2">If lost, return to the admin office at Purok 4 Irisan Baguio City.</p>
            </div>
            <div style="background: ${config.primaryColor}" class="h-1.5 w-full mt-auto"></div>
        </div>`;

    return front + back;
}

// Inject CSS animations
function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `@keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } .animate-fade-in-up { animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; } .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }`;
    document.head.appendChild(style);
}

// Notification helper
function showNotification(msg, type='info', callback=null) {
    const existing = document.getElementById('notification-modal');
    if(existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'notification-modal';
    modal.className = 'fixed inset-0 bg-black/50 z-[70] flex items-center justify-center animate-fade-in';
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