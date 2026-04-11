// parent-excuse-letter-template.js – Excuse letter submission and tracking

let selectedChildId = null;
let uploadedFile = null;
let excuseHistory = [];
let excuseChannel = null;
let allMyChildren = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Max date = today (no future dates)
    document.getElementById('absence-date').max = getLocalDateString();

    // Load children - either from parent-core or fetch directly
    await loadChildrenForExcuseLetter();
    
    await loadExcuseHistory();
    setupExcuseRealtime();
});

// Load children - fetches directly from database to ensure all children are available
async function loadChildrenForExcuseLetter() {
    // Wait for window.allChildren if available from parent-core
    let attempts = 0;
    while (!window.allChildren && attempts < 50) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
    }
    
    if (window.allChildren && window.allChildren.length) {
        allMyChildren = window.allChildren;
        populateChildSelector();
    } else {
        // Fallback: fetch directly from database
        try {
            const parentUser = JSON.parse(localStorage.getItem('educare_user') || sessionStorage.getItem('educare_user'));
            if (!parentUser) return;
            
            const { data: children } = await supabase
                .from('students')
                .select('*, classes(grade_level, strand, department)')
                .eq('parent_id', parentUser.id);
            
            allMyChildren = children || [];
            window.allChildren = allMyChildren; // Cache for other pages
            populateChildSelector();
        } catch (err) {
            console.error('Error loading children:', err);
        }
    }
}

function populateChildSelector() {
    const selector = document.getElementById('child-selector');
    if (!selector || !allMyChildren.length) return;
    
    // Use current child as default, or first child
    if (!selectedChildId) {
        selectedChildId = window.currentChild?.id || allMyChildren[0]?.id || null;
    }
    
    selector.innerHTML = allMyChildren.map(child => {
        // Get grade level and strand info
        const grade = child.classes?.grade_level || '';
        const strand = child.classes?.strand || ''; // SHS strand (STEM, HUMSS, ABM, ICT)
        const dept = child.classes?.department || '';
        const isSHS = grade.includes('11') || grade.includes('12');
        const gradeInfo = isSHS && strand ? `${grade} - ${strand}` : (grade || dept);
        
        return `
        <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer ${selectedChildId === child.id ? 'border-green-500 bg-green-50' : 'border-gray-200'}">
            <input type="radio" name="child-select" value="${child.id}" ${selectedChildId === child.id ? 'checked' : ''}
                   onchange="selectChildForExcuse(${child.id})" class="text-green-600">
            <div class="min-w-0 flex-1">
                <p class="font-medium truncate">${escapeHtml(child.full_name)}</p>
                <p class="text-xs text-gray-500">${escapeHtml(gradeInfo)}</p>
            </div>
        </label>
    `}).join('');
}

function selectChildForExcuse(id) {
    selectedChildId = id;
    populateChildSelector();
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowed.includes(file.type)) return alert('Only PNG, JPG, or PDF');
    if (file.size > 5 * 1024 * 1024) return alert('Max 5MB');
    uploadedFile = file;
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-preview').classList.remove('hidden');
    document.getElementById('file-upload-area').classList.add('hidden');
    
    const imagePreview = document.getElementById('image-preview');
    const pdfPreview = document.getElementById('pdf-preview');
    
    if (file.type.startsWith('image')) {
        const reader = new FileReader();
        reader.onload = e => {
            imagePreview.src = e.target.result;
            imagePreview.classList.remove('hidden');
            pdfPreview.classList.add('hidden');
        };
        reader.readAsDataURL(file);
    } else if (file.type === 'application/pdf') {
        // Show PDF icon instead of image preview
        imagePreview.classList.add('hidden');
        pdfPreview.classList.remove('hidden');
    }
}

function removeFile() {
    uploadedFile = null;
    document.getElementById('proof-file').value = '';
    document.getElementById('file-preview').classList.add('hidden');
    document.getElementById('file-upload-area').classList.remove('hidden');
    document.getElementById('image-preview').classList.add('hidden');
    document.getElementById('pdf-preview').classList.add('hidden');
}

async function submitExcuse(event) {
    event.preventDefault();
    if (!selectedChildId) return alert('Select a child');
    const date = document.getElementById('absence-date').value;
    const reason = document.getElementById('excuse-reason').value.trim();
    if (!date) return alert('Select date');
    if (reason.length < 10) return alert('Reason must be at least 10 characters');

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="animate-spin">⏳</span> Submitting...';

    try {
        let proofUrl = null;
        if (uploadedFile) {
            const ext = uploadedFile.name.split('.').pop();
            const path = `${selectedChildId}/${Date.now()}.${ext}`;
            const { error: uploadErr } = await supabase.storage
                .from('excuse-proofs')
                .upload(path, uploadedFile);
            if (uploadErr) throw new Error('Upload failed');
            const { data: urlData } = supabase.storage.from('excuse-proofs').getPublicUrl(path);
            proofUrl = urlData.publicUrl;
        }

        const { error } = await supabase.from('excuse_letters').insert({
            student_id: selectedChildId,
            parent_id: window.currentUser.id,
            reason,
            date_absent: date,
            image_proof_url: proofUrl,
            status: 'Pending'
        });
        if (error) throw error;

        document.getElementById('excuse-form').classList.add('hidden');
        document.getElementById('success-message').classList.remove('hidden');
        await loadExcuseHistory();
    } catch (err) {
        alert(err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Submit Excuse Letter';
    }
}

async function loadExcuseHistory() {
    if (!window.currentUser) return;
    const { data } = await supabase
        .from('excuse_letters')
        .select('*, students(full_name, classes(grade_level, strand, department))')
        .eq('parent_id', window.currentUser.id)
        .order('created_at', { ascending: false });
    excuseHistory = data || [];
    renderHistory();
}

function renderHistory(filter = 'all') {
    const container = document.getElementById('excuse-history');
    const filtered = filter === 'all' ? excuseHistory : excuseHistory.filter(e => e.status === filter);
    if (!filtered.length) {
        container.innerHTML = '<div class="text-center py-8 text-gray-400">No excuse letters</div>';
        return;
    }
    container.innerHTML = filtered.map(item => `
        <div class="bg-white rounded-xl p-4 shadow-sm border">
            <div class="flex justify-between items-start">
                <div class="min-w-0 flex-1"><span class="font-bold truncate block">${escapeHtml(item.students?.full_name)}</span><span class="text-xs text-gray-500">${formatDate(item.date_absent)}${item.students?.classes ? ` • Grade ${item.students.classes.grade_level}${item.students.classes.strand ? ' - ' + item.students.classes.strand : ''}` : ''}</span></div>
                <div class="flex items-center gap-2">
                    ${item.status === 'Pending' ? `<button onclick="editExcuse(${item.id})" class="text-blue-500 hover:text-blue-700 text-xs font-medium">Edit</button>` : ''}
                    <span class="px-2 py-1 rounded-full text-xs font-bold bg-${item.status === 'Approved' ? 'green' : item.status === 'Rejected' ? 'red' : 'yellow'}-100 text-${item.status === 'Approved' ? 'green' : item.status === 'Rejected' ? 'red' : 'yellow'}-700 whitespace-nowrap">${item.status}</span>
                </div>
            </div>
            <p class="text-sm text-gray-600 mt-2 line-clamp-3">${escapeHtml(item.reason)}</p>
            ${item.image_proof_url ? `<a href="${item.image_proof_url}" target="_blank" class="text-xs text-blue-500 mt-2 inline-block">View Proof</a>` : ''}
            ${item.teacher_remarks ? `<p class="text-xs text-gray-400 mt-2 line-clamp-2">Teacher: ${escapeHtml(item.teacher_remarks)}</p>` : ''}
        </div>
    `).join('');
}

function setupExcuseRealtime() {
    if (excuseChannel) supabase.removeChannel(excuseChannel);
    if (!window.currentUser) return;
    excuseChannel = supabase.channel('excuse-updates')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'excuse_letters', filter: `parent_id=eq.${window.currentUser.id}` }, () => loadExcuseHistory())
        .subscribe();
}

function switchTab(tab) {
    document.getElementById('tab-submit-content').classList.toggle('hidden', tab !== 'submit');
    document.getElementById('tab-history-content').classList.toggle('hidden', tab !== 'history');
    const submitBtn = document.getElementById('tab-submit');
    const historyBtn = document.getElementById('tab-history');
    if (tab === 'submit') {
        submitBtn.className = 'flex-1 py-3 px-4 rounded-xl font-medium bg-green-600 text-white shadow-lg';
        historyBtn.className = 'flex-1 py-3 px-4 rounded-xl font-medium bg-white text-gray-600 border';
        // Refresh children list when switching to submit tab
        loadChildrenForExcuseLetter();
    } else {
        submitBtn.className = 'flex-1 py-3 px-4 rounded-xl font-medium bg-white text-gray-600 border';
        historyBtn.className = 'flex-1 py-3 px-4 rounded-xl font-medium bg-green-600 text-white shadow-lg';
    }
}

function filterHistory(status) { renderHistory(status); }
function resetForm() { location.reload(); }

let editingExcuseId = null;

function editExcuse(id) {
    const excuse = excuseHistory.find(e => e.id === id);
    if (!excuse) return;
    if (excuse.status !== 'Pending') {
        alert('Only pending excuse letters can be edited.');
        return;
    }
    editingExcuseId = id;
    document.getElementById('edit-absence-date').value = excuse.date_absent;
    document.getElementById('edit-absence-date').max = getLocalDateString();
    document.getElementById('edit-excuse-reason').value = excuse.reason || '';
    document.getElementById('edit-excuse-modal').classList.remove('hidden');
}

function closeEditModal() {
    editingExcuseId = null;
    document.getElementById('edit-excuse-modal').classList.add('hidden');
}

async function saveEditExcuse() {
    if (!editingExcuseId) return;
    const date = document.getElementById('edit-absence-date').value;
    const reason = document.getElementById('edit-excuse-reason').value.trim();
    if (!date) return alert('Select date');
    if (reason.length < 10) return alert('Reason must be at least 10 characters');
    
    try {
        const { error } = await supabase
            .from('excuse_letters')
            .update({ date_absent: date, reason: reason })
            .eq('id', editingExcuseId);
        if (error) throw error;
        closeEditModal();
        await loadExcuseHistory();
    } catch (err) {
        alert('Error updating: ' + err.message);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

window.selectChildForExcuse = selectChildForExcuse;
window.handleFileSelect = handleFileSelect;
window.removeFile = removeFile;
window.submitExcuse = submitExcuse;
window.switchTab = switchTab;
window.filterHistory = filterHistory;
window.resetForm = resetForm;
window.editExcuse = editExcuse;
window.closeEditModal = closeEditModal;
window.saveEditExcuse = saveEditExcuse;