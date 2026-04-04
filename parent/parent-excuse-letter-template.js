// parent/parent-excuse-letter-template.js
// Excuse letter submission and tracking logic
// UPDATED: Phase 3 - Enhanced edit with file upload, realtime status


let selectedChildId = null;
let uploadedFile = null;
let editUploadedFile = null;  // Phase 3: Track file in edit modal
let excuseHistory = [];
let excuseChannel = null;  // Phase 3: Realtime subscription

/**
 * Initialize excuse letter page
 * UPDATED: Phase 3 - Added realtime subscription for status changes
 */
document.addEventListener('DOMContentLoaded', async () => {
    // FIX: Inline timezone math to prevent ReferenceError crash
    const localDate = new Date();
    localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
    const today = localDate.toISOString().split('T')[0];
    
    document.getElementById('absence-date').max = today;

    // Populate child selector - FIX: Wait for children to load first
    // This fixes race condition where populateChildSelector runs before loadChildren completes
    setTimeout(() => {
        if (typeof allChildren !== 'undefined' && allChildren.length > 0) {
            populateChildSelector();
        } else {
            // Poll until children are loaded (max 5 seconds)
            let attempts = 0;
            const checkInterval = setInterval(() => {
                attempts++;
                if (typeof allChildren !== 'undefined' && allChildren.length > 0) {
                    clearInterval(checkInterval);
                    populateChildSelector();
                } else if (attempts >= 50) {
                    clearInterval(checkInterval);
                    console.warn('Children loading timeout - populating with available data');
                    populateChildSelector();
                }
            }, 100);
        }
    }, 100);

    // Load excuse history
    await loadExcuseHistory();
    
    // Phase 3: Setup realtime subscription for status changes
    setupExcuseRealtime();
});

/**
 * Setup realtime subscription for excuse letter status changes
 * Phase 3: Notify parent when teacher approves/rejects
 */
function setupExcuseRealtime() {
    if (excuseChannel) {
        supabase.removeChannel(excuseChannel);
    }

    excuseChannel = supabase
        .channel('excuse-updates')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'excuse_letters',
            filter: `parent_id=eq.${currentUser.id}`
        }, async (payload) => {
            if (DEBUG) console.log('Excuse letter status changed:', payload);
            const updatedLetter = payload.new;
            
            // Find the letter in history and update it
            const index = excuseHistory.findIndex(l => l.id === updatedLetter.id);
            if (index !== -1) {
                excuseHistory[index] = { ...excuseHistory[index], ...updatedLetter };
            }
            
            // Show notification
            if (updatedLetter.status === 'Approved') {
                showExcuseNotification('Excuse Letter Approved', `Your excuse letter for ${formatDate(updatedLetter.date_absent)} has been approved!`, 'success');
            } else if (updatedLetter.status === 'Rejected') {
                showExcuseNotification('Excuse Letter Rejected', `Your excuse letter for ${formatDate(updatedLetter.date_absent)} was not approved.`, 'error');
            }
            
            // Reload history
            await loadExcuseHistory();
        })
        .subscribe();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (excuseChannel) {
            supabase.removeChannel(excuseChannel);
        }
    });
}

/**
 * Show excuse notification toast
 * Phase 3: Helper for status change notifications
 */
function showExcuseNotification(title, message, type = 'info') {
    const colors = type === 'success' ? 'bg-green-50 border-green-500' : 
                   type === 'error' ? 'bg-red-50 border-red-500' : 
                   'bg-blue-50 border-blue-500';
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : '📢';
    
    const toast = document.createElement('div');
    toast.className = `fixed top-4 left-4 right-4 ${colors} rounded-lg shadow-lg p-4 z-50 border-l-4`;
    toast.innerHTML = `
        <div class="flex items-start gap-3">
            <span class="text-2xl">${icon}</span>
            <div class="flex-1">
                <p class="font-bold text-gray-800">${title}</p>
                <p class="text-sm text-gray-600">${message}</p>
            </div>
            <button onclick="this.parentElement.remove()" class="text-gray-400 hover:text-gray-600">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('opacity-0', 'transition-opacity');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

/**
 * Populate child selector for excuse submission
 */
function populateChildSelector() {
    const selectorEl = document.getElementById('child-selector');
    if (!selectorEl) return;

    if (allChildren.length === 0) {
        selectorEl.innerHTML = '<p class="text-gray-500 text-sm">No children linked to your account</p>';
        return;
    }

    // Default to current child
    selectedChildId = currentChild?.id;

    selectorEl.innerHTML = allChildren.map(child => `
        <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
            selectedChildId === child.id 
                ? 'border-green-500 bg-green-50' 
                : 'border-gray-200 hover:bg-gray-50'
        }">
            <input 
                type="radio" 
                name="child-select" 
                value="${child.id}"
                ${selectedChildId === child.id ? 'checked' : ''}
                onchange="selectChildForExcuse(${child.id})"
                class="text-green-600"
            >
            <div class="flex items-center gap-2 flex-1">
                <div class="h-10 w-10 rounded-full bg-green-600 flex items-center justify-center text-white font-bold">
                    ${getInitials(child.full_name)}
                </div>
                <div>
                    <p class="font-medium text-gray-800">${child.full_name}</p>
                    <p class="text-xs text-gray-500">${child.classes?.grade_level} - ${child.classes?.department}</p>
                </div>
            </div>
        </label>
    `).join('');
}

/**
 * Select child for excuse submission
 */
function selectChildForExcuse(childId) {
    selectedChildId = childId;
    populateChildSelector();
}

/**
 * Handle file selection
 */
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
        showNotification('Please select a valid file (PNG, JPG, or PDF)', 'error');
        event.target.value = '';
        return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
        showNotification('File size must be less than 5MB', 'error');
        event.target.value = '';
        return;
    }

    uploadedFile = file;

    // Update UI
    document.getElementById('file-upload-area').classList.add('hidden');
    document.getElementById('file-preview').classList.remove('hidden');
    document.getElementById('file-name').textContent = file.name;

    // Show image preview if it's an image
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('image-preview').src = e.target.result;
            document.getElementById('image-preview').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    } else {
        document.getElementById('image-preview').classList.add('hidden');
    }
}

/**
 * Remove selected file
 */
function removeFile(event) {
    event.stopPropagation();
    uploadedFile = null;
    document.getElementById('proof-file').value = '';
    document.getElementById('file-upload-area').classList.remove('hidden');
    document.getElementById('file-preview').classList.add('hidden');
}

/**
 * Submit excuse letter
 */
async function submitExcuse(event) {
    event.preventDefault();

    if (!selectedChildId) {
        showNotification('Please select a child', 'error');
        return;
    }

    const date = document.getElementById('absence-date').value;
    const reason = document.getElementById('excuse-reason').value.trim();

    // Validate
    if (!date) {
        showNotification('Please select the date of absence', 'error');
        return;
    }
    if (!reason || reason.length < 10) {
        showNotification('Please provide a reason (minimum 10 characters)', 'error');
        return;
    }

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
        <span class="flex items-center justify-center gap-2">
            <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Submitting...
        </span>
    `;

    try {
        let imageProofUrl = null;

        // Upload file if selected
        if (uploadedFile) {
            const filePath = `${selectedChildId}/${Date.now()}_${uploadedFile.name}`;
            // UPDATED: Add contentType to support PDF and image uploads
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('excuse-proofs')
                .upload(filePath, uploadedFile, {
                    contentType: uploadedFile.type
                });

            if (uploadError) {
                console.error('Upload error:', uploadError);
                alert('Error uploading file. Please try again.');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Excuse Letter';
                return;
            }

            // Get public URL
            const { data: urlData } = supabase.storage
                .from('excuse-proofs')
                .getPublicUrl(filePath);
            
            imageProofUrl = urlData.publicUrl;
        }

        // Insert excuse letter into database
        const { data: letter, error: insertError } = await supabase
            .from('excuse_letters')
            .insert({
                student_id: selectedChildId,
                parent_id: currentUser.id,
                reason: reason,
                date_absent: date,
                image_proof_url: imageProofUrl,
                status: 'Pending'
            })
            .select()
            .single();

        if (insertError) {
            console.error('Insert error:', insertError);
            alert('Error submitting excuse letter. Please try again.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Excuse Letter';
            return;
        }

        // Notify the Teacher (Homeroom Adviser)
        await notifyTeacherOfExcuse(selectedChildId, date);

        // Show success message
        document.getElementById('excuse-form').classList.add('hidden');
        document.getElementById('success-message').classList.remove('hidden');

        // Reload history
        await loadExcuseHistory();

    } catch (err) {
        console.error('Error in submitExcuse:', err);
        alert('An error occurred. Please try again.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Excuse Letter';
    }
}

/**
 * Notify teacher of submitted excuse letter
 */
async function notifyTeacherOfExcuse(studentId, dateAbsent) {
    try {
        // Get student's class adviser
        const { data: studentData, error: studentError } = await supabase
            .from('students')
            .select('full_name, classes(adviser_id)')
            .eq('id', studentId)
            .single();

        if (studentError || !studentData?.classes?.adviser_id) {
            if (DEBUG) console.log('No adviser assigned for this student, cannot send notification.');
            return;
        }

        // Insert notification for teacher
        const { error: notifError } = await supabase.from('notifications').insert({
            recipient_id: studentData.classes.adviser_id,
            recipient_role: 'teacher',
            title: 'New Excuse Letter Submitted',
            message: `An excuse letter for ${studentData.full_name} on ${dateAbsent} is ready for your review.`,
            type: 'excuse_letter'
        });

        if (notifError) throw notifError;

        if (DEBUG) console.log('Teacher notified successfully');

    } catch (err) {
        console.error('Error notifying teacher:', err);
    }
}

/**
 * Reset form after successful submission
 */
function resetForm() {
    document.getElementById('excuse-form').reset();
    document.getElementById('excuse-form').classList.remove('hidden');
    document.getElementById('success-message').classList.add('hidden');
    removeFile(event);
}

/**
 * Switch between tabs
 */
function switchTab(tab) {
    const submitContent = document.getElementById('tab-submit-content');
    const historyContent = document.getElementById('tab-history-content');
    const submitTab = document.getElementById('tab-submit');
    const historyTab = document.getElementById('tab-history');

    if (tab === 'submit') {
        submitContent.classList.remove('hidden');
        historyContent.classList.add('hidden');
        submitTab.className = 'flex-1 py-2 px-4 rounded-lg font-medium bg-green-700 text-white';
        historyTab.className = 'flex-1 py-2 px-4 rounded-lg font-medium bg-white text-gray-600 border';
    } else {
        submitContent.classList.add('hidden');
        historyContent.classList.remove('hidden');
        submitTab.className = 'flex-1 py-2 px-4 rounded-lg font-medium bg-white text-gray-600 border';
        historyTab.className = 'flex-1 py-2 px-4 rounded-lg font-medium bg-green-700 text-white';
    }
}

/**
 * Load excuse letter history
 * UPDATED: Phase 3 - Added teacher info fetch
 */
async function loadExcuseHistory() {
    try {
        const { data: history, error } = await supabase
            .from('excuse_letters')
            .select(`
                *,
                students (full_name, classes (grade_level, department))
            `)
            .eq('parent_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(15);

        if (error) {
            console.error('Error loading history:', error);
            excuseHistory = [];
            return;
        }

        excuseHistory = history || [];
        
        // Phase 3: Fetch teacher names for approved/rejected letters
        for (let letter of excuseHistory) {
            if (letter.status === 'Approved' || letter.status === 'Rejected') {
                // We would need to track who approved/rejected
                // For now, just mark as processed
                letter.processed_at = letter.updated_at;
            }
        }
        
        renderHistory();

    } catch (err) {
        console.error('Error in loadExcuseHistory:', err);
        excuseHistory = [];
    }
}

/**
 * Render excuse history list
 * UPDATED: Phase 3 - Enhanced status display with timestamps
 */
function renderHistory(filter = 'all') {
    const container = document.getElementById('excuse-history');
    const emptyState = document.getElementById('history-empty');

    // Filter history
    const filtered = filter === 'all' 
        ? excuseHistory 
        : excuseHistory.filter(item => item.status === filter);

    if (filtered.length === 0) {
        container.innerHTML = '';
        container.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    container.classList.remove('hidden');
    emptyState.classList.add('hidden');

    container.innerHTML = filtered.map(item => {
        const statusBadge = getStatusBadge(item.status);
        const childName = item.students?.full_name || 'Unknown';
        const childClass = `${item.students?.classes?.grade_level || ''} - ${item.students?.classes?.department || ''}`;

        // Phase 3: Status timestamp
        let statusInfo = '';
        if (item.status === 'Pending') {
            statusInfo = `<span class="text-xs text-yellow-600">Submitted ${getRelativeTime(item.created_at)}</span>`;
        } else if (item.status === 'Approved') {
            statusInfo = `<span class="text-xs text-green-600">✓ Approved ${item.updated_at ? getRelativeTime(item.updated_at) : ''}</span>`;
        } else if (item.status === 'Rejected') {
            statusInfo = `<span class="text-xs text-red-600">✕ Rejected ${item.updated_at ? getRelativeTime(item.updated_at) : ''}</span>`;
        }

        return `
            <div class="bg-white rounded-xl shadow-md p-4">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <h4 class="font-bold text-gray-800">${childName}</h4>
                        <p class="text-xs text-gray-500">${childClass}</p>
                    </div>
                    ${statusBadge}
                </div>
                <div class="text-sm text-gray-600 mb-2">
                    <p class="line-clamp-2">${item.reason}</p>
                </div>
                <div class="flex justify-between items-center text-xs text-gray-400 pt-2 border-t">
                    <span>${formatDate(item.date_absent)}</span>
                    ${statusInfo}
                </div>
                ${item.image_proof_url ? `
                    <a href="${item.image_proof_url}" target="_blank" class="mt-2 inline-flex items-center gap-1 text-xs text-green-600 hover:underline">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                        </svg>
                        View Proof
                    </a>
                ` : ''}
                ${item.teacher_remarks ? `
                    <div class="mt-2 p-2 bg-gray-50 rounded text-xs">
                        <span class="font-medium text-gray-600">Teacher's Note:</span>
                        <p class="text-gray-600">${item.teacher_remarks}</p>
                    </div>
                ` : ''}
                ${item.status === 'Pending' ? `
                    <div class="mt-3 pt-3 border-t">
                        <div class="flex gap-2">
                            <button onclick="openEditModal(${item.id})" class="flex-1 text-center py-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors">Edit</button>
                            <button onclick="cancelSubmission(${item.id})" class="flex-1 text-center py-2 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors">Cancel</button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

/**
 * Get status badge HTML
 */
function getStatusBadge(status) {
    switch (status) {
        case 'Approved':
            return '<span class="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Approved</span>';
        case 'Rejected':
            return '<span class="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">Rejected</span>';
        case 'Pending':
        default:
            return '<span class="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Pending Review</span>';
    }
}

/**
 * Filter history by status
 */
function filterHistory(status) {
    // Update filter button styles
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.textContent.toLowerCase() === status.toLowerCase() || 
            (status === 'all' && btn.textContent === 'All')) {
            btn.className = 'filter-btn px-3 py-1 rounded-full text-sm bg-green-700 text-white whitespace-nowrap';
        } else {
            btn.className = 'filter-btn px-3 py-1 rounded-full text-sm bg-white text-gray-600 border whitespace-nowrap';
        }
    });

    renderHistory(status);
}

/**
 * Open the edit modal with the excuse letter's data
 * UPDATED: Phase 3 - Added file upload support
 */
function openEditModal(letterId) {
    const letter = excuseHistory.find(item => item.id === letterId);
    if (!letter) return;

    // Reset edit file
    editUploadedFile = null;

    // Create modal if it doesn't exist
    let modal = document.getElementById('edit-excuse-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'edit-excuse-modal';
        modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center p-4 z-50';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
                <div class="p-4 border-b flex justify-between items-center">
                    <h3 class="font-bold text-lg">Edit Excuse Letter</h3>
                    <span id="edit-status-indicator" class="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded hidden">Editing...</span>
                </div>
                <div class="p-4 space-y-4">
                    <input type="hidden" id="edit-letter-id">
                    <div>
                        <label class="text-sm font-medium">Date of Absence</label>
                        <input type="date" id="edit-absence-date" class="w-full mt-1 p-2 border rounded-lg">
                    </div>
                    <div>
                        <label class="text-sm font-medium">Reason</label>
                        <textarea id="edit-reason" rows="4" class="w-full mt-1 p-2 border rounded-lg resize-none"></textarea>
                    </div>
                    <div>
                        <label class="text-sm font-medium">Proof File (Optional)</label>
                        <input type="file" id="edit-proof-file" accept="image/*,.pdf" class="hidden" onchange="handleEditFileSelect(event)">
                        <div id="edit-file-area" class="mt-2">
                            <button type="button" onclick="document.getElementById('edit-proof-file').click()" class="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-green-500 hover:text-green-600 transition-colors">
                                📷 Upload New Proof
                            </button>
                            <div id="edit-file-preview" class="hidden mt-2 p-2 bg-gray-50 rounded flex items-center justify-between">
                                <span id="edit-file-name" class="text-sm text-gray-600 truncate"></span>
                                <button type="button" onclick="removeEditFile(event)" class="text-red-500 hover:text-red-700">✕</button>
                            </div>
                            <div id="edit-current-file" class="mt-2">
                                <a id="edit-current-file-link" href="#" target="_blank" class="text-sm text-green-600 hover:underline flex items-center gap-1">
                                    📎 View Current Proof
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="p-4 bg-gray-50 flex justify-end gap-3">
                    <button onclick="closeEditModal()" class="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Cancel</button>
                    <button onclick="submitEdit()" id="edit-submit-btn" class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium">Save Changes</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Populate and show modal
    document.getElementById('edit-letter-id').value = letter.id;
    document.getElementById('edit-absence-date').value = letter.date_absent;
    document.getElementById('edit-reason').value = letter.reason;
    
    // Show current file if exists
    const currentFileLink = document.getElementById('edit-current-file-link');
    const currentFileDiv = document.getElementById('edit-current-file');
    if (letter.image_proof_url) {
        currentFileLink.href = letter.image_proof_url;
        currentFileDiv.classList.remove('hidden');
    } else {
        currentFileDiv.classList.add('hidden');
    }
    
    // Reset file preview
    document.getElementById('edit-file-preview').classList.add('hidden');
    editUploadedFile = null;
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

/**
 * Handle file selection in edit modal
 * Phase 3: New function
 */
function handleEditFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
        alert('Please select a valid file (PNG, JPG, or PDF)');
        event.target.value = '';
        return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        event.target.value = '';
        return;
    }

    editUploadedFile = file;

    // Show preview
    document.getElementById('edit-file-name').textContent = file.name;
    document.getElementById('edit-file-preview').classList.remove('hidden');
}

/**
 * Remove selected file in edit modal
 * Phase 3: New function
 */
function removeEditFile(event) {
    event.stopPropagation();
    editUploadedFile = null;
    document.getElementById('edit-proof-file').value = '';
    document.getElementById('edit-file-preview').classList.add('hidden');
}

function closeEditModal() {
    document.getElementById('edit-excuse-modal')?.classList.add('hidden');
    editUploadedFile = null;
}

/**
 * Submit edit with file upload support
 * UPDATED: Phase 3 - Added file upload and confirmation
 */
async function submitEdit() {
    const letterId = document.getElementById('edit-letter-id').value;
    const date = document.getElementById('edit-absence-date').value;
    const reason = document.getElementById('edit-reason').value;

    // Validate
    if (!reason || reason.length < 10) {
        alert("Reason must be at least 10 characters.");
        return;
    }

    // Phase 3: Add confirmation
    if (!confirm("Are you sure you want to save changes to this excuse letter?")) {
        return;
    }

    // Show editing indicator
    const submitBtn = document.getElementById('edit-submit-btn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="flex items-center gap-2"><svg class="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Saving...</span>`;

    try {
        let updateData = {
            date_absent: date,
            reason: reason
        };

        // Upload new file if selected
        if (editUploadedFile) {
            // Get the letter to find student_id
            const letter = excuseHistory.find(l => l.id === letterId);
            if (letter) {
                const filePath = `${letter.student_id}/${Date.now()}_${editUploadedFile.name}`;
                // UPDATED: Add contentType to support PDF and image uploads
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('excuse-proofs')
                    .upload(filePath, editUploadedFile, {
                        contentType: editUploadedFile.type
                    });

                if (uploadError) {
                    console.error('Upload error:', uploadError);
                    alert('Error uploading file. Please try again.');
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                    return;
                }

                // Get public URL
                const { data: urlData } = supabase.storage
                    .from('excuse-proofs')
                    .getPublicUrl(filePath);
                
                updateData.image_proof_url = urlData.publicUrl;
            }
        }

        const { error } = await supabase
            .from('excuse_letters')
            .update(updateData)
            .eq('id', letterId);

        if (error) throw error;
        
        // Show success notification
        showExcuseNotification('Excuse Letter Updated', 'Your changes have been saved successfully.', 'success');
        
        closeEditModal();
        await loadExcuseHistory();
        
    } catch (err) {
        console.error('Error updating excuse letter:', err);
        alert("Failed to update excuse letter.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

/**
 * Cancel a pending excuse letter submission
 */
async function cancelSubmission(letterId) {
    if (!confirm("Are you sure you want to cancel this submission? This action cannot be undone.")) return;

    try {
        const { error } = await supabase.from('excuse_letters').delete().eq('id', letterId);
        if (error) throw error;

        alert("Submission cancelled successfully.");
        await loadExcuseHistory(); // Refresh the list
    } catch (err) {
        console.error("Error cancelling submission:", err);
        alert("Failed to cancel submission. Please try again.");
    }
}

// Make functions available globally
window.submitExcuse = submitExcuse;
window.switchTab = switchTab;
window.filterHistory = filterHistory;
window.selectChildForExcuse = selectChildForExcuse;
window.handleFileSelect = handleFileSelect;
window.removeFile = removeFile;
window.resetForm = resetForm;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.submitEdit = submitEdit;
window.cancelSubmission = cancelSubmission;
// Phase 3: New functions
window.handleEditFileSelect = handleEditFileSelect;
window.removeEditFile = removeEditFile;
window.showExcuseNotification = showExcuseNotification;
