// ============================================================================
// GUARD MODULE - Intelligent Scanner Core Logic (jsQR Implementation)
// ============================================================================
// Features: Hybrid scanner (Mobile Camera + PC USB HID), Tap Direction Logic,
// Status Calculation, Real-time Notifications
// ============================================================================

var currentUser = checkSession('guards');

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================
let videoStream = null;
let video = null;
let canvas = null;
let canvasContext = null;
let animationFrameId = null;
let lastScanTime = 0;
const ANTI_DUPLICATE_THRESHOLD = 120000; // 2 minutes in milliseconds
const SCAN_REGEX = /^STU-\d{4}-\d{4}$/;

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
 * - Mobile: Uses jsQR for camera scanning
 * - PC: Uses hidden input field for USB HID scanners
 */
function initializeScanner() {
    // Start camera scanner for mobile devices
    startCameraScanner();
    
    // Setup hidden input for USB HID scanners (PC mode)
    setupUsbScanner();
}

/**
 * Start the camera-based scanner using jsQR
 */
function startCameraScanner() {
    const readerElement = document.getElementById('reader');
    if (!readerElement) {
        console.error('Reader element not found');
        return;
    }
    
    // Check if jsQR is available
    if (typeof jsQR === 'undefined') {
        console.warn('jsQR library not loaded, falling back to USB scanner only');
        return;
    }
    
    // Create video element for camera stream
    video = document.createElement('video');
    video.setAttribute('playsinline', 'true');
    video.setAttribute('autoplay', 'true');
    video.muted = true;
    
    // Create canvas for capturing frames
    canvas = document.createElement('canvas');
    canvasContext = canvas.getContext('2d', { willReadFrequently: true });
    
    // Append video element to reader container
    readerElement.appendChild(video);
    
    // Start camera
    startCamera();
}

/**
 * Start the camera and begin scanning
 */
async function startCamera() {
    try {
        // Request camera access
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment', // Use back camera on mobile
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });
        
        // Set video source
        video.srcObject = videoStream;
        
        // Wait for video to load
        video.onloadedmetadata = () => {
            video.play();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            // Start scanning loop
            scanFrame();
        };
        
    } catch (error) {
        console.error('Error starting camera:', error);
        showError('Error starting camera. Please allow camera access.');
    }
}

/**
 * Scan each video frame for QR codes
 */
function scanFrame() {
    if (!video || !video.readyState === video.HAVE_ENOUGH_DATA) {
        animationFrameId = requestAnimationFrame(scanFrame);
        return;
    }
    
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        // Draw current frame to canvas
        canvasContext.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Get image data
        const imageData = canvasContext.getImageData(0, 0, canvas.width, canvas.height);
        
        // Use jsQR to detect QR code
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert'
        });
        
        if (code) {
            // QR code detected!
            const now = Date.now();
            
            // Check cooldown to prevent duplicate scans
            if (now - lastScanTime > ANTI_DUPLICATE_THRESHOLD) {
                lastScanTime = now;
                onScanSuccess(code.data, null);
            }
        }
    }
    
    // Continue scanning
    animationFrameId = requestAnimationFrame(scanFrame);
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
        playBuzzer(); // Alert sound for duplicate scan
        triggerScanFeedback(false, 'Duplicate scan - please wait 2 minutes', 'DUPLICATE', '');
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
 * Validate QR code format using regex
 * Format: STU-{YYYY}-{XXXX} (e.g., STU-2025-0001)
 */
function validateQRCode(qrCode) {
    return SCAN_REGEX.test(qrCode);
}

/**
 * Extract student ID from QR code
 * QR format: STU-{year}-{number} (e.g., STU-2025-0001)
 * Returns the full QR code string for database lookup
 */
function extractStudentId(qrCode) {
    // Return the full QR code as-is (e.g., "STU-2025-0001")
    // The getStudentById function will handle the lookup
    return qrCode;
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
        // FIX: Use timezone-aware function to prevent "Morning UTC Trap"
        const today = getLocalISOString();
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

        // PATCH 2: Block deactivated/expelled students ("Ghost Student" Block)
        // Check if student status is not 'Enrolled'
        if (student.status && student.status !== 'Enrolled') {
            showError(`Student account is ${student.status}. Please contact the school office.`);
            return;
        }

        // 3. Get last log for today to determine direction
        const lastLog = await getLastLogToday(studentId);
        
        // Determine tap direction (ENTRY or EXIT)
        const direction = determineTapDirection(lastLog);
        
        // --- WORKFLOW IMPROVEMENT: Status Protection ---
        // If the student is already marked 'Excused' for the day, do not overwrite it.
        if (lastLog?.status === 'Excused' && direction === 'ENTRY') {
            showWarning(`${student.full_name} is already marked as Excused.`);
            return; // Stop processing to protect the excused status.
        }

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

        // 7b. Create teacher notification for special cases (Late, Early Exit, Late Exit)
        if (statusInfo.status === 'Late' || statusInfo.status === 'Early Exit' || statusInfo.status === 'Late Exit') {
            await notifyTeacher(student, direction, statusInfo.status);
        }

        // PHASE 4: Advanced Attendance Tracking
        // 8. Check for partial absence (Morning/Afternoon Absent)
        if (typeof checkPartialAbsence === 'function') {
            await checkPartialAbsence(student.id, direction, statusInfo.status);
        }

        // 9. Detect unusual attendance patterns
        if (typeof detectAttendancePatterns === 'function') {
            await detectAttendancePatterns(student, direction, statusInfo.status);
        }

        // 10. Create admin alerts for concerning patterns
        if (typeof createAdminAlert === 'function') {
            await createAdminAlert(student, direction, statusInfo.status);
        }

        // 11. Display result
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
        // FIX: Use timezone-aware function
        const today = getLocalISOString();
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
        // First try: Find by student_id_text (e.g., "STU-001")
        const { data, error } = await supabase
            .from('students')
            .select(`
                id,
                student_id_text,
                full_name,
                qr_code_data,
                profile_photo_url,
                class_id,
                parent_id,
                status,
                classes (
                    grade_level,
                    section_name
                )
            `)
            .eq('student_id_text', studentId)
            .single();
        
        if (data && !error) {
            return data;
        }
        
        // Second try: Find by qr_code_data (e.g., "EDU-2026-G007-0001")
        const { data: qrData, error: qrError } = await supabase
            .from('students')
            .select(`
                id,
                student_id_text,
                full_name,
                qr_code_data,
                profile_photo_url,
                class_id,
                parent_id,
                status,
                classes (
                    grade_level,
                    section_name
                )
            `)
            .eq('qr_code_data', studentId)
            .single();
        
        if (qrData && !qrError) {
            return qrData;
        }
        
        // Third try: If not found, try by LRN
        const { data: data2, error: error2 } = await supabase
            .from('students')
            .select(`
                id,
                student_id_text,
                full_name,
                qr_code_data,
                profile_photo_url,
                class_id,
                parent_id,
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
    // FIX: Use timezone-aware function
    const today = getLocalISOString();
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

/**
 * Create notification for teacher about special attendance events
 * Notifies for: Late, Early Exit, Late Exit
 * @param {object} student - Student object with class info
 * @param {string} direction - 'ENTRY' or 'EXIT'
 * @param {string} status - Current attendance status
 */
async function notifyTeacher(student, direction, status) {
    try {
        // Get the homeroom teacher for this student's class
        if (!student.class_id) {
            console.warn('Cannot notify teacher: no class_id');
            return;
        }
        
        // Get teacher assigned to this class
        const { data: classData, error: classError } = await supabase
            .from('classes')
            .select('teacher_id')
            .eq('id', student.class_id)
            .single();
        
        if (classError || !classData || !classData.teacher_id) {
            console.warn('Cannot notify teacher: no teacher assigned to class');
            return;
        }
        
        const time = new Date().toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
        
        const gradeLevel = student.classes ? student.classes.grade_level : 'Unknown';
        const section = student.classes ? student.classes.section_name : '';
        
        let title = '';
        let message = '';
        
        if (status === 'Late') {
            title = 'Late Arrival Alert';
            message = `${student.full_name} (${gradeLevel} - ${section}) arrived LATE at ${time}`;
        } else if (status === 'Early Exit') {
            title = 'Early Exit Alert';
            message = `${student.full_name} (${gradeLevel} - ${section}) left EARLY at ${time}`;
        } else if (status === 'Late Exit') {
            title = 'Late Exit Alert';
            message = `${student.full_name} (${gradeLevel} - ${section}) left LATE at ${time}`;
        }
        
        if (title && message) {
            const { error } = await supabase
                .from('notifications')
                .insert({
                    recipient_id: classData.teacher_id,
                    recipient_role: 'teacher',
                    title: title,
                    message: message,
                    type: 'attendance_alert'
                });
            
            if (error) {
                console.error('Error creating teacher notification:', error);
            }
        }
    } catch (error) {
        console.error('Error in notifyTeacher:', error);
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

// ============================================================================
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

// FIX: Unlock browser audio context so the Beep/Buzzer works on the first scan!
document.body.addEventListener('click', () => {
    try {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
            console.log("Audio Engine Unlocked");
        }
    } catch (e) {
        // Ignore errors if audio is already unlocked
    }
}, { once: true });

// Stop scanner when page unloads
window.addEventListener('beforeunload', () => {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }
});

