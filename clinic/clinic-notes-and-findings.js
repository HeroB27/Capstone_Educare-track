// clinic/clinic-notes-and-findings.js

let currentVisitHistory = [];
let selectedStudentId = null;
let searchTimeout;

document.addEventListener('DOMContentLoaded', async () => {
    if (currentUser) {
        document.getElementById('filter-date').value = new Date().toISOString().split('T')[0];
        const activeVisitId = sessionStorage.getItem('activeVisitId');
        if (activeVisitId) {
            sessionStorage.removeItem('activeVisitId');
            await loadAndOpenVisit(parseInt(activeVisitId));
        } else {
            await loadAllVisits();
        }
    }
});

async function loadAndOpenVisit(visitId) {
    try {
        const { data: visit, error } = await supabase
            .from('clinic_visits')
            .select(`*, students(*, classes(*)), teachers(*)`)
            .eq('id', visitId)
            .single();
        
        if (error || !visit) {
            showToast('Visit not found', 'error');
            await loadAllVisits();
            return;
        }
        
        currentVisitHistory = [visit];
        renderVisitHistory([visit]);
        setTimeout(() => openEditNotesModal(visitId), 500);
        
    } catch (err) {
        console.error('Error loading visit:', err);
        await loadAllVisits();
    }
}

function handleStudentSearch(query) {
    clearTimeout(searchTimeout);
    
    if (query.length < 2) {
        document.getElementById('student-search-results').classList.add('hidden');
        return;
    }
    
    searchTimeout = setTimeout(async () => {
        const results = await searchStudents(query);
        const container = document.getElementById('student-search-results');
        
        if (results.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm p-3">No students found</p>';
        } else {
            container.innerHTML = results.map(student => `
                <div onclick="selectStudentForHistory(${student.id}, '${student.full_name}')" 
                    class="p-3 hover:bg-gray-50 rounded-lg cursor-pointer flex items-center gap-3 transition-all duration-200">
                    <div class="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center text-sm font-bold text-red-600">
                        ${getInitials(student.full_name)}
                    </div>
                    <div>
                        <p class="font-medium text-sm">${student.full_name}</p>
                        <p class="text-xs text-gray-500">${student.classes?.grade_level || ''} - ${student.classes?.section_name || ''}</p>
                    </div>
                </div>
            `).join('');
        }
        container.classList.remove('hidden');
    }, 300);
}

async function selectStudentForHistory(studentId, studentName) {
    selectedStudentId = studentId;
    document.getElementById('student-search').value = studentName;
    document.getElementById('student-search-results').classList.add('hidden');
    document.getElementById('history-title').innerText = `Visit History: ${studentName}`;
    await loadStudentVisitHistory(studentId);
}

async function loadAllVisits() {
    const today = new Date().toISOString().split('T')[0];
    currentVisitHistory = await fetchVisitsByDateRange(today, today);
    renderVisitHistory(currentVisitHistory);
}

async function loadStudentVisitHistory(studentId) {
    currentVisitHistory = await fetchStudentVisitHistory(studentId);
    renderVisitHistory(currentVisitHistory);
}

async function filterByDate() {
    const date = document.getElementById('filter-date').value;
    if (!date) return;
    
    if (selectedStudentId) {
        const visits = await fetchStudentVisitHistory(selectedStudentId);
        currentVisitHistory = visits.filter(v => v.time_in.startsWith(date));
    } else {
        currentVisitHistory = await fetchVisitsByDateRange(date, date);
    }
    renderVisitHistory(currentVisitHistory);
}

async function resetSearch() {
    selectedStudentId = null;
    document.getElementById('student-search').value = '';
    document.getElementById('history-title').innerText = 'All Visit Records';
    await loadAllVisits();
}

function renderVisitHistory(visits) {
    const tbody = document.getElementById('visit-history-body');
    
    if (visits.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-12 text-center text-gray-500">No visit records found</td></tr>`;
        return;
    }
    
    tbody.innerHTML = visits.map(visit => {
        const isActive = visit.status === 'Checked In' && !visit.time_out;
        const duration = calculateDuration(visit.time_in, visit.time_out);
        
        return `
            <tr class="hover:bg-gray-50 transition-all duration-200 ${isActive ? 'bg-amber-50/50' : ''}">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatDate(visit.time_in)}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-3">
                        <div class="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center text-sm font-bold text-red-600">${getInitials(visit.students?.full_name)}</div>
                        <span class="text-sm font-medium text-gray-800">${visit.students?.full_name || 'Unknown'}</span>
                    </div>
                </td>
                <td class="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">${visit.reason || 'N/A'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatTime(visit.time_in)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${visit.time_out ? formatTime(visit.time_out) : '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${duration}</td>
                <td class="px-6 py-4 whitespace-nowrap"><span class="px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">${visit.status}</span></td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="viewVisitDetails(${visit.id})" class="text-red-600 hover:text-red-700 mr-3 transition-all duration-200">View</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function viewVisitDetails(visitId) {
    const visit = currentVisitHistory.find(v => v.id === visitId);
    if (!visit) return;
    
    const modal = document.getElementById('visit-details-modal');
    const content = document.getElementById('visit-details-content');
    
    content.innerHTML = `
        <div class="space-y-4">
            <div class="flex items-center gap-4">
                <div class="h-14 w-14 rounded-2xl bg-red-100 flex items-center justify-center text-xl font-bold text-red-600">${getInitials(visit.students?.full_name)}</div>
                <div>
                    <h4 class="text-xl font-bold text-gray-800">${visit.students?.full_name || 'Unknown'}</h4>
                    <p class="text-sm text-gray-500">ID: ${visit.students?.student_id_text || 'N/A'}</p>
                </div>
            </div>
            <div class="p-4 bg-red-50 rounded-xl border border-red-100">
                <p class="text-xs text-red-500 mb-1">Reason for Visit</p>
                <p class="text-gray-700 whitespace-pre-wrap">${visit.reason || 'Not specified'}</p>
            </div>
            <div class="p-4 bg-blue-50 rounded-xl border border-blue-100">
                <p class="text-xs text-blue-500 mb-1">Nurse Notes & Observations</p>
                <p class="text-gray-700 whitespace-pre-wrap">${visit.nurse_notes || 'No notes recorded'}</p>
            </div>
            <div class="flex gap-3 mt-6">
                <button onclick="openEditNotesModal(${visit.id}); closeVisitDetailsModal();" class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 font-medium">Update Notes</button>
                <button onclick="closeVisitDetailsModal()" class="px-5 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium text-gray-600">Close</button>
            </div>
        </div>
    `;
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeVisitDetailsModal() {
    document.getElementById('visit-details-modal').classList.add('hidden');
}

function openEditNotesModal(visitId) {
    const visit = currentVisitHistory.find(v => v.id === visitId);
    if (!visit) return;
    
    document.getElementById('edit-notes-visit-id').value = visitId;
    document.getElementById('edit-nurse-notes').value = visit.nurse_notes || '';
    document.getElementById('edit-action-taken').value = visit.action_taken || '';
    document.getElementById('edit-parent-notified').checked = visit.parent_notified || false;
    
    document.getElementById('edit-notes-modal').classList.remove('hidden');
    document.getElementById('edit-notes-modal').classList.add('flex');
}

function closeEditNotesModal() {
    document.getElementById('edit-notes-modal').classList.add('hidden');
}

async function handleUpdateNotes(event) {
    event.preventDefault();
    
    const visitId = document.getElementById('edit-notes-visit-id').value;
    const notesData = {
        nurseNotes: document.getElementById('edit-nurse-notes').value,
        actionTaken: document.getElementById('edit-action-taken').value,
        parentNotified: document.getElementById('edit-parent-notified').checked
    };
    
    try {
        await updateVisitNotes(visitId, notesData);
        closeEditNotesModal();
        
        // Refresh the data
        if (selectedStudentId) {
            await loadStudentVisitHistory(selectedStudentId);
        } else {
            await filterByDate();
        }
    } catch (error) {
        console.error('Failed to update notes:', error);
    }
}

function exportRecords() {
    if (currentVisitHistory.length === 0) {
        showToast('No records to export.', 'warning');
        return;
    }
    
    const exportData = currentVisitHistory.map(visit => ({
        Date: formatDate(visit.time_in),
        Time_In: formatTime(visit.time_in),
        Time_Out: visit.time_out ? formatTime(visit.time_out) : 'N/A',
        Student_Name: visit.students?.full_name || 'Unknown',
        Student_ID: visit.students?.student_id_text || 'N/A',
        Class: `${visit.students?.classes?.grade_level || ''} ${visit.students?.classes?.section_name || ''}`,
        Reason: visit.reason || '',
        Referred_By: visit.teachers?.full_name || 'Walk-in',
        Action_Taken: visit.action_taken || '',
        Nurse_Notes: visit.nurse_notes || '',
        Status: visit.status || 'Completed'
    }));
    
    exportToCSV(exportData, `clinic_visit_records_${new Date().toISOString().split('T')[0]}`);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Close search results when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('#student-search-container')) {
        document.getElementById('student-search-results')?.classList.add('hidden');
    }
});

window.viewVisitDetails = viewVisitDetails;
window.closeVisitDetailsModal = closeVisitDetailsModal;
window.openEditNotesModal = openEditNotesModal;
window.closeEditNotesModal = closeEditNotesModal;
window.handleUpdateNotes = handleUpdateNotes;
window.handleStudentSearch = handleStudentSearch;
window.selectStudentForHistory = selectStudentForHistory;
window.filterByDate = filterByDate;
window.resetSearch = resetSearch;
window.exportRecords = exportRecords;