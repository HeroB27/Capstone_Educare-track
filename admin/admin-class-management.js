// admin/admin-class-management.js
// FIXED: Class loading, pagination, modal references, and error handling
// CARD LAYOUT FIXED: Removed stray 'h-[320px]' text and fixed opening div

let allClasses = [];
let currentClassPage = 1;
const rowsPerPage = 10;
let currentSubjectClassId = null;
let currentEditSubjectId = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Verify supabase client exists
        if (typeof supabase === 'undefined') {
            console.error('Supabase client not loaded');
            showNotification('System error: Database client not available', 'error');
            return;
        }

        // Check admin session (function may come from general-core.js)
        if (typeof checkSession === 'function') {
            const user = checkSession('admins');
            if (!user) return;
        } else {
            console.warn('checkSession not available, continuing anyway');
        }

        // Load teachers for dropdowns
        await loadTeachers();
        // Load classes
        await loadClasses();

        // Initialize Lucide icons if available
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error('Initialization error:', err);
        showNotification('Failed to initialize page: ' + err.message, 'error');
    }
});

// ==================== TEACHERS ====================
async function loadTeachers() {
    try {
        const { data, error } = await supabase
            .from('teachers')
            .select('id, full_name')
            .eq('is_active', true);

        if (error) throw error;

        const teacherOptions = (data || [])
            .map(t => `<option value="${t.id}">${escapeHtml(t.full_name)}</option>`)
            .join('');

        // Populate all teacher selectors used in modals
        const selects = ['#adviserId', '#subjectTeacherId', '#editSubjectTeacherId'];
        selects.forEach(sel => {
            const el = document.querySelector(sel);
            if (el) {
                el.innerHTML = '<option value="">Select Teacher</option>' + teacherOptions;
            }
        });
    } catch (err) {
        console.error('loadTeachers error:', err);
        showNotification('Failed to load teacher list', 'error');
    }
}

// ==================== CLASSES ====================
async function loadClasses() {
    // Show loading state
    const grid = document.getElementById('classGrid');
    if (grid) grid.innerHTML = '<div class="col-span-full text-center py-20 text-gray-400"><div class="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600 mx-auto mb-4"></div><p class="text-lg font-medium">Loading classes...</p></div>';

    try {
        const { data, error } = await supabase
            .from('classes')
            .select('*, teachers(full_name)')
            .order('grade_level');

        if (error) throw error;

        allClasses = data || [];
        renderClassGrid();
    } catch (err) {
        console.error('loadClasses error:', err);
        showNotification('Error loading classes: ' + err.message, 'error');
        allClasses = [];
        renderClassGrid(); // Show empty state
    }
}

function renderClassGrid() {
    const grid = document.getElementById('classGrid');
    if (!grid) {
        console.error('classGrid element not found');
        return;
    }

    const start = (currentClassPage - 1) * rowsPerPage;
    const paginated = allClasses.slice(start, start + rowsPerPage);
    const totalPages = Math.ceil(allClasses.length / rowsPerPage);

    if (paginated.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-20 text-gray-400">
                <i data-lucide="school" class="w-16 h-16 mx-auto mb-4 opacity-30"></i>
                <p class="text-2xl font-black">No classes found</p>
                <p class="mt-2">Click "Add Class" to create your first class</p>
            </div>`;
    } else {
        grid.innerHTML = paginated.map(c => {
            const className = `${escapeHtml(c.grade_level)}${c.strand ? ' - ' + escapeHtml(c.strand) : ''}`;
            const teacherName = c.teachers?.full_name || 'Not assigned';
            return `
                <div class="bg-white rounded-3xl border border-gray-100 p-6 shadow-lg hover:shadow-xl transition-all flex flex-col group h-[320px]">
                    <div class="flex-1">
                        <div class="flex items-start justify-between mb-6">
                            <h4 class="text-3xl font-black text-gray-900 leading-tight">${escapeHtml(c.grade_level)}</h4>
                            ${c.strand ? `<span class="bg-gradient-to-r from-violet-500 to-indigo-500 text-white px-4 py-2 rounded-full text-sm font-black">${escapeHtml(c.strand)}</span>` : ''}
                        </div>
                        <div class="space-y-4 text-gray-600">
                            <div class="flex items-center gap-3">
                                <i data-lucide="user" class="w-5 h-5 text-gray-400"></i>
                                <span class="font-bold">${teacherName}</span>
                            </div>
                            <div class="flex items-center gap-3">
                                <i data-lucide="calendar" class="w-5 h-5 text-gray-400"></i>
                                <span>${c.school_year || '2025-2026'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="flex gap-2 pt-6 border-t border-gray-100">
                        <button onclick="openSubjectLoadModal(${c.id}, '${className.replace(/'/g, "\\'")}')" class="flex-1 p-3 bg-blue-50 text-blue-700 border-2 border-blue-100 rounded-2xl hover:bg-blue-100 font-bold transition-all group-hover:scale-105" title="Manage Subjects">
                            <i data-lucide="book-open" class="w-5 h-5 mr-2"></i>
                            Subjects
                        </button>
                        <button onclick="editClass(${c.id})" class="p-3 bg-violet-50 text-violet-700 border-2 border-violet-100 rounded-2xl hover:bg-violet-100 font-bold transition-all group-hover:scale-105">
                            <i data-lucide="edit-2" class="w-5 h-5"></i>
                        </button>
                        <button onclick="deleteClass(${c.id})" class="p-3 bg-red-50 text-red-600 border-2 border-red-100 rounded-2xl hover:bg-red-100 font-bold transition-all group-hover:scale-105">
                            <i data-lucide="trash-2" class="w-5 h-5"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Update pagination controls
    updatePaginationControls(totalPages);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updatePaginationControls(totalPages) {
    let pagination = document.getElementById('class-pagination');
    if (!pagination) {
        pagination = document.createElement('div');
        pagination.id = 'class-pagination';
        pagination.className = 'mt-12 flex items-center justify-center gap-4 bg-white/50 backdrop-blur p-6 rounded-3xl border';
        const gridParent = document.getElementById('classGrid').parentNode;
        if (gridParent) gridParent.appendChild(pagination);
        else document.querySelector('main .flex-1').appendChild(pagination);
    }

    const start = (currentClassPage - 1) * rowsPerPage;
    const showingEnd = Math.min(start + rowsPerPage, allClasses.length);
    
    pagination.innerHTML = `
        <button id="class-prev-btn" class="px-6 py-2 bg-violet-100 text-violet-700 rounded-xl font-bold hover:bg-violet-200 disabled:opacity-50 disabled:cursor-not-allowed" ${currentClassPage === 1 ? 'disabled' : ''}>Previous</button>
        <span class="text-sm font-bold text-gray-600">Showing ${start+1}-${showingEnd} of ${allClasses.length} classes</span>
        <button id="class-next-btn" class="px-6 py-2 bg-violet-100 text-violet-700 rounded-xl font-bold hover:bg-violet-200 disabled:opacity-50 disabled:cursor-not-allowed" ${currentClassPage >= totalPages ? 'disabled' : ''}>Next</button>
    `;
    
    const prevBtn = document.getElementById('class-prev-btn');
    const nextBtn = document.getElementById('class-next-btn');
    if (prevBtn) prevBtn.addEventListener('click', () => {
        if (currentClassPage > 1) {
            currentClassPage--;
            renderClassGrid();
        }
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
        if (currentClassPage < totalPages) {
            currentClassPage++;
            renderClassGrid();
        }
    });
}

// ==================== CLASS CRUD ====================
async function editClass(id) {
    const classData = allClasses.find(c => c.id === id);
    if (!classData) return;
    
    // Populate edit fields (if you have a class edit modal)
    // For now, open the adviser modal with pre-filled data
    openAdviserModal({
        id: classData.id,
        name: `${classData.grade_level}${classData.strand ? ' - ' + classData.strand : ''}`,
        grade_level: classData.grade_level,
        strand: classData.strand || '',
        adviser_id: classData.adviser_id
    });
}

async function deleteClass(id) {
    if (!confirm('Delete this class? This will also remove all subject loads and unassign students.')) return;
    try {
        // First delete related subject loads
        await supabase.from('subject_loads').delete().eq('class_id', id);
        const { error } = await supabase.from('classes').delete().eq('id', id);
        if (error) throw error;
        await loadClasses();
        showNotification('Class deleted successfully', 'success');
    } catch (err) {
        console.error('Delete error:', err);
        showNotification('Error deleting class: ' + err.message, 'error');
    }
}

// ==================== ADVISER MODAL ====================
function openAdviserModal(classData) {
    const modal = document.getElementById('adviserModal');
    if (!modal) return;
    
    document.getElementById('displayClassName').innerText = classData.name || classData.grade_level;
    document.getElementById('targetGradeLevel').value = classData.grade_level || '';
    document.getElementById('targetStrand').value = classData.strand || '';
    document.getElementById('existingClassId').value = classData.id || '';
    document.getElementById('adviserId').value = classData.adviser_id || '';
    
    modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeAdviserModal() {
    const modal = document.getElementById('adviserModal');
    if (modal) modal.classList.add('hidden');
}

async function saveAdviser() {
    const classId = document.getElementById('existingClassId').value;
    const adviserId = document.getElementById('adviserId').value;
    
    if (!classId) {
        showNotification('Class ID missing', 'error');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('classes')
            .update({ adviser_id: adviserId || null })
            .eq('id', classId);
        
        if (error) throw error;
        
        closeAdviserModal();
        await loadClasses();
        showNotification('Adviser assigned successfully', 'success');
    } catch (err) {
        console.error('Save adviser error:', err);
        showNotification('Error saving adviser: ' + err.message, 'error');
    }
}

// ==================== SUBJECT LOADS MODAL ====================
async function openSubjectLoadModal(classId, className) {
    currentSubjectClassId = classId;
    const titleEl = document.getElementById('subjectLoadTitle');
    if (titleEl) titleEl.innerText = `Subject Assignments - ${className}`;
    
    const modal = document.getElementById('subjectLoadModal');
    if (modal) modal.classList.remove('hidden');
    
    await loadSubjectLoads(classId);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeSubjectLoadModal() {
    const modal = document.getElementById('subjectLoadModal');
    if (modal) modal.classList.add('hidden');
    currentSubjectClassId = null;
}

async function loadSubjectLoads(classId) {
    const container = document.getElementById('subjectList');
    if (!container) return;
    
    container.innerHTML = '<div class="text-center text-gray-400 py-6"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600 mx-auto mb-2"></div><p>Loading subjects...</p></div>';
    
    try {
        const { data, error } = await supabase
            .from('subject_loads')
            .select('*, teachers(full_name)')
            .eq('class_id', classId);
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-400 py-10"><i data-lucide="book-x" class="w-12 h-12 mx-auto mb-2 opacity-30"></i><p class="font-medium">No subjects assigned yet.</p><p class="text-sm mt-1">Click the + button to add a subject.</p></div>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }
        
        container.innerHTML = data.map(s => `
            <div class="bg-gray-50 rounded-xl p-4 border border-gray-200 flex justify-between items-center">
                <div>
                    <p class="font-bold text-gray-800">${escapeHtml(s.subject_name)}</p>
                    <p class="text-xs text-gray-500">Teacher: ${s.teachers?.full_name || 'Unassigned'} | Schedule: ${s.schedule_days || '—'} ${s.schedule_time_start ? s.schedule_time_start.slice(0,5) + '-' + s.schedule_time_end?.slice(0,5) : ''}</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="editSubjectLoad(${s.id})" class="p-2 text-violet-600 hover:bg-violet-50 rounded-lg"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                    <button onclick="deleteSubjectLoad(${s.id})" class="p-2 text-red-500 hover:bg-red-50 rounded-lg"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            </div>
        `).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error('loadSubjectLoads error:', err);
        container.innerHTML = '<div class="text-center text-red-500 py-6">Error loading subjects. Please try again.</div>';
    }
}

// ==================== ADD/EDIT SUBJECT MODAL ====================
function openAddSubjectModal() {
    // Reset form
    document.getElementById('subjectName').value = '';
    document.getElementById('subjectTeacherId').value = '';
    document.querySelectorAll('.day-checkbox').forEach(cb => cb.checked = false);
    document.getElementById('editSubjectId').value = '';
    
    const modal = document.getElementById('addSubjectModal');
    if (modal) modal.classList.remove('hidden');
}

function closeAddSubjectModal() {
    const modal = document.getElementById('addSubjectModal');
    if (modal) modal.classList.add('hidden');
}

async function saveSubject() {
    const subjectName = document.getElementById('subjectName')?.value.trim();
    const teacherId = document.getElementById('subjectTeacherId')?.value || null;
    const selectedDays = Array.from(document.querySelectorAll('.day-checkbox:checked'))
        .map(cb => cb.value).join(',');
    
    if (!subjectName) {
        showNotification('Subject name is required', 'error');
        return;
    }
    
    if (!currentSubjectClassId) {
        showNotification('No class selected', 'error');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('subject_loads')
            .insert({
                subject_name: subjectName,
                teacher_id: teacherId,
                class_id: currentSubjectClassId,
                schedule_days: selectedDays || null
            });
        
        if (error) throw error;
        
        closeAddSubjectModal();
        await loadSubjectLoads(currentSubjectClassId);
        showNotification('Subject added successfully', 'success');
    } catch (err) {
        console.error('Save subject error:', err);
        showNotification('Error adding subject: ' + err.message, 'error');
    }
}

async function editSubjectLoad(subjectId) {
    try {
        const { data, error } = await supabase
            .from('subject_loads')
            .select('*')
            .eq('id', subjectId)
            .single();
        
        if (error) throw error;
        
        currentEditSubjectId = subjectId;
        document.getElementById('editSubjectId').value = data.id;
        document.getElementById('editSubjectName').value = data.subject_name || '';
        document.getElementById('editSubjectTeacherId').value = data.teacher_id || '';
        
        // Set days checkboxes
        const days = (data.schedule_days || '').split(',');
        document.querySelectorAll('.edit-day-checkbox').forEach(cb => {
            cb.checked = days.includes(cb.value);
        });
        
        const modal = document.getElementById('editSubjectModal');
        if (modal) modal.classList.remove('hidden');
    } catch (err) {
        console.error('Edit load error:', err);
        showNotification('Error loading subject details', 'error');
    }
}

function closeEditSubjectModal() {
    const modal = document.getElementById('editSubjectModal');
    if (modal) modal.classList.add('hidden');
    currentEditSubjectId = null;
}

async function saveEditSubject() {
    const subjectId = document.getElementById('editSubjectId')?.value;
    const subjectName = document.getElementById('editSubjectName')?.value.trim();
    const teacherId = document.getElementById('editSubjectTeacherId')?.value || null;
    const selectedDays = Array.from(document.querySelectorAll('.edit-day-checkbox:checked'))
        .map(cb => cb.value).join(',');
    
    if (!subjectName) {
        showNotification('Subject name is required', 'error');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('subject_loads')
            .update({
                subject_name: subjectName,
                teacher_id: teacherId,
                schedule_days: selectedDays || null
            })
            .eq('id', subjectId);
        
        if (error) throw error;
        
        closeEditSubjectModal();
        await loadSubjectLoads(currentSubjectClassId);
        showNotification('Subject updated successfully', 'success');
    } catch (err) {
        console.error('Update subject error:', err);
        showNotification('Error updating subject: ' + err.message, 'error');
    }
}

async function deleteSubjectLoad(subjectId) {
    if (!confirm('Remove this subject load?')) return;
    try {
        const { error } = await supabase
            .from('subject_loads')
            .delete()
            .eq('id', subjectId);
        
        if (error) throw error;
        
        await loadSubjectLoads(currentSubjectClassId);
        showNotification('Subject removed', 'success');
    } catch (err) {
        console.error('Delete subject error:', err);
        showNotification('Error removing subject: ' + err.message, 'error');
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
    // Simple fallback – you can replace with a styled toast
    console.log(`[${type.toUpperCase()}] ${msg}`);
    alert(msg);
}

function logout() {
    if (confirm('Logout?')) {
        if (typeof signOut === 'function') signOut();
        window.location.href = '../index.html';
    }
}

// Expose functions globally
window.openAdviserModal = openAdviserModal;
window.closeAdviserModal = closeAdviserModal;
window.saveAdviser = saveAdviser;
window.editClass = editClass;
window.deleteClass = deleteClass;
window.openSubjectLoadModal = openSubjectLoadModal;
window.closeSubjectLoadModal = closeSubjectLoadModal;
window.openAddSubjectModal = openAddSubjectModal;
window.closeAddSubjectModal = closeAddSubjectModal;
window.saveSubject = saveSubject;
window.editSubjectLoad = editSubjectLoad;
window.closeEditSubjectModal = closeEditSubjectModal;
window.saveEditSubject = saveEditSubject;
window.deleteSubjectLoad = deleteSubjectLoad;
window.logout = logout;