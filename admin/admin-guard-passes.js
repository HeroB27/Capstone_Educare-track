// admin-guard-passes.js - Guard Passes Management for Admin (Historical Data View)

// Sorting state
let currentSort = { field: 'issued', direction: 'desc' };
let cachedPasses = [];

// Store pass data for detail view
let passDetailsMap = {};

async function loadAllPasses() {
    const tbody = document.getElementById('passes-table-body');
    if (!tbody) return;

    const dateFilter = document.getElementById('filter-date')?.value;
    const statusFilter = document.getElementById('filter-status')?.value;
    const searchFilter = document.getElementById('filter-search')?.value.toLowerCase().trim() || '';

    try {
        let query = supabase
            .from('guard_passes')
            .select('*')
            .order('issued_at', { ascending: false });

        if (dateFilter) {
            query = query.gte('issued_at', dateFilter + 'T00:00:00').lt('issued_at', dateFilter + 'T23:59:59');
        }

        const { data: passes, error } = await query;

        if (error) throw error;

        let filteredPasses = passes || [];
        
        // Apply status filter
        if (statusFilter) {
            filteredPasses = filteredPasses.filter(p => p.status === statusFilter);
        }

        const studentIds = [...new Set(filteredPasses.map(p => p.student_id))];
        const teacherIds = [...new Set(filteredPasses.map(p => p.teacher_id))];
        
        const studentMap = {};
        const teacherMap = {};
        const classIds = new Set();
        
        if (studentIds.length > 0) {
            const { data: students } = await supabase
                .from('students')
                .select('id, full_name, student_id_text, class_id')
                .in('id', studentIds);
            students?.forEach(s => {
                studentMap[s.id] = s;
                if (s.class_id) classIds.add(s.class_id);
            });
        }
        
        if (teacherIds.length > 0) {
            const { data: teachers } = await supabase
                .from('teachers')
                .select('id, full_name')
                .in('id', teacherIds);
            teachers?.forEach(t => teacherMap[t.id] = t);
        }
        
        // Also load advisers
        const adviserIds = [...new Set(Object.values(classMap).map(c => c.adviser_id).filter(Boolean))];
        if (adviserIds.length > 0) {
            const { data: advisers } = await supabase
                .from('teachers')
                .select('id, full_name')
                .in('id', adviserIds);
            advisers?.forEach(a => teacherMap[a.id] = a);
        }

        // Load class data for grade levels
        const classMap = {};
        if (classIds.size > 0) {
            const { data: classes } = await supabase
                .from('classes')
                .select('id, grade_level, strand, adviser_id')
                .in('id', [...classIds]);
            classes?.forEach(c => classMap[c.id] = c);
        }

        // Map all data to passes
        filteredPasses = filteredPasses.map(p => {
            const student = studentMap[p.student_id];
            const cls = classMap[student?.class_id];
            return {
                ...p,
                _student: student,
                _teacher: teacherMap[p.teacher_id],
                _class: cls,
                _adviser: cls?.adviser_id ? teacherMap[cls.adviser_id] : null
            };
        });

        // Apply client-side search filter (after data is mapped with relations)
        if (searchFilter) {
            filteredPasses = filteredPasses.filter(p => {
                const studentName = p._student?.full_name?.toLowerCase() || '';
                const studentId = p._student?.student_id_text?.toLowerCase() || '';
                const reason = p.purpose?.toLowerCase() || '';
                const gradeLevel = p._class?.grade_level?.toLowerCase() || '';
                const approvedBy = p._teacher?.full_name?.toLowerCase() || '';
                return studentName.includes(searchFilter) || 
                       studentId.includes(searchFilter) || 
                       reason.includes(searchFilter) ||
                       gradeLevel.includes(searchFilter) ||
                       approvedBy.includes(searchFilter);
            });
        }

        updateStats(filteredPasses);
        renderTable(filteredPasses);
        
        // Store passes for client-side sorting and detail view
        cachedPasses = filteredPasses;
        
        // Store in map for quick lookup
        filteredPasses.forEach(p => {
            passDetailsMap[p.id] = p;
        });

    } catch (err) {
        console.error('Error loading passes:', err);
        tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-8 text-center text-red-500">Error loading data.</td></tr>';
    }
}

function updateStats(passes) {
    const total = passes.length;
    const active = passes.filter(p => p.status === 'Active').length;
    const used = passes.filter(p => p.status === 'Used').length;
    const cancelled = passes.filter(p => p.status === 'Cancelled' || p.status === 'Expired').length;

    const totalEl = document.getElementById('stat-total');
    const activeEl = document.getElementById('stat-active');
    const usedEl = document.getElementById('stat-used');
    const cancelledEl = document.getElementById('stat-cancelled');

    if (totalEl) totalEl.innerText = total;
    if (activeEl) activeEl.innerText = active;
    if (usedEl) usedEl.innerText = used;
    if (cancelledEl) cancelledEl.innerText = cancelled;
}

function renderTable(passes) {
    const tbody = document.getElementById('passes-table-body');
    if (!tbody) return;

    if (!passes || passes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-8 text-center text-gray-500">No guard passes found.</td></tr>';
        return;
    }

    let html = '';
    passes.forEach(pass => {
        // Column 1: Student Name
        const studentName = pass._student?.full_name || 'N/A';
        
        // Column 2: Grade Level (grade_level + strand)
        const gradeLevel = pass._class?.grade_level 
            ? (pass._class.strand ? `${pass._class.grade_level} ${pass._class.strand}` : pass._class.grade_level)
            : 'N/A';
        
        // Column 3: ID Number
        const studentId = pass._student?.student_id_text || 'N/A';
        
        // Column 4: Reason (purpose)
        const reason = pass.purpose || 'N/A';
        
        // Column 5: Time Out
        const timeOut = pass.time_out || 'N/A';
        const formattedTimeOut = timeOut !== 'N/A' && timeOut ? formatTime12(timeOut) : 'N/A';
        
        // Column 6: Approved By (teacher name)
        const approvedBy = pass._teacher?.full_name || 'N/A';
        
        // Column 7: Status - Check for expiry (30 mins from time_out)
        let status = pass.status || 'Active';
        
        // Check if pass is expired (30 minutes from time_out)
        if (pass.time_out && status === 'Active') {
            try {
                const [hours, minutes] = pass.time_out.split(':').map(Number);
                const timeOutDate = new Date();
                timeOutDate.setHours(hours, minutes, 0, 0);
                
                // Add 30 minutes
                const expiryTime = new Date(timeOutDate.getTime() + 30 * 60000);
                const now = new Date();
                
                if (now > expiryTime) {
                    status = 'Expired';
                }
            } catch (e) {
                // If parsing fails, keep original status
            }
        }
        
        let statusBadge = 'bg-gray-100 text-gray-700';
        if (status === 'Active') statusBadge = 'bg-green-100 text-green-700';
        else if (status === 'Used') statusBadge = 'bg-blue-100 text-blue-700';
        else if (status === 'Cancelled') statusBadge = 'bg-red-100 text-red-700';
        else if (status === 'Expired') statusBadge = 'bg-gray-100 text-gray-500';

        // Column 8: Issued (date and time)
        const issuedAt = pass.issued_at ? formatDateTime(pass.issued_at) : 'N/A';

        html += `
            <tr onclick="viewPassDetails('${pass.id}')" class="hover:bg-gray-50 transition-colors cursor-pointer">
                <td class="px-6 py-4">
                    <div>
                        <p class="font-medium text-gray-900">${escapeHtml(studentName)}</p>
                    </div>
                </td>
                <td class="px-6 py-4 text-gray-600">${escapeHtml(gradeLevel)}</td>
                <td class="px-6 py-4 text-gray-600">${escapeHtml(studentId)}</td>
                <td class="px-6 py-4 text-gray-600">${escapeHtml(reason)}</td>
                <td class="px-6 py-4 text-gray-600">${formattedTimeOut}</td>
                <td class="px-6 py-4 text-gray-600">${escapeHtml(approvedBy)}</td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded-full text-xs font-bold ${statusBadge}">${status}</span>
                </td>
                <td class="px-6 py-4 text-gray-600 text-sm">${escapeHtml(issuedAt)}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
    
    if (window.lucide) window.lucide.createIcons();
}

function exportToCSV() {
    const tbody = document.getElementById('passes-table-body');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    if (rows.length === 0 || rows[0].querySelector('td')?.innerText === 'No guard passes found.') {
        alert('No data to export');
        return;
    }

    const headers = ['Student Name', 'Grade Level', 'ID Number', 'Reason', 'Time Out', 'Approved By', 'Status', 'Issued'];
    const data = [];

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length > 1) {
            const rowData = Array.from(cells).map(cell => cell.innerText.replace(/\n/g, ' ').trim());
            data.push(rowData);
        }
    });

    const csvContent = [headers, ...data].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `guard-passes-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

function formatTime12(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHours = h % 12 || 12;
    return `${displayHours}:${minutes} ${ampm}`;
}

// Format date in dd/mm/yyyy hh:mm AM/PM format
function formatDateTime(timestamp) {
    if (!timestamp) return 'N/A';
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return 'N/A';
        
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        
        return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
    } catch (e) {
        return 'N/A';
    }
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function logout() {
    sessionStorage.clear();
    window.location.href = '../index.html';
}

// Sort table by column
function sortTable(field) {
    if (!cachedPasses || cachedPasses.length === 0) return;
    
    // Toggle direction if same field, otherwise ascending
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.direction = 'asc';
    }
    
    const direction = currentSort.direction === 'asc' ? 1 : -1;
    
    // Sort based on field
    cachedPasses.sort((a, b) => {
        let valA, valB;
        
        switch (field) {
            case 'student':
                valA = a._student?.full_name || '';
                valB = b._student?.full_name || '';
                break;
            case 'grade':
                valA = a._class?.grade_level || '';
                valB = b._class?.grade_level || '';
                break;
            case 'id':
                valA = a._student?.student_id_text || '';
                valB = b._student?.student_id_text || '';
                break;
            case 'reason':
                valA = a.purpose || '';
                valB = b.purpose || '';
                break;
            case 'time':
                valA = a.time_out || '';
                valB = b.time_out || '';
                break;
            case 'approver':
                valA = a._teacher?.full_name || '';
                valB = b._teacher?.full_name || '';
                break;
            case 'status':
                valA = a.status || '';
                valB = b.status || '';
                break;
            case 'issued':
                valA = new Date(a.issued_at || 0).getTime();
                valB = new Date(b.issued_at || 0).getTime();
                return direction * (valA - valB);
            default:
                return 0;
        }
        
        return direction * valA.localeCompare(valB);
    });
    
    renderTable(cachedPasses);
}

// View pass details in modal
function viewPassDetails(passId) {
    const pass = passDetailsMap[passId];
    if (!pass) return;
    
    const studentName = pass._student?.full_name || 'N/A';
    const studentId = pass._student?.student_id_text || 'N/A';
    const gradeLevel = pass._class?.grade_level 
        ? (pass._class.strand ? `${pass._class.grade_level} ${pass._class.strand}` : pass._class.grade_level)
        : 'N/A';
    const reason = pass.purpose || 'N/A';
    const timeOut = pass.time_out ? formatTime12(pass.time_out) : 'N/A';
    const approvedBy = pass._teacher?.full_name || 'N/A';
    const issuedAt = pass.issued_at ? formatDateTime(pass.issued_at) : 'N/A';
    let status = pass.status || 'N/A';
    const adviserName = pass._adviser?.full_name || 'N/A';
    
    // Check if pass is expired (30 minutes from time_out)
    if (pass.time_out && status === 'Active') {
        try {
            const [hours, minutes] = pass.time_out.split(':').map(Number);
            const timeOutDate = new Date();
            timeOutDate.setHours(hours, minutes, 0, 0);
            
            // Add 30 minutes
            const expiryTime = new Date(timeOutDate.getTime() + 30 * 60000);
            const now = new Date();
            
            if (now > expiryTime) {
                status = 'Expired';
            }
        } catch (e) {
            // If parsing fails, keep original status
        }
    }
    
    // Status badge
    let statusBadge = 'bg-gray-100 text-gray-700';
    if (status === 'Active') statusBadge = 'bg-green-100 text-green-700';
    else if (status === 'Used') statusBadge = 'bg-blue-100 text-blue-700';
    else if (status === 'Cancelled') statusBadge = 'bg-red-100 text-red-700';
    else if (status === 'Expired') statusBadge = 'bg-gray-100 text-gray-500';
    
    const modal = document.createElement('div');
    modal.id = 'pass-detail-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
    modal.onclick = function(e) {
        if (e.target === modal) modal.remove();
    };
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
            <div class="bg-violet-600 px-6 py-4 flex items-center justify-between">
                <h3 class="text-lg font-bold text-white">Guard Pass Details</h3>
                <button onclick="this.closest('#pass-detail-modal').remove()" class="text-white hover:bg-white/20 rounded-lg p-1">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            <div class="p-6 space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-xs font-bold text-gray-400 uppercase">Student Name</p>
                        <p class="font-medium text-gray-900">${escapeHtml(studentName)}</p>
                    </div>
                    <div>
                        <p class="text-xs font-bold text-gray-400 uppercase">Student ID</p>
                        <p class="font-medium text-gray-900">${escapeHtml(studentId)}</p>
                    </div>
                    <div>
                        <p class="text-xs font-bold text-gray-400 uppercase">Grade Level</p>
                        <p class="font-medium text-gray-900">${escapeHtml(gradeLevel)}</p>
                    </div>
                    <div>
                        <p class="text-xs font-bold text-gray-400 uppercase">Status</p>
                        <span class="px-2 py-1 rounded-full text-xs font-bold ${statusBadge}">${status}</span>
                    </div>
                </div>
                <div>
                    <p class="text-xs font-bold text-gray-400 uppercase">Reason for Going Out</p>
                    <p class="font-medium text-gray-900">${escapeHtml(reason)}</p>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-xs font-bold text-gray-400 uppercase">Time Out</p>
                        <p class="font-medium text-gray-900">${escapeHtml(timeOut)}</p>
                    </div>
                    <div>
                        <p class="text-xs font-bold text-gray-400 uppercase">Issued</p>
                        <p class="font-medium text-gray-900">${escapeHtml(issuedAt)}</p>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-xs font-bold text-gray-400 uppercase">Approved By</p>
                        <p class="font-medium text-gray-900">${escapeHtml(approvedBy)}</p>
                    </div>
                    <div>
                        <p class="text-xs font-bold text-gray-400 uppercase">Adviser</p>
                        <p class="font-medium text-gray-900">${escapeHtml(adviserName)}</p>
                    </div>
                </div>
                <div class="pt-4 border-t border-gray-100">
                    <p class="text-xs text-gray-400">Click anywhere to close</p>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    if (window.lucide) window.lucide.createIcons();
}