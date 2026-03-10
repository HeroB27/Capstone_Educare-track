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

// Global State for Subject Cards
let currentSubjectLoadId = null;
let currentSubjectName = null;

document.addEventListener('DOMContentLoaded', async () => {
    // UPDATED: Initialize date picker with Asia/Manila timezone - Phase 2 Task 2.1
    initializeDatePicker();
    
    // Load subject cards on page load
    await loadSubjectLoads();
});

// UPDATED: Initialize date picker - Phase 2 Task 2.1
function initializeDatePicker() {
    const dateInput = document.getElementById('attendance-date');
    if (dateInput) {
        // Get current date in Asia/Manila timezone
        const now = new Date();
        const manilaOffset = 8 * 60; // UTC+8
        const localTime = new Date(now.getTime() + (manilaOffset - now.getTimezoneOffset()) * 60000);
        const todayStr = localTime.toISOString().split('T')[0];
        dateInput.value = todayStr;
        
        // Set min and max (optional: allow only current school year)
        const year = localTime.getFullYear();
        dateInput.min = `${year}-01-01`;
        dateInput.max = `${year}-12-31`;
        
        // Add onchange to reload subject cards when date changes
        dateInput.onchange = async () => {
            await loadSubjectLoads();
        };
    }
}

// UPDATED: Handle date change - Phase 2 Task 2.1 & 2.2
function handleDateChange() {
    const dateInput = document.getElementById('attendance-date');
    if (dateInput) {
        // Reload subjects based on the new date
        loadSubjectLoads();
        
        // Clear student list when date changes
        const studentList = document.getElementById('subject-student-list');
        const emptyState = document.getElementById('empty-state');
        if (studentList) studentList.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
        
        // Reset stats
        document.getElementById('total-students').textContent = '--';
        document.getElementById('present-count').textContent = '--';
        document.getElementById('absent-count').textContent = '--';
        document.getElementById('late-count').textContent = '--';
    }
}

/**
 * Get day code from date for schedule matching
 * Monday = M, Tuesday = T, Wednesday = W, Thursday = Th, Friday = F, Saturday = S
 */
function getDayCode(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDay();
    const dayCodes = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa']; // Fixed to match admin/dashboard schema
    return dayCodes[day];
}

/**
 * Load Subject Loads as Cards - UPDATED: Card Grid Layout
 */
async function loadSubjectLoads() {
    const container = document.getElementById('subject-cards-container');
    if (!container) return;

    container.innerHTML = '<div class="col-span-full text-center py-8 text-blue-400 font-bold animate-pulse">Loading your classes...</div>';

    try {
        const { data: subjectLoads, error } = await supabase
            .from('subject_loads')
            .select('*, classes(grade_level, section_name)')
            .eq('teacher_id', currentUser.id);

        if (error) throw error;

        const dateInput = document.getElementById('attendance-date');
        const selectedDate = dateInput?.value || new Date().toISOString().split('T')[0];
        const dayCode = getDayCode(selectedDate);

        const todaysSubjects = subjectLoads.filter(load =>
            load.schedule_days && load.schedule_days.includes(dayCode)
        );

        if (todaysSubjects.length === 0) {
            container.innerHTML = `<div class="col-span-full bg-white rounded-2xl p-8 text-center border border-dashed border-gray-200"><p class="text-gray-500 font-medium">No classes scheduled for this date.</p></div>`;
            document.getElementById('subject-student-list').classList.add('hidden');
            document.getElementById('empty-state').classList.remove('hidden');
            return;
        }

        // Render Cards
        container.innerHTML = todaysSubjects.map(load => `
            <div onclick="selectSubjectCard('${load.id}', '${load.subject_name}')" 
                 id="card-${load.id}"
                 class="subject-card cursor-pointer bg-white p-5 rounded-2xl border-2 border-transparent shadow-sm hover:shadow-md hover:border-blue-200 transition-all group relative">
                <div class="absolute top-4 right-4 w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <i data-lucide="clipboard-check" class="w-4 h-4"></i>
                </div>
                <h4 class="font-black text-gray-800 text-lg leading-tight pr-10 mb-1 truncate">${load.subject_name}</h4>
                <p class="text-xs font-bold text-blue-600 uppercase tracking-wide truncate">
                    ${load.classes?.grade_level || 'Grade'} - ${load.classes?.section_name || 'Section'}
                </p>
            </div>
        `).join('');
        
        if (window.lucide) lucide.createIcons();

        // Auto-select the first card to save the teacher a click!
        selectSubjectCard(todaysSubjects[0].id, todaysSubjects[0].subject_name);

    } catch (err) {
        console.error('Error loading subjects:', err);
        container.innerHTML = '<div class="col-span-full text-center text-red-500 font-bold py-4">Failed to load subjects.</div>';
    }
}

window.selectSubjectCard = function(subjectId, subjectName) {
    currentSubjectLoadId = subjectId;
    currentSubjectName = subjectName;

    // Visual selection update
    document.querySelectorAll('.subject-card').forEach(card => {
        card.classList.remove('border-blue-500', 'ring-4', 'ring-blue-500/20');
        card.classList.add('border-transparent');
    });
    const activeCard = document.getElementById(`card-${subjectId}`);
    if (activeCard) {
        activeCard.classList.remove('border-transparent');
        activeCard.classList.add('border-blue-500', 'ring-4', 'ring-blue-500/20');
    }

    // Load the students for this subject
    loadSubjectStudents(subjectId);
}

/**
 * Get day name from date string
 */
function getDayName(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
}

/**
 * Load Students for Selected Subject - UPDATED: Use selected date instead of today - Phase 2 Task 2.2 & 2.3
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
        // UPDATED: Get the selected date from the date picker - Phase 2 Task 2.2
        const dateInput = document.getElementById('attendance-date');
        const selectedDate = dateInput?.value || new Date().toISOString().split('T')[0];
        const isToday = selectedDate === new Date().toISOString().split('T')[0];
        
        // Use global state from Card engine
        let subjectName = currentSubjectName || 'Subject';
        
        const { data: subjectLoad } = await supabase
            .from('subject_loads')
            .select('class_id, subject_name')
            .eq('id', subjectLoadId)
            .single();
        
        if (!subjectLoad) return;
        
        // Use the subject name from the database
        const currentSubjectName = subjectLoad.subject_name || subjectName;
        
        // UPDATED: Use selected date for status lookup - Phase 2 Task 2.2
        const lookupDate = selectedDate;
        
        // Fetch all students in the class
        const { data: allStudents, error: studentsError } = await supabase
            .from('students')
            .select('id, student_id_text, full_name')
            .eq('class_id', subjectLoad.class_id)
            .order('full_name');
        
        if (studentsError) throw studentsError;
        
        // UPDATED: Fetch attendance logs for the SELECTED DATE - Phase 2 Task 2.2
        const studentIds = allStudents.map(s => s.id);
        let dateLogs = [];
        if (studentIds.length > 0) {
            const { data: logs } = await supabase
                .from('attendance_logs')
                .select('student_id, status, time_in, remarks')
                .eq('log_date', lookupDate)
                .in('student_id', studentIds);
            dateLogs = logs || [];
        }
        
        // UPDATED: Fetch clinic visits for the SELECTED DATE - Phase 2 Task 2.3
        // Only show clinic status if viewing today (can't track clinic for past dates)
        let todayClinicVisits = {};
        if (isToday && studentIds.length > 0) {
            const { data: visits } = await supabase
                .from('clinic_visits')
                .select('student_id, status')
                .eq('status', 'In Clinic')
                .is('time_out', null)
                .in('student_id', studentIds);
            (visits || []).forEach(v => todayClinicVisits[v.student_id] = v);
        }

        // Build lookup map
        const logsMap = {};
        dateLogs.forEach(log => {
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
                const gateStatus = log?.status || 'No Scan';
                const isInClinic = isToday && !!todayClinicVisits[student.id];
                
                // UPDATED: Show Gate badge - Phase 2 Task 2.3
                const gateBadge = log?.time_in 
                    ? `<span class="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">[Gate: Inside]</span>`
                    : `<span class="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">[Gate: No Scan]</span>`;
                
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
                    <tr class="hover:bg-blue-50/50 transition-colors">
                        <td class="px-6 py-4">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-full overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
                                    <img src="${student.profile_photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.full_name)}&background=f3f4f6&color=4b5563`}" class="w-full h-full object-cover ${student.profile_photo_url ? 'object-top' : ''}">
                                </div>
                                <div>
                                    <p class="font-bold text-gray-800">${student.full_name}</p>
                                    <p class="text-xs text-gray-500 font-mono">${student.student_id_text || 'No ID'}</p>
                                </div>
                            </div>
                        </td>
                        <td class="px-6 py-4">
                            <div class="flex items-center gap-2">
                                <button onclick="markSubjectAttendance('${student.id}', '${subjectLoadId}', '${escapeHtml(currentSubjectName)}', 'Present')" 
                                    class="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${currentSubjectStatus === 'Present' ? 'bg-emerald-500 text-white shadow-md ring-2 ring-emerald-300 ring-offset-1' : 'bg-gray-100 text-gray-500 hover:bg-emerald-100 hover:text-emerald-700'}">
                                    Present
                                </button>
                                <button onclick="markSubjectAttendance('${student.id}', '${subjectLoadId}', '${escapeHtml(currentSubjectName)}', 'Late')" 
                                    class="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${currentSubjectStatus === 'Late' ? 'bg-amber-500 text-white shadow-md ring-2 ring-amber-300 ring-offset-1' : 'bg-gray-100 text-gray-500 hover:bg-amber-100 hover:text-amber-700'}">
                                    Late
                                </button>
                                <button onclick="markSubjectAttendance('${student.id}', '${subjectLoadId}', '${escapeHtml(currentSubjectName)}', 'Absent')" 
                                    class="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${currentSubjectStatus === 'Absent' ? 'bg-red-500 text-white shadow-md ring-2 ring-red-300 ring-offset-1' : 'bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-700'}">
                                    Absent
                                </button>
                                ${currentSubjectStatus === 'Excused' ? `<span class="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-blue-500 text-white shadow-md ring-2 ring-blue-300 ring-offset-1">Excused</span>` : ''}
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
async function markSubjectAttendance(studentId, subjectLoadId, subjectName, newStatus, skipReload = false) {
    // UPDATED: Add double-submit prevention
    const studentRow = document.querySelector(`button[onclick*="'${studentId}'"]`).closest('tr');
    const buttons = studentRow.querySelectorAll('button');
    
    try {
        // Disable buttons to prevent double-submission
        buttons.forEach(btn => btn.disabled = true);

        // UPDATED: Use selected date from date picker - Phase 2 Task 2.4
        const dateInput = document.getElementById('attendance-date');
        const selectedDate = dateInput?.value || new Date().toISOString().split('T')[0];
        
        // 1. Fetch existing daily log to preserve gate data
        const { data: existingLog } = await supabase
            .from('attendance_logs')
            .select('status, time_in, remarks')
            .eq('student_id', studentId)
            .eq('log_date', selectedDate)
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
        // UPDATED: Use selectedDate instead of today - Phase 2 Task 2.4
        // RETROACTIVE TIME-IN PROTECTION: If no gate scan exists, we must safely handle the fallback time_in
        let fallbackTimeIn = null;
        if (overallStatus === 'On Time' || overallStatus === 'Late') {
            // If marked present retroactively, generate a fake 8:00 AM timestamp for the SELECTED date, NOT today.
            fallbackTimeIn = new Date(`${selectedDate}T08:00:00`).toISOString();
        }

        const { error } = await supabase.from('attendance_logs').upsert({
                student_id: studentId,
                log_date: selectedDate, 
                time_in: existingLog?.time_in || fallbackTimeIn, 
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
        
        // Refresh the list (unless bulk processing)
        if (!skipReload && currentSubjectLoadId) {
            await loadSubjectStudents(currentSubjectLoadId);
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

/**
 * Bulk Mark All Present
 * Finds all un-marked students and marks them present concurrently.
 */
async function markAllPresent() {
    const subjectLoadId = currentSubjectLoadId;
    const subjectName = currentSubjectName;

    if (!subjectLoadId) return showNotification('Please select a subject first', 'error');

    const dateInput = document.getElementById('attendance-date');
    const selectedDate = dateInput?.value || new Date().toISOString().split('T')[0];

    if (!confirm(`Mark all empty records as 'Present' for ${subjectName}? (Will not overwrite Late or Excused)`)) return;

    const studentRows = document.querySelectorAll('#student-table-body tr');
    if (studentRows.length === 0 || studentRows[0].textContent.includes('No students')) return;

    const btn = document.querySelector('button[onclick="markAllPresent()"]');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 inline-block mr-1 animate-spin"></i> Saving...';
    btn.disabled = true;

    try {
        const promises = [];
        
        studentRows.forEach(row => {
            const presentBtn = row.querySelector('button.bg-green-500');
            if (presentBtn) {
                const onclickStr = presentBtn.getAttribute('onclick');
                const match = onclickStr.match(/'([^']+)'/); // Extract studentId
                if (match && match[1]) {
                    const studentId = match[1];
                    // If they don't already have 'Present' visually selected (ring-2 is the active class)
                    // and their button isn't disabled (protected status)
                    if (!presentBtn.classList.contains('ring-2') && !presentBtn.disabled) {
                        promises.push(markSubjectAttendance(studentId, subjectLoadId, subjectName, 'Present', true));
                    }
                }
            }
        });

        if (promises.length > 0) {
            await Promise.all(promises);
            showNotification(`${promises.length} students marked as Present`, 'success');
            await loadSubjectStudents(subjectLoadId); // Reload UI once at the end
        } else {
            showNotification('No applicable students to mark.', 'info');
        }
    } catch (err) {
        console.error(err);
        showNotification('Error in bulk update', 'error');
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
        if (window.lucide) lucide.createIcons();
    }
}
