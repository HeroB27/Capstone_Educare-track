/**
 * ============================================================================
 * TEACHER STUDENT MODAL - Subject Attendance Matrix Viewer
 * ============================================================================
 * Allows teachers to view a student's subject attendance breakdown over time.
 * Called from teacher-homeroom.js when clicking a student name.
 */

let currentModalStudentId = null;
let currentModalStudentName = '';
let attendanceMatrix = null; // { dates: [], matrix: [] }
let attendanceChart = null;

/**
 * Open the student subject attendance modal
 */
async function openStudentSubjectAttendanceModal(studentId, studentName) {
    const modal = document.getElementById('student-subject-modal');
    if (!modal) {
        showNotification('Modal not found', 'error');
        return;
    }

    currentModalStudentId = studentId;
    currentModalStudentName = studentName;

    // Set default date range (current month)
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const fromDate = firstDayOfMonth.toISOString().split('T')[0];
    const toDate = today.toISOString().split('T')[0];

    // Update modal title
    document.getElementById('student-subject-modal-title').textContent = `Subject Attendance - ${escapeHtml(studentName)}`;
    document.getElementById('student-subject-from-date').value = fromDate;
    document.getElementById('student-subject-to-date').value = toDate;
    document.getElementById('student-subject-modal').dataset.studentId = studentId;

    // Show modal
    modal.classList.remove('hidden');

    // Load initial data
    await loadStudentSubjectAttendanceData(studentId, fromDate, toDate);
}

/**
 * Close the student subject attendance modal
 */
function closeStudentSubjectModal() {
    const modal = document.getElementById('student-subject-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    // Destroy chart if exists
    if (attendanceChart) {
        attendanceChart.destroy();
        attendanceChart = null;
    }
}

/**
 * Load student subject attendance data for date range
 */
async function loadStudentSubjectAttendanceData(studentId, fromDate, toDate) {
    const tbody = document.getElementById('student-subject-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="10" class="text-center py-4">Loading...</td></tr>';

    try {
        // Get student's class
        const { data: student } = await supabase
            .from('students')
            .select('class_id')
            .eq('id', studentId)
            .single();

        if (!student?.class_id) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-red-500">Student class not found</td></tr>';
            return;
        }

        // Get all subject loads for this class
        const { data: subjectLoads } = await supabase
            .from('subject_loads')
            .select('id, subject_name, time_slot')
            .eq('class_id', student.class_id)
            .order('time_slot', { ascending: true })  // morning first, then afternoon
            .order('subject_name', { ascending: true });

        // Get attendance logs for this student in date range
        const { data: logs } = await supabase
            .from('attendance_logs')
            .select('subject_load_id, log_date, status')
            .eq('student_id', studentId)
            .gte('log_date', fromDate)
            .lte('log_date', toDate)
            .not('subject_load_id', 'is', null)
            .order('log_date');

        // Build date range array (only dates that have log entries or are in range)
        const dateSet = new Set();
        logs?.forEach(log => dateSet.add(log.log_date));
        const dates = Array.from(dateSet).sort();

        // Build subject → date matrix
        const subjectDataMap = {};
        subjectLoads?.forEach(sl => {
            subjectDataMap[sl.id] = {
                subject_name: sl.subject_name,
                time_slot: sl.time_slot,
                dates: {}
            };
        });

        logs?.forEach(log => {
            if (subjectDataMap[log.subject_load_id]) {
                subjectDataMap[log.subject_load_id].dates[log.log_date] = log.status;
            }
        });

        // Render table
        let html = '';

        if (dates.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center py-4">No subject attendance recorded in this period</td></tr>';
            return;
        }

        // Header row with dates (limit to last 30 days for display)
        const displayDates = dates.slice(-30); // Show max 30 most recent dates

        html += `<tr><th class="px-2 py-2 text-left bg-gray-100 sticky left-0 z-10">Subject</th>`;
        displayDates.forEach(d => {
            const dateObj = new Date(d);
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            const dayNum = dateObj.getDate();
            html += `<th class="px-1 py-2 text-xs text-center bg-gray-100 whitespace-nowrap">${dayName}<br>${dayNum}</th>`;
        });
        html += `<th class="px-2 py-2 text-left bg-gray-100">Pattern</th></tr>`;

        // Data rows
        const subjectLoadsList = Object.entries(subjectDataMap);

        if (subjectLoadsList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center py-4">No subjects found for this class</td></tr>';
            return;
        }

        for (const [loadId, data] of subjectLoadsList) {
            html += `<tr><td class="px-2 py-2 font-medium sticky left-0 bg-white z-10">${escapeHtml(data.subject_name)}</td>`;

            let lateCount = 0;
            let absentCount = 0;
            let presentCount = 0;
            let excusedCount = 0;

            displayDates.forEach(d => {
                const status = data.dates[d];
                let cellClass = 'status-empty';
                let displayText = '—';

                if (status) {
                    switch (status) {
                        case 'On Time':
                        case 'Present': cellClass = 'status-present'; displayText = 'P'; presentCount++; break;
                        case 'Late': cellClass = 'status-late'; displayText = 'L'; lateCount++; break;
                        case 'Absent': cellClass = 'status-absent'; displayText = 'A'; absentCount++; break;
                        case 'Excused': cellClass = 'status-excused'; displayText = 'E'; excusedCount++; break;
                        case 'Excused Absent': cellClass = 'status-excused-absent'; displayText = 'EA'; excusedCount++; break;
                        default: displayText = '?';
                    }
                }

                html += `<td class="px-1 py-2 text-center"><div class="status-square ${cellClass} text-xs inline-block w-6 h-6 flex items-center justify-center rounded">${displayText}</div></td>`;
            });

            // Calculate pattern
            const totalDays = displayDates.length;
            let pattern = 'OK';
            let patternClass = 'text-green-600 font-medium';

            if (lateCount > 3) {
                pattern = `Late (${lateCount})`;
                patternClass = 'text-orange-600 font-medium';
            }
            if (absentCount > 0 && (absentCount / totalDays) > 0.2) {
                pattern = `Critical absence (${absentCount})`;
                patternClass = 'text-red-600 font-bold';
            } else if (absentCount > 0) {
                pattern = `Absent (${absentCount})`;
                patternClass = 'text-yellow-600 font-medium';
            }

            html += `<td class="px-2 py-2 text-sm ${patternClass} text-right">${pattern}</td></tr>`;
        }

        tbody.innerHTML = html;

        // Also render a simple stats summary
        renderStatsSummary(subjectLoads, displayDates, subjectDataMap);

    } catch (err) {
        console.error('Error loading student subject attendance:', err);
        tbody.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-red-500">Error loading data</td></tr>';
    }
}

/**
 * Render statistics summary below the table
 */
function renderStatsSummary(subjectLoads, dates, subjectDataMap) {
    const statsContainer = document.getElementById('attendance-stats-summary');
    if (!statsContainer) return;

    let totalPresent = 0;
    let totalLate = 0;
    let totalAbsent = 0;
    let totalExcused = 0;
    let totalEntries = 0;

    Object.values(subjectDataMap).forEach(data => {
        dates.forEach(date => {
            const status = data.dates[date];
            if (status) {
                totalEntries++;
                if (status === 'On Time' || status === 'Present') totalPresent++;
                else if (status === 'Late') totalLate++;
                else if (status === 'Absent') totalAbsent++;
                else if (status === 'Excused' || status === 'Excused Absent') totalExcused++;
            }
        });
    });

    const attendanceRate = totalEntries > 0 ? ((totalPresent + totalLate + totalExcused) / totalEntries * 100).toFixed(1) : 0;

    statsContainer.innerHTML = `
        <div class="grid grid-cols-5 gap-4 text-center">
            <div>
                <div class="text-2xl font-bold text-green-600">${totalPresent}</div>
                <div class="text-xs text-gray-500">Present</div>
            </div>
            <div>
                <div class="text-2xl font-bold text-yellow-600">${totalLate}</div>
                <div class="text-xs text-gray-500">Late</div>
            </div>
            <div>
                <div class="text-2xl font-bold text-blue-600">${totalExcused}</div>
                <div class="text-xs text-gray-500">Excused</div>
            </div>
            <div>
                <div class="text-2xl font-bold text-red-600">${totalAbsent}</div>
                <div class="text-xs text-gray-500">Absent</div>
            </div>
            <div>
                <div class="text-2xl font-bold text-violet-600">${attendanceRate}%</div>
                <div class="text-xs text-gray-500">Attendance</div>
            </div>
        </div>
    `;
}

/**
 * Apply date range filter in modal
 */
async function applyStudentSubjectDateFilter() {
    const modal = document.getElementById('student-subject-modal');
    if (!modal) return;

    const studentId = modal.dataset.studentId;
    const fromDate = document.getElementById('student-subject-from-date').value;
    const toDate = document.getElementById('student-subject-to-date').value;

    if (!studentId || !fromDate || !toDate) {
        showNotification('Please select valid date range', 'error');
        return;
    }

    await loadStudentSubjectAttendanceData(parseInt(studentId), fromDate, toDate);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

// Export functions globally
window.openStudentSubjectAttendanceModal = openStudentSubjectAttendanceModal;
window.closeStudentSubjectModal = closeStudentSubjectModal;
window.applyStudentSubjectDateFilter = applyStudentSubjectDateFilter;
