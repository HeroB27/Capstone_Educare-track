// teacher-clinicpass.js
// Clinic Pass Issuance with Notification Handshake

document.addEventListener('DOMContentLoaded', async () => {
    await loadClinicPassInterface();
});

/**
 * Load Clinic Pass Interface
 * Fetches students from teacher's advisory class
 */
async function loadClinicPassInterface() {
    const studentSelect = document.getElementById('clinic-student-select');
    if (!studentSelect) return;
    
    try {
        // Get teacher's homeroom class
        const { data: teacherClass } = await supabase
            .from('classes')
            .select('id, grade_level, section_name')
            .eq('adviser_id', currentUser.id)
            .single();
        
        if (!teacherClass) {
            studentSelect.innerHTML = '<option value="">Not an adviser - cannot issue passes</option>';
            // Also check if teacher has subject loads (for subject teachers)
            await loadSubjectStudentsForPass();
            await loadRecentClinicPasses();
            return;
        }
        
        // Get homeroom students
        const { data: students } = await supabase
            .from('students')
            .select('id, student_id_text, full_name')
            .eq('class_id', teacherClass.id)
            .order('full_name');
        
        studentSelect.innerHTML = '<option value="">Select student...</option>';
        
        students?.forEach(student => {
            const option = document.createElement('option');
            option.value = student.id;
            option.text = `${student.student_id_text} - ${student.full_name} (${teacherClass.grade_level} - ${teacherClass.section_name})`;
            studentSelect.appendChild(option);
        });
        
        await loadRecentClinicPasses();
        
    } catch (err) {
        console.error('Error loading clinic pass interface:', err);
    }
}

/**
 * Load Subject Students for Subject Teachers
 * Allows subject teachers to issue passes for students in their classes
 */
async function loadSubjectStudentsForPass() {
    const studentSelect = document.getElementById('clinic-student-select');
    if (!studentSelect) return;
    
    try {
        const { data: subjectLoads } = await supabase
            .from('subject_loads')
            .select('class_id, subject_name')
            .eq('teacher_id', currentUser.id);
        
        if (!subjectLoads || subjectLoads.length === 0) return;
        
        const classIds = [...new Set(subjectLoads.map(sl => sl.class_id))];
        
        const { data: students } = await supabase
            .from('students')
            .select('id, student_id_text, full_name, classes(grade_level, section_name)')
            .in('class_id', classIds)
            .order('full_name');
        
        if (students && students.length > 0) {
            // Add subject teacher students
            students.forEach(student => {
                // Check if already added
                if (!studentSelect.querySelector(`option[value="${student.id}"]`)) {
                    const option = document.createElement('option');
                    option.value = student.id;
                    option.text = `${student.student_id_text} - ${student.full_name} (${student.classes?.grade_level} - ${student.classes?.section_name})`;
                    studentSelect.appendChild(option);
                }
            });
        }
        
    } catch (err) {
        console.error('Error loading subject students:', err);
    }
}

/**
 * Issue Clinic Pass with Nurse Notification
 * Creates visit record and notifies all clinic staff
 */
async function issueClinicPass() {
    const studentId = document.getElementById('clinic-student-select').value;
    const reason = document.getElementById('clinic-reason').value.trim();

    if (!studentId || !reason) {
        alert('Please select a student and provide a reason.');
        return;
    }

    try {
        // 1. Check if student already has an active pass
        const { data: existingPass } = await supabase
            .from('clinic_visits')
            .select('id, status')
            .eq('student_id', studentId)
            .in('status', ['Pending', 'Approved', 'Checked In'])
            .is('time_out', null)
            .single();
        
        if (existingPass) {
            alert(`This student already has an active clinic pass (Status: ${existingPass.status}).`);
            return;
        }
        
        // 2. Create the Clinic Visit Record
        const { data: visit, error: visitError } = await supabase
            .from('clinic_visits')
            .insert({
                student_id: studentId,
                referred_by_teacher_id: currentUser.id,
                reason: reason,
                status: 'Pending'
            })
            .select()
            .single();

        if (visitError) throw visitError;

        // 3. Notify ALL Clinic Staff (Real-time alert)
        await supabase.from('notifications').insert({
            recipient_role: 'clinic_staff',
            title: 'New Clinic Referral',
            message: `Student referred for: ${reason}. Please check pending list.`,
            type: 'clinic_referral',
            is_read: false,
            created_at: new Date().toISOString()
        });

        alert('Clinic pass issued successfully! Nurse has been notified.');
        document.getElementById('clinic-reason').value = '';
        await loadRecentClinicPasses();
        
    } catch (err) {
        console.error('Error issuing clinic pass:', err);
        alert('Failed to issue pass. Please try again.');
    }
}

/**
 * Load Recent Clinic Passes
 * Shows teacher's issued passes with forwarding options
 */
async function loadRecentClinicPasses() {
    const passList = document.getElementById('recent-clinic-passes');
    if (!passList) return;
    
    try {
        const { data: passes, error } = await supabase
            .from('clinic_visits')
            .select(`
                *,
                students (student_id_text, full_name)
            `)
            .eq('referred_by_teacher_id', currentUser.id)
            .order('time_in', { ascending: false })
            .limit(20);
        
        if (error) {
            console.error('Error loading clinic passes:', error);
            return;
        }
        
        // Status badge colors
        const statusColors = {
            'Pending': 'bg-yellow-100 text-yellow-800',
            'Approved': 'bg-blue-100 text-blue-800',
            'Checked In': 'bg-orange-100 text-orange-800',
            'Sent Home': 'bg-red-100 text-red-800',
            'Cleared': 'bg-green-100 text-green-800',
            'Completed': 'bg-green-100 text-green-800',
            'Rejected': 'bg-gray-100 text-gray-800'
        };
        
        passList.innerHTML = '';
        
        passes?.forEach(pass => {
            const statusBadge = statusColors[pass.status] || 'bg-gray-100 text-gray-800';
            
            // Action and Notes display
            const notesDisplay = pass.nurse_notes 
                ? `<p class="text-sm text-blue-600 mt-1"><strong>Nurse:</strong> ${pass.nurse_notes}</p>` 
                : '';
            
            const actionDisplay = pass.action_taken 
                ? `<p class="text-sm text-green-600 mt-1"><strong>Action:</strong> ${pass.action_taken}</p>` 
                : '';
            
            // Forward to Parent button - ONLY show when findings are ready
            // Criteria: Completed status OR nurse_notes exist
            const canForward = (pass.status === 'Completed' || pass.nurse_notes) && !pass.parent_notified;
            const forwardedBadge = pass.parent_notified 
                ? `<span class="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Forwarded to Parent</span>` 
                : '';
            
            const forwardButton = canForward
                ? `<button onclick="forwardToParent('${pass.id}', '${pass.students?.full_name}')" 
                    class="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition">
                    📤 Forward Findings to Parent
                  </button>`
                : (pass.parent_notified 
                    ? '' 
                    : `<span class="mt-2 text-xs text-gray-400 italic">Waiting for nurse findings...</span>`);
            
            const div = document.createElement('div');
            div.className = 'p-4 border rounded bg-white shadow-sm hover:shadow-md transition';
            div.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-gray-800">${pass.students?.full_name}</span>
                            <span class="text-sm text-gray-500">${pass.students?.student_id_text}</span>
                        </div>
                        <p class="text-sm text-gray-600 mt-1">📋 ${pass.reason}</p>
                        ${notesDisplay}
                        ${actionDisplay}
                        ${forwardButton}
                    </div>
                    <div class="text-right">
                        <span class="px-2 py-1 rounded text-xs ${statusBadge}">${pass.status}</span>
                        ${forwardedBadge}
                        <p class="text-xs text-gray-400 mt-2">${pass.time_in ? new Date(pass.time_in).toLocaleString() : 'Pending'}</p>
                    </div>
                </div>
            `;
            passList.appendChild(div);
        });
        
        if (passList.children.length === 0) {
            passList.innerHTML = '<p class="text-gray-500 text-center py-8">No clinic passes issued yet.</p>';
        }
        
    } catch (err) {
        console.error('Error in loadRecentClinicPasses:', err);
    }
}

/**
 * Render Recent Passes (New version with status-based rendering)
 * Renders passes to the recent-passes-list element
 */
function renderRecentPasses(passes) {
    const list = document.getElementById('recent-passes-list');
    if (!list) return;
    
    list.innerHTML = passes.map(pass => {
        const statusClass = pass.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700';
        
        return `
            <div class="p-4 border-b">
                <div class="flex justify-between items-start">
                    <h4 class="font-bold">${pass.students.full_name}</h4>
                    <span class="text-[10px] px-2 py-0.5 rounded-full ${statusClass}">${pass.status}</span>
                </div>
                <p class="text-xs text-gray-500">Reason: ${pass.reason}</p>
                ${pass.action_taken ? `<p class="text-[10px] mt-1 text-blue-600 font-medium">Outcome: ${pass.action_taken}</p>` : ''}
            </div>
        `;
    }).join('');
}

/**
 * Forward Clinic Findings to Parent
 * Only callable when nurse has provided notes
 */
async function forwardToParent(clinicVisitId, studentName) {
    if (!confirm(`Forward clinic findings for ${studentName} to their parent?`)) {
        return;
    }
    
    try {
        // 1. Get visit details with student/parent info
        const { data: visit } = await supabase
            .from('clinic_visits')
            .select('student_id, nurse_notes, action_taken, status')
            .eq('id', clinicVisitId)
            .single();
        
        if (!visit) {
            alert('Visit record not found.');
            return;
        }
        
        // Double-check: don't forward if no notes
        if (!visit.nurse_notes && !visit.action_taken) {
            alert('No findings to forward yet. Please wait for the nurse to complete the visit.');
            return;
        }
        
        // 2. Get parent's notification channel
        const { data: student } = await supabase
            .from('students')
            .select('parent_id, full_name')
            .eq('id', visit.student_id)
            .single();
        
        if (!student?.parent_id) {
            alert('No parent linked to this student.');
            return;
        }
        
        // 3. Get parent's contact info
        const { data: parent } = await supabase
            .from('parents')
            .select('id, full_name, phone')
            .eq('id', student.parent_id)
            .single();
        
        // 4. Create message
        const message = `Good day! Your child ${student.full_name} visited the clinic today. ` +
            `${visit.nurse_notes ? 'Findings: ' + visit.nurse_notes : ''} ` +
            `${visit.action_taken ? 'Action: ' + visit.action_taken + '. ' : ''}` +
            `Please contact the school clinic for more details.`;
        
        // 5. Send notification to parent
        await supabase.from('notifications').insert({
            recipient_id: student.parent_id,
            recipient_role: 'parent',
            title: 'Clinic Visit Alert',
            message: message,
            type: 'clinic_visit',
            is_read: false,
            created_at: new Date().toISOString()
        });
        
        // 6. Also try SMS if available (optional - depends on SMS API integration)
        // await sendSMS(parent.phone, message);
        
        // 7. Mark as notified in visit record
        await supabase
            .from('clinic_visits')
            .update({ 
                parent_notified: true,
                parent_notified_at: new Date().toISOString()
            })
            .eq('id', clinicVisitId);
        
        alert(`Findings forwarded to ${parent?.full_name || 'parent'} successfully!`);
        await loadRecentClinicPasses();
        
    } catch (err) {
        console.error('Error forwarding to parent:', err);
        alert('Error forwarding findings. Please try again.');
    }
}
