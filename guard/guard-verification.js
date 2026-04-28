// guard-verification.js - Guard Pass Verification Logic (FIXED - No FK Joins)

async function verifyPass() {
    const studentIdInput = document.getElementById('verify-student-id');
    const studentId = studentIdInput?.value?.trim();
    
    if (!studentId) {
        showToast('Please enter a student ID', 'error');
        return;
    }

    const resultDiv = document.getElementById('verification-result');
    const resultContent = document.getElementById('result-content');
    
    resultDiv?.classList.remove('hidden');
    resultContent.innerHTML = '<div class="animate-pulse text-gray-500">Verifying...</div>';

    try {
        let student;
        const { data: studentData, error: studentError } = await supabase
            .from('students')
            .select('id, full_name, student_id_text, profile_photo_url, class_id, parent_id')
            .eq('student_id_text', studentId)
            .maybeSingle();
        
        if (!studentData && !studentError) {
            const res2 = await supabase.from('students').select('*').eq('qr_code_data', studentId).maybeSingle();
            if (res2.data) student = res2.data;
        }
        if (studentData) student = studentData;

        if (!student) {
            resultContent.innerHTML = `
                <div class="text-center py-8">
                    <div class="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i data-lucide="x-circle" class="w-10 h-10 text-red-600"></i>
                    </div>
                    <p class="text-xl font-bold text-red-600">Student Not Found</p>
                    <p class="text-gray-500 mt-2">No student found with ID: ${escapeHtml(studentId)}</p>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        
        const { data: activePass, error: passError } = await supabase
            .from('guard_passes')
            .select('*')
            .eq('student_id', student.id)
            .eq('status', 'Active')
            .gte('issued_at', today + 'T00:00:00')
            .order('issued_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!activePass) {
            resultContent.innerHTML = `
                <div class="text-center py-8">
                    <div class="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i data-lucide="x-circle" class="w-10 h-10 text-gray-600"></i>
                    </div>
                    <p class="text-xl font-bold text-gray-600">No Active Pass</p>
                    <p class="text-gray-500 mt-2">${escapeHtml(student.full_name)} has no active guard pass.</p>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        const { data: teacher } = await supabase
            .from('teachers')
            .select('full_name')
            .eq('id', activePass.teacher_id)
            .single();

        const teacherName = teacher?.full_name || 'Unknown';
        const timeOut = activePass.time_out || '--:--';
        const issuedTime = new Date(activePass.issued_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        
        resultContent.innerHTML = `
            <div class="text-center py-4">
                <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="check-circle" class="w-10 h-10 text-green-600"></i>
                </div>
                <p class="text-xl font-bold text-green-600 mb-2">Valid Pass Found</p>
                <div class="bg-gray-50 rounded-xl p-4 mb-4 text-left">
                    <p class="font-semibold text-lg">${escapeHtml(student.full_name)}</p>
                    <p class="text-sm text-gray-500">ID: ${escapeHtml(student.student_id_text)}</p>
                    <hr class="my-3">
                    <p class="text-sm"><span class="font-medium">Purpose:</span> ${escapeHtml(activePass.purpose)}</p>
                    <p class="text-sm"><span class="font-medium">Time Out:</span> ${formatTime12(timeOut)}</p>
                    <p class="text-sm"><span class="font-medium">Issued By:</span> ${escapeHtml(teacherName)}</p>
                    <p class="text-sm"><span class="font-medium">Issued At:</span> ${issuedTime}</p>
                </div>
                <button onclick="usePass(${activePass.id})" class="w-full px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition flex items-center justify-center gap-2">
                    <i data-lucide="door-open" class="w-5 h-5"></i>
                    Mark as Used (Exit Approved)
                </button>
            </div>
        `;
        
        studentIdInput.value = '';
        if (window.lucide) window.lucide.createIcons();

    } catch (err) {
        console.error('Error verifying pass:', err);
        resultContent.innerHTML = '<p class="text-red-500 text-center py-4">Error verifying pass.</p>';
    }
}

async function usePass(passId) {
    if (!confirm('Confirm that this student is leaving the premises?')) return;

    try {
        const { error } = await supabase
            .from('guard_passes')
            .update({ status: 'Used' })
            .eq('id', passId);

        if (error) throw error;

        showToast('Pass marked as used. Student may exit.', 'success');
        
        document.getElementById('verification-result')?.classList.add('hidden');
        await loadActivePasses();

    } catch (err) {
        console.error('Error using pass:', err);
        showToast('Failed to update pass status', 'error');
    }
}

async function loadActivePasses() {
    const container = document.getElementById('active-passes-list');
    const countEl = document.getElementById('pass-count');
    if (!container) return;

    try {
        const today = new Date().toISOString().split('T')[0];
        
        const { data: passes, error } = await supabase
            .from('guard_passes')
            .select('*')
            .eq('status', 'Active')
            .gte('issued_at', today + 'T00:00:00')
            .order('issued_at', { ascending: false });

        if (error) throw error;

        if (!passes || passes.length === 0) {
            container.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-gray-500">No active guard passes today.</td></tr>`;
            if (countEl) countEl.textContent = '0 passes';
            return;
        }

        const studentIds = [...new Set(passes.map(p => p.student_id))];
        const teacherIds = [...new Set(passes.map(p => p.teacher_id))];
        const studentMap = {};
        const teacherMap = {};
        
        if (studentIds.length > 0) {
            const { data: students } = await supabase
                .from('students')
                .select('id, full_name, student_id_text')
                .in('id', studentIds);
            students?.forEach(s => studentMap[s.id] = s);
        }
        
        if (teacherIds.length > 0) {
            const { data: teachers } = await supabase
                .from('teachers')
                .select('id, full_name')
                .in('id', teacherIds);
            teachers?.forEach(t => teacherMap[t.id] = t);
        }

        if (countEl) countEl.textContent = `${passes.length} pass${passes.length !== 1 ? 'es' : ''}`;

        // FIXED: Added click-to-approve functionality - click on row to approve
        let html = '';
        passes.forEach(pass => {
            const student = studentMap[pass.student_id];
            const teacher = teacherMap[pass.teacher_id];
            const studentName = student?.full_name || 'Unknown';
            const studentId = student?.student_id_text || '';
            const teacherName = teacher?.full_name || 'Unknown';
            const timeOut = pass.time_out || '--:--';
            const purpose = pass.purpose || 'General';
            
            html += `
                <tr class="hover:bg-green-50 transition-colors cursor-pointer" onclick="approvePassByClick(${pass.id}, '${escapeHtml(studentName).replace(/'/g, "\\'")}')" title="Click to approve exit">
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                                <span class="text-xs font-bold text-yellow-700">${getInitials(studentName)}</span>
                            </div>
                            <span class="font-medium text-gray-800">${escapeHtml(studentName)}</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-600">${escapeHtml(studentId)}</td>
                    <td class="px-6 py-4 text-sm text-gray-600">${escapeHtml(purpose)}</td>
                    <td class="px-6 py-4 text-sm text-gray-600">${formatTime12(timeOut)}</td>
                    <td class="px-6 py-4 text-sm text-gray-600">${escapeHtml(teacherName)}</td>
                    <td class="px-6 py-4">
                        <span class="px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">Active</span>
                    </td>
                    <td class="px-6 py-4">
                        <button onclick="event.stopPropagation(); approvePassByClick(${pass.id}, '${escapeHtml(studentName).replace(/'/g, "\\'")}')" class="px-3 py-1 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700">
                            Approve
                        </button>
                    </td>
                </tr>
            `;
        });
        container.innerHTML = html;

    } catch (err) {
        console.error('Error loading active passes:', err);
        if (countEl) countEl.textContent = 'Error';
        container.innerHTML = '<tr><td colspan="7" class="px-6 py-8 text-center text-gray-500">Error loading passes.</td></tr>';
    }
}

// FIXED: New function to approve pass by clicking row or button
async function approvePassByClick(passId, studentName) {
    if (!confirm(`Confirm that ${studentName} is leaving the premises?`)) return;
    
    try {
        const { error } = await supabase
            .from('guard_passes')
            .update({ status: 'Used' })
            .eq('id', passId);

        if (error) throw error;

        showToast(`Pass approved for ${studentName}. Student may exit.`, 'success');
        await loadActivePasses();
    } catch (err) {
        console.error('Error approving pass:', err);
        showToast('Failed to approve pass', 'error');
    }
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

function toggleMobileSidebar() {
    const sidebar = document.getElementById('mobile-sidebar');
    if (sidebar) sidebar.classList.toggle('hidden');
}

function logout() {
    sessionStorage.clear();
    window.location.href = '../index.html';
}