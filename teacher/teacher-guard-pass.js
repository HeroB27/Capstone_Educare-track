// teacher-guard-pass.js - Guard Pass Creation and Management (FIXED - No FK Joins)

// Global variable to store the pass being edited
let currentEditPassId = null;
let currentCancelPassId = null;

async function loadHomeroomStudents() {
    const selectEl = document.getElementById('guard-student-select');
    if (!selectEl) return;

    try {
        const { data: homeroom } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();

        let students;
        if (homeroom) {
            const { data: hrStudents } = await supabase
                .from('students')
                .select('id, full_name')
                .eq('class_id', homeroom.id)
                .eq('status', 'Enrolled')
                .order('full_name');
            students = hrStudents;
        } else {
            const { data: allStudents } = await supabase
                .from('students')
                .select('id, full_name')
                .eq('status', 'Enrolled')
                .order('full_name')
                .limit(100);
            students = allStudents;
        }

        if (!students || students.length === 0) {
            selectEl.innerHTML = '<option value="">No students found</option>';
            return;
        }

        selectEl.innerHTML = '<option value="">Select a student</option>' +
            students.map(s => `<option value="${s.id}">${escapeHtml(s.full_name)}</option>`).join('');

    } catch (err) {
        console.error('Error loading students:', err);
        selectEl.innerHTML = '<option value="">Error loading students</option>';
    }
}

async function createGuardPass() {
    const selectEl = document.getElementById('guard-student-select');
    const purposeEl = document.getElementById('guard-purpose');
    const timeOutEl = document.getElementById('guard-time-out');
    const notifyEl = document.getElementById('notify-parent');

    const studentId = selectEl?.value;
    const purpose = purposeEl?.value?.trim();
    const timeOut = timeOutEl?.value;
    const notifyParent = notifyEl?.checked ?? true;

    if (!studentId) {
        showToast('Please select a student', 'error');
        return;
    }
    if (!purpose) {
        showToast('Please provide a purpose', 'error');
        return;
    }
    if (!timeOut) {
        showToast('Please specify time out', 'error');
        return;
    }

    try {
        const { data: pass, error } = await supabase
            .from('guard_passes')
            .insert({
                student_id: parseInt(studentId),
                teacher_id: currentUser.id,
                purpose: purpose,
                time_out: timeOut,
                status: 'Active',
                parent_notified: notifyParent
            })
            .select()
            .single();

        if (error) throw error;

        if (notifyParent) {
            const { data: student } = await supabase
                .from('students')
                .select('full_name, parent_id')
                .eq('id', studentId)
                .single();
            
            const teacherName = currentTeacher?.full_name || 'Teacher';
            
            if (student?.parent_id) {
                await supabase.from('notifications').insert({
                    recipient_id: student.parent_id,
                    recipient_role: 'parent',
                    title: `Guard Pass Issued for ${student.full_name}`,
                    message: `A guard pass has been issued for ${student.full_name} to leave school premises.\n\nPurpose: ${purpose}\nTime Out: ${formatTime12(timeOut)}\nIssued by: ${teacherName}`,
                    type: 'guard_pass',
                    created_at: new Date().toISOString()
                });

                await supabase
                    .from('guard_passes')
                    .update({ parent_notified_at: new Date().toISOString() })
                    .eq('id', pass.id);
            }
        }

        await supabase.from('admin_alerts').insert({
            alert_type: 'guard_pass',
            title: 'New Guard Pass Issued',
            message: `${pass.student_id} - ${purpose} by ${currentTeacher?.full_name || 'Teacher'}`,
            severity: 'low',
            metadata: {
                pass_id: pass.id,
                student_id: studentId,
                teacher_id: currentUser.id
            }
        });

        showToast('Guard pass created successfully!', 'success');

        selectEl.value = '';
        purposeEl.value = '';
        const now = new Date();
        timeOutEl.value = now.toTimeString().slice(0, 5);

        await loadGuardPasses();

    } catch (err) {
        console.error('Error creating guard pass:', err);
        showToast('Failed to create guard pass', 'error');
    }
}

async function loadGuardPasses() {
    const container = document.getElementById('passes-list');
    if (!container) return;

    try {
        const { data: homeroom } = await supabase
            .from('classes')
            .select('id')
            .eq('adviser_id', currentUser.id)
            .single();

        let studentIds = [];
        if (homeroom) {
            const { data: hrStudents } = await supabase
                .from('students')
                .select('id')
                .eq('class_id', homeroom.id);
            studentIds = hrStudents?.map(s => s.id) || [];
        }

        const today = new Date().toISOString().split('T')[0];

        let passes;
        if (studentIds.length > 0) {
            const { data } = await supabase
                .from('guard_passes')
                .select('*')
                .in('student_id', studentIds)
                .gte('issued_at', today + 'T00:00:00')
                .order('issued_at', { ascending: false });
            passes = data;
        } else {
            passes = [];
        }

        const todayCount = passes?.length || 0;
        const activeCount = passes?.filter(p => p.status === 'Active').length || 0;
        const usedCount = passes?.filter(p => p.status === 'Used').length || 0;

        const todayEl = document.getElementById('today-passes');
        const activeEl = document.getElementById('active-passes');
        const usedEl = document.getElementById('used-passes');
        if (todayEl) todayEl.innerText = todayCount;
        if (activeEl) activeEl.innerText = activeCount;
        if (usedEl) usedEl.innerText = usedCount;

        if (!passes || passes.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-8">No guard passes issued today.</p>';
            return;
        }

        const studentMap = {};
        const teacherMap = {};
        
        const studentIdsList = [...new Set(passes.map(p => p.student_id))];
        const teacherIdsList = [...new Set(passes.map(p => p.teacher_id))];
        
        if (studentIdsList.length > 0) {
            const { data: students } = await supabase.from('students').select('id, full_name').in('id', studentIdsList);
            students?.forEach(s => studentMap[s.id] = s);
        }
        
        if (teacherIdsList.length > 0) {
            const { data: teachers } = await supabase.from('teachers').select('id, full_name').in('id', teacherIdsList);
            teachers?.forEach(t => teacherMap[t.id] = t);
        }

        let html = '';
        passes.forEach(pass => {
            const studentName = studentMap[pass.student_id]?.full_name || 'Unknown';
            const teacherName = teacherMap[pass.teacher_id]?.full_name || 'Unknown';
            const initials = getInitials(studentName);
            const time = pass.time_out || '--:--';
            const issuedTime = new Date(pass.issued_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            
            let statusColor = 'bg-yellow-100 text-yellow-700';
            if (pass.status === 'Used') statusColor = 'bg-green-100 text-green-700';
            if (pass.status === 'Cancelled') statusColor = 'bg-red-100 text-red-700';
            if (pass.status === 'Expired') statusColor = 'bg-gray-100 text-gray-700';

            html += `
                <div class="p-4 bg-gray-50 rounded-xl border mb-3">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center font-bold text-sm">${initials}</div>
                            <div>
                                <p class="font-semibold text-gray-800">${escapeHtml(studentName)}</p>
                                <p class="text-xs text-gray-500">Time Out: ${formatTime12(time)} • Issued: ${issuedTime}</p>
                            </div>
                        </div>
                        <span class="px-3 py-1 rounded-full text-xs font-bold ${statusColor}">${pass.status}</span>
                    </div>
                    <p class="text-sm text-gray-600 mb-2">Purpose: ${escapeHtml(pass.purpose)}</p>
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            ${pass.parent_notified ? '<span class="text-xs text-green-600 flex items-center gap-1"><i data-lucide="check" class="w-3 h-3"></i> Parent Notified</span>' : ''}
                        </div>
                        ${pass.status === 'Active' ? `
                        <div class="flex gap-2">
                            <button onclick="editPass(${pass.id}, '${escapeHtml(pass.purpose).replace(/'/g, "\\'")}', '${pass.time_out}')" class="text-sm text-blue-600 hover:text-blue-700 font-medium">
                                Edit
                            </button>
                            <button onclick="cancelGuardPass(${pass.id})" class="text-sm text-red-600 hover:text-red-700 font-medium">
                                Cancel
                            </button>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();

    } catch (err) {
        console.error('Error loading guard passes:', err);
        container.innerHTML = '<p class="text-center text-gray-400 py-4">Error loading guard passes.</p>';
    }
}

function editPass(passId, currentPurpose, currentTimeOut) {
    currentEditPassId = passId;
    document.getElementById('edit-purpose').value = currentPurpose;
    document.getElementById('edit-time-out').value = currentTimeOut;
    document.getElementById('edit-pass-modal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
}

function closeEditModal() {
    document.getElementById('edit-pass-modal').classList.add('hidden');
    currentEditPassId = null;
}

async function saveEditPass() {
    if (!currentEditPassId) return;
    
    const newPurpose = document.getElementById('edit-purpose').value?.trim();
    const newTimeOut = document.getElementById('edit-time-out').value?.trim();
    
    if (!newPurpose) {
        showToast('Please enter a purpose', 'error');
        return;
    }
    if (!newTimeOut) {
        showToast('Please specify time out', 'error');
        return;
    }

    try {
        const { error } = await supabase
            .from('guard_passes')
            .update({ 
                purpose: newPurpose,
                time_out: newTimeOut
            })
            .eq('id', currentEditPassId)
            .eq('status', 'Active');

        if (error) throw error;

        showToast('Pass updated successfully', 'success');
        closeEditModal();
        await loadGuardPasses();

    } catch (err) {
        console.error('Error editing pass:', err);
        showToast('Failed to update pass', 'error');
    }
}

function cancelGuardPass(passId) {
    currentCancelPassId = passId;
    document.getElementById('cancel-modal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
}

function closeCancelModal() {
    document.getElementById('cancel-modal').classList.add('hidden');
    currentCancelPassId = null;
}

async function confirmCancelPass() {
    if (!currentCancelPassId) return;

    try {
        const { error } = await supabase
            .from('guard_passes')
            .update({ status: 'Cancelled' })
            .eq('id', currentCancelPassId);

        if (error) throw error;

        showToast('Pass cancelled successfully', 'success');
        closeCancelModal();
        await loadGuardPasses();

    } catch (err) {
        console.error('Error cancelling pass:', err);
        showToast('Failed to cancel pass', 'error');
    }
}

function viewPassDetail(passId) {
    console.log('View pass detail:', passId);
    // Could implement a view modal here in the future
}

function viewDetailModal(pass) {
    const modal = document.getElementById('detail-modal');
    const content = document.getElementById('modal-content');
    const actions = document.getElementById('modal-actions');
    
    const studentName = pass.student_name || 'Unknown';
    const teacherName = pass.teacher_name || 'Unknown';
    const time = pass.time_out || '--:--';
    const issuedTime = new Date(pass.issued_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    
    let statusColor = 'bg-yellow-100 text-yellow-700';
    if (pass.status === 'Used') statusColor = 'bg-green-100 text-green-700';
    if (pass.status === 'Cancelled') statusColor = 'bg-red-100 text-red-700';
    if (pass.status === 'Expired') statusColor = 'bg-gray-100 text-gray-700';
    
    content.innerHTML = `
        <div class="flex items-center gap-4 mb-4">
            <div class="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center font-bold">${getInitials(studentName)}</div>
            <div>
                <p class="font-semibold text-lg">${escapeHtml(studentName)}</p>
                <p class="text-sm text-gray-500">${pass.grade_level || ''} ${pass.department || ''}</p>
            </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
            <div>
                <p class="text-xs text-gray-500">Purpose</p>
                <p class="font-medium">${escapeHtml(pass.purpose)}</p>
            </div>
            <div>
                <p class="text-xs text-gray-500">Status</p>
                <span class="px-3 py-1 rounded-full text-xs font-bold ${statusColor}">${pass.status}</span>
            </div>
            <div>
                <p class="text-xs text-gray-500">Time Out</p>
                <p class="font-medium">${formatTime12(time)}</p>
            </div>
            <div>
                <p class="text-xs text-gray-500">Issued At</p>
                <p class="font-medium">${issuedTime}</p>
            </div>
        </div>
        ${pass.parent_notified ? '<p class="text-sm text-green-600 flex items-center gap-1"><i data-lucide="check" class="w-4 h-4"></i> Parent notified</p>' : ''}
    `;
    
    let actionHtml = '';
    if (pass.status === 'Active') {
        actionHtml = `
            <button onclick="editPass(${pass.id}, '${escapeHtml(pass.purpose).replace(/'/g, "\\'")}', '${pass.time_out}')" class="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition">Edit</button>
            <button onclick="cancelGuardPass(${pass.id})" class="px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl transition">Cancel</button>
        `;
    }
    actionHtml += `<button onclick="closeDetailModal()" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition">Close</button>`;
    actions.innerHTML = actionHtml;
    
    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
}

function closeDetailModal() {
    document.getElementById('detail-modal')?.classList.add('hidden');
}

function formatTime12(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHours = h % 12 || 12;
    return `${displayHours}:${minutes} ${ampm}`;
}

function getInitials(fullName) {
    if (!fullName) return '?';
    const parts = fullName.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    console.log(`[${type}] ${message}`);
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type} fixed bottom-4 right-4 p-4 rounded shadow-lg z-50`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Export functions to window for onclick handlers
window.loadHomeroomStudents = loadHomeroomStudents;
window.createGuardPass = createGuardPass;
window.loadGuardPasses = loadGuardPasses;
window.editPass = editPass;
window.cancelGuardPass = cancelGuardPass;
window.saveEditPass = saveEditPass;
window.confirmCancelPass = confirmCancelPass;
window.closeEditModal = closeEditModal;
window.closeCancelModal = closeCancelModal;
window.viewPassDetail = viewPassDetail;
window.viewDetailModal = viewDetailModal;
window.closeDetailModal = closeDetailModal;
window.formatTime12 = formatTime12;
window.getInitials = getInitials;
window.escapeHtml = escapeHtml;
window.showToast = showToast;