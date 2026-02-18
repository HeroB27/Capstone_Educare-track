// teacher-homeroom.js
// Real-time Homeroom Attendance with Gate Status Integration

// Store teacher's homeroom student IDs for real-time filtering
let myHomeroomStudentIds = [];

// THE PARANOIA SHIELD: Debounce timer for real-time updates
let refreshTimeout;

document.addEventListener('DOMContentLoaded', async () => {
    await loadHomeroomStudents();
    
    // Subscribe to real-time attendance updates
    if (supabase) {
        supabase
            .channel('attendance-changes')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'attendance_logs',
                filter: `log_date=eq.${new Date().toISOString().split('T')[0]}`
            }, (payload) => {
                // THE PARANOIA SHIELD: Debounced Refresh
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
    }
});

/**
 * Load Homeroom Students with Real-time Gate Status
 * Uses JOIN-style query to fetch students with their attendance logs for today
 */
async function loadHomeroomStudents() {
    const studentList = document.getElementById('homeroom-student-list');
    if (!studentList) return;
    
    try {
        const today = new Date().toISOString().split('T')[0];

        // 1. Fetch Teacher's Advisory Class
        const { data: teacherClass, error: classError } = await supabase
            .from('classes')
            .select('id, grade_level, section_name')
            .eq('adviser_id', currentUser.id)
            .single();
        
        if (classError || !teacherClass) {
            studentList.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-500">No advisory class assigned.</td></tr>';
            return;
        }
        
        // Update class info header
        const classInfoEl = document.getElementById('homeroom-class-info');
        if (classInfoEl) {
            classInfoEl.innerText = `${teacherClass.grade_level} - ${teacherClass.section_name}`;
        }
        
        // 2. Fetch Students + Today's Gate Logs (JOIN-style query)
        const { data: students, error: studentError } = await supabase
            .from('students')
            .select(`
                id, lrn, student_id_text, full_name,
                attendance_logs(time_in, time_out, status, log_date)
            `)
            .eq('class_id', teacherClass.id)
            .order('full_name');
        
        if (studentError) {
            console.error('Error loading students:', studentError);
            return;
        }
        
        // Populate homeroom student IDs for real-time filtering
        myHomeroomStudentIds = students.map(student => student.id);
        
        studentList.innerHTML = '';
        
        students.forEach(student => {
            // Get the first log entry for today if it exists
            const log = student.attendance_logs && student.attendance_logs[0];
            const timeIn = log && log.time_in ? formatTime(log.time_in) : '--:--';
            
            // Determine gate status - if no log today, default to Absent
            let status = 'Absent';
            if (log) {
                status = log.status || 'Absent';
            }
            
            const statusBadge = getStatusBadge(status);
            
            // Calculate if student is Inside (has time_in, no time_out) or Outside
            let gateStatus = '';
            if (log && log.time_in) {
                gateStatus = log.time_out ? 'Outside' : 'Inside';
            }
            
            const row = document.createElement('tr');
            row.className = 'border-b hover:bg-gray-50 transition';
            row.innerHTML = `
                <td class="p-4 text-sm font-mono text-gray-600">${student.student_id_text}</td>
                <td class="p-4 font-medium text-gray-800">${student.full_name}</td>
                <td class="p-4 text-sm text-gray-500">${student.lrn}</td>
                <td class="p-4 text-sm font-mono">${timeIn}</td>
                <td class="p-4">
                    <span class="px-2 py-1 rounded-full text-xs font-bold ${statusBadge}">
                        ${status}
                    </span>
                    ${gateStatus ? `<span class="ml-1 text-xs text-gray-400">(${gateStatus})</span>` : ''}
                </td>
                <td class="p-4">
                    <select onchange="markAttendance('${student.id}', this.value)" 
                        class="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Override...</option>
                        <option value="On Time">Present (On Time)</option>
                        <option value="Late">Late</option>
                        <option value="Absent">Absent</option>
                        <option value="Excused">Excused</option>
                    </select>
                </td>
            `;
            studentList.appendChild(row);
        });
        
    } catch (err) {
        console.error('Error in loadHomeroomStudents:', err);
    }
}

/**
 * Helper: Get status badge styling
 */
function getStatusBadge(status) {
    switch (status) {
        case 'On Time':
        case 'Present':
            return 'bg-green-100 text-green-700';
        case 'Late':
            return 'bg-yellow-100 text-yellow-700';
        case 'Absent':
            return 'bg-red-100 text-red-700';
        case 'Excused':
            return 'bg-purple-100 text-purple-700';
        default:
            return 'bg-gray-100 text-gray-600';
    }
}

/**
 * Helper: Format time for display
 */
function formatTime(dateStr) {
    if (!dateStr) return '--:--';
    return new Date(dateStr).toLocaleTimeString('en-PH', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    });
}

/**
 * Mark Attendance with Manual Override
 * Uses upsert to prevent duplicate entries
 * THE PARANOIA SHIELD: Preserves original gate scan time
 */
async function markAttendance(studentId, status) {
    if (!status) return; // No change selected
    
    try {
        const today = new Date().toISOString().split('T')[0];
        const now = new Date().toISOString();
        
        // Normalize status for presentation
        let displayStatus = status;
        if (status === 'Present') displayStatus = 'On Time';
        
        // 1. FETCH FIRST to protect the Guard's data
        const { data: existingLog } = await supabase
            .from('attendance_logs')
            .select('time_in, remarks')
            .eq('student_id', studentId)
            .eq('log_date', today)
            .single();
            
        // 2. Determine safe time_in (Keep existing, use 'now' if blank, null if Absent)
        let safeTimeIn = null;
        if (status !== 'Absent') {
            safeTimeIn = existingLog?.time_in ? existingLog.time_in : now;
        }

        // 3. Append remarks cleanly
        let safeRemarks = existingLog?.remarks || '';
        if (!safeRemarks.includes('Manual override')) {
            safeRemarks = safeRemarks ? `${safeRemarks} | Manual override by Teacher` : 'Manual override by Teacher';
        }

        // 4. Safely Upsert with protected time_in
        const { error } = await supabase
            .from('attendance_logs')
            .upsert({
                student_id: studentId,
                log_date: today,
                time_in: safeTimeIn, // Protected!
                status: displayStatus,
                remarks: safeRemarks
            }, {
                onConflict: 'student_id, log_date'
            });
        
        if (error) {
            console.error('Error marking attendance:', error);
            alert('Error marking attendance. Please try again.');
            return;
        }
        
        // Refresh the list
        await loadHomeroomStudents();
        
    } catch (err) {
        console.error('Exception marking attendance:', err);
        alert('Error marking attendance. Please try again.');
    }
}
