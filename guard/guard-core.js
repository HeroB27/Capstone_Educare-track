// guard/guard-core.js

// ============================================================================
// GUARD MODULE - Intelligent Scanner Core Logic
// ============================================================================
// Features: Hybrid scanner (Mobile Camera + PC USB HID), Tap Direction Logic,
// Status Calculation, Real-time Notifications
// ============================================================================

var currentUser = checkSession('guards');

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================
let html5QrcodeScanner = null;
let lastScanTime = 0;
const ANTI_DUPLICATE_THRESHOLD = 60000; // 60 seconds in milliseconds
const SCAN_REGEX = /^EDU-\d{4}-\d{4}-[A-Z0-9]{4}$/;

// NEW: Debounce variables for machine-gun protection
let isProcessingScan = false;
const scanCooldowns = new Map(); // Tracks recent scans to prevent duplicate spam

// THE VARNISH: Create audio engine ONCE globally
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Start scanning process - called from overlay button to unlock audio context
 * This is required to enable audio playback on mobile browsers
 */
function startScanningProcess() {
    document.getElementById('start-overlay').classList.add('hidden');
    
    try {
        const audio = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audio.createOscillator();
        oscillator.connect(audio.destination);
        oscillator.start();
        oscillator.stop(audio.currentTime + 0.001);
    } catch (e) {
        console.log('Audio unlock failed:', e);
    }
    
    initializeScanner();
}
document.addEventListener('DOMContentLoaded', () => {
    if (currentUser) {
        setWelcomeMessage('guard-name', currentUser);
    }
});

/**
 * Initialize the hybrid scanner (Camera + USB HID)
 * - Mobile: Uses html5-qrcode for camera scanning
 * - PC: Uses hidden input field for USB HID scanners
 */
function initializeScanner() {
    // Start camera scanner for mobile devices
    startCameraScanner();
    
    // Setup hidden input for USB HID scanners (PC mode)
    setupUsbScanner();
}

/**
 * Start the camera-based scanner using html5-qrcode
 */
function startCameraScanner() {
    // Check if Html5QrcodeScanner is available
    if (typeof Html5QrcodeScanner !== 'undefined') {
        html5QrcodeScanner = new Html5QrcodeScanner(
            "reader", 
            { 
                fps: 10, 
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
            },
            /* verbose= */ false
        );
        html5QrcodeScanner.render(onScanSuccess, onScanFailure);
    } else {
        console.warn('html5-qrcode not loaded, falling back to USB scanner only');
    }
}

/**
 * Setup invisible input field for USB HID scanners
 * USB scanners behave like keyboard input and end with Enter key
 */
function setupUsbScanner() {
    const hiddenInput = document.getElementById('usb-scanner-input');
    
    if (hiddenInput) {
        // Keep input focused for USB scanner input
        hiddenInput.addEventListener('input', (e) => {
            // USB scanner typically ends with Enter or sends complete string
            const value = e.target.value.trim();
            
            // Detect if input is complete (ends with Enter or matches pattern)
            if (value && (value.endsWith('\n') || SCAN_REGEX.test(value))) {
                // Clean up the value (remove trailing enter)
                const cleanValue = value.replace('\n', '').trim();
                onScanSuccess(cleanValue, null);
                e.target.value = ''; // Clear input for next scan
            }
        });
        
        // Also handle keypress for Enter detection
        hiddenInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const value = hiddenInput.value.trim();
                if (value && SCAN_REGEX.test(value)) {
                    onScanSuccess(value, null);
                }
                hiddenInput.value = ''; // Clear for next scan
            }
        });
        
        // Auto-focus the hidden input
        hiddenInput.focus();
        
        // Re-focus when clicking anywhere on the scanner area
        document.addEventListener('click', () => {
            hiddenInput.focus();
        });
    }
}

/**
 * Main scan success handler - processes scanned QR codes
 * @param {string} decodedText - The scanned QR code data
 * @param {object} decodedResult - QR code result object (optional)
 */
async function onScanSuccess(decodedText, decodedResult) {
    // Anti-duplicate check: Ignore scans too close together
    const now = Date.now();
    if (now - lastScanTime < ANTI_DUPLICATE_THRESHOLD) {
        console.log('Scan ignored: too close to previous scan');
        return;
    }
    lastScanTime = now;

    // Play beep sound for feedback
    playBeepSound();

    // Validate QR code format: EDU-XXXX-XXXX-XXXX
    if (!validateQRCode(decodedText)) {
        showError('Invalid QR Code format. Please scan a valid student ID.');
        return;
    }

    // Extract student ID from QR code
    const studentId = extractStudentId(decodedText);
    
    if (!studentId) {
        showError('Could not extract student ID from QR code.');
        return;
    }

    // Process the scan
    await handleScan(studentId, decodedText);
}

/**
 * Scan failure handler
 */
function onScanFailure(error) {
    // Quiet fail - we don't want to spam console with every failed frame
    // console.warn(`QR Code scan error: ${error}`);
}

/**
 * Validate QR code format using regex
 * Format: EDU-XXXX-XXXX-XXXX (e.g., EDU-2024-0001-A1B2)
 */
function validateQRCode(qrCode) {
    return SCAN_REGEX.test(qrCode);
}

/**
 * Extract student ID from QR code
 * QR format: EDU-{year}-{sequence}-{code}
 */
function extractStudentId(qrCode) {
    // Example: EDU-2024-0001-A1B2 -> extract numeric sequence
    const parts = qrCode.split('-');
    if (parts.length === 4) {
        // Return the sequence number (e.g., "0001")
        return parts[2];
    }
    return null;
}

// ============================================================================
// MAIN SCAN PROCESSING
// ============================================================================

/**
 * Main entry point for processing a student scan
 * @param {string} studentId - The extracted student ID
 * @param {string} qrCode - The original QR code string
 */
async function handleScan(studentId, qrCode) {
    try {
        // Show loading state
        showLoading(true);

        // 1. Check if today is a holiday/suspended day
        const today = new Date().toISOString().split('T')[0];
        const holidayCheck = await checkIsHoliday(today);
        
        if (holidayCheck.isHoliday && holidayCheck.isSuspended) {
            showWarning(`School is suspended today: ${holidayCheck.description}`);
            return;
        }

        // 2. Fetch student information
        const student = await getStudentById(studentId);
        
        if (!student) {
            showError('Student not found in database.');
            return;
        }

        // 3. Get last log for today to determine direction
        const lastLog = await getLastLogToday(studentId);
        
        // Determine tap direction (ENTRY or EXIT)
        const direction = determineTapDirection(lastLog);
        
        // 4. Calculate status based on direction and time
        const now = new Date();
        const scanTime = now.toTimeString().split(' ')[0].substring(0, 5); // HH:MM format
        
        // Get class/dismissal times
        const gradeLevel = await getGradeLevel(student.class_id);
        const lateThreshold = await getLateThreshold(gradeLevel);
        const dismissalTime = getDismissalTime(gradeLevel);
        
        const statusInfo = calculateStatus(scanTime, direction, gradeLevel, lateThreshold, dismissalTime);

        // 5. Check clinic status for exit scans (medical exit check)
        let isMedicalExit = false;
        if (direction === 'EXIT') {
            isMedicalExit = await checkClinicStatus(studentId);
            if (isMedicalExit) {
                statusInfo.status = 'Medical Exit';
                statusInfo.backgroundColor = 'bg-blue-600';
                statusInfo.message = 'Authorized Medical Exit';
            }
        }

        // 6. Insert/Update attendance log
        const logResult = await saveAttendanceLog(studentId, direction, statusInfo.status);
        
        // 7. Create notification for parent
        await createNotification(studentId, direction, statusInfo.status);

        // 8. Display result
        displayScanResult(student, direction, statusInfo, scanTime);

        // 9. Update recent scans list
        addToRecentScans(student, direction, statusInfo, scanTime);

    } catch (error) {
        console.error('Error processing scan:', error);
        showError('Error processing scan. Please try again.');
    } finally {
        showLoading(false);
    }
}

/**
 * Get the last attendance log for today for a student
 * @param {string} studentId - The student ID
 * @returns {object|null} - Last log entry or null
 */
async function getLastLogToday(studentId) {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Get all logs for today, ordered by time
        const { data, error } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', studentId)
            .eq('log_date', today)
            .order('time_in', { ascending: false })
            .limit(1);
        
        if (error) {
            console.error('Error fetching last log:', error);
            return null;
        }
        
        return data && data.length > 0 ? data[0] : null;
    } catch (error) {
        console.error('Error in getLastLogToday:', error);
        return null;
    }
}

/**
 * Determine if this tap is ENTRY or EXIT based on last log
 * @param {object|null} lastLog - The last attendance log for today
 * @returns {string} - 'ENTRY' or 'EXIT'
 */
function determineTapDirection(lastLog) {
    // No record for today -> This is an ENTRY
    if (!lastLog) {
        return 'ENTRY';
    }
    
    // If last log has time_in but no time_out -> EXIT (they're leaving)
    if (lastLog.time_in && !lastLog.time_out) {
        return 'EXIT';
    }
    
    // If last log has both times -> ENTRY (new day cycle)
    if (lastLog.time_in && lastLog.time_out) {
        return 'ENTRY';
    }
    
    // Default to ENTRY
    return 'ENTRY';
}

/**
 * Calculate the status based on scan time, direction, and grade level
 * @param {string} scanTime - Current time in HH:MM format
 * @param {string} direction - 'ENTRY' or 'EXIT'
 * @param {string} gradeLevel - Student's grade level
 * @param {string} lateThreshold - Late threshold time for grade
 * @param {string} dismissalTime - Dismissal time for grade
 * @returns {object} - Status information
 */
function calculateStatus(scanTime, direction, gradeLevel, lateThreshold, dismissalTime) {
    const result = {
        status: 'Normal',
        backgroundColor: 'bg-green-600',
        message: '',
        icon: '✓'
    };
    
    if (direction === 'ENTRY') {
        // Entry Status Calculation
        if (isLate(scanTime, gradeLevel, lateThreshold)) {
            result.status = 'Late';
            result.backgroundColor = 'bg-yellow-500';
            result.message = `Late Arrival (Threshold: ${lateThreshold})`;
            result.icon = '⏰';
        } else {
            result.status = 'On Time';
            result.message = 'On Time';
            result.icon = '✓';
        }
    } else {
        // Exit Status Calculation
        if (isEarlyExit(scanTime, dismissalTime)) {
            result.status = 'Early Exit';
            result.backgroundColor = 'bg-red-600';
            result.message = `Early Exit (Dismissal: ${dismissalTime})`;
            result.icon = '⚠️';
            
            // Check for late exit (after dismissal + 30 mins)
        } else if (isLateExit(scanTime, dismissalTime)) {
            result.status = 'Late Exit';
            result.backgroundColor = 'bg-yellow-500';
            result.message = `Late Exit (>${dismissalTime}+30min)`;
            result.icon = '⏰';
        } else {
            result.status = 'Normal Exit';
            result.message = 'Normal Dismissal';
            result.icon = '✓';
        }
    }
    
    return result;
}

/**
 * Check if student has an active clinic visit (for medical exit)
 * @param {string} studentId - The student ID
 * @returns {boolean} - True if student is sent home from clinic
 */
async function checkClinicStatus(studentId) {
    try {
        // Check for active clinic visit with "Sent Home" status
        const { data, error } = await supabase
            .from('clinic_visits')
            .select('*')
            .eq('student_id', studentId)
            .is('time_out', null) // Still active (not checked out)
            .order('time_in', { ascending: false })
            .limit(1);
        
        if (error) {
            console.error('Error checking clinic status:', error);
            return false;
        }
        
        // Check if there's an active visit and action_taken is "Sent Home"
        if (data && data.length > 0) {
            const visit = data[0];
            return visit.action_taken && visit.action_taken.toLowerCase().includes('sent home');
        }
        
        return false;
    } catch (error) {
        console.error('Error in checkClinicStatus:', error);
        return false;
    }
}

/**
 * Check if exit time is later than dismissal + 30 minutes
 */
function isLateExit(scanTime, dismissalTime) {
    const [scanHour, scanMin] = scanTime.split(':').map(Number);
    const [dismissHour, dismissMin] = dismissalTime.split(':').map(Number);
    
    const scanMinutes = scanHour * 60 + scanMin;
    const dismissMinutes = dismissHour * 60 + dismissMin;
    const lateThresholdMinutes = dismissMinutes + 30; // 30 mins after dismissal
    
    return scanMinutes > lateThresholdMinutes;
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Fetch student by ID
 */
async function getStudentById(studentId) {
    try {
        // Try to find by student_id_text first
        const { data, error } = await supabase
            .from('students')
            .select(`
                id,
                student_id_text,
                full_name,
                qr_code_data,
                profile_photo_url,
                class_id,
                status,
                classes (
                    grade_level,
                    section_name
                )
            `)
            .eq('student_id_text', studentId)
            .single();
        
        if (error) {
            // If not found by text, try by LRN
            const { data: data2, error: error2 } = await supabase
                .from('students')
                .select(`
                    id,
                    student_id_text,
                    full_name,
                    qr_code_data,
                    profile_photo_url,
                    class_id,
                    status,
                    classes (
                        grade_level,
                        section_name
                    )
                `)
                .eq('lrn', studentId)
                .single();
            
            if (error2) {
                console.error('Student not found:', error2);
                return null;
            }
            return data2;
        }
        
        return data;
    } catch (error) {
        console.error('Error fetching student:', error);
        return null;
    }
}

/**
 * Get grade level from class ID
 */
async function getGradeLevel(classId) {
    if (!classId) return 'Unknown';
    
    try {
        const { data, error } = await supabase
            .from('classes')
            .select('grade_level')
            .eq('id', classId)
            .single();
        
        if (error) {
            return 'Unknown';
        }
        
        return data.grade_level || 'Unknown';
    } catch (error) {
        return 'Unknown';
    }
}

/**
 * Save attendance log to database
 */
async function saveAttendanceLog(studentId, direction, status) {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    
    try {
        if (direction === 'ENTRY') {
            // Create new entry log
            const { data, error } = await supabase
                .from('attendance_logs')
                .insert({
                    student_id: studentId,
                    log_date: today,
                    time_in: now.toISOString(),
                    status: status,
                    remarks: ''
                })
                .select()
                .single();
            
            if (error) {
                console.error('Error saving entry log:', error);
                return null;
            }
            return data;
        } else {
            // Update existing log with time_out
            // Find the most recent log without time_out
            const { data: existingLogs, error: fetchError } = await supabase
                .from('attendance_logs')
                .select('id')
                .eq('student_id', studentId)
                .eq('log_date', today)
                .is('time_out', null)
                .order('time_in', { ascending: false })
                .limit(1);
            
            if (fetchError) {
                console.error('Error finding log to update:', fetchError);
                return null;
            }
            
            if (existingLogs && existingLogs.length > 0) {
                const { error } = await supabase
                    .from('attendance_logs')
                    .update({
                        time_out: now.toISOString(),
                        status: status
                    })
                    .eq('id', existingLogs[0].id);
                
                if (error) {
                    console.error('Error updating exit log:', error);
                    return null;
                }
                return existingLogs[0];
            } else {
                // No existing log, create new one with both times (edge case)
                const { data, error } = await supabase
                    .from('attendance_logs')
                    .insert({
                        student_id: studentId,
                        log_date: today,
                        time_in: now.toISOString(),
                        time_out: now.toISOString(),
                        status: status,
                        remarks: ''
                    })
                    .select()
                    .single();
                
                if (error) {
                    console.error('Error creating new log:', error);
                    return null;
                }
                return data;
            }
        }
    } catch (error) {
        console.error('Error in saveAttendanceLog:', error);
        return null;
    }
}

/**
 * Create notification for parent about scan
 */
async function createNotification(studentId, direction, status) {
    try {
        // Get student and parent info
        const student = await getStudentById(studentId);
        if (!student || !student.parent_id) {
            console.warn('Cannot create notification: no student or parent info');
            return;
        }
        
        const action = direction === 'ENTRY' ? 'entered' : 'exited';
        const time = new Date().toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
        
        const message = `Your child, ${student.full_name}, ${action} at ${time} (${status})`;
        
        const { error } = await supabase
            .from('notifications')
            .insert({
                recipient_id: student.parent_id,
                recipient_role: 'parent',
                title: direction === 'ENTRY' ? 'Arrival Alert' : 'Departure Alert',
                message: message,
                type: direction === 'ENTRY' ? 'arrival' : 'departure'
            });
        
        if (error) {
            console.error('Error creating notification:', error);
        }
    } catch (error) {
        console.error('Error in createNotification:', error);
    }
}

// ============================================================================
// UI HELPERS
// ============================================================================

/**
 * Display scan result on the UI
 */
function displayScanResult(student, direction, statusInfo, scanTime) {
    const resultCard = document.getElementById('scan-result');
    const placeholder = document.getElementById('scan-placeholder');
    const studentName = document.getElementById('student-name');
    const studentInfo = document.getElementById('student-info');
    const statusBadge = document.getElementById('status-badge');
    const studentImg = document.getElementById('student-img');
    
    // Hide placeholder, show result
    placeholder.classList.add('hidden');
    resultCard.classList.remove('hidden');
    
    // Update student info
    const gradeLevel = student.classes ? student.classes.grade_level : 'Unknown';
    const section = student.classes ? student.classes.section_name : '';
    const fullInfo = gradeLevel && section 
        ? `${gradeLevel} - ${section} • ${student.student_id_text}`
        : student.student_id_text;
    
    studentName.innerText = student.full_name;
    studentInfo.innerText = fullInfo;
    
    // Update profile image
    if (student.profile_photo_url) {
        studentImg.src = student.profile_photo_url;
        studentImg.parentElement.style.display = 'block';
    } else {
        studentImg.parentElement.style.display = 'none';
    }
    
    // Update status badge with color coding
    statusBadge.className = `inline-block px-8 py-4 rounded-lg text-2xl font-bold ${statusInfo.backgroundColor} text-white shadow-lg transform scale-110 transition-all duration-300`;
    statusBadge.innerHTML = `
        <span class="block">${statusInfo.status}</span>
        <span class="block text-sm font-normal mt-1">${statusInfo.message} • ${formatTime(scanTime)}</span>
    `;
}

/**
 * Add entry to recent scans list
 */
function addToRecentScans(student, direction, statusInfo, scanTime) {
    const recentList = document.getElementById('recent-scans-list');
    if (!recentList) return;
    
    const gradeLevel = student.classes ? student.classes.grade_level : 'Unknown';
    const action = direction === 'ENTRY' ? 'Entered' : 'Exited';
    
    const entry = document.createElement('div');
    entry.className = 'flex items-center justify-between p-4 bg-gray-800 rounded-lg mb-2 animate-pulse';
    entry.innerHTML = `
        <div class="flex items-center gap-3">
            <div class="h-10 w-10 rounded-full bg-gray-600 overflow-hidden flex items-center justify-center">
                ${student.profile_photo_url 
                    ? `<img src="${student.profile_photo_url}" class="h-full w-full object-cover">`
                    : '👤'}
            </div>
            <div>
                <p class="font-semibold">${student.full_name}</p>
                <p class="text-sm text-gray-400">${gradeLevel} • ${scanTime}</p>
            </div>
        </div>
        <span class="px-3 py-1 rounded text-sm font-bold ${statusInfo.backgroundColor} text-white">
            ${action}
        </span>
    `;
    
    // Add to top of list
    recentList.insertBefore(entry, recentList.firstChild);
    
    // Keep only last 10 entries
    while (recentList.children.length > 10) {
        recentList.removeChild(recentList.lastChild);
    }
}

/**
 * Show loading state
 */
function showLoading(isLoading) {
    const loading = document.getElementById('loading-indicator');
    if (loading) {
        loading.classList.toggle('hidden', !isLoading);
    }
}

/**
 * Show error message
 */
function showError(message) {
    const errorEl = document.getElementById('error-message');
    if (errorEl) {
        errorEl.innerText = message;
        errorEl.classList.remove('hidden');
        errorEl.className = 'bg-red-600 text-white p-4 rounded-lg mb-4';
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            errorEl.classList.add('hidden');
        }, 3000);
    } else {
        alert(message);
    }
}

/**
 * Show warning message
 */
function showWarning(message) {
    const warningEl = document.getElementById('warning-message');
    if (warningEl) {
        warningEl.innerText = message;
        warningEl.classList.remove('hidden');
        warningEl.className = 'bg-yellow-500 text-black p-4 rounded-lg mb-4';
    } else {
        alert(message);
    }
}

/**
 * Play beep sound for scan feedback
 */
function playBeepSound() {
    try {
        const audio = new Audio('https://www.soundjay.com/button/beep-07.wav');
        audio.volume = 0.5;
        audio.play().catch(e => console.log('Audio play failed:', e));
    } catch (e) {
        console.log('Audio not available');
    }
}

/**
 * Format time for display (24h to 12h AM/PM)
 */
function formatTime(time24) {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

// ===========================================================================-
// EXPORT FOR USE IN OTHER MODULES
// ============================================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        handleScan,
        getLastLogToday,
        calculateStatus,
        checkClinicStatus,
        createNotification,
        validateQRCode,
        determineTapDirection
    };
}

// ============================================================================
// NEW: PROCESS QR SCAN WITH DEBOUNCE (Machine-Gun Protection)
// ============================================================================

/**
 * Process QR scan with debounce logic to prevent duplicate scans
 * @param {string} qrCodeData - The scanned QR code data
 */
async function processQRScan(qrCodeData) {
    // 1. Machine-Gun Protection
    if (isProcessingScan) return;
    
    const now = Date.now();
    if (scanCooldowns.has(qrCodeData) && (now - scanCooldowns.get(qrCodeData) < 5000)) {
        return; // Ignore if scanned within the last 5 seconds
    }

    isProcessingScan = true;
    scanCooldowns.set(qrCodeData, now);

    try {
        const today = new Date().toISOString().split('T')[0];
        const currentTime = new Date().toISOString();

        // 2. Find the Student by QR Data
        const { data: student, error: studentError } = await supabase
            .from('students')
            .select('id, full_name, classes(grade_level, section_name)')
            .eq('qr_code_data', qrCodeData)
            .single();

        if (studentError || !student) throw new Error("Invalid or Unregistered ID");

        // 3. Check today's Attendance Log
        const { data: existingLog, error: logError } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', student.id)
            .eq('log_date', today)
            .maybeSingle();

        if (logError) throw logError;

        let actionType = '';
        let finalStatus = 'On Time';

        // 4. SMART ROUTING: Entry vs Exit
        if (!existingLog) {
            // TIME IN
            actionType = 'ENTRY';
            
            const currentHour = new Date().getHours();
            const currentMin = new Date().getMinutes();
            if (currentHour > 8 || (currentHour === 8 && currentMin > 0)) {
                finalStatus = 'Late';
            }

            await supabase.from('attendance_logs').insert({
                student_id: student.id,
                log_date: today,
                time_in: currentTime,
                status: finalStatus
            });

        } else if (existingLog && !existingLog.time_out) {
            // TIME OUT
            actionType = 'EXIT';
            
            await supabase.from('attendance_logs')
                .update({ time_out: currentTime })
                .eq('id', existingLog.id);

        } else {
            throw new Error("Student already scanned out for today.");
        }

        // 5. Success UI Feedback
        triggerScanFeedback(true, student.full_name, actionType, finalStatus);

    } catch (err) {
        // 6. Error UI Feedback
        triggerScanFeedback(false, err.message, 'ERROR', '');
    } finally {
        isProcessingScan = false;
    }
}

// ============================================================================
// NEW: UI FEEDBACK FUNCTIONS
// ============================================================================

/**
 * Trigger visual and audio feedback for scan results
 * @param {boolean} isSuccess - Whether the scan was successful
 * @param {string} message - Message to display
 * @param {string} actionType - ENTRY, EXIT, or ERROR
 * @param {string} status - Status message
 */
function triggerScanFeedback(isSuccess, message, actionType, status) {
    const overlay = document.getElementById('scan-overlay');
    const messageEl = document.getElementById('scan-message');
    
    // Set colors based on status
    let bgColor = 'bg-green-500';
    if (!isSuccess) bgColor = 'bg-red-500';
    else if (status === 'Late') bgColor = 'bg-yellow-500';
    
    // Update overlay
    overlay.className = `fixed inset-0 ${bgColor} flex items-center justify-center z-50 transition-opacity duration-300`;
    messageEl.innerHTML = `
        <div class="text-center text-white">
            <p class="text-6xl font-bold">${actionType}</p>
            <p class="text-2xl mt-2">${message}</p>
        </div>
    `;
    
    // Play sound
    if (isSuccess) {
        playBeep();
    } else {
        playBuzzer();
    }
    
    // Hide after 2 seconds
    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 2000);
}

/**
 * Play beep sound for successful scan (using Web Audio API)
 */
function playBeep() {
    try {
        // Wake it up if the browser put it to sleep
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const oscillator = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        oscillator.connect(gain);
        gain.connect(audioCtx.destination);
        oscillator.frequency.value = 800;
        gain.gain.value = 0.1;
        oscillator.start();
        setTimeout(() => oscillator.stop(), 150);
    } catch (e) {
        console.log('Audio not available');
    }
}

/**
 * Play buzzer sound for error scan (using Web Audio API)
 */
function playBuzzer() {
    try {
        // Wake it up if the browser put it to sleep
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const oscillator = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        oscillator.connect(gain);
        gain.connect(audioCtx.destination);
        oscillator.frequency.value = 200;
        oscillator.type = 'sawtooth';
        gain.gain.value = 0.1;
        oscillator.start();
        setTimeout(() => oscillator.stop(), 300);
    } catch (e) {
        console.log('Audio not available');
    }
}
