// teacher-excuse-letter-approval.js
// Excuse Letter Approval with Image Proof Viewer

document.addEventListener('DOMContentLoaded', async () => {
    await loadExcuseLetters();
});

/**
 * Load Excuse Letters for Teacher's Homeroom
 */
async function loadExcuseLetters() {
    const letterList = document.getElementById('excuse-letter-list');
    if (!letterList) return;
    
    try {
        // Get teacher's homeroom class
        const { data: teacherClass } = await supabase
            .from('classes')
            .select('id, grade_level, section_name')
            .eq('adviser_id', currentUser.id)
            .single();
        
        if (!teacherClass) {
            letterList.innerHTML = `
                <div class="p-8 text-center">
                    <div class="text-4xl mb-2">📋</div>
                    <p class="text-gray-500">You are not assigned as an adviser</p>
                    <p class="text-sm text-gray-400">Excuse letters can only be approved by homeroom advisers</p>
                </div>
            `;
            return;
        }
        
        // Get student IDs in this class
        const { data: students } = await supabase
            .from('students')
            .select('id')
            .eq('class_id', teacherClass.id);
        
        const studentIds = students?.map(s => s.id) || [];
        
        if (studentIds.length === 0) {
            letterList.innerHTML = `
                <div class="p-8 text-center">
                    <div class="text-4xl mb-2">👥</div>
                    <p class="text-gray-500">No students in your class</p>
                </div>
            `;
            return;
        }
        
        // Fetch excuse letters for homeroom students
        const { data: letters, error } = await supabase
            .from('excuse_letters')
            .select(`
                *,
                students (student_id_text, full_name)
            `)
            .in('student_id', studentIds)
            .order('created_at', { ascending: false })
            .limit(50); // THE PARANOIA SHIELD: Prevent loading hundreds of old letters
        
        if (error) {
            console.error('Error loading excuse letters:', error);
            return;
        }
        
        renderLetters(letters, teacherClass);
        
    } catch (err) {
        console.error('Error in loadExcuseLetters:', err);
    }
}

/**
 * Render Excuse Letters List
 */
function renderLetters(letters, teacherClass) {
    const letterList = document.getElementById('excuse-letter-list');
    if (!letterList) return;
    
    letterList.innerHTML = '';
    
    if (!letters || letters.length === 0) {
        letterList.innerHTML = `
            <div class="p-8 text-center">
                <div class="text-4xl mb-2">📭</div>
                <p class="text-gray-500">No excuse letters pending</p>
            </div>
        `;
        return;
    }
    
    // Group by status
    const pendingLetters = letters.filter(l => l.status === 'Pending');
    const processedLetters = letters.filter(l => l.status !== 'Pending');
    
    // Render header with counts
    const headerDiv = document.createElement('div');
    headerDiv.className = 'mb-6 p-4 bg-gray-50 rounded-lg';
    headerDiv.innerHTML = `
        <h3 class="font-bold text-gray-800">${teacherClass.grade_level} - ${teacherClass.section_name}</h3>
        <div class="flex gap-4 mt-2 text-sm">
            <span class="text-yellow-600">📝 ${pendingLetters.length} Pending</span>
            <span class="text-green-600">✓ ${processedLetters.length} Processed</span>
        </div>
    `;
    letterList.appendChild(headerDiv);
    
    // Render letters
    letters.forEach(letter => {
        const statusColors = {
            'Pending': 'border-l-yellow-400 bg-yellow-50',
            'Approved': 'border-l-green-400 bg-green-50',
            'Rejected': 'border-l-red-400 bg-red-50'
        };
        
        const statusBadge = letter.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                           letter.status === 'Approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
        
        const dateFormatted = new Date(letter.date_absent).toLocaleDateString('en-PH', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        
        const div = document.createElement('div');
        div.className = `bg-white p-4 border rounded-lg mb-4 border-l-4 ${statusColors[letter.status] || 'border-l-gray-400'} shadow-sm hover:shadow-md transition`;
        div.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-lg text-gray-800">${letter.students?.full_name}</span>
                        <span class="text-sm text-gray-500">${letter.students?.student_id_text}</span>
                    </div>
                    <span class="px-2 py-1 rounded text-xs ${statusBadge}">${letter.status}</span>
                </div>
                <div class="text-right text-sm text-gray-500">
                    <p>Date: ${dateFormatted}</p>
                    <p class="text-xs">${new Date(letter.created_at).toLocaleDateString()}</p>
                </div>
            </div>
            
            <div class="mb-3">
                <p class="text-sm"><strong class="text-gray-700">Reason:</strong> ${letter.reason}</p>
                ${letter.teacher_remarks ? `<p class="text-sm mt-1"><strong class="text-gray-700">Your Remarks:</strong> ${letter.teacher_remarks}</p>` : ''}
            </div>
            
            ${letter.image_proof_url ? `
                <div class="mb-3">
                    <button onclick="viewProof('${letter.image_proof_url}')" 
                        class="flex items-center gap-2 text-blue-600 hover:text-blue-800 transition">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        View Proof Image
                    </button>
                </div>
            ` : '<p class="text-sm text-gray-400 italic mb-3">No proof image attached</p>'}
            
            ${letter.status === 'Pending' ? `
                <div class="flex gap-2 mt-4 pt-3 border-t">
                    <button onclick="approveExcuseLetter('${letter.id}', '${letter.student_id}', '${letter.date_absent}')" 
                        class="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium transition">
                        ✓ Approve
                    </button>
                    <button onclick="rejectExcuseLetter('${letter.id}')" 
                        class="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-medium transition">
                        ✕ Reject
                    </button>
                </div>
            ` : `
                <div class="mt-3 pt-3 border-t">
                    <p class="text-sm text-green-600 font-medium">✓ ${letter.status === 'Approved' ? 'Approved' : 'Rejected'} on ${new Date(letter.updated_at || letter.created_at).toLocaleDateString()}</p>
                </div>
            `}
        `;
        letterList.appendChild(div);
    });
}

/**
 * View Proof Image Modal
 */
function viewProof(imageUrl) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('proof-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'proof-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-75 z-50 hidden flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div class="flex justify-between items-center p-4 border-b">
                    <h3 class="font-bold text-lg">Excuse Letter Proof</h3>
                    <button onclick="closeProofModal()" class="text-gray-500 hover:text-gray-700">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div class="flex-1 p-4 overflow-auto flex items-center justify-center bg-gray-100">
                    <img id="proof-image" src="" alt="Excuse Letter Proof" class="max-w-full max-h-[60vh] object-contain rounded shadow-lg">
                </div>
                <div class="p-4 border-t flex justify-end">
                    <button onclick="closeProofModal()" class="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Show modal and set image
    modal.classList.remove('hidden');
    document.getElementById('proof-image').src = imageUrl;
    
    // Close on background click
    modal.onclick = function(e) {
        if (e.target === modal) closeProofModal();
    };
}

/**
 * Close Proof Modal
 */
function closeProofModal() {
    const modal = document.getElementById('proof-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Approve Excuse Letter and Update Attendance
 */
async function approveExcuseLetter(letterId, studentId, dateAbsent) {
    if (!confirm('Approve this excuse letter? This will mark the student as "Excused" for the absence.')) {
        return;
    }
    
    try {
        // Update letter status
        const { error: letterError } = await supabase
            .from('excuse_letters')
            .update({ 
                status: 'Approved',
                approved_by: currentUser.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', letterId);
        
        if (letterError) throw letterError;
        
        // Update attendance log to Excused
        const { error: attendanceError } = await supabase
            .from('attendance_logs')
            .upsert({
                student_id: studentId,
                log_date: dateAbsent,
                status: 'Excused',
                remarks: 'Excused via approved excuse letter'
            }, {
                onConflict: 'student_id, log_date'
            });
        
        if (attendanceError) throw attendanceError;
        
        alert('Excuse letter approved. Attendance marked as Excused.');
        closeProofModal(); // THE PARANOIA SHIELD: Close modal before refresh
        await loadExcuseLetters();
        
    } catch (err) {
        console.error('Error approving excuse letter:', err);
        alert('Error approving excuse letter. Please try again.');
    }
}

/**
 * Reject Excuse Letter
 */
async function rejectExcuseLetter(letterId) {
    const reason = prompt('Reason for rejection:');
    if (reason === null || reason.trim() === '') {
        alert('Rejection reason is required.');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('excuse_letters')
            .update({ 
                status: 'Rejected',
                teacher_remarks: reason.trim(),
                updated_at: new Date().toISOString()
            })
            .eq('id', letterId);
        
        if (error) throw error;
        
        alert('Excuse letter rejected.');
        closeProofModal(); // THE PARANOIA SHIELD: Close modal before refresh
        await loadExcuseLetters();
        
    } catch (err) {
        console.error('Error rejecting excuse letter:', err);
        alert('Error rejecting excuse letter. Please try again.');
    }
}

// Close modal on Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeProofModal();
    }
});
