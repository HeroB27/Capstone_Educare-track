// admin/admin-user-management.js

// 1. Session Check
// currentUser is now global in admin-core.js

// 2. State Variables for Family Workflow
let tempParentData = {}; // Stores parent info temporarily
let studentsList = []; // Array to hold multiple students
let currentStep = 1; // Track current step (1-4)

// 3. State Variables for Staff Workflow
let staffStep = 1;
let tempStaffData = {};

// 4. Initialize Page
document.addEventListener('DOMContentLoaded', () => {
    if (currentUser) {
        const adminNameEl = document.getElementById('admin-name');
        if (adminNameEl) {
            adminNameEl.innerText = currentUser.full_name || 'Admin';
        }
    }
    
    loadUsers();
    setupEventListeners();
});

// 5. Setup Event Listeners
function setupEventListeners() {
    // Tab switching
    const tabStaff = document.getElementById('tab-staff');
    const tabFamilies = document.getElementById('tab-families');
    const btnAddStaff = document.getElementById('btn-add-staff');
    const btnAddFamily = document.getElementById('btn-add-family');
    
    if (tabStaff) {
        tabStaff.addEventListener('click', () => switchTab('staff'));
    }
    if (tabFamilies) {
        tabFamilies.addEventListener('click', () => switchTab('families'));
    }
    
    // Parent Phone Input - Generate Username Preview
    const parentPhone = document.getElementById('parent-phone');
    if (parentPhone) {
        parentPhone.addEventListener('input', updateParentUsernamePreview);
    }
    
    // Staff Phone Input - Generate Username Preview
    const staffPhone = document.getElementById('staff-phone');
    if (staffPhone) {
        staffPhone.addEventListener('input', updateStaffUsernamePreview);
    }
}

// 6. Tab Switching
function switchTab(tab) {
    const tabStaff = document.getElementById('tab-staff');
    const tabFamilies = document.getElementById('tab-families');
    const btnAddStaff = document.getElementById('btn-add-staff');
    const btnAddFamily = document.getElementById('btn-add-family');
    const viewStaff = document.getElementById('view-staff');
    const viewFamilies = document.getElementById('view-families');
    
    if (tab === 'staff') {
        tabStaff.className = 'px-6 py-2 rounded-md text-sm font-bold bg-violet-100 text-violet-700 transition';
        tabFamilies.className = 'px-6 py-2 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700 transition';
        btnAddStaff.classList.remove('hidden');
        btnAddFamily.classList.add('hidden');
        if (viewStaff) viewStaff.classList.remove('hidden');
        if (viewFamilies) viewFamilies.classList.add('hidden');
    } else {
        tabStaff.className = 'px-6 py-2 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700 transition';
        tabFamilies.className = 'px-6 py-2 rounded-md text-sm font-bold bg-green-100 text-green-700 transition';
        btnAddStaff.classList.add('hidden');
        btnAddFamily.classList.remove('hidden');
        if (viewStaff) viewStaff.classList.add('hidden');
        if (viewFamilies) viewFamilies.classList.remove('hidden');
    }
}

// ============ FAMILY WORKFLOW (Parent + Students) ============

// 7. Open Family Modal (Step 1)
function openFamilyModal() {
    currentStep = 1;
    tempParentData = {};
    studentsList = [];
    resetFamilyModal();
    
    const modal = document.getElementById('modal-family-step1');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

// 8. Close Family Modal
function closeFamilyModal() {
    const modal1 = document.getElementById('modal-family-step1');
    const modal2 = document.getElementById('modal-family-step2');
    
    if (modal1) modal1.classList.add('hidden');
    if (modal2) modal2.classList.add('hidden');
    
    resetFamilyModal();
}

// 9. Reset Family Modal
function resetFamilyModal() {
    // Reset Step 1
    const parentName = document.getElementById('parent-name');
    const parentAddress = document.getElementById('parent-address');
    const parentPhone = document.getElementById('parent-phone');
    const parentRoleType = document.getElementById('parent-role-type');
    const parentPassword = document.getElementById('parent-password');
    const generatedParentUsername = document.getElementById('generated-parent-username');
    
    if (parentName) parentName.value = '';
    if (parentAddress) parentAddress.value = '';
    if (parentPhone) parentPhone.value = '';
    if (parentRoleType) parentRoleType.value = 'Parent';
    if (parentPassword) parentPassword.value = '';
    if (generatedParentUsername) generatedParentUsername.value = '-';
    
    // Reset Step 2
    studentsList = [];
    const studentListContainer = document.getElementById('student-list-container');
    if (studentListContainer) {
        studentListContainer.innerHTML = '';
    }
    addStudentForm(); // Add first student form
    
    currentStep = 1;
}

// 10. Update Parent Username Preview
function updateParentUsernamePreview() {
    const phone = document.getElementById('parent-phone').value;
    const generatedParentUsername = document.getElementById('generated-parent-username');
    
    if (phone.startsWith('09') && phone.length >= 4) {
        const year = new Date().getFullYear();
        const last4 = phone.slice(-4);
        const random = Math.floor(1000 + Math.random() * 9000);
        generatedParentUsername.value = 'PAR-' + year + '-' + last4 + '-' + random;
    } else {
        generatedParentUsername.value = '-';
    }
}

// 11. Go from Step 1 to Step 2
function nextToStudent() {
    // Validate Step 1
    const name = document.getElementById('parent-name').value.trim();
    const phone = document.getElementById('parent-phone').value.trim();
    const password = document.getElementById('parent-password').value.trim();
    const address = document.getElementById('parent-address').value.trim();
    const roleType = document.getElementById('parent-role-type').value;
    const username = document.getElementById('generated-parent-username').value;
    
    if (!name || !phone || !password) {
        alert('Please fill in all required fields (Name, Phone, Password).');
        return;
    }
    
    if (!phone.startsWith('09') || phone.length !== 11) {
        alert('Phone must start with 09 and be exactly 11 digits.');
        return;
    }
    
    // Store in tempParentData
    tempParentData = {
        full_name: name,
        address: address,
        contact_number: phone,
        relationship_type: roleType,
        password: password,
        username: username
    };
    
    // Close Step 1 modal
    document.getElementById('modal-family-step1').classList.add('hidden');
    
    // Open Step 2 modal
    document.getElementById('modal-family-step2').classList.remove('hidden');
    
    currentStep = 2;
}

// 12. Back to Step 1
function backToParent() {
    document.getElementById('modal-family-step2').classList.add('hidden');
    document.getElementById('modal-family-step1').classList.remove('hidden');
    currentStep = 1;
}

// 13. Add Student Form in Step 2
function addStudentForm() {
    const container = document.getElementById('student-list-container');
    const childCount = studentsList.length + 1;
    const uniqueId = Date.now();
    
    const studentHTML = `
        <div class="student-form mb-6 p-4 border border-green-200 rounded-lg bg-green-50" id="student-form-${uniqueId}">
            <div class="flex justify-between items-center mb-3">
                <h5 class="font-bold text-green-700">Child ${childCount}</h5>
                ${studentsList.length > 0 ? `
                <button type="button" onclick="removeStudentForm('${uniqueId}')" class="text-red-500 hover:text-red-700 text-sm">
                    Remove
                </button>
                ` : ''}
            </div>
            <div class="grid grid-cols-2 gap-3">
                <input type="text" id="studentName${uniqueId}" placeholder="Full Name" class="w-full border p-2 rounded" required>
                <input type="text" id="studentLRN${uniqueId}" placeholder="LRN (12 digits)" class="w-full border p-2 rounded" maxlength="12" required>
            </div>
            <div class="grid grid-cols-3 gap-3 mt-3">
                <select id="studentGrade${uniqueId}" class="w-full border p-2 rounded">
                    <option value="Kinder">Kinder</option>
                    <option value="G1">Grade 1</option>
                    <option value="G2">Grade 2</option>
                    <option value="G3">Grade 3</option>
                    <option value="G4">Grade 4</option>
                    <option value="G5">Grade 5</option>
                    <option value="G6">Grade 6</option>
                    <option value="G7" selected>Grade 7</option>
                    <option value="G8">Grade 8</option>
                    <option value="G9">Grade 9</option>
                    <option value="G10">Grade 10</option>
                    <option value="G11">Grade 11</option>
                    <option value="G12">Grade 12</option>
                </select>
                <input type="date" id="studentBirthdate${uniqueId}" class="w-full border p-2 rounded">
                <input type="number" id="studentAge${uniqueId}" placeholder="Age" class="w-full border p-2 rounded">
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', studentHTML);
}

// 14. Remove Student Form
function removeStudentForm(uniqueId) {
    const form = document.getElementById('student-form-' + uniqueId);
    if (form) {
        form.remove();
        updateChildCounters();
    }
}

// 15. Update Child Counters
function updateChildCounters() {
    const forms = document.querySelectorAll('.student-form');
    forms.forEach((form, index) => {
        const label = form.querySelector('h5');
        if (label) {
            label.textContent = 'Child ' + (index + 1);
        }
    });
}

// 16. Submit Family (Step 2 to Save)
// FIXED: Now handles orphan parent cleanup if student insertion fails
// FIXED: Ghost Parent Validation - prevents saving parent without students
async function submitFamily() {
    if (studentsList.length === 0) {
        alert("Action Denied: You must add at least one student before saving this family.");
        return; 
    }
    
    // Collect all students
    const forms = document.querySelectorAll('.student-form');
    
    if (forms.length === 0) {
        alert('Please add at least one student.');
        return;
    }
    
    studentsList = [];
    
    for (const form of forms) {
        // Extract uniqueId from form id
        const formId = form.id.replace('student-form-', '');
        const name = document.getElementById('studentName' + formId).value.trim();
        const lrn = document.getElementById('studentLRN' + formId).value.trim();
        const grade = document.getElementById('studentGrade' + formId).value;
        const birthdate = document.getElementById('studentBirthdate' + formId).value;
        const age = document.getElementById('studentAge' + formId).value;
        
        if (!name || !lrn) {
            alert('Please fill in all required student fields (Name, LRN).');
            return;
        }
        
        if (lrn.length !== 12) {
            alert('LRN must be exactly 12 digits.');
            return;
        }
        
        studentsList.push({
            full_name: name,
            lrn: lrn,
            grade_level: grade,
            birthdate: birthdate,
            age: age,
            // Auto-inherit emergency contact from parent
            emergency_contact: tempParentData.contact_number,
            address: tempParentData.address
        });
    }
    
    try {
        // 1. Create Parent
        const { data: parent, error: pError } = await supabase
            .from('parents')
            .insert({
                parent_id_text: tempParentData.username,
                username: tempParentData.username,
                password: tempParentData.password,
                full_name: tempParentData.full_name,
                address: tempParentData.address,
                contact_number: tempParentData.contact_number,
                relationship_type: tempParentData.relationship_type
            })
            .select()
            .single();

        if (pError) throw new Error("Parent creation failed: " + pError.message);

        // 2. Map Parent ID to Students
        const studentsToInsert = studentsList.map(s => {
            const year = new Date().getFullYear();
            const last4LRN = s.lrn.slice(-4);
            const random = Math.floor(1000 + Math.random() * 9000);
            const studentID = 'EDU-' + year + '-' + last4LRN + '-' + random;
            
            return {
                student_id_text: studentID,
                lrn: s.lrn,
                full_name: s.full_name,
                parent_id: parent.id, // Link child to the new parent
                grade_level: s.grade_level,
                birthdate: s.birthdate,
                age: s.age,
                address: s.address,
                emergency_contact: s.emergency_contact,
                qr_code_data: studentID,
                status: 'Enrolled'
            };
        });

        // 3. Create Students (batch insert)
        const { error: sError } = await supabase
            .from('students')
            .insert(studentsToInsert);

        if (sError) {
            // Delete the parent to keep DB clean - prevents orphan parent
            await supabase.from('parents').delete().eq('id', parent.id);
            throw new Error("Students could not be linked. Check LRNs for duplicates.");
        }

        alert('Family registered successfully!');
        resetForm();
        closeFamilyModal();
        loadUsers();
        
    } catch (err) {
        console.error('Error saving family:', err);
        alert(err.message);
    }
}

// ============ STAFF WORKFLOW (Teachers, Guards, Clinic) ============

// 17. Open Staff Modal
function openStaffModal() {
    staffStep = 1;
    tempStaffData = {};
    
    // Reset form
    const staffName = document.getElementById('staff-name');
    const staffPhone = document.getElementById('staff-phone');
    const staffEmail = document.getElementById('staff-email');
    const staffPassword = document.getElementById('staff-password');
    const staffRole = document.getElementById('staff-role');
    const generatedStaffUsername = document.getElementById('generated-staff-username');
    const gateField = document.getElementById('gate-field');
    const deptField = document.getElementById('dept-field');
    const clinicField = document.getElementById('clinic-field');
    const gatekeeperField = document.getElementById('gatekeeper-field');
    const staffGatekeeper = document.getElementById('staff-gatekeeper');
    
    if (staffName) staffName.value = '';
    if (staffPhone) staffPhone.value = '';
    if (staffEmail) staffEmail.value = '';
    if (staffPassword) staffPassword.value = '';
    if (staffRole) staffRole.value = '';
    if (generatedStaffUsername) generatedStaffUsername.value = '-';
    if (gateField) gateField.classList.add('hidden');
    if (deptField) deptField.classList.add('hidden');
    if (clinicField) clinicField.classList.add('hidden');
    if (gatekeeperField) gatekeeperField.classList.add('hidden');
    if (staffGatekeeper) staffGatekeeper.checked = false;
    
    const modal = document.getElementById('modal-staff');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

// 18. Close Staff Modal
function closeStaffModal() {
    const modal = document.getElementById('modal-staff');
    if (modal) {
        modal.classList.add('hidden');
    }
    
    staffStep = 1;
    tempStaffData = {};
}

// 19. Update Staff Username Preview
function updateStaffUsernamePreview() {
    const role = document.getElementById('staff-role').value;
    const phone = document.getElementById('staff-phone').value;
    const generatedStaffUsername = document.getElementById('generated-staff-username');
    
    const prefixes = {
        teachers: 'TCH',
        guards: 'GRD',
        clinic_staff: 'CLC'
    };
    
    if (phone.startsWith('09') && phone.length >= 4) {
        const year = new Date().getFullYear();
        const last4 = phone.slice(-4);
        const random = Math.floor(1000 + Math.random() * 9000);
        generatedStaffUsername.value = prefixes[role] + '-' + year + '-' + last4 + '-' + random;
    } else {
        generatedStaffUsername.value = '-';
    }
}

// 20. Show/Hide role-specific fields
function updateStaffRoleFields() {
    const role = document.getElementById('staff-role').value;
    const gateField = document.getElementById('gate-field');
    const deptField = document.getElementById('dept-field');
    const clinicField = document.getElementById('clinic-field');
    const gatekeeperField = document.getElementById('gatekeeper-field');
    
    // Hide all first
    if (gateField) gateField.classList.add('hidden');
    if (deptField) deptField.classList.add('hidden');
    if (clinicField) clinicField.classList.add('hidden');
    if (gatekeeperField) gatekeeperField.classList.add('hidden');
    
    // Show relevant field
    if (role === 'teachers' && deptField) {
        deptField.classList.remove('hidden');
        // Show gatekeeper field for teachers
        if (gatekeeperField) gatekeeperField.classList.remove('hidden');
    } else if (role === 'guards' && gateField) {
        gateField.classList.remove('hidden');
    } else if (role === 'clinic_staff' && clinicField) {
        clinicField.classList.remove('hidden');
    }
    
    updateStaffUsernamePreview();
}

// 21. Submit Staff
async function submitStaff() {
    const role = document.getElementById('staff-role').value;
    const name = document.getElementById('staff-name').value.trim();
    const phone = document.getElementById('staff-phone').value.trim();
    const email = document.getElementById('staff-email').value.trim();
    const password = document.getElementById('staff-password').value.trim();
    const username = document.getElementById('generated-staff-username').value;
    
    // Validation
    if (!name || !phone || !password) {
        alert('Please fill in all required fields.');
        return;
    }
    
    if (!phone.startsWith('09') || phone.length !== 11) {
        alert('Phone must start with 09 and be 11 digits.');
        return;
    }
    
    // Role-specific fields
    let dept = null;
    let gate = null;
    let clinicRole = null;
    let isGatekeeper = false;
    
    if (role === 'teachers') {
        dept = document.getElementById('staff-department') ? document.getElementById('staff-department').value : '';
        isGatekeeper = document.getElementById('staff-gatekeeper') ? document.getElementById('staff-gatekeeper').checked : false;
    } else if (role === 'guards') {
        gate = document.getElementById('staff-gate') ? document.getElementById('staff-gate').value : '';
    } else if (role === 'clinic_staff') {
        clinicRole = document.getElementById('staff-clinic-role') ? document.getElementById('staff-clinic-role').value : '';
    }
    
    try {
        let error;
        
        if (role === 'teachers') {
            const { error: insertError } = await supabase
                .from('teachers')
                .insert({
                    teacher_id_text: username,
                    username: username,
                    password: password,
                    full_name: name,
                    department: dept,
                    contact_number: phone,
                    email: email,
                    is_active: true,
                    is_gatekeeper: isGatekeeper
                });
            error = insertError;
        } else if (role === 'guards') {
            const { error: insertError } = await supabase
                .from('guards')
                .insert({
                    guard_id_text: username,
                    username: username,
                    password: password,
                    full_name: name,
                    assigned_gate: gate,
                    shift_schedule: 'Day Shift'
                });
            error = insertError;
        } else if (role === 'clinic_staff') {
            const { error: insertError } = await supabase
                .from('clinic_staff')
                .insert({
                    clinic_id_text: username,
                    username: username,
                    password: password,
                    full_name: name,
                    role_title: clinicRole
                });
            error = insertError;
        }
        
        if (error) throw error;
        
        alert('Staff member added successfully! ID: ' + username);
        closeStaffModal();
        loadUsers();
        
    } catch (error) {
        console.error('Error creating staff:', error);
        alert('Error creating staff: ' + error.message);
    }
}

// ============ USER MANAGEMENT ============

// 22. Load All Users
async function loadUsers() {
    try {
        // Fetch all user types
        const [teachers, parents, guards, clinic] = await Promise.all([
            supabase.from('teachers').select('*'),
            supabase.from('parents').select('*'),
            supabase.from('guards').select('*'),
            supabase.from('clinic_staff').select('*')
        ]);

        // Format staff users
        const staffUsers = [];
        
        if (teachers.data) {
            teachers.data.forEach(t => staffUsers.push({
                id: t.id,
                type: 'teacher',
                idText: t.teacher_id_text,
                name: t.full_name,
                role: 'Teacher',
                phone: t.contact_number,
                email: t.email || '-',
                isActive: t.is_active !== false,
                data: t
            }));
        }
        
        if (guards.data) {
            guards.data.forEach(g => staffUsers.push({
                id: g.id,
                type: 'guard',
                idText: g.guard_id_text,
                name: g.full_name,
                role: 'Guard',
                phone: '-',
                email: '-',
                isActive: true,
                data: g
            }));
        }
        
        if (clinic.data) {
            clinic.data.forEach(c => staffUsers.push({
                id: c.id,
                type: 'clinic',
                idText: c.clinic_id_text,
                name: c.full_name,
                role: 'Clinic Staff',
                phone: '-',
                email: c.role_title || '-',
                isActive: true,
                data: c
            }));
        }

        renderStaffTable(staffUsers);
        
        // Format family users (parents with children) - OPTIMIZED: Single JOIN query
        // This replaces the N+1 loop with a single query fetching parents + their children
        const familyUsers = [];
        
        // Fetch parents with their children in one query
        const { data: parentsWithChildren, error: parentError } = await supabase
            .from('parents')
            .select(`*, students(full_name)`);
        
        if (parentsWithChildren) {
            parentsWithChildren.forEach(p => {
                // Map children names from the joined query
                const children = p.students ? p.students.map(s => s.full_name) : [];
                
                familyUsers.push({
                    id: p.id,
                    name: p.full_name,
                    username: p.parent_id_text,
                    children: children,
                    phone: p.contact_number,
                    address: p.address || '-'
                });
            });
        }
        
        renderFamiliesTable(familyUsers);
        
    } catch (error) {
        console.error('Error loading users:', error);
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.innerText = 'Error loading users. Please try again.';
        }
    }
}

// 23. Render Staff Table
function renderStaffTable(staffUsers) {
    const tbody = document.getElementById('table-staff-body');
    const loadingIndicator = document.getElementById('loadingIndicator');
    
    if (!tbody) return;
    
    if (staffUsers.length === 0) {
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">No staff found</td></tr>';
        return;
    }
    
    if (loadingIndicator) loadingIndicator.classList.add('hidden');
    
    tbody.innerHTML = staffUsers.map(user => `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${user.idText || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.name}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadgeClass(user.type)}">
                    ${user.role}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.phone} ${user.email !== '-' ? '<br><span class="text-gray-400">' + user.email + '</span>' : ''}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button onclick="deleteUser('${user.type}', ${user.id})" class="text-red-600 hover:text-red-900">Delete</button>
            </td>
        </tr>
    `).join('');
}

// 24. Render Families Table
function renderFamiliesTable(familyUsers) {
    const tbody = document.getElementById('table-families-body');
    
    if (!tbody) return;
    
    if (familyUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">No families found</td></tr>';
        return;
    }
    
    tbody.innerHTML = familyUsers.map(family => `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${family.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${family.username}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${family.children.length > 0 ? family.children.join(', ') : '-'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${family.phone}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${family.address}</td>
        </tr>
    `).join('');
}

// 23. Render Users Table
function renderUsersTable(users) {
    const tbody = document.getElementById('table-staff-body');
    const loadingIndicator = document.getElementById('loadingIndicator');
    
    if (!tbody) return;
    
    if (users.length === 0) {
        loadingIndicator.classList.add('hidden');
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">No users found</td></tr>';
        return;
    }
    
    loadingIndicator.classList.add('hidden');
    
    tbody.innerHTML = users.map(user => `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${user.idText || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.name}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadgeClass(user.type)}">
                    ${user.role}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.phone} ${user.email !== '-' ? '<br><span class="text-gray-400">' + user.email + '</span>' : ''}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button onclick="deleteUser('${user.type}', ${user.id})" class="text-red-600 hover:text-red-900">Delete</button>
            </td>
        </tr>
    `).join('');
}

// 24. Get Role Badge Class
function getRoleBadgeClass(type) {
    const classes = {
        teacher: 'bg-purple-100 text-purple-800',
        parent: 'bg-blue-100 text-blue-800',
        guard: 'bg-gray-100 text-gray-800',
        clinic: 'bg-red-100 text-red-800'
    };
    return classes[type] || 'bg-gray-100 text-gray-800';
}

// 25. Delete User (Soft Delete - Deactivates instead of removing)
async function deleteUser(type, id) {
    if (!confirm(`Are you sure you want to deactivate this ${type}? They will lose system access.`)) {
        return;
    }
    
    try {
        let error;
        
        if (type === 'teacher') {
            error = (await supabase.from('teachers').update({ is_active: false }).eq('id', id)).error;
        } else if (type === 'parent') {
            error = (await supabase.from('parents').update({ is_active: false }).eq('id', id)).error;
        } else if (type === 'student') {
            error = (await supabase.from('students').update({ status: 'Archived' }).eq('id', id)).error;
        } else if (type === 'guard') {
            error = (await supabase.from('guards').delete().eq('id', id)).error;
        } else if (type === 'clinic') {
            error = (await supabase.from('clinic_staff').delete().eq('id', id)).error;
        }
        
        if (error) throw error;
        
        alert(`${type} deactivated successfully.`);
        loadUsers();
        
    } catch (error) {
        console.error('Error deactivating user:', error);
        alert('Action failed: ' + error.message);
    }
}

// ============ MODAL UTILITIES ============

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}
