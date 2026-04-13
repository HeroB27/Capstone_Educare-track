// admin/admin-class-management.js
// FIXED: Class loading, pagination, modal references, and error handling
// ADDED: View students in class feature with pagination and search
// IMPROVED: Card layout – responsive, flexible height, better button grid
// UPDATED: Uses school-year-core.js for dynamic dates

let allClasses = [];
let currentClassPage = 1;
const rowsPerPage = 10;
let currentSubjectClassId = null;
let currentEditSubjectId = null;

// Students in class modal variables
let currentClassStudents = [];
let currentStudentPage = 1;
const studentRowsPerPage = 10;
let currentStudentsClassId = null;
let currentStudentsClassName = '';

// Attendance summary variables
let currentAttendanceClassId = null;
let currentAttendanceClassName = '';
let schoolYearStart = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        if (typeof supabase === 'undefined') {
            console.error('Supabase client not loaded');
            showNotification('System error: Database client not available', 'error');
            return;
        }

        if (typeof checkSession === 'function') {
            const user = checkSession('admins');
            if (!user) return;
        } else {
            console.warn('checkSession not available, continuing anyway');
        }

        await loadTeachers();
        await loadClasses();

        // Use school-year-core.js for dynamic school year start
        schoolYearStart = await getSchoolYearStart();

        // Set default date range (first day of current month to today)
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
        const today = now.toISOString().split('T')[0];
        document.getElementById('attendanceStartDate').value = startOfMonth;
        document.getElementById('attendanceEndDate').value = today;

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
        renderClassGrid();
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
                <div class="bg-white rounded-3xl border border-gray-100 p-5 shadow-lg hover:shadow-xl transition-all flex flex-col group min-h-[360px] h-full">
                    <div class="flex-1">
                        <div class="flex items-start justify-between gap-2 mb-4">
                            <h4 class="text-xl sm:text-2xl font-black text-gray-900 leading-tight break-words">${escapeHtml(c.grade_level)}</h4>
                            ${c.strand ? `<span class="bg-gradient-to-r from-violet-500 to-indigo-500 text-white px-3 py-1 rounded-full text-xs font-black shrink-0">${escapeHtml(c.strand)}</span>` : ''}
                        </div>
                        <div class="space-y-3 text-gray-600">
                            <div class="flex items-center gap-2">
                                <i data-lucide="user" class="w-4 h-4 text-gray-400 shrink-0"></i>
                                <span class="font-bold text-sm truncate" title="${teacherName}">${teacherName}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <i data-lucide="calendar" class="w-4 h-4 text-gray-400 shrink-0"></i>
                                <span class="text-sm">${c.school_year || '2025-2026'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="pt-5 mt-3 border-t border-gray-100">
                        <div class="grid grid-cols-2 gap-2">
                            <button onclick="openClassStudentsModal(${c.id}, '${className.replace(/'/g, "\\'")}')" class="col-span-2 sm:col-span-1 flex items-center justify-center gap-1 p-2.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-xl hover:bg-indigo-100 font-bold text-xs transition-all group-hover:scale-105">
                                <i data-lucide="users" class="w-4 h-4"></i>
                                <span>Students</span>
                            </button>
                            <button onclick="openSubjectLoadModal(${c.id}, '${className.replace(/'/g, "\\'")}')" class="col-span-2 sm:col-span-1 flex items-center justify-center gap-1 p-2.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-xl hover:bg-blue-100 font-bold text-xs transition-all group-hover:scale-105">
                                <i data-lucide="book-open" class="w-4 h-4"></i>
                                <span>Subjects</span>
                            </button>
                            <button onclick="editClass(${c.id})" class="flex items-center justify-center p-2.5 bg-violet-50 text-violet-700 border border-violet-100 rounded-xl hover:bg-violet-100 font-bold transition-all group-hover:scale-105">
                                <i data-lucide="edit-2" class="w-4 h-4"></i>
                            </button>
                            <button onclick="deleteClass(${c.id})" class="flex items-center justify-center p-2.5 bg-red-50 text-red-600 border border-red-100 rounded-xl hover:bg-red-100 font-bold transition-all group-hover:scale-105">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

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
    const selectedDays = Array.from(document.querySelectorAll('.day-checkbox:checked')).map(cb => cb.value).join(',');
    if (!subjectName) {
        showNotification('Subject name is required', 'error');
        return;
    }
    if (!currentSubjectClassId) {
        showNotification('No class selected', 'error');
        return;
    }
    try {
        const { error } = await supabase.from('subject_loads').insert({
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
        const { data, error } = await supabase.from('subject_loads').select('*').eq('id', subjectId).single();
        if (error) throw error;
        currentEditSubjectId = subjectId;
        document.getElementById('editSubjectId').value = data.id;
        document.getElementById('editSubjectName').value = data.subject_name || '';
        document.getElementById('editSubjectTeacherId').value = data.teacher_id || '';
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
    const selectedDays = Array.from(document.querySelectorAll('.edit-day-checkbox:checked')).map(cb => cb.value).join(',');
    if (!subjectName) {
        showNotification('Subject name is required', 'error');
        return;
    }
    try {
        const { error } = await supabase.from('subject_loads').update({
            subject_name: subjectName,
            teacher_id: teacherId,
            schedule_days: selectedDays || null
        }).eq('id', subjectId);
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
        const { error } = await supabase.from('subject_loads').delete().eq('id', subjectId);
        if (error) throw error;
        await loadSubjectLoads(currentSubjectClassId);
        showNotification('Subject removed', 'success');
    } catch (err) {
        console.error('Delete subject error:', err);
        showNotification('Error removing subject: ' + err.message, 'error');
    }
}

// ==================== STUDENTS IN CLASS MODAL ====================
async function openClassStudentsModal(classId, className) {
    currentStudentsClassId = classId;
    currentStudentsClassName = className;
    currentStudentPage = 1;
    const titleEl = document.getElementById('classStudentsTitle');
    if (titleEl) titleEl.innerText = `Students - ${className}`;
    const modal = document.getElementById('classStudentsModal');
    if (modal) modal.classList.remove('hidden');
    await loadStudentsForClass(classId);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeClassStudentsModal() {
    const modal = document.getElementById('classStudentsModal');
    if (modal) modal.classList.add('hidden');
    currentStudentsClassId = null;
    currentStudentsClassName = '';
    currentClassStudents = [];
    const searchInput = document.getElementById('classStudentSearch');
    if (searchInput) searchInput.value = '';
}

async function loadStudentsForClass(classId) {
    const container = document.getElementById('classStudentsList');
    if (!container) return;
    container.innerHTML = '<div class="text-center text-gray-400 py-10"><div class="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3"></div><p class="font-medium">Loading students...</p></div>';
    try {
        const { data, error } = await supabase
            .from('students')
            .select('id, full_name, lrn, gender, student_id_text, status')
            .eq('class_id', classId)
            .order('full_name');
        if (error) throw error;
        currentClassStudents = data || [];
        renderStudentsInClass();
    } catch (err) {
        console.error('loadStudentsForClass error:', err);
        container.innerHTML = '<div class="text-center text-red-500 py-10">Error loading students. Please try again.</div>';
    }
}

function renderStudentsInClass() {
    const container = document.getElementById('classStudentsList');
    if (!container) return;
    const totalPages = Math.ceil(currentClassStudents.length / studentRowsPerPage);
    const start = (currentStudentPage - 1) * studentRowsPerPage;
    const paginated = currentClassStudents.slice(start, start + studentRowsPerPage);
    if (paginated.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-400 py-12">
                <i data-lucide="users" class="w-14 h-14 mx-auto mb-3 opacity-30"></i>
                <p class="font-bold text-lg">No students enrolled</p>
                <p class="text-sm mt-1">This class has no assigned students yet.</p>
                <p class="text-xs mt-4 text-indigo-500">You can assign students from the Parent & Student Management page.</p>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        updateStudentPaginationControls(totalPages);
        return;
    }
    container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th class="px-5 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Student Name</th>
                        <th class="px-5 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider">LRN</th>
                        <th class="px-5 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Student ID</th>
                        <th class="px-5 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Gender</th>
                        <th class="px-5 py-3 text-left text-xs font-black text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    ${paginated.map(s => `
                        <tr class="hover:bg-indigo-50/30 transition-colors">
                            <td class="px-5 py-4 font-bold text-gray-800">${escapeHtml(s.full_name)}</td>
                            <td class="px-5 py-4 font-mono text-xs text-gray-600">${escapeHtml(s.lrn)}</td>
                            <td class="px-5 py-4 font-mono text-xs text-gray-500">${escapeHtml(s.student_id_text || '—')}</td>
                            <td class="px-5 py-4 text-gray-600">${escapeHtml(s.gender || '—')}</td>
                            <td class="px-5 py-4">
                                <span class="inline-flex px-2 py-1 rounded-full text-xs font-bold ${s.status === 'Enrolled' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
                                    ${escapeHtml(s.status || 'Enrolled')}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    updateStudentPaginationControls(totalPages);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateStudentPaginationControls(totalPages) {
    const paginationDiv = document.getElementById('class-students-pagination');
    if (!paginationDiv) return;
    if (totalPages <= 1) {
        paginationDiv.classList.add('hidden');
        return;
    }
    paginationDiv.classList.remove('hidden');
    const start = (currentStudentPage - 1) * studentRowsPerPage;
    const showingEnd = Math.min(start + studentRowsPerPage, currentClassStudents.length);
    paginationDiv.innerHTML = `
        <div class="flex items-center justify-between w-full">
            <div class="text-xs text-gray-500 font-medium">
                Showing ${start+1}-${showingEnd} of ${currentClassStudents.length} students
            </div>
            <div class="flex gap-2">
                <button id="students-prev-btn" class="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl font-bold text-xs hover:bg-gray-200 transition-all ${currentStudentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}" ${currentStudentPage === 1 ? 'disabled' : ''}>
                    <i data-lucide="chevron-left" class="w-4 h-4"></i>
                </button>
                <span class="text-xs font-bold text-gray-500 px-2">Page ${currentStudentPage} of ${totalPages}</span>
                <button id="students-next-btn" class="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl font-bold text-xs hover:bg-gray-200 transition-all ${currentStudentPage >= totalPages ? 'opacity-50 cursor-not-allowed' : ''}" ${currentStudentPage >= totalPages ? 'disabled' : ''}>
                    <i data-lucide="chevron-right" class="w-4 h-4"></i>
                </button>
            </div>
        </div>
    `;
    const prevBtn = document.getElementById('students-prev-btn');
    const nextBtn = document.getElementById('students-next-btn');
    if (prevBtn && currentStudentPage > 1) {
        prevBtn.addEventListener('click', () => {
            if (currentStudentPage > 1) {
                currentStudentPage--;
                renderStudentsInClass();
            }
        });
    }
    if (nextBtn && currentStudentPage < totalPages) {
        nextBtn.addEventListener('click', () => {
            if (currentStudentPage < totalPages) {
                currentStudentPage++;
                renderStudentsInClass();
            }
        });
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function filterStudentsInClass() {
    const searchTerm = document.getElementById('classStudentSearch')?.value.toLowerCase() || '';
    const rows = document.querySelectorAll('#classStudentsList tbody tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

// ==================== ATTENDANCE SUMMARY ====================
async function openAttendanceSummaryModal(classId, className) {
    currentAttendanceClassId = classId;
    currentAttendanceClassName = className;
    const titleEl = document.getElementById('attendanceSummaryTitle');
    if (titleEl) titleEl.innerText = `Attendance - ${className}`;
    const modal = document.getElementById('attendanceSummaryModal');
    if (modal) modal.classList.remove('hidden');
    await refreshAttendanceSummary();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeAttendanceSummaryModal() {
    const modal = document.getElementById('attendanceSummaryModal');
    if (modal) modal.classList.add('hidden');
    currentAttendanceClassId = null;
    currentAttendanceClassName = '';
}

async function refreshAttendanceSummary() {
    if (!currentAttendanceClassId) return;
    
    const container = document.getElementById('attendanceSummaryList');
    if (!container) return;

    const startDate = document.getElementById('attendanceStartDate')?.value;
    const endDate = document.getElementById('attendanceEndDate')?.value;

    if (!startDate || !endDate) {
        showNotification('Please select date range', 'warning');
        return;
    }

    container.innerHTML = '<div class="text-center text-gray-400 py-10"><div class="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mx-auto mb-3"></div><p class="font-medium">Loading attendance data...</p></div>';

    try {
        // Get students in class
        const { data: students, error: studentsError } = await supabase
            .from('students')
            .select('id, full_name')
            .eq('class_id', currentAttendanceClassId)
            .eq('status', 'Enrolled')
            .order('full_name');

        if (studentsError) throw studentsError;

        if (!students || students.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-400 py-10"><i data-lucide="users" class="w-12 h-12 mx-auto mb-3 opacity-30"></i><p class="font-bold">No students in this class</p></div>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        // Get attendance logs for date range (homeroom - subject_load_id IS NULL)
        const studentIds = students.map(s => s.id);
        const { data: logs, error: logsError } = await supabase
            .from('attendance_logs')
            .select('student_id, status, morning_absent, afternoon_absent')
            .in('student_id', studentIds)
            .gte('log_date', startDate)
            .lte('log_date', endDate)
            .is('subject_load_id', null);

        if (logsError) throw logsError;

        // Get YTD absences for each student (including half-days)
        const { data: ytdLogs, error: ytdError } = await supabase
            .from('attendance_logs')
            .select('student_id, status, morning_absent, afternoon_absent')
            .is('subject_load_id', null)
            .in('student_id', studentIds)
            .gte('log_date', schoolYearStart);

        if (ytdError) throw ytdError;

        // Calculate YTD absences count per student (full-day + half-days)
        const ytdAbsenceCounts = {};
        ytdLogs?.forEach(log => {
            const isFullDayAbsent = (log.status === 'Absent') || (log.morning_absent && log.afternoon_absent);
            const isHalfDay = (log.morning_absent !== log.afternoon_absent) && !(log.morning_absent && log.afternoon_absent);
            
            if (isFullDayAbsent) {
                ytdAbsenceCounts[log.student_id] = (ytdAbsenceCounts[log.student_id] || 0) + 1;
            } else if (isHalfDay) {
                ytdAbsenceCounts[log.student_id] = (ytdAbsenceCounts[log.student_id] || 0) + 0.5;
            }
        });

        // Calculate stats per student
        const studentStats = students.map(student => {
            const studentLogs = logs?.filter(l => l.student_id === student.id) || [];

            let present = 0, late = 0, absent = 0, excused = 0;
            
            studentLogs.forEach(log => {
                switch (log.status) {
                    case 'On Time': present++; break;
                    case 'Late': late++; break;
                    case 'Absent': absent++; break;
                    case 'Excused': excused++; break;
                    default: present++;
                }
            });

            // Count morning and afternoon half absences from attendance_logs
            let morningAbsences = 0;
            let afternoonAbsences = 0;
            
            studentLogs.forEach(log => {
                const amAbsent = log.morning_absent || false;
                const pmAbsent = log.afternoon_absent || false;
                if (amAbsent && !pmAbsent) morningAbsences++;
                if (!amAbsent && pmAbsent) afternoonAbsences++;
            });

            // YTD absences (full-day absences only from homeroom)
            const ytdAbsences = ytdAbsenceCounts[student.id] || 0;

            return { student, present, late, absent, excused, morningAbsences, afternoonAbsences, ytdAbsences };
        });

        // Render table
        container.innerHTML = `
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-emerald-50 border-b-2 border-emerald-200">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-black text-emerald-700 uppercase">Student Name</th>
                            <th class="px-3 py-3 text-center text-xs font-black text-emerald-700 uppercase" title="Marked Present (On Time)">Present</th>
                            <th class="px-3 py-3 text-center text-xs font-black text-emerald-700 uppercase" title="Marked Late (Arrived after class start)">Late</th>
                            <th class="px-3 py-3 text-center text-xs font-black text-emerald-700 uppercase" title="Marked Absent (Full day absence)">Absent</th>
                            <th class="px-3 py-3 text-center text-xs font-black text-emerald-700 uppercase" title="Excused absence (with valid reason)">Excused</th>
                            <th class="px-3 py-3 text-center text-xs font-black text-emerald-700 uppercase" title="Morning half-day absences (absent in at least one morning subject)">AM Half-Day</th>
                            <th class="px-3 py-3 text-center text-xs font-black text-emerald-700 uppercase" title="Afternoon half-day absences (absent in at least one afternoon subject)">PM Half-Day</th>
                            <th class="px-3 py-3 text-center text-xs font-black text-emerald-700 uppercase" title="Year-to-Date: Total full-day absences since school year started (Aug 1)">YTD Absences<br><span class="text-[9px] font-normal text-emerald-600">(Full Days)</span></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        ${studentStats.map(stat => {
                            const totalDays = stat.present + stat.late + stat.absent + stat.excused;
                            return `
                                <tr class="hover:bg-emerald-50/30 transition-colors">
                                    <td class="px-4 py-3 font-bold text-gray-800">${escapeHtml(stat.student.full_name)}</td>
                                    <td class="px-3 py-3 text-center text-green-600 font-bold">${stat.present}</td>
                                    <td class="px-3 py-3 text-center text-orange-600 font-bold">${stat.late}</td>
                                    <td class="px-3 py-3 text-center text-red-600 font-bold">${stat.absent}</td>
                                    <td class="px-3 py-3 text-center text-blue-600 font-bold">${stat.excused}</td>
                                    <td class="px-3 py-3 text-center text-red-600 font-bold">${stat.morningAbsences}</td>
                                    <td class="px-3 py-3 text-center text-red-600 font-bold">${stat.afternoonAbsences}</td>
                                    <td class="px-3 py-3 text-center ${stat.ytdAbsences >= 15 ? 'bg-red-100 text-red-800 font-black' : 'text-gray-700'} font-bold">${stat.ytdAbsences}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        // Add summary row
        const totals = studentStats.reduce((acc, stat) => ({
            present: acc.present + stat.present,
            late: acc.late + stat.late,
            absent: acc.absent + stat.absent,
            excused: acc.excused + stat.excused,
            morningAbsences: acc.morningAbsences + stat.morningAbsences,
            afternoonAbsences: acc.afternoonAbsences + stat.afternoonAbsences,
            ytdAbsences: acc.ytdAbsences + stat.ytdAbsences
        }), { present: 0, late: 0, absent: 0, excused: 0, morningAbsences: 0, afternoonAbsences: 0, ytdAbsences: 0 });

        const avgRate = studentStats.length > 0 ? Math.round(studentStats.reduce((sum, s) => {
            const total = s.present + s.late + s.absent + s.excused + (s.morningAbsences + s.afternoonAbsences);
            // UNIFORM FORMULA: (Present + Late + Excused + HalfDay*0.5) / Total
            // For this section, morningAbsences + afternoonAbsences represent half-days
            const halfDays = s.morningAbsences + s.afternoonAbsences;
            const effectivePresent = s.present + s.late + s.excused + (halfDays * 0.5);
            const rate = total > 0 ? (effectivePresent / total) * 100 : 0;
            return sum + rate;
        }, 0) / studentStats.length) : 0;

        container.innerHTML += `
            <div class="mt-4 bg-emerald-50 rounded-xl p-4 border border-emerald-200">
                <div class="flex flex-wrap justify-around text-center gap-4">
                    <div><p class="text-xs text-emerald-600 font-bold uppercase">Total Present</p><p class="text-2xl font-black text-emerald-800">${totals.present}</p></div>
                    <div><p class="text-xs text-emerald-600 font-bold uppercase">Total Late</p><p class="text-2xl font-black text-emerald-800">${totals.late}</p></div>
                    <div><p class="text-xs text-emerald-600 font-bold uppercase">Total Absent (Full Day)</p><p class="text-2xl font-black text-red-600">${totals.absent}</p></div>
                    <div><p class="text-xs text-emerald-600 font-bold uppercase">Total Excused</p><p class="text-2xl font-black text-blue-600">${totals.excused}</p></div>
                    <div><p class="text-xs text-emerald-600 font-bold uppercase">AM Half-Day Absences</p><p class="text-2xl font-black text-red-600">${totals.morningAbsences}</p></div>
                    <div><p class="text-xs text-emerald-600 font-bold uppercase">PM Half-Day Absences</p><p class="text-2xl font-black text-red-600">${totals.afternoonAbsences}</p></div>
                    <div><p class="text-xs text-emerald-600 font-bold uppercase">YTD Full-Day Absences</p><p class="text-2xl font-black text-red-600">${totals.ytdAbsences}</p></div>
                    <div><p class="text-xs text-emerald-600 font-bold uppercase">Average Attendance</p><p class="text-2xl font-black text-purple-600">${avgRate}%</p></div>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error('refreshAttendanceSummary error:', err);
        container.innerHTML = '<div class="text-center text-red-500 py-10">Error loading attendance. Please try again.</div>';
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
window.openClassStudentsModal = openClassStudentsModal;
window.closeClassStudentsModal = closeClassStudentsModal;
window.filterStudentsInClass = filterStudentsInClass;
window.openAttendanceSummaryModal = openAttendanceSummaryModal;
window.closeAttendanceSummaryModal = closeAttendanceSummaryModal;
window.refreshAttendanceSummary = refreshAttendanceSummary;
window.logout = logout;