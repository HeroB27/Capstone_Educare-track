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

// ==========================================
// REAL-TIME HOMEROOM ENGINE
// ==========================================
function setupRealTimeSubscription() {
    if (attendanceSubscription) {
        supabase.removeChannel(attendanceSubscription);
    }
    
    attendanceSubscription = supabase.channel('homeroom-realtime-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, (payload) => {
            // Only trigger if the changed record belongs to a student currently in our homeroom list
            if (payload.new && myHomeroomStudentIds.includes(payload.new.student_id)) {
                
                // THE PARANOIA SHIELD: Debounce the reload to prevent screen flickering
                clearTimeout(refreshTimeout);
                refreshTimeout = setTimeout(() => {
                    // Show a tiny non-intrusive toast so the teacher knows the data is fresh
                    if (typeof showNotification === 'function') {
                        showNotification('Live gate scan received. Updating list...', 'info');
                    }
                    loadHomeroomStudents(); // Silently redraws the table
                }, 1000); // Wait 1 second after the last scan before redrawing
            }
        })
        .subscribe();
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
    
    // Fetch today's attendance (FIXED: Removed invalid 'source' column)
    const { data: attendance } = await supabase
        .from('attendance_logs')
        .select('id, student_id, status, time_in')
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
    
    // Fetch today's clinic visits (status = 'In Clinic' and no time_out)
    const { data: visits } = await supabase
        .from('clinic_visits')
        .select('student_id, status')
        .in('student_id', studentIds)
        .is('time_out', null)
        .in('status', ['In Clinic', 'Approved']);
    
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
                <td colspan="4" class="px-6 py-12 text-center text-gray-500 font-medium">No students found.</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = filteredStudents.map((student) => {
        const records = todayAttendance[student.id];
        const latestRecord = records && records.length > 0 ? records[records.length - 1] : null;
        
        const status = latestRecord?.status;
        const isPresent = status === 'On Time';
        const isLate = status === 'Late';
        const isAbsent = status === 'Absent';
        const isExcused = status === 'Excused';
        
        // Show raw gate tap time if it exists
        const timeInStr = latestRecord?.time_in ? new Date(latestRecord.time_in).toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'}) : '--:--';

        return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full overflow-hidden bg-gray-100 border border-gray-200 shrink-0 shadow-sm">
                            <img src="${student.profile_photo_url ? student.profile_photo_url : `https://ui-avatars.com/api/?name=${encodeURIComponent(student.full_name)}&background=f3f4f6&color=4b5563`}" alt="Photo" class="w-full h-full object-cover ${student.profile_photo_url ? 'object-top' : ''}">
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <p class="font-medium text-gray-800">${escapeHtml(student.full_name)}</p>
                                ${student.total_absences >= 10 ? `<span title="DepEd Warning: 10+ Absences" class="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600 animate-pulse"><i data-lucide="alert-triangle" class="w-3 h-3"></i></span>` : ''}
                            </div>
                            <p class="text-xs text-gray-500 font-mono">${student.student_id_text || 'N/A'}</p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <span class="text-sm font-bold text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded-md border border-gray-200">${timeInStr}</span>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-2">
                        <button onclick="verifyStudentAttendance('${student.id}', 'On Time')" 
                            class="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${isPresent ? 'bg-emerald-500 text-white shadow-md ring-2 ring-emerald-300 ring-offset-1' : 'bg-gray-100 text-gray-500 hover:bg-emerald-100 hover:text-emerald-700'}">
                            Present
                        </button>
                        <button onclick="verifyStudentAttendance('${student.id}', 'Late')" 
                            class="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${isLate ? 'bg-amber-500 text-white shadow-md ring-2 ring-amber-300 ring-offset-1' : 'bg-gray-100 text-gray-500 hover:bg-amber-100 hover:text-amber-700'}">
                            Late
                        </button>
                        <button onclick="verifyStudentAttendance('${student.id}', 'Absent')" 
                            class="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${isAbsent ? 'bg-red-500 text-white shadow-md ring-2 ring-red-300 ring-offset-1' : 'bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-700'}">
                            Absent
                        </button>
                        ${isExcused ? `<span class="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-blue-500 text-white shadow-md ring-2 ring-blue-300 ring-offset-1">Excused</span>` : ''}
                    </div>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-2">
                        <button onclick="viewStudentDetails('${student.id}')" class="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="View Details">
                            <i data-lucide="eye" class="w-4 h-4"></i>
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

let currentStudentId = null;

/**
 * View student details - Opens modal instead of alert
 */
async function viewStudentDetails(studentId) {
    const student = homeroomStudents.find(s => s.id === studentId);
    if (!student) return;
    
    currentStudentId = studentId;
    const records = todayAttendance[studentId];
    const latestRecord = records && records.length > 0 ? records[records.length - 1] : null;
    
    const status = latestRecord?.status || 'No Record';
    const timeIn = latestRecord?.time_in ? new Date(latestRecord.time_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '--:--';
    
    // Calculate attendance rate (last 30 days)
    let attendanceRate = '--';
    let rateLabel = '--';
    let rateColor = 'bg-gray-200 text-gray-600';
    
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const startDate = thirtyDaysAgo.toISOString().split('T')[0];
        
        const { data: attendanceLogs, error } = await supabase
            .from('attendance_logs')
            .select('status, log_date')
            .eq('student_id', studentId)
            .gte('log_date', startDate)
            .order('log_date', { ascending: false });
        
        if (!error && attendanceLogs && attendanceLogs.length > 0) {
            const totalDays = attendanceLogs.length;
            const presentDays = attendanceLogs.filter(log => 
                log.status === 'On Time' || 
                log.status === 'Present' || 
                log.status === 'Late'
            ).length;
            
            const rate = Math.round((presentDays / totalDays) * 100);
            attendanceRate = rate + '%';
            
            // Set badge based on rate
            if (rate >= 90) {
                rateLabel = 'Excellent';
                rateColor = 'bg-green-100 text-green-700';
            } else if (rate >= 75) {
                rateLabel = 'Good';
                rateColor = 'bg-blue-100 text-blue-700';
            } else if (rate >= 60) {
                rateLabel = 'Needs Improvement';
                rateColor = 'bg-yellow-100 text-yellow-700';
            } else {
                rateLabel = 'Critical';
                rateColor = 'bg-red-100 text-red-700';
            }
        } else {
            attendanceRate = 'No Data';
        }
    } catch (err) {
        console.error('Error calculating attendance rate:', err);
        attendanceRate = 'Error';
    }
    
    // Update modal content - Enterprise CRM Modal
    document.getElementById('modal-full-name').textContent = student.full_name;
    document.getElementById('modal-student-id').textContent = student.student_id_text || 'EDU-' + student.id.slice(0, 4);
    
    // Update profile image
    const profileImg = document.getElementById('modal-profile-img');
    const imgUrl = student.profile_photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.full_name)}&background=f3f4f6&color=4b5563`;
    profileImg.innerHTML = `<img src="${imgUrl}" alt="Photo" class="w-full h-full object-cover rounded-xl">`;
    
    // Contact info (using placeholder data - would need parent_contact field in DB)
    document.getElementById('modal-parent-contact').textContent = student.parent_contact || '09XX-XXX-XXXX';
    document.getElementById('modal-address').textContent = student.address || 'N/A';
    
    // Update attendance metrics
    document.getElementById('modal-attendance-rate').textContent = attendanceRate;
    
    // Update rate badge styling
    const rateBadgeEl = document.getElementById('modal-rate-badge');
    if (rateBadgeEl) {
        rateBadgeEl.className = `inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${rateColor}`;
    }
    
    // Calculate total absences and lates from actual DB data
    let totalAbsences = 0;
    let totalLates = 0;
    
    try {
        // Fetch all attendance logs for this student (last 30 days)
        const { data: allLogs } = await supabase
            .from('attendance_logs')
            .select('status, log_date')
            .eq('student_id', studentId)
            .gte('log_date', startDate)
            .order('log_date', { ascending: false });
        
        if (allLogs && allLogs.length > 0) {
            totalAbsences = allLogs.filter(log => log.status === 'Absent').length;
            totalLates = allLogs.filter(log => log.status === 'Late').length;
        }
    } catch (err) {
        console.error('Error fetching attendance history:', err);
        totalAbsences = 0;
        totalLates = 0;
    }
    
    document.getElementById('modal-total-absences').textContent = totalAbsences;
    document.getElementById('modal-total-lates').textContent = totalLates;
    
    // Show/hide DepEd warning
    const depedWarning = document.getElementById('modal-deped-warning');
    if (totalAbsences >= 10) {
        depedWarning.classList.remove('hidden');
    } else {
        depedWarning.classList.add('hidden');
    }
    
    // Show gate history (from today's records)
    const gateHistory = document.getElementById('modal-gate-history');
    if (records && records.length > 0) {
        gateHistory.innerHTML = records.slice(0, 5).map(record => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg ${record.status === 'On Time' ? 'bg-emerald-100' : record.status === 'Late' ? 'bg-amber-100' : 'bg-gray-100'}">
                        <i data-lucide="${record.status === 'On Time' ? 'check-circle' : record.status === 'Late' ? 'clock' : 'x-circle'}" class="w-4 h-4 ${record.status === 'On Time' ? 'text-emerald-600' : record.status === 'Late' ? 'text-amber-600' : 'text-gray-600'} mx-auto mt-2"></i>
                    </div>
                    <span class="font-medium text-gray-700">${record.status}</span>
                </div>
                <span class="text-sm text-gray-500">${record.time_in ? new Date(record.time_in).toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'}) : 'N/A'}</span>
            </div>
        `).join('');
    } else {
        gateHistory.innerHTML = '<p class="text-gray-500 text-sm">No gate scans recorded today</p>';
    }
    
    // Show modal
    const modal = document.getElementById('student-details-modal');
    modal.classList.remove('hidden');
    lucide.createIcons();
}

/**
 * Close student details modal
 */
function closeStudentModal() {
    const modal = document.getElementById('student-details-modal');
    modal.classList.add('hidden');
    currentStudentId = null;
}

/**
 * View attendance from modal - navigates to analytics
 */
function viewAttendanceFromModal() {
    if (currentStudentId) {
        window.location.href = `teacher-data-analytics.html?student=${currentStudentId}`;
    }
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

// =============================================================================
// HOMEROOM MANUAL VERIFICATION (OVERRIDE GATE STATUS)
// =============================================================================
// FIXED: Using UPSERT to completely prevent 409 Duplicate Conflicts
// UPDATED: Added event parameter and forced table reload for UI sync
async function verifyStudentAttendance(studentId, newStatus, skipReload = false, event = null) {
    if (!newStatus) return;
    
    // Add loading spinner to the clicked button to show it's working
    if (event && event.currentTarget) {
        const originalText = event.currentTarget.innerHTML;
        event.currentTarget.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin mx-auto"></i>';
    }

    const localDate = new Date();
    localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
    const todayStr = localDate.toISOString().split('T')[0];

    try {
        const records = todayAttendance[studentId] || [];
        const latestRecord = records.length > 0 ? records[records.length - 1] : null;

        let fallbackTimeIn = null;
        if (newStatus !== 'Absent' && newStatus !== 'Excused') {
            fallbackTimeIn = new Date(`${todayStr}T08:00:00`).toISOString();
        }

        const { error } = await supabase.from('attendance_logs').upsert({
            student_id: studentId, log_date: todayStr, status: newStatus, time_in: latestRecord?.time_in || fallbackTimeIn
        }, { onConflict: 'student_id, log_date' });

        if (error) throw error;

        // FORCE A COMPLETE TABLE REDRAW TO ENSURE UI MATCHES DB
        if (!skipReload) {
            await loadHomeroomStudents(); 
            if (typeof showNotification === 'function') showNotification(`Marked as ${newStatus}`, 'success');
        }

    } catch (err) {
        console.error('Error:', err);
        if (!skipReload && typeof showNotification === 'function') showNotification('Error updating attendance.', 'error');
    }
}

/**
 * Bulk Verify All Present
 */
async function verifyAllPresent() {
    if (!confirm("Verify all students as Present? (Will override existing statuses)")) return;

    const btn = document.querySelector('button[onclick="verifyAllPresent()"]');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 inline-block mr-1 animate-spin"></i> Saving...';
    btn.disabled = true;

    try {
        const promises = homeroomStudents.map(student => verifyStudentAttendance(student.id, 'On Time', true));
        await Promise.all(promises);
        
        showNotification(`${promises.length} students verified as Present`, 'success');
        await loadHomeroomStudents(); // Reload once at the end
    } catch (err) {
        console.error(err);
        showNotification('Error in bulk verification', 'error');
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
        if (window.lucide) lucide.createIcons();
    }
}

/**
 * Verify Gate Data - Lock in current gate scans as official attendance
 */
async function verifyGateData() {
    if (!confirm("Verify and lock in all current gate scans as official attendance?")) return;
    
    const btn = document.querySelector('button[onclick="verifyGateData()"]');
    const origHTML = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 inline-block mr-1 animate-spin"></i> Syncing...';
    
    try {
        const promises = [];
        // Only verify students who have a gate scan (status exists) but aren't locked yet
        filteredStudents.forEach(student => {
            const records = todayAttendance[student.id] || [];
            const latest = records.length > 0 ? records[records.length - 1] : null;
            if (latest && (latest.status === 'On Time' || latest.status === 'Late')) {
                promises.push(verifyStudentAttendance(student.id, latest.status, true));
            } else if (!latest) {
                // If no scan, explicitly mark absent as verification
                promises.push(verifyStudentAttendance(student.id, 'Absent', true));
            }
        });
        
        await Promise.all(promises);
        showNotification("Gate data verified and locked.", "success");
        await loadHomeroomStudents();
    } catch (e) {
        showNotification("Error syncing data.", "error");
    } finally {
        btn.innerHTML = origHTML;
        if(window.lucide) lucide.createIcons();
    }
}
