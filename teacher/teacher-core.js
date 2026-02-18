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
            alert("Unauthorized Access: You do not have Gatekeeper privileges.");
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

// 3f. Handle Session Error
function handleSessionError() {
    alert('Session error. Please login again.');
    window.location.href = '../index.html';
}

// 3a. Load Teacher Identity - Fetches Homeroom Class and Subject Loads
async function loadTeacherIdentity() {
    try {
        // 1. Fetch the class where this teacher is the adviser
        const { data: classData, error: classError } = await supabase
            .from('classes')
            .select('id, grade_level, section_name')
            .eq('adviser_id', currentUser.id)
            .single();

        if (classData) {
            homeroomClass = classData;
            console.log("Homeroom Class:", homeroomClass);
            
            // Update dashboard with homeroom info if element exists
            const homeroomInfo = document.getElementById('homeroom-class-info');
            if (homeroomInfo) {
                homeroomInfo.innerText = `${classData.grade_level} - ${classData.section_name}`;
            }
        }

        // 2. Fetch all subjects this teacher is assigned to
        const { data: loads, error: loadError } = await supabase
            .from('subject_loads')
            .select('*, classes(grade_level, section_name)')
            .eq('teacher_id', currentUser.id);

        if (loads) {
            mySubjectLoads = loads;
            console.log("Subject Loads:", mySubjectLoads);
            
            // Render schedule on dashboard
            renderScheduleOnDashboard();
        }
        
    } catch (err) {
        console.error("Error loading teacher identity:", err);
    }
}

// 3b. Render Schedule on Dashboard - Shows cards with Take Attendance buttons
function renderScheduleOnDashboard() {
    const container = document.getElementById('schedule-list');
    if (!container) return;

    if (mySubjectLoads.length === 0) {
        container.innerHTML = '<p class="text-gray-500 italic p-4">No subjects assigned for today.</p>';
        return;
    }

    container.innerHTML = mySubjectLoads.map(load => `
        <div class="p-4 border-l-4 border-blue-600 bg-gray-50 rounded-r-lg shadow-sm flex justify-between items-center mb-2">
            <div>
                <h4 class="font-bold text-blue-900">${load.subject_name}</h4>
                <p class="text-sm text-gray-600">${load.classes?.grade_level} - ${load.classes?.section_name}</p>
                <p class="text-xs text-gray-400 mt-1">🕒 ${load.schedule_time_start?.substring(0, 5) || ''} - ${load.schedule_time_end?.substring(0, 5) || ''}</p>
            </div>
            <button onclick="navigateToAttendance('${load.id}')" class="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition">
                Take Attendance
            </button>
        </div>
    `).join('');
}

// 3c. Navigate to Subject Attendance page with selected subject
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
        await loadAnnouncementsBoard();
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
            row.className = 'border-b hover:bg-gray-50';
            row.innerHTML = `
                <td class="p-4">${timeStart} - ${timeEnd}</td>
                <td class="p-4 font-bold text-blue-800">${load.subject_name}</td>
                <td class="p-4">${gradeLevel} - ${sectionName}</td>
                <td class="p-4"><span class="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">Scheduled</span></td>
            `;
            scheduleList.appendChild(row);
        });
        
    } catch (err) {
        console.error('Error in loadSchedule:', err);
    }
}

// 6. Load Homeroom Students with Attendance Status
async function loadHomeroomStudents() {
    const studentList = document.getElementById('homeroom-student-list');
    if (!studentList) return;
    
    try {
        // Get teacher's homeroom class
        const { data: teacherClass, error: classError } = await supabase
            .from('classes')
            .select('id, grade_level, section_name')
            .eq('adviser_id', currentUser.id)
            .single();
        
        if (classError || !teacherClass) {
            studentList.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">You are not assigned as an adviser</td></tr>';
            return;
        }
        
        // Update header with class info
        const classInfoEl = document.getElementById('homeroom-class-info');
        if (classInfoEl) {
            classInfoEl.innerText = `${teacherClass.grade_level} - ${teacherClass.section_name}`;
        }
        
        // Get students in this class
        const { data: students, error: studentError } = await supabase
            .from('students')
            .select('id, lrn, student_id_text, full_name')
            .eq('class_id', teacherClass.id)
            .order('full_name');
        
        if (studentError) {
            console.error('Error loading students:', studentError);
            return;
        }
        
        // Get today's attendance logs
        const today = new Date().toISOString().split('T')[0];
        const { data: attendanceLogs } = await supabase
            .from('attendance_logs')
            .select('student_id, status, time_in')
            .eq('log_date', today);
        
        studentList.innerHTML = '';
        
        students.forEach(student => {
            const log = attendanceLogs?.find(l => l.student_id === student.id);
            const status = log?.status || 'Not Marked';
            const timeIn = log?.time_in ? new Date(log.time_in).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '-';
            
            let statusBadge = '';
            switch (status) {
                case 'On Time': statusBadge = '<span class="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">On Time</span>'; break;
                case 'Late': statusBadge = '<span class="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">Late</span>'; break;
                case 'Absent': statusBadge = '<span class="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">Absent</span>'; break;
                case 'Excused': statusBadge = '<span class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">Excused</span>'; break;
                case 'Out': statusBadge = '<span class="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">Out</span>'; break;
                default: statusBadge = '<span class="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">Not Marked</span>';
            }
            
            const row = document.createElement('tr');
            row.className = 'border-b hover:bg-gray-50';
            row.innerHTML = `
                <td class="p-4">${student.student_id_text}</td>
                <td class="p-4 font-medium">${student.full_name}</td>
                <td class="p-4">${student.lrn}</td>
                <td class="p-4">${timeIn}</td>
                <td class="p-4">${statusBadge}</td>
                <td class="p-4">
                    <button onclick="markAttendance('${student.id}', 'On Time')" class="bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-xs mr-1">Present</button>
                    <button onclick="markAttendance('${student.id}', 'Absent')" class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs">Absent</button>
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
    try {
        const today = new Date().toISOString().split('T')[0];
        const now = new Date().toISOString();
        
        // Check if log exists for today
        const { data: existingLog } = await supabase
            .from('attendance_logs')
            .select('id')
            .eq('student_id', studentId)
            .eq('log_date', today)
            .single();
        
        if (existingLog) {
            // Update existing log
            await supabase
                .from('attendance_logs')
                .update({ 
                    status: status,
                    time_in: status === 'Absent' ? null : now,
                    remarks: 'Manually updated by Teacher'
                })
                .eq('id', existingLog.id);
        } else {
            // Insert new log
            await supabase
                .from('attendance_logs')
                .insert({
                    student_id: studentId,
                    log_date: today,
                    time_in: status === 'Absent' ? null : now,
                    status: status,
                    remarks: 'Manually updated by Teacher'
                });
        }
        
        // Refresh the list
        await loadHomeroomStudents();
        
    } catch (err) {
        console.error('Error marking attendance:', err);
        alert('Error marking attendance. Please try again.');
    }
}

// 8. Load Subject Loads for Subject Attendance Page
async function loadSubjectLoads() {
    const subjectSelect = document.getElementById('subject-select');
    const subjectList = document.getElementById('subject-attendance-list');
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
        studentList.innerHTML = '';
        return;
    }
    
    try {
        // Get the class_id for this subject load
        const { data: subjectLoad } = await supabase
            .from('subject_loads')
            .select('class_id, subject_name')
            .eq('id', subjectLoadId)
            .single();
        
        if (!subjectLoad) return;
        
        // Get students in this class
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
        
        // Header info
        const infoDiv = document.createElement('div');
        infoDiv.className = 'mb-4';
        infoDiv.innerHTML = `<h3 class="font-bold text-lg">${subjectLoad.subject_name} - Attendance</h3>`;
        studentList.appendChild(infoDiv);
        
        students.forEach(student => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between p-3 border-b hover:bg-gray-50';
            row.innerHTML = `
                <div>
                    <span class="font-medium">${student.student_id_text}</span>
                    <span class="ml-2">${student.full_name}</span>
                </div>
                <div class="flex gap-2">
                    <button onclick="markSubjectAttendance('${student.id}', 'Present')" class="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm">Present</button>
                    <button onclick="markSubjectAttendance('${student.id}', 'Absent')" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm">Absent</button>
                    <button onclick="markSubjectAttendance('${student.id}', 'Excused')" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm">Excused</button>
                </div>
            `;
            studentList.appendChild(row);
        });
        
    } catch (err) {
        console.error('Error in loadSubjectStudents:', err);
    }
}

// 10. Mark Subject-Specific Attendance
async function markSubjectAttendance(studentId, status) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const now = new Date().toISOString();
        
        // For subject attendance, we mark with subject-specific remark
        await supabase
            .from('attendance_logs')
            .upsert({
                student_id: studentId,
                log_date: today,
                time_in: status === 'Absent' ? null : now,
                status: status === 'Excused' ? 'Excused' : (status === 'Present' ? 'On Time' : 'Absent'),
                remarks: `Subject attendance marked by teacher`
            }, {
                onConflict: 'student_id, log_date'
            });
        
        // Visual feedback
        event.target.classList.add('scale-95');
        setTimeout(() => event.target.classList.remove('scale-95'), 100);
        
    } catch (err) {
        console.error('Error marking subject attendance:', err);
        alert('Error marking attendance. Please try again.');
    }
}

// 11. Load Clinic Pass Interface
async function loadClinicPassInterface() {
    const studentSelect = document.getElementById('clinic-student-select');
    if (!studentSelect) return;
    
    try {
        // Get homeroom students
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
        
        // Load recent clinic passes
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
        alert('Please select a student and enter a reason.');
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
            alert('Error issuing clinic pass: ' + error.message);
            return;
        }
        
        alert('Clinic pass issued successfully!');
        document.getElementById('clinic-reason').value = '';
        await loadRecentClinicPasses();
        
    } catch (err) {
        console.error('Error issuing clinic pass:', err);
        alert('Error issuing clinic pass. Please try again.');
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
            const statusBadge = pass.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : 
                               pass.status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
            
            const div = document.createElement('div');
            div.className = 'p-3 border-b';
            div.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <span class="font-medium">${pass.students?.full_name}</span>
                        <span class="text-sm text-gray-500 ml-2">${pass.students?.student_id_text}</span>
                    </div>
                    <span class="px-2 py-1 rounded text-xs ${statusBadge}">${pass.status}</span>
                </div>
                <p class="text-sm text-gray-600 mt-1">${pass.reason}</p>
                ${pass.nurse_notes ? `<p class="text-sm text-blue-600 mt-1"><strong>Nurse:</strong> ${pass.nurse_notes}</p>` : ''}
                ${pass.nurse_notes && !pass.parent_notified ? `
                    <button onclick="forwardToParent('${pass.id}', '${pass.students?.full_name}')" 
                        class="mt-2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm">
                        Forward to Parent
                    </button>
                ` : ''}
            `;
            passList.appendChild(div);
        });
        
    } catch (err) {
        console.error('Error in loadRecentClinicPasses:', err);
    }
}

// 14. Forward Clinic Findings to Parent
async function forwardToParent(clinicVisitId, studentName) {
    try {
        // Get student info
        const { data: visit } = await supabase
            .from('clinic_visits')
            .select('student_id, nurse_notes')
            .eq('id', clinicVisitId)
            .single();
        
        if (!visit) return;
        
        // Get parent ID
        const { data: student } = await supabase
            .from('students')
            .select('parent_id')
            .eq('id', visit.student_id)
            .single();
        
        if (!student?.parent_id) {
            alert('No parent linked to this student.');
            return;
        }
        
        // Create notification for parent
        await supabase.from('notifications').insert({
            recipient_id: student.parent_id,
            recipient_role: 'parent',
            title: 'Clinic Visit Alert',
            message: `Your child ${studentName} visited the clinic. ${visit.nurse_notes ? 'Notes: ' + visit.nurse_notes : ''}`,
            type: 'clinic_visit'
        });
        
        // Mark as notified
        await supabase
            .from('clinic_visits')
            .update({ parent_notified: true })
            .eq('id', clinicVisitId);
        
        alert('Findings forwarded to parent successfully!');
        await loadRecentClinicPasses();
        
    } catch (err) {
        console.error('Error forwarding to parent:', err);
        alert('Error forwarding findings. Please try again.');
    }
}

// 15. Load Excuse Letters for Approval
async function loadExcuseLetters() {
    const letterList = document.getElementById('excuse-letter-list');
    if (!letterList) return;
    
    try {
        // Get teacher's homeroom class
        const { data: teacherClass } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();
        
        if (!teacherClass) {
            letterList.innerHTML = '<div class="p-4 text-center text-gray-500">You are not assigned as an adviser</div>';
            return;
        }
        
        // Get students in this class
        const { data: students } = await supabase
            .from('students')
            .select('id')
            .eq('class_id', teacherClass.id);
        
        const studentIds = students?.map(s => s.id) || [];
        
        if (studentIds.length === 0) {
            letterList.innerHTML = '<div class="p-4 text-center text-gray-500">No students in your class</div>';
            return;
        }
        
        // Get excuse letters for these students
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
            const statusBadge = letter.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                               letter.status === 'Approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
            
            const div = document.createElement('div');
            div.className = 'bg-white p-4 border rounded mb-4';
            div.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <span class="font-bold">${letter.students?.full_name}</span>
                        <span class="text-sm text-gray-500 ml-2">${letter.students?.student_id_text}</span>
                    </div>
                    <span class="px-2 py-1 rounded text-xs ${statusBadge}">${letter.status}</span>
                </div>
                <p class="text-sm"><strong>Date Absent:</strong> ${letter.date_absent}</p>
                <p class="text-sm"><strong>Reason:</strong> ${letter.reason}</p>
                ${letter.image_proof_url ? `
                    <a href="${letter.image_proof_url}" target="_blank" class="text-blue-500 text-sm hover:underline">View Proof</a>
                ` : ''}
                ${letter.status === 'Pending' ? `
                    <div class="flex gap-2 mt-3">
                        <button onclick="approveExcuseLetter('${letter.id}', '${letter.student_id}', '${letter.date_absent}')" 
                            class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded text-sm">Approve</button>
                        <button onclick="rejectExcuseLetter('${letter.id}')" 
                            class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded text-sm">Reject</button>
                    </div>
                ` : ''}
            `;
            letterList.appendChild(div);
        });
        
    } catch (err) {
        console.error('Error in loadExcuseLetters:', err);
    }
}

// 16. Approve Excuse Letter
async function approveExcuseLetter(letterId, studentId, dateAbsent) {
    try {
        // Update excuse letter status
        await supabase
            .from('excuse_letters')
            .update({ status: 'Approved' })
            .eq('id', letterId);
        
        // Update attendance log for that date
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
        
        alert('Excuse letter approved and attendance marked as Excused.');
        await loadExcuseLetters();
        
    } catch (err) {
        console.error('Error approving excuse letter:', err);
        alert('Error approving excuse letter. Please try again.');
    }
}

// 17. Reject Excuse Letter
async function rejectExcuseLetter(letterId) {
    const reason = prompt('Reason for rejection:');
    if (reason === null) return; // User cancelled
    
    try {
        await supabase
            .from('excuse_letters')
            .update({ 
                status: 'Rejected',
                teacher_remarks: reason || 'Rejected by teacher'
            })
            .eq('id', letterId);
        
        alert('Excuse letter rejected.');
        await loadExcuseLetters();
        
    } catch (err) {
        console.error('Error rejecting excuse letter:', err);
        alert('Error rejecting excuse letter. Please try again.');
    }
}

// 18. Load Analytics
async function loadAnalytics() {
    // Chart.js is loaded via CDN in HTML
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
        
        // Get last 7 days of data
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

// 22. Post Announcement to Parents
async function postAnnouncement() {
    const title = document.getElementById('announcement-title').value;
    const content = document.getElementById('announcement-content').value;
    
    if (!title || !content) {
        alert('Please fill in both title and content.');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('announcements')
            .insert({
                title: title,
                content: content,
                posted_by_admin_id: currentUser.id,
                target_parents: true,
                target_teachers: false,
                target_guards: false,
                target_clinic: false
            });
        
        if (error) {
            alert('Error posting announcement: ' + error.message);
            return;
        }
        
        alert('Announcement posted successfully!');
        document.getElementById('announcement-title').value = '';
        document.getElementById('announcement-content').value = '';
        await loadExistingAnnouncements();
        
    } catch (err) {
        console.error('Error posting announcement:', err);
        alert('Error posting announcement. Please try again.');
    }
}

// 24. Toggle Gatekeeper Mode
function toggleGatekeeperMode() {
    if (isGatekeeperMode) {
        window.location.href = '../guard/guard-dashboard.html';
    }
}

// 25. Navigate to Section
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
