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
    // Setup modal close handlers for static modals
    setupModalClose('enrollmentModal');
    setupModalClose('editUserModal');
    if (window.lucide) lucide.createIcons();
});

// --- ID ENGINE ---
// Generates unique IDs for all user types following the naming convention
// Format: {PREFIX}-{YEAR}-{LEVEL_CODE}-{SUFFIX}

// PHASE 1 FIX: Use crypto.getRandomValues() instead of Math.random() for secure ID generation
function generateSecureSuffix(length = 4) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    const hex = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    return hex.substring(0, length).toUpperCase();
}

// Convert grade level to code (e.g., "Grade 1" -> "G001", "Kinder" -> "K000")
function getGradeLevelCode(gradeLevel) {
    if (!gradeLevel) return 'G000'; // Default/unknown
    
    // Handle Kinder
    if (gradeLevel.toLowerCase().includes('kinder') || gradeLevel === 'K') {
        return 'K000';
    }
    
    // Handle Grade 1-12
    const gradeMatch = gradeLevel.match(/Grade\s*(\d+)/i);
    if (gradeMatch) {
        const gradeNum = parseInt(gradeMatch[1]);
        if (gradeNum >= 1 && gradeNum <= 12) {
            return `G${gradeNum.toString().padStart(3, '0')}`;
        }
    }
    
    // Handle G1-G12 format
    const gMatch = gradeLevel.match(/^G(\d{1,2})$/i);
    if (gMatch) {
        const gradeNum = parseInt(gMatch[1]);
        if (gradeNum >= 1 && gradeNum <= 12) {
            return `G${gradeNum.toString().padStart(3, '0')}`;
        }
    }
    
    return 'G000'; // Default
}

function generateID(role, seedValue, gradeLevel = null) {
    const year = new Date().getFullYear();
    
    // For students: EDU-{year}-{gradeLevelCode}-{4-digit-sequence}
    // Example: EDU-2026-G001-0001
    if (role === 'students') {
        const levelCode = getGradeLevelCode(gradeLevel);
        // Use last 4 digits of seed (LRN) for sequence
        const sequence = seedValue ? seedValue.toString().slice(-4) : '0001';
        const suffix = generateSecureSuffix(4);
        return `EDU-${year}-${levelCode}-${suffix}`;
    }
    
    // For other roles: use last 4 of seed value + secure suffix
    const last4 = seedValue ? seedValue.toString().slice(-4) : '0000';
    const suffix = generateSecureSuffix(4);
    
    // All other roles follow: {PREFIX}-{year}-{last4Phone}-{suffix}
    const prefixes = { 
        teachers: 'TCH', 
        guards: 'GRD', 
        clinic_staff: 'CLC', 
        parents: 'PAR',
        admins: 'ADM'  // Added Admin ID support
    };
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

// UPDATED: Helper function to prevent XSS attacks.
function escapeHtml(text) {
    if (text === null || typeof text === 'undefined') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

    // UPDATED: Use manual DOM creation to prevent XSS vulnerabilities.
    tableBody.innerHTML = ''; // Clear existing rows
    filtered.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-violet-50/40 transition-all border-b border-gray-50 last:border-0 group";
        
        const safeFullName = escapeHtml(u.full_name);
        const safeUsername = escapeHtml(u.username);
        const safeRole = escapeHtml(u.role);

        tr.innerHTML = `
                <td class="px-8 py-5">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl bg-white border border-gray-100 text-violet-600 flex items-center justify-center font-black text-xs uppercase shadow-sm group-hover:scale-110 transition-transform">${safeFullName?.charAt(0)}</div>
                        <div><p class="font-bold text-gray-800 text-sm leading-tight mb-0.5">${safeFullName}</p><p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest font-mono">${safeUsername}</p></div>
                    </div>
                </td>
                <td class="px-8 py-5">
                    <div class="flex items-center gap-3">
                        <span class="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-violet-50 text-violet-600 border border-violet-100">${safeRole}</span>
                        <button onclick="toggleStatus('${u.table}', ${u.id}, ${u.is_active !== false})" class="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${u.is_active !== false ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'} hover:opacity-80 transition-all">
                            ${u.is_active !== false ? 'Active' : 'Inactive'}
                        </button>
                    </div>
                </td>
                <td class="px-8 py-5 text-right">
                    <div class="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-all">
                        <button onclick="openEditModal('${u.table}', ${u.id})" class="p-2 bg-white border border-gray-200 text-gray-500 rounded-lg hover:border-violet-500 hover:text-violet-600 hover:shadow-md transition-all" title="Edit Details"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                        <button onclick="openDirectResetPassword('${u.table}', ${u.id}, '${escapeHtml(u.username)}', '${escapeHtml(u.full_name)}')" class="p-2 bg-white border border-gray-200 text-gray-500 rounded-lg hover:border-blue-500 hover:text-blue-600 hover:shadow-md transition-all" title="Direct Password Reset"><i data-lucide="lock" class="w-4 h-4"></i></button>
                        <button onclick="generateResetToken(${u.id}, '${u.table}')" class="p-2 bg-white border border-gray-200 text-gray-500 rounded-lg hover:border-yellow-500 hover:text-yellow-600 hover:shadow-md transition-all" title="Generate Reset Token"><i data-lucide="key" class="w-4 h-4"></i></button>
                        <button onclick="deleteUser('${u.table}', ${u.id})" class="p-2 bg-white border border-gray-200 text-gray-500 rounded-lg hover:border-red-500 hover:text-red-500 hover:shadow-md transition-all" title="Delete Account"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </div>
                </td>
        `;
        tableBody.appendChild(tr);
    });

    if (window.lucide) lucide.createIcons();
}

// --- BRANCH REGISTRATION FLOW ---
function openEnrollmentModal() { currentStep = 1; setEnrollType(null, 'parent'); document.getElementById('enrollmentModal').classList.remove('hidden'); }
function setEnrollType(event, type) {
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
    currentStep = 1;
    updateModalUI();
    // Ensure first step is shown when modal opens
    showStep(1);
}

function nextStep() {
    if (enrollType === 'staff') {
        // Show confirmation step for staff
        const confirmArea = document.getElementById('staff-confirm-area');
        if (confirmArea.classList.contains('hidden')) {
            // First click - show confirmation
            if (!showStaffConfirmation()) return;
            document.getElementById('next-btn').innerText = "Confirm & Register";
            return;
        } else {
            // Second click - submit
            return submitStaffFinal();
        }
    }
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
function toggleStaffFields() {
    const role = document.getElementById('s-role').value;
    const teacherFields = document.getElementById('teacher-fields');
    const clinicFields = document.getElementById('clinic-fields');
    
    if (role === 'teachers') {
        teacherFields.classList.remove('hidden');
        clinicFields.classList.add('hidden');
    } else if (role === 'clinic_staff') {
        teacherFields.classList.add('hidden');
        clinicFields.classList.remove('hidden');
    } else {
        teacherFields.classList.add('hidden');
        clinicFields.classList.add('hidden');
    }
}

function showStaffConfirmation() {
    const role = document.getElementById('s-role').value;
    const name = document.getElementById('s-name').value;
    const phone = document.getElementById('s-phone').value;
    const username = document.getElementById('s-user').value;
    
    if (!name || !phone || !username) {
        showNotification("Please fill in all required fields.", "error");
        return false;
    }
    
    let roleLabel = role === 'admins' ? 'Admin' : role === 'teachers' ? 'Teacher' : role === 'clinic_staff' ? 'Clinic Staff' : 'Guard';
    let extraInfo = '';
    
    if (role === 'teachers') {
        const email = document.getElementById('s-email').value;
        const dept = document.getElementById('s-department').value;
        extraInfo = `<p class="text-xs mt-2">Email: ${email || 'N/A'}</p><p class="text-xs">Department: ${dept || 'N/A'}</p>`;
    } else if (role === 'clinic_staff') {
        const roleTitle = document.getElementById('s-role-title').value;
        extraInfo = `<p class="text-xs mt-2">Role: ${roleTitle || 'N/A'}</p>`;
    }
    
    // UPDATED: Use textContent to prevent XSS
    const confirmArea = document.getElementById('staff-confirm-area');
    confirmArea.innerHTML = ''; // Clear previous content
    const container = document.createElement('div');
    container.className = 'text-left space-y-2';
    container.innerHTML = `
        <p class="font-black text-sm uppercase">Confirm Staff Registration</p>
        <p><span class="text-violet-600">Name:</span> ${escapeHtml(name)}</p>
        <p><span class="text-violet-600">Role:</span> ${escapeHtml(roleLabel)}</p>
        <p><span class="text-violet-600">Contact:</span> ${escapeHtml(phone)}</p>
        <p><span class="text-violet-600">Username:</span> ${escapeHtml(username)}</p>
    `;
    // Safely append extraInfo which contains HTML
    const extraInfoDiv = document.createElement('div');
    extraInfoDiv.innerHTML = extraInfo; // Assuming extraInfo is internally generated and safe.
    container.appendChild(extraInfoDiv);
    confirmArea.appendChild(container);
    confirmArea.classList.remove('hidden');
    return true;
}

async function submitStaffFinal() {
    const role = document.getElementById('s-role').value;
    const phone = document.getElementById('s-phone').value;
    const name = document.getElementById('s-name').value;
    const username = document.getElementById('s-user').value;
    const password = document.getElementById('s-pass').value;
    
    if (!name || !phone || !username || !password) return showNotification("All fields are required.", "error");

    const idKey = role === 'teachers' ? 'teacher_id_text' : role === 'guards' ? 'guard_id_text' : role === 'clinic_staff' ? 'clinic_id_text' : null;
    const payload = { 
        full_name: name, 
        contact_number: phone, 
        username: username, 
        password: password, 
        is_active: true 
    };
    
    // Add role-specific fields
    if (role === 'teachers') {
        const email = document.getElementById('s-email').value;
        const dept = document.getElementById('s-department').value;
        if (email) payload.email = email;
        if (dept) payload.department = dept;
    } else if (role === 'clinic_staff') {
        const roleTitle = document.getElementById('s-role-title').value;
        if (roleTitle) payload.role_title = roleTitle;
    }
    
    payload[idKey] = generateID(role, phone);
    
    // UPDATED: Check for duplicate username before insertion
    const userValid = await checkDuplicateFields(null, username);
    if (!userValid) return;
    
    try {
        const { error } = await supabase.from(role).insert([payload]);
        if (error) {
            // FIX #3: Handle unique constraint violation (ID already exists)
            if (error.code === '23505') {
                showNotification("Generated ID already exists. Please try again.", "error");
                return;
            }
            throw error;
        }
        showNotification("Staff Registration Successful!", "success");
        closeEnrollmentModal();
        // Clear staff form fields
        document.getElementById('s-name').value = '';
        document.getElementById('s-phone').value = '';
        document.getElementById('s-user').value = '';
        document.getElementById('s-pass').value = '';
        document.getElementById('s-email').value = '';
        document.getElementById('s-department').value = '';
        document.getElementById('s-role-title').value = '';
        const confirmArea = document.getElementById('staff-confirm-area');
        if (confirmArea) confirmArea.classList.add('hidden');
        loadUsers();
    } catch (e) { 
        // FIX #3: Handle unique constraint violation
        if (e.code === '23505' || (e.message && e.message.includes('duplicate'))) {
            showNotification("Generated ID already exists. Please try again.", "error");
        } else {
            showNotification(e.message, "error"); 
        }
    }
}

async function finalizeParentStudent() {
    const btn = document.getElementById('next-btn');
    btn.disabled = true; btn.innerText = "Syncing...";
    
    // UPDATED: Check for duplicate LRN before insertion
    const lrns = studentData.map(s => s.lrn);
    for (let lrn of lrns) {
        const isValid = await checkDuplicateFields(lrn, null);
        if (!isValid) {
            btn.disabled = false; btn.innerText = "Finalize & Print";
            return;
        }
    }
    
    // Check parent username duplicate
    const parentUserValid = await checkDuplicateFields(null, parentInfo.username);
    if (!parentUserValid) {
        btn.disabled = false; btn.innerText = "Finalize & Print";
        return;
    }
    
    try {
        const { data: parent, error: pErr } = await supabase.from('parents').insert([{ ...parentInfo, parent_id_text: generateID('parents', parentInfo.contact_number), is_active: true }]).select().single();
        if (pErr) throw pErr;
        const studentPayload = studentData.map(s => ({ 
            full_name: s.name, 
            lrn: s.lrn, 
            student_id_text: generateID('students', s.lrn, s.grade),
            parent_id: parent.id, 
            address: parentInfo.address, 
            emergency_contact: parentInfo.contact_number, 
            gender: s.gender || null,
            class_id: s.class_id || null,
            status: 'Enrolled' 
        }));
        const { data: createdStu, error: sErr } = await supabase.from('students').insert(studentPayload).select();
        if (sErr) throw sErr;
        await renderBulkPrint(createdStu, parentInfo);
        showNotification("Family Registered Successfully!", "success"); 
        closeEnrollmentModal(); 
        // Clear parent enrollment form fields
        document.getElementById('p-name').value = '';
        document.getElementById('p-phone').value = '';
        document.getElementById('p-address').value = '';
        document.getElementById('p-role').value = '';
        document.getElementById('p-user').value = '';
        document.getElementById('p-pass').value = '';
        document.getElementById('student-form-container').innerHTML = '';
        studentData = [];
        parentInfo = {};
        currentStep = 1;
        loadUsers();
    } catch (e) { 
        // FIX #3: Handle unique constraint violation (ID already exists)
        if (e.code === '23505' || (e.message && e.message.includes('duplicate'))) {
            showNotification("Generated ID already exists. Please try again.", "error");
        } else {
            showNotification(e.message, "error"); 
        }
        btn.disabled = false; btn.innerText = "Finalize & Print"; 
    }
}

// --- EDIT SYNC LOGIC ---
async function openEditModal(table, id) {
    const user = allUsers.find(u => u.table === table && u.id === id);
    if (!user) return;
    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('edit-user-table').value = table;
    document.getElementById('edit-username').value = user.username || '';
    // UPDATED: Do not expose password. Set a placeholder instead.
    const passInput = document.getElementById('edit-password');
    passInput.value = '';
    passInput.placeholder = 'Enter new password to change';
    document.getElementById('edit-name').value = user.full_name || '';
    document.getElementById('edit-phone').value = user.contact_number || '';
    document.getElementById('edit-address').value = user.address || '';
    document.getElementById('editUserModal').classList.remove('hidden');

    // Dynamically inject role-specific fields and Gatekeeper toggle
    const gatekeeperContainer = document.getElementById('gatekeeper-toggle-container');
    if (gatekeeperContainer) gatekeeperContainer.remove(); // Clean up previous injections
    
    const roleSpecificContainer = document.getElementById('role-specific-fields-container');
    if (roleSpecificContainer) roleSpecificContainer.remove(); // Clean up previous injections

    // Get the main form area to inject fields into
    const formArea = document.querySelector('#editUserModal .space-y-8');
    if (!formArea) return;

    if (table === 'teachers') {
        // Inject email and department fields
        const roleFields = document.createElement('div');
        roleFields.id = 'role-specific-fields-container';
        roleFields.className = 'space-y-4';
        roleFields.innerHTML = `
            <div class="flex items-center gap-2 mb-2"><i data-lucide="mail" class="w-4 h-4 text-violet-600"></i><h4 class="font-black text-gray-800 uppercase tracking-widest text-[11px]">Teacher Details</h4></div>
            <div class="relative"><i data-lucide="mail" class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 w-4 h-4"></i><input type="email" id="edit-email" placeholder="Email Address" value="${user.email || ''}" class="w-full pl-11 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-violet-200 focus:ring-4 focus:ring-violet-500/5 transition-all shadow-sm"></div>
            <div class="relative">
                <i data-lucide="book-open" class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 w-4 h-4"></i>
                <select id="edit-department" class="w-full pl-11 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-violet-200 focus:ring-4 focus:ring-violet-500/5 transition-all shadow-sm">
                    <option value="">Select Department</option>
                    <option value="English" ${user.department === 'English' ? 'selected' : ''}>English</option>
                    <option value="Mathematics" ${user.department === 'Mathematics' ? 'selected' : ''}>Mathematics</option>
                    <option value="Science" ${user.department === 'Science' ? 'selected' : ''}>Science</option>
                    <option value="Filipino" ${user.department === 'Filipino' ? 'selected' : ''}>Filipino</option>
                    <option value="Araling Panlipunan" ${user.department === 'Araling Panlipunan' ? 'selected' : ''}>Araling Panlipunan</option>
                    <option value="MAPEH" ${user.department === 'MAPEH' ? 'selected' : ''}>MAPEH</option>
                    <option value="TLE" ${user.department === 'TLE' ? 'selected' : ''}>TLE</option>
                    <option value="Computer" ${user.department === 'Computer' ? 'selected' : ''}>Computer</option>
                    <option value="Physical Education" ${user.department === 'Physical Education' ? 'selected' : ''}>Physical Education</option>
                    <option value="Values Education" ${user.department === 'Values Education' ? 'selected' : ''}>Values Education</option>
                </select>
            </div>
            <label class="flex items-center justify-between cursor-pointer mt-4 pt-4 border-t border-gray-100">
                <span class="font-bold text-gray-700">Assign as Gatekeeper</span>
                <div class="relative">
                    <input type="checkbox" id="edit-gatekeeper" class="sr-only peer" ${user.is_gatekeeper ? 'checked' : ''}>
                    <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                </div>
            </label>`;
        formArea.appendChild(roleFields);
    } else if (table === 'clinic_staff') {
        // Inject role_title field
        const roleFields = document.createElement('div');
        roleFields.id = 'role-specific-fields-container';
        roleFields.className = 'space-y-4';
        roleFields.innerHTML = `
            <div class="flex items-center gap-2 mb-2"><i data-lucide="stethoscope" class="w-4 h-4 text-violet-600"></i><h4 class="font-black text-gray-800 uppercase tracking-widest text-[11px]">Clinic Staff Details</h4></div>
            <div class="relative"><i data-lucide="user-md" class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 w-4 h-4"></i><input type="text" id="edit-role-title" placeholder="Role Title (e.g., Nurse, School Physician)" value="${user.role_title || ''}" class="w-full pl-11 pr-4 py-4 bg-gray-50 border-2 border-transparent rounded-[20px] font-bold text-sm outline-none focus:bg-white focus:border-violet-200 focus:ring-4 focus:ring-violet-500/5 transition-all shadow-sm"></div>`;
        formArea.appendChild(roleFields);
    }

    if (window.lucide) lucide.createIcons();
}

async function saveUserEdit() {
    const id = document.getElementById('edit-user-id').value;
    const table = document.getElementById('edit-user-table').value;
    const userOrig = allUsers.find(u => u.table === table && u.id === id);
    
    const tablesWithAddress = ['parents', 'students'];
    const newPassword = document.getElementById('edit-password').value;

    const updated = { 
        username: document.getElementById('edit-username').value, 
        full_name: document.getElementById('edit-name').value, 
        contact_number: document.getElementById('edit-phone').value
    };

    // UPDATED: Only include password in the update payload if it has been changed.
    if (newPassword) updated.password = newPassword;
    
    // Only add address if the table has this column
    if (tablesWithAddress.includes(table)) {
        updated.address = document.getElementById('edit-address').value;
    }

    // FIX #3: Handle role-specific fields for teachers (email, department, is_gatekeeper)
    if (table === 'teachers') {
        const emailInput = document.getElementById('edit-email');
        const deptInput = document.getElementById('edit-department');
        const gatekeeperInput = document.getElementById('edit-gatekeeper');
        
        if (emailInput) updated.email = emailInput.value;
        if (deptInput) updated.department = deptInput.value;
        if (gatekeeperInput) updated.is_gatekeeper = gatekeeperInput.checked;
    }
    
    // FIX #3: Handle role-specific fields for clinic_staff (role_title)
    if (table === 'clinic_staff') {
        const roleTitleInput = document.getElementById('edit-role-title');
        if (roleTitleInput) updated.role_title = roleTitleInput.value;
    }
    
    try {
        await supabase.from(table).update(updated).eq('id', id);
        if (table === 'parents' && (userOrig.full_name !== updated.full_name || userOrig.contact_number !== updated.contact_number || userOrig.address !== updated.address)) {
            await supabase.from('students').update({ address: updated.address, emergency_contact: updated.contact_number }).eq('parent_id', id);
        }
        showNotification("Account & Linked Data Updated!", "success"); closeEditModal(); 
        // Clear edit form fields
        document.getElementById('edit-password').value = '';
        const roleSpecificContainer = document.getElementById('role-specific-fields-container');
        if (roleSpecificContainer) roleSpecificContainer.remove();
        const gatekeeperContainer = document.getElementById('gatekeeper-toggle-container');
        if (gatekeeperContainer) gatekeeperContainer.remove();
        loadUsers();
    } catch (e) { showNotification(e.message, "error"); }
}

// --- PORTRAIT 2x3 PRINT ENGINE ---
// UPDATED: Integrated template settings from id_templates table
async function renderBulkPrint(list, p) {
    // Fetch template settings from database
    let config = {
        primaryColor: '#4c1d95',
        secondaryColor: '#8b5cf6',
        fields: { qr: true }
    };
    
    try {
        const { data } = await supabase.from('id_templates').select('settings').eq('template_type', 'student').single();
        if (data && data.settings) {
            config = data.settings;
        }
    } catch (e) {
        console.log('Using default template settings');
    }
    
    const area = document.getElementById('id-print-queue');
    // UPDATED: Use escapeHtml to prevent XSS in printed IDs.
    area.innerHTML = list.map(s => {
        const safeName = escapeHtml(s.full_name);
        const safeAddress = escapeHtml(s.address);
        const safeIdText = escapeHtml(s.student_id_text);
        const safeParentName = escapeHtml(p.full_name);
        const safeParentContact = escapeHtml(p.contact_number);
        return `
        <div class="id-page-break flex gap-10 justify-center items-center py-20 bg-white">
            <div class="w-[2in] h-[3in] border-2 border-gray-100 rounded-xl relative p-4 flex flex-col items-center bg-white shadow-lg font-sans">
                <p class="text-[8px] font-black" style="color: ${config.primaryColor}">Educare Colleges Inc</p>
                <p class="text-[5px] text-gray-500 uppercase tracking-widest">Purok 4 Irisan Baguio City</p>
                <div class="w-24 h-24 bg-gray-50 border-2 p-1 rounded-2xl mt-4" style="border-color: ${config.secondaryColor}"><img src="https://ui-avatars.com/api/?name=${encodeURIComponent(safeName)}" class="w-full h-full object-cover"></div>
                <h2 class="text-[10px] font-black mt-4 uppercase text-center leading-tight">${safeName}</h2>
                <div class="w-full text-left mt-auto pb-4 border-t pt-2"><p class="text-[5px] text-gray-400 font-bold uppercase">Address</p><p class="text-[6px] font-bold leading-none">${safeAddress}</p></div>
                <div class="h-1.5 w-full absolute bottom-0 left-0" style="background: ${config.primaryColor}"></div>
            </div>
            <div class="w-[2in] h-[3in] border-2 border-gray-100 rounded-xl relative p-6 flex flex-col items-center justify-center bg-white text-center shadow-lg font-sans">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(safeIdText)}" class="w-20 h-20 mb-2 border p-1 rounded-lg">
                <p class="text-[7px] font-mono font-black uppercase tracking-widest">${safeIdText}</p>
                <div class="w-full text-left border-t pt-4"><p class="text-[5px] text-gray-400 font-bold uppercase mb-1">Guardian / Contact</p><p class="text-[7px] font-black text-gray-800">${safeParentName}</p><p class="text-[7px] font-bold" style="color: ${config.secondaryColor}">${safeParentContact}</p></div>
                <p class="text-[5px] text-gray-400 mt-6 italic">If lost, return to Purok 4 Irisan Baguio City</p>
                <div class="h-1.5 w-full absolute bottom-0 left-0" style="background: ${config.primaryColor}"></div>
            </div>
        </div>`}).join('');
    setTimeout(() => { window.print(); }, 1000);
}

// --- UTILITIES ---
function showStep(s) { 
    currentStep = s; 
    // Only target step container divs, not the stepper dots
    document.querySelectorAll('#parent-flow-container > [id^="step-"]').forEach(el => { el.classList.add('hidden'); el.classList.remove('animate-fade-in-up'); }); 
    const step = document.getElementById(`step-${s}`);
    if(step) { step.classList.remove('hidden'); step.classList.add('animate-fade-in-up'); }
    document.getElementById('back-btn').classList.toggle('hidden', s===1); 
    document.getElementById('next-btn').innerText = s===5 ? (enrollType==='parent'?"Finalize & Print":"Complete Registration") : "Next Step"; 
    updateModalUI();
}

// --- LOAD CLASSES FOR STUDENT ASSIGNMENT ---
async function loadClasses() {
    try {
        const { data, error } = await supabase.from('classes').select('*');
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error('Error loading classes:', e);
        return [];
    }
}

async function addStudentForm() {
    const classes = await loadClasses();
    const id = Date.now();
    const classOptions = classes.map(c => `<option value="${c.id}">${c.grade_level} - ${c.section_name}</option>`).join('');
    document.getElementById('student-form-container').insertAdjacentHTML('beforeend', `<div class="stu-form p-6 bg-gray-50 rounded-3xl border border-gray-100" id="b-${id}"><div class="grid grid-cols-2 gap-4"><input type="text" class="stu-name col-span-2 border rounded-xl px-4 py-3 font-bold" placeholder="Child's Full Name"><select class="stu-gender border rounded-xl px-4 py-3 font-bold"><option value="">Select Gender</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select><select class="stu-grade border rounded-xl px-4 py-3 font-bold" onchange="const b=this.closest('.stu-form').querySelector('.s-area'); (this.value==='G11'||this.value==='G12')?b.classList.remove('hidden'):b.classList.add('hidden')"><option value="Kinder">Kinder</option>${Array.from({length:10},(_,i)=>`<option value="G${i+1}">Grade ${i+1}</option>`).join('')}<option value="G11">Grade 11</option><option value="G12">Grade 12</option></select><div class="s-area hidden"><select class="stu-strand w-full border rounded-xl px-4 py-3 font-bold"><option value="ABM">ABM</option><option value="STEM">STEM</option><option value="TVL-ICT">TVL-ICT</option></select></div><select class="stu-class border rounded-xl px-4 py-3 font-bold"><option value="">Select Class (Optional)</option>${classOptions}</select><input type="text" class="stu-lrn col-span-2 border rounded-xl px-4 py-3 font-bold" placeholder="12-Digit LRN"></div></div>`);
}
function renderParentSummary() { 
    // UPDATED: Use escapeHtml to prevent XSS
    const safeName = escapeHtml(parentInfo.full_name);
    const safeContact = escapeHtml(parentInfo.contact_number);
    const safeAddress = escapeHtml(parentInfo.address);
    document.getElementById('p-summary').innerHTML = `<div><p class="text-[8px] text-violet-400 uppercase tracking-widest">PARENT NAME</p>${safeName}</div><div><p class="text-[8px] text-violet-400 uppercase tracking-widest">PHONE</p>${safeContact}</div><div class="col-span-2"><p class="text-[8px] text-violet-400 uppercase tracking-widest">ADDRESS</p>${safeAddress}</div>`; 
}
function renderStudentSummary() { 
    // UPDATED: Use escapeHtml to prevent XSS
    document.getElementById('s-summary-container').innerHTML = studentData.map((s,i)=> {
        const safeName = escapeHtml(s.name);
        const safeGrade = escapeHtml(s.grade);
        return `<div class="p-4 bg-violet-50 rounded-2xl border border-violet-100 font-bold text-xs">Student #${i+1}: ${safeName} (${safeGrade})</div>`;
    }).join(''); 
}
function collectStudents() {
    studentData = Array.from(document.querySelectorAll('.stu-form')).map(f => ({
        name: f.querySelector('.stu-name').value.trim(),
        grade: f.querySelector('.stu-grade').value,
        lrn: f.querySelector('.stu-lrn').value.trim(),
        gender: f.querySelector('.stu-gender').value,
        class_id: f.querySelector('.stu-class').value || null
    }));

    // Validate LRN length
    for (let s of studentData) {
        if (s.lrn.length !== 12 || isNaN(s.lrn)) {
            showNotification("LRN must be exactly 12 digits.", "error");
            return false;
        }
    }
    return true;
}

// UPDATED: Check for duplicate LRN and username before insertion
async function checkDuplicateFields(lrn = null, username = null) {
    try {
        if (lrn) {
            const { data: existingLRN } = await supabase.from('students').select('id').eq('lrn', lrn).maybeSingle();
            if (existingLRN) {
                showNotification("LRN " + lrn + " is already registered.", "error");
                return false;
            }
        }
        
        if (username) {
            // Check all tables for duplicate username
            const [t, g, c, a, p] = await Promise.all([
                supabase.from('teachers').select('id').eq('username', username).maybeSingle(),
                supabase.from('guards').select('id').eq('username', username).maybeSingle(),
                supabase.from('clinic_staff').select('id').eq('username', username).maybeSingle(),
                supabase.from('admins').select('id').eq('username', username).maybeSingle(),
                supabase.from('parents').select('id').eq('username', username).maybeSingle()
            ]);
            
            if (t.data || g.data || c.data || a.data || p.data) {
                showNotification("Username '" + username + "' is already taken.", "error");
                return false;
            }
        }
        return true;
    } catch (e) {
        console.error('Error checking duplicates:', e);
        return false;
    }
}
function prevStep() { if(currentStep>1) showStep(currentStep-1); }
function closeEditModal() { document.getElementById('editUserModal').classList.add('hidden'); }
function closeEnrollmentModal() { 
    document.getElementById('enrollmentModal').classList.add('hidden');
    // Reset staff confirmation area
    const confirmArea = document.getElementById('staff-confirm-area');
    if (confirmArea) {
        confirmArea.classList.add('hidden');
        confirmArea.innerHTML = '';
    }
    document.getElementById('next-btn').innerText = "Next Step";
}

function switchView(event, v) { 
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

/**
 * Setup modal close handlers - X button + background click
 * @param {string} modalId - The ID of the modal element
 */
function setupModalClose(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // Find close button: look for class 'modal-close', 'close-btn', or 'modal-close-btn'
    const closeBtn = modal.querySelector('.modal-close, .close-btn, .modal-close-btn');
    
    // Add click handler for close button
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            modal.classList.add('hidden');
        });
    }

    // Add background click handler (clicking outside the modal content)
    modal.addEventListener('click', (e) => {
        // Only close if clicking directly on the modal backdrop, not on child elements
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
}

// PHASE 3: Data Export Functions
function exportUsersToCSV() {
    const filtered = getFilteredUsers();
    if (filtered.length === 0) {
        showNotification("No users to export", "error");
        return;
    }
    
    const headers = ["Name", "Username", "Role", "Status", "Contact Number"];
    const rows = filtered.map(u => [
        u.full_name || '',
        u.username || '',
        u.role || '',
        u.is_active !== false ? 'Active' : 'Inactive',
        u.contact_number || ''
    ]);
    
    const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${cell}"`).join(","))
        .join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `educare_users_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    showNotification(`Exported ${filtered.length} users successfully!`, "success");
}

function getFilteredUsers() {
    const q = document.getElementById('userSearch')?.value.toLowerCase() || '';
    return allUsers.filter(u => {
        const tabMatch = (currentView === 'staff') ? u.role !== 'Parent' : u.role === 'Parent';
        const searchMatch = u.full_name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q);
        return tabMatch && searchMatch;
    });
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

// NEW: Direct Password Reset - Admin can directly set a new password for any user
function openDirectResetPassword(table, id, username, fullName) {
    const existing = document.getElementById('direct-reset-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'direct-reset-modal';
    modal.className = 'fixed inset-0 bg-black/50 z-[80] flex items-center justify-center animate-fade-in p-4';

    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-auto transform transition-all animate-fade-in-up">
            <div class="p-6 border-b">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                        <i data-lucide="lock" class="w-6 h-6"></i>
                    </div>
                    <div>
                        <h3 class="text-xl font-black text-gray-800">Reset Password</h3>
                        <p class="text-xs text-gray-500">Directly change user's password</p>
                    </div>
                </div>
            </div>
            <div class="p-6 space-y-4">
                <div class="bg-gray-50 p-4 rounded-xl">
                    <p class="text-xs text-gray-500 uppercase font-bold">User</p>
                    <p class="font-bold text-gray-800">${escapeHtml(fullName)}</p>
                    <p class="text-sm text-gray-600">@${escapeHtml(username)}</p>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase mb-2">New Password</label>
                    <input type="password" id="direct-reset-new-pass" class="w-full px-4 py-3 border border-gray-200 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Enter new password (min 6 chars)">
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Confirm Password</label>
                    <input type="password" id="direct-reset-confirm-pass" class="w-full px-4 py-3 border border-gray-200 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Confirm new password">
                </div>
            </div>
            <div class="p-6 pt-0 flex gap-3">
                <button onclick="document.getElementById('direct-reset-modal').remove()" class="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-gray-200 transition-all">Cancel</button>
                <button onclick="submitDirectPasswordReset('${table}', ${id})" id="btn-direct-reset" class="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">Reset Password</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    if (window.lucide) lucide.createIcons();
}

// NEW: Submit Direct Password Reset
async function submitDirectPasswordReset(table, id) {
    const newPass = document.getElementById('direct-reset-new-pass').value;
    const confirmPass = document.getElementById('direct-reset-confirm-pass').value;
    const btn = document.getElementById('btn-direct-reset');

    // Validation
    if (!newPass || !confirmPass) {
        showNotification("Please enter and confirm the new password.", "error");
        return;
    }
    if (newPass.length < 6) {
        showNotification("Password must be at least 6 characters.", "error");
        return;
    }
    if (newPass !== confirmPass) {
        showNotification("Passwords do not match.", "error");
        return;
    }

    // Show loading
    btn.disabled = true;
    btn.textContent = "Resetting...";

    try {
        // Direct update to the user's table
        const { error } = await supabase
            .from(table)
            .update({ password: newPass })
            .eq('id', id);

        if (error) throw error;

        // Close modal and show success
        document.getElementById('direct-reset-modal').remove();
        showNotification("Password has been reset successfully!", "success");

    } catch (err) {
        console.error("Error resetting password:", err);
        showNotification("Error resetting password: " + err.message, "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Reset Password";
    }
}

async function generateResetToken(id, table) {
    const user = allUsers.find(u => u.id === id && u.table === table);
    if (!user) return showNotification("User not found", "error");
    
    showConfirmationModal(
        "Generate Reset Token?",
        `Generate a password reset token for user '${user.username}'?`,
        async () => {
            try {
                // 1. Generate Token
                const token = Math.random().toString(36).substring(2, 8).toUpperCase();
                const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour expiry

                // 2. Save to DB
                const { error } = await supabase.from('password_resets').insert({
                    username: user.username,
                    user_role: table,
                    token: token,
                    expires_at: expiresAt
                });

                if (error) throw error;

                // 3. Show Token
                showTokenModal(user.username, token);

            } catch (e) {
                showNotification("Error generating token: " + e.message, "error");
            }
        }
    );
}

function showTokenModal(username, token) {
    const existing = document.getElementById('token-modal');
    if(existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'token-modal';
    modal.className = 'fixed inset-0 bg-black/50 z-[70] flex items-center justify-center animate-fade-in';
    
    modal.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 transform transition-all animate-fade-in-up"><div class="text-center"><div class="w-16 h-16 bg-yellow-50 text-yellow-600 rounded-full flex items-center justify-center mb-4 mx-auto"><i data-lucide="key" class="w-8 h-8"></i></div><h3 class="text-xl font-black text-gray-800 mb-2">Reset Token Generated</h3><p class="text-sm text-gray-500 font-medium mb-4">Provide this token to <strong>${escapeHtml(username)}</strong>:</p><div class="bg-gray-100 p-4 rounded-xl mb-6 border-2 border-dashed border-gray-300"><p class="text-3xl font-mono font-black text-gray-800 tracking-widest select-all">${token}</p></div><p class="text-xs text-gray-400 mb-6">Valid for 1 hour.</p><button id="close-token-btn" class="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-gray-800 transition-all">Done</button></div></div>`;

    document.body.appendChild(modal);
    document.getElementById('close-token-btn').onclick = () => modal.remove();
    if(window.lucide) lucide.createIcons();
}

async function deleteUser(table, id) {
    showConfirmationModal(
        "Delete User?",
        "Are you sure you want to delete this user? This action cannot be undone.",
        async () => {
            try {
                // Manual Cascade Logic: Clean up related records first
                if (table === 'parents') {
                    // Delete linked students first
                    const { error: stuErr } = await supabase.from('students').delete().eq('parent_id', id);
                    if (stuErr) throw new Error("Failed to delete linked students: " + stuErr.message);
                } else if (table === 'teachers') {
                    // Unassign from classes (Adviser) - Set to NULL
                    const { error: classErr } = await supabase.from('classes').update({ adviser_id: null }).eq('adviser_id', id);
                    if (classErr) throw new Error("Failed to unassign advisory class: " + classErr.message);
                    
                    // Delete subject loads
                    const { error: subjErr } = await supabase.from('subject_loads').delete().eq('teacher_id', id);
                    if (subjErr) throw new Error("Failed to delete subject loads: " + subjErr.message);
                }

                // Proceed with user deletion
                const { error } = await supabase.from(table).delete().eq('id', id);
                if(error) throw error;
                showNotification("User deleted successfully", "success");
                loadUsers();
            } catch(e) { showNotification(e.message, "error"); }
        }
    );
}

async function toggleStatus(table, id, currentStatus) {
    try {
        const { error } = await supabase.from(table).update({ is_active: !currentStatus }).eq('id', id);
        if(error) throw error;
        showNotification(`User ${!currentStatus ? 'activated' : 'deactivated'}`, "success");
        loadUsers();
    } catch(e) { showNotification(e.message, "error"); }
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
    // UPDATED: Sanitize the message to prevent XSS from error messages that might reflect user input.
    const messageParagraph = modal.querySelector('p');
    messageParagraph.textContent = msg;

    document.body.appendChild(modal);
    document.getElementById('notif-btn').onclick = () => { modal.remove(); if(callback) callback(); };
    if(window.lucide) lucide.createIcons();
}

// ===== GLOBAL WINDOW ATTACHMENTS FOR HTML ONCLICK HANDLERS =====
// Make functions globally accessible for HTML onclick handlers
window.nextStep = nextStep;
window.prevStep = prevStep;
window.openEnrollmentModal = openEnrollmentModal;
window.closeEnrollmentModal = closeEnrollmentModal;
window.setEnrollType = setEnrollType;
window.showStep = showStep;
window.switchView = switchView;
window.closeEditModal = closeEditModal;
window.openEditModal = openEditModal;
window.saveUserEdit = saveUserEdit;
window.deleteUser = deleteUser;
window.toggleStatus = toggleStatus;
window.filterUsers = filterUsers;
window.addStudentForm = addStudentForm;
window.collectStudents = collectStudents;
window.exportUsersToCSV = exportUsersToCSV;
window.openDirectResetPassword = openDirectResetPassword;
window.submitDirectPasswordReset = submitDirectPasswordReset;
window.generateResetToken = generateResetToken;
window.toggleStaffFields = toggleStaffFields;
window.setupModalClose = setupModalClose;
