// admin/admin-class-management.js
// Complete Class & Subject Load Management

let allClasses = [];
let currentClassPage = 1;
const rowsPerPage = 10;
let currentSubjectClassId = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkSession === 'function') checkSession('admins');
    await loadTeachers();
    await loadClasses();
});

async function loadTeachers() {
    const { data } = await supabase.from('teachers').select('id, full_name').eq('is_active', true);
    const teacherSelects = document.querySelectorAll('#class-adviser, #subject-teacher');
    teacherSelects.forEach(select => {
        select.innerHTML = '<option value="">Select Teacher</option>' + 
            (data?.map(t => `<option value="${t.id}">${escapeHtml(t.full_name)}</option>`).join('') || '');
    });
}

async function loadClasses() {
    const { data, error } = await supabase
        .from('classes')
        .select('*, teachers(full_name)')
        .order('grade_level');
    if (error) { console.error(error); showNotification('Failed to load classes', 'error'); return; }
    allClasses = data || [];
    renderClassTable();
}

function renderClassTable() {
    const tbody = document.getElementById('class-table-body');
    const start = (currentClassPage - 1) * rowsPerPage;
    const paginated = allClasses.slice(start, start + rowsPerPage);
    const totalPages = Math.ceil(allClasses.length / rowsPerPage);

    if (paginated.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-8 py-12 text-center text-gray-400">No classes found. Click "New Class" to add.</td></tr>';
    } else {
        tbody.innerHTML = paginated.map(c => `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-8 py-5 font-bold text-gray-800">${escapeHtml(c.grade_level)}</td>
                <td class="px-8 py-5">${c.strand ? `<span class="inline-block bg-violet-100 text-violet-700 px-2 py-1 rounded-lg text-xs font-bold">${escapeHtml(c.strand)}</span>` : '—'}</td>
                <td class="px-8 py-5">${c.teachers?.full_name ? escapeHtml(c.teachers.full_name) : '<span class="text-gray-400">Not assigned</span>'}</td>
                <td class="px-8 py-5">${c.room_number || '—'}</td>
                <td class="px-8 py-5 text-right space-x-2">
                    <button onclick="openSubjectModal(${c.id}, '${escapeHtml(c.grade_level)}${c.strand ? ' - ' + c.strand : ''}')" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Subject Loads"><i data-lucide="book-open" class="w-4 h-4"></i></button>
                    <button onclick="editClass(${c.id})" class="p-2 text-violet-600 hover:bg-violet-50 rounded-lg"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                    <button onclick="deleteClass(${c.id})" class="p-2 text-red-500 hover:bg-red-50 rounded-lg"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </td>
            </tr>
        `).join('');
    }

    document.getElementById('class-page-info').innerText = `Showing ${start+1}-${Math.min(start+rowsPerPage, allClasses.length)} of ${allClasses.length}`;
    document.getElementById('class-prev-btn').disabled = currentClassPage === 1;
    document.getElementById('class-next-btn').disabled = currentClassPage >= totalPages;
    lucide.createIcons();
}

function filterClasses() {
    const search = document.getElementById('classSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#class-table-body tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(search) ? '' : 'none';
    });
}

function classPrevPage() { if (currentClassPage > 1) { currentClassPage--; renderClassTable(); } }
function classNextPage() { const total = Math.ceil(allClasses.length / rowsPerPage); if (currentClassPage < total) { currentClassPage++; renderClassTable(); } }

function openClassModal() {
    document.getElementById('classModal').classList.remove('hidden');
    document.getElementById('classModalTitle').innerText = 'Add New Class';
    document.getElementById('class-id').value = '';
    document.getElementById('class-grade').value = '';
    document.getElementById('class-strand').value = '';
    document.getElementById('class-dept').value = '';
    document.getElementById('class-adviser').value = '';
    document.getElementById('class-room').value = '';
    document.getElementById('class-school-year').value = '2025-2026';
}
function closeClassModal() { document.getElementById('classModal').classList.add('hidden'); }

async function editClass(id) {
    const classData = allClasses.find(c => c.id === id);
    if (!classData) return;
    document.getElementById('class-id').value = classData.id;
    document.getElementById('class-grade').value = classData.grade_level || '';
    document.getElementById('class-strand').value = classData.strand || '';
    document.getElementById('class-dept').value = classData.department || '';
    document.getElementById('class-adviser').value = classData.adviser_id || '';
    document.getElementById('class-room').value = classData.room_number || '';
    document.getElementById('class-school-year').value = classData.school_year || '2025-2026';
    document.getElementById('classModalTitle').innerText = 'Edit Class';
    document.getElementById('classModal').classList.remove('hidden');
}

async function saveClass() {
    const id = document.getElementById('class-id').value;
    const grade_level = document.getElementById('class-grade').value;
    const strand = document.getElementById('class-strand').value || null;
    const department = document.getElementById('class-dept').value || null;
    const adviser_id = document.getElementById('class-adviser').value || null;
    const room_number = document.getElementById('class-room').value || null;
    const school_year = document.getElementById('class-school-year').value || '2025-2026';

    if (!grade_level) { showNotification('Grade Level is required', 'error'); return; }

    const payload = { grade_level, strand, department, adviser_id, room_number, school_year };
    let error;
    if (id) {
        const { error: updateErr } = await supabase.from('classes').update(payload).eq('id', id);
        error = updateErr;
    } else {
        const { error: insertErr } = await supabase.from('classes').insert(payload);
        error = insertErr;
    }
    if (error) { showNotification('Error saving class: ' + error.message, 'error'); return; }
    closeClassModal();
    await loadClasses();
    showNotification('Class saved successfully', 'success');
}

async function deleteClass(id) {
    if (!confirm('Delete this class? This will also remove all subject loads and unassign students.')) return;
    await supabase.from('subject_loads').delete().eq('class_id', id);
    const { error } = await supabase.from('classes').delete().eq('id', id);
    if (error) { showNotification(error.message, 'error'); return; }
    await loadClasses();
    showNotification('Class deleted', 'success');
}

// ----- Subject Loads Management -----
async function openSubjectModal(classId, className) {
    currentSubjectClassId = classId;
    document.getElementById('subject-class-name').innerText = className;
    document.getElementById('subjectModal').classList.remove('hidden');
    await loadSubjectLoads(classId);
}
function closeSubjectModal() { document.getElementById('subjectModal').classList.add('hidden'); }

async function loadSubjectLoads(classId) {
    const { data, error } = await supabase
        .from('subject_loads')
        .select('*, teachers(full_name)')
        .eq('class_id', classId);
    if (error) { console.error(error); return; }
    const container = document.getElementById('subject-list');
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-6">No subjects assigned yet.</div>';
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
    lucide.createIcons();
}

function openAddSubjectForm() {
    document.getElementById('addSubjectModal').classList.remove('hidden');
    document.getElementById('subject-id').value = '';
    document.getElementById('subject-name').value = '';
    document.getElementById('subject-teacher').value = '';
    document.getElementById('subject-days').value = '';
    document.getElementById('subject-start').value = '';
    document.getElementById('subject-end').value = '';
    document.getElementById('subjectModalTitle').innerText = 'Add Subject Load';
}
function closeAddSubjectModal() { document.getElementById('addSubjectModal').classList.add('hidden'); }

async function editSubjectLoad(subjectId) {
    const { data, error } = await supabase.from('subject_loads').select('*').eq('id', subjectId).single();
    if (error) return;
    document.getElementById('subject-id').value = data.id;
    document.getElementById('subject-name').value = data.subject_name || '';
    document.getElementById('subject-teacher').value = data.teacher_id || '';
    document.getElementById('subject-days').value = data.schedule_days || '';
    document.getElementById('subject-start').value = data.schedule_time_start ? data.schedule_time_start.slice(0,5) : '';
    document.getElementById('subject-end').value = data.schedule_time_end ? data.schedule_time_end.slice(0,5) : '';
    document.getElementById('subjectModalTitle').innerText = 'Edit Subject Load';
    document.getElementById('addSubjectModal').classList.remove('hidden');
}

async function saveSubjectLoad() {
    const id = document.getElementById('subject-id').value;
    const subject_name = document.getElementById('subject-name').value.trim();
    const teacher_id = document.getElementById('subject-teacher').value || null;
    const schedule_days = document.getElementById('subject-days').value.trim() || null;
    const start = document.getElementById('subject-start').value;
    const end = document.getElementById('subject-end').value;

    if (!subject_name) { showNotification('Subject name is required', 'error'); return; }

    const payload = {
        subject_name,
        teacher_id,
        class_id: currentSubjectClassId,
        schedule_time_start: start || null,
        schedule_time_end: end || null,
        schedule_days
    };
    let error;
    if (id) {
        const { error: updateErr } = await supabase.from('subject_loads').update(payload).eq('id', id);
        error = updateErr;
    } else {
        const { error: insertErr } = await supabase.from('subject_loads').insert(payload);
        error = insertErr;
    }
    if (error) { showNotification('Error saving subject: ' + error.message, 'error'); return; }
    closeAddSubjectModal();
    await loadSubjectLoads(currentSubjectClassId);
    showNotification('Subject saved', 'success');
}

async function deleteSubjectLoad(subjectId) {
    if (!confirm('Remove this subject load?')) return;
    const { error } = await supabase.from('subject_loads').delete().eq('id', subjectId);
    if (error) { showNotification(error.message, 'error'); return; }
    await loadSubjectLoads(currentSubjectClassId);
    showNotification('Subject removed', 'success');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(msg, type) {
    // Simple alert fallback – replace with your custom modal if desired
    alert(msg);
}

function logout() { if (confirm('Logout?')) window.location.href = '../index.html'; }

// Global exports
window.openClassModal = openClassModal;
window.closeClassModal = closeClassModal;
window.editClass = editClass;
window.saveClass = saveClass;
window.deleteClass = deleteClass;
window.openSubjectModal = openSubjectModal;
window.closeSubjectModal = closeSubjectModal;
window.openAddSubjectForm = openAddSubjectForm;
window.closeAddSubjectModal = closeAddSubjectModal;
window.editSubjectLoad = editSubjectLoad;
window.saveSubjectLoad = saveSubjectLoad;
window.deleteSubjectLoad = deleteSubjectLoad;
window.filterClasses = filterClasses;
window.classPrevPage = classPrevPage;
window.classNextPage = classNextPage;
window.logout = logout;