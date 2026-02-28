// clinic/clinic-core.js

// ============================================================================
// CLINIC MODULE - Core Logic (Enhanced Workflow)
// ============================================================================
// Features: Session management, data fetching, notifications, patient management
// Enhanced Workflow: Pending → Approved → Checked In → Sent Home/Cleared
// ============================================================================

var currentUser = checkSession('clinic_staff');

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================
let currentClinicUser = null;

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    if (currentUser) {
        // Fetch full clinic_staff record
        await fetchClinicStaff();
        updateUserDisplay();
    }
});

/**
 * Fetch clinic_staff record from database
 * Gets full profile data for the logged-in nurse
 */
async function fetchClinicStaff() {
    try {
        const { data, error } = await supabase
            .from('clinic_staff')
            .select('*')
            .eq('id', currentUser.id)
            .single();
        
        if (error) {
            console.error('Error fetching clinic staff:', error);
            return;
        }
        
        currentClinicUser = data;
    } catch (err) {
        console.error('Error in fetchClinicStaff:', err);
    }
}

/**
 * Update user display in header
 */
function updateUserDisplay() {
    const nameEl = document.getElementById('clinic-name');
    if (nameEl && currentClinicUser) {
        nameEl.innerText = `Nurse on Duty: ${currentClinicUser.full_name}`;
    }
}

// ============================================================================
// VISIT MANAGEMENT - ENHANCED WORKFLOW
// ============================================================================

/**
 * Fetch all pending clinic passes awaiting approval
 * Returns passes where status = 'Pending'
 */
async function fetchPendingApprovals() {
    try {
        const { data, error } = await supabase
            .from('clinic_visits')
            .select(`
                *,
                students (
                    id,
                    full_name,
                    student_id_text,
                    lrn,
                    profile_photo_url,
                    classes (grade_level, section_name, adviser_id)
                ),
                teachers (full_name)
            `)
            .eq('status', 'Pending')
            .order('time_in', { ascending: true });
        
        if (error) {
            console.error('Error fetching pending approvals:', error);
            return [];
        }
        
        return data || [];
    } catch (err) {
        console.error('Error in fetchPendingApprovals:', err);
        return [];
    }
}

/**
 * Fetch approved passes waiting for student check-in
 * Returns passes where status = 'Approved'
 */
async function fetchApprovedPasses() {
    try {
        const { data, error } = await supabase
            .from('clinic_visits')
            .select(`
                *,
                students (
                    id,
                    full_name,
                    student_id_text,
                    lrn,
                    profile_photo_url,
                    classes (grade_level, section_name, adviser_id)
                ),
                teachers (full_name)
            `)
            .eq('status', 'Approved')
            .order('time_in', { ascending: true });
        
        if (error) {
            console.error('Error fetching approved passes:', error);
            return [];
        }
        
        return data || [];
    } catch (err) {
        console.error('Error in fetchApprovedPasses:', err);
        return [];
    }
}

/**
 * Approve a pending clinic pass
 * @param {number} visitId - The visit ID to approve
 */
async function approveClinicPass(visitId) {
    try {
        // First get the visit details for notification
        const { data: visit } = await supabase
            .from('clinic_visits')
            .select(`
                *,
                students (full_name, classes (grade_level, section_name))
            `)
            .eq('id', visitId)
            .single();
        
        if (!visit) {
            throw new Error('Visit not found');
        }
        
        // Update status to Approved
        const { error } = await supabase
            .from('clinic_visits')
            .update({ status: 'Approved' })
            .eq('id', visitId);
        
        if (error) {
            console.error('Error approving clinic pass:', error);
            throw error;
        }
        
        // Notify the teacher that pass was approved
        await notifyTeacherStudentAtClinic(
            visit.referred_by_teacher_id,
            visit.students.full_name,
            visit.students.classes.grade_level,
            visit.students.classes.section_name
        );
        
        return true;
    } catch (err) {
        console.error('Error in approveClinicPass:', err);
        throw err;
    }
}

/**
 * Reject a pending clinic pass
 * @param {number} visitId - The visit ID to reject
 * @param {string} reason - Reason for rejection (optional)
 */
async function rejectClinicPass(visitId, reason = '') {
    try {
        const { error } = await supabase
            .from('clinic_visits')
            .update({ 
                status: 'Rejected',
                nurse_notes: reason
            })
            .eq('id', visitId);
        
        if (error) {
            console.error('Error rejecting clinic pass:', error);
            throw error;
        }
        
        return true;
    } catch (err) {
        console.error('Error in rejectClinicPass:', err);
        throw err;
    }
}

/**
 * Admit a referred student into the clinic.
 * Updates status to 'In Clinic' to remove them from the 'Pending' queue.
 * @param {number} visitId - The visit ID to admit
 */
async function admitReferredStudent(visitId) {
    try {
        // Get visit details for notification
        const { data: visit, error: fetchError } = await supabase
            .from('clinic_visits')
            .select(`*, students(full_name, classes(grade_level, section_name))`)
            .eq('id', visitId)
            .single();
        
        if (fetchError) throw fetchError;
        
        // Update status to In Clinic and set time_in
        const { error } = await supabase
            .from('clinic_visits')
            .update({ 
                status: 'In Clinic',
                time_in: new Date().toISOString()
            })
            .eq('id', visitId);
        
        if (error) throw error;
        
        // Show success toast and refresh
        if (typeof showToast === 'function') {
            showToast('Student admitted successfully', 'success');
        } else {
            alert('Student admitted successfully');
        }
        
        // Refresh dashboard data if function exists
        if (typeof loadDashboardData === 'function') {
            loadDashboardData();
        }
        
        return true;
    } catch (err) {
        console.error('Error admitting student:', err);
        throw err;
    }
}

/**
 * Processes a scanned student ID at the clinic.
 * 1. Checks for a 'Pending' referral from a teacher.
 * 2. If found, admits the student.
 * 3. If not found, creates a new 'Walk-in' visit.
 * @param {string} studentIdText - The scanned student ID
 */
async function processClinicCheckIn(studentIdText) {
    try {
        // Find the student's internal ID
        const { data: student, error: sError } = await supabase
            .from('students')
            .select('id, full_name')
            .eq('student_id_text', studentIdText)
            .single();
        
        if (sError || !student) {
            throw new Error("Student not found.");
        }
        
        // Check for existing 'Pending' referral
        const { data: existingVisit, error: vError } = await supabase
            .from('clinic_visits')
            .select('id')
            .eq('student_id', student.id)
            .eq('status', 'Pending')
            .maybeSingle();
        
        if (vError) throw vError;
        
        if (existingVisit) {
            // ADMIT: Update existing referral status
            await supabase
                .from('clinic_visits')
                .update({ 
                    status: 'In Clinic', 
                    time_in: new Date().toISOString() 
                })
                .eq('id', existingVisit.id);
            
            return { type: 'Admitted', name: student.full_name };
        } else {
            // WALK-IN: Create new record
            await supabase
                .from('clinic_visits')
                .insert({
                    student_id: student.id,
                    status: 'In Clinic',
                    reason: 'Walk-in (No referral)',
                    time_in: new Date().toISOString()
                });
            
            return { type: 'Walk-in Created', name: student.full_name };
        }
    } catch (err) {
        console.error("Check-in error:", err);
        throw err;
    }
}

/**
 * Saves medical findings and updates the patient status.
 * @param {number} visitId - The ID of the clinic visit record.
 * @param {object} findings - Object containing nurseNotes, actionTaken, parentNotified.
 */
async function saveMedicalFindings(visitId, findings) {
    try {
        const { error } = await supabase
            .from('clinic_visits')
            .update({
                nurse_notes: findings.nurseNotes,
                action_taken: findings.actionTaken,
                parent_notified: findings.parentNotified || false
                // status remains 'In Clinic' until discharged
            })
            .eq('id', visitId);

        if (error) throw error;
        
        if (typeof showToast === 'function') {
            showToast('Findings saved successfully', 'success');
        } else {
            alert('Findings saved successfully');
        }
    } catch (err) {
        console.error("Error saving findings:", err);
        if (typeof showToast === 'function') {
            showToast('Failed to save findings', 'error');
        } else {
            alert('Failed to save findings');
        }
        throw err;
    }
}

/**
 * Finalizes the visit and discharges the student.
 * @param {number} visitId - The visit record ID.
 * @param {string} outcome - 'Returned to Class' or 'Sent Home'.
 * @param {string} nurseNotes - Optional nurse notes.
 * @param {boolean} parentNotified - Whether parent was notified.
 */
async function dischargeStudent(visitId, outcome, nurseNotes = '', parentNotified = false) {
    const timestamp = new Date().toISOString();
    
    try {
        const { data: visit, error: fetchError } = await supabase
            .from('clinic_visits')
            .select('student_id, referred_by_teacher_id, students(full_name, parent_id)')
            .eq('id', visitId)
            .single();

        if (fetchError) throw fetchError;

        // 1. Update the clinic record
        const { error: updateError } = await supabase
            .from('clinic_visits')
            .update({
                status: 'Completed',
                time_out: timestamp,
                action_taken: outcome,
                nurse_notes: nurseNotes,
                parent_notified: parentNotified
            })
            .eq('id', visitId);

        if (updateError) throw updateError;

        // 2. Notify Teacher and Parent
        const msg = `Student ${visit.students.full_name} has been discharged from clinic: ${outcome}.`;
        
        const notifications = [
            { 
                recipient_id: visit.referred_by_teacher_id, 
                recipient_role: 'teacher', 
                title: 'Clinic Discharge', 
                message: msg, 
                type: 'clinic_discharge' 
            }
        ];

        // Add parent notification if requested
        if (parentNotified && visit.students.parent_id) {
            notifications.push({
                recipient_id: visit.students.parent_id,
                recipient_role: 'parent',
                title: 'Clinic Update',
                message: msg,
                type: 'clinic_discharge'
            });
        }

        await supabase.from('notifications').insert(notifications);

        if (typeof showToast === 'function') {
            showToast(`Discharged: ${outcome}`, 'success');
        } else {
            alert(`Discharged: ${outcome}`);
        }
        
        return true;
    } catch (err) {
        console.error("Discharge error:", err);
        if (typeof showToast === 'function') {
            showToast('Failed to discharge student', 'error');
        }
        throw err;
    }
}

/**
 * Check in a student at the clinic (via QR scan or visit ID)
 * Updates time_in and status to 'Checked In'
 * @param {number} visitId - The visit ID to check in
 */
async function clinicCheckIn(visitId) {
    try {
        // Get visit details for parent notification
        const { data: visit } = await supabase
            .from('clinic_visits')
            .select(`
                *,
                students (full_name, parent_id, classes (grade_level, section_name))
            `)
            .eq('id', visitId)
            .single();
        
        if (!visit) {
            throw new Error('Visit not found');
        }
        
        const { error } = await supabase
            .from('clinic_visits')
            .update({
                time_in: new Date().toISOString(),
                status: 'Checked In'
            })
            .eq('id', visitId);
        
        if (error) {
            console.error('Error checking in student:', error);
            throw error;
        }
        
        // Notify parent that child is at clinic
        if (visit.students.parent_id) {
            await notifyParentChildInClinic(
                visit.students.parent_id,
                visit.students.full_name
            );
        }
        
        return true;
    } catch (err) {
        console.error('Error in clinicCheckIn:', err);
        throw err;
    }
}

/**
 * Add findings and set action for a checked-in student
 * @param {number} visitId - The visit ID
 * @param {string} notes - Nurse notes/findings
 * @param {string} action - Action taken: 'Sent Home' or 'Rest at Clinic'
 */
async function addClinicFindings(visitId, notes, action) {
    try {
        // Get visit details for teacher notification
        const { data: visit } = await supabase
            .from('clinic_visits')
            .select(`
                *,
                students (full_name, classes (grade_level, section_name))
            `)
            .eq('id', visitId)
            .single();
        
        if (!visit) {
            throw new Error('Visit not found');
        }
        
        const { error } = await supabase
            .from('clinic_visits')
            .update({
                nurse_notes: notes,
                action_taken: action,
                status: action === 'Sent Home' ? 'Sent Home' : 'Checked In'
            })
            .eq('id', visitId);
        
        if (error) {
            console.error('Error adding clinic findings:', error);
            throw error;
        }
        
        // If sent home, notify teacher of action taken
        if (action === 'Sent Home') {
            await notifyTeacherActionTaken(
                visit.referred_by_teacher_id,
                visit.students.full_name,
                'Sent Home'
            );
        }
        
        return true;
    } catch (err) {
        console.error('Error in addClinicFindings:', err);
        throw err;
    }
}

/**
 * Check out a student from the clinic
 * @param {number} visitId - The visit ID
 * @param {string} disposition - 'Returned to Class' or 'Sent Home'
 */
async function clinicCheckOut(visitId, disposition) {
    try {
        // Get visit details for notifications
        const { data: visit } = await supabase
            .from('clinic_visits')
            .select(`
                *,
                students (full_name, classes (grade_level, section_name))
            `)
            .eq('id', visitId)
            .single();
        
        if (!visit) {
            throw new Error('Visit not found');
        }
        
        const finalStatus = disposition === 'Sent Home' ? 'Sent Home' : 'Cleared';
        
        const { error } = await supabase
            .from('clinic_visits')
            .update({
                time_out: new Date().toISOString(),
                status: finalStatus
            })
            .eq('id', visitId);
        
        if (error) {
            console.error('Error checking out student:', error);
            throw error;
        }
        
        // Notify teacher of check-out/disposition
        await notifyTeacherActionTaken(
            visit.referred_by_teacher_id,
            visit.students.full_name,
            disposition === 'Sent Home' ? 'Sent Home' : 'Returned to Class'
        );
        
        return true;
    } catch (err) {
        console.error('Error in clinicCheckOut:', err);
        throw err;
    }
}

/**
 * Fetch all active clinic visits (students currently in clinic)
 * Returns students where time_out is NULL and status is 'Checked In'
 */
async function fetchActiveVisits() {
    try {
        const { data, error } = await supabase
            .from('clinic_visits')
            .select(`
                *,
                students (
                    id,
                    full_name,
                    student_id_text,
                    lrn,
                    profile_photo_url,
                    classes (grade_level, section_name)
                ),
                teachers (full_name)
            `)
            .eq('status', 'Checked In')
            .is('time_out', null)
            .order('time_in', { ascending: false });
        
        if (error) {
            console.error('Error fetching active visits:', error);
            return [];
        }
        
        return data || [];
    } catch (err) {
        console.error('Error in fetchActiveVisits:', err);
        return [];
    }
}

/**
 * Fetch visit history for a specific student
 * @param {number} studentId - The student ID
 */
async function fetchStudentVisitHistory(studentId) {
    try {
        const { data, error } = await supabase
            .from('clinic_visits')
            .select(`
                *,
                students (
                    full_name,
                    student_id_text,
                    classes (grade_level, section_name)
                ),
                teachers (full_name)
            `)
            .eq('student_id', studentId)
            .order('time_in', { ascending: false });
        
        if (error) {
            console.error('Error fetching student visits:', error);
            return [];
        }
        
        return data || [];
    } catch (err) {
        console.error('Error in fetchStudentVisitHistory:', err);
        return [];
    }
}

/**
 * Fetch all visits without any date filter
 */
async function fetchAllVisits() {
    console.log('[DEBUG] fetchAllVisits called');
    try {
        const { data, error } = await supabase
            .from('clinic_visits')
            .select(`
                *,
                students (
                    full_name,
                    student_id_text,
                    classes (grade_level, section_name)
                ),
                teachers (full_name)
            `)
            .order('time_in', { ascending: false });
        
        console.log('[DEBUG] fetchAllVisits returned:', data?.length || 0, 'records', error);
        
        if (error) {
            console.error('Error fetching all visits:', error);
            return [];
        }
        
        return data || [];
    } catch (err) {
        console.error('Error in fetchAllVisits:', err);
        return [];
    }
}

/**
 * Fetch all visits for a date range
 * @param {string} startDate - Start date YYYY-MM-DD
 * @param {string} endDate - End date YYYY-MM-DD
 */
async function fetchVisitsByDateRange(startDate, endDate) {
    try {
        // Fetch all visits and filter locally (to avoid timezone issues)
        const { data: allData, error: allError } = await supabase
            .from('clinic_visits')
            .select(`
                *,
                students (
                    full_name,
                    student_id_text,
                    classes (grade_level, section_name)
                ),
                teachers (full_name)
            `)
            .order('time_in', { ascending: false });
        
        if (allError) {
            console.error('Error fetching all visits:', allError);
            return [];
        }
        
        // Filter by date locally
        const startDateTime = new Date(startDate);
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        
        const filtered = (allData || []).filter(visit => {
            const visitDate = new Date(visit.time_in);
            return visitDate >= startDateTime && visitDate <= endDateTime;
        });
        
        return filtered;
        
    } catch (err) {
        console.error('Error in fetchVisitsByDateRange:', err);
        return [];
    }
}

/**
 * Check in a new patient
 * @param {object} visitData - Visit information
 */
async function checkInPatient(visitData) {
    try {
        const { data, error } = await supabase
            .from('clinic_visits')
            .insert([{
                student_id: visitData.studentId,
                referred_by_teacher_id: visitData.teacherId,
                reason: visitData.reason,
                status: 'Checked In',
                time_in: new Date().toISOString()
            }])
            .select()
            .single();
        
        if (error) {
            console.error('Error checking in patient:', error);
            throw error;
        }
        
        return data;
    } catch (err) {
        console.error('Error in checkInPatient:', err);
        throw err;
    }
}

/**
 * Discharge a patient from clinic
 * @param {number} visitId - The visit ID to discharge
 * @param {object} dischargeData - Discharge information (notes, action taken, parent notified)
 */
async function dischargePatient(visitId, dischargeData) {
    try {
        const currentTime = new Date().toISOString();

        // 1. Get the visit details
        const { data: visitData } = await supabase
            .from('clinic_visits')
            .select('student_id, students(parent_id, full_name)')
            .eq('id', visitId)
            .single();

        // 2. Update the Clinic Visit record
        const { error } = await supabase
            .from('clinic_visits')
            .update({
                time_out: currentTime,
                nurse_notes: dischargeData.nurseNotes,
                action_taken: dischargeData.actionTaken,
                parent_notified: dischargeData.parentNotified,
                status: 'Completed'
            })
            .eq('id', visitId);
        
        if (error) {
            console.error('Error discharging patient:', error);
            throw error;
        }

        // 3. The Parent Handshake: Send notification
        if (dischargeData.parentNotified && visitData?.students?.parent_id) {
            await supabase.from('notifications').insert({
                recipient_id: visitData.students.parent_id,
                recipient_role: 'parent',
                title: 'Clinic Discharge Report',
                message: `${visitData.students.full_name} has been discharged from the clinic. Action: ${dischargeData.actionTaken}`,
                type: 'clinic',
                is_read: false
            });
        }

        // Notify referring teacher if parent was notified
        if (dischargeData.teacherId && dischargeData.parentNotified) {
            await notifyTeacherClearance(dischargeData.teacherId, dischargeData.studentName);
        }
        
        return true;
    } catch (err) {
        console.error('Error in dischargePatient:', err);
        throw err;
    }
}

/**
 * Update nurse notes and findings for a visit
 * @param {number} visitId - The visit ID
 * @param {object} notesData - Notes and findings data
 */
async function updateVisitNotes(visitId, notesData) {
    try {
        const { error } = await supabase
            .from('clinic_visits')
            .update({
                nurse_notes: notesData.nurseNotes,
                action_taken: notesData.actionTaken,
                parent_notified: notesData.parentNotified
            })
            .eq('id', visitId);
        
        if (error) {
            console.error('Error updating visit notes:', error);
            throw error;
        }
        
        return true;
    } catch (err) {
        console.error('Error in updateVisitNotes:', err);
        throw err;
    }
}

// ============================================================================
// STUDENT LOOKUP
// ============================================================================

/**
 * Search students by name or ID
 * @param {string} query - Search query
 */
async function searchStudents(query) {
    try {
        const { data, error } = await supabase
            .from('students')
            .select(`
                id,
                full_name,
                student_id_text,
                lrn,
                profile_photo_url,
                classes (grade_level, section_name),
                parents (id, full_name, contact_number)
            `)
            .or(`full_name.ilike.%${query}%,student_id_text.ilike.%${query}%,lrn.ilike.%${query}%`)
            .eq('status', 'Enrolled')
            .limit(10);
        
        if (error) {
            console.error('Error searching students:', error);
            return [];
        }
        
        return data || [];
    } catch (err) {
        console.error('Error in searchStudents:', err);
        return [];
    }
}

/**
 * Get student by ID
 * @param {number} studentId - The student ID
 */
async function getStudentById(studentId) {
    try {
        const { data, error } = await supabase
            .from('students')
            .select(`
                *,
                classes (grade_level, section_name),
                parents (id, full_name, contact_number, relationship_type)
            `)
            .eq('id', studentId)
            .single();
        
        if (error) {
            console.error('Error fetching student:', error);
            return null;
        }
        
        return data;
    } catch (err) {
        console.error('Error in getStudentById:', err);
        return null;
    }
}

/**
 * Check if student is currently in clinic
 * @param {number} studentId - The student ID
 */
async function isStudentInClinic(studentId) {
    try {
        const { data, error } = await supabase
            .from('clinic_visits')
            .select('id')
            .eq('student_id', studentId)
            .is('time_out', null)
            .limit(1);
        
        if (error) {
            console.error('Error checking clinic status:', error);
            return false;
        }
        
        return data && data.length > 0;
    } catch (err) {
        console.error('Error in isStudentInClinic:', err);
        return false;
    }
}

// ============================================================================
// NOTIFICATIONS - ENHANCED WORKFLOW
// ============================================================================

/**
 * Notify homeroom teacher that student is at clinic (pass approved)
 * @param {number} teacherId - Teacher ID
 * @param {string} studentName - Student's full name
 * @param {string} gradeLevel - Grade level
 * @param {string} section - Section name
 */
async function notifyTeacherStudentAtClinic(teacherId, studentName, gradeLevel, section) {
    try {
        const { error } = await supabase
            .from('notifications')
            .insert([{
                recipient_id: teacherId,
                recipient_role: 'teacher',
                title: 'Student at Clinic',
                message: `${studentName} from ${gradeLevel} - ${section} is at the clinic.`,
                type: 'clinic_alert'
            }]);
        
        if (error) {
            console.error('Error notifying teacher:', error);
        }
    } catch (err) {
        console.error('Error in notifyTeacherStudentAtClinic:', err);
    }
}

/**
 * Notify parent that their child is in clinic
 * @param {number} parentId - Parent ID
 * @param {string} studentName - Student's full name
 */
async function notifyParentChildInClinic(parentId, studentName) {
    try {
        const { error } = await supabase
            .from('notifications')
            .insert([{
                recipient_id: parentId,
                recipient_role: 'parent',
                title: 'Child in Clinic',
                message: `Your child ${studentName} is currently at the school clinic.`,
                type: 'clinic_alert'
            }]);
        
        if (error) {
            console.error('Error notifying parent:', error);
        }
    } catch (err) {
        console.error('Error in notifyParentChildInClinic:', err);
    }
}

/**
 * Notify teacher of action taken on student (sent home or returned to class)
 * @param {number} teacherId - Teacher ID
 * @param {string} studentName - Student's full name
 * @param {string} action - Action taken: 'Sent Home' or 'Returned to Class'
 */
async function notifyTeacherActionTaken(teacherId, studentName, action) {
    try {
        const { error } = await supabase
            .from('notifications')
            .insert([{
                recipient_id: teacherId,
                recipient_role: 'teacher',
                title: 'Clinic Action Taken',
                message: `${studentName} has been ${action}.`,
                type: 'clinic_clearance'
            }]);
        
        if (error) {
            console.error('Error notifying teacher:', error);
        }
    } catch (err) {
        console.error('Error in notifyTeacherActionTaken:', err);
    }
}

/**
 * Notify parent of check-out/disposition
 * @param {number} parentId - Parent ID
 * @param {string} studentName - Student's full name
 * @param {string} disposition - Check-out disposition
 */
async function notifyParentCheckOut(parentId, studentName, disposition) {
    try {
        const { error } = await supabase
            .from('notifications')
            .insert([{
                recipient_id: parentId,
                recipient_role: 'parent',
                title: 'Clinic Update',
                message: `Your child ${studentName} has ${disposition === 'Sent Home' ? 'been sent home' : 'returned to class'} from the clinic.`,
                type: 'clinic_clearance'
            }]);
        
        if (error) {
            console.error('Error notifying parent:', error);
        }
    } catch (err) {
        console.error('Error in notifyParentCheckOut:', err);
    }
}

/**
 * Notify teacher when student is cleared from clinic
 * @param {number} teacherId - Teacher ID
 * @param {string} studentName - Student's full name
 */
async function notifyTeacherClearance(teacherId, studentName) {
    try {
        const { error } = await supabase
            .from('notifications')
            .insert([{
                recipient_id: teacherId,
                recipient_role: 'teacher',
                title: 'Student Checked Out',
                message: `${studentName} has been checked out from clinic.`,
                type: 'clinic_clearance'
            }]);
        
        if (error) {
            console.error('Error notifying teacher:', error);
        }
    } catch (err) {
        console.error('Error in notifyTeacherClearance:', err);
    }
}

/**
 * Fetch notifications for clinic staff
 */
async function fetchClinicNotifications() {
    try {
        // Notifications targeting clinic staff specifically or general announcements
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .or('recipient_role.eq.clinic,recipient_role.is.null')
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (error) {
            console.error('Error fetching notifications:', error);
            return [];
        }
        
        return data || [];
    } catch (err) {
        console.error('Error in fetchClinicNotifications:', err);
        return [];
    }
}

/**
 * Mark notification as read
 * @param {number} notificationId - Notification ID
 */
async function markNotificationRead(notificationId) {
    try {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId);
        
        if (error) {
            console.error('Error marking notification read:', error);
        }
    } catch (err) {
        console.error('Error in markNotificationRead:', err);
    }
}

/**
 * Get unread notification count
 */
async function getUnreadNotificationCount() {
    try {
        const { data, error } = await supabase
            .from('notifications')
            .select('id', { count: 'exact' })
            .or('recipient_role.eq.clinic,recipient_role.is.null')
            .eq('is_read', false);
        
        if (error) {
            console.error('Error counting notifications:', error);
            return 0;
        }
        
        return data.length;
    } catch (err) {
        console.error('Error in getUnreadNotificationCount:', err);
        return 0;
    }
}

// ============================================================================
// ANNOUNCEMENTS
// ============================================================================

/**
 * Fetch announcements targeting clinic staff
 */
async function fetchClinicAnnouncements() {
    try {
        const { data, error } = await supabase
            .from('announcements')
            .select('*')
            .eq('target_clinic', true)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Error fetching announcements:', error);
            return [];
        }
        
        return data || [];
    } catch (err) {
        console.error('Error in fetchClinicAnnouncements:', err);
        return [];
    }
}

// ============================================================================
// ANALYTICS & REPORTING
// ============================================================================

/**
 * Fetch daily clinic statistics
 * @param {string} date - Date in YYYY-MM-DD format
 */
async function fetchDailyClinicStats(date) {
    try {
        // Total check-ins for the day
        const { data: checkIns, error: checkInsError } = await supabase
            .from('clinic_visits')
            .select('id', { count: 'exact' })
            .gte('time_in', `${date}T00:00:00`)
            .lt('time_in', `${date}T23:59:59`);
        
        // Still in clinic (active visits)
        const { data: active, error: activeError } = await supabase
            .from('clinic_visits')
            .select('id', { count: 'exact' })
            .is('time_out', null);
        
        // Discharged today
        const { data: discharged, error: dischargedError } = await supabase
            .from('clinic_visits')
            .select('id', { count: 'exact' })
            .gte('time_out', `${date}T00:00:00`)
            .lt('time_out', `${date}T23:59:59`);
        
        if (checkInsError || activeError || dischargedError) {
            console.error('Error fetching clinic stats:', error);
            return { totalCheckIns: 0, stillInClinic: 0, dischargedToday: 0 };
        }
        
        return {
            totalCheckIns: checkIns.length,
            stillInClinic: active.length,
            dischargedToday: discharged.length
        };
    } catch (err) {
        console.error('Error in fetchDailyClinicStats:', err);
        return { totalCheckIns: 0, stillInClinic: 0, dischargedToday: 0 };
    }
}

/**
 * Fetch most common reasons for visits
 * @param {string} date - Date in YYYY-MM-DD format (optional, null for all time)
 */
async function fetchVisitReasons(date = null) {
    try {
        let query = supabase
            .from('clinic_visits')
            .select('reason')
            .not('reason', 'is', null);
        
        if (date) {
            query = query
                .gte('time_in', `${date}T00:00:00`)
                .lt('time_in', `${date}T23:59:59`);
        }
        
        const { data, error } = await query;
        
        if (error) {
            console.error('Error fetching visit reasons:', error);
            return {};
        }
        
        // Count occurrences of each reason
        const reasonCounts = {};
        data.forEach(visit => {
            if (visit.reason) {
                const reason = visit.reason.trim();
                reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
            }
        });
        
        // Sort by count and return top reasons
        return Object.entries(reasonCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
    } catch (err) {
        console.error('Error in fetchVisitReasons:', err);
        return {};
    }
}

// ============================================================================
// TEACHERS
// ============================================================================

/**
 * Fetch all active teachers
 */
async function fetchTeachers() {
    try {
        const { data, error } = await supabase
            .from('teachers')
            .select('id, full_name, department')
            .eq('is_active', true)
            .order('full_name');
        
        if (error) {
            console.error('Error fetching teachers:', error);
            return [];
        }
        
        return data || [];
    } catch (err) {
        console.error('Error in fetchTeachers:', err);
        return [];
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get initials from full name
 * @param {string} fullName - Full name
 * @returns {string} - Initials (max 2 characters)
 */
function getInitials(fullName) {
    if (!fullName) return '?';
    const parts = fullName.trim().split(' ');
    if (parts.length === 1) {
        return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Format date for display
 * @param {string} dateString - ISO date string
 * @returns {string} - Formatted date
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * Format time for display
 * @param {string} dateString - ISO date string
 * @returns {string} - Formatted time
 */
function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Calculate duration between time_in and time_out
 * @param {string} timeIn - ISO time in
 * @param {string} timeOut - ISO time out (or null for active)
 * @returns {string} - Formatted duration
 */
function calculateDuration(timeIn, timeOut) {
    const start = new Date(timeIn);
    const end = timeOut ? new Date(timeOut) : new Date();
    const diffMs = end - start;
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    
    if (hours > 0) {
        return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
}

/**
 * Show notification toast
 * @param {string} message - Message to display
 * @param {string} type - 'success', 'error', 'warning', 'info'
 */
function showToast(message, type = 'info') {
    // THE FIX: Nuke the old toast before making a new one
    const existingToast = document.getElementById('clinic-global-toast');
    if (existingToast) existingToast.remove();

    // Create toast element
    const toast = document.createElement('div');
    toast.id = 'clinic-global-toast'; // Give it a unique ID
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in ${
        type === 'success' ? 'bg-green-500' :
        type === 'error' ? 'bg-red-500' :
        type === 'warning' ? 'bg-yellow-500' :
        'bg-blue-500'
    } text-white`;
    toast.innerText = message;
    
    document.body.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
        if (document.body.contains(toast)) toast.remove();
    }, 3000);
}

/**
 * Export data to CSV
 * @param {array} data - Array of objects
 * @param {string} filename - Download filename
 */
function exportToCSV(data, filename) {
    if (!data || data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
}

// ============================================================================
// WINDOW EXPORTS - Make functions globally accessible
// ============================================================================
window.fetchVisitsByDateRange = fetchVisitsByDateRange;
window.formatDate = formatDate;
window.formatTime = formatTime;
window.calculateDuration = calculateDuration;
window.showToast = showToast;
window.exportToCSV = exportToCSV;
