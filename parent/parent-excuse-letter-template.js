// parent/parent-excuse-letter-template.js
// Excuse letter submission and tracking logic

let selectedChildId = null;
let uploadedFile = null;
let excuseHistory = [];

/**
 * Initialize excuse letter page
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Set max date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('absence-date').max = today;

    // Populate child selector
    populateChildSelector();

    // Load excuse history
    await loadExcuseHistory();
});

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
                    <p class="text-xs text-gray-500">${child.classes?.grade_level} - ${child.classes?.section_name}</p>
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
        alert('Please select a child');
        return;
    }

    const date = document.getElementById('absence-date').value;
    const reason = document.getElementById('excuse-reason').value.trim();

    // Validate
    if (!date) {
        alert('Please select the date of absence');
        return;
    }
    if (!reason || reason.length < 10) {
        alert('Please provide a reason (minimum 10 characters)');
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
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('excuse-proofs')
                .upload(filePath, uploadedFile);

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
        const { data: studentData } = await supabase
            .from('students')
            .select('full_name, classes(adviser_id)')
            .eq('id', studentId)
            .single();

        if (!studentData?.classes?.adviser_id) {
            console.log('No adviser assigned for this student');
            return;
        }

        // Get child name for notification
        const childName = allChildren.find(c => c.id == studentId)?.full_name || 'Student';

        // Insert notification for teacher
        await supabase.from('notifications').insert({
            recipient_id: studentData.classes.adviser_id,
            recipient_role: 'teacher',
            title: 'New Excuse Letter',
            message: `${currentUser.full_name} submitted an excuse letter for ${childName} on ${dateAbsent}. Please review.`,
            type: 'excuse_letter',
            is_read: false,
            created_at: new Date().toISOString()
        });

        console.log('Teacher notified successfully');

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
 */
async function loadExcuseHistory() {
    try {
        const { data: history, error } = await supabase
            .from('excuse_letters')
            .select(`
                *,
                students (full_name, classes (grade_level, section_name))
            `)
            .eq('parent_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(15); // THE PARANOIA SHIELD: Stop the data avalanche!

        if (error) {
            console.error('Error loading history:', error);
            excuseHistory = [];
            return;
        }

        excuseHistory = history || [];
        renderHistory();

    } catch (err) {
        console.error('Error in loadExcuseHistory:', err);
        excuseHistory = [];
    }
}

/**
 * Render excuse history list
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
        const childClass = `${item.students?.classes?.grade_level || ''} - ${item.students?.classes?.section_name || ''}`;

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
                    <span>${getRelativeTime(item.created_at)}</span>
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

// Make functions available globally
window.submitExcuse = submitExcuse;
window.switchTab = switchTab;
window.filterHistory = filterHistory;
window.selectChildForExcuse = selectChildForExcuse;
window.handleFileSelect = handleFileSelect;
window.removeFile = removeFile;
window.resetForm = resetForm;
