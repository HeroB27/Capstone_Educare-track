// teacher/teacher-gatekeeper-mode.js - jsQR Implementation

// Ensure teacher is logged in and has gatekeeper rights
var currentUser = window.currentUser || checkSession('teachers');
if (!currentUser || !currentUser.is_gatekeeper) {
    // Use custom toast for early message before core loads
    if (typeof showNotification === 'function') showNotification("Unauthorized Access. Redirecting to dashboard.", 'error');
    else alert("Unauthorized Access. Redirecting to dashboard.");
    setTimeout(() => {
        window.location.href = 'teacher-dashboard.html';
    }, 2000);
}

// Global variables for scanner logic
let videoStream = null;
let video = null;
let canvas = null;
let canvasContext = null;
let animationFrameId = null;
const scanCooldowns = new Map(); // Map<studentId, timestamp>
const ANTI_DUPLICATE_THRESHOLD = 120000; // 2 minutes (Fix #4)
let lastToastTime = 0; // Global debounce tracker for toast notifications

// UPDATED: Standardized QR format - EDU-YYYY-LLLL-XXXX (accepts 4-6 char suffix for backward compatibility)
const SCAN_REGEX = /^EDU-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4,6}$/i;

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    initializeTeacherName(); // UPDATED: Initialize teacher name display for Phase 1
    initializeDateTime();
    initializeScanner();
});

// UPDATED: Initialize teacher name display - Phase 1 Task 1.3
function initializeTeacherName() {
    const teacherNameEl = document.getElementById('teacher-name-display');
    if (teacherNameEl && currentUser) {
        teacherNameEl.textContent = currentUser.full_name || 'Teacher';
    }
}

// Initialize date and time display
function initializeDateTime() {
    const timeEl = document.getElementById('current-time');
    const dateEl = document.getElementById('current-date');
    
    function updateTime() {
        const now = new Date();
        if (timeEl) timeEl.innerText = now.toLocaleTimeString('en-US');
        if (dateEl) dateEl.innerText = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
    
    updateTime();
    setInterval(updateTime, 1000);
}

// Initialize the QR code scanner with jsQR
function initializeScanner() {
    if (typeof jsQR === 'undefined') {
        console.error("jsQR library not loaded.");
        const statusIndicator = document.getElementById('status-indicator');
        if (statusIndicator) {
            statusIndicator.innerHTML = `<p class="text-red-400">Error: QR scanner library not loaded. Please refresh the page.</p>`;
        }
        return;
    }

    const readerElement = document.getElementById('qr-reader');
    if (!readerElement) {
        console.error('Reader element not found');
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
        const statusIndicator = document.getElementById('status-indicator');
        if (statusIndicator) {
            statusIndicator.innerHTML = `<p class="text-red-400">Error starting camera. Please allow camera access.</p>`;
        }
    }
}

/**
 * Scan each video frame for QR codes
 */
function scanFrame() {
    // FIXED: Correct frame-ready check
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
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
            handleQRDetection(code.data);
        }
    }
    
    // Continue scanning
    animationFrameId = requestAnimationFrame(scanFrame);
}

/**
 * Handle QR code detection
 * @param {string} decodedText - The scanned QR code data
 */
function handleQRDetection(decodedText) {
    const now = Date.now();

    // Validate QR code format first
    if (!validateStudentId(decodedText)) {
        if (now - lastToastTime > 3000) { // Strict 3-second debounce
            showNotification('Invalid QR Code format. Please scan a valid ID.', 'error');
            lastToastTime = now;
        }
        return;
    }
    
    // Robust Duplicate Scan Prevention
    if (scanCooldowns.has(decodedText)) {
        const lastTime = scanCooldowns.get(decodedText);
        if (now - lastTime < ANTI_DUPLICATE_THRESHOLD) {
            if (now - lastToastTime > 3000) { // Strict 3-second debounce
                 showNotification('Duplicate scan detected - student already processed.', 'warning');
                 lastToastTime = now;
            }
            return;
        }
    }
    
    scanCooldowns.set(decodedText, now);
    processScan(decodedText);
}

// Main logic to process a scan
async function processScan(studentIdText) {
    const statusIndicator = document.getElementById('status-indicator');
    statusIndicator.innerHTML = `<p class="text-sm text-yellow-300">Processing: ${studentIdText}</p>`;
    
    try {
        // ==========================================
        // SMART GATE PROTOCOL CHECK
        // ==========================================
        // Evaluate gate status BEFORE processing student lookup
        const gateStatus = await window.evaluateGateStatus();
        
        // Update UI to show emergency mode if applicable
        if (!gateStatus.allowEntry) {
            statusIndicator.innerHTML = `<span class="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold animate-pulse">${gateStatus.message}</span>`;
        }
        
        // Check if gate is completely closed (Campus Closed)
        if (!gateStatus.active) {
            showNotification(gateStatus.message, 'error');
            return;
        }
        
        // ==========================================
        // END SMART GATE PROTOCOL CHECK
        // ==========================================

        // 1. Check if today is a holiday/suspended day
        // UPDATED: Now checks time_coverage for half-day suspensions
        // UPDATED: Use unmutated date for accurate hour checking (fixes timezone bug)
        const nowHourTracker = new Date(); // Unmutated date for accurate hour checking
        const localDate = new Date();
        localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
        const today = localDate.toISOString().split('T')[0];
        
        const holidayCheck = await checkIsHoliday(today);
        const currentHour = nowHourTracker.getHours(); // Safe, unmutated hour
        
        if (holidayCheck.isHoliday && holidayCheck.isSuspended) {
            // Check for half-day suspensions
            if (holidayCheck.timeCoverage === 'Morning' && currentHour >= 12) {
                // Afternoon only - morning scans allowed
                console.log('[processScan] Morning suspension - afternoon entry allowed');
            } else if (holidayCheck.timeCoverage === 'Afternoon' && currentHour < 12) {
                // Morning only - afternoon scans allowed
                console.log('[processScan] Afternoon suspension - morning entry allowed');
            } else if (holidayCheck.timeCoverage === 'Full Day' || !holidayCheck.timeCoverage) {
                // Full day suspension - block all
                showNotification(`School is suspended today: ${holidayCheck.description || 'Full Day Suspension'}`, 'error');
                return;
            } else {
                showNotification(`School is suspended today: ${holidayCheck.description || 'Full Day Suspension'}`, 'error');
                return;
            }
        }

        const { data: student, error: studentError } = await supabase
            .from('students')
            .select('id, full_name, student_id_text, qr_code_data, class_id, parent_id, status, classes(grade_level, department)')
            .eq('student_id_text', studentIdText)
            .single();
        
        // If not found by student_id_text, try qr_code_data
        let studentData = student;
        if (studentError || !studentData) {
            const { data: qrStudent, error: qrError } = await supabase
                .from('students')
                .select('id, full_name, student_id_text, qr_code_data, class_id, parent_id, status, classes(grade_level, department)')
                .eq('qr_code_data', studentIdText)
                .single();
            
            if (!qrError && qrStudent) {
                studentData = qrStudent;
            }
        }

        // Fix #1: Fallback ID Extraction (if full string fails)
        // Extracts 'A1B2' from 'EDU-2026-G001-A1B2'
        if (!studentData && SCAN_REGEX.test(studentIdText)) {
            const parts = studentIdText.split('-');
            if (parts.length >= 4) {
                const extractedId = parts[3];
                const { data: extractedStudent } = await supabase
                    .from('students')
                    .select('id, full_name, student_id_text, qr_code_data, class_id, parent_id, status, classes(grade_level, department)')
                    .eq('student_id_text', extractedId)
                    .single();
                if (extractedStudent) studentData = extractedStudent;
            }
        }
        
        if (!studentData) {
            throw new Error('Student not found. Please check the ID.');
        }
        
        // Check if student is active/enrolled - reject dropped/inactive students
        if (studentData.status === 'Dropped' || studentData.status === 'Inactive') {
            throw new Error('Student record is not active. Cannot scan.');
        }
        
        // Process the scan (entry/exit logic) - get the result
        const scanResult = await handleAttendanceScan(studentData);
        
        // Show success
        const gradeLevel = studentData.classes?.grade_level || 'N/A';
        const section = studentData.classes?.department || '';
        
        statusIndicator.innerHTML = `<p class="text-green-300">Success! ${studentData.full_name}</p>`;
        
        // Update UI
        document.getElementById('last-scan').classList.remove('hidden');
        document.getElementById('scan-student-name').innerText = studentData.full_name;
        document.getElementById('scan-grade-level').innerText = `${gradeLevel} - ${section}`;
        document.getElementById('scan-time').innerText = new Date().toLocaleTimeString();
        document.getElementById('scan-status').innerText = scanResult.status;
        
        const actionBadge = document.getElementById('scan-action');
        actionBadge.innerText = scanResult.direction;
        actionBadge.className = `px-3 py-1 rounded-full text-xs font-bold uppercase ${scanResult.direction === 'ENTRY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`;

        // Play Audio - safe version that fails silently if file is missing
        try {
            let audio = new Audio('../assets/sounds/success.mp3');
            audio.play().catch(() => {}); // Fails silently if file is missing
        } catch (err) {}
        
        // Create parent notification for all events
        await createParentNotification(studentData, scanResult.direction, scanResult.status);
        
        // Create teacher notification for special cases (Late, Early Exit, Late Exit)
        if (scanResult.status === 'Late' || scanResult.status === 'Early Exit' || scanResult.status === 'Late Exit') {
            await notifyTeacherFromTeacherModule(studentData, scanResult.direction, scanResult.status);
        }
        
    } catch (error) {
        console.error('Scan error:', error);
        statusIndicator.innerHTML = `<p class="text-red-300">Error: ${error.message}</p>`;
        document.getElementById('last-scan').classList.remove('hidden');
        document.getElementById('scan-student-name').innerText = 'Error';
        document.getElementById('scan-grade-level').innerText = error.message;
        
        // Play error audio - safe version that fails silently if file is missing
        try {
            let audio = new Audio('../assets/sounds/error.mp3');
            audio.play().catch(() => {}); // Fails silently if file is missing
        } catch (err) {}
    }
}

// Handle attendance scan logic
async function handleAttendanceScan(student) {
    // ==========================================
    // SMART GATE DIRECTIONAL CHECK
    // ==========================================
    const gateStatus = await window.evaluateGateStatus();
    
    // Get current direction before processing
    const checkDate = new Date();
    checkDate.setMinutes(checkDate.getMinutes() - checkDate.getTimezoneOffset());
    const checkDateStr = checkDate.toISOString().split('T')[0];
    
    // Check existing log to determine direction
    const { data: priorLog } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('student_id', student.id)
        .eq('log_date', checkDateStr)
        .order('time_in', { ascending: false })
        .limit(1)
        .maybeSingle();
    
    const isEmergencyExitOnly = !gateStatus.allowEntry;
    
    // If emergency mode is active and this would be an ENTRY, block it
    if (isEmergencyExitOnly && (!priorLog || (priorLog.time_in && priorLog.time_out))) {
        throw new Error(`ENTRY DENIED: ${gateStatus.message}`);
    }
    // ==========================================
    // END SMART GATE DIRECTIONAL CHECK
    // ==========================================

    const now = new Date();
    const currentTime = now.toTimeString().split(' ')[0].substring(0, 5);
    
    // Get grade level for threshold calculation
    const gradeLevel = student.classes?.grade_level || null;
    
    // Check existing log for today - reuse priorLog if available, otherwise fetch
    const existingLog = priorLog || await supabase
        .from('attendance_logs')
        .select('*')
        .eq('student_id', student.id)
        .eq('log_date', checkDateStr)
        .order('time_in', { ascending: false })
        .limit(1)
        .then(r => r.data);
    
    let status = 'On Time';
    let direction = 'ENTRY';
    
    // Determine if late
    if (existingLog?.time_in && !existingLog.time_out) {
        // Student is already on campus - this is an exit
        direction = 'EXIT';

        // FIX: Implement "Morning Lock" to prevent accidental exits.
        // Exits are disabled before 10:00 AM unless authorized.
        const MORNING_LOCK_UNTIL_HOUR = 10;
        if (now.getHours() < MORNING_LOCK_UNTIL_HOUR) {
            throw new Error('Exit scans are disabled during morning entry hours.');
        }

        // Fix #2: Calculate Exit Status (Early vs Late vs Normal)
        const dismissalTime = await getDismissalTime(gradeLevel);
        let exitStatus = 'Normal Exit';

        if (isEarlyExit(currentTime, dismissalTime)) {
            exitStatus = 'Early Exit';
        } else if (isLateExit(currentTime, dismissalTime)) {
            exitStatus = 'Late Exit';
        }

        await supabase
            .from('attendance_logs')
            .update({ time_out: now.toISOString(), status: exitStatus })
            .eq('id', existingLog.id);
        
        status = exitStatus; // Update for notifications
    } else {
        // New entry - check if late
        const lateThreshold = await getLateThreshold(gradeLevel);
        if (compareTimes(currentTime, lateThreshold) > 0) {
            status = 'Late';
        }
        
        await supabase
            .from('attendance_logs')
            .insert({
                student_id: student.id,
                log_date: checkDateStr,
                time_in: now.toISOString(),
                status: status
            });
    }
    
    // Return direction and status for notifications
    return { direction, status };
}

/**
 * Create notification for parent about scan (Teacher Module)
 */
async function createParentNotification(student, direction, status) {
    try {
        if (!student.parent_id) {
            console.warn('Cannot create notification: no parent_id');
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
            console.error('Error creating parent notification:', error);
        }
    } catch (error) {
        console.error('Error in createParentNotification:', error);
    }
}

/**
 * Create notification for teacher about special attendance events (Teacher Module)
 */
async function notifyTeacherFromTeacherModule(student, direction, status) {
    try {
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
        
        const gradeLevel = student.classes?.grade_level || 'Unknown';
        const section = student.classes?.department || '';
        
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
        console.error('Error in notifyTeacherFromTeacherModule:', error);
    }
}

// Get late threshold for grade level
async function getLateThreshold(gradeLevel) {
    // FIX: Use the centralized getLateThreshold function from general-core.js
    // This ensures it respects the global settings configured by the admin.
    if (typeof window.getLateThreshold === 'function') {
        return await window.getLateThreshold(gradeLevel);
    }
    // Fallback if core function is not available
    return '08:00';
}

// Get dismissal time for grade level
async function getDismissalTime(gradeLevel) {
    // FIX: Use the centralized getDismissalTime function from general-core.js
    if (typeof window.getDismissalTime === 'function') {
        return window.getDismissalTime(gradeLevel);
    }
    // Fallback
    return '15:00';
}

// Compare times in HH:MM format (properly handles string comparison)
function compareTimes(time1, time2) {
    // Convert HH:MM to minutes for proper comparison
    const toMinutes = (time) => {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    };
    
    const mins1 = toMinutes(time1);
    const mins2 = toMinutes(time2);
    
    return mins1 - mins2; // Returns negative if time1 < time2
}

// Check if student is late
function isLate(scanTime, gradeLevel, threshold) {
    // threshold should be in HH:MM format
    return compareTimes(scanTime, threshold) > 0;
}

// Check if student is leaving early
function isEarlyExit(scanTime, dismissalTime) {
    // If scan time is before dismissal time, it's early exit
    return compareTimes(scanTime, dismissalTime) < 0;
}

// Fix #2: Check if student is leaving late (30 mins after dismissal)
function isLateExit(scanTime, dismissalTime) {
    // Returns true if scanTime > dismissalTime + 30 mins
    return compareTimes(scanTime, dismissalTime) > 30;
}

// Additional: Validate student ID format before database query
function validateStudentId(studentId) {
    if (!studentId || typeof studentId !== 'string') {
        return false;
    }
    
    // Validate format: EDU-YYYY-LLLL-XXXX (XXXX can be 4-6 chars)
    return SCAN_REGEX.test(studentId.trim());
}

// Fix #12: Missing Holiday Check Function
// UPDATED: Now includes time_coverage for half-day suspension support
async function checkIsHoliday(dateStr) {
    try {
        const { data, error } = await supabase
            .from('holidays')
            .select('holiday_date, is_suspended, description, time_coverage')
            .eq('holiday_date', dateStr)
            .single();
        
        if (data && data.is_suspended) {
            // Map time_coverage to return value
            let timeCoverage = null;
            if (data.time_coverage === 'Morning Only') {
                timeCoverage = 'Morning';
            } else if (data.time_coverage === 'Afternoon Only') {
                timeCoverage = 'Afternoon';
            } else if (data.time_coverage === 'Full Day') {
                timeCoverage = 'Full Day';
            }
            
            return { 
                isHoliday: true, 
                isSuspended: true, 
                description: data.description,
                timeCoverage: timeCoverage
            };
        }
        return { isHoliday: false, isSuspended: false, timeCoverage: null };
    } catch (e) {
        return { isHoliday: false, isSuspended: false, timeCoverage: null };
    }
}

// FIX: Unlock browser audio context for scanner beeps
document.body.addEventListener('click', () => {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    } catch (e) {
        // Audio not supported or already unlocked
    }
}, { once: true }); // Only runs once per page load

// Stop scanner when page unloads
window.addEventListener('beforeunload', () => {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }
});

// ==========================================
// MANUAL ENTRY LOGIC
// ==========================================
window.showManualEntry = function() {
    document.getElementById('manual-entry-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('manual-student-id').focus(), 100);
};

window.closeManualEntry = function() {
    document.getElementById('manual-entry-modal').classList.add('hidden');
    document.getElementById('manual-student-id').value = '';
};

window.submitManualEntry = function() {
    const input = document.getElementById('manual-student-id');
    const studentIdText = input.value.trim().toUpperCase(); // e.g. EDU-2026-G001-A1B2
    
    if (!studentIdText) {
        showNotification("Please enter a Student ID", "error");
        return;
    }
    
    closeManualEntry();
    handleQRDetection(studentIdText); // Pass it to the exact same pipeline as the camera
};

// Allow pressing Enter in the manual input field
document.addEventListener('DOMContentLoaded', () => {
    const manualInput = document.getElementById('manual-student-id');
    if (manualInput) {
        manualInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitManualEntry();
        });
    }
});