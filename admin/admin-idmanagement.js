// admin/admin-idmanagement.js

// 1. Session Check
// currentUser is now global in admin-core.js

// Global data stores
let allIDs = [];
let filteredIDs = [];

// ID Generation Rules:
// - Students: EDU-{Year}-{Last4LRN}-{Random4}
// - Staff: {PREFIX}-{Year}-{Last4Phone}-{Random4}
//   PREFIX: ADM (Admin), TCH (Teacher), CLC (Clinic), GRD (Guard), PAR (Parent)

// 2. Initialize Page
document.addEventListener('DOMContentLoaded', () => {
    if (currentUser) {
        document.getElementById('admin-name').innerText = currentUser.full_name || 'Admin';
    }
    
    // Load all ID data
    loadAllIDs();
});

// ============ LOAD DATA ============

// 3. Load All ID Cards from Database
// UPDATED: Simplified to only fetch students for physical card printing
async function loadAllIDs() {
    try {
        // Only fetch students - staff use IDs for web login only
        const { data: students, error } = await supabase
            .from('students')
            .select(`
                id, student_id_text, full_name, lrn, qr_code_data, profile_photo_url, status,
                classes (grade_level, section_name)
            `)
            .order('full_name') // Alphabetical order for predictability
            .limit(100);       // THE PARANOIA SHIELD: Protect the DOM from freezing;

        if (error) throw error;

        // Simplify the mapping - only students for card printing
        allIDs = (students || []).map(s => ({ 
            ...s, 
            role: 'student',
            type: 'student',
            typeLabel: 'Student',
            idText: s.student_id_text || generateStudentID(s.lrn),
            fullName: s.full_name,
            secondaryInfo: `Grade ${s.classes?.grade_level} - ${s.classes?.section_name}`,
            qrData: s.qr_code_data || s.lrn,
            photo: s.profile_photo_url,
            status: s.status,
            lrn: s.lrn
        }));

        // Update stats - only students
        document.getElementById('stat-students').innerText = students?.length || 0;
        document.getElementById('stat-teachers').innerText = 0;
        document.getElementById('stat-parents').innerText = 0;
        document.getElementById('stat-staff').innerText = 0;

        // Initial render
        filteredIDs = [...allIDs];
        renderIDCards();
        
    } catch (err) {
        console.error("Critical error loading IDs:", err);
        document.getElementById('idCardsGrid').innerHTML = '<p class="text-red-500 text-center py-8 col-span-full">Error loading ID cards</p>';
    }
}

// ============ ID GENERATION ============

// 4. Generate Student ID: EDU-{Year}-{Last4LRN}-{Random4}
function generateStudentID(lrn) {
    if (!lrn) {
        return 'EDU-' + new Date().getFullYear() + '-0000-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    }
    const year = new Date().getFullYear();
    const last4LRN = lrn.slice(-4);
    const random4 = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `EDU-${year}-${last4LRN}-${random4}`;
}

// 5. Generate Staff ID: {PREFIX}-{Year}-{Last4Phone}-{Random4}
function generateStaffID(prefix, phone) {
    const year = new Date().getFullYear();
    const last4Phone = phone ? phone.replace(/\D/g, '').slice(-4) : '0000';
    const random4 = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${year}-${last4Phone}-${random4}`;
}

// ============ RENDER ============

// 6. Render ID Cards Grid
function renderIDCards() {
    const container = document.getElementById('idCardsGrid');
    
    if (filteredIDs.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-8 col-span-full">No ID cards found</p>';
        return;
    }
    
    container.innerHTML = filteredIDs.map(item => {
        const typeColors = {
            student: 'bg-violet-100 text-violet-700 border-violet-300',
            teacher: 'bg-blue-100 text-blue-700 border-blue-300',
            parent: 'bg-green-100 text-green-700 border-green-300',
            guard: 'bg-orange-100 text-orange-700 border-orange-300',
            clinic: 'bg-red-100 text-red-700 border-red-300'
        };
        
        return `
            <div class="bg-white rounded-lg shadow hover:shadow-md transition cursor-pointer" onclick="viewID(${item.id})">
                <div class="p-4 border-b flex items-center gap-3">
                    <input type="checkbox" class="id-checkbox w-4 h-4 text-violet-600 rounded" value="${item.id}" onclick="event.stopPropagation()">
                    <span class="px-2 py-1 text-xs font-bold rounded border ${typeColors[item.type]}">${item.typeLabel}</span>
                    <span class="text-sm text-gray-500">${item.idText}</span>
                </div>
                <div class="p-4">
                    <div class="flex items-center gap-3">
                        <div class="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                            ${item.photo ? `<img src="${item.photo}" alt="Photo" class="h-full w-full object-cover">` : 
                            `<span class="text-gray-400 font-bold">${item.fullName.charAt(0)}</span>`}
                        </div>
                        <div>
                            <h4 class="font-bold text-gray-800">${item.fullName}</h4>
                            <p class="text-sm text-gray-500">${item.secondaryInfo}</p>
                        </div>
                    </div>
                    <div class="mt-3 flex justify-between items-center">
                        <span class="text-xs ${item.status === 'Active' ? 'text-green-600' : 'text-red-600'}">${item.status}</span>
                        <div class="flex gap-2">
                            <button onclick="event.stopPropagation(); openReissueModal(${item.id}, '${item.type}')" class="text-red-600 hover:text-red-800 text-sm">
                                Lost ID
                            </button>
                            <button onclick="event.stopPropagation(); printSingleID(${item.id})" class="text-violet-600 hover:text-violet-800 text-sm">
                                🖨️ Print
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ============ SEARCH AND FILTER ============

// 7. Search ID Cards
function searchIDs() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    
    filteredIDs = allIDs.filter(item => 
        item.fullName.toLowerCase().includes(query) || 
        item.idText.toLowerCase().includes(query)
    );
    
    renderIDCards();
}

// 8. Filter by Type
function filterByType() {
    const type = document.getElementById('filterType').value;
    
    if (type === 'all') {
        filteredIDs = [...allIDs];
    } else {
        filteredIDs = allIDs.filter(item => item.type === type);
    }
    
    renderIDCards();
}

// 9. Refresh Data
function refreshIDs() {
    loadAllIDs();
}

// ============ VIEW AND PRINT ============

// 10. View ID Card Details
function viewID(id) {
    const item = allIDs.find(i => i.id === id);
    if (!item) return;
    
    // Generate QR code
    const qrContainer = document.getElementById('modalQRCode');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: item.qrData,
        width: 100,
        height: 100
    });
    
    // Show modal
    document.getElementById('viewIDModal').classList.remove('hidden');
}

// 11. Close View ID Modal
function closeViewIDModal() {
    document.getElementById('viewIDModal').classList.add('hidden');
}

// 12. Print Single ID Card
function printSingleID(id) {
    const item = allIDs.find(i => i.id === id);
    if (!item) return;
    
    generatePrintTemplate([item]);
}

// 13. Print All Visible ID Cards
function printAllIDs() {
    if (filteredIDs.length === 0) {
        alert('No ID cards to print');
        return;
    }
    
    generatePrintTemplate(filteredIDs);
}

// 14. Generate Print Template
function generatePrintTemplate(items) {
    const printArea = document.getElementById('printArea');
    
    printArea.innerHTML = items.map(item => `
        <div class="print-page" style="width: 3.375in; height: 2.125in; border: 2px solid #000; margin: 0.5in; padding: 0.15in; box-sizing: border-box;">
            <div style="display: flex; height: 100%;">
                <div style="width: 35%; text-align: center; padding-right: 0.1in;">
                    <div style="width: 0.7in; height: 0.7in; background: #f0f0f0; border-radius: 50%; margin: 0 auto 0.1in; overflow: hidden;">
                        ${item.photo ? `<img src="${item.photo}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                        `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 0.3in; font-weight: bold; color: #888;">${item.fullName.charAt(0)}</div>`}
                    </div>
                    <div id="qr-print-${item.id}" style="width: 0.8in; height: 0.8in; margin: 0 auto;"></div>
                </div>
                <div style="width: 65%; padding-left: 0.1in;">
                    <div style="font-size: 0.12in; font-weight: bold; color: #666;">SCHOOL ID</div>
                    <div style="font-size: 0.11in; font-weight: bold; margin-bottom: 0.05in; word-break: break-all;">${item.idText}</div>
                    <div style="font-size: 0.14in; font-weight: bold; margin-bottom: 0.02in;">${item.fullName}</div>
                    <div style="font-size: 0.1in; color: #666; margin-bottom: 0.02in;">${item.typeLabel}</div>
                    <div style="font-size: 0.09in; color: #666;">${item.secondaryInfo}</div>
                    <div style="font-size: 0.08in; color: #888; margin-top: 0.1in;">Valid until: ${new Date().getFullYear() + 1}</div>
                </div>
            </div>
        </div>
    `).join('');
    
    // Generate QR codes after DOM update
    setTimeout(() => {
        items.forEach(item => {
            const qrContainer = document.getElementById(`qr-print-${item.id}`);
            if (qrContainer) {
                new QRCode(qrContainer, {
                    text: item.qrData,
                    width: 64,
                    height: 64
                });
            }
        });
        
        // Trigger print after QR codes are generated
        setTimeout(() => {
            window.print();
        }, 500);
    }, 100);
}

// 15. Print Selected ID Cards (with template settings)
async function printSelectedIDs() {
    const selectedCheckboxes = document.querySelectorAll('.id-checkbox:checked');
    if (selectedCheckboxes.length === 0) return alert("Select IDs to print.");

    try {
        // 1. Fetch ALL templates once to have the styles
        let templateMap = {};
        try {
            const { data: templates } = await supabase.from('id_templates').select('*');
            if (templates && templates.length > 0) {
                templates.forEach(t => templateMap[t.template_type] = t.settings);
            }
        } catch (e) {
            console.warn("Could not load templates, using defaults:", e);
        }

        // Default settings fallback
        const defaultSettings = {
            student: { primaryColor: '#4f46e5', secondaryColor: '#f59e0b', schoolName: 'Educare School', schoolAddress: '123 Education Street, Manila', layoutStyle: 'horizontal', photoPosition: 'left' },
            teacher: { primaryColor: '#2563eb', secondaryColor: '#10b981', schoolName: 'Educare School', schoolAddress: '123 Education Street, Manila', layoutStyle: 'horizontal', photoPosition: 'left' },
            parent: { primaryColor: '#10b981', secondaryColor: '#6b7280', schoolName: 'Educare School', schoolAddress: '123 Education Street, Manila', layoutStyle: 'horizontal', photoPosition: 'left' },
            guard: { primaryColor: '#f59e0b', secondaryColor: '#6b7280', schoolName: 'Educare School', schoolAddress: '123 Education Street, Manila', layoutStyle: 'horizontal', photoPosition: 'left' },
            clinic: { primaryColor: '#dc2626', secondaryColor: '#6b7280', schoolName: 'Educare School', schoolAddress: '123 Education Street, Manila', layoutStyle: 'horizontal', photoPosition: 'left' }
        };

        let printHTML = '';
        
        for (const cb of selectedCheckboxes) {
            const id = parseInt(cb.value);
            const data = allIDs.find(item => item.id === id);
            if (!data) continue;
            
            // Generate instant QR image using QR server API
            const safeQrData = encodeURIComponent(data.qr_code_data || data.idText);
            const instantQrImage = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${safeQrData}&margin=0`;
            
            // 2. Pass the saved template settings to the generator
            const settings = templateMap[data.role] || defaultSettings[data.role] || defaultSettings.student;
            printHTML += generateIDCardHTML(data.role, settings, data, instantQrImage);
        }

        // Create print window
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>Print IDs</title>
                <style>
                    body { margin: 0; padding: 20px; }
                    .print-page { width: 3.375in; height: 2.125in; border: 2px solid #000; margin: 10px; display: inline-block; padding: 0.15in; box-sizing: border-box; page-break-after: always; }
                    @media print { body { padding: 0; } .print-page { margin: 0; border: 1px solid #000; } }
                </style>
            </head>
            <body>${printHTML}</body>
            </html>
        `);
        printWindow.document.close();
        
        // Trigger print immediately - QR codes are already embedded as images
        setTimeout(() => {
            printWindow.print();
        }, 1000);

    } catch (err) {
        console.error("Print error:", err);
        alert("Error printing IDs: " + err.message);
    }
}

// 16. Generate ID Card HTML (from template settings)
// UPDATED: Now accepts instantQrImage parameter for QR server API
function generateIDCardHTML(type, settings, data, instantQrImage) {
    const layoutStyle = settings.layoutStyle || 'horizontal';
    const photoPos = settings.photoPosition || 'left';
    
    // QR Image HTML - use instant QR image if provided, otherwise placeholder
    const qrImageHTML = instantQrImage 
        ? `<img src="${instantQrImage}" style="width: 0.7in; height: 0.7in; object-fit: contain;">`
        : `<div id="qr-print-${data.id}" class="qr-code-container" style="width: 0.7in; height: 0.7in;"></div>`;
    
    // Type-specific styling
    const typeConfig = {
        student: { label: 'STUDENT ID', bgGradient: settings.primaryColor || '#4f46e5' },
        teacher: { label: 'FACULTY ID', bgGradient: settings.primaryColor || '#2563eb' },
        parent: { label: 'PARENT ID', bgGradient: settings.primaryColor || '#10b981' },
        guard: { label: 'GUARD ID', bgGradient: settings.primaryColor || '#f59e0b' },
        clinic: { label: 'CLINIC ID', bgGradient: settings.primaryColor || '#dc2626' }
    };
    
    const config = typeConfig[type] || typeConfig.student;
    
    if (layoutStyle === 'horizontal') {
        return `
            <div class="print-page" style="display: flex; height: 100%; background: linear-gradient(to right, ${config.bgGradient} 35%, white 35%);">
                <div style="width: 35%; background: ${config.bgGradient}; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0.1in; color: white; text-align: center;">
                    <div style="width: 0.7in; height: 0.7in; background: white; border-radius: 50%; margin-bottom: 0.08in; overflow: hidden;">
                        <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 0.25in; font-weight: bold; color: ${config.bgGradient};">${data.fullName ? data.fullName.charAt(0) : '?'}</div>
                    </div>
                    <div class="qr-section" style="margin-top: 0.05in;">${qrImageHTML}</div>
                    <p style="font-size: 0.08in; margin-top: 0.05in;">SCAN FOR INFO</p>
                </div>
                <div style="width: 65%; padding: 0.1in; display: flex; flex-direction: column;">
                    <div style="background: ${settings.secondaryColor || '#f59e0b'}; color: white; padding: 0.03in 0.08in; font-size: 0.1in; font-weight: bold; position: absolute; top: 0.1in; right: 0.1in;">${config.label}</div>
                    <p style="font-size: 0.07in; color: #666; margin-bottom: 0.02in;">${settings.schoolName || 'Educare School'}</p>
                    <p style="font-size: 0.07in; color: #666; margin-bottom: 0.05in;">${settings.schoolAddress || '123 Education Street'}</p>
                    <p style="font-size: 0.13in; font-weight: bold; margin-bottom: 0.02in; line-height: 1.1;">${data.fullName || 'Unknown'}</p>
                    <p style="font-size: 0.09in; color: #666; margin-bottom: 0.03in;">${data.secondaryInfo || ''}</p>
                    <p style="font-size: 0.08in; font-weight: bold; color: ${config.bgGradient};">${data.idText || data.id}</p>
                    ${data.lrn ? `<p style="font-size: 0.07in; color: #666;">LRN: ${data.lrn}</p>` : ''}
                    <p style="font-size: 0.06in; color: #999; margin-top: auto;">Valid until: ${new Date().getFullYear() + 1}</p>
                </div>
            </div>
        `;
    } else if (layoutStyle === 'vertical') {
        return `
            <div class="print-page" style="height: 100%; background: white; display: flex; flex-direction: column;">
                <div style="background: linear-gradient(135deg, ${config.bgGradient}, ${settings.secondaryColor || '#6b7280'}); padding: 0.1in; text-align: center; color: white;">
                    <p style="font-size: 0.07in; margin-bottom: 0.02in;">${settings.schoolName || 'Educare School'}</p>
                    <p style="font-size: 0.1in; font-weight: bold;">${config.label}</p>
                </div>
                <div style="flex: 1; padding: 0.1in; text-align: center;">
                    <div style="width: 0.8in; height: 0.8in; background: #f0f0f0; border-radius: 50%; margin: 0 auto 0.08in; overflow: hidden;">
                        <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 0.3in; font-weight: bold; color: ${config.bgGradient};">${data.fullName ? data.fullName.charAt(0) : '?'}</div>
                    </div>
                    <div class="qr-section" style="margin: 0 auto;">${qrImageHTML}</div>
                    <p style="font-size: 0.12in; font-weight: bold; margin-bottom: 0.02in;">${data.fullName || 'Unknown'}</p>
                    <p style="font-size: 0.09in; color: #666; margin-bottom: 0.05in;">${data.secondaryInfo || ''}</p>
                    <p style="font-size: 0.1in; font-weight: bold; color: ${config.bgGradient};">${data.idText || data.id}</p>
                </div>
            </div>
        `;
    } else {
        // Compact layout
        return `
            <div class="print-page" style="height: 100%; background: white; display: flex; border: 2px solid ${config.bgGradient};">
                <div style="width: 30%; background: ${config.bgGradient}; display: flex; align-items: center; justify-content: center; padding: 0.05in;">
                    <div style="width: 0.5in; height: 0.5in; background: white; border-radius: 50%; overflow: hidden;">
                        <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 0.18in; font-weight: bold; color: ${config.bgGradient};">${data.fullName ? data.fullName.charAt(0) : '?'}</div>
                    </div>
                </div>
                <div style="width: 70%; padding: 0.05in; display: flex; flex-direction: column; justify-content: center;">
                    <p style="font-size: 0.1in; font-weight: bold;">${data.fullName || 'Unknown'}</p>
                    <p style="font-size: 0.08in; color: #666;">${data.secondaryInfo || ''}</p>
                    <p style="font-size: 0.09in; font-weight: bold; color: ${config.bgGradient};">${data.idText || data.id}</p>
                    <div class="qr-section" style="position: absolute; bottom: 0.05in; right: 0.05in; width: 0.35in; height: 0.35in;">${instantQrImage ? `<img src="${instantQrImage}" style="width: 100%; height: 100%; object-fit: contain;">` : `<div id="qr-print-${data.id}" class="qr-code-container"></div>`}</div>
                </div>
            </div>
        `;
    }
}

// ============ LOST ID / RE-ISSUE ============

// 15. Open Re-issue Modal - Shows student info and old ID
let currentReissueData = null;

async function openReissueModal(id, type) {
    // Find the item in allIDs
    const item = allIDs.find(i => i.id === id && i.type === type);
    if (!item) {
        alert('ID card not found');
        return;
    }
    
    currentReissueData = {
        id: item.id,
        type: item.type,
        fullName: item.fullName,
        oldID: item.idText,
        lrn: item.lrn || null,
        phone: item.secondaryInfo?.match(/\d+/)?.[0] || null
    };
    
    // Update modal content
    document.getElementById('reissue-student-name').textContent = currentReissueData.fullName;
    document.getElementById('reissue-old-id').textContent = currentReissueData.oldID;
    document.getElementById('reissue-type-label').textContent = item.typeLabel;
    document.getElementById('reissue-new-id').textContent = 'Click "Generate New ID" to create new ID';
    document.getElementById('reissue-confirm-btn').disabled = true;
    document.getElementById('reissue-confirm-btn').classList.add('opacity-50', 'cursor-not-allowed');
    
    // Show modal
    document.getElementById('reissueIDModal').classList.remove('hidden');
}

// 16. Close Re-issue Modal
function closeReissueModal() {
    document.getElementById('reissueIDModal').classList.add('hidden');
    currentReissueData = null;
}

// 17. Generate New ID - Creates a new ID for re-issue
function generateNewID() {
    if (!currentReissueData) return;
    
    let newID;
    
    if (currentReissueData.type === 'student') {
        // Generate student ID: EDU-{Year}-{LRN_Last4}-{NewRandom}
        newID = generateStudentID(currentReissueData.lrn);
    } else {
        // Generate staff ID based on type
        const prefixMap = {
            'teacher': 'TCH',
            'parent': 'PAR',
            'guard': 'GRD',
            'clinic': 'CLC'
        };
        const prefix = prefixMap[currentReissueData.type] || 'STF';
        newID = generateStaffID(prefix, currentReissueData.phone);
    }
    
    document.getElementById('reissue-new-id').textContent = newID;
    document.getElementById('reissue-new-id').classList.add('text-green-600', 'font-bold');
    document.getElementById('reissue-confirm-btn').disabled = false;
    document.getElementById('reissue-confirm-btn').classList.remove('opacity-50', 'cursor-not-allowed');
    
    currentReissueData.newID = newID;
}

// 18. Confirm Re-issue - Updates database with new ID
async function confirmReissue() {
    if (!currentReissueData || !currentReissueData.newID) {
        alert('Please generate a new ID first');
        return;
    }
    
    const newID = currentReissueData.newID;
    const studentId = currentReissueData.id;
    const tableName = currentReissueData.type === 'student' ? 'students' : 
                      currentReissueData.type === 'teacher' ? 'teachers' :
                      currentReissueData.type === 'parent' ? 'parents' :
                      currentReissueData.type === 'guard' ? 'guards' : 'clinic_staff';
    
    const idColumn = currentReissueData.type === 'student' ? 'student_id_text' :
                     currentReissueData.type === 'teacher' ? 'teacher_id_text' :
                     currentReissueData.type === 'parent' ? 'parent_id_text' :
                     currentReissueData.type === 'guard' ? 'guard_id_text' : 'clinic_id_text';
    
    try {
        const { error } = await supabase
            .from(tableName)
            .update({
                [idColumn]: newID,
                qr_code_data: newID
            })
            .eq('id', studentId);
        
        if (error) throw error;
        
        alert('ID re-issued successfully!\nOld ID: ' + currentReissueData.oldID + '\nNew ID: ' + newID);
        
        // Refresh the grid
        closeReissueModal();
        loadAllIDs();
        
    } catch (error) {
        console.error('Error re-issuing ID:', error);
        alert('Error re-issuing ID: ' + error.message);
    }
}
