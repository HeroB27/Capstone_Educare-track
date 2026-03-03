// teacher-subject-attendance.js
// Subject Attendance with Status Protection Logic

// FIX: Add currentUser reference to prevent ReferenceError
var currentUser = typeof checkSession !== 'undefined' ? checkSession('teachers') : null;

// Redirect if not logged in
if (!currentUser) {
    window.location.href = '../index.html';
}

// Show notification function (if not available from core)
function showNotification(message, type = 'info') {
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, type);
    } else {
        alert(message);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Check for stored subject load ID (from dashboard navigation)
    const storedSubjectId = sessionStorage.getItem('selectedSubjectLoadId');
    if (storedSubjectId) {
        await loadSubjectLoads();
        setTimeout(() => {
            const subjectSelect = document.getElementById('subject-select');
            if (subjectSelect) {
                subjectSelect.value = storedSubjectId;
                loadSubjectStudents(storedSubjectId);
                sessionStorage.removeItem('selectedSubjectLoadId');
            }
        }, 100);
    } else {
        await loadSubjectLoads();
    }
    
    // Set today's date
    const dateEl = document.getElementById('today-date');
    if (dateEl) {
        const now = new Date();
        dateEl.textContent = now.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
});

/**
 * Load Subject Loads into dropdown
 */
async function loadSubjectLoads() {
    const subjectSelect = document.getElementById('subject-select');
    if (!subjectSelect) return;
    
    try {
        const { data: subjectLoads, error } = await supabase
            .from('subject_loads')
            .select(`
                id,
                subject_name,
                schedule_time_start,
                schedule_time_end,
                classes (grade_level, section_name)
            `)
            .eq('teacher_id', currentUser.id);
        
        if (error) {
            console.error('Error loading subject loads:', error);
            showNotification('Error loading subjects', 'error');
            return;
        }
        
        subjectSelect.innerHTML = '<option value="">Select a subject...</option>';
        
        subjectLoads.forEach(load => {
            const option = document.createElement('option');
            option.value = load.id;
            const timeStart = load.schedule_time_start ? load.schedule_time_start.substring(0, 5) : '';
            const timeEnd = load.schedule_time_end ? load.schedule_time_end.substring(0, 5) : '';
            option.text = `${load.subject_name} - ${load.classes?.grade_level} ${load.classes?.section_name} (${timeStart}-${timeEnd})`;
            subjectSelect.appendChild(option);
        });
        
    } catch (err) {
        console.error('Error in loadSubjectLoads:', err);
        showNotification('Error loading subjects', 'error');
    }
}

/**
 * Load Students for Selected Subject
 * Shows current gate status for each student
 */
async function loadSubjectStudents(subjectLoadId) {
    const studentList = document.getElementById('subject-student-list');
    const emptyState = document.getElementById('empty-state');
    const studentTableBody = document.getElementById('student-table-body');
    
    if (!subjectLoadId) {
        if (studentList) studentList.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }
    
    try {
        // Get subject name from dropdown
        const subjectSelect = document.getElementById('subject-select');
        const subjectOption = subjectSelect?.options[subjectSelect.selectedIndex];
        const subjectName = subjectOption?.text.split(' - ')[0] || 'Subject';
        
        const { data: subjectLoad } = await supabase
            .from('subject_loads')
            .select('class_id, subject_name')
            .eq('id', subjectLoadId)
            .single();
        
        if (!subjectLoad) return;
        
        // Use the subject name from the database
        const currentSubjectName = subjectLoad.subject_name || subjectName;
        
        // Get today's date for status lookup
        const today = new Date().toISOString().split('T')[0];
        
        // Fetch all students in the class
        const { data: allStudents, error: studentsError } = await supabase
            .from('students')
            .select('id, student_id_text, full_name')
            .eq('class_id', subjectLoad.class_id)
            .order('full_name');
        
        if (studentsError) throw studentsError;
        
        // Fetch today's attendance logs for these students
        const studentIds = allStudents.map(s => s.id);
        let todayLogs = [];
        if (studentIds.length > 0) {
            const { data: logs } = await supabase
                .from('attendance_logs')
                .select('student_id, status, time_in, remarks')
                .eq('log_date', today)
                .in('student_id', studentIds);
            todayLogs = logs || [];
        }
        
        // PHASE 2 FIX: Subject Teacher Blind Spot for Clinic Visits
        // Pre-fetch today's clinic visits for these students
        let todayClinicVisits = {};
        if (studentIds.length > 0) {
            const { data: visits } = await supabase
                .from('clinic_visits')
                .select('student_id, status')
                .is('time_out', null) // Active visit
                .in('student_id', studentIds);
            (visits || []).forEach(v => todayClinicVisits[v.student_id] = v);
        }

        // Build lookup map
        const logsMap = {};
        todayLogs.forEach(log => {
            logsMap[log.student_id] = log;
        });
        
        // Show student list, hide empty state
        if (studentList) studentList.classList.remove('hidden');
        if (emptyState) emptyState.classList.add('hidden');
        
        if (!allStudents || allStudents.length === 0) {
            if (studentTableBody) {
                studentTableBody.innerHTML = '<tr><td colspan="4" class="px-6 py-12 text-center text-gray-500">No students found in this class</td></tr>';
            }
            return;
        }
        
        // Calculate stats
        let presentCount = 0, absentCount = 0, lateCount = 0;
        
        // Render students
        if (studentTableBody) {
            studentTableBody.innerHTML = allStudents.map(student => {
                const log = logsMap[student.id];
                const gateStatus = log?.status || 'Not Marked';
                const isInClinic = !!todayClinicVisits[student.id];
                const timeIn = log?.time_in ? new Date(log.time_in).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '--:--';
                const remarks = log?.remarks || '';
                
                // Determine subject-specific status from remarks
                const currentSubjectStatus = getSubjectStatusFromRemarks(remarks, currentSubjectName);
                
                // Determine if status is protected (teacher cannot override Late/Excused from gate)
                const isProtected = gateStatus === 'Late' || gateStatus === 'Excused';
                
                // Status badge for gate status
                const statusBadge = getStatusBadge(gateStatus);
                
                // Button disabled state
                const presentDisabled = isProtected ? 'opacity-50 cursor-not-allowed' : '';
                
                // Track stats (use subject status if marked, otherwise gate status)
                const displayStatus = isInClinic ? 'In Clinic' : (currentSubjectStatus || gateStatus);
                if (displayStatus === 'On Time' || displayStatus === 'Present') presentCount++;
                else if (displayStatus === 'Absent') absentCount++;
                else if (displayStatus === 'Late') lateCount++;
                
                return `
                    <tr class="hover:bg-gray-50 transition">
                        <td class="px-6 py-4">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center text-primary-600 font-bold">
                                    ${student.full_name?.charAt(0) || '?'}
                                </div>
                                <div>
                                    <p class="font-medium text-gray-800">${escapeHtml(student.full_name)}</p>
                                    <p class="text-xs text-gray-500">Gate: ${timeIn}</p>
                                </div>
                            </div>
                        </td>
                        <td class="px-6 py-4 text-gray-600">${student.student_id_text || 'N/A'}</td>
                        <td class="px-6 py-4">
                            <span class="px-2 py-1 rounded-full text-xs font-medium ${statusBadge}">${gateStatus}</span>
                            ${currentSubjectStatus ? `<span class="ml-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(currentSubjectStatus)}">(Subject: ${currentSubjectStatus})</span>` : ''}
                        </td>
                        <td class="px-6 py-4">
                            <div class="flex gap-2">
                                <button onclick="markSubjectAttendance('${student.id}', '${subjectLoadId}', '${escapeHtml(currentSubjectName)}', 'Present')" 
                                    class="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm ${currentSubjectStatus === 'Present' ? 'ring-2 ring-white ring-offset-2' : ''} ${presentDisabled}"
                                    title="${isProtected ? 'Cannot change Late/Excused status' : 'Mark as Present'}">
                                    Present
                                </button>
                                <button onclick="markSubjectAttendance('${student.id}', '${subjectLoadId}', '${escapeHtml(currentSubjectName)}', 'Absent')" 
                                    class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm ${currentSubjectStatus === 'Absent' ? 'ring-2 ring-white ring-offset-2' : ''}"
                                    title="Mark as Absent">
                                    Absent
                                </button>
                                <button onclick="markSubjectAttendance('${student.id}', '${subjectLoadId}', '${escapeHtml(currentSubjectName)}', 'Excused')" 
                                    class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm ${currentSubjectStatus === 'Excused' ? 'ring-2 ring-white ring-offset-2' : ''}"
                                    title="Mark as Excused">
                                    Excused
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }
        
        // Update stats cards
        document.getElementById('total-students').textContent = allStudents.length;
        document.getElementById('present-count').textContent = presentCount;
        document.getElementById('absent-count').textContent = absentCount;
        document.getElementById('late-count').textContent = lateCount;
        
    } catch (err) {
        console.error('Error in loadSubjectStudents:', err);
        showNotification('Error loading students', 'error');
    }
}

/**
 * Get subject-specific status from remarks field
 */
function getSubjectStatusFromRemarks(remarks, subjectName) {
    // FIX: Read from JSONB object instead of parsing a string.
    if (remarks && typeof remarks === 'object' && subjectName) {
        return remarks[subjectName] || null;
    }
    return null;
}

/**
 * Escape regex special characters
 */
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Get status badge styling
 */
function getStatusBadge(status) {
    switch (status) {
        case 'In Clinic':
            return 'bg-blue-100 text-blue-800';
        case 'On Time':
        case 'Present':
            return 'bg-green-100 text-green-800';
        case 'Late':
            return 'bg-yellow-100 text-yellow-800';
        case 'Absent':
            return 'bg-red-100 text-red-800';
        case 'Excused':
            return 'bg-purple-100 text-purple-800';
        default:
            return 'bg-gray-100 text-gray-600';
    }
}

/**
 * Mark Subject Attendance with Status Protection
 * PROTECTS: Late and Excused statuses from being overwritten
 * PRESERVES: Gate time_in data when updating
 */
async function markSubjectAttendance(studentId, subjectLoadId, subjectName, newStatus) {
    // UPDATED: Add double-submit prevention
    const studentRow = document.querySelector(`button[onclick*="'${studentId}'"]`).closest('tr');
    const buttons = studentRow.querySelectorAll('button');
    
    try {
        // Disable buttons to prevent double-submission
        buttons.forEach(btn => btn.disabled = true);

        // FIX: Timezone adjustment to prevent saving to yesterday's date
        const localDate = new Date();
        localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
        const today = localDate.toISOString().split('T')[0];
        
        // 1. Fetch existing daily log to preserve gate data
        const { data: existingLog } = await supabase
            .from('attendance_logs')
            .select('status, time_in, remarks')
            .eq('student_id', studentId)
            .eq('log_date', today)
            .maybeSingle();

        // 2. PROTECT specific statuses
        // If student is already Late or Excused, subject teacher cannot override
        if (existingLog && (existingLog.status === 'Late' || existingLog.status === 'Excused') && newStatus !== 'Excused') {
            showNotification(`Cannot change status: Student is marked as ${existingLog.status} at the gate`, 'error');
            return;
        }

        // 3. FIX: Work with JSONB remarks for atomic updates.
        const existingRemarks = (existingLog?.remarks && typeof existingLog.remarks === 'object') ? existingLog.remarks : {};
        const newRemarks = { ...existingRemarks, [subjectName]: newStatus };

        // 4. Auto-calculate overall status from all subject statuses in the new remarks
        const allSubjectStatuses = Object.values(newRemarks);
        let overallStatus = 'On Time'; // Default if all are present
        if (allSubjectStatuses.includes('Excused')) {
            overallStatus = 'Excused';
        } else if (allSubjectStatuses.includes('Absent')) {
            overallStatus = 'Absent';
        } else if (allSubjectStatuses.includes('Late')) {
            overallStatus = 'Late';
        }

        // If the gate status was 'Late', the overall status must remain 'Late' unless a subject is 'Absent' or 'Excused'.
        if (existingLog?.status === 'Late' && overallStatus === 'On Time') {
            overallStatus = 'Late';
        }

        // 5. Perform the Upsert - PRESERVE existing time_in from gate.
        // The `onConflict` constraint handles the "Double Identity" bug by ensuring only one record per day.
        // Using JSONB remarks makes this single record reliable.
        const { error } = await supabase
            .from('attendance_logs')
            .upsert({
                student_id: studentId,
                log_date: today,
                time_in: existingLog?.time_in || new Date().toISOString(), 
                status: overallStatus,
                remarks: newRemarks
            }, {
                onConflict: 'student_id, log_date'
            });
        
        if (error) {
            console.error('Error marking attendance:', error);
            showNotification('Error marking attendance', 'error');
            return;
        }
        
        // NEW: Log the successful action
        if (typeof logTeacherAction === 'function') {
            logTeacherAction('SUBJECT_ATTENDANCE_MARK', 
                { subject_name: subjectName, new_status: newStatus, overall_status: overallStatus }, 
                studentId, 'student');
        }

        showNotification(`Student marked as ${newStatus}`, 'success');
        
        // Refresh the list
        const subjectSelect = document.getElementById('subject-select');
        if (subjectSelect?.value) {
            await loadSubjectStudents(subjectSelect.value);
        }
        
    } catch (err) {
        console.error('Error marking subject attendance:', err);
        showNotification('Error marking attendance', 'error');
    } finally {
        // Re-enable buttons
        buttons.forEach(btn => btn.disabled = false);
    }
}

/**
 * Handle subject dropdown change
 */
function handleSubjectChange() {
    const subjectId = document.getElementById('subject-select').value;
    loadSubjectStudents(subjectId);
}
