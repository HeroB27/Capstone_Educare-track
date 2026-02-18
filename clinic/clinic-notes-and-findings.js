// clinic/clinic-notes-and-findings.js

// ============================================================================
// CLINIC VISIT RECORDS - JavaScript Logic
// ============================================================================
// Features: Search students, view visit history, filter by date, export records
// ============================================================================

// Session Check
// currentUser is now global in clinic-core.js

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================
let selectedStudent = null;
let visitRecords = [];
let filteredRecords = [];

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (currentUser) {
        // Set clinic staff name
        const sidebarName = document.getElementById('clinic-name-sidebar');
        if (sidebarName) sidebarName.textContent = currentUser.full_name || 'Nurse';
        
        const headerName = document.getElementById('clinic-name');
        if (headerName) headerName.textContent = currentUser.full_name || 'Nurse';
    }
    
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('filter-date');
    if (dateInput) dateInput.value = today;
    
    // Load stats
    loadStats();
});

/**
 * Load statistics for the dashboard
 */
async function loadStats() {
    const today = new Date().toISOString().split('T')[0];
    
    try {
        // Today's visits
        const { count: todayCount } = await supabase
            .from('clinic_visits')
            .select('*', { count: 'exact', head: true })
            .eq('visit_date', today);
        
        document.getElementById('stat-today').textContent = todayCount || 0;
        
        // Active in clinic (status: 'checked_in')
        const { count: activeCount } = await supabase
            .from('clinic_visits')
            .select('*', { count: 'exact', head: true })
            .eq('visit_date', today)
            .eq('status', 'checked_in');
        
        document.getElementById('stat-active').textContent = activeCount || 0;
        
        // Discharged
        const { count: dischargedCount } = await supabase
            .from('clinic_visits')
            .select('*', { count: 'exact', head: true })
            .eq('visit_date', today)
            .eq('status', 'cleared');
        
        document.getElementById('stat-discharged').textContent = dischargedCount || 0;
        
        // Sent home
        const { count: sentHomeCount } = await supabase
            .from('clinic_visits')
            .select('*', { count: 'exact', head: true })
            .eq('visit_date', today)
            .eq('status', 'sent_home');
        
        document.getElementById('stat-sent-home').textContent = sentHomeCount || 0;
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ============================================================================
// STUDENT SEARCH
// ============================================================================

/**
 * Handle student search input
 */
async function handleStudentSearch(query) {
    const resultsContainer = document.getElementById('student-search-results');
    
    if (query.length < 2) {
        resultsContainer.classList.add('hidden');
        return;
    }
    
    try {
        const { data: students, error } = await supabase
            .from('students')
            .select('id, student_id, full_name, grade_level, section')
            .ilike('full_name', `%${query}%`)
            .limit(5);
        
        if (error) throw error;
        
        if (!students || students.length === 0) {
            resultsContainer.innerHTML = `
                <div class="p-3 text-gray-500 text-sm">No students found</div>
            `;
            resultsContainer.classList.remove('hidden');
            return;
        }
        
        resultsContainer.innerHTML = students.map(student => `
            <div onclick="selectStudent('${student.id}', '${student.student_id}', '${escapeHtml(student.full_name)}', '${student.grade_level}', '${escapeHtml(student.section)}')" 
                class="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                <div class="font-medium text-gray-800">${escapeHtml(student.full_name)}</div>
                <div class="text-xs text-gray-500">${student.student_id} - ${student.grade_level} ${student.section}</div>
            </div>
        `).join('');
        
        resultsContainer.classList.remove('hidden');
        
    } catch (error) {
        console.error('Error searching students:', error);
    }
}

/**
 * Select a student from search results
 */
function selectStudent(id, studentId, fullName, gradeLevel, section) {
    selectedStudent = { id, studentId, fullName, gradeLevel, section };
    
    // Update search input
    const searchInput = document.getElementById('student-search');
    searchInput.value = fullName;
    
    // Hide search results
    document.getElementById('student-search-results').classList.add('hidden');
    
    // Update title
    document.getElementById('history-title').textContent = `Visit History: ${fullName}`;
    
    // Load visit records for this student
    loadVisitRecords(id);
}

/**
 * Reset search
 */
function resetSearch() {
    selectedStudent = null;
    document.getElementById('student-search').value = '';
    document.getElementById('filter-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('history-title').textContent = 'All Visit Records';
    
    // Clear table
    document.getElementById('visit-history-body').innerHTML = `
        <tr>
            <td colspan="8" class="px-6 py-12 text-center text-gray-500">
                Search for a student to view visit records
            </td>
        </tr>
    `;
}

// ============================================================================
// VISIT RECORDS
// ============================================================================

/**
 * Load visit records for a student
 */
async function loadVisitRecords(studentId) {
    const tbody = document.getElementById('visit-history-body');
    tbody.innerHTML = `
        <tr>
            <td colspan="8" class="px-6 py-12 text-center">
                <div class="flex items-center justify-center gap-3">
                    <svg class="animate-spin h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span class="text-gray-500">Loading records...</span>
                </div>
            </td>
        </tr>
    `;
    
    try {
        const { data: visits, error } = await supabase
            .from('clinic_visits')
            .select(`
                *,
                students(full_name, student_id, grade_level, section)
            `)
            .eq('student_id', studentId)
            .order('visit_date', { ascending: false })
            .order('time_in', { ascending: false });
        
        if (error) throw error;
        
        visitRecords = visits || [];
        filteredRecords = [...visitRecords];
        
        renderVisitRecords();
        
    } catch (error) {
        console.error('Error loading visit records:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="px-6 py-12 text-center text-red-500">
                    Error loading records. Please try again.
                </td>
            </tr>
        `;
    }
}

/**
 * Filter records by date
 */
async function filterByDate() {
    const date = document.getElementById('filter-date').value;
    
    if (!selectedStudent) {
        // If no student selected, load all records for that date
        try {
            const { data: visits, error } = await supabase
                .from('clinic_visits')
                .select(`
                    *,
                    students(full_name, student_id, grade_level, section)
                `)
                .eq('visit_date', date)
                .order('time_in', { ascending: false });
            
            if (error) throw error;
            
            visitRecords = visits || [];
            filteredRecords = [...visitRecords];
            renderVisitRecords();
            
        } catch (error) {
            console.error('Error filtering records:', error);
        }
        return;
    }
    
    // Filter selected student's records by date
    try {
        const { data: visits, error } = await supabase
            .from('clinic_visits')
            .select(`
                *,
                students(full_name, student_id, grade_level, section)
            `)
            .eq('student_id', selectedStudent.id)
            .eq('visit_date', date)
            .order('time_in', { ascending: false });
        
        if (error) throw error;
        
        filteredRecords = visits || [];
        renderVisitRecords();
        
    } catch (error) {
        console.error('Error filtering records:', error);
    }
}

/**
 * Render visit records to table
 */
function renderVisitRecords() {
    const tbody = document.getElementById('visit-history-body');
    
    if (filteredRecords.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="px-6 py-12 text-center text-gray-500">
                    No visit records found
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = filteredRecords.map(visit => {
        const statusBadge = getStatusBadge(visit.status);
        const duration = calculateDuration(visit.time_in, visit.time_out);
        
        return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-medium text-gray-800">${formatDate(visit.visit_date)}</div>
                </td>
                <td class="px-6 py-4">
                    <div class="text-sm font-medium text-gray-800">${visit.students?.full_name || 'Unknown'}</div>
                    <div class="text-xs text-gray-500">${visit.students?.student_id}</div>
                </td>
                <td class="px-6 py-4">
                    <div class="text-sm text-gray-600">${escapeHtml(visit.reason)}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-600">${formatTime(visit.time_in)}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-600">${visit.time_out ? formatTime(visit.time_out) : '-'}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-600">${duration}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    ${statusBadge}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <button onclick="viewVisitDetails('${visit.id}')" class="text-red-600 hover:text-red-800 transition-colors">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get status badge HTML
 */
function getStatusBadge(status) {
    const statusClasses = {
        'pending': 'bg-gray-100 text-gray-700',
        'checked_in': 'bg-amber-100 text-amber-700',
        'cleared': 'bg-green-100 text-green-700',
        'sent_home': 'bg-blue-100 text-blue-700',
        'referred': 'bg-red-100 text-red-700'
    };
    
    const statusLabels = {
        'pending': 'Pending',
        'checked_in': 'In Clinic',
        'cleared': 'Cleared',
        'sent_home': 'Sent Home',
        'referred': 'Referred'
    };
    
    return `
        <span class="px-2 py-1 text-xs rounded-full font-medium ${statusClasses[status] || 'bg-gray-100 text-gray-700'}">
            ${statusLabels[status] || status}
        </span>
    `;
}

/**
 * Calculate duration between time in and time out
 */
function calculateDuration(timeIn, timeOut) {
    if (!timeIn) return '-';
    if (!timeOut) return 'Ongoing';
    
    const [inHours, inMinutes] = timeIn.split(':').map(Number);
    const [outHours, outMinutes] = timeOut.split(':').map(Number);
    
    const inTotal = inHours * 60 + inMinutes;
    const outTotal = outHours * 60 + outMinutes;
    
    const diff = outTotal - inTotal;
    if (diff < 0) return 'Invalid';
    
    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format time for display
 */
function formatTime(timeStr) {
    if (!timeStr) return '-';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
}

/**
 * View visit details
 */
function viewVisitDetails(visitId) {
    console.log('View visit details:', visitId);
    // Could open a modal with full visit details
}

/**
 * Export records to CSV
 */
function exportRecords() {
    if (filteredRecords.length === 0) {
        alert('No records to export');
        return;
    }
    
    const headers = ['Date', 'Student', 'Student ID', 'Reason', 'Time In', 'Time Out', 'Duration', 'Status'];
    const rows = filteredRecords.map(visit => [
        visit.visit_date,
        visit.students?.full_name || '',
        visit.students?.student_id || '',
        visit.reason || '',
        visit.time_in || '',
        visit.time_out || '',
        calculateDuration(visit.time_in, visit.time_out),
        visit.status || ''
    ]);
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `clinic-records-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
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

// Close search results when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('#student-search') && !e.target.closest('#student-search-results')) {
        document.getElementById('student-search-results')?.classList.add('hidden');
    }
});
