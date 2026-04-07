// parent-excuse-letter-template.js – Excuse letter submission and tracking

let selectedChildId = null;
let uploadedFile = null;
let excuseHistory = [];
let excuseChannel = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Max date = today (no future dates)
    document.getElementById('absence-date').max = getLocalDateString();

    // Wait for children to load
    if (window.allChildren && window.allChildren.length) {
        populateChildSelector();
    } else {
        const interval = setInterval(() => {
            if (window.allChildren && window.allChildren.length) {
                clearInterval(interval);
                populateChildSelector();
            }
        }, 100);
        setTimeout(() => clearInterval(interval), 5000);
    }

    await loadExcuseHistory();
    setupExcuseRealtime();
});

function populateChildSelector() {
    const selector = document.getElementById('child-selector');
    if (!selector || !window.allChildren) return;
    selectedChildId = window.currentChild?.id || window.allChildren[0]?.id;
    selector.innerHTML = window.allChildren.map(child => `
        <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer ${selectedChildId === child.id ? 'border-green-500 bg-green-50' : 'border-gray-200'}">
            <input type="radio" name="child-select" value="${child.id}" ${selectedChildId === child.id ? 'checked' : ''}
                   onchange="selectChildForExcuse(${child.id})" class="text-green-600">
            <div>
                <p class="font-medium">${escapeHtml(child.full_name)}</p>
                <p class="text-xs text-gray-500">${escapeHtml(child.classes?.grade_level || '')}</p>
            </div>
        </label>
    `).join('');
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
    if (file.type.startsWith('image')) {
        const reader = new FileReader();
        reader.onload = e => document.getElementById('image-preview').src = e.target.result;
        reader.readAsDataURL(file);
    }
}

function removeFile() {
    uploadedFile = null;
    document.getElementById('proof-file').value = '';
    document.getElementById('file-preview').classList.add('hidden');
    document.getElementById('file-upload-area').classList.remove('hidden');
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
        .select('*, students(full_name, classes(grade_level, department))')
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
            <div class="flex justify-between">
                <div><span class="font-bold">${escapeHtml(item.students?.full_name)}</span><span class="text-xs text-gray-500 ml-2">${formatDate(item.date_absent)}</span></div>
                <span class="px-2 py-1 rounded-full text-xs font-bold bg-${item.status === 'Approved' ? 'green' : item.status === 'Rejected' ? 'red' : 'yellow'}-100 text-${item.status === 'Approved' ? 'green' : item.status === 'Rejected' ? 'red' : 'yellow'}-700">${item.status}</span>
            </div>
            <p class="text-sm text-gray-600 mt-2">${escapeHtml(item.reason)}</p>
            ${item.image_proof_url ? `<a href="${item.image_proof_url}" target="_blank" class="text-xs text-blue-500 mt-2 inline-block">View Proof</a>` : ''}
            ${item.teacher_remarks ? `<p class="text-xs text-gray-400 mt-2">Teacher: ${escapeHtml(item.teacher_remarks)}</p>` : ''}
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
    } else {
        submitBtn.className = 'flex-1 py-3 px-4 rounded-xl font-medium bg-white text-gray-600 border';
        historyBtn.className = 'flex-1 py-3 px-4 rounded-xl font-medium bg-green-600 text-white shadow-lg';
    }
}

function filterHistory(status) { renderHistory(status); }
function resetForm() { location.reload(); }

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