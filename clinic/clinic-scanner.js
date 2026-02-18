// clinic/clinic-scanner.js

// ============================================================================
// CLINIC PATIENT CHECK-IN - JavaScript Logic
// ============================================================================
// Features: QR scanner, USB scanner support, manual search, patient check-in
// ============================================================================

// Session Check
// currentUser is now global in clinic-core.js

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================
let html5QrcodeScanner = null;
let searchTimeout = null;
let selectedStudent = null;

// 1. Create the audio engine ONCE globally to prevent memory leaks
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    if (currentUser) {
        // Set clinic staff name
        const sidebarName = document.getElementById('clinic-name-sidebar');
        if (sidebarName) sidebarName.textContent = currentUser.full_name || 'Nurse';
        
        const headerName = document.getElementById('clinic-name');
        if (headerName) headerName.textContent = currentUser.full_name || 'Nurse';
        
        // Load data
        await loadTeachers();
        await loadRecentCheckIns();
        // Don't initialize scanner yet - wait for user tap to satisfy autoplay policy
    }
});

/**
 * Start Clinic Scanner - required for browser autoplay policy
 * Shows overlay until user clicks, then initializes scanner and unlocks audio
 */
function startClinicScanner() {
    document.getElementById('start-overlay')?.classList.add('hidden');
    
    // Unlock the AudioContext with a silent beep
    try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const oscillator = audioCtx.createOscillator();
        oscillator.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.001);
    } catch (e) {
        console.log('Audio unlock failed');
    }
    
    // Now it's safe to initialize the camera/USB listeners
    initializeScanner();
    setupUsbScanner();
}

// ============================================================================
// SCANNER INITIALIZATION
// ============================================================================

/**
 * Initialize QR code scanner
 */
function initializeScanner() {
    const qrReader = document.getElementById('qr-reader');
    
    if (!qrReader) return;
    
    if (typeof Html5QrcodeScanner !== 'undefined') {
        try {
            html5QrcodeScanner = new Html5QrcodeScanner(
                "qr-reader", 
                { 
                    fps: 10, 
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0
                },
                false
            );
            html5QrcodeScanner.render(onScanSuccess, onScanFailure);
        } catch (error) {
            console.error('QR Scanner initialization error:', error);
            showQrScannerError();
        }
    } else {
        showQrScannerError();
    }
}

/**
 * Show QR scanner error placeholder
 */
function showQrScannerError() {
    const qrReader = document.getElementById('qr-reader');
    if (qrReader) {
        qrReader.innerHTML = `
            <div class="flex items-center justify-center h-full text-gray-500 py-12">
                <div class="text-center">
                    <svg class="w-16 h-16 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                    <p>QR Scanner not available</p>
                    <p class="text-sm">Use USB scanner or manual search</p>
                </div>
            </div>
        `;
    }
}

/**
 * Setup USB barcode scanner
 */
function setupUsbScanner() {
    const hiddenInput = document.getElementById('usb-scanner-input');
    if (!hiddenInput) return;
    
    hiddenInput.addEventListener('input', async (e) => {
        const value = e.target.value.trim();
        if (value && value.includes('\n')) {
            const cleanValue = value.replace('\n', '').trim();
            await handleScannerInput(cleanValue);
            e.target.value = '';
        }
    });
    
    hiddenInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            const value = hiddenInput.value.trim();
            if (value) {
                await handleScannerInput(value);
                hiddenInput.value = '';
            }
        }
    });
    
    hiddenInput.focus();
    document.addEventListener('click', () => hiddenInput.focus());
}

// ============================================================================
// SCAN HANDLERS
// ============================================================================

/**
 * Handle QR scan success
 */
async function onScanSuccess(decodedText, decodedResult) {
    try {
        playBeepSound();
        const result = await processPatientScan(decodedText);
        await loadRecentCheckIns();
    } catch (error) {
        showToast(error.message, 'error');
        playErrorSound();
    }
}

/**
 * Handle scan failure (suppressed)
 */
function onScanFailure(error) {
    // Silent fail - we don't want console spam for failed scans
}

// ============================================================================
// SMART PATIENT SCAN PROCESSING
// ============================================================================

/**
 * Process patient scan with smart referral detection
 * Detects if student has a pending teacher referral or is a walk-in
 */
async function processPatientScan(qrCodeData) {
    try {
        // 1. Identify the Student by QR code
        const { data: student, error: studentError } = await supabase
            .from('students')
            .select('id, full_name, parent_id')
            .eq('qr_code_data', qrCodeData)
            .single();

        if (studentError || !student) throw new Error("Invalid Student ID");

        // 2. Check for a Pending Teacher Referral
        const { data: pendingVisit } = await supabase
            .from('clinic_visits')
            .select('*')
            .eq('student_id', student.id)
            .eq('status', 'Pending')
            .maybeSingle();

        const currentTime = new Date().toISOString();

        if (pendingVisit) {
            // Admit Referred Student
            await supabase.from('clinic_visits')
                .update({ 
                    status: 'In Progress', 
                    time_in: currentTime 
                })
                .eq('id', pendingVisit.id);
                
            showToast(`Admitted: ${student.full_name} (Teacher Referral)`, 'success');
        } else {
            // Admit Walk-in Student
            await supabase.from('clinic_visits').insert({
                student_id: student.id,
                reason: 'Walk-in',
                status: 'In Progress',
                time_in: currentTime
            });
            
            showToast(`Admitted: ${student.full_name} (Walk-in)`, 'success');
        }

    } catch (err) {
        showToast(err.message, 'error');
        playErrorSound();
        throw err;
    }
}

// ============================================================================
// STUDENT SEARCH
// ============================================================================

/**
 * Handle search input with debounce
 */
async function handleSearch(query) {
    clearTimeout(searchTimeout);
    
    if (query.length < 2) {
        document.getElementById('search-results').innerHTML = '';
        return;
    }
    
    searchTimeout = setTimeout(async () => {
        await performSearch(query);
    }, 300);
}

/**
 * Perform student search
 */
async function performSearch(query) {
    const results = await searchStudents(query);
    const container = document.getElementById('search-results');
    
    if (!container) return;
    
    if (results.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">No students found</p>';
        return;
    }
    
    container.innerHTML = results.map(student => {
        const classInfo = student.classes;
        return `
            <div onclick="selectStudentFromSearch('${student.id}')" 
                class="p-4 hover:bg-gray-50 rounded-xl cursor-pointer flex items-center gap-3 transition-colors">
                <div class="h-10 w-10 rounded-full bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center text-red-600 font-bold">
                    ${student.full_name?.charAt(0) || '?'}
                </div>
                <div class="flex-1">
                    <p class="font-medium text-gray-800">${escapeHtml(student.full_name)}</p>
                    <p class="text-sm text-gray-500">${classInfo?.grade_level || ''} - ${classInfo?.section_name || ''}</p>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Select student from search results
 */
async function selectStudentFromSearch(studentId) {
    const student = await getStudentById(studentId);
    if (student) {
        selectStudent(student);
    }
}

/**
 * Select and display student info
 */
function selectStudent(student) {
    selectedStudent = student;
    
    const studentIdInput = document.getElementById('selected-student-id');
    const studentDisplay = document.getElementById('selected-student-display');
    const checkinBtn = document.getElementById('checkin-btn');
    const searchResults = document.getElementById('search-results');
    const searchInput = document.getElementById('student-search');
    
    if (studentIdInput) studentIdInput.value = student.id;
    
    if (studentDisplay) {
        studentDisplay.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="h-10 w-10 rounded-full bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center text-red-600 font-bold">
                    ${student.full_name?.charAt(0) || '?'}
                </div>
                <div>
                    <p class="font-medium text-gray-800">${escapeHtml(student.full_name)}</p>
                    <p class="text-sm text-gray-500">ID: ${student.student_id_text || 'N/A'} | Class: ${student.classes?.grade_level || ''} - ${student.classes?.section_name || ''}</p>
                </div>
            </div>
        `;
    }
    
    if (checkinBtn) checkinBtn.disabled = false;
    if (searchResults) searchResults.innerHTML = '';
    if (searchInput) searchInput.value = '';
}

// ============================================================================
// TEACHERS
// ============================================================================

/**
 * Load teachers for referral dropdown
 */
async function loadTeachers() {
    const teachers = await fetchTeachers();
    const select = document.getElementById('referred-by');
    
    if (!select) return;
    
    select.innerHTML = '<option value="">Select teacher...</option>' +
        teachers.map(t => `<option value="${t.id}">${escapeHtml(t.full_name)} (${t.department || 'General'})</option>`).join('');
}

// ============================================================================
// CHECK-IN
// ============================================================================

/**
 * Handle check-in form submission
 */
async function handleCheckIn(event) {
    event.preventDefault();
    
    const studentId = document.getElementById('selected-student-id')?.value;
    const teacherId = document.getElementById('referred-by')?.value;
    const reason = document.getElementById('visit-reason')?.value;
    const notifyParent = document.getElementById('notify-parent')?.checked;
    
    if (!studentId || !reason) {
        showToast('Please fill in all required fields', 'warning');
        return;
    }
    
    try {
        // Process check-in
        const result = await processClinicCheckIn(studentId, {
            reason,
            referred_by: teacherId || null,
            notify_parent: notifyParent
        });
        
        showToast(`Checked in: ${result.name}`, 'success');
        
        // Reset form
        resetCheckInForm();
        
        // Reload recent check-ins
        await loadRecentCheckIns();
        
    } catch (error) {
        console.error('Check-in error:', error);
        showToast(error.message, 'error');
    }
}

/**
 * Reset check-in form
 */
function resetCheckInForm() {
    selectedStudent = null;
    
    const studentIdInput = document.getElementById('selected-student-id');
    const studentDisplay = document.getElementById('selected-student-display');
    const checkinBtn = document.getElementById('checkin-btn');
    const reasonInput = document.getElementById('visit-reason');
    const notifyParent = document.getElementById('notify-parent');
    
    if (studentIdInput) studentIdInput.value = '';
    
    if (studentDisplay) {
        studentDisplay.innerHTML = 'No student selected';
        studentDisplay.className = 'p-4 bg-gray-50 rounded-xl text-gray-500';
    }
    
    if (checkinBtn) checkinBtn.disabled = true;
    if (reasonInput) reasonInput.value = '';
    if (notifyParent) notifyParent.checked = true;
}

// ============================================================================
// RECENT CHECK-INS
// ============================================================================

/**
 * Load recent check-ins
 */
async function loadRecentCheckIns() {
    const tbody = document.getElementById('recent-checkins-body');
    if (!tbody) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    try {
        const { data: visits, error } = await supabase
            .from('clinic_visits')
            .select(`
                *,
                students(full_name, grade_level, section_name),
                teachers(full_name)
            `)
            .eq('visit_date', today)
            .order('time_in', { ascending: false })
            .limit(10);
        
        if (error) throw error;
        
        if (!visits || visits.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-6 py-8 text-center text-gray-500">
                        No check-ins today
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = visits.map(visit => `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-600">${formatTime(visit.time_in)}</div>
                </td>
                <td class="px-6 py-4">
                    <div class="text-sm font-medium text-gray-800">${visit.students?.full_name || 'Unknown'}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-600">${visit.students?.grade_level || ''} ${visit.students?.section_name || ''}</div>
                </td>
                <td class="px-6 py-4">
                    <div class="text-sm text-gray-600 max-w-xs truncate">${escapeHtml(visit.reason)}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm text-gray-600">${visit.teachers?.full_name || '-'}</div>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading check-ins:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-8 text-center text-red-500">
                    Error loading check-ins
                </td>
            </tr>
        `;
    }
}

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Search students by query
 */
async function searchStudents(query) {
    try {
        const { data, error } = await supabase
            .from('students')
            .select(`
                *,
                classes(grade_level, section_name)
            `)
            .or(`full_name.ilike.%${query}%,student_id_text.ilike.%${query}%,lrn.ilike.%${query}%`)
            .eq('is_active', true)
            .limit(5);
        
        if (error) throw error;
        return data || [];
        
    } catch (error) {
        console.error('Error searching students:', error);
        return [];
    }
}

/**
 * Get student by ID
 */
async function getStudentById(studentId) {
    try {
        const { data, error } = await supabase
            .from('students')
            .select(`
                *,
                classes(grade_level, section_name)
            `)
            .eq('id', studentId)
            .single();
        
        if (error) throw error;
        return data;
        
    } catch (error) {
        console.error('Error fetching student:', error);
        return null;
    }
}

/**
 * Fetch all teachers
 */
async function fetchTeachers() {
    try {
        const { data, error } = await supabase
            .from('teachers')
            .select('id, full_name, department')
            .eq('is_active', true)
            .order('full_name');
        
        if (error) throw error;
        return data || [];
        
    } catch (error) {
        console.error('Error fetching teachers:', error);
        return [];
    }
}

/**
 * Process clinic check-in
 */
async function processClinicCheckIn(identifier, details = {}) {
    // If identifier is not a UUID, try to find by student_id_text
    let student;
    
    if (identifier.includes('-') && identifier.length > 20) {
        // Likely a UUID
        student = await getStudentById(identifier);
    } else {
        // Try to find by student_id_text
        const results = await searchStudents(identifier);
        student = results[0];
    }
    
    if (!student) {
        throw new Error('Student not found');
    }
    
    // Check if already checked in today
    const today = new Date().toISOString().split('T')[0];
    const { data: existingVisit } = await supabase
        .from('clinic_visits')
        .select('*')
        .eq('student_id', student.id)
        .eq('visit_date', today)
        .in('status', ['pending', 'checked_in'])
        .single();
    
    if (existingVisit) {
        throw new Error('Student already checked in today');
    }
    
    // Create visit record
    const now = new Date();
    const timeIn = now.toTimeString().split(' ')[0].substring(0, 5);
    
    const { data: visit, error } = await supabase
        .from('clinic_visits')
        .insert({
            student_id: student.id,
            visit_date: today,
            time_in: timeIn,
            reason: details.reason || 'General check-up',
            referred_by: details.referred_by || null,
            status: 'checked_in',
            notified_parent: details.notify_parent || false
        })
        .select()
        .single();
    
    if (error) throw error;
    
    return {
        type: 'Student',
        name: student.full_name,
        visit: visit
    };
}

/**
 * Handle scanner input (USB scanner)
 */
async function handleScannerInput(input) {
    try {
        playBeepSound();
        const result = await processClinicCheckIn(input);
        showToast(`${result.type}: ${result.name}`, 'success');
        await loadRecentCheckIns();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format time for display
 */
function formatTime(timeStr) {
    if (!timeStr) return '-';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 z-50 px-6 py-3 rounded-xl shadow-lg transform transition-all duration-300 ${
        type === 'success' ? 'bg-green-500 text-white' :
        type === 'error' ? 'bg-red-500 text-white' :
        type === 'warning' ? 'bg-amber-500 text-white' :
        'bg-blue-500 text-white'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-full');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Play beep sound - uses global audioCtx to prevent memory leak
 */
function playBeepSound() {
    try {
        // Wake it up if the browser put it to sleep
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.frequency.value = 1000;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.1;
        
        oscillator.start();
        setTimeout(() => oscillator.stop(), 150);
    } catch (e) {
        // Audio not supported, ignore
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
