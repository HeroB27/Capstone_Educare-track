// admin/admin-class-management.js

// 1. Session Check
// currentUser is now global in admin-core.js

// 2. State Variables
let classes = [];
let teachers = [];
let selectedGrade = null;
let selectedClass = null;

// Grade Levels
const gradeLevels = [
    'Kinder', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6',
    'G7', 'G8', 'G9', 'G10',
    'G11-STEM', 'G11-ABM', 'G11-HUMSS',
    'G12-STEM', 'G12-ABM', 'G12-HUMSS'
];

// 3. Initialize Page
document.addEventListener('DOMContentLoaded', () => {
    if (currentUser) {
        document.getElementById('admin-name').innerText = currentUser.full_name || 'Admin';
    }
    
    loadTeachers();
    renderGradeTabs();
});

// 4. Load Teachers for Dropdowns
async function loadTeachers() {
    try {
        const { data, error } = await supabase
            .from('teachers')
            .select('id, full_name, teacher_id_text')
            .eq('is_active', true)
            .order('full_name');
        
        if (error) throw error;
        
        teachers = data || [];
        populateAdviserDropdown();
        populateSubjectTeacherDropdown();
        
    } catch (error) {
        console.error('Error loading teachers:', error);
    }
}

// 5. Populate Adviser Dropdown
function populateAdviserDropdown() {
    const select = document.getElementById('classAdviser');
    select.innerHTML = '<option value="">Select a teacher...</option>';
    
    teachers.forEach(t => {
        const option = document.createElement('option');
        option.value = t.id;
        option.textContent = t.full_name + ' (' + t.teacher_id_text + ')';
        select.appendChild(option);
    });
}

// 6. Populate Subject Teacher Dropdown
function populateSubjectTeacherDropdown() {
    const select = document.getElementById('subjectTeacher');
    select.innerHTML = '<option value="">Select a teacher...</option>';
    
    teachers.forEach(t => {
        const option = document.createElement('option');
        option.value = t.id;
        option.textContent = t.full_name;
        select.appendChild(option);
    });
}

// 7. Render Grade Level Tabs
function renderGradeTabs() {
    const tabsContainer = document.getElementById('gradeLevelTabs');
    tabsContainer.innerHTML = '';
    
    gradeLevels.forEach((grade, index) => {
        const tab = document.createElement('button');
        tab.className = 'px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap ' + 
            (index === 0 ? 'border-violet-500 text-violet-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300');
        tab.innerText = grade.replace('G11-', 'G11 ').replace('G12-', 'G12 ');
        tab.onclick = () => selectGrade(grade, tab);
        tabsContainer.appendChild(tab);
    });
    
    // Select first grade by default
    if (gradeLevels.length > 0) {
        selectGrade(gradeLevels[0], tabsContainer.children[0]);
    }
}

// 8. Select Grade Level
async function selectGrade(grade, tabElement) {
    selectedGrade = grade;
    
    // Update tab styling
    const tabs = document.getElementById('gradeLevelTabs').querySelectorAll('button');
    tabs.forEach(t => {
        t.className = 'px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300';
    });
    tabElement.className = 'px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap border-violet-500 text-violet-600';
    
    // Update title
    const displayGrade = grade.replace('G11-', 'Grade 11 ').replace('G12-', 'Grade 12 ');
    document.getElementById('currentGradeTitle').innerText = displayGrade + ' Classes';
    document.getElementById('createClassBtn').classList.remove('hidden');
    
    // Load classes for this grade
    await loadClasses(grade);
}

// 9. Load Classes for Grade
async function loadClasses(grade) {
    try {
        let query = supabase
            .from('classes')
            .select('*, teachers(full_name, teacher_id_text)')
            .eq('grade_level', grade);
        
        // Add strand filter for SHS
        if (grade.includes('STEM')) {
            query = query.eq('strand', 'STEM');
        } else if (grade.includes('ABM')) {
            query = query.eq('strand', 'ABM');
        } else if (grade.includes('HUMSS')) {
            query = query.eq('strand', 'HUMSS');
        } else {
            query = query.is('strand', null);
        }
        
        const { data, error } = await query.order('section_name');
        
        if (error) throw error;
        
        classes = data || [];
        renderClassesList();
        
    } catch (error) {
        console.error('Error loading classes:', error);
        document.getElementById('classesList').innerHTML = '<p class="text-red-500">Error loading classes</p>';
    }
}

// 10. Render Classes List
function renderClassesList() {
    const container = document.getElementById('classesList');
    
    if (classes.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-8">No classes found for this grade level. Click "Create Class" to add one.</p>';
        return;
    }
    
    container.innerHTML = classes.map(cls => {
        const isSelected = selectedClass && selectedClass.id === cls.id;
        return `
            <div class="border rounded-lg p-4 cursor-pointer hover:bg-violet-50 transition ${isSelected ? 'bg-violet-100 border-violet-500' : 'bg-white'}" 
                 onclick="selectClass(${cls.id})">
                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-semibold text-lg">${cls.grade_level} - ${cls.section_name}</h4>
                        <p class="text-sm text-gray-600">
                            Adviser: ${cls.teachers ? cls.teachers.full_name : 'Not assigned'}
                            ${cls.room_number ? ' | Room: ' + cls.room_number : ''}
                        </p>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="text-right">
                            <span class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">${cls.school_year || '2025-2026'}</span>
                        </div>
                        <button onclick="event.stopPropagation(); deleteClass(${cls.id})" 
                                class="text-red-600 hover:text-red-800 p-2 ml-2" 
                                title="Delete Class">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 11. Select Class to View Subjects
async function selectClass(classId) {
    selectedClass = classes.find(c => c.id === classId);
    renderClassesList();
    await loadSubjectLoad(classId);
}

// 12. Load Subject Load for Class
async function loadSubjectLoad(classId) {
    try {
        const { data: subjects, error } = await supabase
            .from('subject_loads')
            .select('*, teachers(full_name)')
            .eq('class_id', classId)
            .order('schedule_time_start');
        
        if (error) throw error;
        
        renderSubjectLoadPanel(subjects || []);
        
    } catch (error) {
        console.error('Error loading subject load:', error);
        document.getElementById('subjectLoadPanel').innerHTML = '<p class="text-red-500">Error loading subjects</p>';
    }
}

// 13. Render Subject Load Panel
function renderSubjectLoadPanel(subjects) {
    const panel = document.getElementById('subjectLoadPanel');
    const title = document.getElementById('selectedClassTitle');
    
    if (!selectedClass) {
        panel.innerHTML = '<p class="text-gray-500 text-center py-4">Click on a class to manage subjects</p>';
        return;
    }
    
    title.innerText = selectedClass.grade_level + ' - ' + selectedClass.section_name + ' Subjects';
    
    if (subjects.length === 0) {
        panel.innerHTML = `
            <p class="text-gray-500 text-center py-4">No subjects assigned yet.</p>
            <button onclick="openAddSubjectModal(${selectedClass.id})" class="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg transition">
                + Add Subject
            </button>
        `;
        return;
    }
    
    panel.innerHTML = `
        <button onclick="openAddSubjectModal(${selectedClass.id})" class="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg transition mb-4">
            + Add Subject
        </button>
        <div class="space-y-3">
            ${subjects.map(s => `
                <div class="border rounded-lg p-3 bg-gray-50">
                    <div class="flex justify-between items-start">
                        <div>
                            <h5 class="font-semibold">${s.subject_name}</h5>
                            <p class="text-sm text-gray-600">${s.teachers ? s.teachers.full_name : 'Not assigned'}</p>
                            <p class="text-xs text-gray-500 mt-1">
                                ${s.schedule_days} | ${formatTime(s.schedule_time_start)} - ${formatTime(s.schedule_time_end)}
                            </p>
                        </div>
                        <button onclick="deleteSubject(${s.id})" class="text-red-600 hover:text-red-800 text-sm">Delete</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// 14. Format Time Helper
function formatTime(timeString) {
    if (!timeString) return '-';
    // Handle time format (could be "07:30:00" or "07:30")
    const parts = timeString.split(':');
    let hours = parseInt(parts[0]);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return hours + ':' + minutes + ' ' + ampm;
}

// ============ CREATE CLASS MODAL FUNCTIONS ============

// 15. Open Create Class Modal
function openCreateClassModal() {
    document.getElementById('classSection').value = '';
    document.getElementById('classRoom').value = '';
    document.getElementById('classStrand').value = '';
    document.getElementById('classAdviser').value = '';
    document.getElementById('createClassModal').classList.remove('hidden');
}

// 16. Close Create Class Modal
function closeCreateClassModal() {
    document.getElementById('createClassModal').classList.add('hidden');
}

// 17. Create Class
async function createClass() {
    const gradeLevel = document.getElementById('classGradeLevel').value;
    const sectionName = document.getElementById('classSection').value.trim();
    const rawAdviserId = document.getElementById('classAdviser').value;
    const roomNumber = document.getElementById('classRoom').value.trim();
    const strand = document.getElementById('classStrand').value;
    
    // Convert empty string to null to prevent Supabase Foreign Key crashes
    const safeAdviserId = rawAdviserId === "" ? null : rawAdviserId;
    
    // Validation
    if (!sectionName) {
        alert('Please fill in all required fields.');
        return;
    }
    
    // Determine strand based on grade level selection
    let classStrand = strand;
    if (gradeLevel.includes('STEM')) classStrand = 'STEM';
    else if (gradeLevel.includes('ABM')) classStrand = 'ABM';
    else if (gradeLevel.includes('HUMSS')) classStrand = 'HUMSS';
    
    try {
        const { error } = await supabase
            .from('classes')
            .insert({
                grade_level: gradeLevel,
                section_name: sectionName,
                strand: classStrand || null,
                adviser_id: safeAdviserId,
                room_number: roomNumber || null,
                school_year: '2025-2026'
            });
        
        if (error) throw error;
        
        alert('Class created successfully!');
        closeCreateClassModal();
        await loadClasses(selectedGrade);
        
    } catch (error) {
        console.error('Error creating class:', error);
        alert('Error creating class: ' + error.message);
    }
}

// ============ ADD SUBJECT MODAL FUNCTIONS ============

// 18. Open Add Subject Modal
function openAddSubjectModal(classId) {
    document.getElementById('subjectClassId').value = classId;
    document.getElementById('subjectName').value = '';
    document.getElementById('subjectTimeStart').value = '';
    document.getElementById('subjectTimeEnd').value = '';
    document.getElementById('subjectTeacher').value = '';
    
    // Clear checkboxes
    document.querySelectorAll('input[name="subjectDay"]').forEach(cb => cb.checked = false);
    
    document.getElementById('addSubjectModal').classList.remove('hidden');
}

// 19. Close Add Subject Modal
function closeAddSubjectModal() {
    document.getElementById('addSubjectModal').classList.add('hidden');
}

// 20. Add Subject (Cup Theory Implementation)
async function addSubject() {
    const classId = document.getElementById('subjectClassId').value;
    const subjectName = document.getElementById('subjectName').value.trim();
    const timeStart = document.getElementById('subjectTimeStart').value;
    const timeEnd = document.getElementById('subjectTimeEnd').value;
    const teacherId = document.getElementById('subjectTeacher').value;
    
    // Get selected days
    const days = [];
    document.querySelectorAll('input[name="subjectDay"]:checked').forEach(cb => {
        days.push(cb.value);
    });
    
    // Validation
    if (!subjectName || !timeStart || !timeEnd || !teacherId || days.length === 0) {
        alert('Please fill in all required fields.');
        return;
    }
    
    if (timeStart >= timeEnd) {
        alert('End time must be after start time.');
        return;
    }
    
    // CUP THEORY: Check for schedule conflicts
    // Each "cup" represents a time slot. No two subjects can occupy the same cup.
    const conflict = await checkScheduleConflict(classId, days, timeStart, timeEnd);
    if (conflict) {
        alert('Schedule Conflict Detected!\n\nThe proposed time slot conflicts with: ' + conflict.subject + 
              '\nDay: ' + conflict.days + '\nTime: ' + formatTime(conflict.start) + ' - ' + formatTime(conflict.end) +
              '\n\nPlease choose a different time or day.');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('subject_loads')
            .insert({
                subject_name: subjectName,
                class_id: classId,
                teacher_id: teacherId,
                schedule_time_start: timeStart,
                schedule_time_end: timeEnd,
                schedule_days: days.join(', ')
            });
        
        if (error) throw error;
        
        alert('Subject added successfully!');
        closeAddSubjectModal();
        await loadSubjectLoad(classId);
        
    } catch (error) {
        console.error('Error adding subject:', error);
        alert('Error adding subject: ' + error.message);
    }
}

// 21. Check Schedule Conflict (Cup Theory)
// This function checks if the proposed time slot conflicts with existing subjects
async function checkScheduleConflict(classId, days, timeStart, timeEnd) {
    try {
        const { data: existingSubjects, error } = await supabase
            .from('subject_loads')
            .select('*')
            .eq('class_id', classId);
        
        if (error) throw error;
        
        // Check each existing subject
        for (const subject of existingSubjects || []) {
            const existingDays = subject.schedule_days.split(', ');
            
            // Check if any day overlaps
            const hasDayOverlap = days.some(day => existingDays.includes(day));
            
            if (hasDayOverlap) {
                // Check if time overlaps
                // Overlap occurs if: (StartA < EndB) and (EndA > StartB)
                if (timeStart < subject.schedule_time_end && timeEnd > subject.schedule_time_start) {
                    return {
                        subject: subject.subject_name,
                        days: subject.schedule_days,
                        start: subject.schedule_time_start,
                        end: subject.schedule_time_end
                    };
                }
            }
        }
        
        return null; // No conflict
        
    } catch (error) {
        console.error('Error checking conflicts:', error);
        return null; // Assume no conflict on error
    }
}

// 22. Delete Subject
async function deleteSubject(subjectId) {
    if (!confirm('Are you sure you want to delete this subject?')) {
        return;
    }
    
    try {
        const { error } = await supabase
            .from('subject_loads')
            .delete()
            .eq('id', subjectId);
        
        if (error) throw error;
        
        if (selectedClass) {
            await loadSubjectLoad(selectedClass.id);
        }
        
    } catch (error) {
        console.error('Error deleting subject:', error);
        alert('Error deleting subject: ' + error.message);
    }
}

// ============ DELETE CLASS ============

// 23. Delete Class (with student check to prevent orphaned students)
// UPDATED: Added check for students before allowing delete
async function deleteClass(classId) {
    // First check if there are students assigned to this class
    const { count, error: countError } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('class_id', classId);
    
    if (countError) {
        console.error('Error checking students:', countError);
        alert('Error checking class students. Please try again.');
        return;
    }
    
    // Prevent deletion if there are students in the class
    if (count > 0) {
        alert(`Denied: You must transfer the ${count} student(s) out of this class before deleting it.`);
        return;
    }
    
    // Also check subject_loads for any subjects assigned
    const { count: subjectCount, error: subjectError } = await supabase
        .from('subject_loads')
        .select('*', { count: 'exact', head: true })
        .eq('class_id', classId);
    
    if (subjectError) {
        console.error('Error checking subjects:', subjectError);
    }
    
    if (subjectCount > 0) {
        if (!confirm(`Warning: This class has ${subjectCount} subject(s) assigned. Deleting will also remove all subject assignments. Continue?`)) {
            return;
        }
    }
    
    // Proceed with deletion
    if (!confirm('Are you sure you want to delete this class? This action cannot be undone.')) {
        return;
    }
    
    try {
        const { error } = await supabase
            .from('classes')
            .delete()
            .eq('id', classId);
        
        if (error) throw error;
        
        alert('Class deleted successfully!');
        
        // Refresh the class list
        selectedClass = null;
        await loadClasses(selectedGrade);
        
    } catch (error) {
        console.error('Error deleting class:', error);
        alert('Error deleting class: ' + error.message);
    }
}
