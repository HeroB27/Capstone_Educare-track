// ============================================================================
// GUARD MODULE - Optimized Core (Matching Teacher Scanner)
// ============================================================================
// Features: Hybrid scanner (Camera + USB HID), Tap Direction Logic,
// Status Calculation, Real-time Notifications
// ============================================================================

const USE_NEW_ATTENDANCE_LOGIC = true;

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
const ANTI_DUPLICATE_THRESHOLD = 5000; // 5 seconds - optimized for faster scanning
const SCAN_REGEX = /^EDU-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4,6}$/i;
const scanCooldowns = new Map();
let lastToastTime = 0;
let manualAttendanceMode = false; // FIXED: Handle manual attendance during scanner downtime
// Cache for performance - reduce database calls
let gateStatusCache = { status: null, timestamp: 0 };
const GATE_STATUS_CACHE_TTL = 30000; // 30 seconds cache for gate status

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// ==========================================
// FALLBACKS for missing core functions
// ==========================================
if (typeof window.getLateThreshold !== 'function') {
    window.getLateThreshold = async function(gradeLevel) { return '08:00'; };
}
if (typeof window.getDismissalTime !== 'function') {
    window.getDismissalTime = function(gradeLevel) { return '15:00'; };
}

// Attendance status constants (from general-core.js)
const STATUS = window.ATTENDANCE_STATUS || {
    PRESENT: 'Present', ON_TIME: 'Present', LATE: 'Late', ABSENT: 'Absent',
    EXCUSED: 'Excused', EXCUSED_ABSENT: 'Excused Absent',
    NORMAL_EXIT: 'Normal Exit', EARLY_EXIT: 'Early Exit', LATE_EXIT: 'Late Exit',
    RE_ENTRY: 'Re-entry', LATE_RE_ENTRY: 'Late Re-entry',
    MEDICAL_EXIT: 'Medical Exit', EARLY_EXIT_AUTH: 'Early Exit (Authorized)',
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
    const scannerHeader = document.querySelector('.scan-header') || document.querySelector('.header') || document.querySelector('.bg-gray-800');
    if (scannerHeader && !document.getElementById('manual-mode-indicator')) {
        const indicator = document.createElement('div');
        indicator.id = 'manual-mode-indicator';
        indicator.className = 'hidden';
        scannerHeader.appendChild(indicator);
    }
    // Add toggle button to scanner UI if not exists
    const toggleBtn = document.getElementById('manual-mode-toggle');
    if (!toggleBtn && document.querySelector('.scan-controls') || document.querySelector('.controls')) {
        const container = document.querySelector('.scan-controls') || document.querySelector('.controls');
        const btn = document.createElement('button');
        btn.id = 'manual-mode-toggle';
        btn.className = 'bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 rounded-lg text-sm font-semibold';
        btn.innerText = 'Toggle Manual Entry';
        btn.onclick = toggleManualAttendanceMode;
        container.appendChild(btn);
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

// Grade‑aware holiday check
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
        
        // Normalize time_coverage for consistency
        let timeCoverage = 'Full Day';
        if (data.time_coverage === 'Morning Only' || data.time_coverage === 'Morning') timeCoverage = 'Morning';
        else if (data.time_coverage === 'Afternoon Only' || data.time_coverage === 'Afternoon') timeCoverage = 'Afternoon';
        
        return {
            isHoliday: true,
            isSuspended: isSuspended,
            description: data.description,
            timeCoverage: timeCoverage
        };
    } catch (e) {
        return { isHoliday: false, isSuspended: false };
    }
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
                    // This grade is not affected by the suspension
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

async function getGradeSchedule(gradeLevel) {
    try {
        const { data } = await supabase
            .from('grade_schedules')
            .select('*')
            .eq('grade_level', gradeLevel)
            .maybeSingle();
        if (!data) return await getDefaultSchoolHours();
        return data;
    } catch { return await getDefaultSchoolHours(); }
}

async function getDefaultSchoolHours() {
    try {
        const { data } = await supabase
            .from('settings')
            .select('setting_key, setting_value')
            .in('setting_key', ['school_start_time', 'school_end_time']);
        const map = {};
        data?.forEach(s => { map[s.setting_key] = s.setting_value; });
        return {
            start_time: map.school_start_time || '07:30:00',
            end_time: map.school_end_time || '15:00:00',
            late_threshold: map.school_start_time || '07:30:00',
            early_cutoff: map.school_end_time || '15:00:00'
        };
    } catch { return { start_time: '07:30:00', end_time: '15:00:00', late_threshold: '07:30:00', early_cutoff: '15:00:00' }; }
}

function isLate(scanTime, lateThreshold) {
    if (!lateThreshold) return false;
    const [sH, sM] = scanTime.split(':').map(Number);
    const [tH, tM] = lateThreshold.split(':').map(Number);
    return (sH * 60 + sM) > (tH * 60 + tM);
}
function isEarlyExit(scanTime, dismissalTime) {
    if (!dismissalTime) return false;
    const [sH, sM] = scanTime.split(':').map(Number);
    const [dH, dM] = dismissalTime.split(':').map(Number);
    return (sH * 60 + sM) < (dH * 60 + dM);
}
function isLateExit(scanTime, dismissalTime) {
    if (!dismissalTime) return false;
    const [sH, sM] = scanTime.split(':').map(Number);
    const [dH, dM] = dismissalTime.split(':').map(Number);
    return (sH * 60 + sM) > (dH * 60 + dM) + 30;
}



// ============================================================================
// SCANNER INITIALIZATION (Camera + USB)
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
    function keepFocus() { hiddenInput.focus(); }
    hiddenInput.addEventListener('input', (e) => {
        let val = e.target.value.trim();
        if (val && (val.endsWith('\n') || SCAN_REGEX.test(val))) {
            val = val.replace('\n', '').trim();
            onScanSuccess(val);
            hiddenInput.value = '';
        }
    });
    hiddenInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const val = hiddenInput.value.trim();
            if (val && SCAN_REGEX.test(val)) onScanSuccess(val);
            hiddenInput.value = '';
        }
    });
    hiddenInput.addEventListener('blur', keepFocus);
    document.addEventListener('click', keepFocus);
    keepFocus();
}

// ========== CAMERA SCANNER (fixed) ==========
function startCameraScanner() {
    const readerDiv = document.getElementById('reader');
    if (!readerDiv) {
        console.error('No element with id="reader"');
        showToast('Scanner container missing', 'error');
        return;
    }
    if (typeof jsQR === 'undefined') {
        console.error('jsQR library not loaded');
        showToast('QR library not loaded. Please refresh.', 'error');
        return;
    }

    // Clean up any previous video/canvas
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    readerDiv.innerHTML = ''; // Clear old content

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
                        // Wait a frame for video dimensions to be available
                        setTimeout(() => {
                            if (video.videoWidth && video.videoHeight) {
                                canvas.width = video.videoWidth;
                                canvas.height = video.videoHeight;
                                console.log(`Camera ready: ${canvas.width}x${canvas.height}`);
                                scanFrame(); // Start scanning loop
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

    // Update canvas size if video size changed
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

// Called from scanner.html "Start Scanner" button
function startScanningProcess() {
    const overlay = document.getElementById('start-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
    startCameraScanner();
}

function initializeScanner() {
    // Setup USB scanner first (always works)
    setupUsbScanner();

    // Camera scanner – only if start overlay exists, otherwise auto-start
    const startBtn = document.getElementById('start-scanner-btn');
    const overlay = document.getElementById('start-overlay');
    if (startBtn && overlay) {
        // Remove any previous listener to avoid duplicates
        const newBtn = startBtn.cloneNode(true);
        startBtn.parentNode.replaceChild(newBtn, startBtn);
        newBtn.onclick = () => {
            overlay.classList.add('hidden');
            startCameraScanner();
        };
    } else {
        // No overlay – check if reader container exists (only on scanner.html)
        const readerDiv = document.getElementById('reader');
        if (readerDiv) {
            startCameraScanner();
        }
    }
}

// ============================================================================
// MAIN SCAN PROCESSING (the core logic)
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
        await handleScan(decodedText);
    } finally {
        // Loading will be hidden when scan result is displayed
    }
}

async function handleScan(studentIdText) {
    try {
        // OPTIMIZED: Use cached gate status instead of fetching every time
        const gateStatus = await getCachedGateStatus();
        const statusIndicator = document.getElementById('status-indicator');
        if (statusIndicator) {
            if (!gateStatus.allowEntry) statusIndicator.innerHTML = `<span class="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold animate-pulse">${gateStatus.message}</span>`;
            else statusIndicator.innerHTML = `<span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">GATE ACTIVE</span>`;
        }
        if (!gateStatus.active) { showToast(gateStatus.message, 'error'); return; }

        const today = getLocalISOString();
        
        // OPTIMIZED: Fetch student and last log in parallel
        const student = await getStudentById(studentIdText);
        if (!student) { showToast('Student not found', 'error'); return; }
        if (student.status !== 'Enrolled') { showToast(`Student account is ${student.status}`, 'error'); return; }

        const gradeLevel = await getGradeLevel(student.class_id);
        
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
        
        // OPTIMIZED: Parallel checks for suspensions and holidays
        const [suspensionCheck, holidayCheck, lastLog] = await Promise.all([
            checkSuspension(gradeLevel),
            checkIsHoliday(today, gradeLevel),
            getLastLogToday(student.id)
        ]);
        
        // SECOND: Check suspensions table for school suspensions
        if (suspensionCheck.isSuspended && suspensionCheck.type === 'weekend') {
            showToast(suspensionCheck.message, 'error');
            return;
        }
        if (suspensionCheck.isSuspended && suspensionCheck.type === 'suspension') {
            const hour = new Date().getHours();
            // For half-day suspensions, check if scan time is within suspended period
            if (!(suspensionCheck.timeCoverage === 'Morning' && hour >= 12) && 
                !(suspensionCheck.timeCoverage === 'Afternoon' && hour < 12)) {
                showToast(`School suspended: ${suspensionCheck.message}`, 'error');
                return;
            }
        }
        
        // THIRD: Check holidays table for holidays/suspensions
        if (holidayCheck.isHoliday && holidayCheck.isSuspended) {
            const hour = new Date().getHours();
            // For half-day suspensions, check if scan time is within suspended period
            if (!(holidayCheck.timeCoverage === 'Morning' && hour >= 12) && 
                !(holidayCheck.timeCoverage === 'Afternoon' && hour < 12)) {
                showToast(`School suspended: ${holidayCheck.description}`, 'error');
                return;
            }
        }

        // FIXED: Handle manual attendance during scanner downtime
        // If Manual Entry Mode is ON: treat missing log as already entered (so scan = EXIT)
        let direction;
        if (manualAttendanceMode) {
            // Manual mode: always treat as EXIT (teacher already logged entry manually)
            direction = 'EXIT';
        } else {
            // Normal mode: use standard logic
            direction = !lastLog || (lastLog.time_in && lastLog.time_out) ? 'ENTRY' : 'EXIT';
        }
        
        // FIXED: Detect re-entry (student already exited and is entering again)
        const isReEntry = lastLog && lastLog.time_in && lastLog.time_out;
        
        if (!gateStatus.allowEntry && direction === 'ENTRY') { showToast(`ENTRY DENIED: ${gateStatus.message}`, 'error'); return; }
        if (lastLog?.status === STATUS.EXCUSED && direction === 'ENTRY') { showToast(`${student.full_name} already excused today`, 'warning'); return; }
        
        // UPDATED: Commented out hardcoded 9 AM check - now rely on isEarlyExit() comparison with dismissal time
        // const currentHour = new Date().getHours();
        // if (direction === 'EXIT' && currentHour < 9) {
        //     showToast('Exit scans disabled during morning entry hours (before 9:00 AM)', 'error');
        //     return;
        // }

        const nowDate = new Date();
        const scanTime = nowDate.toTimeString().slice(0,5);
        // OPTIMIZED: Get thresholds in parallel (both are independent)
        const [lateThreshold, dismissalTime] = await Promise.all([
            window.getLateThreshold(gradeLevel),
            window.getDismissalTime(gradeLevel)
        ]);
        let statusInfo = calculateStatus(scanTime, direction, gradeLevel, lateThreshold, dismissalTime);
        
        // FIXED: Override status for re-entry (student already exited and is entering again)
        if (isReEntry && direction === 'ENTRY') {
            if (statusInfo.status === 'On Time') {
                statusInfo.status = 'Re-entry';
                statusInfo.backgroundColor = 'bg-purple-600';
                statusInfo.message = 'Re-entry after previous exit';
            } else if (statusInfo.status === 'Late') {
                statusInfo.status = 'Late Re-entry';
                statusInfo.backgroundColor = 'bg-orange-500';
                statusInfo.message = 'Late Re-entry after previous exit';
            }
        }

        let isMedicalExit = false;
        if (direction === 'EXIT') {
            isMedicalExit = await checkClinicStatus(student.id);
            if (isMedicalExit) {
                statusInfo.status = 'Medical Exit';
                statusInfo.backgroundColor = 'bg-blue-600';
                statusInfo.message = 'Authorized Medical Exit';
            } else if (USE_NEW_ATTENDANCE_LOGIC) {
                const guardPassAuth = await checkGuardPassAuthorization(student.id, scanTime);
                if (guardPassAuth) {
                    statusInfo.status = guardPassAuth.status;
                    statusInfo.backgroundColor = 'bg-teal-600';
                    statusInfo.message = guardPassAuth.message;
                }
            }
        }

        await saveAttendanceLog(student.id, direction, statusInfo.status);
        await createNotification(student.id, direction, statusInfo.status);
        if ([STATUS.LATE, STATUS.EARLY_EXIT, STATUS.LATE_EXIT].includes(statusInfo.status)) {
            await notifyTeacher(student, direction, statusInfo.status);
        }

        displayScanResult(student, direction, statusInfo, scanTime);
        addToRecentScans(student, direction, statusInfo, scanTime);
        playBeepSound();
    } catch (err) {
        console.error('Scan error:', err);
        hideScanningLoading(); // Clear loading on error
        showToast(err.message || 'Error processing scan', 'error');
    }
}

// ============================================================================
// DATABASE HELPERS
// ============================================================================
async function getStudentById(studentId) {
    try {
        let { data } = await supabase
            .from('students')
            .select('id, student_id_text, full_name, qr_code_data, profile_photo_url, class_id, parent_id, status, classes(grade_level, department)')
            .eq('student_id_text', studentId)
            .maybeSingle();
        if (!data) {
            const { data: qrData } = await supabase.from('students').select('*').eq('qr_code_data', studentId).maybeSingle();
            if (qrData) data = qrData;
        }
        if (!data) return null;
        return data.status === 'Enrolled' ? data : null;
    } catch { return null; }
}

async function getGradeLevel(classId) {
    if (!classId) return 'Unknown';
    const { data } = await supabase.from('classes').select('grade_level').eq('id', classId).maybeSingle();
    return data?.grade_level || 'Unknown';
}

async function getLastLogToday(studentId) {
    const today = getLocalISOString();
    const { data } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('student_id', studentId)
        .eq('log_date', today)
        .order('time_in', { ascending: false })
        .limit(1);
    return data?.[0] || null;
}

async function saveAttendanceLog(studentId, direction, status) {
    const today = getLocalISOString();
    const now = new Date().toISOString();
    if (direction === 'ENTRY') {
        // Check if log already exists for today - fetch time fields
        const { data: existing } = await supabase
            .from('attendance_logs')
            .select('id, time_in, time_out')
            .eq('student_id', studentId)
            .eq('log_date', today)
            .limit(1);
        if (existing?.length) {
            // FIXED: Handle re-entry (student already completed entry+exit)
            if (existing[0].time_in && existing[0].time_out) {
                // Create new record for re-entry
                const { error } = await supabase.from('attendance_logs').insert({ student_id: studentId, log_date: today, time_in: now, status });
                if (error && error.code !== '23505') throw error;
            } else if (!existing[0].time_in) {
                // Only has time_out, missing time_in - update it
                await supabase.from('attendance_logs').update({ time_in: now, status }).eq('id', existing[0].id);
            }
            // Sync daily summary after update/insert
            if (USE_NEW_ATTENDANCE_LOGIC && typeof AttendanceHelpers !== 'undefined' && typeof AttendanceHelpers.syncStudentDailySummary === 'function') {
                try { await AttendanceHelpers.syncStudentDailySummary(studentId, today); } catch (e) {}
            }
            return;
        }
        const { error } = await supabase.from('attendance_logs').insert({ student_id: studentId, log_date: today, time_in: now, status });
        if (error && error.code !== '23505') { // Ignore duplicate key error
            throw error;
        }
        // Sync daily summary after insert
        if (USE_NEW_ATTENDANCE_LOGIC && typeof AttendanceHelpers !== 'undefined' && typeof AttendanceHelpers.syncStudentDailySummary === 'function') {
            try { await AttendanceHelpers.syncStudentDailySummary(studentId, today); } catch (e) {}
        }
    } else {
        const { data: existing } = await supabase
            .from('attendance_logs')
            .select('id')
            .eq('student_id', studentId)
            .eq('log_date', today)
            .is('time_out', null)
            .order('time_in', { ascending: false })
            .limit(1);
        if (existing?.length) {
            await supabase.from('attendance_logs').update({ time_out: now, status }).eq('id', existing[0].id);
            // Sync daily summary after update
            if (USE_NEW_ATTENDANCE_LOGIC && typeof AttendanceHelpers !== 'undefined' && typeof AttendanceHelpers.syncStudentDailySummary === 'function') {
                try { await AttendanceHelpers.syncStudentDailySummary(studentId, today); } catch (e) {}
            }
        } else {
            // Check if there's already a complete record (both time_in and time_out)
            const { data: completed } = await supabase
                .from('attendance_logs')
                .select('id')
                .eq('student_id', studentId)
                .eq('log_date', today)
                .not('time_out', 'is', null)
                .limit(1);
            if (completed?.length) {
                // Already exited - update time_out
                await supabase.from('attendance_logs').update({ time_out: now, status }).eq('id', completed[0].id);
                // Sync daily summary after update
                if (USE_NEW_ATTENDANCE_LOGIC && typeof AttendanceHelpers !== 'undefined' && typeof AttendanceHelpers.syncStudentDailySummary === 'function') {
                    try { await AttendanceHelpers.syncStudentDailySummary(studentId, today); } catch (e) {}
                }
            } else {
                // Insert new exit record
                const { error } = await supabase.from('attendance_logs').insert({ student_id: studentId, log_date: today, time_in: now, time_out: now, status });
                if (error && error.code !== '23505') {
                    throw error;
                }
                // Sync daily summary after insert
                if (USE_NEW_ATTENDANCE_LOGIC && typeof AttendanceHelpers !== 'undefined' && typeof AttendanceHelpers.syncStudentDailySummary === 'function') {
                    try { await AttendanceHelpers.syncStudentDailySummary(studentId, today); } catch (e) {}
                }
            }
        }
    }
}

/**
 * Create notifications for gate scan with deduplication.
 * Sends two types: base arrival/departure, plus detailed alert for Late/Early Exit.
 */
async function createNotification(studentId, direction, status) {
    const student = await getStudentById(studentId);
    if (!student?.parent_id) return;
    
    const time = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12: true });
    const action = direction === 'ENTRY' ? 'entered' : 'exited';
    const baseMessage = `Your child, ${student.full_name}, ${action} at ${time} (${status})`;
    
    // Notification 1: Arrival/Departure alert
    const baseTitle = direction === 'ENTRY' ? 'Arrival Alert' : 'Departure Alert';
    const baseType = direction === 'ENTRY' ? 'gate_entry' : 'gate_exit';
    
    const { data: existingBase } = await supabase
        .from('notifications')
        .select('id')
        .eq('recipient_id', student.parent_id)
        .eq('type', baseType)
        .eq('title', baseTitle)
        .maybeSingle();
    
    if (!existingBase) {
        await supabase.from('notifications').insert({
            recipient_id: student.parent_id,
            recipient_role: 'parent',
            title: baseTitle,
            message: baseMessage,
            type: baseType,
            created_at: new Date().toISOString()
        });
    }
    
    // Notification 2: Detailed attendance alert for statuses requiring attention
    if (['Late', 'Early Exit', 'Late Exit'].includes(status)) {
        let title = status === 'Late' ? 'Late Arrival Notice' : (status === 'Early Exit' ? 'Early Dismissal Notice' : 'Late Exit Notice');
        const detailMessage = `Your child ${student.full_name} ${status === 'Late' ? 'arrived late' : 'left early'} at ${time}.`;
        const alertType = 'attendance_alert';
        
        const { data: existingAlert } = await supabase
            .from('notifications')
            .select('id')
            .eq('recipient_id', student.parent_id)
            .eq('type', alertType)
            .eq('title', title)
            .maybeSingle();
        
        if (!existingAlert) {
            await supabase.from('notifications').insert({
                recipient_id: student.parent_id,
                recipient_role: 'parent',
                title,
                message: detailMessage,
                type: alertType,
                created_at: new Date().toISOString()
            });
        }
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

async function checkClinicStatus(studentId) {
    const { data } = await supabase
        .from('clinic_visits')
        .select('action_taken')
        .eq('student_id', studentId)
        .is('time_out', null)
        .order('time_in', { ascending: false })
        .limit(1);
    return data?.[0]?.action_taken?.toLowerCase().includes('sent home') || false;
}

function calculateStatus(scanTime, direction, gradeLevel, lateThreshold, dismissalTime) {
    const result = { status: '', backgroundColor: 'bg-green-600', message: '' };
    if (direction === 'ENTRY') {
        if (isLate(scanTime, lateThreshold)) {
            result.status = STATUS.LATE;
            result.backgroundColor = 'bg-yellow-500';
            result.message = `Late Arrival (Threshold: ${formatTime12(lateThreshold)})`;
        } else { result.status = STATUS.ON_TIME; result.message = 'On Time'; }
    } else {
        if (isEarlyExit(scanTime, dismissalTime)) {
            result.status = STATUS.EARLY_EXIT;
            result.backgroundColor = 'bg-red-600';
            result.message = `Early Exit (Dismissal: ${formatTime12(dismissalTime)})`;
        } else if (isLateExit(scanTime, dismissalTime)) {
            result.status = STATUS.LATE_EXIT;
            result.backgroundColor = 'bg-yellow-500';
            result.message = `Late Exit (>${formatTime12(dismissalTime)}+30min)`;
        } else { result.status = STATUS.NORMAL_EXIT; result.message = 'Normal Dismissal'; }
    }
    return result;
}

function displayScanResult(student, direction, statusInfo, scanTime) {
    // Clear scanning loading indicator
    hideScanningLoading();
    const resultCard = document.getElementById('scan-result');
    const placeholder = document.getElementById('scan-placeholder');
    if (!resultCard) return;
    placeholder.classList.add('hidden');
    resultCard.classList.remove('hidden');
    document.getElementById('student-name').innerText = student.full_name;
    const grade = student.classes?.grade_level || 'Unknown';
    const section = student.classes?.department || '';
    document.getElementById('student-info').innerText = `${grade} ${section} • ${student.student_id_text}`;
    const img = document.getElementById('student-img');
    if (student.profile_photo_url) { img.src = student.profile_photo_url; img.parentElement.style.display = 'block'; }
    else { img.parentElement.style.display = 'none'; }
    const badge = document.getElementById('status-badge');
    badge.className = `inline-block px-8 py-4 rounded-lg text-2xl font-bold ${statusInfo.backgroundColor} text-white shadow-lg`;
    badge.innerHTML = `<span class="block">${statusInfo.status}</span><span class="block text-sm font-normal mt-1">${statusInfo.message} • ${formatTime(scanTime)}</span>`;
}

function addToRecentScans(student, direction, statusInfo, scanTime) {
    const list = document.getElementById('recent-scans-list');
    if (!list) return;
    const grade = student.classes?.grade_level || '';
    const action = direction === 'ENTRY' ? 'Entered' : 'Exited';
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-4 bg-gray-800 rounded-lg mb-2';
    div.innerHTML = `<div class="flex items-center gap-3"><div class="h-10 w-10 rounded-full bg-gray-600 flex items-center justify-center">${student.profile_photo_url ? `<img src="${student.profile_photo_url}" class="h-full w-full object-cover">` : '👤'}</div><div><p class="font-semibold">${student.full_name}</p><p class="text-sm text-gray-400">${grade} • ${scanTime}</p></div></div><span class="px-3 py-1 rounded text-sm font-bold ${statusInfo.backgroundColor} text-white">${action}</span>`;
    list.prepend(div);
    while (list.children.length > 10) list.removeChild(list.lastChild);
}

function formatTime(time24) {
    const [h,m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2,'0')} ${period}`;
}

// FIXED: Helper function to format time in 12-hour format
function formatTime12(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHours = h % 12 || 12;
    return `${displayHours}:${minutes} ${ampm}`;
}

function playBeepSound() {
    try {
        const audio = new Audio('https://www.soundjay.com/button/beep-07.wav');
        audio.volume = 0.5;
        audio.play().catch(() => {});
    } catch(e) {}
}

// ============================================================================
// GUARD PASS AUTHORIZATION HELPERS
// ============================================================================
async function checkGuardPassAuthorization(studentId, scanTime) {
    const { data: guardPass } = await supabase
        .from('guard_passes')
        .select('id, purpose, teacher_id, time_out, status')
        .eq('student_id', studentId)
        .eq('status', 'Active')
        .lte('time_out', scanTime)
        .order('time_out', { ascending: false })
        .limit(1)
        .maybeSingle();
    
    if (guardPass) {
        await supabase
            .from('guard_passes')
            .update({ 
                status: 'Used',
                used_at: new Date().toISOString()
            })
            .eq('id', guardPass.id);
        
        console.log('[GuardCore] Authorised early exit for student ' + studentId + ' via guard pass');
        
        return {
            status: 'Early Exit (Authorised)',
            message: 'Authorised early exit: ' + guardPass.purpose
        };
    }
    
    const { data: clinicVisit } = await supabase
        .from('clinic_visits')
        .select('id, reason, status')
        .eq('student_id', studentId)
        .eq('status', 'Sent Home')
        .order('time_out', { ascending: false })
        .limit(1)
        .maybeSingle();
    
    if (clinicVisit) {
        console.log('[GuardCore] Authorised medical exit for student ' + studentId);
        
        return {
            status: 'Early Exit (Medical)',
            message: 'Medical: Sent home from clinic'
        };
    }
    
    return null;
}

// Global exports
window.checkGuardPassAuthorization = checkGuardPassAuthorization;

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (currentUser && document.getElementById('guard-name')) {
        document.getElementById('guard-name').innerText = currentUser.full_name;
    }
    initializeScanner();
    initManualModeIndicator();
});

window.addEventListener('beforeunload', () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (videoStream) videoStream.getTracks().forEach(t => t.stop());
});

// Expose manual entry functions
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