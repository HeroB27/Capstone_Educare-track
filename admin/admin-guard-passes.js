// admin-guard-passes.js - Guard Passes Management for Admin (Historical Data View)

async function loadAllPasses() {
    const tbody = document.getElementById('passes-table-body');
    if (!tbody) return;

    const dateFilter = document.getElementById('filter-date')?.value;
    const statusFilter = document.getElementById('filter-status')?.value;

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

        // Load class data for grade levels
        const classMap = {};
        if (classIds.size > 0) {
            const { data: classes } = await supabase
                .from('classes')
                .select('id, grade_level, adviser_id')
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

        updateStats(filteredPasses);
        renderTable(filteredPasses);

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
        tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-8 text-center text-gray-500">No guard passes found.</td></tr>';
        return;
    }

    let html = '';
    passes.forEach(pass => {
        const studentName = pass._student?.full_name || 'Unknown';
        const studentId = pass._student?.student_id_text || '';
        const teacherName = pass._teacher?.full_name || 'Unknown';
        const timeOut = pass.time_out || '--:--';
        const issuedAt = pass.issued_at ? new Date(pass.issued_at).toLocaleString() : 'N/A';
        
        let statusBadge = 'bg-gray-100 text-gray-700';
        if (pass.status === 'Active') statusBadge = 'bg-yellow-100 text-yellow-700';
        if (pass.status === 'Used') statusBadge = 'bg-green-100 text-green-700';
        if (pass.status === 'Cancelled') statusBadge = 'bg-red-100 text-red-700';
        if (pass.status === 'Expired') statusBadge = 'bg-gray-100 text-gray-500';

        html += `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4">
                    <div>
                        <p class="font-medium text-gray-900">${escapeHtml(studentName)}</p>
                        <p class="text-xs text-gray-500">${escapeHtml(studentId)}</p>
                    </div>
                </td>
                <td class="px-6 py-4 text-gray-600">${escapeHtml(teacherName)}</td>
                <td class="px-6 py-4 text-gray-600">${escapeHtml(pass.purpose)}</td>
                <td class="px-6 py-4 text-gray-600">${formatTime12(timeOut)}</td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded-full text-xs font-bold ${statusBadge}">${pass.status}</span>
                </td>
                <td class="px-6 py-4 text-gray-600 text-sm">${issuedAt}</td>
                <td class="px-6 py-4">
                    ${pass.parent_notified 
                        ? '<span class="text-green-600 flex items-center gap-1"><i data-lucide="check" class="w-4 h-4"></i> Yes</span>' 
                        : '<span class="text-gray-400">No</span>'}
                </td>
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

    const headers = ['Student', 'Student ID', 'Teacher', 'Purpose', 'Time Out', 'Status', 'Issued At', 'Parent Notified'];
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