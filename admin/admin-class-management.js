// admin/admin-class-management.js

let teachers = [];
let currentOpenClass = null; // Stores the DB ID of the class when managing subjects

// The "Built-In" Structure of the School
const GRADE_LEVELS = [
    'Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 
    'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'
];

const SHS_STRANDS = ['STEM', 'HUMSS', 'ABM', 'ICT'];

document.addEventListener('DOMContentLoaded', async () => {
    if (!checkSession('admins')) return;
    await loadTeachers();
    loadAllClasses();
    injectStyles();
});

async function loadTeachers() {
    try {
        const { data, error } = await supabase.from('teachers').select('id, full_name').eq('is_active', true).order('full_name');
        if (error) throw error;
        teachers = data || [];
        
        const opts = '<option value="">Select Teacher...</option>' + 
            teachers.map(t => `<option value="${t.id}">${t.full_name}</option>`).join('');
            
        document.getElementById('adviserId').innerHTML = opts;
        document.getElementById('subjectTeacherId').innerHTML = opts; // For Subject Modal
    } catch (err) {
        console.error("Error loading teachers:", err);
        showNotification("Failed to load teachers", "error");
    }
}

async function loadAllClasses() {
    const grid = document.getElementById('classGrid');
    grid.innerHTML = '<div class="col-span-full py-12 text-center text-gray-400 italic">Loading all classes...</div>';
    
    // Build array of all 19 required classes
    let requiredClasses = [];
    GRADE_LEVELS.forEach(grade => {
        if (grade === 'Grade 11' || grade === 'Grade 12') {
            SHS_STRANDS.forEach(strand => {
                requiredClasses.push({ grade_level: grade, strand: strand, displayName: `${grade} - ${strand}` });
            });
        } else {
            requiredClasses.push({ grade_level: grade, strand: null, displayName: grade });
        }
    });

    try {
        // Fetch ALL classes from DB in a single query
        const { data: dbClasses, error } = await supabase
            .from('classes')
            .select('*, teachers(full_name)');
            
        if (error) throw error;
        
        grid.innerHTML = requiredClasses.map(reqClass => {
            // Match against DB results using both grade_level and strand
            const existingDbRecord = dbClasses?.find(c => 
                c.grade_level === reqClass.grade_level && 
                (c.strand === reqClass.strand || (!c.strand && !reqClass.strand))
            );
            const adviserName = existingDbRecord?.teachers?.full_name || 'Unassigned';
            const dbId = existingDbRecord ? existingDbRecord.id : null;
            const currentAdviserId = existingDbRecord ? existingDbRecord.adviser_id : '';
            
            const statusColor = existingDbRecord ? 'text-emerald-500 bg-emerald-50' : 'text-amber-500 bg-amber-50';
            const statusText = existingDbRecord ? 'Active' : 'Pending Adviser';

            // Buttons Logic: If it exists in DB, show Manage Subjects + Edit Adviser. If not, just Assign Adviser.
            let actionButtons = '';
            if (existingDbRecord) {
                actionButtons = `
                    <div class="flex gap-2">
                        <button onclick="openSubjectLoad(${dbId}, '${reqClass.displayName}')" class="flex-1 py-2.5 bg-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 transition-all shadow-lg shadow-violet-200">Manage Subjects</button>
                        <button onclick="openAdviserModal('${reqClass.grade_level}', '${reqClass.strand || ''}', ${dbId}, '${currentAdviserId}')" class="p-2.5 bg-gray-50 text-gray-500 rounded-xl hover:text-violet-600 hover:bg-violet-50 transition-all" title="Change Adviser">
                            <i data-lucide="user-cog" class="w-4 h-4"></i>
                        </button>
                        <button onclick="deleteClass(${dbId}, '${reqClass.displayName}')" class="p-2.5 bg-red-50 text-red-400 rounded-xl hover:bg-red-100 hover:text-red-500 transition-all" title="Delete Class">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>`;
            } else {
                actionButtons = `
                    <button onclick="openAdviserModal('${reqClass.grade_level}', '${reqClass.strand || ''}', null, '')" class="w-full py-2.5 bg-gray-50 border border-dashed border-gray-300 text-gray-500 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-violet-50 hover:text-violet-600 hover:border-violet-300 transition-all">
                        + Assign Adviser
                    </button>`;
            }

            return `
            <div class="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col h-full">
                <div class="flex justify-between items-start mb-3">
                    <h3 class="text-lg font-black text-gray-900 leading-tight">${reqClass.displayName}</h3>
                    <span class="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${statusColor}">${statusText}</span>
                </div>
                
                <div class="mb-4 flex-1">
                    <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Homeroom Adviser</p>
                    <p class="text-sm font-bold ${existingDbRecord ? 'text-gray-800' : 'text-gray-400 italic'}">${adviserName}</p>
                </div>

                ${actionButtons}
            </div>`;
        }).join('');
        lucide.createIcons();
        
    } catch (err) {
        console.error("Error loading classes:", err);
        grid.innerHTML = '<div class="col-span-full py-12 text-center text-red-500">Error loading classes</div>';
    }
}

// Delete class function (Safe Version)
async function deleteClass(classId, className) {
    if (!confirm(`Are you sure you want to delete "${className}"? This will also remove all subject assignments.`)) return;
    
    try {
        // 1. Check if students are enrolled to prevent FK Violation
        const { count, error: studentErr } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('class_id', classId);
            
        if (count > 0) {
            return showNotification(`Cannot delete: There are ${count} students enrolled in this class. Reassign them first.`, 'error');
        }

        // 2. Explicitly delete associated subject loads first
        await supabase.from('subject_loads').delete().eq('class_id', classId);

        // 3. Delete the class
        const { error } = await supabase.from('classes').delete().eq('id', classId);
        if (error) throw error;
        
        showNotification('Class and subjects deleted successfully!', 'success');
        loadAllClasses();
    } catch (err) {
        console.error("Error deleting class:", err);
        showNotification('Failed to delete class: ' + err.message, 'error');
    }
}

// === ADVISER ASSIGNMENT LOGIC ===
function openAdviserModal(gradeLevel, strand, existingClassId, currentAdviserId) {
    const displayName = strand ? `${gradeLevel} - ${strand}` : gradeLevel;
    document.getElementById('displayClassName').innerText = displayName;
    document.getElementById('targetGradeLevel').value = gradeLevel;
    document.getElementById('targetStrand').value = strand;
    document.getElementById('existingClassId').value = existingClassId || '';
    document.getElementById('adviserId').value = currentAdviserId || '';
    document.getElementById('adviserModal').classList.remove('hidden');
}

function closeAdviserModal() {
    document.getElementById('adviserModal').classList.add('hidden');
}

async function saveAdviser() {
    const gradeLevel = document.getElementById('targetGradeLevel').value;
    const strand = document.getElementById('targetStrand').value || null;
    const existingId = document.getElementById('existingClassId').value;
    const adviserId = document.getElementById('adviserId').value;
    
    if (!adviserId) {
        showNotification('Please select a teacher from the list.', 'error');
        return;
    }

    const payload = {
        grade_level: gradeLevel,
        section_name: strand ? strand : gradeLevel, 
        strand: strand,
        adviser_id: parseInt(adviserId),
        school_year: '2025-2026'
    };

    try {
        let error;
        if (existingId) {
            const res = await supabase.from('classes').update(payload).eq('id', existingId);
            error = res.error;
        } else {
            const res = await supabase.from('classes').insert([payload]);
            error = res.error;
        }
        if (error) throw error;

        showNotification('Adviser assigned successfully!', 'success');
        closeAdviserModal();
        loadAllClasses();
    } catch (err) {
        console.error(err);
        showNotification('Failed to assign adviser.', 'error');
    }
}

// === SUBJECT MANAGEMENT LOGIC ===
async function openSubjectLoad(id, sectionDisplay) {
    currentOpenClass = id;
    document.getElementById('subjectLoadTitle').innerText = `${sectionDisplay} Subjects`;
    document.getElementById('subjectLoadModal').classList.remove('hidden');
    loadSubjectList(id);
}

function closeSubjectLoadModal() { 
    document.getElementById('subjectLoadModal').classList.add('hidden'); 
}

function openAddSubjectModal() { 
    document.getElementById('addSubjectModal').classList.remove('hidden'); 
}

function closeAddSubjectModal() { 
    document.getElementById('addSubjectModal').classList.add('hidden'); 
}

async function loadSubjectList(classId) {
    const container = document.getElementById('subjectList');
    container.innerHTML = '<p class="text-center text-gray-400 py-4">Loading subjects...</p>';
    try {
        const { data, error } = await supabase.from('subject_loads').select('*, teachers(full_name)').eq('class_id', classId);
        if (error) throw error;
        
        container.innerHTML = data?.map(s => {
            const daysDisplay = s.schedule_days || 'No days set';
            
            return `
            <div class="flex justify-between items-center p-4 bg-white border border-gray-100 rounded-xl mb-2 hover:border-violet-200 transition-all">
                <div>
                    <div class="flex items-center gap-2">
                        <p class="font-black text-gray-800 text-lg leading-none">${s.subject_name}</p>
                        <span class="px-2 py-0.5 bg-violet-50 text-violet-600 text-[9px] font-black uppercase tracking-widest rounded-md border border-violet-100">📅 ${daysDisplay}</span>
                    </div>
                    <p class="text-xs text-gray-500 font-bold uppercase mt-1 flex items-center gap-1">
                        <i data-lucide="user" class="w-3 h-3"></i> ${s.teachers?.full_name || 'No Teacher'}
                    </p>
                </div>
                <div class="flex gap-2">
                    <button onclick="deleteSubject(${s.id})" class="p-2.5 text-gray-400 hover:text-red-500 bg-gray-50 rounded-xl hover:bg-red-50 transition-all" title="Remove Subject"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            </div>`;
        }).join('') || '<p class="text-center text-gray-400 py-4 italic">No subjects assigned yet.</p>';
        lucide.createIcons();
    } catch (err) {
        console.error("Error loading subjects:", err);
        container.innerHTML = '<p class="text-center text-red-500 py-4">Error loading subjects</p>';
    }
}

// Open edit subject modal - UPDATED: Removed time parameters for asynchronous model
function openEditSubject(subjectId, subjectName, teacherId, days) {
    // Populate teacher dropdown
    const teacherSelect = document.getElementById('editSubjectTeacherId');
    teacherSelect.innerHTML = '<option value="">Select Teacher...</option>' + 
        teachers.map(t => `<option value="${t.id}">${t.full_name}</option>`).join('');
    
    document.getElementById('editSubjectId').value = subjectId;
    document.getElementById('editSubjectName').value = subjectName;
    document.getElementById('editSubjectTeacherId').value = teacherId || '';
    
    // Set days
    if (days) {
        document.querySelectorAll('.edit-day-checkbox').forEach(cb => {
            cb.checked = days.split(',').includes(cb.value);
        });
    }
    
    document.getElementById('editSubjectModal').classList.remove('hidden');
}

function closeEditSubjectModal() {
    document.getElementById('editSubjectModal').classList.add('hidden');
}

async function saveEditSubject() {
    const subjectId = document.getElementById('editSubjectId').value;
    const subjectName = document.getElementById('editSubjectName').value;
    const teacherId = document.getElementById('editSubjectTeacherId').value;
    
    const dayCheckboxes = document.querySelectorAll('.edit-day-checkbox:checked');
    const days = Array.from(dayCheckboxes).map(cb => cb.value).join(',');
    
    // UPDATED: Time fields nullified for asynchronous logic
    const payload = {
        subject_name: subjectName,
        teacher_id: teacherId ? parseInt(teacherId) : null,
        schedule_time_start: null,
        schedule_time_end: null,
        schedule_days: days || null
    };
    
    const { error } = await supabase.from('subject_loads').update(payload).eq('id', subjectId);
    if (error) {
        showNotification(error.message, "error");
    } else {
        closeEditSubjectModal();
        loadSubjectList(currentOpenClass);
        showNotification("Subject updated successfully", "success");
    }
}

async function saveSubject() {
    const subjectName = document.getElementById('subjectName').value.trim();
    const teacherId = document.getElementById('subjectTeacherId').value;
    
    if (!subjectName || !teacherId) {
        showNotification('Please enter a subject name and select a teacher.', 'error');
        return;
    }
    
    const dayCheckboxes = document.querySelectorAll('.day-checkbox:checked');
    const days = Array.from(dayCheckboxes).map(cb => cb.value).join(',');
    if (!days) return showNotification('Please select at least one day.', 'error');
    
    const payload = {
        class_id: currentOpenClass,
        subject_name: subjectName,
        teacher_id: teacherId,
        schedule_time_start: null, // Nullified for asynchronous logic
        schedule_time_end: null,   // Nullified for asynchronous logic
        schedule_days: days
    };
    
    try {
        const { error } = await supabase.from('subject_loads').insert([payload]);
        if (error) throw error;
        
        closeAddSubjectModal(); 
        document.getElementById('subjectName').value = '';
        document.getElementById('subjectTeacherId').value = '';
        document.querySelectorAll('.day-checkbox').forEach(cb => cb.checked = false);
        
        loadSubjectList(currentOpenClass); 
        showNotification("Subject created successfully!", "success");
    } catch (err) {
        showNotification(err.message, "error");
    }
}

async function deleteSubject(id) {
    const { error } = await supabase.from('subject_loads').delete().eq('id', id);
    if(error) {
        showNotification(error.message, 'error');
    } else {
        loadSubjectList(currentOpenClass);
        showNotification('Subject removed', 'success');
    }
}

// Global functions for DOM access
window.closeAdviserModal = closeAdviserModal;
window.openAdviserModal = openAdviserModal;
window.saveAdviser = saveAdviser;
window.loadAllClasses = loadAllClasses;
window.openSubjectLoad = openSubjectLoad;
window.closeSubjectLoadModal = closeSubjectLoadModal;
window.deleteClass = deleteClass;
window.openEditSubject = openEditSubject;
window.closeEditSubjectModal = closeEditSubjectModal;
window.saveEditSubject = saveEditSubject;
window.openAddSubjectModal = openAddSubjectModal;
window.closeAddSubjectModal = closeAddSubjectModal;
window.saveSubject = saveSubject;
window.deleteSubject = deleteSubject;

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
    modal.className = 'fixed inset-0 bg-black/50 z-[90] flex items-center justify-center animate-fade-in';
    
    const iconColor = type === 'success' ? 'text-emerald-500' : type === 'error' ? 'text-red-500' : 'text-violet-600';
    const bgColor = type === 'success' ? 'bg-emerald-50' : type === 'error' ? 'bg-red-50' : 'bg-violet-50';
    const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info';

    modal.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 transform transition-all animate-fade-in-up"><div class="flex flex-col items-center text-center"><div class="w-16 h-16 ${bgColor} ${iconColor} rounded-full flex items-center justify-center mb-4"><i data-lucide="${iconName}" class="w-8 h-8"></i></div><h3 class="text-xl font-black text-gray-800 mb-2">${type === 'error' ? 'Error' : 'Success'}</h3><p class="text-sm text-gray-500 font-medium mb-6">${msg}</p><button id="notif-btn" class="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-gray-800 transition-all">Okay</button></div></div>`;
    
    document.body.appendChild(modal);
    document.getElementById('notif-btn').onclick = () => { modal.remove(); if(callback) callback(); };
    if(window.lucide) lucide.createIcons();
}