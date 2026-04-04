// ============================================================================
// admin-add-parent-and-child.js
// Parent & Student Enrollment - COMPLETE EDITING WITH MODALS & ID REISSUE
// ============================================================================

let currentStep = 1;
const totalSteps = 6;
let studentForms = [];
let studentsData = [];
let currentChildIndex = 0;
let currentParentId = null;
let currentEditingParentId = null;
let currentEditingStudentId = null;

// Pagination state for parent table
let parentCurrentPage = 1;
const parentRowsPerPage = 20;
let parentTotalCount = 0;

// Client-side cache for instant pagination
let cachedParents = [];
let cachedStudents = [];
let cachedClasses = [];
let parentCacheLoaded = false;

// Webcam streams (if needed later)
let activeStreams = {};
let globalClassOptions = '<option value="">Loading Classes...</option>';

// ==================== HELPER FUNCTIONS ====================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(msg, type = 'info') {
    const existing = document.getElementById('notification-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'notification-toast';
    toast.className = `fixed bottom-5 right-5 z-50 px-6 py-3 rounded-xl text-white font-bold text-sm shadow-lg transition-all ${
        type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-emerald-500' : 'bg-violet-500'
    }`;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ==================== ID GENERATOR ====================
function generateOfficialID(prefix, year, identifierSource) {
    const cleanSource = String(identifierSource).replace(/\D/g, '');
    const last4 = cleanSource.slice(-4).padStart(4, '0');
    const suffix = (Date.now().toString(36).slice(-3) + Math.random().toString(36).substring(2, 5)).toUpperCase();
    return `${prefix}-${year}-${last4}-${suffix}`;
}

// ==================== PRELOAD CLASS OPTIONS ====================
async function preloadClassOptions() {
    try {
        const { data: classes } = await supabase.from('classes').select('*').order('grade_level');
        if (classes) {
            globalClassOptions = '<option value="">Select Class Assignment</option>' + classes.map(c => {
                let label = c.grade_level || '';
                if (c.department && !c.grade_level?.includes(c.department)) label += ` - ${c.department}`;
                if (c.strand) label += ` (${c.strand})`;
                return `<option value="${c.id}">${label}</option>`;
            }).join('');
        }
    } catch (err) {
        console.error('Error preloading class options:', err);
    }
}

// ==================== CRUD: LOAD & RENDER ====================
async function loadParentsAndStudents() {
    try {
        const { data: parents, error: parentsError } = await supabase
            .from('parents')
            .select('*')
            .order('id', { ascending: false });
        if (parentsError) throw parentsError;
        const { data: students, error: studentsError } = await supabase
            .from('students')
            .select('*')
            .order('id', { ascending: false });
        if (studentsError) throw studentsError;
        const { data: classes } = await supabase.from('classes').select('id, grade_level, department, strand');
        cachedParents = parents || [];
        cachedStudents = students || [];
        cachedClasses = classes || [];
        parentCacheLoaded = true;
        renderParentStudentTable(cachedParents, cachedStudents, cachedClasses);
    } catch (err) {
        console.error('Error loading parents and students:', err);
    }
}

function renderParentStudentTable(parents, students, classes) {
    const tbody = document.getElementById('parent-student-table-body');
    const paginationControls = document.getElementById('parent-pagination-controls');
    if (!tbody) return;
    tbody.innerHTML = '';
    parentTotalCount = parents.length;
    const totalPages = Math.ceil(parents.length / parentRowsPerPage);
    if (parentCurrentPage > totalPages && totalPages > 0) parentCurrentPage = 1;
    if (paginationControls) {
        if (totalPages <= 1) paginationControls.classList.add('hidden');
        else paginationControls.classList.remove('hidden');
    }
    const pageIndicator = document.getElementById('parent-page-indicator');
    if (pageIndicator) {
        const start = (parentCurrentPage - 1) * parentRowsPerPage + 1;
        const end = Math.min(parentCurrentPage * parentRowsPerPage, parents.length);
        pageIndicator.textContent = parents.length > 0 ? `Showing ${start}-${end} of ${parents.length}` : 'No results';
    }
    const currentPageEl = document.getElementById('parent-current-page');
    if (currentPageEl) currentPageEl.textContent = totalPages > 0 ? parentCurrentPage : 0;
    const prevBtn = paginationControls?.querySelector('button[onclick="parentPrevPage()"]');
    const nextBtn = paginationControls?.querySelector('button[onclick="parentNextPage()"]');
    if (prevBtn) prevBtn.disabled = parentCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = parentCurrentPage >= totalPages || totalPages === 0;
    const startIndex = (parentCurrentPage - 1) * parentRowsPerPage;
    const paginatedParents = parents.slice(startIndex, startIndex + parentRowsPerPage);
    
    paginatedParents.forEach(parent => {
        const parentStudents = students.filter(s => s.parent_id === parent.id);
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 transition-colors';
        const studentNames = parentStudents.length > 0
            ? parentStudents.map(s => `<span class="inline-block bg-violet-100 text-violet-700 px-2 py-1 rounded-lg text-xs font-bold mr-1 mb-1">${escapeHtml(s.full_name)}</span>`).join('')
            : '<span class="text-gray-400 text-xs">No students linked</span>';
        tr.innerHTML = `
            <td class="px-6 py-5"><div class="font-bold text-gray-800">${escapeHtml(parent.full_name)}</div>${parent.parent_id_text ? `<div class="text-xs text-gray-400">ID: ${escapeHtml(parent.parent_id_text)}</div>` : ''}</td>
            <td class="px-6 py-5"><span class="inline-block bg-emerald-100 text-emerald-700 px-3 py-1 rounded-lg text-xs font-bold">${escapeHtml(parent.relationship_type || 'Parent')}</span></td>
            <td class="px-6 py-5"><div class="text-sm text-gray-600">${escapeHtml(parent.address || '-')}</div></td>
            <td class="px-6 py-5">${studentNames}</td>
            <td class="px-6 py-5"><div class="text-sm font-medium text-gray-600">${escapeHtml(parent.contact_number || 'N/A')}</div></td>
            <td class="px-6 py-5 text-right">
                <button onclick="openEditParentModal('${parent.id}')" class="p-2 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors" title="Edit Parent & Students"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                <button onclick="deleteParent('${parent.id}')" class="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete Parent"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    if (parents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-8 py-12 text-center text-gray-400 font-bold">No parents enrolled yet. Click "New Enrollment" to start.</td></tr>`;
    }
    if (window.lucide) lucide.createIcons();
}

function filterParentsStudents() {
    const searchTerm = document.getElementById('userSearch')?.value.toLowerCase() || '';
    const rows = document.querySelectorAll('#parent-student-table-body tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

function parentNextPage() {
    const totalPages = Math.ceil(parentTotalCount / parentRowsPerPage);
    if (parentCurrentPage < totalPages) {
        parentCurrentPage++;
        renderParentStudentTable(cachedParents, cachedStudents, cachedClasses);
        const scrollContainer = document.querySelector('#crud-section');
        if (scrollContainer) scrollContainer.scrollIntoView({ behavior: 'smooth' });
    }
}

function parentPrevPage() {
    if (parentCurrentPage > 1) {
        parentCurrentPage--;
        renderParentStudentTable(cachedParents, cachedStudents, cachedClasses);
        const scrollContainer = document.querySelector('#crud-section');
        if (scrollContainer) scrollContainer.scrollIntoView({ behavior: 'smooth' });
    }
}

// ==================== EDIT PARENT MODAL (WITH STUDENT MANAGEMENT) ====================
async function openEditParentModal(parentId) {
    currentEditingParentId = parentId;
    try {
        const { data: parent, error: parentErr } = await supabase
            .from('parents')
            .select('*')
            .eq('id', parentId)
            .single();
        if (parentErr) throw parentErr;
        
        const { data: students, error: studentsErr } = await supabase
            .from('students')
            .select('*')
            .eq('parent_id', parentId);
        if (studentsErr) throw studentsErr;
        
        const modalHtml = `
            <div id="editParentMainModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4 overflow-y-auto">
                <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                    <div class="bg-gradient-to-r from-violet-900 to-indigo-800 px-6 py-4 sticky top-0 z-10 flex justify-between items-center text-white">
                        <h3 class="font-black text-lg uppercase tracking-tight">Edit Parent & Students</h3>
                        <button onclick="closeEditParentModal()" class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"><i data-lucide="x" class="w-4 h-4"></i></button>
                    </div>
                    <div class="p-6">
                        <!-- Parent Info Section -->
                        <div class="mb-8 border-b pb-4">
                            <h4 class="font-black text-violet-600 text-sm uppercase mb-4 flex items-center gap-2"><i data-lucide="user"></i> Parent Information</h4>
                            <div class="grid grid-cols-2 gap-4">
                                <div><label class="block text-xs font-bold text-gray-500 mb-1">Full Name *</label><input type="text" id="edit-parent-name" value="${escapeHtml(parent.full_name)}" class="w-full px-4 py-2 border rounded-xl focus:border-violet-300"></div>
                                <div><label class="block text-xs font-bold text-gray-500 mb-1">Relationship Type</label><select id="edit-parent-role" class="w-full px-4 py-2 border rounded-xl"><option ${parent.relationship_type === 'Parent' ? 'selected' : ''}>Parent</option><option ${parent.relationship_type === 'Guardian' ? 'selected' : ''}>Guardian</option></select></div>
                                <div class="col-span-2"><label class="block text-xs font-bold text-gray-500 mb-1">Address</label><input type="text" id="edit-parent-address" value="${escapeHtml(parent.address || '')}" class="w-full px-4 py-2 border rounded-xl"></div>
                                <div><label class="block text-xs font-bold text-gray-500 mb-1">Phone Number *</label><input type="text" id="edit-parent-phone" value="${escapeHtml(parent.contact_number || '')}" class="w-full px-4 py-2 border rounded-xl"></div>
                                <div><label class="block text-xs font-bold text-gray-500 mb-1">Username</label><input type="text" id="edit-parent-username" value="${escapeHtml(parent.username || '')}" class="w-full px-4 py-2 border rounded-xl"></div>
                                <div><label class="block text-xs font-bold text-gray-500 mb-1">New Password (leave blank to keep)</label><input type="password" id="edit-parent-password" placeholder="Enter new password" class="w-full px-4 py-2 border rounded-xl"></div>
                            </div>
                        </div>
                        
                        <!-- Students Section -->
                        <div class="mb-6">
                            <div class="flex justify-between items-center mb-4">
                                <h4 class="font-black text-violet-600 text-sm uppercase flex items-center gap-2"><i data-lucide="graduation-cap"></i> Linked Students</h4>
                                <button onclick="showAddStudentToParentForm()" class="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-200"><i data-lucide="plus"></i> Add Student</button>
                            </div>
                            <div id="edit-students-list" class="space-y-3">
                                ${students.map(s => renderStudentEditCard(s)).join('')}
                            </div>
                            ${students.length === 0 ? '<p class="text-center text-gray-400 py-4">No students linked to this parent.</p>' : ''}
                        </div>
                    </div>
                    <div class="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3 sticky bottom-0">
                        <button onclick="closeEditParentModal()" class="px-4 py-2 text-gray-500 font-bold">Cancel</button>
                        <button onclick="saveParentChanges()" class="px-6 py-2 bg-violet-600 text-white rounded-xl font-bold shadow-lg">Save Parent Changes</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error('Error loading parent for edit:', err);
        showNotification('Error loading parent data', 'error');
    }
}

function renderStudentEditCard(student) {
    return `
        <div class="student-edit-card bg-gray-50 rounded-xl p-4 border border-gray-200" data-student-id="${student.id}">
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <div class="font-bold text-gray-800">${escapeHtml(student.full_name)}</div>
                    <div class="text-xs text-gray-500">LRN: ${escapeHtml(student.lrn)} | ID: ${escapeHtml(student.student_id_text || 'N/A')}</div>
                    <div class="text-xs text-gray-500">Class: ${escapeHtml(student.class_id || 'Not assigned')}</div>
                </div>
                <div class="flex gap-2">
                    <button onclick="openEditStudentModal('${student.id}')" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Edit Student"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                    <button onclick="viewStudentIDCard('${student.id}')" class="p-2 text-violet-600 hover:bg-violet-50 rounded-lg" title="View ID Card"><i data-lucide="id-card" class="w-4 h-4"></i></button>
                    <button onclick="reissueStudentID('${student.id}')" class="p-2 text-amber-600 hover:bg-amber-50 rounded-lg" title="Reissue ID Card"><i data-lucide="refresh-cw" class="w-4 h-4"></i></button>
                    <button onclick="dropStudentFromParent('${student.id}', '${currentEditingParentId}')" class="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Drop Student"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            </div>
        </div>
    `;
}

async function saveParentChanges() {
    const parentId = currentEditingParentId;
    // Fetch original data to detect changes
    const { data: originalParent, error: fetchErr } = await supabase
        .from('parents')
        .select('full_name, address, contact_number')
        .eq('id', parentId)
        .single();
    if (fetchErr) throw fetchErr;

    const newName = document.getElementById('edit-parent-name').value.trim();
    const newAddress = document.getElementById('edit-parent-address').value.trim();
    const newRole = document.getElementById('edit-parent-role').value;
    const newPhone = document.getElementById('edit-parent-phone').value.trim();
    const newUsername = document.getElementById('edit-parent-username').value.trim();
    const newPassword = document.getElementById('edit-parent-password').value;
    
    if (!newName || !newPhone) {
        showNotification('Name and Phone are required', 'error');
        return;
    }

    // Check for global triggers
    const globalChanged = (newName !== originalParent.full_name) ||
                          (newAddress !== originalParent.address) ||
                          (newPhone !== originalParent.contact_number);
    
    try {
        // If global changed, ask for reissue
        if (globalChanged) {
            const confirmReissue = confirm("Parent details have changed. Do you want to automatically reissue and update the ID cards for ALL linked children?");
            if (confirmReissue) {
                // Update parent
                const updateData = {
                    full_name: newName,
                    address: newAddress,
                    relationship_type: newRole,
                    contact_number: newPhone,
                    username: newUsername
                };
                if (newPassword) updateData.password = newPassword;
                await supabase.from('parents').update(updateData).eq('id', parentId);

                // Reissue all student IDs and update address/contact
                const { data: students } = await supabase.from('students').select('id, lrn').eq('parent_id', parentId);
                const year = new Date().getFullYear();
                for (const student of students) {
                    const newID = generateOfficialID('EDU', year, student.lrn);
                    await supabase
                        .from('students')
                        .update({
                            student_id_text: newID,
                            qr_code_data: newID,
                            address: newAddress,
                            emergency_contact: newPhone
                        })
                        .eq('id', student.id);
                }
                showNotification(`Parent updated and ${students.length} student ID(s) reissued.`, 'success');
            } else {
                // Just update parent, do not touch student records
                const updateData = {
                    full_name: newName,
                    address: newAddress,
                    relationship_type: newRole,
                    contact_number: newPhone,
                    username: newUsername
                };
                if (newPassword) updateData.password = newPassword;
                await supabase.from('parents').update(updateData).eq('id', parentId);
                showNotification('Parent information updated (IDs unchanged).', 'success');
            }
        } else {
            // No global change: just update parent
            const updateData = {
                full_name: newName,
                address: newAddress,
                relationship_type: newRole,
                contact_number: newPhone,
                username: newUsername
            };
            if (newPassword) updateData.password = newPassword;
            await supabase.from('parents').update(updateData).eq('id', parentId);
            showNotification('Parent information updated successfully!', 'success');
        }
        
        closeEditParentModal();
        await loadParentsAndStudents();
    } catch (err) {
        console.error(err);
        showNotification('Error saving parent changes', 'error');
    }
}

// ==================== EDIT STUDENT MODAL (with Smart ID Reissuance) ====================
async function openEditStudentModal(studentId) {
    currentEditingStudentId = studentId;
    try {
        const { data: student, error } = await supabase
            .from('students')
            .select('*')
            .eq('id', studentId)
            .single();
        if (error) throw error;
        
        const { data: classes } = await supabase.from('classes').select('id, grade_level, department, strand');
        const classOptions = (classes || []).map(c => {
            let label = c.grade_level;
            if (c.department) label += ` - ${c.department}`;
            if (c.strand) label += ` (${c.strand})`;
            return `<option value="${c.id}" ${student.class_id === c.id ? 'selected' : ''}>${label}</option>`;
        }).join('');
        
        const modalHtml = `
            <div id="editStudentModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
                <div class="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                    <div class="bg-gradient-to-r from-violet-900 to-indigo-800 px-5 py-4 sticky top-0 flex justify-between items-center text-white">
                        <h3 class="font-black text-sm uppercase">Edit Student</h3>
                        <button onclick="closeEditStudentModal()" class="w-7 h-7 rounded-full bg-white/10"><i data-lucide="x" class="w-3 h-3"></i></button>
                    </div>
                    <div class="p-5 space-y-4">
                        <input type="hidden" id="edit-student-id" value="${student.id}">
                        <div><label class="block text-xs font-bold text-gray-500 mb-1">Full Name</label><input type="text" id="edit-student-name" value="${escapeHtml(student.full_name)}" class="w-full px-3 py-2 border rounded-xl"></div>
                        <div><label class="block text-xs font-bold text-gray-500 mb-1">LRN (12 digits)</label><input type="text" id="edit-student-lrn" value="${escapeHtml(student.lrn)}" maxlength="12" class="w-full px-3 py-2 border rounded-xl"></div>
                        <div><label class="block text-xs font-bold text-gray-500 mb-1">Gender</label><select id="edit-student-gender" class="w-full px-3 py-2 border rounded-xl"><option ${student.gender === 'Male' ? 'selected' : ''}>Male</option><option ${student.gender === 'Female' ? 'selected' : ''}>Female</option></select></div>
                        <div><label class="block text-xs font-bold text-gray-500 mb-1">Birthdate</label><input type="date" id="edit-student-dob" value="${student.birthdate || ''}" class="w-full px-3 py-2 border rounded-xl"></div>
                        <div><label class="block text-xs font-bold text-gray-500 mb-1">Class</label><select id="edit-student-class" class="w-full px-3 py-2 border rounded-xl">${classOptions}</select></div>
                        <div><label class="block text-xs font-bold text-gray-500 mb-1">Profile Photo</label>
                            <input type="file" id="edit-student-photo" accept="image/*" class="w-full text-sm">
                            ${student.profile_photo_url ? `<div class="mt-2"><img src="${student.profile_photo_url}" class="w-16 h-16 rounded-lg object-cover"></div>` : ''}
                        </div>
                    </div>
                    <div class="px-5 py-4 bg-gray-50 border-t flex justify-end gap-3">
                        <button onclick="closeEditStudentModal()" class="px-4 py-2 text-gray-500 text-sm">Cancel</button>
                        <button onclick="saveStudentChanges()" class="px-5 py-2 bg-violet-600 text-white rounded-xl text-sm font-bold">Save Student</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        if (window.lucide) lucide.createIcons();
        
        const photoInput = document.getElementById('edit-student-photo');
        if (photoInput) {
            photoInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const preview = document.querySelector('#editStudentModal img');
                        if (preview) preview.src = ev.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            };
        }
    } catch (err) {
        console.error('Error loading student:', err);
        showNotification('Error loading student data', 'error');
    }
}

async function saveStudentChanges() {
    const studentId = document.getElementById('edit-student-id').value;
    // Fetch original student data
    const { data: original, error: fetchErr } = await supabase
        .from('students')
        .select('full_name, class_id, profile_photo_url, lrn')
        .eq('id', studentId)
        .single();
    if (fetchErr) throw fetchErr;

    const newName = document.getElementById('edit-student-name').value.trim();
    const newLrn = document.getElementById('edit-student-lrn').value.trim();
    const newGender = document.getElementById('edit-student-gender').value;
    const newDob = document.getElementById('edit-student-dob').value;
    const newClassId = document.getElementById('edit-student-class').value;
    const photoFile = document.getElementById('edit-student-photo').files[0];
    
    if (!newName || !newLrn || newLrn.length !== 12) {
        showNotification('Name and valid 12-digit LRN required', 'error');
        return;
    }
    
    // Detect changes that require ID reissuance
    let needsReissue = false;
    if (newName !== original.full_name) needsReissue = true;
    if (newClassId !== original.class_id) needsReissue = true;
    if (photoFile) needsReissue = true;
    
    try {
        const updateData = {
            full_name: newName,
            lrn: newLrn,
            gender: newGender,
            birthdate: newDob,
            class_id: newClassId
        };
        
        if (photoFile) {
            const ext = photoFile.name.split('.').pop() || 'jpg';
            const fileName = `student_${studentId}_${Date.now()}.${ext}`;
            const { error: uploadErr } = await supabase.storage.from('student-photos').upload(fileName, photoFile);
            if (!uploadErr) {
                const { data: urlData } = supabase.storage.from('student-photos').getPublicUrl(fileName);
                updateData.profile_photo_url = urlData.publicUrl;
            }
        }
        
        if (needsReissue) {
            const year = new Date().getFullYear();
            const newID = generateOfficialID('EDU', year, newLrn);
            updateData.student_id_text = newID;
            updateData.qr_code_data = newID;
            showNotification('Student details changed. New ID card will be generated.', 'info');
        }
        
        const { error } = await supabase.from('students').update(updateData).eq('id', studentId);
        if (error) throw error;
        
        showNotification('Student updated successfully!', 'success');
        closeEditStudentModal();
        await loadParentsAndStudents();
        if (currentEditingParentId) {
            closeEditParentModal();
            openEditParentModal(currentEditingParentId);
        }
    } catch (err) {
        console.error('Error saving student:', err);
        showNotification('Error saving student changes', 'error');
    }
}

function closeEditStudentModal() {
    document.getElementById('editStudentModal')?.remove();
    currentEditingStudentId = null;
}

// ==================== DROP STUDENT ====================
async function dropStudentFromParent(studentId, parentId) {
    if (!confirm('Are you sure you want to permanently remove this student? This action cannot be undone.')) return;
    try {
        const { error } = await supabase.from('students').delete().eq('id', studentId);
        if (error) throw error;
        showNotification('Student has been dropped successfully', 'success');
        await loadParentsAndStudents();
        if (currentEditingParentId) {
            closeEditParentModal();
            openEditParentModal(parentId);
        }
    } catch (err) {
        console.error('Error dropping student:', err);
        showNotification('Error dropping student', 'error');
    }
}

// ==================== REISSUE STUDENT ID ====================
async function reissueStudentID(studentId) {
    if (!confirm('Reissue ID card? This will generate a new official ID number and update the QR code.')) return;
    try {
        const { data: student, error: fetchErr } = await supabase
            .from('students')
            .select('lrn')
            .eq('id', studentId)
            .single();
        if (fetchErr) throw fetchErr;
        
        const year = new Date().getFullYear();
        const newID = generateOfficialID('EDU', year, student.lrn);
        
        const { error: updateErr } = await supabase
            .from('students')
            .update({ student_id_text: newID, qr_code_data: newID })
            .eq('id', studentId);
        if (updateErr) throw updateErr;
        
        showNotification('ID card reissued successfully! New ID: ' + newID, 'success');
        await loadParentsAndStudents();
        viewStudentIDCard(studentId);
    } catch (err) {
        console.error('Error reissuing ID:', err);
        showNotification('Error reissuing ID card', 'error');
    }
}

// ==================== VIEW STUDENT ID CARD ====================
async function viewStudentIDCard(studentId) {
    try {
        const { data: student, error: studentErr } = await supabase
            .from('students')
            .select('*, parents(full_name, contact_number, address)')
            .eq('id', studentId)
            .single();
        if (studentErr) throw studentErr;
        
        const parent = student.parents || {};
        const studentID = student.student_id_text || generateOfficialID('EDU', new Date().getFullYear(), student.lrn);
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${studentID}`;
        let classLabel = 'N/A';
        if (student.class_id) {
            const { data: cls } = await supabase.from('classes').select('grade_level, department').eq('id', student.class_id).single();
            if (cls) classLabel = cls.grade_level + (cls.department ? ` - ${cls.department}` : '');
        }
        
        const modalHtml = `
            <div id="viewIDModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
                <div class="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    <div class="bg-gradient-to-r from-violet-900 to-indigo-800 px-5 py-4 sticky top-0 flex justify-between items-center text-white">
                        <h3 class="font-black text-sm uppercase">Student ID Card</h3>
                        <button onclick="closeViewIDModal()" class="w-7 h-7 rounded-full bg-white/10"><i data-lucide="x" class="w-3 h-3"></i></button>
                    </div>
                    <div class="p-6 flex flex-col items-center">
                        <div class="flex gap-4 justify-center flex-wrap">
                            <div class="w-[2in] h-[3in] bg-white shadow-2xl rounded-xl overflow-hidden border border-gray-200 flex flex-col font-sans">
                                <div style="background: linear-gradient(135deg, #4c1d95, #8b5cf6)" class="h-12 p-2 flex items-center gap-2">
                                    <div class="w-6 h-6 bg-white rounded-full flex items-center justify-center"><i data-lucide="graduation-cap" class="w-4 h-4 text-violet-900"></i></div>
                                    <div class="text-white overflow-hidden"><h4 class="text-[7px] font-black uppercase">EduCare Colleges Inc</h4><p class="text-[5px] opacity-80">Purok 4 Irisan Baguio City</p></div>
                                </div>
                                <div class="flex-1 flex flex-col items-center pt-4 px-3 text-center">
                                    <div class="w-20 h-20 bg-gray-100 border-2 border-violet-100 p-1 rounded-xl mb-2 overflow-hidden">
                                        ${student.profile_photo_url ? `<img src="${student.profile_photo_url}" class="w-full h-full object-cover">` : `<div class="w-full h-full bg-gray-200 flex items-center justify-center text-2xl font-black text-gray-400">${student.full_name?.charAt(0) || '?'}</div>`}
                                    </div>
                                    <h2 class="text-[9px] font-black text-gray-900 uppercase">${escapeHtml(student.full_name)}</h2>
                                    <div class="w-full text-left mt-4 space-y-2 border-t pt-3">
                                        <div><p class="text-[5px] text-gray-400 font-bold uppercase">Address</p><p class="text-[6px] font-medium">${escapeHtml(parent.address || 'N/A')}</p></div>
                                        <div><p class="text-[5px] text-gray-400 font-bold uppercase">Class</p><p class="text-[6px] font-bold text-violet-700">${escapeHtml(classLabel)}</p></div>
                                    </div>
                                </div>
                                <div style="background: #4c1d95" class="h-1.5 w-full mt-auto"></div>
                            </div>
                            <div class="w-[2in] h-[3in] bg-white shadow-2xl rounded-xl overflow-hidden border border-gray-200 flex flex-col font-sans">
                                <div class="p-4 flex flex-col items-center justify-center flex-1 text-center">
                                    <img src="${qrUrl}" class="w-16 h-16 border p-1 rounded-lg mb-2 shadow-sm">
                                    <p class="text-[8px] font-mono font-bold text-gray-900 mb-6">${escapeHtml(studentID)}</p>
                                    <div class="w-full bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-4 text-left">
                                        <p class="text-[5px] text-gray-400 font-bold uppercase">Guardian / Contact</p>
                                        <p class="text-[7px] font-black text-gray-800">${escapeHtml(parent.full_name || 'N/A')}</p>
                                        <p class="text-[7px] font-bold text-violet-700">${escapeHtml(parent.contact_number || 'N/A')}</p>
                                    </div>
                                </div>
                                <div style="background: #4c1d95" class="h-1.5 w-full mt-auto"></div>
                            </div>
                        </div>
                        <div class="flex gap-3 mt-6">
                            <button onclick="printCurrentIDCard()" class="px-4 py-2 bg-violet-100 text-violet-700 rounded-lg text-xs font-bold"><i data-lucide="printer"></i> Print</button>
                            <button onclick="closeViewIDModal()" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-xs font-bold">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        if (window.lucide) lucide.createIcons();
        
        window.printCurrentIDCard = () => {
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`<!DOCTYPE html><html><head><title>Student ID Card</title><style>body{font-family:'Inter',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;}</style></head><body><div class="flex gap-4">${document.querySelector('#viewIDModal .flex.gap-4').cloneNode(true).innerHTML}</div><script>window.onload=()=>setTimeout(()=>{window.print();setTimeout(()=>window.close(),500)},500);<\/script></body></html>`);
            printWindow.document.close();
        };
    } catch (err) {
        console.error('Error loading ID card:', err);
        showNotification('Error loading ID card', 'error');
    }
}

function closeViewIDModal() {
    document.getElementById('viewIDModal')?.remove();
}

// ==================== ADD STUDENT TO EXISTING PARENT ====================
async function showAddStudentToParentForm() {
    if (!currentEditingParentId) return;
    const modalHtml = `
        <div id="addStudentToParentModal" class="fixed inset-0 bg-black/50 z-[250] flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl w-full max-w-md">
                <div class="bg-gradient-to-r from-violet-900 to-indigo-800 px-5 py-4 flex justify-between text-white">
                    <h3 class="font-black text-sm">Add New Student</h3>
                    <button onclick="closeAddStudentModal()" class="w-7 h-7 rounded-full bg-white/10"><i data-lucide="x" class="w-3 h-3"></i></button>
                </div>
                <div class="p-5 space-y-3">
                    <input type="text" id="new-student-name" placeholder="Full Name" class="w-full px-3 py-2 border rounded-xl">
                    <input type="text" id="new-student-lrn" placeholder="12-Digit LRN" maxlength="12" class="w-full px-3 py-2 border rounded-xl">
                    <select id="new-student-gender" class="w-full px-3 py-2 border rounded-xl"><option>Male</option><option>Female</option></select>
                    <input type="date" id="new-student-dob" class="w-full px-3 py-2 border rounded-xl">
                    <select id="new-student-class" class="w-full px-3 py-2 border rounded-xl">${globalClassOptions}</select>
                </div>
                <div class="px-5 py-4 bg-gray-50 border-t flex justify-end gap-3">
                    <button onclick="closeAddStudentModal()" class="px-4 py-2 text-gray-500">Cancel</button>
                    <button onclick="saveNewStudentToParent()" class="px-5 py-2 bg-emerald-600 text-white rounded-xl">Add Student</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    if (window.lucide) lucide.createIcons();
}

async function saveNewStudentToParent() {
    const name = document.getElementById('new-student-name').value.trim();
    const lrn = document.getElementById('new-student-lrn').value.trim();
    const gender = document.getElementById('new-student-gender').value;
    const dob = document.getElementById('new-student-dob').value;
    const classId = document.getElementById('new-student-class').value;
    
    if (!name || !lrn || lrn.length !== 12) {
        showNotification('Name and valid 12-digit LRN required', 'error');
        return;
    }
    
    try {
        const { data: parent } = await supabase.from('parents').select('address, contact_number').eq('id', currentEditingParentId).single();
        const year = new Date().getFullYear();
        const studentID = generateOfficialID('EDU', year, lrn);
        
        const { error } = await supabase.from('students').insert({
            full_name: name,
            lrn: lrn,
            gender: gender,
            birthdate: dob,
            class_id: classId,
            parent_id: currentEditingParentId,
            student_id_text: studentID,
            qr_code_data: studentID,
            address: parent.address,
            emergency_contact: parent.contact_number,
            status: 'Enrolled'
        });
        if (error) throw error;
        
        showNotification('Student added successfully!', 'success');
        closeAddStudentModal();
        await loadParentsAndStudents();
        closeEditParentModal();
        openEditParentModal(currentEditingParentId);
    } catch (err) {
        console.error('Error adding student:', err);
        showNotification('Error adding student', 'error');
    }
}

function closeAddStudentModal() {
    document.getElementById('addStudentToParentModal')?.remove();
}

function closeEditParentModal() {
    document.getElementById('editParentMainModal')?.remove();
    currentEditingParentId = null;
}

// ==================== DELETE PARENT ====================
async function deleteParent(parentId) {
    if (!confirm('WARNING: This will delete the parent AND all linked students. This action cannot be undone. Are you sure?')) return;
    try {
        await supabase.from('students').delete().eq('parent_id', parentId);
        const { error } = await supabase.from('parents').delete().eq('id', parentId);
        if (error) throw error;
        showNotification('Parent and all students deleted', 'success');
        await loadParentsAndStudents();
    } catch (err) {
        console.error('Error deleting parent:', err);
        showNotification('Error deleting parent', 'error');
    }
}

// ==================== WIZARD FUNCTIONS (Modal) ====================
function openWizardModal() {
    document.getElementById('wizardModal').classList.remove('hidden');
    resetWizard();
    currentStep = 1;
    updateWizardUI();
    window.scrollTo(0, 0);
}
function closeWizardModal() {
    document.getElementById('wizardModal').classList.add('hidden');
}

function resetWizard() {
    document.getElementById('p-name').value = '';
    document.getElementById('p-address').value = '';
    document.getElementById('p-role').value = 'Parent';
    document.getElementById('p-phone').value = '';
    document.getElementById('p-user').value = '';
    document.getElementById('p-pass').value = '';
    studentForms = [];
    studentsData = [];
    document.getElementById('student-form-container').innerHTML = '';
    addStudentForm();
    currentStep = 1;
    currentParentId = null;
    currentChildIndex = 0;
    updateWizardUI();
}

function updateWizardUI() {
    for (let i = 1; i <= totalSteps; i++) {
        const step = document.getElementById(`step-${i}`);
        const dot = document.getElementById(`dot-${i}`);
        if (step && dot) {
            if (i === currentStep) {
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
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    if (prevBtn) prevBtn.style.visibility = currentStep === 1 ? 'hidden' : 'visible';
    if (nextBtn) nextBtn.textContent = currentStep === totalSteps ? 'Complete Enrollment' : 'Next Step';
}

async function nextStep() {
    if (currentStep === 4) captureStudentData();
    if (!validateStep(currentStep)) return;
    if (currentStep === 3) await saveParentToDB();
    if (currentStep === 5) await saveStudentsToDB();
    if (currentStep === totalSteps) {
        await completeEnrollment();
        return;
    }
    currentStep++;
    if (currentStep === 3) renderParentSummary();
    else if (currentStep === 5) renderStudentSummaries();
    else if (currentStep === 6) prepareIDPreview();
    updateWizardUI();
}

function prevStep() {
    if (currentStep > 1) {
        currentStep--;
        updateWizardUI();
    }
}

function validateStep(step) {
    if (step === 1) {
        const name = document.getElementById('p-name').value.trim();
        const phone = document.getElementById('p-phone').value.trim();
        if (!name || !phone) {
            showNotification('Please fill in Parent Name and Phone Number', 'error');
            return false;
        }
    } else if (step === 2) {
        const user = document.getElementById('p-user').value.trim();
        const pass = document.getElementById('p-pass').value.trim();
        if (!user || !pass) {
            showNotification('Please create Username and Password', 'error');
            return false;
        }
    } else if (step === 4) {
        if (studentsData.length === 0) {
            showNotification('Please add at least one student', 'error');
            return false;
        }
        for (let i = 0; i < studentsData.length; i++) {
            const student = studentsData[i];
            if (!student.full_name) {
                showNotification(`Student ${i+1}: Please enter full name`, 'error');
                return false;
            }
            if (!student.lrn || student.lrn.length !== 12 || !/^\d+$/.test(student.lrn)) {
                showNotification(`Student ${i+1}: LRN must be 12 digits`, 'error');
                return false;
            }
            if (!student.gender) {
                showNotification(`Student ${i+1}: Please select gender`, 'error');
                return false;
            }
            if (!student.class_id) {
                showNotification(`Student ${i+1}: Please select class`, 'error');
                return false;
            }
        }
    }
    return true;
}

function renderParentSummary() {
    const summary = document.getElementById('p-summary');
    if (!summary) return;
    const name = document.getElementById('p-name').value;
    const address = document.getElementById('p-address').value;
    const role = document.getElementById('p-role').value;
    const phone = document.getElementById('p-phone').value;
    const username = document.getElementById('p-user').value;
    summary.innerHTML = `
        <div><span class="text-gray-400">Name:</span> ${escapeHtml(name)}</div>
        <div><span class="text-gray-400">Relationship:</span> ${escapeHtml(role)}</div>
        <div><span class="text-gray-400">Phone:</span> ${escapeHtml(phone)}</div>
        <div><span class="text-gray-400">Username:</span> ${escapeHtml(username)}</div>
        <div class="col-span-2"><span class="text-gray-400">Address:</span> ${escapeHtml(address || 'N/A')}</div>
    `;
}

function addStudentForm() {
    const container = document.getElementById('student-form-container');
    if (!container) return;
    const formIndex = studentForms.length;
    const formId = `student-form-${Date.now()}-${formIndex}`;
    const formDiv = document.createElement('div');
    formDiv.className = 'student-form p-6 bg-gray-50 rounded-3xl border border-gray-100 relative mb-4';
    formDiv.dataset.index = formIndex;
    formDiv.innerHTML = `
        <button onclick="removeStudentForm(this)" class="absolute top-4 right-4 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
        <h5 class="font-black text-violet-600 text-xs uppercase tracking-widest mb-4">Student ${formIndex + 1}</h5>
        <div class="grid grid-cols-2 gap-4">
            <input type="text" id="${formId}-name" class="s-name col-span-2 border-2 border-transparent rounded-xl px-4 py-3 font-bold bg-white focus:border-violet-300 outline-none transition-all shadow-sm" placeholder="Student Full Name">
            <input type="text" id="${formId}-lrn" class="s-lrn border-2 border-transparent rounded-xl px-4 py-3 font-bold bg-white focus:border-violet-300 outline-none transition-all shadow-sm" placeholder="12-Digit LRN" maxlength="12">
            <select id="${formId}-gender" class="s-gender border-2 border-transparent rounded-xl px-4 py-3 font-bold bg-white focus:border-violet-300 outline-none transition-all shadow-sm"><option>Male</option><option>Female</option></select>
            <input type="date" id="${formId}-dob" class="s-dob border-2 border-transparent rounded-xl px-4 py-3 font-bold text-gray-500 bg-white focus:border-violet-300 outline-none transition-all shadow-sm">
            <select id="${formId}-class" class="s-class col-span-2 border-2 border-transparent rounded-xl px-4 py-3 font-bold bg-white focus:border-violet-300 outline-none transition-all shadow-sm">${globalClassOptions}</select>
        </div>
    `;
    container.appendChild(formDiv);
    studentForms.push(formId);
    const inputs = formDiv.querySelectorAll('input, select');
    inputs.forEach(input => input.addEventListener('change', captureStudentData));
    if (window.lucide) lucide.createIcons();
}

function removeStudentForm(btn) {
    const formDiv = btn.closest('.student-form');
    if (!confirm('Remove this student?')) return;
    const formIndex = parseInt(formDiv.dataset.index);
    if (formIndex >= 0 && formIndex < studentForms.length) {
        studentForms.splice(formIndex, 1);
        if (studentsData[formIndex]) studentsData.splice(formIndex, 1);
    }
    formDiv.remove();
    studentForms = [];
    const forms = document.querySelectorAll('.student-form');
    forms.forEach((form, i) => {
        form.dataset.index = i;
        const h5 = form.querySelector('h5');
        if (h5) h5.textContent = `Student ${i + 1}`;
        const nameInput = form.querySelector('input[id$="-name"]');
        if (nameInput) {
            const formId = nameInput.id.replace('-name', '');
            studentForms.push(formId);
        }
    });
    showNotification('Student removed', 'success');
}

function captureStudentData() {
    studentsData = [];
    studentForms.forEach((formId, index) => {
        const name = document.getElementById(`${formId}-name`)?.value || '';
        const lrn = document.getElementById(`${formId}-lrn`)?.value || '';
        const gender = document.getElementById(`${formId}-gender`)?.value || '';
        const dob = document.getElementById(`${formId}-dob`)?.value || null;
        const classId = document.getElementById(`${formId}-class`)?.value || '';
        if (name || lrn) {
            studentsData.push({
                index,
                full_name: name,
                lrn,
                gender,
                birthdate: dob,
                class_id: classId,
            });
        }
    });
}

function renderStudentSummaries() {
    captureStudentData();
    const container = document.getElementById('s-summary-container');
    const selectorContainer = document.getElementById('child-selector-container');
    const selector = document.getElementById('child-selector-dropdown');
    if (!container || !selector) return;
    selector.innerHTML = '';
    studentsData.forEach((student, i) => {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = student.full_name || `Student ${i + 1}`;
        selector.appendChild(option);
    });
    if (studentsData.length > 1) selectorContainer.classList.remove('hidden');
    else selectorContainer.classList.add('hidden');
    updateStudentSummaryView();
}

async function updateStudentSummaryView() {
    const selector = document.getElementById('child-selector-dropdown');
    if (!selector) return;
    currentChildIndex = parseInt(selector.value) || 0;
    const student = studentsData[currentChildIndex];
    if (!student) return;
    let className = 'N/A';
    if (student.class_id) {
        const { data: cls } = await supabase.from('classes').select('grade_level, department, strand').eq('id', student.class_id).single();
        if (cls) {
            className = cls.grade_level;
            if (cls.department) className += ` - ${cls.department}`;
        }
    }
    const container = document.getElementById('s-summary-container');
    if (container) {
        container.innerHTML = `<div class="p-6 bg-violet-50 rounded-2xl"><div class="grid grid-cols-2 gap-4"><div><span class="text-gray-400">Name:</span> ${escapeHtml(student.full_name)}</div><div><span class="text-gray-400">LRN:</span> ${escapeHtml(student.lrn)}</div><div><span class="text-gray-400">Gender:</span> ${escapeHtml(student.gender)}</div><div><span class="text-gray-400">Class:</span> ${escapeHtml(className)}</div></div></div>`;
    }
}

function prepareIDPreview() {
    captureStudentData();
    const selector = document.getElementById('id-preview-student-select');
    if (selector) {
        selector.innerHTML = '';
        studentsData.forEach((student, i) => {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = student.full_name || `Student ${i + 1}`;
            selector.appendChild(option);
        });
        if (studentsData.length > 0) updateIDPreview();
    }
}

async function updateIDPreview() {
    const selector = document.getElementById('id-preview-student-select');
    if (!selector) return;
    const index = parseInt(selector.value) || 0;
    const student = studentsData[index];
    if (!student) return;
    const parentPhone = document.getElementById('p-phone').value;
    const parentName = document.getElementById('p-name').value;
    const parentAddress = document.getElementById('p-address').value;
    const year = new Date().getFullYear();
    const studentID = generateOfficialID('EDU', year, student.lrn);
    let classLabel = 'N/A';
    if (student.class_id) {
        const { data: cls } = await supabase.from('classes').select('grade_level, department').eq('id', student.class_id).single();
        if (cls) {
            classLabel = cls.grade_level;
            if (cls.department) classLabel += ` - ${cls.department}`;
        }
    }
    const container = document.getElementById('id-preview-container');
    if (!container) return;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${studentID}`;
    const primaryColor = '#4c1d95';
    const secondaryColor = '#8b5cf6';
    container.innerHTML = `
        <div class="flex gap-4 justify-center flex-wrap">
            <div class="w-[2in] h-[3in] bg-white shadow-2xl rounded-xl overflow-hidden border border-gray-200 flex flex-col font-sans">
                <div style="background: linear-gradient(135deg, ${primaryColor}, ${secondaryColor})" class="h-12 p-2 flex items-center gap-2">
                    <div class="w-6 h-6 bg-white rounded-full flex items-center justify-center"><i data-lucide="graduation-cap" class="w-4 h-4 text-violet-900"></i></div>
                    <div class="text-white overflow-hidden"><h4 class="text-[7px] font-black uppercase">EduCare Colleges Inc</h4><p class="text-[5px] opacity-80">Purok 4 Irisan Baguio City</p></div>
                </div>
                <div class="flex-1 flex flex-col items-center pt-4 px-3 text-center">
                    <div class="w-20 h-20 bg-gray-100 border-2 border-violet-100 p-1 rounded-xl mb-2 overflow-hidden"><div class="w-full h-full bg-gray-200 flex items-center justify-center text-2xl font-black text-gray-400">${student.full_name?.charAt(0) || '?'}</div></div>
                    <h2 class="text-[9px] font-black text-gray-900 uppercase">${escapeHtml(student.full_name)}</h2>
                    <div class="w-full text-left mt-4 space-y-2 border-t pt-3"><div><p class="text-[5px] text-gray-400 font-bold uppercase">Address</p><p class="text-[6px] font-medium">${escapeHtml(parentAddress || 'N/A')}</p></div><div><p class="text-[5px] text-gray-400 font-bold uppercase">Class</p><p class="text-[6px] font-bold text-violet-700">${escapeHtml(classLabel)}</p></div></div>
                </div>
                <div style="background: ${primaryColor}" class="h-1.5 w-full mt-auto"></div>
            </div>
            <div class="w-[2in] h-[3in] bg-white shadow-2xl rounded-xl overflow-hidden border border-gray-200 flex flex-col font-sans">
                <div class="p-4 flex flex-col items-center justify-center flex-1 text-center">
                    <img src="${qrUrl}" class="w-16 h-16 border p-1 rounded-lg mb-2 shadow-sm"><p class="text-[8px] font-mono font-bold text-gray-900 mb-6">${escapeHtml(studentID)}</p>
                    <div class="w-full bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-4 text-left"><p class="text-[5px] text-gray-400 font-bold uppercase">Guardian / Contact</p><p class="text-[7px] font-black text-gray-800">${escapeHtml(parentName)}</p><p class="text-[7px] font-bold text-violet-700">${escapeHtml(parentPhone)}</p></div>
                </div>
                <div style="background: ${primaryColor}" class="h-1.5 w-full mt-auto"></div>
            </div>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

function printIDCard() {
    const container = document.getElementById('id-preview-container');
    if (!container?.innerHTML?.trim()) { showNotification('No ID card to print', 'error'); return; }
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Student ID Card</title><style>body{font-family:'Inter',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;}</style></head><body><div class="flex gap-4">${container.innerHTML}</div><script>window.onload=()=>setTimeout(()=>{window.print();setTimeout(()=>window.close(),500)},500);<\/script></body></html>`);
    printWindow.document.close();
}

function downloadIDCard() { printIDCard(); }

async function saveParentToDB() {
    const name = document.getElementById('p-name').value.trim();
    const address = document.getElementById('p-address').value.trim();
    const role = document.getElementById('p-role').value;
    const phone = document.getElementById('p-phone').value.trim();
    const username = document.getElementById('p-user').value.trim();
    const password = document.getElementById('p-pass').value.trim();
    try {
        const year = new Date().getFullYear();
        const parentID = generateOfficialID('PAR', year, phone);
        const { data, error } = await supabase.from('parents').insert({ full_name: name, address, relationship_type: role, contact_number: phone, username, password, parent_id_text: parentID, is_active: true }).select().single();
        if (error) throw error;
        currentParentId = data.id;
        return data;
    } catch (err) { console.error('Error saving parent:', err); alert('Error saving parent. Please try again.'); throw err; }
}

async function saveStudentsToDB() {
    captureStudentData();
    const year = new Date().getFullYear();
    const studentsToInsert = studentsData.map(student => ({ parent_id: currentParentId, full_name: student.full_name, lrn: student.lrn, gender: student.gender, birthdate: student.birthdate, class_id: student.class_id, student_id_text: generateOfficialID('EDU', year, student.lrn), qr_code_data: generateOfficialID('EDU', year, student.lrn), status: 'Enrolled' }));
    try {
        const { data, error } = await supabase.from('students').insert(studentsToInsert).select();
        if (error) throw error;
        return data;
    } catch (err) { console.error('Error saving students:', err); alert('Error saving students. Please try again.'); throw err; }
}

async function completeEnrollment() {
    try {
        showNotification('Enrollment completed successfully!', 'success');
        closeWizardModal();
        await loadParentsAndStudents();
        resetWizard();
    } catch (err) { console.error('Error completing enrollment:', err); }
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
    if (window.lucide) lucide.createIcons();
    await preloadClassOptions();
    await loadParentsAndStudents();
    addStudentForm();
    updateWizardUI();
});

// ==================== GLOBAL WINDOW ATTACHMENTS ====================
window.openWizardModal = openWizardModal;
window.closeWizardModal = closeWizardModal;
window.nextStep = nextStep;
window.prevStep = prevStep;
window.addStudentForm = addStudentForm;
window.removeStudentForm = removeStudentForm;
window.updateStudentSummaryView = updateStudentSummaryView;
window.updateIDPreview = updateIDPreview;
window.openEditParentModal = openEditParentModal;
window.closeEditParentModal = closeEditParentModal;
window.saveParentChanges = saveParentChanges;
window.openEditStudentModal = openEditStudentModal;
window.closeEditStudentModal = closeEditStudentModal;
window.saveStudentChanges = saveStudentChanges;
window.dropStudentFromParent = dropStudentFromParent;
window.reissueStudentID = reissueStudentID;
window.viewStudentIDCard = viewStudentIDCard;
window.closeViewIDModal = closeViewIDModal;
window.deleteParent = deleteParent;
window.showAddStudentToParentForm = showAddStudentToParentForm;
window.closeAddStudentModal = closeAddStudentModal;
window.saveNewStudentToParent = saveNewStudentToParent;
window.printIDCard = printIDCard;
window.downloadIDCard = downloadIDCard;
window.logout = () => { if (confirm('Logout?')) window.location.href = '../index.html'; };
window.filterParentsStudents = filterParentsStudents;
window.parentNextPage = parentNextPage;
window.parentPrevPage = parentPrevPage;