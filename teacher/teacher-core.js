// teacher/teacher-core.js
// Core logic for Teacher Module - Session, data fetching, gatekeeper mode

// 1. Session Check - Verifies teacher login
var currentUser = checkSession('teachers');

// 2. Global Teacher Identity Variables
let homeroomClass = null; // Stores the class the teacher advises
let mySubjectLoads = []; // Stores the subjects the teacher teaches

// 3. Gatekeeper Mode Check - Enable if teacher has guard duties
let isGatekeeperMode = false;
let isAdviserMode = false; // Track if teacher is an adviser
if (currentUser && currentUser.is_gatekeeper === true) {
    isGatekeeperMode = true;
    console.log('Gatekeeper mode enabled for this teacher');
}

// 3. Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
    if (!currentUser) return;
    
    // Set welcome message
    const nameEl = document.getElementById('teacher-name');
    if (nameEl) {
        nameEl.innerText = `Hello, ${currentUser.full_name}`;
    }
    
    // Show gatekeeper toggle if applicable
    const gatekeeperToggle = document.getElementById('gatekeeper-toggle');
    if (gatekeeperToggle && isGatekeeperMode) {
        gatekeeperToggle.classList.remove('hidden');
    }
    
    // Load teacher identity (homeroom + schedule) - Only fetch once per session!
    await initializeTeacherPortal();
    
    // Load appropriate data based on current page
    await initTeacherPage();
    injectStyles();
});

// 3a. Initialize Teacher Portal - Identity handshake between Adviser and Subject Teacher
// THE PARANOIA SHIELD: Only fetch if we haven't fetched it yet this session!
async function initializeTeacherPortal() {
    if (sessionStorage.getItem('teacher_identity_loaded') === 'true') {
        console.log('Teacher identity already loaded from session, skipping API call');
        return; // Skip the database call, we already know who they are!
    }
    
    try {
        // 1. Fetch Teacher Info + Advisory Class (from teachers table)
        const { data: teacher, error } = await supabase
            .from('teachers')
            .select('*, classes(id, grade_level, section_name)')
            .eq('id', currentUser.id)
            .single();

        if (error) {
            console.error('Error fetching teacher:', error);
            handleSessionError();
            return;
        }

        // 2. Identify Mode: Adviser vs Subject Teacher
        isAdviserMode = teacher.classes !== null;
        
        // UPDATE: Check if teacher has gatekeeper privileges
        // Add gatekeeper menu if teacher has privileges
        const gatekeeperMenuBtn = document.getElementById('nav-gatekeeper-mode');
        if (gatekeeperMenuBtn) {
            if (teacher.is_gatekeeper) {
                gatekeeperMenuBtn.classList.remove('hidden');
            } else {
                gatekeeperMenuBtn.classList.add('hidden');
            }
        }

        // Hard-Block: Prevent unauthorized access to gatekeeper page
        const currentPage = window.location.pathname;
        if (currentPage.includes('teacher-gatekeeper-mode.html') && !teacher.is_gatekeeper) {
            showNotification("Unauthorized Access: You do not have Gatekeeper privileges.", "error");
            window.location.href = 'teacher-dashboard.html';
            return;
        }

        // Update advisory badge in UI
        const badgeEl = document.getElementById('advisory-badge');
        if (badgeEl) {
            if (isAdviserMode) {
                badgeEl.innerText = `Adviser: ${teacher.classes.grade_level}-${teacher.classes.section_name}`;
                // Load homeroom stats for dashboard cards
                loadHomeroomStats(teacher.classes.id);
            } else {
                badgeEl.innerText = "Subject Teacher";
                // Hide advisory-only features
                hideAdvisoryOnlyFeatures();
            }
        }

        // 3. Load Live Schedule
        await loadTeacherSchedule(teacher.id);
        
        // Once fetched successfully, set the flag so we don't spam the API again
        sessionStorage.setItem('teacher_identity_loaded', 'true');
        
        console.log('Teacher Portal Initialized:', isAdviserMode ? 'Adviser Mode' : 'Subject Teacher Mode');
        
    } catch (err) {
        console.error('Error in initializeTeacherPortal:', err);
    }
}

// 3b. Load Homeroom Stats for Dashboard Cards (Adviser Only)
async function loadHomeroomStats(classId) {
    // This function prepares data for dashboard stats cards
    // Called when teacher is an adviser
    console.log('Loading homeroom stats for class:', classId);
    // Stats will be loaded via loadDashboardStats() in teacher-dashboard.js
}

// 3c. Hide Advisory-Only Features for Subject Teachers
function hideAdvisoryOnlyFeatures() {
    // Hide advisory-only UI elements for subject teachers
    const elements = document.querySelectorAll('.advisory-only');
    elements.forEach(el => {
        el.style.display = 'none';
    });
    console.log('Advisory-only features hidden for Subject Teacher');
}

// 3d. Load Teacher Schedule (Live)
async function loadTeacherSchedule(teacherId) {
    try {
        const { data: subjectLoads, error } = await supabase
            .from('subject_loads')
            .select('*, classes(grade_level, section_name)')
            .eq('teacher_id', teacherId);

        if (error) {
            console.error('Error loading schedule:', error);
            return;
        }

        if (subjectLoads) {
            mySubjectLoads = subjectLoads;
            console.log('Schedule loaded:', mySubjectLoads.length, 'subjects');
            renderScheduleOnDashboard();
        }
    } catch (err) {
        console.error('Error in loadTeacherSchedule:', err);
    }
}

// 3e. Handle Session Error
function handleSessionError() {
    showNotification('Session error. Please login again.', "error");
    window.location.href = '../index.html';
}

// 3f. Render Schedule on Dashboard - Shows cards with Take Attendance buttons
function renderScheduleOnDashboard() {
    const container = document.getElementById('schedule-list');
    if (!container) return;

    if (mySubjectLoads.length === 0) {
        container.innerHTML = '<p class="text-gray-500 italic p-4">No subjects assigned for today.</p>';
        return;
    }

    container.innerHTML = mySubjectLoads.map(load => `
        <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group mb-4 flex justify-between items-center">
            <div>
                <h4 class="font-bold text-gray-800 text-lg leading-tight">${load.subject_name}</h4>
                <p class="text-xs font-bold text-blue-600 uppercase mt-1 tracking-wide">${load.classes?.grade_level} - ${load.classes?.section_name}</p>
                <div class="flex items-center gap-2 mt-3 text-gray-400 text-[10px] font-bold uppercase tracking-widest">
                    <i data-lucide="clock" class="w-3 h-3"></i>
                    ${load.schedule_time_start?.substring(0, 5) || ''} - ${load.schedule_time_end?.substring(0, 5) || ''}
                </div>
            </div>
            <button onclick="navigateToAttendance('${load.id}')" class="px-5 py-2.5 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-sm hover:shadow-blue-200">
                Take Attendance
            </button>
        </div>
    `).join('');
    
    if (window.lucide) lucide.createIcons();
}

// 3g. Navigate to Subject Attendance page with selected subject
function navigateToAttendance(subjectLoadId) {
    // Store selected subject for attendance page
    sessionStorage.setItem('selectedSubjectLoadId', subjectLoadId);
    window.location.href = 'teacher-subject-attendance.html';
}

// 4. Page Initialization Router
async function initTeacherPage() {
    const path = window.location.pathname;
    
    if (path.includes('teacher-homeroom')) {
        await loadHomeroomStudents();
    } else if (path.includes('teacher-subject-attendance')) {
        await loadSubjectLoads();
        // Check if navigated from dashboard with selected subject
        const storedSubjectId = sessionStorage.getItem('selectedSubjectLoadId');
        if (storedSubjectId) {
            // Auto-select the subject and load students
            setTimeout(() => {
                const subjectSelect = document.getElementById('subject-select');
                if (subjectSelect) {
                    subjectSelect.value = storedSubjectId;
                    loadSubjectStudents(storedSubjectId);
                    sessionStorage.removeItem('selectedSubjectLoadId');
                }
            }, 100);
        }
    } else if (path.includes('teacher-clinicpass')) {
        await loadClinicPassInterface();
    } else if (path.includes('teacher-excuse-letter-approval')) {
        await loadExcuseLetters();
    } else if (path.includes('teacher-data-analytics')) {
        await loadAnalytics();
    } else if (path.includes('teacher-announcements-board')) {
        await setupAnnouncementPage();
    } else if (path.includes('teacher-settings')) {
        initializeTeacherSettingsPage();
    } else {
        // Default dashboard - load schedule
        await loadSchedule();
    }
}

// 5. Load Teacher Schedule (Today's Classes)
async function loadSchedule() {
    const scheduleList = document.getElementById('schedule-list');
    if (!scheduleList) return;
    
    try {
        // Get teacher's subjects for today
        const { data: subjectLoads, error } = await supabase
            .from('subject_loads')
            .select(`
                *,
                classes (grade_level, section_name)
            `)
            .eq('teacher_id', currentUser.id);
        
        if (error) {
            console.error('Error loading schedule:', error);
            return;
        }
        
        scheduleList.innerHTML = '';
        
        if (subjectLoads.length === 0) {
            scheduleList.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">No classes scheduled</td></tr>';
            return;
        }
        
        subjectLoads.forEach(load => {
            const timeStart = load.schedule_time_start ? load.schedule_time_start.substring(0, 5) : 'N/A';
            const timeEnd = load.schedule_time_end ? load.schedule_time_end.substring(0, 5) : 'N/A';
            const gradeLevel = load.classes?.grade_level || '';
            const sectionName = load.classes?.section_name || '';
            
            const row = document.createElement('tr');
            row.className = 'hover:bg-blue-50/50 transition-all border-b border-gray-50 last:border-0 group';
            row.innerHTML = `
                <td class="px-6 py-4 text-xs font-bold text-gray-500 font-mono">${timeStart} - ${timeEnd}</td>
                <td class="px-6 py-4 font-bold text-gray-800 text-sm">${load.subject_name}</td>
                <td class="px-6 py-4 text-xs font-bold text-blue-600 uppercase tracking-wide">${gradeLevel} - ${sectionName}</td>
                <td class="px-6 py-4"><span class="px-2 py-1 bg-gray-100 text-gray-500 rounded-md text-[10px] font-black uppercase tracking-widest border border-gray-200">Scheduled</span></td>
            `;
            scheduleList.appendChild(row);
        });
        
    } catch (err) {
        console.error('Error in loadSchedule:', err);
    }
}

// 6. Load Homeroom Students with Real-time Gate Status
async function loadHomeroomStudents() {
    const studentList = document.getElementById('homeroom-student-list');
    const searchInput = document.getElementById('student-search');
    const searchQuery = searchInput ? searchInput.value.toLowerCase() : '';

    if (!studentList) return;
    
    try {
        const today = new Date().toISOString().split('T')[0];

        // Get teacher's homeroom class
        const { data: teacherClass, error: classError } = await supabase
            .from('classes')
            .select('id, grade_level, section_name')
            .eq('adviser_id', currentUser.id)
            .single();

        if (classError || !teacherClass) {
            studentList.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-500">No advisory class assigned.</td></tr>';
            return;
        }

        // Update header with class info
        const classInfoEl = document.getElementById('homeroom-class-info');
        if (classInfoEl) {
            classInfoEl.innerText = `${teacherClass.grade_level} - ${teacherClass.section_name}`;
        }

        // Fetch Students + Today's Gate Logs
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

        const allClassStudents = students || [];

        // Filter students based on search query
        const filteredStudents = allClassStudents.filter(student => 
            student.full_name.toLowerCase().includes(searchQuery) || 
            student.student_id_text.toLowerCase().includes(searchQuery)
        );

        // Calculate attendance rate based on the entire class
        const presentCount = allClassStudents.filter(s => {
            const log = s.attendance_logs.find(l => l.log_date === today);
            return log && log.status !== 'Absent';
        }).length;
        const totalStudents = allClassStudents.length;
        const rate = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;
        
        const rateEl = document.getElementById('attendance-rate');
        if (rateEl) rateEl.innerText = `${rate}%`;

        studentList.innerHTML = '';

        if (filteredStudents.length === 0) {
            studentList.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-500">No students found.</td></tr>';
            return;
        }

        // Render the filtered list
        filteredStudents.forEach(student => {
            const log = student.attendance_logs.find(l => l.log_date === today);
            const timeIn = log && log.time_in ? formatTime(log.time_in) : '--:--';
            
            let status = log ? log.status : 'Absent';
            const statusBadge = getStatusBadge(status);
            
            let gateStatus = '';
            if (log && log.time_in) {
                gateStatus = log.time_out ? 'Outside' : 'Inside';
            }

            const row = document.createElement('tr');
            row.className = 'hover:bg-blue-50/50 transition-all border-b border-gray-50 last:border-0 group';
            row.innerHTML = `
                <td class="px-6 py-4 text-[10px] font-bold text-gray-400 font-mono uppercase tracking-widest">${student.student_id_text}</td>
                <td class="px-6 py-4 font-bold text-gray-800 text-sm">${student.full_name}</td>
                <td class="px-6 py-4 text-xs text-gray-500 font-mono">${student.lrn}</td>
                <td class="px-6 py-4 text-xs font-bold text-gray-600">${timeIn}</td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${statusBadge}">
                        ${status}
                    </span>
                    ${gateStatus ? `<span class="ml-1 text-[10px] font-bold text-gray-400 uppercase">(${gateStatus})</span>` : ''}
                </td>
                <td class="px-6 py-4">
                    <select onchange="markAttendance('${student.id}', this.value)" 
                        class="text-xs font-bold text-gray-600 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm">
                        <option value="">Action...</option>
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

// 7. Mark Attendance for Homeroom
async function markAttendance(studentId, status) {
    if (!status) return;
    
    try {
        const today = new Date().toISOString().split('T')[0];
        const now = new Date().toISOString();
        
        let displayStatus = status;
        if (status === 'Present') displayStatus = 'On Time';
        
        const { data: existingLog } = await supabase
            .from('attendance_logs')
            .select('time_in, remarks')
            .eq('student_id', studentId)
            .eq('log_date', today)
            .single();
            
        let safeTimeIn = null;
        if (status !== 'Absent') {
            safeTimeIn = existingLog?.time_in ? existingLog.time_in : now;
        }

        let safeRemarks = existingLog?.remarks || '';
        if (!safeRemarks.includes('Manual override')) {
            safeRemarks = safeRemarks ? `${safeRemarks} | Manual override by Teacher` : 'Manual override by Teacher';
        }

        const { error } = await supabase
            .from('attendance_logs')
            .upsert({
                student_id: studentId,
                log_date: today,
                time_in: safeTimeIn,
                status: displayStatus,
                remarks: safeRemarks
            }, {
                onConflict: 'student_id, log_date'
            });
        
        if (error) {
            console.error('Error marking attendance:', error);
            showNotification('Error marking attendance. Please try again.', "error");
            return;
        }

        // If this was an update, notify the parent of the correction
        if (existingLog) {
            const { data: student } = await supabase.from('students').select('parent_id, full_name').eq('id', studentId).single();
            if (student && student.parent_id) {
                await supabase.from('notifications').insert({
                    recipient_id: student.parent_id,
                    recipient_role: 'parent',
                    title: 'Attendance Correction',
                    message: `Attendance for ${student.full_name} on ${new Date(today).toLocaleDateString()} was updated to: ${displayStatus}.`,
                    type: 'attendance_correction'
                });
            }
        }

        await loadHomeroomStudents();
        
    } catch (err) {
        console.error('Exception marking attendance:', err);
        showNotification('Error marking attendance. Please try again.', "error");
    }
}

// 8. Load Subject Loads for Subject Attendance Page
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

// 9. Load Students for Selected Subject
async function loadSubjectStudents(subjectLoadId) {
    const studentList = document.getElementById('subject-student-list');
    if (!studentList || !subjectLoadId) {
        if (studentList) studentList.innerHTML = '';
        return;
    }
    
    try {
        const { data: subjectLoad } = await supabase
            .from('subject_loads')
            .select('class_id, subject_name')
            .eq('id', subjectLoadId)
            .single();
        
        if (!subjectLoad) return;
        
        const { data: students, error } = await supabase
            .from('students')
            .select('id, student_id_text, full_name')
            .eq('class_id', subjectLoad.class_id)
            .order('full_name');
        
        if (error) {
            console.error('Error loading students:', error);
            return;
        }
        
        studentList.innerHTML = '';
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'mb-4';
        infoDiv.innerHTML = `<h3 class="font-bold text-lg">${subjectLoad.subject_name} - Attendance</h3>`;
        studentList.appendChild(infoDiv);
        
        students.forEach(student => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between p-4 border-b border-gray-50 hover:bg-blue-50/50 transition-all group';
            row.innerHTML = `
                <div>
                    <span class="text-[10px] font-bold text-gray-400 font-mono uppercase tracking-widest">${student.student_id_text}</span>
                    <span class="ml-2 font-bold text-gray-800 text-sm">${student.full_name}</span>
                </div>
                <div class="flex gap-2 opacity-60 group-hover:opacity-100 transition-all">
                    <button onclick="markSubjectAttendance('${student.id}', 'Present')" class="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all">Present</button>
                    <button onclick="markSubjectAttendance('${student.id}', 'Absent')" class="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all">Absent</button>
                    <button onclick="markSubjectAttendance('${student.id}', 'Excused')" class="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all">Excused</button>
                </div>
            `;
            studentList.appendChild(row);
        });
        
    } catch (err) {
        console.error('Error in loadSubjectStudents:', err);
    }
}

// 10. Mark Subject-Specific Attendance
async function markSubjectAttendance(studentId, subjectLoadId, subjectName, newStatus) {
    try {
        const today = new Date().toISOString().split('T')[0];

        // 1. Fetch the existing log to preserve its data
        const { data: existingLog, error: fetchError } = await supabase
            .from('attendance_logs')
            .select('remarks')
            .eq('student_id', studentId)
            .eq('log_date', today)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') throw fetchError; // Ignore "not found" errors

        // 2. Cleanly update remarks
        let remarks = existingLog?.remarks || '';
        const remarkRegex = new RegExp(`\\[${subjectName}: (Present|Absent|Excused)\\]`, 'g');
        remarks = remarks.replace(remarkRegex, '').trim(); // Remove old status for this subject
        remarks = `${remarks} [${subjectName}: ${newStatus}]`.trim(); // Add new status

        // 3. Upsert the log, preserving original status and time_in if they exist
        const { error: upsertError } = await supabase.from('attendance_logs').upsert({
            student_id: studentId,
            log_date: today,
            remarks: remarks
        }, { 
            onConflict: 'student_id, log_date',
            ignoreDuplicates: false 
        });

        if (upsertError) throw upsertError;

        showNotification(`${subjectName} attendance marked as ${newStatus}.`, 'success');
        // Re-render the specific list to show the change
        loadSubjectStudents(subjectLoadId);

    } catch (err) {
        console.error('Error marking subject attendance:', err);
        showNotification('Failed to mark subject attendance.', "error");
    }
}

// 11. Load Clinic Pass Interface
async function loadClinicPassInterface() {
    const studentSelect = document.getElementById('clinic-student-select');
    if (!studentSelect) return;
    
    try {
        const { data: teacherClass } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();
        
        if (!teacherClass) {
            studentSelect.innerHTML = '<option value="">Not an adviser</option>';
            return;
        }
        
        const { data: students } = await supabase
            .from('students')
            .select('id, student_id_text, full_name')
            .eq('class_id', teacherClass.id)
            .order('full_name');
        
        studentSelect.innerHTML = '<option value="">Select student...</option>';
        
        students?.forEach(student => {
            const option = document.createElement('option');
            option.value = student.id;
            option.text = `${student.student_id_text} - ${student.full_name}`;
            studentSelect.appendChild(option);
        });
        
        await loadRecentClinicPasses();
        
    } catch (err) {
        console.error('Error loading clinic pass interface:', err);
    }
}

// 12. Issue Clinic Pass
async function issueClinicPass() {
    const studentId = document.getElementById('clinic-student-select').value;
    const reason = document.getElementById('clinic-reason').value;
    
    if (!studentId || !reason) {
        showNotification('Please select a student and enter a reason.', "error");
        return;
    }
    
    try {
        const { error } = await supabase
            .from('clinic_visits')
            .insert({
                student_id: studentId,
                referred_by_teacher_id: currentUser.id,
                reason: reason,
                status: 'Pending'
            });
        
        if (error) {
            showNotification('Error issuing clinic pass: ' + error.message, "error");
            return;
        }
        
        showNotification('Clinic pass issued successfully!', "success");
        document.getElementById('clinic-reason').value = '';
        await loadRecentClinicPasses();
        
    } catch (err) {
        console.error('Error issuing clinic pass:', err);
        showNotification('Error issuing clinic pass. Please try again.', "error");
    }
}

// 13. Load Recent Clinic Passes
async function loadRecentClinicPasses() {
    const passList = document.getElementById('recent-clinic-passes');
    if (!passList) return;
    
    try {
        const { data: passes, error } = await supabase
            .from('clinic_visits')
            .select(`
                *,
                students (student_id_text, full_name)
            `)
            .eq('referred_by_teacher_id', currentUser.id)
            .order('time_in', { ascending: false })
            .limit(10);
        
        if (error) {
            console.error('Error loading clinic passes:', error);
            return;
        }
        
        passList.innerHTML = '';
        
        passes?.forEach(pass => {
            const statusBadge = pass.status === 'Pending' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 
                               pass.status === 'Completed' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-600 border border-gray-200';
            
            const div = document.createElement('div');
            div.className = 'p-4 border-b border-gray-50 hover:bg-gray-50 transition-all rounded-xl';
            div.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <span class="font-bold text-gray-800 text-sm">${pass.students?.full_name}</span>
                        <span class="text-[10px] font-bold text-gray-400 font-mono uppercase tracking-widest ml-2">${pass.students?.student_id_text}</span>
                    </div>
                    <span class="px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${statusBadge}">${pass.status}</span>
                </div>
                <p class="text-xs text-gray-600 mt-2 font-medium bg-gray-50 p-2 rounded-lg border border-gray-100">${pass.reason}</p>
                ${pass.nurse_notes ? `<p class="text-xs text-blue-600 mt-2 font-bold bg-blue-50 p-2 rounded-lg border border-blue-100"><i data-lucide="activity" class="w-3 h-3 inline mr-1"></i> Nurse: ${pass.nurse_notes}</p>` : ''}
                ${pass.nurse_notes && !pass.parent_notified ? `
                    <button onclick="forwardToParent('${pass.id}', '${pass.students?.full_name}')" 
                        class="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-sm">
                        Forward to Parent
                    </button>
                ` : ''}
            `;
            passList.appendChild(div);
        });
        
        if (window.lucide) lucide.createIcons();
        
    } catch (err) {
        console.error('Error in loadRecentClinicPasses:', err);
    }
}

// 14. Forward Clinic Findings to Parent
async function forwardToParent(clinicVisitId, studentName) {
    try {
        const { data: visit } = await supabase
            .from('clinic_visits')
            .select('student_id, nurse_notes')
            .eq('id', clinicVisitId)
            .single();
        
        if (!visit) return;
        
        const { data: student } = await supabase
            .from('students')
            .select('parent_id')
            .eq('id', visit.student_id)
            .single();
        
        if (!student?.parent_id) {
            showNotification('No parent linked to this student.', "error");
            return;
        }
        
        await supabase.from('notifications').insert({
            recipient_id: student.parent_id,
            recipient_role: 'parent',
            title: 'Clinic Visit Alert',
            message: `Your child ${studentName} visited the clinic. ${visit.nurse_notes ? 'Notes: ' + visit.nurse_notes : ''}`,
            type: 'clinic_visit'
        });
        
        await supabase
            .from('clinic_visits')
            .update({ parent_notified: true })
            .eq('id', clinicVisitId);
        
        showNotification('Findings forwarded to parent successfully!', "success");
        await loadRecentClinicPasses();
        
    } catch (err) {
        console.error('Error forwarding to parent:', err);
        showNotification('Error forwarding findings. Please try again.', "error");
    }
}

// 15. Load Excuse Letters for Approval
async function loadExcuseLetters() {
    const letterList = document.getElementById('excuse-letter-list');
    if (!letterList) return;
    
    try {
        const { data: teacherClass } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();
        
        if (!teacherClass) {
            letterList.innerHTML = '<div class="p-4 text-center text-gray-500">You are not assigned as an adviser</div>';
            return;
        }
        
        const { data: students } = await supabase
            .from('students')
            .select('id')
            .eq('class_id', teacherClass.id);
        
        const studentIds = students?.map(s => s.id) || [];
        
        if (studentIds.length === 0) {
            letterList.innerHTML = '<div class="p-4 text-center text-gray-500">No students in your class</div>';
            return;
        }
        
        const { data: letters, error } = await supabase
            .from('excuse_letters')
            .select(`
                *,
                students (student_id_text, full_name)
            `)
            .in('student_id', studentIds)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Error loading excuse letters:', error);
            return;
        }
        
        letterList.innerHTML = '';
        
        letters?.forEach(letter => {
            const statusBadge = letter.status === 'Pending' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                               letter.status === 'Approved' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-red-100 text-red-700 border border-red-200';
            
            const div = document.createElement('div');
            div.className = 'bg-white p-6 border border-gray-100 rounded-2xl shadow-sm mb-4';
            div.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <span class="font-bold text-gray-800 text-sm">${letter.students?.full_name}</span>
                        <span class="text-[10px] font-bold text-gray-400 font-mono uppercase tracking-widest ml-2">${letter.students?.student_id_text}</span>
                    </div>
                    <span class="px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${statusBadge}">${letter.status}</span>
                </div>
                <p class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Date Absent: ${letter.date_absent}</p>
                <p class="text-sm text-gray-700 bg-gray-50 p-3 rounded-xl border border-gray-100 mb-3">${letter.reason}</p>
                ${letter.image_proof_url ? `
                    <a href="${letter.image_proof_url}" target="_blank" class="inline-flex items-center gap-2 text-blue-600 text-xs font-bold hover:underline mb-3"><i data-lucide="image" class="w-4 h-4"></i> View Proof Attachment</a>
                ` : ''}
                ${letter.status === 'Pending' ? `
                    <div class="flex gap-2 mt-3">
                        <button onclick="approveExcuseLetter('${letter.id}', '${letter.student_id}', '${letter.date_absent}')" 
                            class="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-sm shadow-emerald-200">Approve</button>
                        <button onclick="rejectExcuseLetter('${letter.id}')" 
                            class="flex-1 bg-white border border-red-200 text-red-500 hover:bg-red-50 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all">Reject</button>
                    </div>
                ` : ''}
            `;
            letterList.appendChild(div);
            if (window.lucide) lucide.createIcons();
        });
        
    } catch (err) {
        console.error('Error in loadExcuseLetters:', err);
    }
}

// 16. Approve Excuse Letter
async function approveExcuseLetter(letterId, studentId, dateAbsent) {
    try {
        await supabase
            .from('excuse_letters')
            .update({ status: 'Approved' })
            .eq('id', letterId);
        
        await supabase
            .from('attendance_logs')
            .upsert({
                student_id: studentId,
                log_date: dateAbsent,
                status: 'Excused',
                remarks: 'Excused via approved excuse letter'
            }, {
                onConflict: 'student_id, log_date'
            });
        
        showNotification('Excuse letter approved and attendance marked as Excused.', "success");
        await loadExcuseLetters();
        
    } catch (err) {
        console.error('Error approving excuse letter:', err);
        showNotification('Error approving excuse letter. Please try again.', "error");
    }
}

// 17. Reject Excuse Letter
async function rejectExcuseLetter(letterId) {
    const reason = prompt('Reason for rejection:');
    if (reason === null) return;
    
    try {
        await supabase
            .from('excuse_letters')
            .update({ 
                status: 'Rejected',
                teacher_remarks: reason || 'Rejected by teacher'
            })
            .eq('id', letterId);
        
        showNotification('Excuse letter rejected.', "success");
        await loadExcuseLetters();
        
    } catch (err) {
        console.error('Error rejecting excuse letter:', err);
        showNotification('Error rejecting excuse letter. Please try again.', "error");
    }
}

// 18. Load Analytics
async function loadAnalytics() {
    await loadAttendancePieChart();
    await loadMonthlyBarChart();
}

// 19. Attendance Pie Chart
async function loadAttendancePieChart() {
    const ctx = document.getElementById('attendancePieChart');
    if (!ctx) return;
    
    try {
        const { data: teacherClass } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();
        
        if (!teacherClass) return;
        
        const today = new Date().toISOString().split('T')[0];
        const { data: students } = await supabase
            .from('students')
            .select('id')
            .eq('class_id', teacherClass.id);
        
        const studentIds = students?.map(s => s.id) || [];
        const { data: attendanceLogs } = await supabase
            .from('attendance_logs')
            .select('status')
            .eq('log_date', today)
            .in('student_id', studentIds);
        
        let present = 0, absent = 0, late = 0, excused = 0;
        attendanceLogs?.forEach(log => {
            if (log.status === 'On Time' || log.status === 'Present') present++;
            else if (log.status === 'Absent') absent++;
            else if (log.status === 'Late') late++;
            else if (log.status === 'Excused') excused++;
        });
        
        new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Present', 'Absent', 'Late', 'Excused'],
                datasets: [{
                    data: [present, absent, late, excused],
                    backgroundColor: ['#22c55e', '#ef4444', '#eab308', '#3b82f6']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: "Today's Attendance"
                    }
                }
            }
        });
        
    } catch (err) {
        console.error('Error loading pie chart:', err);
    }
}

// 20. Monthly Bar Chart
async function loadMonthlyBarChart() {
    const ctx = document.getElementById('monthlyBarChart');
    if (!ctx) return;
    
    try {
        const { data: teacherClass } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();
        
        if (!teacherClass) return;
        
        const dates = [];
        const presentData = [];
        const absentData = [];
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            dates.push(date.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }));
            
            const { data: logs } = await supabase
                .from('attendance_logs')
                .select('status')
                .eq('log_date', dateStr);
            
            let present = 0, absent = 0;
            logs?.forEach(log => {
                if (log.status === 'On Time' || log.status === 'Present' || log.status === 'Late') present++;
                else if (log.status === 'Absent') absent++;
            });
            
            presentData.push(present);
            absentData.push(absent);
        }
        
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dates,
                datasets: [
                    { label: 'Present', data: presentData, backgroundColor: '#22c55e' },
                    { label: 'Absent', data: absentData, backgroundColor: '#ef4444' }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Weekly Attendance Trend'
                    }
                },
                scales: {
                    x: { stacked: false },
                    y: { stacked: false, beginAtZero: true }
                }
            }
        });
        
    } catch (err) {
        console.error('Error loading bar chart:', err);
    }
}

// 21. Load Announcements Board
async function loadAnnouncementsBoard() {
    await loadExistingAnnouncements();
}

// 22. Load Existing Announcements
async function loadExistingAnnouncements() {
    console.log('Loading existing announcements...');
}

// 23. Post Announcement to Parents (with Confirmation)
async function postAnnouncement() {
    const title = document.getElementById('announcement-title').value;
    const content = document.getElementById('announcement-content').value;
    const scheduleDate = document.getElementById('announcement-date').value;
    const scheduleTime = document.getElementById('announcement-time').value;
    const isUrgent = document.getElementById('announcement-urgent').checked;
    const maxLength = 500;

    if (!title || !content) {
        return showNotification('Please fill in both title and content.', "error");
    }
    if (content.length > maxLength) {
        return showNotification(`Content cannot exceed ${maxLength} characters.`, "error");
    }

    let scheduled_at = new Date();
    let isScheduled = false;
    if (scheduleDate && scheduleTime) {
        scheduled_at = new Date(`${scheduleDate}T${scheduleTime}`);
        isScheduled = true;
        if (scheduled_at < new Date()) {
            return showNotification("Scheduled time cannot be in the past.", "error");
        }
    }

    const confirmationMessage = `
        <div class="text-left space-y-4 p-2">
            <div>
                <p class="text-xs font-bold text-gray-400 uppercase">Title</p>
                <p class="font-semibold text-gray-800">${title}</p>
            </div>
            <div>
                <p class="text-xs font-bold text-gray-400 uppercase">Content</p>
                <p class="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">${content}</p>
            </div>
            <div class="grid grid-cols-2 gap-4 pt-2 border-t">
                <div>
                    <p class="text-xs font-bold text-gray-400 uppercase">Urgency</p>
                    <p class="font-semibold ${isUrgent ? 'text-red-600' : 'text-gray-700'}">${isUrgent ? 'URGENT' : 'Normal'}</p>
                </div>
                <div>
                    <p class="text-xs font-bold text-gray-400 uppercase">Send Time</p>
                    <p class="font-semibold text-gray-700">${isScheduled ? scheduled_at.toLocaleString() : 'Immediately'}</p>
                </div>
            </div>
        </div>
    `;

    showConfirmationModal('Confirm Announcement', confirmationMessage, async () => {
        try {
            const batchId = crypto.randomUUID();
            const { data: teacherClass, error: classError } = await supabase
                .from('classes')
                .select('id')
                .eq('adviser_id', currentUser.id)
                .single();

            if (classError || !teacherClass) {
                throw new Error("You are not an adviser and cannot post class announcements.");
            }

            const { data: students, error: studentError } = await supabase
                .from('students')
                .select('parent_id')
                .eq('class_id', teacherClass.id)
                .not('parent_id', 'is', null);

            if (studentError) throw studentError;

            const parentIds = [...new Set(students.map(s => s.parent_id))];

            if (parentIds.length === 0) {
                throw new Error("No parents found for your homeroom students.");
            }

            const notifications = parentIds.map(parentId => ({
                recipient_id: parentId,
                recipient_role: 'parent',
                title: `Announcement: ${title}`,
                message: content,
                type: 'announcement',
                is_urgent: isUrgent,
                scheduled_at: scheduled_at.toISOString(),
                sender_id: currentUser.id,
                batch_id: batchId
            }));

            const { error: notifError } = await supabase.from('notifications').insert(notifications);

            if (notifError) throw notifError;

            const successMessage = isScheduled 
                ? `Announcement scheduled for ${scheduled_at.toLocaleDateString()} at ${scheduled_at.toLocaleTimeString()}.`
                : `Announcement sent to ${parentIds.length} parents.`;
            
            showNotification(successMessage, "success");
            
            document.getElementById('announcement-title').value = '';
            document.getElementById('announcement-content').value = '';
            document.getElementById('announcement-date').value = '';
            document.getElementById('announcement-time').value = '';
            document.getElementById('announcement-urgent').checked = false;
            const charCounter = document.getElementById('char-counter');
            if (charCounter) charCounter.textContent = '0';
            loadScheduledAnnouncements();
        } catch (err) {
            console.error('Error posting class announcement:', err);
            showNotification(err.message, "error");
        }
    });
}

// 24. Setup Announcement Page
async function setupAnnouncementPage() {
    await loadAnnouncementsBoard();
    await loadScheduledAnnouncements();
    await loadSentAnnouncements();

    const contentArea = document.getElementById('announcement-content');
    const charCounter = document.getElementById('char-counter');
    const maxLength = 500;

    if (contentArea && charCounter) {
        contentArea.addEventListener('input', () => {
            const currentLength = contentArea.value.length;
            charCounter.textContent = currentLength;
            charCounter.parentElement.classList.toggle('text-red-500', currentLength > maxLength);
        });
    }
}

// 25. Load Sent Announcements
async function loadSentAnnouncements() {
    const list = document.getElementById('sent-announcements-list');
    if (!list) return;

    try {
        const { data, error } = await supabase.rpc('get_teacher_announcements', { teacher_id_param: currentUser.id });

        if (error) throw error;

        if (data.length === 0) {
            list.innerHTML = '<p class="text-center text-gray-400 italic">You have not sent any announcements.</p>';
            return;
        }

        list.innerHTML = data.map(ann => `
            <div class="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-bold text-gray-800">${ann.title.replace('Announcement: ', '')}</p>
                        <p class="text-xs text-gray-500 truncate max-w-xs">${ann.message}</p>
                    </div>
                    <div class="text-right">
                        <span class="px-2 py-1 rounded-lg text-xs font-bold ${ann.read_count / ann.total_count > 0.5 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}">
                            ${ann.read_count} / ${ann.total_count} Seen
                        </span>
                    </div>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error("Error loading sent announcements:", err);
        list.innerHTML = '<p class="text-center text-red-500">Could not load sent announcements.</p>';
    }
}

// 26. Open Edit Announcement Modal
async function openEditAnnouncementModal(ann) {
    const scheduledDate = new Date(ann.scheduled_at);
    
    const confirmationMessage = `
        <div class="text-left space-y-4 p-2">
            <input type="hidden" id="edit-batch-id" value="${ann.batch_id}">
            <div>
                <label class="text-xs font-bold text-gray-400 uppercase">Title</label>
                <input id="edit-title" class="w-full mt-1 p-2 border rounded-lg" value="${ann.title.replace('Announcement: ', '')}">
            </div>
            <div>
                <label class="text-xs font-bold text-gray-400 uppercase">Content</label>
                <textarea id="edit-content" class="w-full mt-1 p-2 border rounded-lg" rows="4">${ann.message}</textarea>
            </div>
            <div class="grid grid-cols-2 gap-4 pt-2 border-t">
                <div>
                    <label class="text-xs font-bold text-gray-400 uppercase">Schedule Date</label>
                    <input type="date" id="edit-date" class="w-full mt-1 p-2 border rounded-lg" value="${scheduledDate.toISOString().split('T')[0]}">
                </div>
                <div>
                    <label class="text-xs font-bold text-gray-400 uppercase">Schedule Time</label>
                    <input type="time" id="edit-time" class="w-full mt-1 p-2 border rounded-lg" value="${scheduledDate.toTimeString().substring(0,5)}">
                </div>
            </div>
        </div>
    `;

    showConfirmationModal('Edit Scheduled Announcement', confirmationMessage, submitAnnouncementEdit, 'Save Changes');
}

// 27. Submit Announcement Edit
async function submitAnnouncementEdit() {
    const batchId = document.getElementById('edit-batch-id').value;
    const title = document.getElementById('edit-title').value;
    const content = document.getElementById('edit-content').value;
    const date = document.getElementById('edit-date').value;
    const time = document.getElementById('edit-time').value;
    const scheduled_at = new Date(`${date}T${time}`);

    try {
        const { error } = await supabase.from('notifications')
            .update({
                title: `Announcement: ${title}`,
                message: content,
                scheduled_at: scheduled_at.toISOString()
            })
            .eq('batch_id', batchId);

        if (error) throw error;
        showNotification("Scheduled announcement updated!", "success");
        loadScheduledAnnouncements();
    } catch (err) {
        showNotification("Failed to update announcement.", "error");
    }
}

// 28. Load Scheduled Announcements
async function loadScheduledAnnouncements() {
    const list = document.getElementById('scheduled-announcements-list');
    if (!list) return;

    try {
        const now = new Date().toISOString();
        const { data, error } = await supabase
            .from('notifications')
            .select('id, title, message, scheduled_at, is_urgent, batch_id')
            .eq('sender_id', currentUser.id)
            .gt('scheduled_at', now)
            .order('scheduled_at', { ascending: true });

        if (error) throw error;

        if (data.length === 0) {
            list.innerHTML = '<p class="text-center text-gray-400 italic">No announcements scheduled.</p>';
            return;
        }

        list.innerHTML = data.map(ann => `
            <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                    <p class="font-semibold text-gray-700">${ann.title}</p>
                    <p class="text-xs text-blue-600">Scheduled for: ${new Date(ann.scheduled_at).toLocaleString()}</p>
                </div>
                <div class="flex gap-2">
                    <button onclick='openEditAnnouncementModal(${JSON.stringify(ann)})' class="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Edit"><i data-lucide="edit" class="w-5 h-5"></i></button>
                    <button onclick="cancelScheduledAnnouncement('${ann.batch_id}')" class="p-2 text-red-500 hover:bg-red-100 rounded-lg" title="Cancel">
                        <i data-lucide="x-circle" class="w-5 h-5"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
        if (window.lucide) lucide.createIcons();

    } catch (err) {
        console.error("Error loading scheduled announcements:", err);
        list.innerHTML = '<p class="text-center text-red-500">Could not load scheduled items.</p>';
    }
}

// 29. Cancel Scheduled Announcement
async function cancelScheduledAnnouncement(batchId) {
    if (!confirm("Are you sure you want to cancel this scheduled announcement? This will delete it for all recipients.")) return;
    try {
        const { error } = await supabase.from('notifications').delete().eq('batch_id', batchId);
        if (error) throw error;
        showNotification("Scheduled announcement cancelled.", "success");
        loadScheduledAnnouncements();
    } catch (err) {
        showNotification("Failed to cancel announcement.", "error");
    }
}

// 30. Toggle Gatekeeper Mode
function toggleGatekeeperMode() {
    if (isGatekeeperMode) {
        window.location.href = 'teacher-gatekeeper-mode.html';
    }
}

// 31. Navigate to Section
function navigateTo(section) {
    const routes = {
        'dashboard': 'teacher-dashboard.html',
        'homeroom': 'teacher-homeroom.html',
        'subject': 'teacher-subject-attendance.html',
        'clinic': 'teacher-clinicpass.html',
        'excuse': 'teacher-excuse-letter-approval.html',
        'analytics': 'teacher-data-analytics.html',
        'announcements': 'teacher-announcements-board.html'
    };
    
    if (routes[section]) {
        window.location.href = routes[section];
    }
}

// 32. Initialize Teacher Settings Page
function initializeTeacherSettingsPage() {
    injectPasswordChangeUI();
}

// 33. Inject Styles
function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `@keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } .animate-fade-in-up { animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; } .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }`;
    document.head.appendChild(style);
}

// 34. Show Notification
function showNotification(msg, type='info', callback=null) {
    const existing = document.getElementById('notification-modal');
    if(existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'notification-modal';
    modal.className = 'fixed inset-0 bg-black/50 z-[60] flex items-center justify-center animate-fade-in';
    const iconColor = type === 'success' ? 'text-emerald-500' : type === 'error' ? 'text-red-500' : 'text-blue-600';
    const bgColor = type === 'success' ? 'bg-emerald-50' : type === 'error' ? 'bg-red-50' : 'bg-blue-50';
    const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info';
    const title = type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Information';

    const dndEnabled = localStorage.getItem('educare_dnd_enabled') === 'true';
    if (!dndEnabled) {
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

// 35. Show Confirmation Modal
function showConfirmationModal(title, message, onConfirm, confirmText = 'Confirm & Send') {
    const existing = document.getElementById('confirmation-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'confirmation-modal';
    modal.className = 'fixed inset-0 bg-black/50 z-[60] flex items-center justify-center animate-fade-in p-4';

    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full animate-fade-in-up">
            <div class="p-6 border-b">
                <h3 class="text-xl font-bold text-gray-800">${title}</h3>
            </div>
            <div class="p-6 max-h-[60vh] overflow-y-auto">${message}</div>
            <div class="p-4 bg-gray-50 rounded-b-2xl flex justify-end gap-3">
                <button id="confirm-cancel-btn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold text-sm hover:bg-gray-300 transition-all">Cancel</button>
                <button id="confirm-action-btn" class="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition-all">${confirmText}</button>
            </div>
        </div>`;

    document.body.appendChild(modal);

    document.getElementById('confirm-cancel-btn').onclick = () => modal.remove();
    document.getElementById('confirm-action-btn').onclick = () => {
        onConfirm();
        modal.remove();
    };
    if(window.lucide) lucide.createIcons();
}

// 36. Print Homeroom List
function printHomeroomList() {
    const printStyles = `
        @media print {
            body * {
                visibility: hidden;
            }
            .printable-area, .printable-area * {
                visibility: visible;
            }
            .printable-area {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                padding: 2rem;
            }
            .non-printable {
                display: none !important;
            }
            table {
                width: 100%;
                border-collapse: collapse;
            }
            th, td {
                border: 1px solid #ddd;
                padding: 8px;
                text-align: left;
            }
            th {
                background-color: #f2f2f2;
            }
        }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = printStyles;
    document.head.appendChild(styleSheet);
    window.print();
    setTimeout(() => {
        document.head.removeChild(styleSheet);
    }, 500);
}

// 37. Get Status Badge Class
function getStatusBadge(status) {
    switch (status) {
        case 'On Time':
        case 'Present':
            return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
        case 'Late':
            return 'bg-amber-100 text-amber-700 border border-amber-200';
        case 'Absent':
            return 'bg-red-100 text-red-700 border border-red-200';
        case 'Excused':
            return 'bg-blue-100 text-blue-700 border border-blue-200';
        default:
            return 'bg-gray-100 text-gray-500 border border-gray-200';
    }
}

// 38. Format Time
function formatTime(dateStr) {
    if (!dateStr) return '--:--';
    return new Date(dateStr).toLocaleTimeString('en-PH', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    });
}

// 39. Inject Password Change UI
function injectPasswordChangeUI() {
    const container = document.getElementById('settings-container');
    if (!container) return;

    const html = `
        <div class="bg-white rounded-2xl shadow-lg p-6 mt-8">
            <h3 class="font-bold text-xl text-gray-800 mb-4">Change Password</h3>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-500 mb-1">Current Password</label>
                    <input type="password" id="cp-current" class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-500 mb-1">New Password</label>
                    <input type="password" id="cp-new" class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-500 mb-1">Confirm New Password</label>
                    <input type="password" id="cp-confirm" class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
                </div>
            </div>
            <div class="mt-6 flex justify-end">
                <button onclick="submitPasswordChange()" class="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm uppercase tracking-wider hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">Update Password</button>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
}

// 40. Submit Password Change
async function submitPasswordChange() {
    const current = document.getElementById('cp-current').value;
    const newPass = document.getElementById('cp-new').value;
    const confirmPass = document.getElementById('cp-confirm').value;

    if(!current || !newPass || !confirmPass) return showNotification("All password fields are required.", "error");
    if(newPass !== confirmPass) return showNotification("New passwords do not match.", "error");
    if(newPass.length < 6) return showNotification("Password must be at least 6 characters.", "error");

    const user = checkSession('teachers');
    if(!user) return;

    const { data, error } = await supabase.from('teachers').select('id').eq('id', user.id).eq('password', current).single();
    if(error || !data) return showNotification("Incorrect current password.", "error");

    const { error: updateErr } = await supabase.from('teachers').update({ password: newPass }).eq('id', user.id);
    if(updateErr) showNotification(updateErr.message, "error");
    else { 
        showNotification("Password updated successfully!", "success"); 
        ['cp-current', 'cp-new', 'cp-confirm'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '';
        });
    }
}