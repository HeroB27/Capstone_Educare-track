// parent-children.js – Clean list and modal

let childrenData = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadAllChildren();
});

async function loadAllChildren() {
    const { data, error } = await supabase
        .from('students')
        .select('*, classes(grade_level, department)')
        .eq('parent_id', window.currentUser.id);
    if (error || !data?.length) {
        document.getElementById('loading-indicator')?.classList.add('hidden');
        document.getElementById('empty-state')?.classList.remove('hidden');
        return;
    }
    childrenData = data;
    await renderChildrenList();
    document.getElementById('loading-indicator')?.classList.add('hidden');
    document.getElementById('children-list')?.classList.remove('hidden');
}

async function renderChildrenList() {
    const container = document.getElementById('children-list');
    const now = new Date();
    for (let child of childrenData) {
        child.stats = await calculateAttendanceStats(child.id, now.getFullYear(), now.getMonth());
    }
    container.innerHTML = childrenData.map((child, idx) => {
        const percentage = child.stats.percentage;
        const color = percentage >= 90 ? 'text-green-600' : (percentage >= 75 ? 'text-yellow-600' : 'text-red-600');
        return `
            <div class="bg-white rounded-xl shadow-md overflow-hidden cursor-pointer" onclick="showChildDetail(${idx})">
                <div class="p-4">
                    <div class="flex items-center gap-4">
                        <div class="h-14 w-14 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-lg">
                            ${getInitials(child.full_name)}
                        </div>
                        <div>
                            <h3 class="font-bold text-gray-800">${escapeHtml(child.full_name)}</h3>
                            <p class="text-sm text-gray-500">${escapeHtml(child.classes?.grade_level || '')} ${escapeHtml(child.classes?.department || '')}</p>
                        </div>
                    </div>
                    <div class="mt-3">
                        <div class="flex justify-between text-sm">
                            <span class="font-bold ${color}">${percentage}%</span>
                            <span>✅ ${child.stats.present}  ⏰ ${child.stats.late}  ❌ ${child.stats.absent}</span>
                        </div>
                        <div class="mt-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div class="h-full ${percentage >= 90 ? 'bg-green-500' : (percentage >= 75 ? 'bg-yellow-500' : 'bg-red-500')}" style="width: ${percentage}%"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

window.showChildDetail = async function(idx) {
    const child = childrenData[idx];
    const stats = child.stats;
    const modal = document.getElementById('child-modal');
    document.getElementById('modal-child-name').innerText = child.full_name;
    document.getElementById('modal-content').innerHTML = `
        <div class="space-y-3">
            <div><span class="text-gray-500">LRN:</span> ${escapeHtml(child.lrn)}</div>
            <div><span class="text-gray-500">Grade:</span> ${escapeHtml(child.classes?.grade_level || 'N/A')}</div>
            <div><span class="text-gray-500">Section:</span> ${escapeHtml(child.classes?.department || 'N/A')}</div>
            <div class="grid grid-cols-3 gap-2 mt-2">
                <div class="bg-green-50 p-2 rounded text-center"><span class="font-bold">${stats.present}</span><br><span class="text-xs">Present</span></div>
                <div class="bg-yellow-50 p-2 rounded text-center"><span class="font-bold">${stats.late}</span><br><span class="text-xs">Late</span></div>
                <div class="bg-red-50 p-2 rounded text-center"><span class="font-bold">${stats.absent}</span><br><span class="text-xs">Absent</span></div>
            </div>
            <div class="flex gap-2 mt-4">
                <button onclick="window.location.href='parent-childs-attendance.html'" class="flex-1 bg-blue-500 text-white py-2 rounded-lg">View Attendance</button>
                <button onclick="closeModal()" class="flex-1 bg-gray-200 py-2 rounded-lg">Close</button>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
};

function closeModal() { document.getElementById('child-modal').classList.add('hidden'); }
function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, function(m) { if (m === '&') return '&amp;'; if (m === '<') return '&lt;'; if (m === '>') return '&gt;'; return m; }); }

window.closeModal = closeModal;