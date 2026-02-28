// parent/parent-childs-attendance.js
// Attendance calendar with precise monthly queries and color-coded status

let currentViewDate = new Date();
let attendanceData = {};
let holidays = {};

/**
 * Initialize attendance page
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initial load if child exists
    if (currentChild) {
        await loadAttendanceCalendar();
    }
    
    // 2. THE FIX: ALWAYS attach the listener, remove the 'else' block!
    document.addEventListener('childChanged', async () => {
        await loadAttendanceCalendar();
    });
});

/**
 * Load attendance data and render calendar
 */
async function loadAttendanceCalendar() {
    if (!currentChild) return;

    document.getElementById('loading-indicator').classList.remove('hidden');
    document.getElementById('attendance-content').classList.add('hidden');

    try {
        // Load attendance logs for current month
        await loadMonthAttendance();
        
        // Load holidays
        await loadHolidays();
        
        // Render calendar
        renderCalendar();
        
        // Calculate and show stats
        calculateStats();

        document.getElementById('loading-indicator').classList.add('hidden');
        document.getElementById('attendance-content').classList.remove('hidden');

    } catch (err) {
        console.error('Error loading attendance calendar:', err);
        document.getElementById('loading-indicator').classList.add('hidden');
    }
}

/**
 * Update child selector dropdown
 */
function updateChildSelector() {
    const selectorEl = document.getElementById('child-selector');
    if (!selectorEl) return;

    selectorEl.innerHTML = `
        <select id="child-select" onchange="switchChildFromSelector(this.value)" class="p-2 rounded bg-green-700 text-white text-sm font-medium">
            ${allChildren.map(child => `
                <option value="${child.id}" ${currentChild?.id === child.id ? 'selected' : ''}>
                    ${child.full_name.split(' ')[0]}
                </option>
            `).join('')}
        </select>
    `;
}

/**
 * Switch child from selector
 */
function switchChildFromSelector(childId) {
    switchChild(childId);
}

/**
 * Load attendance data for current month with precise date bounds
 */
async function loadMonthAttendance() {
    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();
    
    // Calculate first and last day of the month precisely
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const monthStart = firstDay.toISOString().split('T')[0];
    const monthEnd = lastDay.toISOString().split('T')[0];

    try {
        const { data: logs, error } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', currentChild.id)
            .gte('log_date', monthStart)
            .lte('log_date', monthEnd);

        if (error) {
            console.error('Error loading attendance:', error);
            attendanceData = {};
            return;
        }

        // Convert array to object indexed by date for O(1) lookup
        attendanceData = {};
        logs?.forEach(log => {
            attendanceData[log.log_date] = log;
        });

    } catch (err) {
        console.error('Error in loadMonthAttendance:', err);
        attendanceData = {};
    }
}

/**
 * Load holidays for current month with precise date bounds
 */
async function loadHolidays() {
    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();
    
    // Calculate first and last day of the month precisely
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const monthStart = firstDay.toISOString().split('T')[0];
    const monthEnd = lastDay.toISOString().split('T')[0];

    try {
        const { data: holidayData, error } = await supabase
            .from('holidays')
            .select('holiday_date, description, is_suspended')
            .gte('holiday_date', monthStart)
            .lte('holiday_date', monthEnd);

        if (error) {
            console.error('Error loading holidays:', error);
            holidays = {};
            return;
        }

        holidays = {};
        holidayData?.forEach(h => {
            holidays[h.holiday_date] = h;
        });

    } catch (err) {
        console.error('Error in loadHolidays:', err);
        holidays = {};
    }
}

/**
 * Render the calendar grid with color-coded days
 */
function renderCalendar() {
    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();
    
    // Update month title
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('current-month').textContent = `${monthNames[month]} ${year}`;

    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    // Get first day of month and total days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date().toISOString().split('T')[0];

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'h-12';
        grid.appendChild(emptyCell);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = dateStr === today;
        const isWeekend = new Date(dateStr).getDay() === 0 || new Date(dateStr).getDay() === 6;
        const holiday = holidays[dateStr];
        const attendance = attendanceData[dateStr];

        const dayCell = document.createElement('div');
        dayCell.className = `h-12 rounded-lg flex items-center justify-center text-sm font-medium cursor-pointer transition hover:shadow-md ${getDayClass(attendance, holiday, isWeekend, dateStr)}`;
        dayCell.textContent = day;
        dayCell.onclick = () => showDayDetails(dateStr, attendance, holiday);
        
        if (isToday) {
            dayCell.classList.add('ring-2', 'ring-green-600');
        }

        grid.appendChild(dayCell);
    }
}

/**
 * Get CSS class for a day cell with precise colors
 */
function getDayClass(attendance, holiday, isWeekend, dateStr) {
    const today = new Date().toISOString().split('T')[0];
    const isFuture = dateStr > today;

    // Holiday - suspended (no class)
    if (holiday && holiday.is_suspended) {
        return 'bg-gray-200 text-gray-400';
    }

    // Holiday with class
    if (holiday) {
        return 'bg-purple-200 text-purple-800';
    }

    // Future date
    if (isFuture) {
        return 'bg-gray-100 text-gray-400';
    }

    // Weekend
    if (isWeekend) {
        return 'bg-gray-100 text-gray-400';
    }

    // No attendance record (mark as absent)
    if (!attendance) {
        return 'bg-red-200 text-red-800';
    }

    // Has attendance record - check status string directly
    if (attendance.status === 'Late') {
        return 'bg-yellow-200 text-yellow-800';
    } else if (attendance.status === 'Absent') {
        return 'bg-red-200 text-red-800';
    } else if (attendance.status === 'Excused') {
        return 'bg-purple-200 text-purple-800';
    } else {
        return 'bg-green-200 text-green-800';
    }
}

/**
 * Renders the attendance trend chart for the current month.
 */
function renderTrendChart() {
    const ctx = document.getElementById('attendance-trend-chart')?.getContext('2d');
    if (!ctx) return;

    const dailyCounts = {};
    Object.values(attendanceData).forEach(log => {
        if (!dailyCounts[log.log_date]) {
            dailyCounts[log.log_date] = { present: 0, late: 0, absent: 0 };
        }
        if (log.status === 'On Time' || log.status === 'Present' || log.status === 'Excused') {
            dailyCounts[log.log_date].present++;
        } else if (log.status === 'Late') {
            dailyCounts[log.log_date].late++;
        } else if (log.status === 'Absent') {
            dailyCounts[log.log_date].absent++;
        }
    });

    const labels = Object.keys(dailyCounts).sort();

    if (window.attendanceTrendChart) window.attendanceTrendChart.destroy();
    window.attendanceTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Present', data: labels.map(l => dailyCounts[l]?.present || 0), borderColor: '#22c55e', tension: 0.1, fill: false },
                { label: 'Late', data: labels.map(l => dailyCounts[l]?.late || 0), borderColor: '#f59e0b', tension: 0.1, fill: false },
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}


function showDayDetails(dateStr, attendance, holiday) {
    const detailsEl = document.getElementById('day-details');
    const contentEl = document.getElementById('day-content');
    const date = new Date(dateStr);
    const dateFormatted = date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric',
        year: 'numeric'
    });

    detailsEl.classList.remove('hidden');

    if (holiday) {
        contentEl.innerHTML = `
            <div class="flex items-center gap-2 mb-3">
                <span class="text-3xl">🎉</span>
                <span class="font-bold text-lg text-purple-700">${holiday.description}</span>
            </div>
            <p class="text-gray-600">${dateFormatted}</p>
            ${holiday.is_suspended ? '<p class="text-sm text-red-600 mt-2">⚠️ No classes scheduled</p>' : ''}
        `;
    } else if (!attendance) {
        contentEl.innerHTML = `
            <div class="flex items-center gap-2 mb-3">
                <span class="text-3xl">❓</span>
                <span class="font-bold text-lg text-gray-700">No Record</span>
            </div>
            <p class="text-gray-600">${dateFormatted}</p>
            <p class="text-sm text-gray-400 mt-2">No attendance record found for this date.</p>
        `;
    } else {
        let statusIcon = '';
        let statusClass = '';
        let statusText = '';

        if (attendance.status === 'Late') {
            statusIcon = '⏰';
            statusClass = 'text-yellow-600';
            statusText = 'Late Arrival';
        } else if (attendance.status === 'Absent') {
            statusIcon = '❌';
            statusClass = 'text-red-600';
            statusText = 'Absent';
        } else if (attendance.status === 'Excused') {
            statusIcon = '📝';
            statusClass = 'text-purple-600';
            statusText = 'Excused';
        } else {
            statusIcon = '✅';
            statusClass = 'text-green-600';
            statusText = 'Present';
        }

        contentEl.innerHTML = `
            <div class="flex items-center gap-2 mb-3">
                <span class="text-3xl">${statusIcon}</span>
                <span class="font-bold text-lg ${statusClass}">${statusText}</span>
            </div>
            <p class="text-gray-600">${dateFormatted}</p>
            <div class="mt-4 space-y-2">
                ${attendance.time_in ? `
                    <div class="flex justify-between py-2 border-b">
                        <span class="text-gray-500">Time In:</span>
                        <span class="font-medium">${formatTime(attendance.time_in)}</span>
                    </div>
                ` : ''}
                ${attendance.time_out ? `
                    <div class="flex justify-between py-2 border-b">
                        <span class="text-gray-500">Time Out:</span>
                        <span class="font-medium">${formatTime(attendance.time_out)}</span>
                    </div>
                ` : ''}
                ${attendance.remarks ? `
                    <div class="flex justify-between py-2 border-b">
                        <span class="text-gray-500">Remarks:</span>
                        <span class="font-medium text-right max-w-[60%]">${attendance.remarks}</span>
                    </div>
                ` : ''}
            </div>
        `;
    }
}

/**
 * Calculate attendance statistics (Excused counts as Present)
 */
function calculateStats() {
    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();
    
    let present = 0;
    let late = 0;
    let absent = 0;
    let excused = 0;
    let totalSchoolDays = 0;

    // Count school days and attendance
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date().toISOString().split('T')[0];
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const date = new Date(dateStr);
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        const isToday = dateStr === today;
        const holiday = holidays[dateStr];
        
        // Skip if holiday (no class)
        if (holiday && holiday.is_suspended) {
            continue;
        }

        // Skip weekends
        if (isWeekend) {
            continue;
        }

        // Skip future dates
        if (dateStr > today) {
            continue;
        }

        totalSchoolDays++;

        const attendance = attendanceData[dateStr];
        
        if (!attendance) {
            absent++;
        } else if (attendance.status === 'Late') {
            late++;
        } else if (attendance.status === 'Excused') {
            excused++; // Excused counts as present
        } else if (attendance.status === 'Absent') {
            absent++;
        } else {
            present++;
        }
    }

    // Update UI
    document.getElementById('stat-present').textContent = present;
    document.getElementById('stat-late').textContent = late;
    document.getElementById('stat-absent').textContent = absent;
    
    // Attendance percentage (Present + Excused) / Total School Days
    const percentage = totalSchoolDays > 0 ? Math.round(((present + excused) / totalSchoolDays) * 100) : 0;
    document.getElementById('stat-percent').textContent = `${percentage}%`;
}

/**
 * Change month navigation
 */
function changeMonth(delta) {
    currentViewDate.setMonth(currentViewDate.getMonth() + delta);
    loadAttendanceCalendar();
}

// Make functions available globally
window.loadAttendanceCalendar = loadAttendanceCalendar;
window.changeMonth = changeMonth;
window.switchChildFromSelector = switchChildFromSelector;

/**
 * Get status color for attendance status
 * Used for calendar day coloring
 * @param {string} status - The attendance status
 * @returns {string} - CSS color class
 */
function getStatusColor(status) {
    switch (status) {
        case 'present':
        case 'On Time':
            return 'bg-green-500'; // Green
        case 'late':
        case 'Late':
            return 'bg-yellow-500'; // Yellow
        case 'absent':
        case 'Absent':
            return 'bg-red-500'; // Red
        case 'excused':
        case 'Excused':
            return 'bg-purple-500'; // Purple - NEW
        default:
            return 'bg-gray-300';
    }
}

window.getStatusColor = getStatusColor;
