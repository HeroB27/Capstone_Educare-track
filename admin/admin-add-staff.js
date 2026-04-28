// ============================================================================
// admin-add-staff.js
// Staff Enrollment - Multi-Page Architecture (Modal Wizard + CRUD Table)
// ============================================================================

let currentStep = 1;
const totalSteps = 4;
let currentStaffView = 'teachers';
let currentStaffId = null;

// Pagination state for staff table
let staffCurrentPage = 1;
const staffRowsPerPage = 20;
let staffTotalCount = 0;

// Client-side cache for instant pagination
let cachedTeachers = [];
let cachedGuards = [];
let cachedClinic = [];
let staffCacheLoaded = false;

// ID Generator Helper Function
function generateOfficialID(prefix, year, identifierSource) {
    const cleanSource = String(identifierSource).replace(/\D/g, '');
    const last4 = cleanSource.slice(-4).padStart(4, '0');
    const suffix = (Date.now().toString(36).slice(-3) + Math.random().toString(36).substring(2, 5)).toUpperCase();
    return `${prefix}-${year}-${last4}-${suffix}`;
}

const roleConfig = {
    'teachers': { table: 'teachers', prefix: 'TCH', label: 'Teacher', idField: 'teacher_id_text' },
    'guards': { table: 'guards', prefix: 'GRD', label: 'Guard', idField: 'guard_id_text' },
    'clinic_staff': { table: 'clinic_staff', prefix: 'CLC', label: 'Clinic Staff', idField: 'clinic_id_text' }
};

// ==================== CRUD: Load Staff ====================
async function loadStaff() {
    try {
        const [teachers, guards, clinic] = await Promise.all([
            supabase.from('teachers').select('*').order('id', { ascending: false }),
            supabase.from('guards').select('*').order('id', { ascending: false }),
            supabase.from('clinic_staff').select('*').order('id', { ascending: false })
        ]);

        cachedTeachers = teachers.data || [];
        cachedGuards = guards.data || [];
        cachedClinic = clinic.data || [];
        staffCacheLoaded = true;

        renderStaffTable(cachedTeachers, cachedGuards, cachedClinic);
    } catch (err) {
        console.error('Error loading staff:', err);
    }
}

function renderStaffTable(teachers, guards, clinic) {
    const tbody = document.getElementById('staff-table-body');
    const paginationControls = document.getElementById('staff-pagination-controls');
    tbody.innerHTML = '';

    let staffData = [];
    
    if (currentStaffView === 'teachers') {
        staffData = teachers.map(t => ({ 
            ...t, 
            role_type: 'Teacher', 
            department: t.department,
            official_id: t.teacher_id_text,
            phone: t.contact_number
        }));
    } else if (currentStaffView === 'guards') {
        staffData = guards.map(g => ({ 
            ...g, 
            role_type: 'Guard',
            official_id: g.guard_id_text,
            phone: g.contact_number
        }));
    } else if (currentStaffView === 'clinic') {
        staffData = clinic.map(c => ({ 
            ...c, 
            role_type: c.role_title || 'Clinic Staff',
            official_id: c.clinic_id_text,
            phone: c.contact_number
        }));
    }
    
    staffTotalCount = staffData.length;
    const totalPages = Math.ceil(staffData.length / staffRowsPerPage);
    
    if (staffCurrentPage > totalPages && totalPages > 0) {
        staffCurrentPage = 1;
    }
    
    if (paginationControls) {
        if (totalPages <= 1) {
            paginationControls.classList.add('hidden');
        } else {
            paginationControls.classList.remove('hidden');
        }
    }
    
    const pageIndicator = document.getElementById('staff-page-indicator');
    if (pageIndicator) {
        const start = (staffCurrentPage - 1) * staffRowsPerPage + 1;
        const end = Math.min(staffCurrentPage * staffRowsPerPage, staffData.length);
        pageIndicator.textContent = staffData.length > 0 ? `Showing ${start}-${end} of ${staffData.length}` : 'No results';
    }
    
    const currentPageEl = document.getElementById('staff-current-page');
    if (currentPageEl) {
        currentPageEl.textContent = totalPages > 0 ? staffCurrentPage : 0;
    }
    
    const prevBtn = paginationControls?.querySelector('button[onclick="staffPrevPage()"]');
    const nextBtn = paginationControls?.querySelector('button[onclick="staffNextPage()"]');
    if (prevBtn) prevBtn.disabled = staffCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = staffCurrentPage >= totalPages || totalPages === 0;
    
    const startIndex = (staffCurrentPage - 1) * staffRowsPerPage;
    const paginatedStaffData = staffData.slice(startIndex, startIndex + staffRowsPerPage);
    
    paginatedStaffData.forEach(staff => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 transition-colors';
        
        let position = staff.role_type;
        if (staff.department) position += ` - ${staff.department}`;
        
        tr.innerHTML = `
            <td class="px-8 py-5">
                <div class="font-bold text-gray-800">${escapeHtml(staff.full_name)}</div>
                <div class="text-xs text-gray-400">${staff.official_id || 'N/A'}</div>
            </td>
            <td class="px-8 py-5">
                <span class="inline-block px-3 py-1 rounded-lg text-xs font-bold ${
                    currentStaffView === 'teachers' ? 'bg-violet-100 text-violet-700' :
                    currentStaffView === 'guards' ? 'bg-blue-100 text-blue-700' :
                    'bg-red-100 text-red-700'
                }">${position}</span>
            </td>
            <td class="px-8 py-5">
                <div class="text-sm font-medium text-gray-600">${staff.phone || 'N/A'}</div>
                ${staff.email ? `<div class="text-xs text-gray-400">${staff.email}</div>` : ''}
            </td>
            <td class="px-8 py-5 text-right">
                <button onclick="editStaff('${staff.id}', '${currentStaffView}')" class="p-2 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors" title="Edit">
                    <i data-lucide="edit-2" class="w-4 h-4"></i>
                </button>
                <button onclick="deleteStaff('${staff.id}', '${currentStaffView}')" class="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        `;
        
        tbody.appendChild(tr);
    });

    if (staffData.length === 0) {
        const emptyMessage = currentStaffView === 'teachers' ? 'No teachers enrolled yet' :
                           currentStaffView === 'guards' ? 'No guards enrolled yet' :
                           'No clinic staff enrolled yet';
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="px-8 py-12 text-center text-gray-400 font-bold">
                    ${emptyMessage}. Click "New Staff" to start.
                </td>
            </tr>
        `;
    }

    lucide.createIcons();
}

function switchStaffView(event, view) {
    currentStaffView = view;
    
    ['teachers', 'guards', 'clinic'].forEach(v => {
        const tab = document.getElementById(`tab-${v}`);
        if (v === view) {
            tab.classList.remove('text-gray-400');
            tab.classList.add('text-violet-600', 'border-violet-500');
        } else {
            tab.classList.add('text-gray-400');
            tab.classList.remove('text-violet-600', 'border-violet-500');
        }
    });
    
    loadStaff();
}

function filterStaff() {
    const searchTerm = document.getElementById('staffSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#staff-table-body tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

function staffNextPage() {
    const totalPages = Math.ceil(staffTotalCount / staffRowsPerPage);
    if (staffCurrentPage < totalPages) {
        staffCurrentPage++;
        renderStaffTable(cachedTeachers, cachedGuards, cachedClinic);
        const scrollContainer = document.querySelector('#crud-section');
        if (scrollContainer) scrollContainer.scrollIntoView({ behavior: 'smooth' });
    }
}

function staffPrevPage() {
    if (staffCurrentPage > 1) {
        staffCurrentPage--;
        renderStaffTable(cachedTeachers, cachedGuards, cachedClinic);
        const scrollContainer = document.querySelector('#crud-section');
        if (scrollContainer) scrollContainer.scrollIntoView({ behavior: 'smooth' });
    }
}

// ==================== EDIT STAFF MODAL ====================
async function editStaff(id, view) {
    const config = roleConfig[view];
    
    try {
        const { data: staff, error } = await supabase
            .from(config.table)
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        
        let extraFields = '';
        if (view === 'teachers') {
            const isGatekeeper = staff.is_gatekeeper === true;
            extraFields = `
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                        <input type="email" id="edit-s-email" value="${escapeHtml(staff.email || '')}" class="w-full px-3 py-2 bg-gray-50 border-2 border-transparent rounded-xl font-bold text-sm outline-none focus:border-violet-200">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Department</label>
                        <select id="edit-s-dept" class="w-full px-3 py-2 bg-gray-50 border-2 border-transparent rounded-xl font-bold text-sm outline-none focus:border-violet-200">
                            <option value="">Select</option>
                            <option value="English" ${staff.department === 'English' ? 'selected' : ''}>English</option>
                            <option value="Mathematics" ${staff.department === 'Mathematics' ? 'selected' : ''}>Mathematics</option>
                            <option value="Science" ${staff.department === 'Science' ? 'selected' : ''}>Science</option>
                            <option value="Filipino" ${staff.department === 'Filipino' ? 'selected' : ''}>Filipino</option>
                            <option value="Araling Panlipunan" ${staff.department === 'Araling Panlipunan' ? 'selected' : ''}>Araling Panlipunan</option>
                            <option value="MAPEH" ${staff.department === 'MAPEH' ? 'selected' : ''}>MAPEH</option>
                            <option value="TLE" ${staff.department === 'TLE' ? 'selected' : ''}>TLE</option>
                            <option value="Computer" ${staff.department === 'Computer' ? 'selected' : ''}>Computer</option>
                            <option value="Physical Education" ${staff.department === 'Physical Education' ? 'selected' : ''}>PE</option>
                            <option value="Values Education" ${staff.department === 'Values Education' ? 'selected' : ''}>Values</option>
                        </select>
                    </div>
                </div>
                <div class="mt-4 p-4 bg-gradient-to-r from-violet-50 to-indigo-50 rounded-xl border border-violet-100">
                    <label class="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" id="edit-s-gatekeeper" ${isGatekeeper ? 'checked' : ''} class="w-5 h-5 rounded text-violet-600 focus:ring-violet-500">
                        <div class="flex-1">
                            <span class="font-bold text-gray-800">Gatekeeper Access</span>
                            <p class="text-xs text-gray-500">Allow teacher to scan student IDs at the gate</p>
                        </div>
                        <span class="px-2 py-1 rounded-full text-xs font-bold ${isGatekeeper ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">${isGatekeeper ? 'Enabled' : 'Disabled'}</span>
                    </label>
                </div>
            `;
        } else if (view === 'clinic_staff') {
            extraFields = `
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Role Title</label>
                    <input type="text" id="edit-s-role-title" value="${escapeHtml(staff.role_title || '')}" class="w-full px-3 py-2 bg-gray-50 border-2 border-transparent rounded-xl font-bold text-sm outline-none focus:border-violet-200">
                </div>
            `;
        }
        
        const modalHtml = `
            <div id="editStaffModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
                <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                    <div class="bg-gradient-to-r from-violet-900 to-indigo-800 px-5 py-4 flex justify-between items-center text-white">
                        <h3 class="font-black text-sm uppercase">Edit ${config.label}</h3>
                        <button onclick="closeEditStaffModal()" class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"><i data-lucide="x" class="w-4 h-4"></i></button>
                    </div>
                    <div class="p-5 space-y-3">
                        <input type="hidden" id="edit-staff-id" value="${staff.id}">
                        <input type="hidden" id="edit-staff-view" value="${view}">
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name</label>
                            <input type="text" id="edit-s-name" value="${escapeHtml(staff.full_name || '')}" class="w-full px-3 py-2 bg-gray-50 border-2 border-transparent rounded-xl font-bold text-sm outline-none focus:border-violet-200">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Contact Number</label>
                            <input type="text" id="edit-s-phone" value="${escapeHtml(staff.contact_number || '')}" class="w-full px-3 py-2 bg-gray-50 border-2 border-transparent rounded-xl font-bold text-sm outline-none focus:border-violet-200">
                        </div>
                        ${extraFields}
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Username</label>
                            <input type="text" id="edit-s-user" value="${escapeHtml(staff.username || '')}" class="w-full px-3 py-2 bg-gray-50 border-2 border-transparent rounded-xl font-bold text-sm outline-none focus:border-violet-200">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">New Password</label>
                            <input type="password" id="edit-s-pass" placeholder="Leave blank" class="w-full px-3 py-2 bg-gray-50 border-2 border-transparent rounded-xl font-bold text-sm outline-none focus:border-violet-200">
                        </div>
                        <div class="border-t pt-3 mt-2">
                            <p class="text-xs text-gray-500">Staff ID: <span class="font-mono">${escapeHtml(staff[config.idField] || 'Not generated')}</span></p>
                            <button onclick="reissueStaffID('${staff.id}', '${view}')" class="mt-2 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-200">Reissue ID Number</button>
                        </div>
                    </div>
                    <div class="px-5 py-4 bg-gray-50 border-t flex justify-end gap-3">
                        <button onclick="closeEditStaffModal()" class="px-4 py-2 text-gray-400 font-bold uppercase text-xs tracking-widest">Cancel</button>
                        <button onclick="saveStaffEdit()" class="px-6 py-2 bg-violet-600 text-white rounded-xl font-bold uppercase text-xs tracking-widest shadow-lg">Save</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        lucide.createIcons();
    } catch (err) {
        console.error('Error loading staff:', err);
        alert('Error loading staff data');
    }
}

function closeEditStaffModal() {
    const modal = document.getElementById('editStaffModal');
    if (modal) modal.remove();
}

async function saveStaffEdit() {
    try {
        const id = document.getElementById('edit-staff-id').value;
        const view = document.getElementById('edit-staff-view').value;
        const config = roleConfig[view];
        
        const newName = document.getElementById('edit-s-name').value.trim();
        const newPhone = document.getElementById('edit-s-phone').value.trim();
        const newUsername = document.getElementById('edit-s-user').value.trim();
        const newPassword = document.getElementById('edit-s-pass').value.trim();
        
        if (!newName || !newPhone) {
            alert('Name and Contact Number are required');
            return;
        }

        const saveBtn = document.querySelector('#editStaffModal .bg-violet-600');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

        const updateData = { full_name: newName, contact_number: newPhone };
        if (newUsername) updateData.username = newUsername;
        
        if (view === 'teachers') {
            updateData.email = document.getElementById('edit-s-email').value.trim();
            updateData.department = document.getElementById('edit-s-dept').value;
            
            // Handle gatekeeper toggle - UPDATED: 2026-04-20
            const gatekeeperCheckbox = document.getElementById('edit-s-gatekeeper');
            if (gatekeeperCheckbox) {
                updateData.is_gatekeeper = gatekeeperCheckbox.checked;
            }
        } else if (view === 'clinic_staff') {
            updateData.role_title = document.getElementById('edit-s-role-title').value.trim();
        }
        
        if (newPassword) updateData.password = newPassword;
        
        const { error } = await supabase.from(config.table).update(updateData).eq('id', id);
        if (error) throw error;
        
        closeEditStaffModal();
        await loadStaff();
        alert('Staff updated successfully!');

    } catch (error) {
        console.error('Update Error:', error);
        alert('Failed to update: ' + (error.message || 'Unknown error'));
    }
}

async function reissueStaffID(staffId, view) {
    if (!confirm('Reissue staff ID number? This will generate a new official ID number.')) return;
    const config = roleConfig[view];
    try {
        const { data: staff, error: fetchErr } = await supabase
            .from(config.table)
            .select('contact_number')
            .eq('id', staffId)
            .single();
        if (fetchErr) throw fetchErr;
        
        const year = new Date().getFullYear();
        const newID = generateOfficialID(config.prefix, year, staff.contact_number);
        const { error: updateErr } = await supabase
            .from(config.table)
            .update({ [config.idField]: newID })
            .eq('id', staffId);
        if (updateErr) throw updateErr;
        
        alert(`New staff ID: ${newID}`);
        closeEditStaffModal();
        await loadStaff();
    } catch (err) {
        console.error('Error reissuing staff ID:', err);
        alert('Error reissuing staff ID');
    }
}

async function deleteStaff(id, view) {
    const config = roleConfig[view];
    
    window.showConfirm(
        `Delete ${config.label}?`,
        `Are you sure you want to delete this ${config.label}? This action cannot be undone.`,
        async () => {
            try {
                if (view === 'teachers') {
                    const { error: classErr } = await supabase
                        .from('classes')
                        .update({ adviser_id: null })
                        .eq('adviser_id', id);
                    if (classErr) throw new Error("Failed to unassign advisory class: " + classErr.message);
                    
                    const { error: subjErr } = await supabase
                        .from('subject_loads')
                        .delete()
                        .eq('teacher_id', id);
                    if (subjErr) throw new Error("Failed to delete subject loads: " + subjErr.message);
                }
                
                const { error } = await supabase.from(config.table).delete().eq('id', id);
                if (error) throw error;
                
                showNotification(`${config.label} deleted successfully!`, "success");
                await loadStaff();
            } catch (err) {
                console.error('Error deleting:', err);
                showNotification("Error: " + err.message, "error");
            }
        }
    );
}

// ==================== STAFF WIZARD MODAL ====================
let staffCurrentStep = 1;
let selectedStaffRole = '';
const staffTotalSteps = 4;

function openStaffWizardModal() {
    document.getElementById('staffWizardModal').classList.remove('hidden');
    resetStaffForms();
    staffCurrentStep = 1;
    updateStaffWizardUI();
}

function closeStaffWizardModal() {
    document.getElementById('staffWizardModal').classList.add('hidden');
}

function resetStaffForms() {
    document.getElementById('s-name').value = '';
    document.getElementById('s-phone').value = '';
    document.getElementById('s-email').value = '';
    document.getElementById('s-department').value = '';
    document.getElementById('s-role-title').value = '';
    document.getElementById('s-user').value = '';
    document.getElementById('s-pass').value = '';
    document.getElementById('selected-role').value = '';
    selectedStaffRole = '';
    
    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.classList.remove('border-violet-500', 'bg-violet-100');
        btn.classList.add('border-transparent');
    });
    
    document.getElementById('teacher-fields').classList.add('hidden');
    document.getElementById('clinic-fields').classList.add('hidden');
}

function updateStaffWizardUI() {
    for (let i = 1; i <= staffTotalSteps; i++) {
        const step = document.getElementById(`staff-step-${i}`);
        const dot = document.getElementById(`staff-dot-${i}`);
        if (step && dot) {
            if (i === staffCurrentStep) {
                step.classList.add('active');
                dot.classList.remove('bg-gray-300');
                dot.classList.add('bg-violet-600');
            } else {
                step.classList.remove('active');
                dot.classList.remove('bg-violet-600');
                dot.classList.add('bg-gray-300');
            }
        }
    }
    const prevBtn = document.getElementById('staff-prev-btn');
    const nextBtn = document.getElementById('staff-next-btn');
    if (prevBtn) prevBtn.style.visibility = staffCurrentStep === 1 ? 'hidden' : 'visible';
    if (nextBtn) nextBtn.textContent = staffCurrentStep === staffTotalSteps ? 'Complete Enrollment' : 'Next Step';
}

function selectRole(role) {
    selectedStaffRole = role;
    document.getElementById('selected-role').value = role;
    
    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.classList.remove('border-violet-500', 'bg-violet-100');
        btn.classList.add('border-transparent');
    });
    
    const selectedBtn = document.getElementById(`role-${role}`);
    selectedBtn.classList.remove('border-transparent');
    selectedBtn.classList.add('border-violet-500', 'bg-violet-100');
    
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

function validateStaffStep(step) {
    if (step === 1) {
        if (!selectedStaffRole) {
            alert('Please select a staff role');
            return false;
        }
    } else if (step === 2) {
        const name = document.getElementById('s-name').value.trim();
        const phone = document.getElementById('s-phone').value.trim();
        if (!name || !phone) {
            alert('Please fill in Name and Phone Number');
            return false;
        }
        
        if (selectedStaffRole === 'teachers') {
            const email = document.getElementById('s-email').value.trim();
            const dept = document.getElementById('s-department').value;
            if (!email || !dept) {
                alert('Please fill in Email and Department for teachers');
                return false;
            }
        } else if (selectedStaffRole === 'clinic_staff') {
            const roleTitle = document.getElementById('s-role-title').value.trim();
            if (!roleTitle) {
                alert('Please fill in Role Title for clinic staff');
                return false;
            }
        }
    } else if (step === 3) {
        const user = document.getElementById('s-user').value.trim();
        const pass = document.getElementById('s-pass').value.trim();
        if (!user || !pass) {
            alert('Please create Username and Password');
            return false;
        }
    }
    return true;
}

function renderStaffSummary() {
    const summary = document.getElementById('staff-summary');
    const role = selectedStaffRole;
    const config = roleConfig[role];
    
    const name = document.getElementById('s-name').value;
    const phone = document.getElementById('s-phone').value;
    const username = document.getElementById('s-user').value;
    
    let extraFields = '';
    if (role === 'teachers') {
        const email = document.getElementById('s-email').value;
        const dept = document.getElementById('s-department').value;
        extraFields = `
            <div><span class="text-gray-400">Email:</span> ${escapeHtml(email)}</div>
            <div><span class="text-gray-400">Department:</span> ${escapeHtml(dept)}</div>
        `;
    } else if (role === 'clinic_staff') {
        const roleTitle = document.getElementById('s-role-title').value;
        extraFields = `<div class="col-span-2"><span class="text-gray-400">Role Title:</span> ${escapeHtml(roleTitle)}</div>`;
    }
    
    summary.innerHTML = `
        <div><span class="text-gray-400">Name:</span> ${escapeHtml(name)}</div>
        <div><span class="text-gray-400">Role:</span> ${config.label}</div>
        <div><span class="text-gray-400">Phone:</span> ${escapeHtml(phone)}</div>
        <div><span class="text-gray-400">Username:</span> ${escapeHtml(username)}</div>
        ${extraFields}
    `;
}

async function staffNextStep() {
    if (!validateStaffStep(staffCurrentStep)) return;
    if (staffCurrentStep === 3) {
        await saveStaffToDB();
    }
    if (staffCurrentStep === staffTotalSteps) {
        await completeStaffEnrollment();
        return;
    }
    staffCurrentStep++;
    if (staffCurrentStep === 4) {
        renderStaffSummary();
    }
    updateStaffWizardUI();
}

function staffPrevStep() {
    if (staffCurrentStep > 1) {
        staffCurrentStep--;
        updateStaffWizardUI();
    }
}

async function saveStaffToDB() {
    const role = selectedStaffRole;
    const config = roleConfig[role];
    
    const name = document.getElementById('s-name').value.trim();
    const phone = document.getElementById('s-phone').value.trim();
    const username = document.getElementById('s-user').value.trim();
    const password = document.getElementById('s-pass').value.trim();
    
    const year = new Date().getFullYear();
    const staffID = generateOfficialID(config.prefix, year, phone);
    
    let staffData = {
        full_name: name,
        contact_number: phone,
        username,
        password,
        is_active: true
    };
    
    if (role === 'teachers') {
        staffData.email = document.getElementById('s-email').value.trim();
        staffData.department = document.getElementById('s-department').value;
        staffData.teacher_id_text = staffID;
        // Handle gatekeeper access - ADDED: 2026-04-20
        const gatekeeperCheckbox = document.getElementById('s-gatekeeper');
        if (gatekeeperCheckbox && gatekeeperCheckbox.checked) {
            staffData.is_gatekeeper = true;
        }
    } else if (role === 'guards') {
        staffData.guard_id_text = staffID;
    } else if (role === 'clinic_staff') {
        staffData.role_title = document.getElementById('s-role-title').value.trim();
        staffData.clinic_id_text = staffID;
    }
    
    try {
        const { error } = await supabase
            .from(config.table)
            .insert(staffData);
        
        if (error) throw error;
        return true;
    } catch (err) {
        console.error('Error saving staff:', err);
        alert('Error saving staff. Please try again.');
        throw err;
    }
}

async function completeStaffEnrollment() {
    try {
        alert('Staff enrollment completed successfully!');
        closeStaffWizardModal();
        await loadStaff();
        resetStaffForms();
    } catch (err) {
        console.error('Error completing staff enrollment:', err);
    }
}

// ==================== UTILITIES ====================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(msg, type) {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-5 right-5 z-50 px-6 py-3 rounded-xl text-white font-bold text-sm shadow-lg ${type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        window.location.href = '../index.html';
    }
}

// ==================== GLOBAL WINDOW ATTACHMENTS ====================
window.switchStaffView = switchStaffView;
window.filterStaff = filterStaff;
window.staffNextPage = staffNextPage;
window.staffPrevPage = staffPrevPage;
window.editStaff = editStaff;
window.deleteStaff = deleteStaff;
window.closeEditStaffModal = closeEditStaffModal;
window.saveStaffEdit = saveStaffEdit;
window.reissueStaffID = reissueStaffID;
window.openStaffWizardModal = openStaffWizardModal;
window.closeStaffWizardModal = closeStaffWizardModal;
window.selectRole = selectRole;
window.staffNextStep = staffNextStep;
window.staffPrevStep = staffPrevStep;
window.logout = logout;
window.checkSession = window.checkSession;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkSession('admins');
    if (!user) return;
    
    if (window.lucide) lucide.createIcons();
    await loadStaff();
    updateStaffWizardUI();
});