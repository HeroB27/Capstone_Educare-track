// teacher-homeroom-attendance.js
// Detailed Homeroom Attendance with Subject Breakdown

// Store data
let homeroomStudents = [];
let homeroomSubjects = [];
let currentView = 'daily'; // daily, weekly, monthly

// Set default date to today
document.addEventListener('DOMContentLoaded', async () => {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('selected-date').value = today;
    
    // Load initial data
    await loadHomeroomSubjects();
    await loadDailyAttendance();
});

// Load teacher's subject loads for the homeroom
async function loadHomeroomSubjects() {
    try {
        // Get teacher's homeroom class
        const { data: teacherClass, error: classError } = await supabase
            .from('classes')
            .select('id, grade_level, section_name')
            .eq('adviser_id', currentUser.id)
            .single();

        if (classError || !teacherClass) {
            console.log('No homeroom class assigned');
            return;
        }

        // Update header
        const badgeEl = document.getElementById('advisory-badge');
        if (badgeEl) {
            badgeEl.innerText = `Adviser: ${teacherClass.grade_level} - ${teacherClass.section_name}`;
        }

        // Get subject loads for this class
        const { data: subjectLoads, error: loadError } = await supabase
            .from('subject_loads')
            .select('id, subject_name')
            .eq('class_id', teacherClass.id);

        if (loadError) {
            console.error('Error loading subjects:', loadError);
            return;
        }

        homeroomSubjects = subjectLoads || [];
        
    } catch (err) {
        console.error('Error in loadHomeroomSubjects:', err);
    }
}

// Load Daily Attendance View
async function loadDailyAttendance() {
    const dateInput = document.getElementById('selected-date').value;
    if (!dateInput) {
        alert('Please select a date');
        return;
    }

    currentView = 'daily';
    const table = document.getElementById('daily-attendance-table');
    const tbody = document.getElementById('daily-attendance-body');
    const summaryView = document.getElementById('summary-view');
    
    summaryView.classList.add('hidden');
    document.getElementById('daily-view').classList.remove('hidden');

    try {
        // Get teacher's homeroom class
        const { data: teacherClass } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();

        if (!teacherClass) {
            tbody.innerHTML = '<tr><td colspan="10" class="px-4 py-8 text-center text-gray-500">No homeroom class assigned</td></tr>';
            return;
        }

        // Get students in the class
        const { data: students } = await supabase
            .from('students')
            .select('id, student_id_text, full_name')
            .eq('class_id', teacherClass.id)
            .order('full_name');

        homeroomStudents = students || [];

        // Get attendance logs for the selected date
        const { data: logs } = await supabase
            .from('attendance_logs')
            .select('id, student_id, status, remarks, time_in, time_out')
            .eq('log_date', dateInput)
            .in('student_id', homeroomStudents.map(s => s.id));

        // Get clinic visits for the date
        const { data: clinicVisits } = await supabase
            .from('clinic_visits')
            .select('student_id, status')
            .gte('time_in', dateInput)
            .lt('time_in', dateInput + 'T23:59:59');

        // Build student lookup maps
        const logMap = {};
        (logs || []).forEach(log => {
            logMap[log.student_id] = log;
        });

        const clinicMap = {};
        (clinicVisits || []).forEach(cv => {
            clinicMap[cv.student_id] = cv;
        });

        // Build table header with subjects
        const headerRow = table.querySelector('thead tr');
        headerRow.innerHTML = `
            <th class="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Student</th>
            <th class="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Gate</th>
        `;
        
        homeroomSubjects.forEach(subject => {
            headerRow.innerHTML += `<th class="px-3 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">${subject.subject_name}</th>`;
        });
        headerRow.innerHTML += `<th class="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Overall</th>`;

        // Build table body
        tbody.innerHTML = '';

        if (homeroomStudents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="px-4 py-8 text-center text-gray-500">No students in class</td></tr>';
            return;
        }

        homeroomStudents.forEach(student => {
            const log = logMap[student.id];
            const clinic = clinicMap[student.id];
            
            const row = document.createElement('tr');
            row.className = 'border-b border-gray-50 hover:bg-blue-50/30 transition-all';

            // Student name column
            let html = `
                <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xs">
                            ${student.full_name.charAt(0)}
                        </div>
                        <div>
                            <p class="font-bold text-gray-800 text-sm">${student.full_name}</p>
                            <p class="text-xs text-gray-400 font-mono">${student.student_id_text}</p>
                        </div>
                    </div>
                </td>
            `;

            // Gate status column
            const gateStatus = log?.time_in ? 
                (log.time_out ? '<span class="text-gray-400">Out</span>' : '<span class="text-green-600 font-bold">In School</span>') 
                : '<span class="text-gray-400">--</span>';
            html += `<td class="px-4 py-3">${gateStatus}</td>`;

            // Subject columns
            const remarks = log?.remarks || '';
            
            homeroomSubjects.forEach(subject => {
                const status = getSubjectStatus(remarks, subject.subject_name, log?.status);
                const badge = getStatusBadge(status, clinic && clinic.student_id === student.id);
                html += `<td class="px-3 py-3 text-center">${badge}</td>`;
            });

            // Overall status column
            const overallStatus = calculateOverallFromRemarks(remarks) || log?.status || 'Absent';
            const overallBadge = getStatusBadge(overallStatus, false);
            html += `<td class="px-4 py-3">${overallBadge}</td>`;

            row.innerHTML = html;
            tbody.appendChild(row);
        });

    } catch (err) {
        console.error('Error loading daily attendance:', err);
        tbody.innerHTML = '<tr><td colspan="10" class="px-4 py-8 text-center text-red-500">Error loading data</td></tr>';
    }
}

// Load Weekly Attendance View
async function loadWeeklyAttendance() {
    currentView = 'weekly';
    const dateInput = document.getElementById('selected-date').value;
    const selectedDate = new Date(dateInput);
    
    // Get start of week (Monday)
    const day = selectedDate.getDay();
    const diff = selectedDate.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(selectedDate.setDate(diff));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const dateStart = weekStart.toISOString().split('T')[0];
    const dateEnd = weekEnd.toISOString().split('T')[0];

    document.getElementById('summary-title').innerText = `Weekly Attendance (${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()})`;
    document.getElementById('daily-view').classList.add('hidden');
    document.getElementById('summary-view').classList.remove('hidden');

    await loadSummaryAttendance(dateStart, dateEnd);
}

// Load Monthly Attendance View
async function loadMonthlyAttendance() {
    currentView = 'monthly';
    const dateInput = document.getElementById('selected-date').value;
    const selectedDate = new Date(dateInput);
    
    // Get start and end of month
    const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);

    const dateStart = monthStart.toISOString().split('T')[0];
    const dateEnd = monthEnd.toISOString().split('T')[0];

    document.getElementById('summary-title').innerText = `Monthly Attendance (${monthStart.toLocaleDateString('en-US', {month:'long', year:'numeric'})})`;
    document.getElementById('daily-view').classList.add('hidden');
    document.getElementById('summary-view').classList.remove('hidden');

    await loadSummaryAttendance(dateStart, dateEnd);
}

// Load Summary Attendance (Weekly/Monthly)
async function loadSummaryAttendance(dateStart, dateEnd) {
    const tbody = document.getElementById('summary-body');

    try {
        // Get teacher's homeroom class
        const { data: teacherClass } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();

        if (!teacherClass) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">No homeroom class assigned</td></tr>';
            return;
        }

        // Get students
        const { data: students } = await supabase
            .from('students')
            .select('id, student_id_text, full_name')
            .eq('class_id', teacherClass.id)
            .order('full_name');

        const studentIds = (students || []).map(s => s.id);

        // Get all attendance logs in date range
        const { data: logs } = await supabase
            .from('attendance_logs')
            .select('student_id, status, remarks')
            .gte('log_date', dateStart)
            .lte('log_date', dateEnd)
            .in('student_id', studentIds);

        // Get clinic visits
        const { data: clinicVisits } = await supabase
            .from('clinic_visits')
            .select('student_id')
            .gte('time_in', dateStart)
            .lte('time_in', dateEnd + 'T23:59:59');

        const clinicStudentIds = new Set((clinicVisits || []).map(cv => cv.student_id));

        // Build log lookup
        const studentLogs = {};
        (students || []).forEach(s => {
            studentLogs[s.id] = { present: 0, late: 0, absent: 0, clinic: 0 };
        });

        (logs || []).forEach(log => {
            if (!studentLogs[log.student_id]) return;
            
            const remarks = log?.remarks || '';
            const status = calculateOverallFromRemarks(remarks) || log.status || 'Absent';
            
            if (status === 'Present' || status === 'On Time') {
                studentLogs[log.student_id].present++;
            } else if (status === 'Late') {
                studentLogs[log.student_id].late++;
            } else if (status === 'Absent') {
                if (clinicStudentIds.has(log.student_id)) {
                    studentLogs[log.student_id].clinic++;
                } else {
                    studentLogs[log.student_id].absent++;
                }
            }
        });

        // Render table
        tbody.innerHTML = '';

        (students || []).forEach(student => {
            const stats = studentLogs[student.id];
            const total = stats.present + stats.late + stats.absent + stats.clinic;
            const rate = total > 0 ? Math.round(((stats.present + stats.clinic) / total) * 100) : 0;

            let rateClass = 'text-green-600';
            if (rate < 75) rateClass = 'text-red-600';
            else if (rate < 90) rateClass = 'text-orange-600';

            const row = document.createElement('tr');
            row.className = 'border-b border-gray-50 hover:bg-blue-50/30 transition-all';
            row.innerHTML = `
                <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xs">
                            ${student.full_name.charAt(0)}
                        </div>
                        <div>
                            <p class="font-bold text-gray-800 text-sm">${student.full_name}</p>
                            <p class="text-xs text-gray-400 font-mono">${student.student_id_text}</p>
                        </div>
                    </div>
                </td>
                <td class="px-4 py-3 text-center font-bold text-green-600">${stats.present}</td>
                <td class="px-4 py-3 text-center font-bold text-orange-600">${stats.late}</td>
                <td class="px-4 py-3 text-center font-bold text-red-600">${stats.absent}</td>
                <td class="px-4 py-3 text-center font-bold text-blue-600">${stats.clinic}</td>
                <td class="px-4 py-3 text-center font-bold ${rateClass}">${rate}%</td>
            `;
            tbody.appendChild(row);
        });

    } catch (err) {
        console.error('Error loading summary:', err);
        tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-red-500">Error loading data</td></tr>';
    }
}

// Get subject status from remarks
function getSubjectStatus(remarks, subjectName, defaultStatus) {
    if (!remarks) return defaultStatus || null;
    
    // Match pattern: [SubjectName: Status]
    const regex = new RegExp(`\\[${subjectName}: (Present|Absent|Late|Excused)\\]`, 'i');
    const match = remarks.match(regex);
    
    if (match) {
        return match[1];
    }
    return null;
}

// Get status badge HTML
function getStatusBadge(status, isClinicVisit) {
    if (isClinicVisit) {
        return '<span class="px-3 py-1 rounded-lg text-xs font-bold status-blue">Clinic</span>';
    }
    
    switch (status) {
        case 'Present':
        case 'On Time':
            return '<span class="px-3 py-1 rounded-lg text-xs font-bold status-green">Present</span>';
        case 'Late':
            return '<span class="px-3 py-1 rounded-lg text-xs font-bold status-orange">Late</span>';
        case 'Absent':
            return '<span class="px-3 py-1 rounded-lg text-xs font-bold status-red">Absent</span>';
        case 'Excused':
            return '<span class="px-3 py-1 rounded-lg text-xs font-bold status-blue">Excused</span>';
        default:
            return '<span class="px-3 py-1 rounded-lg text-xs font-bold text-gray-400">--</span>';
    }
}

// Calculate overall status from remarks
function calculateOverallFromRemarks(remarks) {
    if (!remarks) return null;
    
    const subjectRegex = /\[([^\]]+): (Present|Absent|Late|Excused)\]/g;
    const statuses = [];
    let match;
    
    while ((match = subjectRegex.exec(remarks)) !== null) {
        statuses.push(match[2]);
    }
    
    if (statuses.length === 0) return null;
    
    // Priority: Excused > Absent > Late > Present
    if (statuses.includes('Excused')) return 'Excused';
    if (statuses.includes('Absent')) return 'Absent';
    if (statuses.includes('Late')) return 'Late';
    return 'Present';
}

// Export to CSV
function exportAttendance() {
    const tbody = document.getElementById('summary-body');
    const rows = tbody.querySelectorAll('tr');
    
    let csv = 'Student Name,Student ID,Present,Late,Absent,Clinic,Attendance Rate\n';
    
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 6) {
            const name = cells[0].textContent.trim();
            const present = cells[1].textContent.trim();
            const late = cells[2].textContent.trim();
            const absent = cells[3].textContent.trim();
            const clinic = cells[4].textContent.trim();
            const rate = cells[5].textContent.trim();
            csv += `"${name}",${present},${late},${absent},${clinic},${rate}\n`;
        }
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `attendance_${currentView}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}
