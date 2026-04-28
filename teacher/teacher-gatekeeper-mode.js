// teacher-gatekeeper-mode.js - Complete scanner for gatekeeper teachers

var currentUser = window.currentUser || checkSession('teachers');
if (!currentUser || !currentUser.is_gatekeeper) {
    if (typeof showNotification === 'function') showNotification("Unauthorized Access. Redirecting to dashboard.", 'error');
    else alert("Unauthorized Access. Redirecting to dashboard.");
    setTimeout(() => { window.location.href = 'teacher-dashboard.html'; }, 2000);
}

// Feature flag for attendance summary sync (rollback safe)
const ENABLE_SUMMARY_SYNC = true;

// ============================================================================
// GLOBAL VARIABLES & FALLBACKS
// ============================================================================
let videoStream = null;
let video = null;
let canvas = null;
let canvasContext = null;
let animationFrameId = null;
let lastScanTime = 0;
const ANTI_DUPLICATE_THRESHOLD = 5000; // 5 seconds - optimized for faster scanning
const SCAN_REGEX = /^EDU-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4,6}$/i;
const scanCooldowns = new Map();
let manualAttendanceMode = false; // FIXED: Handle manual attendance during scanner downtime
// Cache for performance - reduce database calls
let gateStatusCache = { status: null, timestamp: 0 };
const GATE_STATUS_CACHE_TTL = 30000; // 30 seconds cache for gate status

if (typeof window.getLateThreshold !== 'function') {
    window.getLateThreshold = async function(gradeLevel) { return '08:00'; };
}
if (typeof window.getDismissalTime !== 'function') {
    window.getDismissalTime = function(gradeLevel) { return '15:00'; };
}

// Attendance status constants
const STATUS = window.ATTENDANCE_STATUS || {
    PRESENT: 'Present', ON_TIME: 'Present', LATE: 'Late', ABSENT: 'Absent',
    EXCUSED: 'Excused', EXCUSED_ABSENT: 'Excused Absent',
    NORMAL_EXIT: 'Normal Exit', EARLY_EXIT: 'Early Exit', LATE_EXIT: 'Late Exit',
    RE_ENTRY: 'Re-entry', LATE_RE_ENTRY: 'Late Re-entry',
    MEDICAL_EXIT: 'Medical Exit', EARLY_EXIT_AUTH: 'Early Exit (Authorised)',
    NA: 'N/A'
};

// ==========================================
// PERFORMANCE: Cached gate status (reduce DB calls)
// ==========================================
async function getCachedGateStatus() {
    const now = Date.now();
    if (gateStatusCache.status && (now - gateStatusCache.timestamp) < GATE_STATUS_CACHE_TTL) {
        return gateStatusCache.status;
    }
    try {
        gateStatusCache.status = await window.evaluateGateStatus();
        gateStatusCache.timestamp = now;
    } catch (e) {
        gateStatusCache.status = { active: true, allowEntry: true, message: 'Gate Open' };
    }
    return gateStatusCache.status;
}

function clearGateStatusCache() {
    gateStatusCache = { status: null, timestamp: 0 };
}

// ============================================================================
// MANUAL ATTENDANCE MODE (handle teacher manual entry during scanner downtime)
// ============================================================================
function toggleManualAttendanceMode() {
    manualAttendanceMode = !manualAttendanceMode;
    const indicator = document.getElementById('manual-mode-indicator');
    if (indicator) {
        if (manualAttendanceMode) {
            indicator.classList.remove('hidden');
            indicator.innerHTML = '<span class="bg-amber-500 text-white px-3 py-1 rounded-full text-xs font-bold">MANUAL ENTRY MODE</span>';
        } else {
            indicator.classList.add('hidden');
        }
    }
    showToast(manualAttendanceMode ? 'Manual Entry Mode: ON (next scans = EXIT)' : 'Manual Entry Mode: OFF', 'success');
}

// Initialize manual mode indicator on page load
function initManualModeIndicator() {
    const header = document.querySelector('.header') || document.querySelector('header') || document.querySelector('.bg-gray-800');
    if (header && !document.getElementById('manual-mode-indicator')) {
        const indicator = document.createElement('div');
        indicator.id = 'manual-mode-indicator';
        indicator.className = 'hidden';
        header.appendChild(indicator);
    }
    const toggleBtn = document.getElementById('manual-mode-toggle');
    if (!toggleBtn) {
        const container = document.querySelector('.controls') || document.querySelector('.scan-controls');
        if (container) {
            const btn = document.createElement('button');
            btn.id = 'manual-mode-toggle';
            btn.className = 'bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 rounded-lg text-sm font-semibold';
            btn.innerText = 'Toggle Manual Entry';
            btn.onclick = toggleManualAttendanceMode;
            container.appendChild(btn);
        }
    }
}

// ============================================================================
// TOAST NOTIFICATION (non-blocking)
// ============================================================================
function showToast(message, type = 'error') {
    const toastId = type === 'error' ? 'toast-error' : 'toast-success';
    let toast = document.getElementById(toastId);
    if (!toast) {
        toast = document.createElement('div');
        toast.id = toastId;
        toast.className = `fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-2xl transform transition-all duration-300 translate-y-24 opacity-0 flex items-center gap-3 ${type === 'error' ? 'bg-red-600' : 'bg-green-600'} text-white z-50`;
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove('translate-y-24', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    setTimeout(() => {
        toast.classList.add('translate-y-24', 'opacity-0');
    }, 3000);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function getLocalISOString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function checkIsHoliday(dateStr, gradeLevel = null) {
    try {
        const { data, error } = await supabase
            .from('holidays')
            .select('description, is_suspended, target_grades, time_coverage')
            .eq('holiday_date', dateStr)
            .maybeSingle();
        if (error || !data) return { isHoliday: false, isSuspended: false };
        let isSuspended = data.is_suspended === true;
        if (isSuspended && data.target_grades && data.target_grades !== 'All' && gradeLevel) {
            const affected = data.target_grades.split(',').map(g => g.trim().toUpperCase());
            const studentGrade = gradeLevel.toString().toUpperCase();
            if (!affected.includes(studentGrade)) isSuspended = false;
        }
        let timeCoverage = 'Full Day';
        if (data.time_coverage === 'Morning Only' || data.time_coverage === 'Morning') timeCoverage = 'Morning';
        else if (data.time_coverage === 'Afternoon Only' || data.time_coverage === 'Afternoon') timeCoverage = 'Afternoon';
        return { isHoliday: true, isSuspended, description: data.description, timeCoverage };
    } catch (e) { return { isHoliday: false, isSuspended: false }; }
}

// Check if today is a weekend (Saturday or Sunday)
function isWeekend(dateStr = null) {
    const date = dateStr ? new Date(dateStr) : new Date();
    const day = date.getDay(); // 0 = Sunday, 6 = Saturday
    return day === 0 || day === 6;
}

// Check suspensions table for active suspensions
async function checkSuspension(gradeLevel = null) {
    try {
        const localDate = new Date();
        localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
        const todayStr = localDate.toISOString().split('T')[0];
        const dayOfWeek = localDate.getDay();
        
        // Check if weekend (Saturday or Sunday)
        if (dayOfWeek === 0) return { isSuspended: true, type: 'weekend', message: 'CAMPUS CLOSED (Sunday)' };
        if (dayOfWeek === 6) return { isSuspended: true, type: 'weekend', message: 'CAMPUS CLOSED (Saturday)' };
        
        // Check suspensions table for pre-planned suspensions
        const { data: suspensions, error } = await supabase
            .from('suspensions')
            .select('title, description, start_date, end_date, suspension_type, affected_grades, saturday_enabled')
            .eq('is_active', true)
            .lte('start_date', todayStr)
            .gte('end_date', todayStr);
        
        if (error) throw error;
        
        if (suspensions && suspensions.length > 0) {
            const sus = suspensions[0];
            
            // Check if this suspension applies to the student's grade
            if (gradeLevel && sus.affected_grades && Array.isArray(sus.affected_grades) && sus.affected_grades.length > 0) {
                const affectedGrades = sus.affected_grades.map(g => g.toString().toUpperCase());
                const studentGrade = gradeLevel.toString().toUpperCase();
                if (!affectedGrades.includes(studentGrade)) {
                    return { isSuspended: false, type: null, message: null };
                }
            }
            
            // Check if it's a half-day suspension
            let timeCoverage = 'Full Day';
            if (sus.suspension_type) {
                const typeLower = sus.suspension_type.toLowerCase();
                if (typeLower.includes('morning')) timeCoverage = 'Morning';
                else if (typeLower.includes('afternoon')) timeCoverage = 'Afternoon';
            }
            
            return {
                isSuspended: true,
                type: 'suspension',
                message: sus.title,
                description: sus.description,
                timeCoverage: timeCoverage
            };
        }
        
        return { isSuspended: false, type: null, message: null };
    } catch (e) {
        console.error('Error checking suspension:', e);
        return { isSuspended: false, type: null, message: null };
    }
}

function compareTimes(time1, time2) {
    const [h1,m1] = time1.split(':').map(Number);
    const [h2,m2] = time2.split(':').map(Number);
    return (h1*60+m1) - (h2*60+m2);
}

function isLate(scanTime, threshold) { return compareTimes(scanTime, threshold) > 0; }
function isEarlyExit(scanTime, dismissal) { return compareTimes(scanTime, dismissal) < 0; }
function isLateExit(scanTime, dismissal) { return compareTimes(scanTime, dismissal) > 30; }

// ============================================================================
// USB BARCODE SCANNER SUPPORT
// ============================================================================
function setupUsbScanner() {
    let hiddenInput = document.getElementById('usb-scanner-input');
    if (!hiddenInput) {
        hiddenInput = document.createElement('input');
        hiddenInput.type = 'text';
        hiddenInput.id = 'usb-scanner-input';
        hiddenInput.style.position = 'fixed';
        hiddenInput.style.top = '-100px';
        hiddenInput.style.left = '-100px';
        hiddenInput.style.opacity = '0';
        document.body.appendChild(hiddenInput);
    }
    const inputElem = document.getElementById('usb-scanner-input');
    function keepFocus() { inputElem.focus(); }
    inputElem.addEventListener('input', (e) => {
        let val = e.target.value.trim();
        if (val && (val.endsWith('\n') || SCAN_REGEX.test(val))) {
            val = val.replace('\n', '').trim();
            onScanSuccess(val);
            inputElem.value = '';
        }
    });
    inputElem.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const val = inputElem.value.trim();
            if (val && SCAN_REGEX.test(val)) onScanSuccess(val);
            inputElem.value = '';
        }
    });
    inputElem.addEventListener('blur', keepFocus);
    document.addEventListener('click', keepFocus);
    keepFocus();
}

// ============================================================================
// CAMERA SCANNER (jsQR)
// ============================================================================
function startCameraScanner() {
    const readerDiv = document.getElementById('qr-reader');
    if (!readerDiv) {
        console.error('No element with id="qr-reader"');
        showToast('Scanner container missing', 'error');
        return;
    }
    if (typeof jsQR === 'undefined') {
        console.error('jsQR library not loaded');
        showToast('QR library not loaded. Please refresh.', 'error');
        return;
    }

    // Clean up any existing stream or animation
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    readerDiv.innerHTML = '';

    video = document.createElement('video');
    video.setAttribute('playsinline', 'true');
    video.setAttribute('autoplay', 'true');
    video.muted = true;
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';

    canvas = document.createElement('canvas');
    canvasContext = canvas.getContext('2d', { willReadFrequently: true });

    readerDiv.appendChild(video);

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
            videoStream = stream;
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                video.play()
                    .then(() => {
                        setTimeout(() => {
                            if (video.videoWidth && video.videoHeight) {
                                canvas.width = video.videoWidth;
                                canvas.height = video.videoHeight;
                                console.log(`Camera ready: ${canvas.width}x${canvas.height}`);
                                scanFrame();
                            } else {
                                console.error('Video dimensions zero');
                                showToast('Camera error: no video dimensions', 'error');
                            }
                        }, 100);
                    })
                    .catch(err => {
                        console.error('Video play failed:', err);
                        showToast('Cannot play video stream', 'error');
                    });
            };
            video.onerror = (err) => {
                console.error('Video error:', err);
                showToast('Video stream error', 'error');
            };
        })
        .catch(err => {
            console.error('Camera permission error:', err);
            showToast('Cannot access camera. Please allow permissions.', 'error');
        });
}

function scanFrame() {
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
        animationFrameId = requestAnimationFrame(scanFrame);
        return;
    }
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }
    canvasContext.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = canvasContext.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    if (code) {
        const now = Date.now();
        if (now - lastScanTime > ANTI_DUPLICATE_THRESHOLD) {
            lastScanTime = now;
            onScanSuccess(code.data);
        }
    }
    animationFrameId = requestAnimationFrame(scanFrame);
}

function initializeScanner() {
    setupUsbScanner();
    const startBtn = document.getElementById('start-scanner-btn');
    const overlay = document.getElementById('start-overlay');
    if (startBtn && overlay) {
        // Clone to remove any existing listeners
        const newBtn = startBtn.cloneNode(true);
        startBtn.parentNode.replaceChild(newBtn, startBtn);
        newBtn.onclick = () => {
            overlay.classList.add('hidden');
            startCameraScanner();
        };
    } else {
        startCameraScanner();
    }
}

// ============================================================================
// MAIN SCAN PROCESSING
// ============================================================================

// Show scanning loading indicator
function showScanningLoading() {
    const statusIndicator = document.getElementById('status-indicator');
    if (statusIndicator) {
        statusIndicator.innerHTML = `<span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold animate-pulse">Scanning...</span>`;
    }
}

// Hide scanning loading indicator
function hideScanningLoading() {
    const statusIndicator = document.getElementById('status-indicator');
    if (statusIndicator) {
        statusIndicator.innerHTML = '';
    }
}

async function onScanSuccess(decodedText) {
    const now = Date.now();
    if (scanCooldowns.has(decodedText) && (now - scanCooldowns.get(decodedText)) < ANTI_DUPLICATE_THRESHOLD) {
        showToast('Duplicate scan detected', 'warning');
        return;
    }
    scanCooldowns.set(decodedText, now);
    if (!SCAN_REGEX.test(decodedText)) { showToast('Invalid QR format', 'error'); return; }
    showScanningLoading();
    try {
        await processScan(decodedText);
    } finally {
        // Loading will be hidden when scan result is displayed
    }
}

async function processScan(studentIdText) {
    const statusIndicator = document.getElementById('status-indicator');
    if (statusIndicator) statusIndicator.innerHTML = `<p class="text-sm text-yellow-300">Processing: ${studentIdText}</p>`;
    try {
        const gateStatus = await window.evaluateGateStatus();
        if (!gateStatus.allowEntry) {
            if (statusIndicator) statusIndicator.innerHTML = `<span class="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold animate-pulse">${gateStatus.message}</span>`;
        }
        if (!gateStatus.active) { showToast(gateStatus.message, 'error'); return; }

        const today = getLocalISOString();
        const student = await fetchStudentByQR(studentIdText);
        if (!student) throw new Error('Student not found.');
        if (student.status !== 'Enrolled') throw new Error('Student record is not active.');

        const gradeLevel = student.classes?.grade_level || null;
        
        // FIRST: Check if today is a weekend (Saturday/Sunday)
        if (isWeekend(today)) {
            showToast('No classes today (Weekend)', 'error');
            return;
        }
        
        // ADDED: Check if today is within school year - 2026-04-20
        const schoolYearCheck = await window.isTodayWithinSchoolYear();
        if (!schoolYearCheck.valid) {
            showToast(`Gate Closed: ${schoolYearCheck.message}`, 'error');
            return;
        }
        
        // SECOND: Check suspensions table for school suspensions
        const suspensionCheck = await checkSuspension(gradeLevel);
        if (suspensionCheck.isSuspended && suspensionCheck.type === 'weekend') {
            showToast(suspensionCheck.message, 'error');
            return;
        }
        if (suspensionCheck.isSuspended && suspensionCheck.type === 'suspension') {
            const hour = new Date().getHours();
            if (!(suspensionCheck.timeCoverage === 'Morning' && hour >= 12) && 
                !(suspensionCheck.timeCoverage === 'Afternoon' && hour < 12)) {
                showToast(`School suspended: ${suspensionCheck.message}`, 'error');
                return;
            }
        }
        
        // THIRD: Check holidays table for holidays/suspensions
        const holidayCheck = await checkIsHoliday(today, gradeLevel);
        const hour = new Date().getHours();
        if (holidayCheck.isHoliday && holidayCheck.isSuspended) {
            if (!(holidayCheck.timeCoverage === 'Morning' && hour >= 12) && 
                !(holidayCheck.timeCoverage === 'Afternoon' && hour < 12)) {
                showToast(`School suspended: ${holidayCheck.description}`, 'error');
                return;
            }
        }

        const scanResult = await handleAttendanceScan(student);
        const gradeDisplay = student.classes?.grade_level || 'N/A';
        const section = student.classes?.department || '';
        // Clear scanning loading and show success
        hideScanningLoading();
        if (statusIndicator) statusIndicator.innerHTML = `<p class="text-green-300">Success! ${student.full_name}</p>`;

        const lastScanDiv = document.getElementById('last-scan');
        if (lastScanDiv) lastScanDiv.classList.remove('hidden');
        const nameEl = document.getElementById('scan-student-name');
        if (nameEl) nameEl.innerText = student.full_name;
        const gradeEl = document.getElementById('scan-grade-level');
        if (gradeEl) gradeEl.innerText = `${gradeDisplay} - ${section}`;
        const timeEl = document.getElementById('scan-time');
        if (timeEl) timeEl.innerText = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
        const statusEl = document.getElementById('scan-status');
        if (statusEl) statusEl.innerText = scanResult.status;
        const actionBadge = document.getElementById('scan-action');
        if (actionBadge) {
            actionBadge.innerText = scanResult.direction;
            actionBadge.className = `px-3 py-1 rounded-full text-xs font-bold uppercase ${scanResult.direction === 'ENTRY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`;
        }

        try { new Audio('../assets/sounds/success.mp3').play().catch(()=>{}); } catch(e) {}
        await createParentNotification(student, scanResult.direction, scanResult.status);
        if (['Late','Early Exit','Late Exit'].includes(scanResult.status)) {
            await notifyTeacherFromTeacherModule(student, scanResult.direction, scanResult.status);
        }
    } catch (error) {
        console.error('Scan error:', error);
        hideScanningLoading(); // Clear loading on error
        if (statusIndicator) statusIndicator.innerHTML = `<p class="text-red-300">Error: ${error.message}</p>`;
        const lastScanDiv = document.getElementById('last-scan');
        if (lastScanDiv) lastScanDiv.classList.remove('hidden');
        const nameEl = document.getElementById('scan-student-name');
        if (nameEl) nameEl.innerText = 'Error';
        const gradeEl = document.getElementById('scan-grade-level');
        if (gradeEl) gradeEl.innerText = error.message;
        showToast(error.message, 'error');
        try { new Audio('../assets/sounds/error.mp3').play().catch(()=>{}); } catch(e) {}
    }
}

async function fetchStudentByQR(studentIdText) {
    let { data } = await supabase
        .from('students')
        .select('id, full_name, student_id_text, qr_code_data, class_id, parent_id, status, classes(grade_level, department)')
        .eq('student_id_text', studentIdText)
        .single();
    if (!data) {
        const { data: qrData } = await supabase.from('students').select('*').eq('qr_code_data', studentIdText).single();
        if (qrData) data = qrData;
    }
    if (!data && SCAN_REGEX.test(studentIdText)) {
        const parts = studentIdText.split('-');
        if (parts.length >= 4) {
            const extracted = parts[3];
            const { data: extData } = await supabase.from('students').select('*').eq('student_id_text', extracted).single();
            if (extData) data = extData;
        }
    }
    return data;
}

async function handleAttendanceScan(student) {
    // OPTIMIZED: Use cached gate status instead of fetching every time
    const gateStatus = await getCachedGateStatus();
    const checkDate = new Date();
    checkDate.setMinutes(checkDate.getMinutes() - checkDate.getTimezoneOffset());
    const dateStr = checkDate.toISOString().split('T')[0];
    
    // OPTIMIZED: Fetch prior log - single query is sufficient
    const { data: priorLog } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('student_id', student.id)
        .eq('log_date', dateStr)
        .order('time_in', { ascending: false })
        .limit(1)
        .maybeSingle();
    const isEmergencyExitOnly = !gateStatus.allowEntry;
    if (isEmergencyExitOnly && (!priorLog || (priorLog.time_in && priorLog.time_out))) {
        throw new Error(`ENTRY DENIED: ${gateStatus.message}`);
    }
    const now = new Date();
    const currentHour = now.getHours();
    const currentTime = now.toTimeString().split(' ')[0].substring(0,5);
    const gradeLevel = student.classes?.grade_level || null;
    let status = STATUS.ON_TIME;
    // FIXED: Handle manual attendance during scanner downtime
    let direction = 'ENTRY';
    if (manualAttendanceMode) {
        // Manual mode: always treat as EXIT (teacher already logged entry manually)
        direction = 'EXIT';
    } else {
        // Normal mode: use standard logic
        if (priorLog?.time_in && !priorLog.time_out) {
            direction = 'EXIT';
        }
    }
    if (direction === 'EXIT') {
        // FIXED: Block exits only during morning entry hours (before 9 AM)
        if (currentHour < 9) throw new Error('Exit scans disabled during morning entry hours (before 9:00 AM).');
        const dismissal = await window.getDismissalTime(gradeLevel);
        let exitStatus = STATUS.NORMAL_EXIT;
        if (isEarlyExit(currentTime, dismissal)) exitStatus = STATUS.EARLY_EXIT;
        else if (isLateExit(currentTime, dismissal)) exitStatus = STATUS.LATE_EXIT;
        // If prior log exists (normal mode), update it; if manual mode, create new exit-only record
        if (priorLog?.time_in && !priorLog.time_out && !manualAttendanceMode) {
            await supabase.from('attendance_logs').update({
                time_out: now.toISOString(),
                status: exitStatus,
                afternoon_absent: exitStatus !== STATUS.NORMAL_EXIT
            }).eq('id', priorLog.id);
        } else {
            // Check if there's already a complete record to avoid duplicate key error
            const { data: existingComplete } = await supabase
                .from('attendance_logs')
                .select('id')
                .eq('student_id', student.id)
                .eq('log_date', dateStr)
                .not('time_out', 'is', null)
                .limit(1);
            if (existingComplete?.length) {
                await supabase.from('attendance_logs').update({
                    time_out: now.toISOString(),
                    status: exitStatus,
                    afternoon_absent: exitStatus !== STATUS.NORMAL_EXIT
                }).eq('id', existingComplete[0].id);
            } else {
                const { error } = await supabase.from('attendance_logs').insert({
                    student_id: student.id,
                    log_date: dateStr,
                    time_in: now.toISOString(),
                    time_out: now.toISOString(),
                    status: exitStatus,
                    afternoon_absent: exitStatus !== STATUS.NORMAL_EXIT
                });
                if (error && error.code !== '23505') throw error;
            }
        }
        status = exitStatus;
    } else {
        // Check if log already exists for today - fetch ALL fields to check if complete
        const { data: existing } = await supabase
            .from('attendance_logs')
            .select('id, time_in, time_out')  // FIXED: fetch time_in and time_out
            .eq('student_id', student.id)
            .eq('log_date', dateStr)
            .limit(1);
        if (existing?.length) {
            // FIXED: Properly check if re-entry after complete record
            if (existing[0].time_in && existing[0].time_out) {
                // Student already has complete record (entered and exited) - this is RE-ENTRY
                const threshold = await window.getLateThreshold(gradeLevel);
                const entryStatus = isLate(currentTime, threshold) ? STATUS.LATE_RE_ENTRY : STATUS.RE_ENTRY;
                // Create new record for re-entry
                await supabase.from('attendance_logs').insert({ 
                    student_id: student.id, 
                    log_date: dateStr, 
                    time_in: now.toISOString(), 
                    status: entryStatus 
                });
                status = entryStatus;
                direction = 'ENTRY';
            } else if (!existing[0].time_in) {
                // Only has time_out, missing time_in - update it
                await supabase.from('attendance_logs').update({ time_in: now.toISOString(), status }).eq('id', existing[0].id);
            }
            // Sync summary for entry (both re-entry and update)
            if (ENABLE_SUMMARY_SYNC && typeof AttendanceHelpers !== 'undefined' && typeof AttendanceHelpers.syncStudentDailySummary === 'function') {
                try { await AttendanceHelpers.syncStudentDailySummary(student.id, dateStr); } catch (e) {}
            }
            return { direction, status };
        }
        const threshold = await window.getLateThreshold(gradeLevel);
        if (isLate(currentTime, threshold)) status = 'Late';
        const { error } = await supabase.from('attendance_logs').insert({ student_id: student.id, log_date: dateStr, time_in: now.toISOString(), status });
        if (error && error.code !== '23505') throw error;
        // Sync summary for new entry
        if (ENABLE_SUMMARY_SYNC && typeof AttendanceHelpers !== 'undefined' && typeof AttendanceHelpers.syncStudentDailySummary === 'function') {
            try { await AttendanceHelpers.syncStudentDailySummary(student.id, dateStr); } catch (e) {}
        }
    }
    return { direction, status };
        }
        const threshold = await window.getLateThreshold(gradeLevel);
        if (isLate(currentTime, threshold)) status = 'Late';
        const { error } = await supabase.from('attendance_logs').insert({ student_id: student.id, log_date: dateStr, time_in: now.toISOString(), status });
        if (error && error.code !== '23505') throw error;
    }

    // Sync daily summary after scan update (covers ENTRY and EXIT paths)
    if (ENABLE_SUMMARY_SYNC && typeof AttendanceHelpers !== 'undefined' && typeof AttendanceHelpers.syncStudentDailySummary === 'function') {
        try {
            await AttendanceHelpers.syncStudentDailySummary(student.id, dateStr);
        } catch (syncErr) {
            console.warn('[Gatekeeper] Summary sync failed:', syncErr);
        }
    }

    return { direction, status };
}

/**
 * Create parent notification with deduplication
 */
async function createParentNotification(student, direction, status) {
    if (!student.parent_id) return;
    const action = direction === 'ENTRY' ? 'entered' : 'exited';
    const time = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
    const title = direction === 'ENTRY' ? 'Arrival Alert' : 'Departure Alert';
    const message = `Your child, ${student.full_name}, ${action} at ${time} (${status})`;
    // Keep original types used in gatekeeper module
    const notifType = direction === 'ENTRY' ? 'arrival' : 'departure';

    // Use centralized notification if available
    if (typeof window.createNotification === 'function') {
        await window.createNotification(student.parent_id, 'parent', title, message, notifType);
        return;
    }

    // Fallback: inline with dedup
    const { data: existing } = await supabase.from('notifications')
        .select('id')
        .eq('recipient_id', student.parent_id)
        .eq('type', notifType)
        .eq('title', title)
        .maybeSingle();
    
    if (!existing) {
        await supabase.from('notifications').insert({
            recipient_id: student.parent_id,
            recipient_role: 'parent',
            title,
            message,
            type: notifType,
            created_at: new Date().toISOString()
        });
    }
}

// FIXED: use adviser_id, not teacher_id
async function notifyTeacher(student, direction, status) {
    if (!student.class_id) return;
    const { data: classData } = await supabase.from('classes').select('adviser_id').eq('id', student.class_id).maybeSingle();
    if (!classData?.adviser_id) return;
    const time = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12: true });
    const grade = student.classes?.grade_level || 'Unknown';
    const section = student.classes?.department || '';
    let title = '', message = '';
    if (status === STATUS.LATE) { title = 'Late Arrival Alert'; message = `${student.full_name} (${grade} - ${section}) arrived LATE at ${time}`; }
    else if (status === STATUS.EARLY_EXIT) { title = 'Early Exit Alert'; message = `${student.full_name} (${grade} - ${section}) left EARLY at ${time}`; }
    else if (status === STATUS.LATE_EXIT) { title = 'Late Exit Alert'; message = `${student.full_name} (${grade} - ${section}) left LATE at ${time}`; }
    if (title) {
        // Use centralized notification if available
        if (typeof window.createNotification === 'function') {
            await window.createNotification(classData.adviser_id, 'teacher', title, message, 'attendance_alert');
        } else {
            // Fallback with inline dedup
            const { data: existing } = await supabase.from('notifications')
                .select('id')
                .eq('recipient_id', classData.adviser_id)
                .eq('type', 'attendance_alert')
                .eq('title', title)
                .maybeSingle();
            if (!existing) {
                await supabase.from('notifications').insert({
                    recipient_id: classData.adviser_id,
                    recipient_role: 'teacher',
                    title, message, type: 'attendance_alert',
                    created_at: new Date().toISOString()
                });
            }
        }
    }
}
}

// ============================================================================
// INITIALIZATION & UI HELPERS
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (currentUser && document.getElementById('teacher-name-display')) {
        document.getElementById('teacher-name-display').innerText = currentUser.full_name || 'Teacher';
    }
    const timeEl = document.getElementById('current-time');
    const dateEl = document.getElementById('current-date');
    function updateDateTime() {
        const now = new Date();
        if (timeEl) timeEl.innerText = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
        if (dateEl) dateEl.innerText = now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);
    initializeScanner();
    initManualModeIndicator();
});

window.addEventListener('beforeunload', () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (videoStream) videoStream.getTracks().forEach(t => t.stop());
});

// Manual entry
window.showManualEntry = function() {
    const modal = document.getElementById('manual-entry-modal');
    if (modal) modal.classList.remove('hidden');
    setTimeout(() => document.getElementById('manual-student-id')?.focus(), 100);
};
window.closeManualEntry = function() {
    const modal = document.getElementById('manual-entry-modal');
    if (modal) modal.classList.add('hidden');
    if (document.getElementById('manual-student-id')) document.getElementById('manual-student-id').value = '';
};
window.submitManualEntry = function() {
    const input = document.getElementById('manual-student-id');
    const id = input?.value.trim().toUpperCase();
    if (!id) { showToast('Please enter a Student ID', 'error'); return; }
    window.closeManualEntry();
    onScanSuccess(id);
};

// Expose manual attendance mode toggle
window.toggleManualAttendanceMode = toggleManualAttendanceMode;