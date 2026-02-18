// teacher-subject-attendance.js
// Subject Attendance with Status Protection Logic

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
    }
}

/**
 * Load Students for Selected Subject
 * Shows current gate status for each student
 */
async function loadSubjectStudents(subjectLoadId) {
    const studentList = document.getElementById('subject-student-list');
    const emptyState = '<div class="p-6 text-center text-gray-500">Select a subject above to view students</div>';
    
    if (!studentList || !subjectLoadId) {
        studentList.innerHTML = emptyState;
        return;
    }
    
    try {
        const { data: subjectLoad } = await supabase
            .from('subject_loads')
            .select('class_id, subject_name')
            .eq('id', subjectLoadId)
            .single();
        
        if (!subjectLoad) return;
        
        // Get today's date for status lookup
        const today = new Date().toISOString().split('T')[0];
        
        // Fetch students with their current gate status
        const { data: students, error } = await supabase
            .from('students')
            .select(`
                id, student_id_text, full_name,
                attendance_logs(status, time_in, time_out)
            `)
            .eq('class_id', subjectLoad.class_id)
            .eq('attendance_logs.log_date', today)
            .order('full_name');
        
        if (error) {
            console.error('Error loading students:', error);
            return;
        }
        
        studentList.innerHTML = '';
        
        // Header
        const infoDiv = document.createElement('div');
        infoDiv.className = 'mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200';
        infoDiv.innerHTML = `
            <h3 class="font-bold text-lg text-blue-900">${subjectLoad.subject_name} - Attendance</h3>
            <p class="text-sm text-blue-600">Students marked as Late or Excused cannot be changed to Present</p>
        `;
        studentList.appendChild(infoDiv);
        
        if (!students || students.length === 0) {
            studentList.innerHTML += '<div class="p-4 text-center text-gray-500">No students found in this class</div>';
            return;
        }
        
        students.forEach(student => {
            // Get gate status (first log entry)
            const log = student.attendance_logs?.[0];
            const gateStatus = log?.status || 'Not Marked';
            const timeIn = log?.time_in ? new Date(log.time_in).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            
            // Determine if status is protected
            const isProtected = gateStatus === 'Late' || gateStatus === 'Excused';
            
            // Status badge
            const statusBadge = getStatusBadge(gateStatus);
            
            // Button visibility based on protection
            const presentDisabled = isProtected ? 'opacity-50 cursor-not-allowed' : '';
            const presentTitle = isProtected ? 'Cannot change Late/Excused status' : 'Mark as Present';
            
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between p-4 border-b hover:bg-gray-50 transition';
            row.innerHTML = `
                <div class="flex items-center gap-4">
                    <div class="flex flex-col">
                        <span class="font-medium text-gray-800">${student.full_name}</span>
                        <span class="text-sm text-gray-500">${student.student_id_text}</span>
                    </div>
                    <div class="flex flex-col ml-4">
                        <span class="text-xs text-gray-400">Gate: ${timeIn}</span>
                        <span class="text-xs ${statusBadge.replace('text-', 'text-').replace('bg-', 'text-')} ${statusBadge}">${gateStatus}</span>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="markSubjectAttendance('${student.id}', 'Present')" 
                        class="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm ${presentDisabled}" 
                        title="${presentTitle}">
                        Present
                    </button>
                    <button onclick="markSubjectAttendance('${student.id}', 'Absent')" 
                        class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                        title="Mark as Absent">
                        Absent
                    </button>
                    <button onclick="markSubjectAttendance('${student.id}', 'Excused')" 
                        class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
                        title="Mark as Excused">
                        Excused
                    </button>
                </div>
            `;
            studentList.appendChild(row);
        });
        
    } catch (err) {
        console.error('Error in loadSubjectStudents:', err);
    }
}

/**
 * Get status badge styling
 */
function getStatusBadge(status) {
    switch (status) {
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
async function markSubjectAttendance(studentId, newStatus) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const now = new Date().toISOString();
        
        // 1. Fetch existing daily log to preserve gate data
        const { data: existingLog } = await supabase
            .from('attendance_logs')
            .select('status, time_in')
            .eq('student_id', studentId)
            .eq('log_date', today)
            .single();

        // 2. PROTECT specific statuses
        // If student is already Late or Excused, subject teacher cannot override
        if (existingLog && (existingLog.status === 'Late' || existingLog.status === 'Excused')) {
            showToast(`Cannot change status: Student is marked as ${existingLog.status}`, 'warning');
            return;
        }

        // 3. Safely append subject info without destroying gate data
        let newRemarks = existingLog?.remarks ? `${existingLog.remarks} | ` : '';
        newRemarks += `[${currentUser?.full_name || 'Teacher'}: ${newStatus}]`;

        // 4. Perform the Upsert - PRESERVE existing time_in from gate
        const { error } = await supabase
            .from('attendance_logs')
            .upsert({
                student_id: studentId,
                log_date: today,
                time_in: existingLog ? existingLog.time_in : null, 
                status: newStatus === 'Excused' ? 'Excused' : (newStatus === 'Present' ? 'On Time' : 'Absent'),
                remarks: newRemarks
            }, {
                onConflict: 'student_id, log_date'
            });
        
        if (error) {
            console.error('Error marking attendance:', error);
            showToast('Error marking attendance', 'error');
            return;
        }
        
        showToast('Attendance recorded', 'success');
        
        // Refresh the list
        const subjectSelect = document.getElementById('subject-select');
        if (subjectSelect?.value) {
            await loadSubjectStudents(subjectSelect.value);
        }
        
    } catch (err) {
        console.error('Error marking subject attendance:', err);
        showToast('Error marking attendance', 'error');
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
 * Toast notification helper
 */
function showToast(message, type = 'info') {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.className = 'fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white z-50 transition-all duration-300 transform translate-y-full opacity-0';
        document.body.appendChild(toast);
    }

    const styles = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-yellow-500',
        info: 'bg-blue-500'
    };

    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white z-50 transition-all duration-300 transform translate-y-full opacity-0 ${styles[type] || styles.info}`;
    toast.textContent = message;

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-full', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('translate-y-full', 'opacity-0');
    }, 3000);
}
