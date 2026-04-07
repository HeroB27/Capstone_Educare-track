// teacher/teacher-core.js
// Complete Teacher Module Core – All features included (Fixed Excuse Letters)

const DEBUG = false;

// ==========================================
// SESSION & GLOBAL VARIABLES
// ==========================================
var currentUser = checkSession('teachers');

let homeroomClass = null;
let mySubjectLoads = [];
let isGatekeeperMode = false;
let isAdviserMode = false;

// Excuse letter filtering
let currentExcuseFilter = 'pending';
let cachedExcuseLetters = [];

if (currentUser && currentUser.is_gatekeeper === true) {
    isGatekeeperMode = true;
    if (DEBUG) console.log('Gatekeeper mode enabled');
}

// Helper: safe random UUID
function safeRandomUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    if (!currentUser) return;

    // Set welcome message with time-based greeting
    const nameEl = document.getElementById('teacher-name');
    if (nameEl) {
        const now = new Date();
        const day = now.getDay();
        const hour = now.getHours();
        let greeting;
        if (day === 0) greeting = 'Happy Sunday';
        else if (day === 6) greeting = 'Happy Saturday';
        else if (hour < 12) greeting = 'Good Morning';
        else if (hour < 18) greeting = 'Good Afternoon';
        else greeting = 'Good Evening';
        nameEl.innerText = `${greeting}, ${currentUser.full_name.split(' ')[0]}`;
    }

    // Show gatekeeper toggle if applicable
    const gatekeeperToggle = document.getElementById('gatekeeper-toggle');
    if (gatekeeperToggle && isGatekeeperMode) gatekeeperToggle.classList.remove('hidden');

    await initializeTeacherPortal();
    await initTeacherPage();
    injectStyles();
});

async function initializeTeacherPortal() {
    if (sessionStorage.getItem('teacher_identity_loaded') === 'true') {
        if (DEBUG) console.log('Teacher identity already loaded from session');
        return;
    }

    try {
        const { data: teacher, error } = await supabase
            .from('teachers')
            .select('*, classes(id, grade_level, department)')
            .eq('id', currentUser.id)
            .single();

        if (error) throw error;

        isAdviserMode = teacher.classes !== null;

        // Block gatekeeper page if not authorized
        const currentPage = window.location.pathname;
        if (currentPage.includes('teacher-gatekeeper-mode.html') && !teacher.is_gatekeeper) {
            showNotification("Unauthorized Access: You do not have Gatekeeper privileges.", "error");
            window.location.href = 'teacher-dashboard.html';
            return;
        }

        // Update advisory badge
        const badgeEl = document.getElementById('advisory-badge');
        if (badgeEl) {
            if (isAdviserMode) {
                badgeEl.innerText = `Adviser: ${teacher.classes?.grade_level || 'Unassigned'}-${teacher.classes?.department || 'N/A'}`;
                loadHomeroomStats(teacher.classes?.id);
            } else {
                badgeEl.innerText = "Subject Teacher";
                hideAdvisoryOnlyFeatures();
                const statsContainer = document.getElementById('stats-container');
                if (statsContainer) statsContainer.style.display = 'none';
            }
        }

        await loadTeacherSchedule(teacher.id);
        sessionStorage.setItem('teacher_identity_loaded', 'true');
        if (DEBUG) console.log('Teacher Portal Initialized:', isAdviserMode ? 'Adviser Mode' : 'Subject Teacher Mode');

    } catch (err) {
        console.error('Error in initializeTeacherPortal:', err);
        handleSessionError();
    }
}

function hideAdvisoryOnlyFeatures() {
    document.querySelectorAll('.advisory-only').forEach(el => el.style.display = 'none');
}

async function loadTeacherSchedule(teacherId) {
    try {
        const { data: subjectLoads, error } = await supabase
            .from('subject_loads')
            .select('*, classes(grade_level, department)')
            .eq('teacher_id', teacherId);

        if (error) throw error;

        if (subjectLoads) {
            mySubjectLoads = subjectLoads;
            renderScheduleOnDashboard();
        }
    } catch (err) {
        console.error('Error loading teacher schedule:', err);
    }
}

function renderScheduleOnDashboard() {
    const container = document.getElementById('schedule-list');
    if (!container) return;

    if (mySubjectLoads.length === 0) {
        container.innerHTML = '<p class="text-gray-500 italic p-4">No subjects assigned for today.</p>';
        return;
    }

    container.innerHTML = mySubjectLoads.map(load => `
        <div onclick="navigateToAttendance('${load.id}')" class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:border-blue-400 hover:shadow-md transition-all group mb-4 flex justify-between items-center cursor-pointer">
            <div>
                <h4 class="font-black text-gray-800 text-lg leading-tight group-hover:text-blue-600 transition-colors">${load.subject_name || 'Unknown Subject'}</h4>
                <p class="text-xs font-bold text-blue-600 uppercase mt-1 tracking-wide">
                    ${load.classes?.grade_level || 'Unknown Grade'} - ${load.classes?.department || 'No Section'}
                </p>
                <div class="flex items-center gap-2 mt-3 text-emerald-500 text-[10px] font-black uppercase tracking-widest">
                    <i data-lucide="check-circle-2" class="w-3 h-3"></i>
                    ASYNCHRONOUS CLASS (OPEN ALL DAY)
                </div>
            </div>
            <button class="px-5 py-3 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                Open Checker
            </button>
        </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
}

window.navigateToAttendance = function(subjectLoadId) {
    if (!subjectLoadId) return;
    sessionStorage.setItem('selectedSubjectLoadId', subjectLoadId);
    window.location.href = 'teacher-subject-attendance.html';
};

function handleSessionError() {
    showNotification('Session error. Please login again.', "error");
    window.location.href = '../index.html';
}

async function initTeacherPage() {
    const path = window.location.pathname;

    if (path.includes('teacher-homeroom')) {
        await loadHomeroomStudents();
    } else if (path.includes('teacher-subject-attendance')) {
        await loadSubjectLoads();
        const storedSubjectId = sessionStorage.getItem('selectedSubjectLoadId');
        if (storedSubjectId) {
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
        await loadSchedule();
    }
}

// ==========================================
// DASHBOARD SCHEDULE
// ==========================================
async function loadSchedule() {
    const scheduleList = document.getElementById('schedule-list');
    if (!scheduleList) return;

    try {
        const { data: subjectLoads, error } = await supabase
            .from('subject_loads')
            .select(`*, classes (grade_level, department)`)
            .eq('teacher_id', currentUser.id);

        if (error) throw error;

        scheduleList.innerHTML = '';

        if (subjectLoads.length === 0) {
            scheduleList.innerHTML = '<p class="text-gray-500 italic p-4">No subjects assigned for today.</p>';
            return;
        }

        subjectLoads.forEach(load => {
            const timeStart = load.schedule_time_start ? load.schedule_time_start.substring(0, 5) : 'N/A';
            const timeEnd = load.schedule_time_end ? load.schedule_time_end.substring(0, 5) : 'N/A';
            const gradeLevel = load.classes?.grade_level || '';
            const sectionName = load.classes?.department || '';

            const row = document.createElement('div');
            row.className = 'bg-white p-4 rounded-xl border border-gray-100 mb-3 hover:shadow-md transition-all flex justify-between items-center';
            row.innerHTML = `
                <div>
                    <p class="font-bold text-gray-800">${load.subject_name}</p>
                    <p class="text-xs text-gray-500">${gradeLevel} - ${sectionName}</p>
                    <p class="text-xs text-blue-600 font-mono mt-1">${timeStart} - ${timeEnd}</p>
                </div>
                <button onclick="navigateToAttendance('${load.id}')" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-blue-700 transition">Take Attendance</button>
            `;
            scheduleList.appendChild(row);
        });

        if (window.lucide) lucide.createIcons();

    } catch (err) {
        console.error('Error in loadSchedule:', err);
    }
}

// ==========================================
// HOMEROOM ATTENDANCE (Full version)
// ==========================================
window.loadHomeroomStudents = async function() {
    const studentList = document.getElementById('homeroom-student-list');
    const searchInput = document.getElementById('student-search');
    const searchQuery = searchInput ? searchInput.value.toLowerCase() : '';

    if (!studentList) return;

    try {
        const today = new Date().toISOString().split('T')[0];

        const { data: teacherClass, error: classError } = await supabase
            .from('classes')
            .select('id, grade_level, department')
            .eq('adviser_id', currentUser.id)
            .single();

        if (classError || !teacherClass) {
            studentList.innerHTML = '<p class="p-4 text-center text-gray-500">No advisory class assigned.</p>';
            return;
        }

        const classInfoEl = document.getElementById('homeroom-class-info');
        if (classInfoEl) {
            classInfoEl.innerText = `${teacherClass.grade_level || 'Unassigned'} - ${teacherClass.department || 'N/A'}`;
        }

        const { data: students, error: studentError } = await supabase
            .from('students')
            .select(`id, lrn, student_id_text, full_name, attendance_logs(time_in, time_out, status, log_date)`)
            .eq('class_id', teacherClass.id)
            .order('full_name');

        if (studentError) throw studentError;

        const filteredStudents = students.filter(s => 
            s.full_name.toLowerCase().includes(searchQuery) || 
            s.student_id_text.toLowerCase().includes(searchQuery)
        );

        const presentCount = students.filter(s => {
            const log = s.attendance_logs?.find(l => l.log_date === today);
            return log && log.status !== 'Absent';
        }).length;
        const totalStudents = students.length;
        const rate = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

        const rateEl = document.getElementById('attendance-rate');
        if (rateEl) rateEl.innerText = `${rate}%`;

        studentList.innerHTML = '';

        if (filteredStudents.length === 0) {
            studentList.innerHTML = '<p class="p-8 text-center text-gray-500">No students found.</p>';
            return;
        }

        filteredStudents.forEach(student => {
            const log = student.attendance_logs?.find(l => l.log_date === today);
            const timeIn = log && log.time_in ? formatTime(log.time_in) : '--:--';
            let status = log ? log.status : 'Absent';
            const statusBadge = getStatusBadge(status);

            let gateStatus = '';
            if (log && log.time_in) {
                gateStatus = log.time_out ? 'Outside' : 'Inside';
            }

            const row = document.createElement('div');
            row.className = 'flex items-center justify-between p-4 border-b border-gray-50 hover:bg-blue-50/50 transition-all';
            row.setAttribute('data-student-id', student.id);
            row.innerHTML = `
                <div class="flex-1">
                    <p class="font-bold text-gray-800">${student.full_name}</p>
                    <p class="text-xs text-gray-500">${student.student_id_text} | LRN: ${student.lrn}</p>
                </div>
                <div class="text-center w-24">
                    <p class="text-sm font-mono">${timeIn}</p>
                </div>
                <div class="text-center w-28">
                    <span class="px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${statusBadge}">
                        ${status}
                    </span>
                    ${gateStatus ? `<span class="ml-1 text-[10px] font-bold text-gray-400 uppercase">(${gateStatus})</span>` : ''}
                </div>
                <div class="w-36">
                    <select onchange="markAttendance('${student.id}', this.value)" 
                        class="text-xs font-bold text-gray-600 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Action...</option>
                        <option value="On Time">Present (On Time)</option>
                        <option value="Late">Late</option>
                        <option value="Absent">Absent</option>
                        <option value="Excused">Excused</option>
                    </select>
                </div>
            `;
            studentList.appendChild(row);
        });
    } catch (err) {
        console.error('Error in loadHomeroomStudents:', err);
    }
};

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
            }, { onConflict: 'student_id, log_date' });

        if (error) throw error;

        // Update UI immediately
        const studentRow = document.querySelector(`[data-student-id="${studentId}"]`);
        if (studentRow) {
            const statusCell = studentRow.querySelector('.text-center.w-28');
            if (statusCell) {
                const badgeClass = getStatusBadge(displayStatus);
                statusCell.innerHTML = `<span class="px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${badgeClass}">${displayStatus}</span>`;
            }
            const selectCell = studentRow.querySelector('select');
            if (selectCell) selectCell.value = '';
        }

        // Notify parent if attendance changed
        if (existingLog && existingLog.status !== displayStatus) {
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

        showNotification(`Attendance marked as ${displayStatus}`, "success");

    } catch (err) {
        console.error('Exception marking attendance:', err);
        showNotification('Error marking attendance. Please try again.', "error");
    }
}

// ==========================================
// SUBJECT ATTENDANCE (Full version)
// ==========================================
async function loadSubjectLoads() {
    const subjectSelect = document.getElementById('subject-select');
    if (!subjectSelect) return;

    try {
        const { data: subjectLoads, error } = await supabase
            .from('subject_loads')
            .select(`id, subject_name, schedule_time_start, schedule_time_end, classes (grade_level, department)`)
            .eq('teacher_id', currentUser.id);

        if (error) throw error;

        subjectSelect.innerHTML = '<option value="">Select a subject...</option>';

        subjectLoads.forEach(load => {
            const option = document.createElement('option');
            option.value = load.id;
            const timeStart = load.schedule_time_start ? load.schedule_time_start.substring(0,5) : '';
            const timeEnd = load.schedule_time_end ? load.schedule_time_end.substring(0,5) : '';
            option.text = `${load.subject_name} - ${load.classes?.grade_level} ${load.classes?.department} (${timeStart}-${timeEnd})`;
            subjectSelect.appendChild(option);
        });

    } catch (err) {
        console.error('Error in loadSubjectLoads:', err);
    }
}

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

        if (error) throw error;

        studentList.innerHTML = `<h3 class="font-bold text-lg mb-4">${subjectLoad.subject_name} - Attendance</h3>`;

        students.forEach(student => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between p-4 border-b border-gray-50 hover:bg-blue-50/50 transition-all';
            row.innerHTML = `
                <div>
                    <span class="text-[10px] font-bold text-gray-400 font-mono uppercase">${student.student_id_text}</span>
                    <span class="ml-2 font-bold text-gray-800">${student.full_name}</span>
                </div>
                <div class="flex gap-2">
                    <button onclick="markSubjectAttendance('${student.id}', '${subjectLoadId}', '${subjectLoad.subject_name}', 'Present')" class="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase hover:bg-emerald-600 hover:text-white transition">Present</button>
                    <button onclick="markSubjectAttendance('${student.id}', '${subjectLoadId}', '${subjectLoad.subject_name}', 'Absent')" class="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-black uppercase hover:bg-red-600 hover:text-white transition">Absent</button>
                    <button onclick="markSubjectAttendance('${student.id}', '${subjectLoadId}', '${subjectLoad.subject_name}', 'Excused')" class="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase hover:bg-blue-600 hover:text-white transition">Excused</button>
                </div>
            `;
            studentList.appendChild(row);
        });

    } catch (err) {
        console.error('Error in loadSubjectStudents:', err);
    }
}

async function markSubjectAttendance(studentId, subjectLoadId, subjectName, newStatus) {
    try {
        const today = new Date().toISOString().split('T')[0];

        // Check suspension
        if (typeof checkIsHoliday === 'function') {
            const holidayCheck = await checkIsHoliday(today);
            if (holidayCheck.isHoliday && holidayCheck.isSuspended) {
                if (holidayCheck.timeCoverage === 'Full Day') {
                    showWarning(`School is suspended today. Attendance cannot be marked.`);
                    return;
                }
            }
        }

        const { data: existingLog, error: fetchError } = await supabase
            .from('attendance_logs')
            .select('remarks, status, time_in')
            .eq('student_id', studentId)
            .eq('log_date', today)
            .maybeSingle();

        if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

        let remarks = existingLog?.remarks || '';
        const escapedSubjectName = subjectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const remarkRegex = new RegExp(`\\[${escapedSubjectName}: (Present|Absent|Excused|Late)\\]`, 'g');
        remarks = remarks.replace(remarkRegex, '').trim();
        remarks = `${remarks} [${subjectName}: ${newStatus}]`.trim();

        const calculatedStatus = calculateOverallStatus(remarks);

        const { error: upsertError } = await supabase.from('attendance_logs').upsert({
            student_id: studentId,
            log_date: today,
            remarks: remarks,
            status: calculatedStatus,
            time_in: existingLog?.time_in || null
        }, { onConflict: 'student_id, log_date' });

        if (upsertError) throw upsertError;

        showNotification(`${subjectName} attendance marked as ${newStatus}. Overall status: ${calculatedStatus}`, 'success');
        loadSubjectStudents(subjectLoadId);

    } catch (err) {
        console.error('Error marking subject attendance:', err);
        showNotification('Failed to mark subject attendance.', "error");
    }
}

function calculateOverallStatus(remarks) {
    if (!remarks) return 'Present';
    const subjectRegex = /\[([^\]]+): (Present|Absent|Excused|Late)\]/g;
    const subjectStatuses = [];
    let match;
    while ((match = subjectRegex.exec(remarks)) !== null) {
        subjectStatuses.push(match[2]);
    }
    if (subjectStatuses.length === 0) return 'Present';
    if (subjectStatuses.includes('Excused')) return 'Excused';
    if (subjectStatuses.includes('Absent')) return 'Absent';
    if (subjectStatuses.includes('Late')) return 'Late';
    return 'Present';
}

// ==========================================
// CLINIC PASS (Full version)
// ==========================================
async function loadClinicPassInterface() {
    const studentSelect = document.getElementById('clinic-student-select');
    if (!studentSelect) return;

    try {
        const { data: teacherClass } = await supabase
            .from('classes')
            .select('id, grade_level, department')
            .eq('adviser_id', currentUser.id)
            .single();

        const { data: subjectLoads } = await supabase
            .from('subject_loads')
            .select('class_id')
            .eq('teacher_id', currentUser.id);

        const classIds = new Set();
        let homeroomStudents = [];
        let subjectStudents = [];

        if (teacherClass) {
            classIds.add(teacherClass.id);
            const { data: students } = await supabase
                .from('students')
                .select('id, student_id_text, full_name')
                .eq('class_id', teacherClass.id)
                .order('full_name');
            homeroomStudents = students || [];
        }

        if (subjectLoads && subjectLoads.length > 0) {
            subjectLoads.forEach(sl => classIds.add(sl.class_id));
            const { data: students } = await supabase
                .from('students')
                .select('id, student_id_text, full_name, classes(grade_level, department)')
                .in('class_id', Array.from(classIds))
                .order('full_name');
            if (students) {
                const homeroomIds = new Set(homeroomStudents.map(s => s.id));
                subjectStudents = students.filter(s => !homeroomIds.has(s.id));
            }
        }

        if (homeroomStudents.length === 0 && subjectStudents.length === 0) {
            studentSelect.innerHTML = '<option value="">No students assigned</option>';
            return;
        }

        studentSelect.innerHTML = '<option value="">Select student...</option>';
        homeroomStudents.forEach(student => {
            const option = document.createElement('option');
            option.value = student.id;
            option.text = `${student.student_id_text} - ${student.full_name} (Homeroom: ${teacherClass?.grade_level || 'Unassigned'}-${teacherClass?.department || 'N/A'})`;
            studentSelect.appendChild(option);
        });
        subjectStudents.forEach(student => {
            const option = document.createElement('option');
            option.value = student.id;
            const classInfo = student.classes ? `${student.classes?.grade_level || 'Unassigned'}-${student.classes?.department || 'N/A'}` : 'No Class';
            option.text = `${student.student_id_text} - ${student.full_name} (${classInfo})`;
            studentSelect.appendChild(option);
        });

        await loadRecentClinicPasses();
        await loadClinicStats();
        initClinicAutocomplete();

    } catch (err) {
        console.error('Error loading clinic pass interface:', err);
        showNotification('Failed to load clinic pass interface', 'error');
    }
}

function initClinicAutocomplete() {
    const searchInput = document.getElementById('clinic-student-search');
    const dropdown = document.getElementById('clinic-student-dropdown');
    const hiddenSelect = document.getElementById('clinic-student-select');
    const clearBtn = document.getElementById('clear-search-btn');

    if (!searchInput || !dropdown || !hiddenSelect) return;

    function renderDropdown(filterText = '') {
        dropdown.innerHTML = '';
        const options = Array.from(hiddenSelect.options).filter(opt => opt.value !== '');
        let hasResults = false;

        if (options.length === 0) {
            dropdown.innerHTML = '<div class="px-5 py-4 text-sm text-gray-400 italic">No students available</div>';
        } else {
            options.forEach(option => {
                if (option.text.toLowerCase().includes(filterText.toLowerCase())) {
                    hasResults = true;
                    const div = document.createElement('div');
                    div.className = 'px-5 py-3 hover:bg-blue-50 cursor-pointer text-sm font-bold text-gray-700 border-b border-gray-50 flex items-center gap-3';
                    div.innerHTML = `<div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><i data-lucide="user" class="w-4 h-4 text-gray-500"></i></div><span>${option.text}</span>`;
                    div.onclick = () => {
                        hiddenSelect.value = option.value;
                        searchInput.value = option.text;
                        dropdown.classList.add('hidden');
                        clearBtn.classList.remove('hidden');
                    };
                    dropdown.appendChild(div);
                }
            });
            if (!hasResults) dropdown.innerHTML = '<div class="px-5 py-4 text-sm text-gray-400 italic">No student found.</div>';
        }
        dropdown.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    }

    searchInput.addEventListener('focus', () => renderDropdown(searchInput.value));
    searchInput.addEventListener('input', (e) => {
        renderDropdown(e.target.value);
        clearBtn.classList.toggle('hidden', e.target.value === '');
        hiddenSelect.value = '';
    });
    clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        searchInput.value = '';
        hiddenSelect.value = '';
        clearBtn.classList.add('hidden');
        renderDropdown('');
        searchInput.focus();
    });
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target) && !clearBtn.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });
}

async function loadClinicStats() {
    const todayPassesEl = document.getElementById('today-passes');
    const activePassesEl = document.getElementById('active-passes');
    const completedPassesEl = document.getElementById('completed-passes');

    if (!todayPassesEl && !activePassesEl && !completedPassesEl) return;

    try {
        const today = new Date().toISOString().split('T')[0];
        const { data: passes, error } = await supabase
            .from('clinic_visits')
            .select('status, time_in')
            .eq('referred_by_teacher_id', currentUser.id);

        if (error) throw error;

        const todayPasses = passes?.filter(p => p.time_in && p.time_in.startsWith(today)).length || 0;
        const activePasses = passes?.filter(p => ['Pending', 'Approved', 'Checked In'].includes(p.status)).length || 0;
        const completedPasses = passes?.filter(p => ['Completed', 'Cleared', 'Sent Home'].includes(p.status)).length || 0;

        if (todayPassesEl) todayPassesEl.textContent = todayPasses;
        if (activePassesEl) activePassesEl.textContent = activePasses;
        if (completedPassesEl) completedPassesEl.textContent = completedPasses;

    } catch (err) {
        console.error('Error in loadClinicStats:', err);
    }
}

async function loadRecentClinicPasses() {
    const passList = document.getElementById('recent-clinic-passes');
    if (!passList) return;

    try {
        const { data: passes, error } = await supabase
            .from('clinic_visits')
            .select(`*, students (student_id_text, full_name)`)
            .eq('referred_by_teacher_id', currentUser.id)
            .order('time_in', { ascending: false })
            .limit(20);

        if (error) throw error;

        passList.innerHTML = '';

        const statusColors = {
            'Pending': 'bg-amber-100 text-amber-700',
            'Approved': 'bg-blue-100 text-blue-700',
            'Checked In': 'bg-orange-100 text-orange-700',
            'Sent Home': 'bg-red-100 text-red-700',
            'Cleared': 'bg-green-100 text-green-700',
            'Completed': 'bg-green-100 text-green-700',
            'Rejected': 'bg-gray-100 text-gray-700'
        };

        passes?.forEach(pass => {
            const statusBadge = statusColors[pass.status] || 'bg-gray-100 text-gray-600';
            const canForward = (pass.nurse_notes || pass.status === 'Completed') && !pass.parent_notified;

            const forwardButton = canForward
                ? `<button onclick="forwardToParent('${pass.id}', '${pass.students?.full_name}')" 
                    class="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all">
                    📤 Forward Findings to Parent
                  </button>`
                : (pass.parent_notified ? '' : '<p class="mt-3 text-xs text-gray-400 italic">Waiting for nurse findings...</p>');

            const div = document.createElement('div');
            div.className = 'p-4 border-b border-gray-50 hover:bg-gray-50 transition-all rounded-xl';
            div.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-gray-800 text-sm">${pass.students?.full_name}</span>
                            <span class="text-[10px] font-bold text-gray-400 font-mono uppercase">${pass.students?.student_id_text}</span>
                        </div>
                        <p class="text-xs text-gray-600 mt-1">📋 ${pass.reason}</p>
                        ${pass.nurse_notes ? `<p class="text-xs text-blue-600 mt-2 font-bold bg-blue-50 p-2 rounded-lg">💊 Nurse: ${pass.nurse_notes}</p>` : ''}
                        ${pass.action_taken ? `<p class="text-xs text-green-600 mt-2 font-bold bg-green-50 p-2 rounded-lg">✅ Action: ${pass.action_taken}</p>` : ''}
                        ${forwardButton}
                    </div>
                    <div class="text-right">
                        <span class="px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${statusBadge}">${pass.status}</span>
                        ${pass.parent_notified ? '<span class="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">Forwarded</span>' : ''}
                        <p class="text-xs text-gray-400 mt-2">${pass.time_in ? new Date(pass.time_in).toLocaleString() : 'Pending'}</p>
                    </div>
                </div>
            `;
            passList.appendChild(div);
        });

        if (passList.children.length === 0) {
            passList.innerHTML = '<p class="text-gray-500 text-center py-8">No clinic passes issued yet.</p>';
        }

        if (window.lucide) lucide.createIcons();

    } catch (err) {
        console.error('Error in loadRecentClinicPasses:', err);
    }
}

async function issueClinicPass() {
    const studentSelect = document.getElementById('clinic-student-select');
    const reasonInput = document.getElementById('clinic-reason');
    const notifyParent = document.getElementById('send-notification')?.checked;

    const studentId = studentSelect?.value;
    const reason = reasonInput?.value?.trim();

    if (!studentId || !reason) {
        return showNotification('Please select a student and enter a reason.', "error");
    }

    const btn = document.querySelector('button[onclick="issueClinicPass()"]');
    const origText = btn ? btn.innerHTML : '';
    if (btn) { btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Issuing...'; btn.disabled = true; }

    try {
        const authorized = await validateTeacherAuthority(studentId);
        if (!authorized) {
            showNotification('You are not authorized to issue a clinic pass for this student.', "error");
            return;
        }

        const { data: existingPass } = await supabase
            .from('clinic_visits')
            .select('id, status')
            .eq('student_id', studentId)
            .in('status', ['Pending', 'Approved', 'Checked In', 'In Clinic'])
            .is('time_out', null)
            .single();

        if (existingPass) {
            showNotification(`This student already has an active clinic pass (Status: ${existingPass.status}).`, "error");
            return;
        }

        const { data: student } = await supabase
            .from('students')
            .select('full_name, parent_id, class_id, classes(adviser_id)')
            .eq('id', studentId)
            .single();

        const { data: visit, error: visitError } = await supabase
            .from('clinic_visits')
            .insert({
                student_id: studentId,
                referred_by_teacher_id: currentUser.id,
                reason: reason,
                status: 'In Clinic',
                time_in: new Date().toISOString()
            })
            .select()
            .single();

        if (visitError) throw visitError;

        const notifications = [];

        const { data: clinicStaff } = await supabase.from('clinic_staff').select('id, full_name');
        if (clinicStaff && clinicStaff.length > 0) {
            clinicStaff.forEach(staff => {
                notifications.push({
                    recipient_id: staff.id,
                    recipient_role: 'clinic_staff',
                    title: 'New Clinic Referral',
                    message: `${student?.full_name || 'A student'} has been referred to the clinic. Reason: ${reason}`,
                    type: 'clinic_referral',
                    is_read: false
                });
            });
        }

        if (notifyParent && student?.parent_id) {
            notifications.push({
                recipient_role: 'parents',
                recipient_id: student.parent_id,
                title: 'Clinic Pass Issued',
                message: `${student?.full_name || 'Your child'} was sent to the clinic. Reason: ${reason}`,
                type: 'clinic_alert',
                is_read: false
            });
        }

        if (student?.classes?.adviser_id && student.classes.adviser_id !== currentUser.id) {
            notifications.push({
                recipient_role: 'teachers',
                recipient_id: student.classes.adviser_id,
                title: 'Advisory Student in Clinic',
                message: `${student?.full_name || 'A student'} was sent to the clinic by ${currentUser.full_name || 'a teacher'}. Reason: ${reason}`,
                type: 'clinic_alert',
                is_read: false
            });
        }

        if (notifications.length > 0) {
            await supabase.from('notifications').insert(notifications);
        }

        showNotification('Clinic pass issued successfully!', "success");

        studentSelect.value = '';
        reasonInput.value = '';
        const searchInput = document.getElementById('clinic-student-search');
        if (searchInput) searchInput.value = '';
        const clearBtn = document.getElementById('clear-search-btn');
        if (clearBtn) clearBtn.classList.add('hidden');

        await loadRecentClinicPasses();
        await loadClinicStats();

    } catch (err) {
        console.error('Error issuing clinic pass:', err);
        showNotification('Error issuing clinic pass. Please try again.', "error");
    } finally {
        if (btn) { btn.innerHTML = origText; btn.disabled = false; }
        if (window.lucide) lucide.createIcons();
    }
}

async function validateTeacherAuthority(studentId) {
    try {
        const { data: teacherClass } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();

        const { data: subjectLoads } = await supabase
            .from('subject_loads')
            .select('class_id')
            .eq('teacher_id', currentUser.id);

        const authorizedClassIds = new Set();
        if (teacherClass) authorizedClassIds.add(teacherClass.id);
        if (subjectLoads) subjectLoads.forEach(sl => authorizedClassIds.add(sl.class_id));

        const { data: student } = await supabase
            .from('students')
            .select('class_id')
            .eq('id', studentId)
            .single();

        return student ? authorizedClassIds.has(student.class_id) : false;
    } catch (err) {
        console.error('Error validating teacher authority:', err);
        return false;
    }
}

async function forwardToParent(clinicVisitId, studentName) {
    if (!confirm(`Forward clinic findings for ${studentName} to their parent?`)) return;

    try {
        const { data: visit } = await supabase
            .from('clinic_visits')
            .select('student_id, nurse_notes, action_taken, status')
            .eq('id', clinicVisitId)
            .single();

        if (!visit) {
            showNotification('Visit record not found.', "error");
            return;
        }

        if (!visit.nurse_notes && !visit.action_taken && visit.status !== 'Completed') {
            showNotification('No findings to forward yet.', "error");
            return;
        }

        const { data: student } = await supabase
            .from('students')
            .select('parent_id, full_name')
            .eq('id', visit.student_id)
            .single();

        if (!student?.parent_id) {
            showNotification('No parent linked to this student.', "error");
            return;
        }

        let message = `Good day! Your child ${student.full_name} visited the clinic today. `;
        if (visit.nurse_notes) message += `Findings: ${visit.nurse_notes}. `;
        if (visit.action_taken) message += `Action: ${visit.action_taken}. `;
        message += 'Please contact the school clinic for more details.';

        await supabase.from('notifications').insert({
            recipient_id: student.parent_id,
            recipient_role: 'parent',
            title: 'Clinic Visit Alert',
            message: message,
            type: 'clinic_visit',
            is_read: false
        });

        await supabase
            .from('clinic_visits')
            .update({ parent_notified: true, parent_notified_at: new Date().toISOString() })
            .eq('id', clinicVisitId);

        showNotification(`Findings forwarded to parent successfully!`, "success");
        await loadRecentClinicPasses();

    } catch (err) {
        console.error('Error forwarding to parent:', err);
        showNotification('Error forwarding findings.', "error");
    }
}

// ==========================================
// EXCUSE LETTERS (Fixed with Filtering)
// ==========================================
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
            letterList.innerHTML = '<div class="p-8 text-center"><p class="text-gray-500">You are not assigned as an adviser</p></div>';
            return;
        }

        const { data: students } = await supabase
            .from('students')
            .select('id')
            .eq('class_id', teacherClass.id);

        const studentIds = students?.map(s => s.id) || [];
        if (studentIds.length === 0) {
            letterList.innerHTML = '<div class="p-8 text-center"><p class="text-gray-500">No students in your class</p></div>';
            return;
        }

        const { data: letters, error } = await supabase
            .from('excuse_letters')
            .select(`*, students (student_id_text, full_name)`)
            .in('student_id', studentIds)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        if (!letters || letters.length === 0) {
            letterList.innerHTML = '<div class="p-8 text-center"><p class="text-gray-500">No excuse letters found</p></div>';
            return;
        }

        // Cache letters and update stats
        cachedExcuseLetters = letters;
        
        // Update stats cards (always based on all letters)
        const pendingCount = letters.filter(l => l.status === 'Pending').length;
        const approvedCount = letters.filter(l => l.status === 'Approved').length;
        const rejectedCount = letters.filter(l => l.status === 'Rejected').length;
        document.getElementById('pending-count').textContent = pendingCount;
        document.getElementById('approved-count').textContent = approvedCount;
        document.getElementById('rejected-count').textContent = rejectedCount;

        // Render with current filter
        renderExcuseLetters();

    } catch (err) {
        console.error('Error in loadExcuseLetters:', err);
        letterList.innerHTML = '<div class="p-8 text-center"><p class="text-red-500">Error loading excuse letters</p></div>';
    }
}

function renderExcuseLetters() {
    const letterList = document.getElementById('excuse-letter-list');
    if (!letterList) return;

    // Filter cached letters based on current filter
    let filteredLetters = cachedExcuseLetters;
    if (currentExcuseFilter === 'pending') {
        filteredLetters = cachedExcuseLetters.filter(l => l.status === 'Pending');
    } else if (currentExcuseFilter === 'approved') {
        filteredLetters = cachedExcuseLetters.filter(l => l.status === 'Approved');
    } else if (currentExcuseFilter === 'rejected') {
        filteredLetters = cachedExcuseLetters.filter(l => l.status === 'Rejected');
    }

    if (filteredLetters.length === 0) {
        letterList.innerHTML = `<div class="bg-white rounded-3xl p-12 border border-gray-100 shadow-sm text-center">
            <div class="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <h3 class="text-lg font-semibold text-gray-800 mb-2">No ${currentExcuseFilter} excuse letters</h3>
            <p class="text-gray-500">There are no ${currentExcuseFilter} excuse letters to display.</p>
        </div>`;
        return;
    }

    letterList.innerHTML = filteredLetters.map(letter => {
        const statusColors = {
            'Pending': 'border-l-yellow-400 bg-yellow-50',
            'Approved': 'border-l-green-400 bg-green-50',
            'Rejected': 'border-l-red-400 bg-red-50'
        };
        const statusBadge = letter.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                           letter.status === 'Approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
        const dateFormatted = new Date(letter.date_absent).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        return `
            <div class="bg-white p-4 border rounded-lg mb-4 border-l-4 ${statusColors[letter.status] || 'border-l-gray-400'} shadow-sm">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-lg text-gray-800">${escapeHtml(letter.students?.full_name)}</span>
                            <span class="text-sm text-gray-500">${letter.students?.student_id_text}</span>
                        </div>
                        <span class="px-2 py-1 rounded text-xs ${statusBadge}">${letter.status}</span>
                    </div>
                    <div class="text-right text-sm text-gray-500">
                        <p>Date: ${dateFormatted}</p>
                        <p class="text-xs">${new Date(letter.created_at).toLocaleDateString()}</p>
                    </div>
                </div>
                <div class="mb-3">
                    <p class="text-sm"><strong>Reason:</strong> ${escapeHtml(letter.reason)}</p>
                    ${letter.teacher_remarks ? `<p class="text-sm mt-1"><strong>Your Remarks:</strong> ${escapeHtml(letter.teacher_remarks)}</p>` : ''}
                </div>
                ${letter.image_proof_url ? `
                    <div class="mb-3">
                        <button onclick="viewProof('${letter.image_proof_url}')" class="text-blue-600 hover:text-blue-800 text-sm">View Proof Image</button>
                    </div>
                ` : '<p class="text-sm text-gray-400 italic mb-3">No proof image attached</p>'}
                ${letter.status === 'Pending' ? `
                    <div class="flex gap-2 mt-4 pt-3 border-t">
                        <button onclick="approveExcuseLetter('${letter.id}', '${letter.student_id}', '${letter.date_absent}')" class="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium">✓ Approve</button>
                        <button onclick="rejectExcuseLetter('${letter.id}')" class="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-medium">✕ Reject</button>
                    </div>
                ` : `<div class="mt-3 pt-3 border-t"><p class="text-sm text-green-600 font-medium">✓ ${letter.status} on ${new Date(letter.updated_at || letter.created_at).toLocaleDateString()}</p></div>`}
            </div>
        `;
    }).join('');
}

// Filter function for tabs
function filterLetters(status) {
    currentExcuseFilter = status;
    
    // Update tab active styles
    const tabPending = document.getElementById('tab-pending');
    const tabApproved = document.getElementById('tab-approved');
    const tabRejected = document.getElementById('tab-rejected');
    
    // Reset all tabs to inactive
    if (tabPending) {
        tabPending.className = 'px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl text-sm font-medium transition-all duration-200';
    }
    if (tabApproved) {
        tabApproved.className = 'px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl text-sm font-medium transition-all duration-200';
    }
    if (tabRejected) {
        tabRejected.className = 'px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl text-sm font-medium transition-all duration-200';
    }
    
    // Set active tab style
    if (status === 'pending' && tabPending) {
        tabPending.className = 'px-4 py-2 bg-yellow-100 rounded-xl text-yellow-700 text-sm font-medium transition-all duration-200';
    } else if (status === 'approved' && tabApproved) {
        tabApproved.className = 'px-4 py-2 bg-green-100 rounded-xl text-green-700 text-sm font-medium transition-all duration-200';
    } else if (status === 'rejected' && tabRejected) {
        tabRejected.className = 'px-4 py-2 bg-red-100 rounded-xl text-red-700 text-sm font-medium transition-all duration-200';
    }
    
    // Re-render with new filter
    renderExcuseLetters();
}

async function approveExcuseLetter(letterId, studentId, dateAbsent) {
    showConfirmationModal('Approve Excuse Letter', 'Are you sure you want to approve this excuse letter?', async () => {
        try {
            const { data: student } = await supabase.from('students').select('full_name, parent_id').eq('id', studentId).single();
            await supabase.from('excuse_letters').update({ status: 'Approved', teacher_remarks: 'Approved by teacher' }).eq('id', letterId);
            await supabase.from('attendance_logs').upsert({
                student_id: studentId,
                log_date: dateAbsent,
                status: 'Excused',
                remarks: 'Excused via approved excuse letter'
            }, { onConflict: 'student_id, log_date' });

            if (student?.parent_id) {
                await supabase.from('notifications').insert({
                    recipient_role: 'parents',
                    recipient_id: student.parent_id,
                    title: 'Excuse Letter Approved',
                    message: `Your excuse letter for ${student.full_name} on ${dateAbsent} has been approved.`,
                    type: 'attendance_alert',
                    is_read: false
                });
            }
            showNotification('Excuse letter approved!', "success");
            await loadExcuseLetters(); // Refresh data and re-render with current filter
        } catch (err) {
            console.error(err);
            showNotification('Error approving excuse letter.', "error");
        }
    });
}

async function rejectExcuseLetter(letterId) {
    showConfirmationModal('Reject Excuse Letter', 'Are you sure you want to reject this excuse letter?', async () => {
        try {
            await supabase.from('excuse_letters').update({ status: 'Rejected', teacher_remarks: 'Rejected by teacher' }).eq('id', letterId);
            showNotification('Excuse letter rejected.', "success");
            await loadExcuseLetters(); // Refresh data and re-render with current filter
        } catch (err) {
            console.error(err);
            showNotification('Error rejecting excuse letter.', "error");
        }
    });
}

function viewProof(imageUrl) {
    let modal = document.getElementById('proof-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'proof-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-75 z-[60] hidden flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div class="flex justify-between items-center p-4 border-b">
                    <h3 class="font-bold text-lg">Excuse Letter Proof</h3>
                    <button onclick="closeProofModal()" class="text-gray-500 hover:text-gray-700">✕</button>
                </div>
                <div class="flex-1 p-4 overflow-auto flex items-center justify-center bg-gray-100">
                    <img id="proof-image" src="" alt="Excuse Letter Proof" class="max-w-full max-h-[60vh] object-contain rounded shadow-lg">
                </div>
                <div class="p-4 border-t flex justify-end">
                    <button onclick="closeProofModal()" class="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    document.getElementById('proof-image').src = imageUrl;
}

function closeProofModal() {
    const modal = document.getElementById('proof-modal');
    if (modal) modal.classList.add('hidden');
}

// ==========================================
// ANALYTICS (Enhanced with Excused & Predictive)
// ==========================================
async function loadAnalytics() {
    await loadAttendanceStats();
    await loadAttendancePieChart();
    await loadWeeklyTrendChart();
    await loadCriticalAbsences();
    await loadPredictiveRisk();
}

async function loadAttendanceStats() {
    const presentRateEl = document.getElementById('present-rate');
    const absentRateEl = document.getElementById('absent-rate');
    const lateRateEl = document.getElementById('late-rate');
    const excusedRateEl = document.getElementById('excused-rate');
    if (!presentRateEl) return;

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
        const totalStudents = studentIds.length;
        if (totalStudents === 0) return;

        // Get approved excuse letters for today
        const { data: excuses } = await supabase
            .from('excuse_letters')
            .select('student_id')
            .eq('status', 'Approved')
            .eq('date_absent', today)
            .in('student_id', studentIds);
        const excusedStudentIds = new Set(excuses?.map(e => e.student_id) || []);

        const { data: attendanceLogs } = await supabase
            .from('attendance_logs')
            .select('status, student_id')
            .eq('log_date', today)
            .in('student_id', studentIds);

        let present = 0, absent = 0, late = 0, excused = 0;
        attendanceLogs?.forEach(log => {
            if (excusedStudentIds.has(log.student_id)) {
                excused++;
            } else if (log.status === 'On Time' || log.status === 'Present') present++;
            else if (log.status === 'Absent') absent++;
            else if (log.status === 'Late') late++;
        });
        // Students with no log and not excused are absent
        const loggedStudentIds = new Set(attendanceLogs?.map(l => l.student_id) || []);
        studentIds.forEach(id => {
            if (!loggedStudentIds.has(id) && !excusedStudentIds.has(id)) absent++;
        });

        presentRateEl.textContent = Math.round((present / totalStudents) * 100) + '%';
        absentRateEl.textContent = Math.round((absent / totalStudents) * 100) + '%';
        lateRateEl.textContent = Math.round((late / totalStudents) * 100) + '%';
        excusedRateEl.textContent = Math.round((excused / totalStudents) * 100) + '%';
    } catch (err) { console.error('Error loading attendance stats:', err); }
}

async function loadAttendancePieChart() {
    const ctx = document.getElementById('attendancePieChart');
    if (!ctx) return;
    if (window.pieChart) window.pieChart.destroy();

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
        const totalStudents = studentIds.length;
        if (totalStudents === 0) return;

        const { data: excuses } = await supabase
            .from('excuse_letters')
            .select('student_id')
            .eq('status', 'Approved')
            .eq('date_absent', today)
            .in('student_id', studentIds);
        const excusedStudentIds = new Set(excuses?.map(e => e.student_id) || []);

        const { data: logs } = await supabase
            .from('attendance_logs')
            .select('status, student_id')
            .eq('log_date', today)
            .in('student_id', studentIds);

        let present = 0, absent = 0, late = 0, excused = excusedStudentIds.size;
        logs?.forEach(log => {
            if (excusedStudentIds.has(log.student_id)) return; // already counted
            if (log.status === 'On Time' || log.status === 'Present') present++;
            else if (log.status === 'Absent') absent++;
            else if (log.status === 'Late') late++;
        });
        const loggedIds = new Set(logs?.map(l => l.student_id) || []);
        studentIds.forEach(id => {
            if (!loggedIds.has(id) && !excusedStudentIds.has(id)) absent++;
        });

        window.pieChart = new Chart(ctx.getContext('2d'), {
            type: 'pie',
            data: { labels: ['Present', 'Absent', 'Late', 'Excused'], datasets: [{ data: [present, absent, late, excused], backgroundColor: ['#22c55e', '#ef4444', '#eab308', '#3b82f6'] }] },
            options: { responsive: true, plugins: { title: { display: true, text: "Today's Attendance" } } }
        });
    } catch (err) { console.error('Error loading pie chart:', err); }
}

async function loadWeeklyTrendChart() {
    const ctx = document.getElementById('monthlyBarChart');
    if (!ctx) return;
    if (window.barChart) window.barChart.destroy();

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

            // Get students in class
            const { data: students } = await supabase
                .from('students')
                .select('id')
                .eq('class_id', teacherClass.id);
            const studentIds = students?.map(s => s.id) || [];
            if (studentIds.length === 0) { presentData.push(0); absentData.push(0); continue; }

            // Get excuses for this date
            const { data: excuses } = await supabase
                .from('excuse_letters')
                .select('student_id')
                .eq('status', 'Approved')
                .eq('date_absent', dateStr)
                .in('student_id', studentIds);
            const excusedIds = new Set(excuses?.map(e => e.student_id) || []);

            const { data: logs } = await supabase
                .from('attendance_logs')
                .select('status, student_id')
                .eq('log_date', dateStr)
                .in('student_id', studentIds);

            let presentCount = 0, absentCount = 0;
            const loggedIds = new Set();
            logs?.forEach(log => {
                loggedIds.add(log.student_id);
                if (excusedIds.has(log.student_id)) {
                    presentCount++; // excused counts as present for rate
                } else if (log.status === 'On Time' || log.status === 'Present') presentCount++;
                else if (log.status === 'Absent') absentCount++;
                else if (log.status === 'Late') presentCount++; // late is present but tardy
            });
            studentIds.forEach(id => {
                if (!loggedIds.has(id) && !excusedIds.has(id)) absentCount++;
                else if (!loggedIds.has(id) && excusedIds.has(id)) presentCount++;
            });
            presentData.push(presentCount);
            absentData.push(absentCount);
        }

        window.barChart = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: { labels: dates, datasets: [{ label: 'Present', data: presentData, backgroundColor: '#22c55e' }, { label: 'Absent', data: absentData, backgroundColor: '#ef4444' }] },
            options: { responsive: true, plugins: { title: { display: true, text: 'Weekly Attendance Trend' } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Number of Students' } } } }
        });
    } catch (err) { console.error('Error loading weekly trend:', err); }
}

async function loadPredictiveRisk() {
    const container = document.getElementById('predictive-risk-list');
    if (!container) return;

    try {
        const { data: teacherClass } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();
        if (!teacherClass) {
            container.innerHTML = '<p class="text-center text-gray-400 italic">No homeroom class assigned</p>';
            return;
        }

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const startDate = thirtyDaysAgo.toISOString().split('T')[0];
        const endDate = new Date().toISOString().split('T')[0];

        const { data: students } = await supabase
            .from('students')
            .select('id, full_name, student_id_text')
            .eq('class_id', teacherClass.id);
        if (!students?.length) {
            container.innerHTML = '<p class="text-center text-gray-400 italic">No students in homeroom</p>';
            return;
        }

        const studentIds = students.map(s => s.id);
        const { data: excuses } = await supabase
            .from('excuse_letters')
            .select('student_id, date_absent')
            .eq('status', 'Approved')
            .gte('date_absent', startDate)
            .lte('date_absent', endDate)
            .in('student_id', studentIds);
        const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);

        const { data: logs } = await supabase
            .from('attendance_logs')
            .select('student_id, status, log_date')
            .in('student_id', studentIds)
            .gte('log_date', startDate)
            .lte('log_date', endDate);

        const stats = {};
        students.forEach(s => { stats[s.id] = { name: s.full_name, id: s.student_id_text, total: 0, absent: 0, late: 0 }; });
        logs?.forEach(log => {
            const s = stats[log.student_id];
            if (s) {
                s.total++;
                const isExcused = excusedSet.has(`${log.student_id}-${log.log_date}`);
                if (!isExcused) {
                    if (log.status === 'Absent') s.absent++;
                    else if (log.status === 'Late') s.late++;
                }
            }
        });

        const riskStudents = [];
        for (const [_, s] of Object.entries(stats)) {
            if (s.total === 0) continue;
            const absenceRate = (s.absent / s.total) * 100;
            const lateRate = (s.late / s.total) * 100;
            let riskLevel = '', reason = '';
            if (absenceRate > 15) { riskLevel = 'high'; reason = `High absence risk (${Math.round(absenceRate)}% absent)`; }
            else if (absenceRate > 10) { riskLevel = 'medium'; reason = `Moderate absence risk (${Math.round(absenceRate)}% absent)`; }
            else if (lateRate > 25) { riskLevel = 'medium'; reason = `Excessive tardiness (${Math.round(lateRate)}% late)`; }
            else if (lateRate > 15) { riskLevel = 'low'; reason = `Frequent lateness (${Math.round(lateRate)}% late)`; }
            if (riskLevel) riskStudents.push({ ...s, riskLevel, reason, absenceRate: Math.round(absenceRate), lateRate: Math.round(lateRate) });
        }

        if (riskStudents.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-400 italic">No at-risk students detected</p>';
        } else {
            container.innerHTML = riskStudents.map(s => `
                <div class="flex justify-between items-center p-3 ${s.riskLevel === 'high' ? 'bg-red-50' : s.riskLevel === 'medium' ? 'bg-orange-50' : 'bg-yellow-50'} rounded-xl border ${s.riskLevel === 'high' ? 'border-red-200' : 'border-orange-200'} mb-2">
                    <div><p class="font-bold text-gray-800">${escapeHtml(s.name)}</p><p class="text-xs text-gray-500">${s.id}</p><p class="text-xs ${s.riskLevel === 'high' ? 'text-red-600' : 'text-orange-600'}">${escapeHtml(s.reason)}</p></div>
                    <div class="text-right"><span class="font-bold text-lg ${s.riskLevel === 'high' ? 'text-red-600' : 'text-orange-600'}">${s.absenceRate}%</span><p class="text-[10px] text-gray-400">absent rate</p></div>
                </div>
            `).join('');
        }
    } catch (err) { console.error('Error loading predictive risk:', err); container.innerHTML = '<p class="text-red-500 text-center">Error loading data</p>'; }
}

async function loadCriticalAbsences() {
    const list = document.getElementById('critical-absences-list');
    if (!list) return;
    try {
        const { data: teacherClass } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();
        if (!teacherClass) { list.innerHTML = '<p class="text-center text-gray-400 italic">No homeroom class assigned</p>'; return; }

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const startDate = thirtyDaysAgo.toISOString().split('T')[0];
        const endDate = new Date().toISOString().split('T')[0];

        const { data: students } = await supabase
            .from('students')
            .select('id, full_name, student_id_text')
            .eq('class_id', teacherClass.id);
        if (!students?.length) { list.innerHTML = '<p class="text-center text-gray-400 italic">No students found</p>'; return; }

        const studentIds = students.map(s => s.id);
        const { data: excuses } = await supabase
            .from('excuse_letters')
            .select('student_id, date_absent')
            .eq('status', 'Approved')
            .gte('date_absent', startDate)
            .lte('date_absent', endDate)
            .in('student_id', studentIds);
        const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);

        const { data: logs } = await supabase
            .from('attendance_logs')
            .select('student_id, log_date, status')
            .in('student_id', studentIds)
            .eq('status', 'Absent')
            .gte('log_date', startDate)
            .lte('log_date', endDate);

        const absenceCount = {};
        students.forEach(s => { absenceCount[s.id] = { name: s.full_name, id: s.student_id_text, absent: 0 }; });
        logs?.forEach(log => {
            const key = `${log.student_id}-${log.log_date}`;
            if (!excusedSet.has(key)) absenceCount[log.student_id].absent++;
        });
        const critical = Object.values(absenceCount).filter(s => s.absent >= 10);
        if (critical.length === 0) {
            list.innerHTML = '<p class="text-center text-gray-400 italic">No students with 10+ absences in last 30 days</p>';
        } else {
            list.innerHTML = critical.map(s => `
                <div class="flex justify-between items-center p-3 bg-red-50 rounded-xl border border-red-100 mb-2">
                    <div><p class="font-bold text-red-900">${escapeHtml(s.name)}</p><p class="text-xs text-gray-500">${s.id}</p></div>
                    <span class="bg-red-600 text-white px-3 py-1 rounded-lg font-bold">${s.absent} absences</span>
                </div>
            `).join('');
        }
    } catch (err) { console.error(err); list.innerHTML = '<p class="text-center text-red-500">Error loading data</p>'; }
}

function exportToCSV() {
    const presentRate = document.getElementById('present-rate')?.innerText || '0%';
    const absentRate = document.getElementById('absent-rate')?.innerText || '0%';
    const lateRate = document.getElementById('late-rate')?.innerText || '0%';
    const excusedRate = document.getElementById('excused-rate')?.innerText || '0%';
    const today = new Date().toISOString().split('T')[0];
    let csv = `Educare Teacher Analytics Report\nDate: ${today}\n\nPresent Rate,${presentRate}\nAbsent Rate,${absentRate}\nLate Rate,${lateRate}\nExcused Rate,${excusedRate}\n\nPredictive Risk Students (30-day):\nName,ID,Risk Level,Reason\n`;
    const riskItems = document.querySelectorAll('#predictive-risk-list .flex');
    riskItems.forEach(item => {
        const name = item.querySelector('.font-bold')?.innerText || '';
        const id = item.querySelector('.text-xs.text-gray-500')?.innerText || '';
        const reason = item.querySelector('.text-xs.text-red-600, .text-xs.text-orange-600')?.innerText || '';
        const riskLevel = item.querySelector('.bg-red-50') ? 'High' : (item.querySelector('.bg-orange-50') ? 'Medium' : 'Low');
        csv += `"${name}","${id}","${riskLevel}","${reason}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Teacher_Analytics_${today}.csv`;
    link.click();
}

// ==========================================
// ANNOUNCEMENTS (Full version)
// ==========================================
async function setupAnnouncementPage() {
    await loadAnnouncementsBoard();
    await loadScheduledAnnouncements();
    await loadSentAnnouncements();

    const contentArea = document.getElementById('announcement-content');
    const charCounter = document.getElementById('char-counter');
    if (contentArea && charCounter) {
        contentArea.addEventListener('input', () => {
            charCounter.textContent = contentArea.value.length;
        });
    }
}

async function loadAnnouncementsBoard() {
    const list = document.getElementById('announcements-list');
    if (!list) return;

    try {
        const now = new Date().toISOString();
        const { data, error } = await supabase
            .from('announcements')
            .select('*')
            .eq('target_teachers', true)
            .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            list.innerHTML = '<p class="text-center text-gray-400 italic py-8">No announcements from administration.</p>';
            return;
        }

        list.innerHTML = data.map(ann => `
            <div class="p-4 bg-white rounded-xl border border-gray-100 mb-3 shadow-sm">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${ann.type === 'Emergency' ? 'bg-red-100 text-red-600' : ann.type === 'Event' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}">${ann.type || 'General'}</span>
                        <h4 class="font-bold text-gray-800">${ann.title || 'Untitled'}</h4>
                    </div>
                    <span class="text-xs text-gray-500">${new Date(ann.created_at).toLocaleDateString()}</span>
                </div>
                <p class="text-sm text-gray-600">${ann.content || ''}</p>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading announcements:', err);
        list.innerHTML = '<p class="text-center text-red-500 py-8">Could not load announcements.</p>';
    }
}

async function postAnnouncement() {
    const title = document.getElementById('announcement-title').value;
    const content = document.getElementById('announcement-content').value;
    const scheduleDate = document.getElementById('announcement-date').value;
    const scheduleTime = document.getElementById('announcement-time').value;
    const isUrgent = document.getElementById('announcement-urgent').checked;

    if (!title || !content) {
        return showNotification('Please fill in both title and content.', "error");
    }
    if (content.length > 500) {
        return showNotification('Content cannot exceed 500 characters.', "error");
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

    showConfirmationModal('Confirm Announcement', `Send announcement "${title}" to parents?`, async () => {
        try {
            const batchId = safeRandomUUID();
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

            showNotification(isScheduled ? `Announcement scheduled for ${scheduled_at.toLocaleString()}` : `Announcement sent to ${parentIds.length} parents.`, "success");

            document.getElementById('announcement-title').value = '';
            document.getElementById('announcement-content').value = '';
            document.getElementById('announcement-date').value = '';
            document.getElementById('announcement-time').value = '';
            document.getElementById('announcement-urgent').checked = false;
            if (document.getElementById('char-counter')) document.getElementById('char-counter').textContent = '0';
            loadScheduledAnnouncements();
        } catch (err) {
            console.error('Error posting class announcement:', err);
            showNotification(err.message, "error");
        }
    });
}

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
            <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg mb-2">
                <div>
                    <p class="font-semibold text-gray-700">${ann.title?.replace('Announcement: ', '')}</p>
                    <p class="text-xs text-blue-600">Scheduled for: ${new Date(ann.scheduled_at).toLocaleString()}</p>
                </div>
                <button onclick="cancelScheduledAnnouncement('${ann.batch_id}')" class="p-2 text-red-500 hover:bg-red-100 rounded-lg">Cancel</button>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading scheduled announcements:', err);
        list.innerHTML = '<p class="text-center text-red-500">Could not load scheduled items.</p>';
    }
}

async function loadSentAnnouncements() {
    const list = document.getElementById('sent-announcements-list');
    if (!list) return;

    try {
        const { data, error } = await supabase
            .from('notifications')
            .select('id, title, message, created_at, is_urgent, batch_id')
            .eq('sender_id', currentUser.id)
            .eq('type', 'announcement')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            list.innerHTML = '<p class="text-center text-gray-400 italic">You have not sent any announcements.</p>';
            return;
        }

        list.innerHTML = data.map(ann => `
            <div class="p-4 bg-gray-50 rounded-xl border border-gray-100 mb-2">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-bold text-gray-800">${ann.title?.replace('Announcement: ', '')}</p>
                        <p class="text-xs text-gray-500 truncate max-w-xs">${ann.message || ''}</p>
                    </div>
                    <div class="text-right">
                        <span class="px-2 py-1 rounded-lg text-xs font-bold bg-gray-100 text-gray-600">Sent</span>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error("Error loading sent announcements:", err);
        list.innerHTML = '<p class="text-center text-red-500">Could not load sent announcements.</p>';
    }
}

async function cancelScheduledAnnouncement(batchId) {
    if (!confirm("Cancel this scheduled announcement?")) return;
    try {
        const { error } = await supabase.from('notifications').delete().eq('batch_id', batchId);
        if (error) throw error;
        showNotification("Scheduled announcement cancelled.", "success");
        loadScheduledAnnouncements();
    } catch (err) {
        showNotification("Failed to cancel announcement.", "error");
    }
}

// ==========================================
// DASHBOARD LIVE STATS (Adviser only)
// ==========================================
async function loadLiveDashboardStats() {
    const presentEl = document.getElementById('present-count');
    const lateEl = document.getElementById('late-count');
    const clinicEl = document.getElementById('clinic-count');
    const excuseEl = document.getElementById('excuse-count');

    if (!presentEl && !lateEl && !clinicEl && !excuseEl) return;

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
        if (studentIds.length === 0) return;

        const { data: logs } = await supabase
            .from('attendance_logs')
            .select('status')
            .eq('log_date', today)
            .in('student_id', studentIds);

        const { data: clinicVisits } = await supabase
            .from('clinic_visits')
            .select('student_id')
            .eq('status', 'In Clinic')
            .gte('time_in', today)
            .is('time_out', null)
            .in('student_id', studentIds);

        const clinicStudentIds = new Set(clinicVisits?.map(cv => cv.student_id) || []);

        let present = 0, late = 0, excused = 0;
        logs?.forEach(log => {
            if (log.status === 'Present' || log.status === 'On Time') present++;
            else if (log.status === 'Late') late++;
            else if (log.status === 'Excused') excused++;
        });

        const inClinic = clinicStudentIds.size;
        const pendingExcuses = 0; // Would need separate query

        if (presentEl) presentEl.textContent = present;
        if (lateEl) lateEl.textContent = late;
        if (clinicEl) clinicEl.textContent = inClinic;
        if (excuseEl) excuseEl.textContent = pendingExcuses;

    } catch (err) {
        console.error('Error loading live stats:', err);
    }
}

function startRealTimeStats() {
    if (window.statsInterval) clearInterval(window.statsInterval);
    window.statsInterval = setInterval(() => {
        if (isAdviserMode) loadLiveDashboardStats();
    }, 30000);
}

function loadHomeroomStats(classId) {
    if (DEBUG) console.log('Loading homeroom stats for class:', classId);
}

// ==========================================
// SETTINGS (Password change)
// ==========================================
function initializeTeacherSettingsPage() {
    const container = document.getElementById('settings-container');
    if (!container) return;
    container.innerHTML = `
        <div class="bg-white rounded-2xl p-6 shadow-sm">
            <h3 class="font-bold text-xl mb-4">Change Password</h3>
            <div class="space-y-4">
                <div><label class="block text-sm font-medium text-gray-500 mb-1">Current Password</label><input type="password" id="cp-current" class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl"></div>
                <div><label class="block text-sm font-medium text-gray-500 mb-1">New Password</label><input type="password" id="cp-new" class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl"></div>
                <div><label class="block text-sm font-medium text-gray-500 mb-1">Confirm New Password</label><input type="password" id="cp-confirm" class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl"></div>
            </div>
            <div class="mt-6 flex justify-end"><button onclick="submitPasswordChange()" class="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold">Update Password</button></div>
        </div>
    `;
}

async function submitPasswordChange() {
    const current = document.getElementById('cp-current')?.value;
    const newPass = document.getElementById('cp-new')?.value;
    const confirm = document.getElementById('cp-confirm')?.value;

    if (!current || !newPass || !confirm) return showNotification("All fields required", "error");
    if (newPass !== confirm) return showNotification("Passwords do not match", "error");
    if (newPass.length < 6) return showNotification("Password must be at least 6 characters", "error");

    const { data, error } = await supabase.from('teachers').select('id').eq('id', currentUser.id).eq('password', current).single();
    if (error || !data) return showNotification("Incorrect current password", "error");

    const { error: updateErr } = await supabase.from('teachers').update({ password: newPass }).eq('id', currentUser.id);
    if (updateErr) showNotification(updateErr.message, "error");
    else showNotification("Password updated successfully!", "success");
}

// ==========================================
// DASHBOARD HOMEROOM DATA (NEW)
// ==========================================
async function loadDashboardHomeroomData() {
    const { data: homeroomClass, error } = await supabase
        .from('classes')
        .select('id, grade_level, department')
        .eq('adviser_id', currentUser.id)
        .single();

    const homeroomSection = document.getElementById('homeroom-section');
    const noHomeroomMsg = document.getElementById('no-homeroom-message');

    if (error || !homeroomClass) {
        if (homeroomSection) homeroomSection.classList.add('hidden');
        if (noHomeroomMsg) noHomeroomMsg.classList.remove('hidden');
        return;
    }

    if (homeroomSection) homeroomSection.classList.remove('hidden');
    if (noHomeroomMsg) noHomeroomMsg.classList.add('hidden');

    await loadAttendanceSummary(homeroomClass.id);
    await loadCriticalAbsencesForDashboard(homeroomClass.id);
    await loadMostLates(homeroomClass.id);
    await loadGoodPerformance(homeroomClass.id);
    await loadLatestAnnouncements();
    await loadPendingExcuses(homeroomClass.id);
}

async function loadAttendanceSummary(classId) {
    const presentListDiv = document.getElementById('present-list');
    const absentListDiv = document.getElementById('absent-list');
    if (!presentListDiv || !absentListDiv) return;

    const today = new Date().toISOString().split('T')[0];

    const { data: students, error: studentError } = await supabase
        .from('students')
        .select('id, full_name, student_id_text')
        .eq('class_id', classId)
        .eq('status', 'Enrolled')
        .order('full_name');

    if (studentError || !students || students.length === 0) {
        presentListDiv.innerHTML = '<p class="text-gray-500 text-sm">No students found.</p>';
        absentListDiv.innerHTML = '<p class="text-gray-500 text-sm">No students found.</p>';
        return;
    }

    const studentIds = students.map(s => s.id);
    const { data: logs } = await supabase
        .from('attendance_logs')
        .select('student_id, status')
        .eq('log_date', today)
        .in('student_id', studentIds);

    const attendanceMap = new Map();
    logs?.forEach(log => {
        attendanceMap.set(log.student_id, log.status);
    });

    const presentStudents = [];
    const absentStudents = [];

    students.forEach(student => {
        const status = attendanceMap.get(student.id);
        if (status === 'On Time' || status === 'Present') {
            presentStudents.push(student);
        } else if (status === 'Absent') {
            absentStudents.push(student);
        } else if (!status) {
            absentStudents.push(student);
        }
    });

    if (presentStudents.length === 0) {
        presentListDiv.innerHTML = '<p class="text-gray-500 text-sm">No students present today.</p>';
    } else {
        presentListDiv.innerHTML = presentStudents.map(s => `
            <div class="flex justify-between items-center p-2 bg-green-50 rounded-lg">
                <span class="font-medium text-gray-800">${escapeHtml(s.full_name)}</span>
                <span class="text-xs text-gray-500">${s.student_id_text || ''}</span>
            </div>
        `).join('');
    }

    if (absentStudents.length === 0) {
        absentListDiv.innerHTML = '<p class="text-gray-500 text-sm">No absent students today.</p>';
    } else {
        absentListDiv.innerHTML = absentStudents.map(s => `
            <div class="flex justify-between items-center p-2 bg-red-50 rounded-lg">
                <span class="font-medium text-gray-800">${escapeHtml(s.full_name)}</span>
                <span class="text-xs text-gray-500">${s.student_id_text || ''}</span>
            </div>
        `).join('');
    }
}

async function loadCriticalAbsencesForDashboard(classId) {
    const container = document.getElementById('critical-absences-list');
    if (!container) return;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];

    const { data: students } = await supabase
        .from('students')
        .select('id, full_name')
        .eq('class_id', classId)
        .eq('status', 'Enrolled');

    if (!students || students.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No students in homeroom.</p>';
        return;
    }

    const studentIds = students.map(s => s.id);
    const { data: logs } = await supabase
        .from('attendance_logs')
        .select('student_id, status')
        .in('student_id', studentIds)
        .eq('status', 'Absent')
        .gte('log_date', startDate);

    const absenceCount = new Map();
    logs?.forEach(log => {
        absenceCount.set(log.student_id, (absenceCount.get(log.student_id) || 0) + 1);
    });

    const critical = [];
    for (const student of students) {
        const count = absenceCount.get(student.id) || 0;
        if (count >= 10) {
            critical.push({ ...student, count });
        }
    }

    if (critical.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No students with 10+ absences in the last 30 days.</p>';
    } else {
        container.innerHTML = critical.map(s => `
            <div class="flex justify-between items-center p-2 bg-red-50 rounded-lg">
                <span class="font-medium text-gray-800">${escapeHtml(s.full_name)}</span>
                <span class="text-xs font-bold text-red-600">${s.count} absences</span>
            </div>
        `).join('');
    }
}

async function loadMostLates(classId) {
    const container = document.getElementById('most-lates-list');
    if (!container) return;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];

    const { data: students } = await supabase
        .from('students')
        .select('id, full_name')
        .eq('class_id', classId)
        .eq('status', 'Enrolled');

    if (!students || students.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No students in homeroom.</p>';
        return;
    }

    const studentIds = students.map(s => s.id);
    const { data: logs } = await supabase
        .from('attendance_logs')
        .select('student_id, status')
        .in('student_id', studentIds)
        .eq('status', 'Late')
        .gte('log_date', startDate);

    const lateCount = new Map();
    logs?.forEach(log => {
        lateCount.set(log.student_id, (lateCount.get(log.student_id) || 0) + 1);
    });

    const withLates = students
        .map(s => ({ ...s, count: lateCount.get(s.id) || 0 }))
        .filter(s => s.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    if (withLates.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No late records in the last 30 days.</p>';
    } else {
        container.innerHTML = withLates.map(s => `
            <div class="flex justify-between items-center p-2 bg-orange-50 rounded-lg">
                <span class="font-medium text-gray-800">${escapeHtml(s.full_name)}</span>
                <span class="text-xs font-bold text-orange-600">${s.count} late(s)</span>
            </div>
        `).join('');
    }
}

async function loadGoodPerformance(classId) {
    const container = document.getElementById('good-performance-list');
    if (!container) return;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];

    const { data: students } = await supabase
        .from('students')
        .select('id, full_name')
        .eq('class_id', classId)
        .eq('status', 'Enrolled');

    if (!students || students.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No students in homeroom.</p>';
        return;
    }

    const studentIds = students.map(s => s.id);
    const { data: logs } = await supabase
        .from('attendance_logs')
        .select('student_id, status')
        .in('student_id', studentIds)
        .gte('log_date', startDate)
        .in('status', ['Absent', 'Late']);

    const problematic = new Set();
    logs?.forEach(log => {
        problematic.add(log.student_id);
    });

    const goodStudents = students.filter(s => !problematic.has(s.id)).slice(0, 5);

    if (goodStudents.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No students with perfect attendance in the last 30 days.</p>';
    } else {
        container.innerHTML = goodStudents.map(s => `
            <div class="flex justify-between items-center p-2 bg-emerald-50 rounded-lg">
                <span class="font-medium text-gray-800">${escapeHtml(s.full_name)}</span>
                <span class="text-xs text-emerald-600">✓ Perfect</span>
            </div>
        `).join('');
    }
}

async function loadLatestAnnouncements() {
    const container = document.getElementById('latest-announcements-list');
    if (!container) return;

    const { data, error } = await supabase
        .from('announcements')
        .select('title, content, created_at, is_urgent')
        .or('target_teachers.eq.true, sender_type.eq.admin')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error || !data || data.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No announcements found.</p>';
        return;
    }

    container.innerHTML = data.map(ann => `
        <div class="p-3 bg-gray-50 rounded-xl border-l-4 ${ann.is_urgent ? 'border-l-red-500' : 'border-l-blue-500'}">
            <div class="flex justify-between items-start mb-1">
                <h4 class="font-bold text-gray-800 text-sm">${escapeHtml(ann.title || 'Announcement')}</h4>
                <span class="text-xs text-gray-400">${formatDate(ann.created_at)}</span>
            </div>
            <p class="text-xs text-gray-600 line-clamp-2">${escapeHtml(ann.content || '').substring(0, 120)}${(ann.content?.length || 0) > 120 ? '...' : ''}</p>
            ${ann.is_urgent ? '<span class="inline-block mt-1 text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">URGENT</span>' : ''}
        </div>
    `).join('');
}

async function loadPendingExcuses(classId) {
    const container = document.getElementById('pending-excuses-list');
    if (!container) return;

    const { data: students } = await supabase
        .from('students')
        .select('id')
        .eq('class_id', classId)
        .eq('status', 'Enrolled');

    if (!students || students.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No students in homeroom.</p>';
        return;
    }

    const studentIds = students.map(s => s.id);
    const { data: excuses, error } = await supabase
        .from('excuse_letters')
        .select(`*, students(full_name, student_id_text)`)
        .in('student_id', studentIds)
        .eq('status', 'Pending')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        container.innerHTML = '<p class="text-red-500 text-sm">Error loading excuse letters.</p>';
        return;
    }

    if (!excuses || excuses.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No pending excuse letters.</p>';
        return;
    }

    container.innerHTML = excuses.map(exc => `
        <div class="p-3 bg-yellow-50 rounded-xl border-l-4 border-l-yellow-400">
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-bold text-gray-800 text-sm">${escapeHtml(exc.students?.full_name || 'Unknown')}</p>
                    <p class="text-xs text-gray-500">${exc.students?.student_id_text || ''}</p>
                    <p class="text-xs text-gray-600 mt-1">Reason: ${escapeHtml(exc.reason?.substring(0, 80) || 'N/A')}</p>
                </div>
                <span class="text-xs text-yellow-600 font-medium">Pending</span>
            </div>
            <div class="mt-2 text-right">
                <button onclick="window.location.href='teacher-excuse-letter-approval.html'" class="text-xs text-blue-600 hover:underline">Review</button>
            </div>
        </div>
    `).join('');
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    } catch(e) { return dateString; }
}

// ==========================================
// UTILITIES
// ==========================================
function toggleGatekeeperMode() {
    if (isGatekeeperMode) {
        window.location.href = 'teacher-gatekeeper-mode.html';
    }
}

function getStatusBadge(status) {
    switch (status) {
        case 'On Time': case 'Present': return 'bg-emerald-100 text-emerald-700';
        case 'Late': return 'bg-amber-100 text-amber-700';
        case 'Absent': return 'bg-red-100 text-red-700';
        case 'Excused': return 'bg-blue-100 text-blue-700';
        default: return 'bg-gray-100 text-gray-500';
    }
}

function formatTime(dateStr) {
    if (!dateStr) return '--:--';
    return new Date(dateStr).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `@keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in-up { animation: fadeInUp 0.4s ease forwards; }`;
    document.head.appendChild(style);
}

function printHomeroomList() {
    window.print();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

function showNotification(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type);
    else alert(msg);
}

function showConfirmationModal(title, message, callback, confirmText = 'Confirm') {
    if (confirm(message)) callback();
}

// Logout
window.logout = async function() {
    sessionStorage.clear();
    localStorage.removeItem('user_session');
    window.location.href = '../index.html';
};

// Expose globals for HTML onclick
window.postAnnouncement = postAnnouncement;
window.issueClinicPass = issueClinicPass;
window.approveExcuseLetter = approveExcuseLetter;
window.rejectExcuseLetter = rejectExcuseLetter;
window.viewProof = viewProof;
window.closeProofModal = closeProofModal;
window.cancelScheduledAnnouncement = cancelScheduledAnnouncement;
window.toggleGatekeeperMode = toggleGatekeeperMode;
window.submitPasswordChange = submitPasswordChange;
window.navigateToAttendance = navigateToAttendance;
window.markAttendance = markAttendance;
window.markSubjectAttendance = markSubjectAttendance;
window.loadSubjectStudents = loadSubjectStudents;
window.forwardToParent = forwardToParent;
window.loadRecentClinicPasses = loadRecentClinicPasses;
window.loadClinicStats = loadClinicStats;
window.startRealTimeStats = startRealTimeStats;
window.loadLiveDashboardStats = loadLiveDashboardStats;
window.exportToCSV = exportToCSV;
window.printHomeroomList = printHomeroomList;
window.closeStudentModal = function() { document.getElementById('student-details-modal')?.classList.add('hidden'); };
window.closeModal = function() { /* generic modal close */ };
window.loadDashboardHomeroomData = loadDashboardHomeroomData;
window.backToAttendanceHub = function() { window.location.href = 'teacher-attendance.html'; };

// NEW: Expose filter function for excuse letters
window.filterLetters = filterLetters;