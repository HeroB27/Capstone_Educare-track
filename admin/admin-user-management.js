// admin/admin-user-management.js

let currentStep = 1;
let currentView = 'staff';
let enrollType = 'parent';
let parentInfo = {};
let studentData = [];
let allUsers = [];

document.addEventListener('DOMContentLoaded', () => {
    loadUsers();
    injectCloseButtons();
    injectStyles();
    injectPasswordGenerators();
    if (window.lucide) lucide.createIcons();
});

// --- ID ENGINE ---
function generateID(role, seedValue) {
    const year = new Date().getFullYear();
    const last4 = seedValue.toString().slice(-4);
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    if (role === 'students') return `EDU-${year}-${last4}-${suffix}`;
    const prefixes = { admins: 'ADM', teachers: 'TCH', guards: 'GRD', clinic_staff: 'CLC', parents: 'PAR' };
    return `${prefixes[role] || 'USR'}-${year}-${last4}-${suffix}`;
}

// --- DATA FETCHING & TABLE RENDER ---
async function loadUsers() {
    const tableBody = document.getElementById('user-table-body');
    tableBody.innerHTML = '<tr><td colspan="3" class="py-12 text-center animate-pulse text-gray-400 italic font-medium">Syncing system records...</td></tr>';
    try {
        const [t, g, c, a, p] = await Promise.all([
            supabase.from('teachers').select('*'), supabase.from('guards').select('*'),
            supabase.from('clinic_staff').select('*'), supabase.from('admins').select('*'),
            supabase.from('parents').select('*')
        ]);
        allUsers = [
            ...(t.data||[]).map(u=>({...u, table:'teachers', role:'Teacher'})),
            ...(g.data||[]).map(u=>({...u, table:'guards', role:'Guard'})),
            ...(c.data||[]).map(u=>({...u, table:'clinic_staff', role:'Clinic Staff'})),
            ...(a.data||[]).map(u=>({...u, table:'admins', role:'Admin'})),
            ...(p.data||[]).map(u=>({...u, table:'parents', role:'Parent'}))
        ];
        renderUserTable();
    } catch (e) { tableBody.innerHTML = '<tr><td colspan="3" class="py-10 text-center text-red-500">Critical Sync Error.</td></tr>'; }
}

function renderUserTable() {
    const tableBody = document.getElementById('user-table-body');
    const q = document.getElementById('userSearch').value.toLowerCase();
    const filtered = allUsers.filter(u => {
        const tabMatch = (currentView === 'staff') ? u.role !== 'Parent' : u.role === 'Parent';
        const searchMatch = u.full_name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q);
        return tabMatch && searchMatch;
    });
    
    if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" class="py-12 text-center text-gray-400 italic">No users found matching your criteria.</td></tr>';
        return;
    }

    tableBody.innerHTML = filtered.map(u => `
        <tr class="hover:bg-violet-50/40 transition-all border-b border-gray-50 last:border-0 group">
            <td class="px-8 py-5">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl bg-white border border-gray-100 text-violet-600 flex items-center justify-center font-black text-xs uppercase shadow-sm group-hover:scale-110 transition-transform">${u.full_name?.charAt(0)}</div>
                    <div><p class="font-bold text-gray-800 text-sm leading-tight mb-0.5">${u.full_name}</p><p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest font-mono">${u.username}</p></div>
                </div>
            </td>
            <td class="px-8 py-5">
                <div class="flex items-center gap-3">
                    <span class="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-violet-50 text-violet-600 border border-violet-100">${u.role}</span>
                    <button onclick="toggleStatus('${u.table}', ${u.id}, ${u.is_active !== false})" class="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${u.is_active !== false ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'} hover:opacity-80 transition-all">
                        ${u.is_active !== false ? 'Active' : 'Inactive'}
                    </button>
                </div>
            </td>
            <td class="px-8 py-5 text-right">
                <div class="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-all">
                    <button onclick="openEditModal('${u.table}', ${u.id})" class="p-2 bg-white border border-gray-200 text-gray-500 rounded-lg hover:border-violet-500 hover:text-violet-600 hover:shadow-md transition-all" title="Edit Details"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                    <button onclick="deleteUser('${u.table}', ${u.id})" class="p-2 bg-white border border-gray-200 text-gray-500 rounded-lg hover:border-red-500 hover:text-red-500 hover:shadow-md transition-all" title="Delete Account"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            </td>
        </tr>`).join('');
    if (window.lucide) lucide.createIcons();
}

// --- BRANCH REGISTRATION FLOW ---
function openEnrollmentModal() { currentStep = 1; setEnrollType('parent'); document.getElementById('enrollmentModal').classList.remove('hidden'); }
function setEnrollType(type) {
    enrollType = type;
    document.getElementById('btn-type-parent').className = type === 'parent' ? 'px-6 py-3 bg-violet-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-all' : 'px-6 py-3 bg-white text-gray-400 border border-gray-100 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all';
    document.getElementById('btn-type-staff').className = type === 'staff' ? 'px-6 py-3 bg-violet-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-all' : 'px-6 py-3 bg-white text-gray-400 border border-gray-100 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all';
    
    const pContainer = document.getElementById('parent-flow-container');
    const sContainer = document.getElementById('staff-flow-container');
    if (type === 'parent') {
        pContainer.classList.remove('hidden'); pContainer.classList.add('animate-fade-in-up');
        sContainer.classList.add('hidden'); sContainer.classList.remove('animate-fade-in-up');
    } else {
        sContainer.classList.remove('hidden'); sContainer.classList.add('animate-fade-in-up');
        pContainer.classList.add('hidden'); pContainer.classList.remove('animate-fade-in-up');
    }
    
    // Toggle Stepper Visibility (Only needed for Parent flow)
    const stepper = document.getElementById('stepper-dots');
    if (stepper) stepper.classList.toggle('invisible', type !== 'parent');

    document.getElementById('next-btn').innerText = type === 'parent' ? "Next Step" : "Complete Registration";
    currentStep = 1; updateModalUI();
}

function nextStep() {
    if (enrollType === 'staff') return submitStaffFinal();
    const val = (id) => document.getElementById(id)?.value?.trim();

    if (currentStep === 1) { // Parent Info
        if (!val('p-name') || !val('p-phone')) return showNotification("Full Name and Phone are required.", "error");
        parentInfo = { full_name: val('p-name'), address: val('p-address'), relationship_type: val('p-role'), contact_number: val('p-phone') };
        showStep(2);
    } else if (currentStep === 2) { // Account Creation
        if (!val('p-user') || !val('p-pass')) return showNotification("Username and Password are required.", "error");
        parentInfo.username = val('p-user');
        parentInfo.password = val('p-pass');
        renderParentSummary();
        if (document.getElementById('student-form-container').children.length === 0) addStudentForm();
        showStep(3);
    } else if (currentStep === 3) { // Student Info
        collectStudents();
        if (studentData.length === 0 || !studentData[0].name) return showNotification("Please add at least one student.", "error");
        renderStudentSummary();
        showStep(4);
    } else if (currentStep === 4) { // Review
        showStep(5);
    } else if (currentStep === 5) { finalizeParentStudent(); }
}

// --- FINAL SUBMISSION LOGIC ---
async function submitStaffFinal() {
    const role = document.getElementById('s-role').value;
    const phone = document.getElementById('s-phone').value;
    const name = document.getElementById('s-name').value;
    if (!name || !phone || !document.getElementById('s-user').value || !document.getElementById('s-pass').value) return showNotification("All fields are required.", "error");

    const idKey = role === 'teachers' ? 'teacher_id_text' : role === 'guards' ? 'guard_id_text' : 'clinic_id_text';
    const payload = { full_name: name, contact_number: phone, username: document.getElementById('s-user').value, password: document.getElementById('s-pass').value, is_active: true };
    payload[idKey] = generateID(role, phone);
    try {
        const { error } = await supabase.from(role).insert([payload]);
        if (error) throw error;
        showNotification("Staff Registration Successful!", "success", () => location.reload());
    } catch (e) { showNotification(e.message, "error"); }
}

async function finalizeParentStudent() {
    const btn = document.getElementById('next-btn');
    btn.disabled = true; btn.innerText = "Syncing...";
    try {
        const { data: parent, error: pErr } = await supabase.from('parents').insert([{ ...parentInfo, parent_id_text: generateID('parents', parentInfo.contact_number), is_active: true }]).select().single();
        if (pErr) throw pErr;
        const studentPayload = studentData.map(s => ({ full_name: s.name, lrn: s.lrn, student_id_text: generateID('students', s.lrn), parent_id: parent.id, address: parentInfo.address, emergency_contact: parentInfo.contact_number, status: 'Enrolled' }));
        const { data: createdStu, error: sErr } = await supabase.from('students').insert(studentPayload).select();
        if (sErr) throw sErr;
        renderBulkPrint(createdStu, parentInfo);
        showNotification("Family Registered Successfully!", "success"); closeEnrollmentModal(); loadUsers();
    } catch (e) { showNotification(e.message, "error"); btn.disabled = false; btn.innerText = "Finalize & Print"; }
}

// --- EDIT SYNC LOGIC ---
async function openEditModal(table, id) {
    const user = allUsers.find(u => u.table === table && u.id === id);
    if (!user) return;
    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('edit-user-table').value = table;
    document.getElementById('edit-username').value = user.username || '';
    document.getElementById('edit-password').value = user.password || '';
    document.getElementById('edit-name').value = user.full_name || '';
    document.getElementById('edit-phone').value = user.contact_number || '';
    document.getElementById('edit-address').value = user.address || '';
    document.getElementById('editUserModal').classList.remove('hidden');

    // Dynamically inject Gatekeeper toggle for teachers
    const gatekeeperContainer = document.getElementById('gatekeeper-toggle-container');
    if (gatekeeperContainer) gatekeeperContainer.remove(); // Clean up previous injections

    if (table === 'teachers') {
        const addressField = document.getElementById('edit-address');
        const container = document.createElement('div');
        container.id = 'gatekeeper-toggle-container';
        container.className = 'mt-4 pt-4 border-t border-gray-100';
        container.innerHTML = `
            <label class="flex items-center justify-between cursor-pointer">
                <span class="font-bold text-gray-700">Assign as Gatekeeper</span>
                <div class="relative">
                    <input type="checkbox" id="edit-gatekeeper" class="sr-only peer">
                    <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                </div>
            </label>`;
        addressField.parentElement.appendChild(container);
        document.getElementById('edit-gatekeeper').checked = user.is_gatekeeper || false;
    }

    if (window.lucide) lucide.createIcons();
}

async function saveUserEdit() {
    const id = document.getElementById('edit-user-id').value;
    const table = document.getElementById('edit-user-table').value;
    const userOrig = allUsers.find(u => u.table === table && u.id == id);
    const updated = { 
        username: document.getElementById('edit-username').value, 
        password: document.getElementById('edit-password').value, 
        full_name: document.getElementById('edit-name').value, 
        contact_number: document.getElementById('edit-phone').value, 
        address: document.getElementById('edit-address').value 
    };

    // UPDATED: Handle the gatekeeper toggle for teachers
    if (table === 'teachers' && document.getElementById('edit-gatekeeper')) {
        updated.is_gatekeeper = document.getElementById('edit-gatekeeper').checked;
    }
    try {
        await supabase.from(table).update(updated).eq('id', id);
        if (table === 'parents' && (userOrig.full_name !== updated.full_name || userOrig.contact_number !== updated.contact_number || userOrig.address !== updated.address)) {
            await supabase.from('students').update({ address: updated.address, emergency_contact: updated.contact_number }).eq('parent_id', id);
        }
        showNotification("Account & Linked Data Updated!", "success"); closeEditModal(); loadUsers();
    } catch (e) { showNotification(e.message, "error"); }
}

// --- PORTRAIT 2x3 PRINT ENGINE ---
function renderBulkPrint(list, p) {
    const area = document.getElementById('id-print-queue');
    area.innerHTML = list.map(s => `
        <div class="id-page-break flex gap-10 justify-center items-center py-20 bg-white">
            <div class="w-[2in] h-[3in] border-2 border-gray-100 rounded-xl relative p-4 flex flex-col items-center bg-white shadow-lg font-sans">
                <p class="text-[8px] font-black text-violet-900 uppercase">Educare Colleges Inc</p>
                <p class="text-[5px] text-gray-500 uppercase tracking-widest">Purok 4 Irisan Baguio City</p>
                <div class="w-24 h-24 bg-gray-50 border-2 border-violet-100 p-1 rounded-2xl mt-4"><img src="https://ui-avatars.com/api/?name=${s.full_name}" class="w-full h-full object-cover"></div>
                <h2 class="text-[10px] font-black mt-4 uppercase text-center leading-tight">${s.full_name}</h2>
                <div class="w-full text-left mt-auto pb-4 border-t pt-2"><p class="text-[5px] text-gray-400 font-bold uppercase">Address</p><p class="text-[6px] font-bold leading-none">${s.address}</p></div>
                <div class="h-1.5 bg-violet-900 w-full absolute bottom-0 left-0"></div>
            </div>
            <div class="w-[2in] h-[3in] border-2 border-gray-100 rounded-xl relative p-6 flex flex-col items-center justify-center bg-white text-center shadow-lg font-sans">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${s.student_id_text}" class="w-20 h-20 mb-2 border p-1 rounded-lg">
                <p class="text-[7px] font-mono font-black uppercase tracking-widest">${s.student_id_text}</p>
                <div class="w-full text-left border-t pt-4"><p class="text-[5px] text-gray-400 font-bold uppercase mb-1">Guardian / Contact</p><p class="text-[7px] font-black text-gray-800">${p.full_name}</p><p class="text-[7px] font-bold text-violet-700">${p.contact_number}</p></div>
                <p class="text-[5px] text-gray-400 mt-6 italic">If lost, return to Purok 4 Irisan Baguio City</p>
                <div class="h-1.5 bg-violet-900 w-full absolute bottom-0 left-0"></div>
            </div>
        </div>`).join('');
    setTimeout(() => { window.print(); }, 1000);
}

// --- UTILITIES ---
function showStep(s) { 
    currentStep = s; 
    document.querySelectorAll('[id^="step-"]').forEach(el => { el.classList.add('hidden'); el.classList.remove('animate-fade-in-up'); }); 
    const step = document.getElementById(`step-${s}`);
    if(step) { step.classList.remove('hidden'); step.classList.add('animate-fade-in-up'); }
    document.getElementById('back-btn').classList.toggle('hidden', s===1); 
    document.getElementById('next-btn').innerText = s===5 ? (enrollType==='parent'?"Finalize & Print":"Complete Registration") : "Next Step"; 
    updateModalUI(); 
}

function addStudentForm() { const id = Date.now(); document.getElementById('student-form-container').insertAdjacentHTML('beforeend', `<div class="stu-form p-6 bg-gray-50 rounded-3xl border border-gray-100" id="b-${id}"><div class="grid grid-cols-2 gap-4"><input type="text" class="stu-name col-span-2 border rounded-xl px-4 py-3 font-bold" placeholder="Child's Full Name"><select class="stu-grade border rounded-xl px-4 py-3 font-bold" onchange="const b=this.closest('.stu-form').querySelector('.s-area'); (this.value==='G11'||this.value==='G12')?b.classList.remove('hidden'):b.classList.add('hidden')"><option value="Kinder">Kinder</option>${Array.from({length:10},(_,i)=>`<option value="G${i+1}">Grade ${i+1}</option>`).join('')}<option value="G11">Grade 11</option><option value="G12">Grade 12</option></select><div class="s-area hidden"><select class="stu-strand w-full border rounded-xl px-4 py-3 font-bold"><option value="ABM">ABM</option><option value="STEM">STEM</option><option value="TVL-ICT">TVL-ICT</option></select></div><input type="text" class="stu-lrn col-span-2 border rounded-xl px-4 py-3 font-bold" placeholder="12-Digit LRN"></div></div>`); }
function renderParentSummary() { document.getElementById('p-summary').innerHTML = `<div><p class="text-[8px] text-violet-400 uppercase tracking-widest">PARENT NAME</p>${parentInfo.full_name}</div><div><p class="text-[8px] text-violet-400 uppercase tracking-widest">PHONE</p>${parentInfo.contact_number}</div><div class="col-span-2"><p class="text-[8px] text-violet-400 uppercase tracking-widest">ADDRESS</p>${parentInfo.address}</div>`; }
function renderStudentSummary() { document.getElementById('s-summary-container').innerHTML = studentData.map((s,i)=>`<div class="p-4 bg-violet-50 rounded-2xl border border-violet-100 font-bold text-xs">Student #${i+1}: ${s.name} (${s.grade})</div>`).join(''); }
function collectStudents() { studentData = Array.from(document.querySelectorAll('.stu-form')).map(f => ({ name: f.querySelector('.stu-name').value, grade: f.querySelector('.stu-grade').value, lrn: f.querySelector('.stu-lrn').value })); }
function prevStep() { if(currentStep>1) showStep(currentStep-1); }
function closeEditModal() { document.getElementById('editUserModal').classList.add('hidden'); }
function closeEnrollmentModal() { document.getElementById('enrollmentModal').classList.add('hidden'); }

function switchView(v) { 
    currentView = v; 
    renderUserTable(); 
    
    // Update Tab UI
    const btnStaff = document.getElementById('tab-staff');
    const btnParent = document.getElementById('tab-parent');
    const activeClass = "px-6 py-2 bg-violet-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-violet-200 transition-all";
    const inactiveClass = "px-6 py-2 bg-white text-gray-400 border border-gray-100 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-gray-50 transition-all";
    
    if (btnStaff) btnStaff.className = v === 'staff' ? activeClass : inactiveClass;
    if (btnParent) btnParent.className = v === 'parent' ? activeClass : inactiveClass;
}

function filterUsers() { renderUserTable(); }

function updateModalUI() { 
    const dots = document.getElementById('stepper-dots')?.children; 
    if(!dots) return;
    for(let i=0; i<dots.length; i++) {
        const dot = dots[i];
        if(!dot.classList.contains('transition-all')) dot.classList.add('transition-all', 'duration-300');
        if (i + 1 === currentStep) { dot.classList.remove('bg-white/30', 'w-2'); dot.classList.add('bg-white', 'w-8'); }
        else if (i + 1 < currentStep) { dot.classList.remove('bg-white/30', 'w-8'); dot.classList.add('bg-white', 'w-2'); }
        else { dot.classList.remove('bg-white', 'w-8'); dot.classList.add('bg-white/30', 'w-2'); }
    } 
}

function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `@keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } .animate-fade-in-up { animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; } .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }`;
    document.head.appendChild(style);
}

function injectCloseButtons() {
    ['enrollmentModal', 'editUserModal'].forEach(id => {
        const modal = document.getElementById(id);
        if (!modal) return;
        const content = modal.firstElementChild;
        if (content && !content.querySelector('.modal-close-btn')) {
            if (!content.classList.contains('relative')) content.classList.add('relative');
            const btn = document.createElement('button');
            btn.className = 'modal-close-btn absolute top-4 right-4 text-gray-300 hover:text-gray-500 transition-colors z-50';
            btn.innerHTML = '<i data-lucide="x" class="w-6 h-6"></i>';
            btn.onclick = () => id === 'enrollmentModal' ? closeEnrollmentModal() : closeEditModal();
            content.appendChild(btn);
        }
    });
    if (window.lucide) lucide.createIcons();
}

function injectPasswordGenerators() {
    ['p-pass', 's-pass'].forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;
        if (input.parentNode.querySelector('.gen-pass-btn')) return;
        
        if (!input.parentNode.classList.contains('relative')) input.parentNode.classList.add('relative');
        
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'gen-pass-btn absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-violet-600 hover:text-violet-800 uppercase tracking-widest bg-violet-50 px-3 py-1.5 rounded-lg transition-all z-10';
        btn.innerText = 'GENERATE';
        btn.onclick = () => {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
            input.value = Array.from({length:12}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
        };
        input.parentNode.appendChild(btn);
    });
}

// --- ENHANCED ACTIONS ---
async function deleteUser(table, id) {
    if(!confirm("Are you sure you want to delete this user? This action cannot be undone.")) return;
    try {
        const { error } = await supabase.from(table).delete().eq('id', id);
        if(error) throw error;
        showNotification("User deleted successfully", "success");
        loadUsers();
    } catch(e) { showNotification(e.message, "error"); }
}

async function toggleStatus(table, id, currentStatus) {
    try {
        const { error } = await supabase.from(table).update({ is_active: !currentStatus }).eq('id', id);
        if(error) throw error;
        showNotification(`User ${!currentStatus ? 'activated' : 'deactivated'}`, "success");
        loadUsers();
    } catch(e) { showNotification(e.message, "error"); }
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