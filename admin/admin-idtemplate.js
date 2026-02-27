// admin/admin-idtemplate.js

let templateSettings = {
    primaryColor: '#4c1d95',
    secondaryColor: '#8b5cf6',
    fields: { qr: true }
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!checkSession('admins')) return;
    await loadSavedTemplate();
    injectStyles();
});

async function loadSavedTemplate() {
    const { data } = await supabase.from('id_templates').select('settings').eq('template_type', 'student').single();
    if (data && data.settings) {
        templateSettings = data.settings;
        document.getElementById('primaryColor').value = templateSettings.primaryColor;
        document.getElementById('secondaryColor').value = templateSettings.secondaryColor;
        document.getElementById('field-qr').checked = templateSettings.fields.qr;
    }
    updatePreview();
}

function updatePreview() {
    const container = document.getElementById('livePreviewContainer');
    templateSettings.primaryColor = document.getElementById('primaryColor').value;
    templateSettings.secondaryColor = document.getElementById('secondaryColor').value;
    templateSettings.fields.qr = document.getElementById('field-qr').checked;

    const mockUser = {
        full_name: "JUAN DELA CRUZ",
        student_id_text: "EDU-2026-0001",
        address: "Purok 4, Irisan, Baguio City",
        classes: { grade_level: 'Grade 10' },
        parents: { full_name: "Maria Dela Cruz", contact_number: "09123456789" }
    };

    container.innerHTML = generatePortraitIDHTML(mockUser, templateSettings);
    if (window.lucide) lucide.createIcons();
}

async function saveTemplate() {
    const { error } = await supabase.from('id_templates').upsert({
        template_type: 'student',
        settings: templateSettings,
        updated_at: new Date()
    }, { onConflict: 'template_type' });

    if (!error) showNotification('Portrait Template Saved Globally!', 'success');
}

// MASTER RENDERING ENGINE (Portrait 2x3)
function generatePortraitIDHTML(u, config) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${u.student_id_text}`;
    
    // UI Scaling for 2x3 Portrait
    const front = `
        <div class="w-[2in] h-[3in] bg-white shadow-2xl rounded-xl overflow-hidden border border-gray-200 flex flex-col font-sans shrink-0">
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
                    <img src="https://ui-avatars.com/api/?name=${u.full_name}&background=f3f4f6&color=4b5563" class="w-full h-full object-cover rounded-lg">
                </div>
                <h2 class="text-[9px] font-black text-gray-900 uppercase leading-tight mt-2">${u.full_name}</h2>
                <div class="w-full text-left mt-4 space-y-2 border-t pt-3 border-gray-50">
                    <div>
                        <p class="text-[5px] text-gray-400 font-bold uppercase leading-none">Address</p>
                        <p class="text-[6px] font-medium text-gray-700 leading-tight">${u.address}</p>
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
        <div class="w-[2in] h-[3in] bg-white shadow-2xl rounded-xl overflow-hidden border border-gray-200 flex flex-col font-sans shrink-0">
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