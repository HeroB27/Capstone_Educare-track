// Real-time Homeroom Attendance with Gate Status Integration

// FIX: Add currentUser reference to prevent ReferenceError
// This ensures the variable is available even if loaded before teacher-core.js
var currentUser = typeof checkSession !== 'undefined' ? checkSession('teachers') : null;

// Redirect if not logged in
if (!currentUser) {
    window.location.href = '../index.html';
}

// Store teacher's homeroom student IDs for real-time filtering
let myHomeroomStudentIds = [];
let myHomeroomClassId = null;
let homeroomStudents = [];
let filteredStudents = [];

// FIXED: Store ALL attendance records as array instead of overwriting
// This prevents the "Double Identity" bug where gate attendance gets overwritten by subject teacher attendance
let todayAttendance = {}; // Now stores array of records per student_id
let todayClinicVisits = {};

// THE PARANOIA SHIELD: Debounce timer for real-time updates
let refreshTimeout;

// Real-time subscription channel reference for cleanup
let attendanceSubscription = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Subscribe to real-time attendance updates
    // Note: We set up subscription first, then load students to populate IDs
    setupRealTimeSubscription();
    
    // Load students (this will populate myHomeroomStudentIds)
    await loadHomeroomStudents();
});

// Set up real-time subscription for attendance changes
function setupRealTimeSubscription() {
    if (!supabase) return;
    
    // FIX: Listen to the correct local date
    const localDate = new Date();
    localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
    const today = localDate.toISOString().split('T')[0];

    attendanceSubscription = supabase
        .channel('attendance-changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'attendance_logs',
            filter: `log_date=eq.${today}`
        }, (payload) => {
            // THE PARANOIA SHIELD: Debounced Refresh
            // Check if the affected student is in our homeroom class
            if (payload.new && myHomeroomStudentIds.includes(payload.new.student_id)) {
                // Clear the old timer
                clearTimeout(refreshTimeout);
                // Set a new timer. It only fires after 1.5 seconds of silence!
                refreshTimeout = setTimeout(() => {
                    loadHomeroomStudents();
                }, 1500);
            }
        })
        .subscribe();
    addSubscription(attendanceSubscription); // Register for cleanup
    
    // Cleanup on page unload to prevent memory leaks
    window.addEventListener('beforeunload', () => {
        // The cleanupAllSubscriptions function is more robust for SPA-like navigation.
        cleanupAllSubscriptions();
        clearTimeout(refreshTimeout);
    });
}

// Debounce timer for search
let searchDebounceTimer;

function debouncedSearch() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        filterStudents();
    }, 300);
}

// =============================================================================
// DATA LOADING - FIXED: Added the missing loadHomeroomStudents() function
// =============================================================================

/**
 * Load homeroom students - THE MISSING FUNCTION THAT WAS CAUSING REFERENCEERROR
 */
async function loadHomeroomStudents() {
    const tbody = document.getElementById('homeroom-student-list');
    
    try {
        // PATCH 3: Teacher Suspension Lock - Check for active suspensions
        const todayStr = getLocalISOString();
        
        const { data: suspension } = await supabase
            .from('holidays')
            .select('*')
            .eq('holiday_date', todayStr)
            .eq('is_suspended', true)
            .single();
        
        // Get teacher's homeroom class
        const { data: homeroom, error: homeroomError } = await supabase
            .from('classes')
            .select('id, grade_level, section_name')
            .eq('adviser_id', currentUser.id)
            .single();
        
        // If suspended and affects this teacher's grade, show warning and halt
        if (suspension && homeroom) {
            const isAllGrades = suspension.target_grades === 'All';
            const isMyGrade = suspension.target_grades?.includes(homeroom.grade_level);
            
            if (isAllGrades || isMyGrade) {
                if (tbody) {
                    tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center"><div class="bg-red-50 border border-red-200 rounded-2xl p-6"><i data-lucide="alert-circle" class="w-12 h-12 text-red-500 mx-auto mb-3"></i><h3 class="text-lg font-black text-red-700 mb-1">Classes Suspended Today</h3><p class="text-sm text-red-600 font-medium">${suspension.description}</p><p class="text-xs text-red-500 mt-2">Attendance tracking is disabled.</p></div></td></tr>`;
                }
                document.getElementById('homeroom-class-info').textContent = 'Classes Suspended';
                document.getElementById('student-count').textContent = '-- students';
                document.getElementById('attendance-rate').textContent = '--%';
                if (window.lucide) window.lucide.createIcons();
                return;
            }
        }
        
        if (homeroomError || !homeroom) {
            myHomeroomClassId = null;
            myHomeroomStudentIds = [];
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-12 text-center">
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
            document.getElementById('homeroom-class-info').textContent = 'No Class Assigned';
            document.getElementById('student-count').textContent = '0 students';
            document.getElementById('attendance-rate').textContent = '--%';
            lucide.createIcons();
            return;
        }
        
        myHomeroomClassId = homeroom.id;
        
        // Update class info in header
        const className = `${homeroom.grade_level} - ${homeroom.section_name}`;
        document.getElementById('homeroom-class-info').textContent = className;
        
        // Load students in this class
        const { data: students, error } = await supabase
            .from('students')
            .select('*')
            .eq('class_id', homeroom.id)
            .eq('status', 'Enrolled')
            .order('full_name');
        
        if (error) throw error;
        
        homeroomStudents = students || [];
        myHomeroomStudentIds = homeroomStudents.map(s => s.id);
        filteredStudents = [...homeroomStudents];
        
        // Pre-fetch today's attendance and clinic visits for all students
        await preFetchTodayData();
        
        // Update stats
        updateStats();
        
        // Render students
        renderStudents();
        
    } catch (error) {
        console.error('Error loading homeroom students:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center text-red-500">
                    Error loading students
                </td>
            </tr>
        `;
    }
}

/**
 * Pre-fetch today's attendance and clinic visits for all students
 * FIXED: Now stores ALL attendance records per student (not just the last one)
 * This fixes the "Double Identity" bug where gate attendance gets overwritten
 */
async function preFetchTodayData() {
    const today = new Date().toISOString().split('T')[0];
    const studentIds = homeroomStudents.map(s => s.id);
    
    if (studentIds.length === 0) return;
    
    // Fetch today's attendance
    const { data: attendance } = await supabase
        .from('attendance_logs')
        .select('student_id, status, time_in, source')
        .eq('log_date', today)
        .in('student_id', studentIds);
    
    // FIXED: Build attendance lookup - store ALL records as array per student_id
    // This preserves both gate attendance AND subject teacher attendance
    todayAttendance = {};
    attendance?.forEach(record => {
        if (!todayAttendance[record.student_id]) {
            todayAttendance[record.student_id] = [];
        }
        todayAttendance[record.student_id].push(record);
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
    const total = homeroomStudents.length;
    
    // Count from pre-fetched data (now using arrays)
    let present = 0;
    let absent = 0;
    
    homeroomStudents.forEach(student => {
        const records = todayAttendance[student.id];
        if (records && records.length > 0) {
            // Get the most recent record (last in array)
            const latestRecord = records[records.length - 1];
            if (latestRecord.status === 'On Time' || latestRecord.status === 'Excused') {
                present++;
            } else if (latestRecord.status === 'Absent') {
                absent++;
            }
        }
    });
    
    // For absent, we need to check which students don't have any record
    const attendedIds = new Set(Object.keys(todayAttendance));
    absent = homeroomStudents.filter(s => !attendedIds.has(String(s.id))).length;
    
    // Count students in clinic from pre-fetched data
    const inClinic = Object.keys(todayClinicVisits).length;
    
    // Calculate attendance rate
    const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0;
    
    // Update DOM
    document.getElementById('student-count').textContent = `${total} students`;
    document.getElementById('attendance-rate').textContent = `${attendanceRate}%`;
    
    return { total, present, absent, inClinic, attendanceRate };
}

/**
 * Render students to table
 */
function renderStudents() {
    const tbody = document.getElementById('homeroom-student-list');
    
    if (filteredStudents.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center">
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
    
    tbody.innerHTML = filteredStudents.map((student) => {
        const records = todayAttendance[student.id];
        const latestRecord = records && records.length > 0 ? records[records.length - 1] : null;
        
        return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4">
                    <p class="text-sm text-gray-600">${student.student_id_text || 'N/A'}</p>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center text-primary-600 font-bold">
                            ${student.full_name?.charAt(0) || '?'}
                        </div>
                        <p class="font-medium text-gray-800">${escapeHtml(student.full_name)}</p>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <p class="text-sm text-gray-600">${student.lrn || 'N/A'}</p>
                </td>
                <td class="px-6 py-4">
                    <p class="text-sm text-gray-600">${latestRecord?.time_in || '--:--'}</p>
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
        `;
    }).join('');
    
    lucide.createIcons();
}

/**
 * Get status badge for student (synchronous - uses pre-fetched data)
 * FIXED: Now handles multiple attendance records
 */
function getStatusBadge(studentId) {
    // Check clinic visits first (from pre-fetched data)
    if (todayClinicVisits[studentId]) {
        return '<span class="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">In Clinic</span>';
    }
    
    // Check attendance (from pre-fetched data - now array)
    const records = todayAttendance[studentId];
    
    if (!records || records.length === 0) {
        return '<span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">No Record</span>';
    }
    
    // Get the most recent record
    const latestRecord = records[records.length - 1];
    const status = latestRecord.status;
    
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

// =============================================================================
// SEARCH & FILTER
// =============================================================================

/**
 * Filter students based on search query
 */
function filterStudents() {
    const searchInput = document.getElementById('student-search');
    const query = searchInput?.value || '';
    
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

// =============================================================================
// STUDENT DETAILS - Added from teacher-homeroomlist.js
// =============================================================================

/**
 * View student details
 */
async function viewStudentDetails(studentId) {
    const student = homeroomStudents.find(s => s.id === studentId);
    if (!student) return;
    
    // For now, show a simple alert. Could be enhanced with a modal.
    const records = todayAttendance[studentId];
    const latestRecord = records && records.length > 0 ? records[records.length - 1] : null;
    
    const status = latestRecord?.status || 'No Record';
    const timeIn = latestRecord?.time_in || '--:--';
    
    alert(`Student: ${student.full_name}\nID: ${student.student_id_text}\nStatus: ${status}\nTime In: ${timeIn}`);
}

/**
 * View student attendance history
 */
async function viewAttendance(studentId) {
    // Could navigate to attendance page or show modal
    window.location.href = `teacher-data-analytics.html?student=${studentId}`;
}

// =============================================================================
// EXPORT - Added from teacher-homeroomlist.js
// =============================================================================

/**
 * Export student list to CSV
 */
function printHomeroomList() {
    window.print();
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
