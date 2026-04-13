// admin/admin-idmanagement.js
// ID Management with proper pagination - 10 students per page using Data Table

let studentRecords = [];
let filteredRecords = []; // For search/filter results
let currentPage = 1;
const rowsPerPage = 10; // Students per page
let templateSettings = {
    primaryColor: '#4c1d95',
    secondaryColor: '#8b5cf6',
    fields: { qr: true }
};

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkSession === 'function') {
        if (!checkSession('admins')) return;
    }
    await loadTemplateSettings();
    loadStudentIDs();
    injectStyles();
});

// Load template settings from database
async function loadTemplateSettings() {
    const { data } = await supabase.from('id_templates').select('settings').eq('template_type', 'student').maybeSingle();
    if (data && data.settings) {
        templateSettings = data.settings;
    }
}

// Load all students with their IDs
async function loadStudentIDs() {
    // Step 1: Fetch all students
    const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('*')
        .order('full_name');
    
    if (studentsError) {
        console.error('Error fetching students:', studentsError);
        studentRecords = [];
        renderIDList([]);
        return;
    }
    
    // Step 2: Fetch classes separately
    const { data: classes } = await supabase
        .from('classes')
        .select('id, grade_level, department');
    
    // Step 3: Fetch parents separately
    const { data: parents } = await supabase
        .from('parents')
        .select('id, full_name, contact_number');
    
    // Step 4: Map class and parent data to students in JavaScript
    const classMap = {};
    if (classes) {
        classes.forEach(c => { classMap[c.id] = c; });
    }
    
    const parentMap = {};
    if (parents) {
        parents.forEach(p => { parentMap[p.id] = p; });
    }
    
    // Merge data manually
    studentRecords = (students || []).map(s => ({
        ...s,
        classes: s.class_id ? classMap[s.class_id] : null,
        parents: s.parent_id ? parentMap[s.parent_id] : null
    }));
    
    // Initialize filtered records
    filteredRecords = [...studentRecords];
    
    // Update student count
    const countEl = document.getElementById('studentCount');
    if (countEl) countEl.textContent = `${studentRecords.length} Students`;
    
    // Reset to first page when loading new data
    currentPage = 1;
    renderIDList(filteredRecords);
}

// Filter students by search term
function filterStudents() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    
    if (!searchTerm) {
        filteredRecords = [...studentRecords];
    } else {
        filteredRecords = studentRecords.filter(s => 
            s.full_name.toLowerCase().includes(searchTerm) ||
            (s.student_id_text && s.student_id_text.toLowerCase().includes(searchTerm)) ||
            (s.lrn && s.lrn.toString().includes(searchTerm))
        );
    }
    
    // Reset to first page when filtering
    currentPage = 1;
    renderIDList(filteredRecords);
}

// Render the student ID table with pagination
function renderIDList(list) {
    console.log('[ID-MGMT] renderIDList() called, list length:', list?.length || 0);
    
    const tbody = document.getElementById('idListBody');
    const tableContainer = document.getElementById('idTableContainer');
    const emptyState = document.getElementById('emptyState');
    const paginationContainer = document.getElementById('paginationControls');
    
    console.log('[ID-MGMT] Elements found:', {
        tbody: !!tbody,
        tableContainer: !!tableContainer,
        emptyState: !!emptyState,
        paginationContainer: !!paginationContainer
    });
    
    // Handle empty list
    if (!list || list.length === 0) {
        console.log('[ID-MGMT] List is empty - hiding table and pagination');
        if (tableContainer) {
            tableContainer.classList.add('hidden');
            tableContainer.style.display = 'none';
        }
        if (emptyState) emptyState.classList.remove('hidden');
        if (paginationContainer) {
            paginationContainer.style.display = 'none';
            paginationContainer.classList.add('hidden');
        }
        return;
    }

    console.log('[ID-MGMT] List has data - showing table');
    if (tableContainer) {
        tableContainer.classList.remove('hidden');
        tableContainer.style.display = 'block';
    }
    if (emptyState) emptyState.classList.add('hidden');
    
    // Calculate pagination
    const totalPages = Math.ceil(list.length / rowsPerPage);
    console.log('[ID-MGMT] Pagination calculation:', { totalItems: list.length, rowsPerPage, totalPages, currentPage });
    
    const startIndex = (currentPage - 1) * rowsPerPage;
    const pageItems = list.slice(startIndex, startIndex + rowsPerPage);
    
    console.log('[ID-MGMT] Rendering page items:', pageItems.length);
    
    // Render table rows - only the current page
    tbody.innerHTML = pageItems.map(s => {
        // Use grade_level directly - it already contains "Grade X" from database
        let classLabel = s.classes?.grade_level || 'No Class';
        if (s.classes?.department) classLabel += ` - ${s.classes.department}`;
        
        return `
        <tr class="hover:bg-violet-50/40 transition-all group">
            <td class="px-8 py-5">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center font-black text-xs uppercase overflow-hidden shrink-0 shadow-sm">
                        ${s.profile_photo_url ? `<img src="${s.profile_photo_url}" onerror="this.onerror=null;this.outerHTML='<div class=\\'w-full h-full flex items-center justify-center font-black text-xs\\'>"+s.full_name.charAt(0)+"</div>'" class="w-full h-full object-cover">` : s.full_name.charAt(0)}
                    </div>
                    <div>
                        <p class="font-bold text-gray-800 text-sm leading-tight mb-0.5">${s.full_name}</p>
                        <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest font-mono">${s.student_id_text || 'NO ID GENERATED'}</p>
                    </div>
                </div>
            </td>
            <td class="px-8 py-5">
                <span class="inline-block px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-gray-100 text-gray-600">${classLabel}</span>
            </td>
            <td class="px-8 py-5">
                <p class="font-bold text-gray-700 text-sm">${s.parents?.full_name || 'N/A'}</p>
                <p class="text-[10px] text-gray-400 font-medium">${s.parents?.contact_number || ''}</p>
            </td>
            <td class="px-8 py-5 text-right">
                <div class="flex justify-end gap-2">
                    <button onclick="viewID(${s.id})" class="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:border-violet-500 hover:text-violet-600 transition-all shadow-sm">View ID</button>
                    <button onclick="reissueID(${s.id})" class="px-4 py-2 bg-violet-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-lg shadow-violet-200 hover:scale-105 transition-all">Re-Issue</button>
                </div>
            </td>
        </tr>`;
    }).join('');
    
    console.log('[ID-MGMT] Calling renderPaginationControls');
    
    // Handle pagination controls visibility
    renderPaginationControls(list.length, totalPages);
    
    // Update count display
    const countEl = document.getElementById('studentCount');
    if (countEl) {
        countEl.textContent = `${list.length} Students`;
    }
    
    if (window.lucide) lucide.createIcons();
}

// Render pagination controls
function renderPaginationControls(totalItems, totalPages) {
    const paginationContainer = document.getElementById('paginationControls');
    const pageIndicator = document.getElementById('pageIndicator');
    
    console.log('[ID-MGMT] renderPaginationControls called:', { totalItems, totalPages, currentPage });
    
    if (!paginationContainer) {
        console.warn('[ID-MGMT] paginationControls element NOT FOUND');
        return;
    }
    
    // Force show the container first
    paginationContainer.style.display = 'flex';
    paginationContainer.classList.remove('hidden');
    
    if (totalPages <= 1 || totalItems === 0) {
        // Hide only if truly needed
        paginationContainer.style.display = 'none';
        return;
    }
    
    // Show the controls
    paginationContainer.style.display = 'flex';
    paginationContainer.classList.remove('hidden');
    
    if (pageIndicator) {
        pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
    }
    
    console.log('[ID-MGMT] Pagination controls shown:', paginationContainer.style.display);
}

// Go to specific page
function goToPage(page) {
    const totalPages = Math.ceil(filteredRecords.length / rowsPerPage);
    if (page < 1 || page > totalPages) return;
    
    currentPage = page;
    renderIDList(filteredRecords);
    
    // Smooth scroll back to top of table
    const scrollContainer = document.querySelector('.overflow-y-auto');
    if (scrollContainer) scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
}

// Previous page
function prevPage() {
    if (currentPage > 1) {
        goToPage(currentPage - 1);
    }
}

// Next page
function nextPage() {
    const totalPages = Math.ceil(filteredRecords.length / rowsPerPage);
    if (currentPage < totalPages) {
        goToPage(currentPage + 1);
    }
}

// Expose to window for onclick handlers
window.goToPage = goToPage;
window.prevPage = prevPage;
window.nextPage = nextPage;

// View ID - Opens drawer with front/back preview
async function viewID(dbId) {
    const student = studentRecords.find(x => x.id === dbId);
    if (!student) return;
    
    const config = templateSettings;
    const container = document.getElementById('idPreviewContainer');
    
    // Generate the ID card HTML using the same function as template editor
    container.innerHTML = generatePortraitIDHTML(student, config);
    
    // Show drawer (slide in from right)
    document.getElementById('viewIdDrawer').classList.remove('translate-x-full');
    
    if (window.lucide) lucide.createIcons();
}

// Print the current ID from the drawer
function printCurrentID() {
    const previewContainer = document.getElementById('idPreviewContainer');
    if (!previewContainer?.innerHTML?.trim()) {
        showNotification('No ID card to print', 'error');
        return;
    }
    
    const content = previewContainer.innerHTML;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showNotification('Please allow pop-ups to print ID cards', 'error');
        return;
    }
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Student ID Card</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                [class*="w-\\[2in\\]"] { width: 2in !important; }
                [class*="h-\\[3in\\]"] { height: 3in !important; }
                * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                body { font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: white; margin: 0; padding: 20px; }
                .flex { display: flex !important; }
                .gap-6 { gap: 1.5rem !important; }
                .w-\\[2in\\], .h-\\[3in\\] { page-break-inside: avoid; break-inside: avoid; }
            </style>
        </head>
        <body>
            <div class="flex gap-6 justify-center items-center flex-wrap">
                ${content}
            </div>
            <script>
                window.onload = () => { setTimeout(() => { window.print(); setTimeout(() => window.close(), 500); }, 200); };
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// Close View ID Drawer
function closeViewIdDrawer() {
    document.getElementById('viewIdDrawer').classList.add('translate-x-full');
}

// Legacy alias for backward compatibility
function closeViewIdModal() {
    closeViewIdDrawer();
}

// FIXED: Helper function for consistent ID generation (timestamp + random for uniqueness)
function generateOfficialID(prefix, year, identifierSource) {
    const cleanSource = String(identifierSource).replace(/\D/g, '');
    const last4 = cleanSource.slice(-4).padStart(4, '0');
    // Use timestamp + random for uniqueness (prevents duplicate IDs when adding multiple students quickly)
    const timestamp = Date.now().toString(36).slice(-2);
    const random = Math.random().toString(36).substring(2, 4).toUpperCase();
    const suffix = timestamp + random;
    return `${prefix}-${year}-${last4}-${suffix}`;
}

// UPDATED: Helper function to prevent XSS attacks (copied from admin-user-management.js)
function escapeHtml(text) {
    if (text === null || typeof text === 'undefined') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Convert grade level to code (e.g., "Grade 1" -> "G001", "Kinder" -> "K000")
function getGradeLevelCode(gradeLevel) {
    if (!gradeLevel) return 'G000';
    if (gradeLevel.toLowerCase().includes('kinder') || gradeLevel === 'K') return 'K000';
    const gradeMatch = gradeLevel.match(/Grade\s*(\d+)/i);
    if (gradeMatch) {
        const gradeNum = parseInt(gradeMatch[1]);
        if (gradeNum >= 1 && gradeNum <= 12) return `G${gradeNum.toString().padStart(3, '0')}`;
    }
    return 'G000';
}

// Re-issue ID - Generate new student ID using standardized format
async function reissueID(dbId) {
    const student = studentRecords.find(x => x.id === dbId);
    if (!student) return;
    
    showConfirmationModal(
        "Re-issue ID?",
        "Are you sure you want to re-issue this ID? This will generate a new student ID.",
        async () => {
            const year = new Date().getFullYear();
            
            // FIXED: Use standardized generateOfficialID format (4-character suffix)
            const newID = generateOfficialID('EDU', year, student.lrn);

            const { error } = await supabase.from('students').update({ student_id_text: newID, qr_code_data: newID }).eq('id', dbId);
            if (!error) {
                showNotification(`New ID Issued: ${newID}`, "success");
                loadStudentIDs();
            } else {
                showNotification(error.message, "error");
            }
        }
    );
}

// MASTER RENDERING ENGINE (Portrait 2x3) - Same as admin-idtemplate.js
function generatePortraitIDHTML(u, config) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${u.student_id_text}`;
    
    // UI Scaling for 2x3 Portrait
    const front = `
        <div class="w-[2in] h-[3in] bg-white shadow-2xl rounded-xl overflow-hidden border border-gray-200 flex flex-col font-sans shrink-0 transform scale-110">
            <div style="background: linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor})" class="h-12 p-2 flex items-center gap-2">
                <div class="w-6 h-6 bg-white rounded-full flex items-center justify-center shrink-0">
                    <i data-lucide="graduation-cap" class="w-4 h-4 text-violet-900"></i>
                </div>
                <div class="text-white overflow-hidden leading-none">
                    <h4 class="text-[7px] font-black uppercase">Eudcare Colleges Inc</h4>
                    <p class="text-[5px] opacity-80 uppercase tracking-tighter">Purok 4 Irisan Baguio City</p>
                </div>
            </div>
            <div class="flex-1 flex flex-col items-center pt-4 px-3 text-center">
                <div class="w-20 h-20 bg-gray-100 border-2 border-violet-100 p-1 rounded-xl mb-2 overflow-hidden">
                    <img src="${u.profile_photo_url ? u.profile_photo_url : `https://ui-avatars.com/api/?name=${encodeURIComponent(u.full_name)}&background=f3f4f6&color=4b5563`}" onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(u.full_name)}&background=f3f4f6&color=4b5563';" class="w-full h-full object-cover rounded-lg ${u.profile_photo_url ? 'object-top' : ''}">
                </div>
                <h2 class="text-[9px] font-black text-gray-900 uppercase leading-tight mt-2">${u.full_name}</h2>
                <div class="w-full text-left mt-4 space-y-2 border-t pt-3 border-gray-50">
                    <div>
                        <p class="text-[5px] text-gray-400 font-bold uppercase leading-none">Address</p>
                        <p class="text-[6px] font-medium text-gray-700 leading-tight">${u.address || 'N/A'}</p>
                    </div>
                    <div>
                        <p class="text-[5px] text-gray-400 font-bold uppercase leading-none">Class</p>
                        <p class="text-[6px] font-bold text-violet-700">${u.classes?.grade_level || 'N/A'}</p>
                    </div>
                </div>
            </div>
            <div style="background: ${config.primaryColor}" class="h-1.5 w-full mt-auto"></div>
        </div>`;

    const back = `
        <div class="w-[2in] h-[3in] bg-white shadow-2xl rounded-xl overflow-hidden border border-gray-200 flex flex-col font-sans shrink-0 transform scale-110">
            <div class="p-4 flex flex-col items-center justify-center flex-1 text-center">
                ${config.fields.qr ? `<img src="${qrUrl}" class="w-16 h-16 border p-1 rounded-lg mb-2 shadow-sm">` : ''}
                <p class="text-[8px] font-mono font-bold text-gray-900 mb-6 uppercase tracking-wider">${u.student_id_text}</p>
                <div class="w-full bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-4 text-left">
                    <p class="text-[5px] text-gray-400 font-bold uppercase mb-1">Guardian / Contact</p>
                    <p class="text-[7px] font-black text-gray-800">${u.parents?.full_name || 'N/A'}</p>
                    <p class="text-[7px] font-bold text-violet-700">${u.parents?.contact_number || 'N/A'}</p>
                </div>
                <p class="text-[5px] text-gray-400 italic px-2">If lost, return to the admin office at Purok 4 Irisan Baguio City.</p>
            </div>
            <div style="background: ${config.primaryColor}" class="h-1.5 w-full mt-auto"></div>
        </div>`;

    return front + back;
}

// Inject CSS animations
function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `@keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } .animate-fade-in-up { animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; } .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }`;
    document.head.appendChild(style);
}

function showConfirmationModal(title, message, onConfirm) {
    const existing = document.getElementById('confirmation-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'confirmation-modal';
    modal.className = 'fixed inset-0 bg-black/50 z-[90] flex items-center justify-center animate-fade-in p-4';

    modal.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-auto p-6 transform transition-all animate-fade-in-up"><div class="text-center"><div class="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4 mx-auto"><i data-lucide="alert-triangle" class="w-8 h-8"></i></div><h3 class="text-xl font-black text-gray-800 mb-2">${title}</h3><p class="text-sm text-gray-500 font-medium mb-6">${message}</p><div class="flex gap-3"><button id="confirm-cancel-btn" class="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-gray-200 transition-all">Cancel</button><button id="confirm-action-btn" class="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-200">Confirm</button></div></div></div>`;

    document.body.appendChild(modal);

    document.getElementById('confirm-cancel-btn').onclick = () => modal.remove();
    document.getElementById('confirm-action-btn').onclick = () => {
        modal.remove();
        if (onConfirm) onConfirm();
    };
    
    if (window.lucide) lucide.createIcons();
}

// Notification helper
function showNotification(msg, type='info', callback=null) {
    const existing = document.getElementById('notification-modal');
    if(existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'notification-modal';
    modal.className = 'fixed inset-0 bg-black/50 z-[70] flex items-center justify-center animate-fade-in';
    const iconColor = type === 'success' ? 'text-emerald-500' : type === 'error' ? 'text-red-500' : 'text-violet-600';
    const bgColor = type === 'success' ? 'bg-emerald-50' : type === 'error' ? 'bg-red-50' : 'bg-violet-50';
    const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info';
    const title = type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Information';

    const dndEnabled = localStorage.getItem('educare_dnd_enabled') === 'true';
    if (!dndEnabled) {
        if (navigator.vibrate) navigator.vibrate(type === 'error' ? [100, 50, 100] : 200);
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = type === 'error' ? 220 : 550;
            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
            osc.start(); osc.stop(ctx.currentTime + 0.2);
        } catch(e){}
    }

    modal.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 transform transition-all animate-fade-in-up"><div class="flex flex-col items-center text-center"><div class="w-16 h-16 ${bgColor} ${iconColor} rounded-full flex items-center justify-center mb-4"><i data-lucide="${iconName}" class="w-8 h-8"></i></div><h3 class="text-xl font-black text-gray-800 mb-2">${title}</h3><p class="text-sm text-gray-500 font-medium mb-6">${msg}</p><button id="notif-btn" class="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-gray-800 transition-all">Okay, Got it</button></div></div>`;
    document.body.appendChild(modal);
    document.getElementById('notif-btn').onclick = () => { modal.remove(); if(callback) callback(); };
    if(window.lucide) lucide.createIcons();
}

// ===== GLOBAL WINDOW ATTACHMENTS FOR HTML ONCLICK HANDLERS =====
window.viewID = viewID;
window.closeViewIdModal = closeViewIdModal;
window.closeViewIdDrawer = closeViewIdDrawer;
window.reissueID = reissueID;
window.filterStudents = filterStudents;
window.prevPage = prevPage;
window.nextPage = nextPage;
window.goToPage = goToPage;
window.printCurrentID = printCurrentID;