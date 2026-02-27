// admin/admin-class-management.js
let teachers = [];
let selectedGrade = 'Kinder';
let currentOpenClass = null;

// Grade levels array
const GRADE_LEVELS = ['Kinder', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12'];

// Check if grade is SHS (G11 or G12)
function isSHSGrade(grade) {
    return grade === 'G11' || grade === 'G12';
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!checkSession('admins')) return;
    await loadTeachers();
    renderGradeTabs();
    loadClasses(selectedGrade);
    injectStyles();
});

async function loadTeachers() {
    const { data } = await supabase.from('teachers').select('id, full_name').eq('is_active', true).order('full_name');
    teachers = data || [];
    const select = document.getElementById('adviserId');
    const subjSelect = document.getElementById('subjectTeacherId');
    const opts = '<option value="">Select Teacher</option>' + teachers.map(t => `<option value="${t.id}">${t.full_name}</option>`).join('');
    if (select) select.innerHTML = opts;
    if (subjSelect) subjSelect.innerHTML = opts;
}

async function loadClasses(grade) {
    selectedGrade = grade; 
    renderGradeTabs();
    const grid = document.getElementById('classGrid');
    grid.innerHTML = '<div class="col-span-full py-12 text-center text-gray-400 italic">Loading rosters...</div>';
    const { data } = await supabase.from('classes').select('*, teachers(full_name), students(count)').eq('grade_level', grade);
    
    // Display logic: For non-SHS show grade only, for SHS show grade + strand
    grid.innerHTML = data?.length ? data.map(c => {
        const isSHS = isSHSGrade(c.grade_level);
        const displayName = isSHS 
            ? `${c.grade_level} – ${c.strand || 'No Strand'}` 
            : c.grade_level;
        
        // For non-SHS, section_name is stored as the grade; for SHS use strand or section
        const sectionDisplay = isSHS ? (c.strand || c.section_name || 'N/A') : c.grade_level;
        
        return `
        <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
            <h3 class="text-xl font-black text-gray-900 leading-tight">${displayName}</h3>
            <p class="text-xs font-bold text-violet-600 uppercase mt-1">${c.teachers?.full_name || 'No Adviser'}</p>
            <div class="flex gap-2 mt-4 pt-4 border-t border-gray-50">
                <button onclick="openSubjectLoad(${c.id}, '${sectionDisplay}')" class="flex-1 py-2 bg-gray-50 text-gray-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-violet-50 hover:text-violet-600">Manage Subjects</button>
                <button onclick="editClass(${c.id})" class="p-2 text-gray-300 hover:text-violet-500"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                <button onclick="deleteClass(${c.id}, ${c.students?.[0]?.count || 0})" class="p-2 text-gray-300 hover:text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        </div>`;
    }).join('') : '<div class="col-span-full py-12 text-center text-gray-400">No classes found.</div>';
    lucide.createIcons();
}

async function openSubjectLoad(id, section) {
    currentOpenClass = id;
    document.getElementById('subjectLoadTitle').innerText = `Subjects: ${section}`;
    document.getElementById('subjectLoadModal').classList.remove('hidden');
    loadSubjectList(id);
}

async function loadSubjectList(classId) {
    const { data } = await supabase.from('subject_loads').select('*, teachers(full_name)').eq('class_id', classId);
    document.getElementById('subjectList').innerHTML = data?.map(s => `
        <div class="flex justify-between items-center p-4 bg-white border rounded-xl mb-2">
            <div><p class="font-bold text-gray-800">${s.subject_name}</p><p class="text-xs text-violet-600 font-bold uppercase">${s.teachers?.full_name}</p></div>
            <button onclick="deleteSubject(${s.id})" class="text-gray-300 hover:text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>`).join('') || '';
    lucide.createIcons();
}

async function saveSubject() {
    const payload = { class_id: currentOpenClass, subject_name: document.getElementById('subjectName').value, teacher_id: document.getElementById('subjectTeacherId').value };
    const { error } = await supabase.from('subject_loads').insert([payload]);
    if (!error) { 
        closeAddSubjectModal(); 
        loadSubjectList(currentOpenClass); 
        showNotification("Subject added successfully", "success");
    } else {
        showNotification(error.message, "error");
    }
}

function renderGradeTabs() {
    document.getElementById('gradeTabs').innerHTML = GRADE_LEVELS.map(g => `<button onclick="loadClasses('${g}')" class="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${selectedGrade === g ? 'bg-violet-600 text-white shadow-lg' : 'bg-white text-gray-400 hover:bg-gray-50'}">${g}</button>`).join('');
}

// Populate grade dropdown with all grade levels
function populateGradeDropdown(selectedValue = '') {
    const select = document.getElementById('gradeLevel');
    const options = GRADE_LEVELS.map(g => `<option value="${g}" ${g === selectedValue ? 'selected' : ''}>${g}</option>`).join('');
    select.innerHTML = '<option value="">Select Grade Level</option>' + options;
}

// Toggle section/strand fields based on grade selection
function handleGradeChange() {
    const grade = document.getElementById('gradeLevel').value;
    const isSHS = isSHSGrade(grade);
    
    // Show/hide section field for non-SHS, hide for SHS
    document.getElementById('sectionField').classList.toggle('hidden', isSHS);
    // Show/hide strand field for SHS
    document.getElementById('strandField').classList.toggle('hidden', !isSHS);
    
    // Clear the hidden field values when grade changes
    document.getElementById('sectionName').value = '';
    document.getElementById('strandSelect').value = '';
}

// Open class modal - populate dropdowns and show/hide fields based on grade
function openClassModal(classData = null) {
    const modal = document.getElementById('classModal');
    const title = document.getElementById('classModalTitle');
    
    // Clear form
    document.getElementById('classId').value = '';
    document.getElementById('sectionName').value = '';
    document.getElementById('strandSelect').value = '';
    
    // Populate grade dropdown
    populateGradeDropdown(classData?.grade_level || '');
    
    // Attach grade change listener
    document.getElementById('gradeLevel').addEventListener('change', handleGradeChange);
    
    if (classData) {
        // Edit mode - populate existing data
        title.innerText = 'Edit Class';
        document.getElementById('classId').value = classData.id;
        document.getElementById('sectionName').value = classData.section_name || '';
        document.getElementById('strandSelect').value = classData.strand || '';
        document.getElementById('adviserId').value = classData.adviser_id || '';
        
        // Trigger grade change to show correct fields
        handleGradeChange();
    } else {
        // Create mode
        title.innerText = 'Register Class';
        // Default to selected grade tab
        const gradeSelect = document.getElementById('gradeLevel');
        if (selectedGrade) {
            gradeSelect.value = selectedGrade;
            handleGradeChange();
        }
    }
    
    modal.classList.remove('hidden');
}

// Edit class - fetch data and open modal
async function editClass(id) {
    const { data, error } = await supabase.from('classes').select('*').eq('id', id).single();
    if (error) {
        showNotification(error.message, 'error');
        return;
    }
    openClassModal(data);
}

// Save class - insert or update with duplicate checking
async function saveClass() {
    const id = document.getElementById('classId').value;
    const grade = document.getElementById('gradeLevel').value;
    
    if (!grade) {
        showNotification('Please select a grade level.', 'error');
        return;
    }
    
    const isSHS = isSHSGrade(grade);
    let sectionName = null;
    let strand = null;
    
    if (isSHS) {
        // For SHS, get strand
        strand = document.getElementById('strandSelect').value;
        if (!strand) {
            showNotification('Please select a strand for Senior High School.', 'error');
            return;
        }
        // Section name for SHS will be the strand
        sectionName = strand;
    } else {
        // For non-SHS, section name is the grade level
        sectionName = grade;
    }
    
    const adviserId = document.getElementById('adviserId').value;
    if (!adviserId) {
        showNotification('Please select a homeroom adviser.', 'error');
        return;
    }
    
    // Check for duplicates
    if (!id) {
        // Creating new class - check if exists
        let query = supabase.from('classes').select('id').eq('grade_level', grade);
        
        if (isSHS) {
            query = query.eq('strand', strand);
        }
        
        const { data: existing } = await query;
        
        if (existing && existing.length > 0) {
            if (isSHS) {
                showNotification(`A class for ${grade} - ${strand} already exists.`, 'error');
            } else {
                showNotification(`A class for ${grade} already exists. Each grade level can only have one class.`, 'error');
            }
            return;
        }
    }
    
    const payload = {
        grade_level: grade,
        section_name: sectionName,
        strand: isSHS ? strand : null,
        adviser_id: adviserId,
        school_year: '2025-2026'
    };
    
    let error;
    if (id) {
        // Update existing
        ({ error } = await supabase.from('classes').update(payload).eq('id', id));
    } else {
        // Insert new
        ({ error } = await supabase.from('classes').insert([payload]));
    }
    
    if (error) {
        showNotification(error.message, 'error');
    } else {
        showNotification(id ? 'Class updated successfully!' : 'Class created successfully!', 'success');
        closeClassModal();
        loadClasses(selectedGrade);
    }
}
function openAddSubjectModal() { document.getElementById('addSubjectModal').classList.remove('hidden'); }
function closeAddSubjectModal() { document.getElementById('addSubjectModal').classList.add('hidden'); }
function closeSubjectLoadModal() { document.getElementById('subjectLoadModal').classList.add('hidden'); }

async function deleteSubject(id) {
    if(confirm('Remove this subject?')) {
        const { error } = await supabase.from('subject_loads').delete().eq('id', id);
        if(error) showNotification(error.message, 'error');
        else {
            loadSubjectList(currentOpenClass);
            showNotification('Subject removed', 'success');
        }
    }
}

async function deleteClass(id, cnt) { 
    if(cnt>0) {
        showNotification('Cannot delete class: Reassign students first!', 'error'); 
        return;
    } 
    
    // Check for subjects associated with this class
    const { count, error: countErr } = await supabase.from('subject_loads').select('*', { count: 'exact', head: true }).eq('class_id', id);
    
    let confirmMsg = 'Are you sure you want to delete this class?';
    if (count > 0) confirmMsg = `This class has ${count} subjects assigned. Deleting it will remove these subjects. Continue?`;

    if(confirm(confirmMsg)) {
        // Delete subjects first if they exist (manual cascade for safety)
        if (count > 0) await supabase.from('subject_loads').delete().eq('class_id', id);

        const { error } = await supabase.from('classes').delete().eq('id',id); 
        if (error) showNotification(error.message, 'error');
        else {
            loadClasses(selectedGrade);
            showNotification('Class deleted successfully', 'success');
        }
    } 
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