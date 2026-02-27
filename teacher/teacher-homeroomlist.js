// teacher/teacher-homeroomlist.js

// ============================================================================
// TEACHER HOMEROOM LIST - JavaScript Logic
// ============================================================================
// Features: View homeroom student roster, search, export, student details
// ============================================================================

// Session Check
// currentUser is now global in teacher-core.js

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================
let homeroomStudents = [];
let filteredStudents = [];
let todayAttendance = {}; // Pre-fetched attendance data for all students
let todayClinicVisits = {}; // Pre-fetched clinic visit data for all students

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    if (currentUser) {
        // Set teacher name (only header element exists)
        const headerName = document.getElementById('teacher-name');
        if (headerName) headerName.textContent = currentUser.full_name || 'Teacher';
        
        // Load homeroom class info
        await loadHomeroomClass();
        await loadStudents();
    }
});

// ============================================================================
// DATA LOADING
// ============================================================================

/**
 * Load homeroom class information
 */
async function loadHomeroomClass() {
    try {
        const { data: homeroom, error } = await supabase
            .from('classes')
            .select(`
                *,
                teachers(full_name)
            `)
            .eq('adviser_id', currentUser.id)
            .single();
        
        if (error || !homeroom) {
            document.getElementById('class-name').textContent = 'No Homeroom Class';
            document.getElementById('student-count').textContent = '0 students';
            return;
        }
        
        // Update class info
        const className = `${homeroom.grade_level} - ${homeroom.section_name}`;
        document.getElementById('class-name').textContent = className;
        
    } catch (error) {
        console.error('Error loading homeroom class:', error);
    }
}

/**
 * Load students in homeroom class
 */
async function loadStudents() {
    const tbody = document.getElementById('student-list');
    
    try {
        // Get teacher's homeroom class
        const { data: homeroom, error: homeroomError } = await supabase
            .from('classes')
            .select('id, grade_level, section_name')
            .eq('adviser_id', currentUser.id)
            .single();
        
        if (homeroomError || !homeroom) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-6 py-12 text-center">
                        <div class="flex flex-col items-center">
                            <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                <i data-lucide="users" class="w-8 h-8 text-gray-400"></i>
                            </div>
                            <p class="text-gray-500">No homeroom class assigned</p>
                            <p class="text-sm text-gray-400 mt-1">Contact administrator to assign a homeroom class</p>
                        </div>
                    </td>
                </tr>
            `;
            lucide.createIcons();
            return;
        }
        
        // Load students in this class
        const { data: students, error } = await supabase
            .from('students')
            .select(`
                *,
                classes!inner(grade_level, section_name)
            `)
            .eq('class_id', homeroom.id)
            .eq('is_active', true)
            .order('full_name');
        
        if (error) throw error;
        
        homeroomStudents = students || [];
        filteredStudents = [...homeroomStudents];
        
        // Pre-fetch today's attendance and clinic visits for all students
        await preFetchTodayData();
        
        // Update stats
        updateStats();
        
        // Render students
        renderStudents();
        
    } catch (error) {
        console.error('Error loading students:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-12 text-center text-red-500">
                    Error loading students
                </td>
            </tr>
        `;
    }
}

/**
 * Pre-fetch today's attendance and clinic visits for all students
 * This improves performance by doing a single query instead of N+1 queries
 */
async function preFetchTodayData() {
    const today = new Date().toISOString().split('T')[0];
    const studentIds = homeroomStudents.map(s => s.id);
    
    if (studentIds.length === 0) return;
    
    // Fetch today's attendance
    const { data: attendance } = await supabase
        .from('attendance_logs')
        .select('student_id, status, time_in')
        .eq('log_date', today)
        .in('student_id', studentIds);
    
    // Build attendance lookup
    attendance?.forEach(record => {
        todayAttendance[record.student_id] = record;
    });
    
    // Fetch today's clinic visits (status = 'Checked In' and no time_out)
    const { data: visits } = await supabase
        .from('clinic_visits')
        .select('student_id, status')
        .in('student_id', studentIds)
        .is('time_out', null)
        .in('status', ['Pending', 'Checked In', 'Approved']);
    
    // Build clinic visits lookup
    visits?.forEach(visit => {
        todayClinicVisits[visit.student_id] = visit;
    });
}

/**
 * Update statistics
 */
async function updateStats() {
    const today = new Date().toISOString().split('T')[0];
    
    const total = homeroomStudents.length;
    
    // Count from pre-fetched data
    let present = 0;
    let absent = 0;
    
    homeroomStudents.forEach(student => {
        const att = todayAttendance[student.id];
        if (att && (att.status === 'On Time' || att.status === 'Excused')) {
            present++;
        }
    });
    
    // For absent, we need to check which students don't have any record
    // or have 'Absent' status
    const attendedIds = new Set(Object.keys(todayAttendance));
    absent = homeroomStudents.filter(s => !attendedIds.has(String(s.id))).length;
    
    // Count students in clinic from pre-fetched data
    const inClinic = Object.keys(todayClinicVisits).length;
    
    // Update DOM
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-present').textContent = present;
    document.getElementById('stat-absent').textContent = absent;
    document.getElementById('stat-clinic').textContent = inClinic;
    document.getElementById('student-count').textContent = `${total} students`;
}

/**
 * Render students to table
 */
function renderStudents() {
    const tbody = document.getElementById('student-list');
    
    if (filteredStudents.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-12 text-center">
                    <div class="flex flex-col items-center">
                        <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <i data-lucide="users" class="w-8 h-8 text-gray-400"></i>
                        </div>
                        <p class="text-gray-500">No students found</p>
                    </div>
                </td>
            </tr>
        `;
        lucide.createIcons();
        return;
    }
    
    tbody.innerHTML = filteredStudents.map((student, index) => `
        <tr class="hover:bg-gray-50 transition-colors">
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center text-primary-600 font-bold">
                        ${student.full_name?.charAt(0) || '?'}
                    </div>
                    <div>
                        <p class="font-medium text-gray-800">${escapeHtml(student.full_name)}</p>
                        <p class="text-sm text-gray-500">${student.classes?.grade_level || ''} ${student.classes?.section_name || ''}</p>
                    </div>
                </div>
            </td>
            <td class="px-6 py-4">
                <p class="text-sm text-gray-600">${student.student_id_text || 'N/A'}</p>
            </td>
            <td class="px-6 py-4">
                <p class="text-sm text-gray-600 capitalize">${student.gender || '-'}</p>
            </td>
            <td class="px-6 py-4">
                ${getStatusBadge(student.id)}
            </td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-2">
                    <button onclick="viewStudentDetails('${student.id}')" class="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="View Details">
                        <i data-lucide="eye" class="w-4 h-4"></i>
                    </button>
                    <button onclick="viewAttendance('${student.id}')" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="View Attendance">
                        <i data-lucide="calendar" class="w-4 h-4"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
    
    lucide.createIcons();
}

/**
 * Get status badge for student (synchronous - uses pre-fetched data)
 */
function getStatusBadge(studentId) {
    // Check clinic visits first (from pre-fetched data)
    if (todayClinicVisits[studentId]) {
        return '<span class="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">In Clinic</span>';
    }
    
    // Check attendance (from pre-fetched data)
    const att = todayAttendance[studentId];
    
    if (!att) {
        return '<span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">No Record</span>';
    }
    
    const status = att.status;
    
    if (status === 'On Time') {
        return '<span class="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-full font-medium">Present</span>';
    } else if (status === 'Absent') {
        return '<span class="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">Absent</span>';
    } else if (status === 'Late') {
        return '<span class="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">Late</span>';
    } else if (status === 'Excused') {
        return '<span class="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">Excused</span>';
    }
    
    return '<span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">No Record</span>';
}

// ============================================================================
// SEARCH & FILTER
// ============================================================================

/**
 * Search students
 */
function searchStudents(query) {
    if (!query || query.length < 2) {
        filteredStudents = [...homeroomStudents];
    } else {
        const lowerQuery = query.toLowerCase();
        filteredStudents = homeroomStudents.filter(student => 
            student.full_name?.toLowerCase().includes(lowerQuery) ||
            student.student_id_text?.toLowerCase().includes(lowerQuery)
        );
    }
    
    renderStudents();
}

/**
 * Sort students by name
 */
function sortByName() {
    filteredStudents.sort((a, b) => {
        return a.full_name?.localeCompare(b.full_name) || 0;
    });
    renderStudents();
}

// ============================================================================
// STUDENT DETAILS
// ============================================================================

/**
 * View student details
 */
async function viewStudentDetails(studentId) {
    const student = homeroomStudents.find(s => s.id === studentId);
    if (!student) return;
    
    const modal = document.getElementById('student-modal');
    const modalContent = document.getElementById('modal-content');
    
    // Get additional info
    const { data: attendanceStats } = await supabase
        .from('attendance_logs')
        .select('status')
        .eq('student_id', studentId);
    
    const presentCount = attendanceStats?.filter(a => a.status === 'On Time' || a.status === 'Excused').length || 0;
    const absentCount = attendanceStats?.filter(a => a.status === 'Absent').length || 0;
    const lateCount = attendanceStats?.filter(a => a.status === 'Late').length || 0;
    const totalDays = attendanceStats?.length || 1;
    const attendanceRate = Math.round((presentCount / totalDays) * 100);
    
    modalContent.innerHTML = `
        <div class="space-y-4">
            <div class="flex items-center gap-4">
                <div class="w-16 h-16 bg-gradient-to-br from-primary-100 to-primary-200 rounded-2xl flex items-center justify-center text-primary-600 text-xl font-bold">
                    ${student.full_name?.charAt(0) || '?'}
                </div>
                <div>
                    <h4 class="text-xl font-bold text-gray-800">${escapeHtml(student.full_name)}</h4>
                    <p class="text-sm text-gray-500">${student.classes?.grade_level || ''} ${student.classes?.section_name || ''}</p>
                </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
                <div class="p-4 bg-gray-50 rounded-xl">
                    <p class="text-sm text-gray-500">Student ID</p>
                    <p class="font-semibold text-gray-800">${student.student_id_text || 'N/A'}</p>
                </div>
                <div class="p-4 bg-gray-50 rounded-xl">
                    <p class="text-sm text-gray-500">LRN</p>
                    <p class="font-semibold text-gray-800">${student.lrn || 'N/A'}</p>
                </div>
                <div class="p-4 bg-gray-50 rounded-xl">
                    <p class="text-sm text-gray-500">Gender</p>
                    <p class="font-semibold text-gray-800 capitalize">${student.gender || 'N/A'}</p>
                </div>
                <div class="p-4 bg-gray-50 rounded-xl">
                    <p class="text-sm text-gray-500">Birthdate</p>
                    <p class="font-semibold text-gray-800">${student.birthdate || 'N/A'}</p>
                </div>
            </div>
            
            <div class="p-4 bg-gray-50 rounded-xl">
                <p class="text-sm text-gray-500 mb-2">Attendance Summary</p>
                <div class="grid grid-cols-3 gap-2 text-center">
                    <div>
                        <p class="text-lg font-bold text-emerald-600">${presentCount}</p>
                        <p class="text-xs text-gray-500">Present</p>
                    </div>
                    <div>
                        <p class="text-lg font-bold text-red-600">${absentCount}</p>
                        <p class="text-xs text-gray-500">Absent</p>
                    </div>
                    <div>
                        <p class="text-lg font-bold text-amber-600">${lateCount}</p>
                        <p class="text-xs text-gray-500">Late</p>
                    </div>
                </div>
                <div class="mt-3 pt-3 border-t border-gray-200">
                    <div class="flex items-center justify-between text-sm">
                        <span class="text-gray-500">Attendance Rate</span>
                        <span class="font-semibold text-gray-800">${attendanceRate}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div class="bg-primary-500 h-2 rounded-full" style="width: ${attendanceRate}%"></div>
                    </div>
                </div>
            </div>
            
            ${student.contact_number ? `
                <div class="flex items-center gap-2 p-4 bg-gray-50 rounded-xl">
                    <i data-lucide="phone" class="w-5 h-5 text-gray-400"></i>
                    <span class="text-gray-700">${student.contact_number}</span>
                </div>
            ` : ''}
            
            ${student.address ? `
                <div class="flex items-start gap-2 p-4 bg-gray-50 rounded-xl">
                    <i data-lucide="map-pin" class="w-5 h-5 text-gray-400 mt-0.5"></i>
                    <span class="text-gray-700 text-sm">${escapeHtml(student.address)}</span>
                </div>
            ` : ''}
        </div>
    `;
    
    modal.classList.remove('hidden');
    lucide.createIcons();
}

/**
 * Close student modal
 */
function closeStudentModal() {
    document.getElementById('student-modal').classList.add('hidden');
}

/**
 * View student attendance history
 */
async function viewAttendance(studentId) {
    // Could navigate to attendance page or show modal
    window.location.href = `teacher-data-analytics.html?student=${studentId}`;
}

// ============================================================================
// EXPORT
// ============================================================================

/**
 * Export student list to CSV
 */
function exportStudentList() {
    if (filteredStudents.length === 0) {
        showNotification('No students to export', 'error');
        return;
    }
    
    const headers = ['Name', 'Student ID', 'Gender', 'LRN', 'Class'];
    const rows = filteredStudents.map(student => [
        student.full_name,
        student.student_id_text || '',
        student.gender || '',
        student.lrn || '',
        `${student.classes?.grade_level || ''} ${student.classes?.section_name || ''}`
    ]);
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `homeroom-students-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Close modal on outside click
document.addEventListener('click', (e) => {
    const modal = document.getElementById('student-modal');
    if (modal && !modal.classList.contains('hidden') && e.target === modal) {
        closeStudentModal();
    }
});
