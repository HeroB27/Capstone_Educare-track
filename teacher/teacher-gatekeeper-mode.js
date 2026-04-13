// teacher-gatekeeper-mode.js - Complete scanner for gatekeeper teachers

var currentUser = window.currentUser || checkSession('teachers');
if (!currentUser || !currentUser.is_gatekeeper) {
    if (typeof showNotification === 'function') showNotification("Unauthorized Access. Redirecting to dashboard.", 'error');
    else alert("Unauthorized Access. Redirecting to dashboard.");
    setTimeout(() => { window.location.href = 'teacher-dashboard.html'; }, 2000);
}

// ============================================================================
// GLOBAL VARIABLES & FALLBACKS
// ============================================================================
let videoStream = null;
let video = null;
let canvas = null;
let canvasContext = null;
let animationFrameId = null;
let lastScanTime = 0;
const ANTI_DUPLICATE_THRESHOLD = 30000;
const SCAN_REGEX = /^EDU-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4,6}$/i;
const scanCooldowns = new Map();

if (typeof window.getLateThreshold !== 'function') {
    window.getLateThreshold = async function(gradeLevel) { return '08:00'; };
}
if (typeof window.getDismissalTime !== 'function') {
    window.getDismissalTime = function(gradeLevel) { return '15:00'; };
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
        let timeCoverage = null;
        if (data.time_coverage === 'Morning Only') timeCoverage = 'Morning';
        else if (data.time_coverage === 'Afternoon Only') timeCoverage = 'Afternoon';
        else if (data.time_coverage === 'Full Day') timeCoverage = 'Full Day';
        return { isHoliday: true, isSuspended, description: data.description, timeCoverage };
    } catch (e) { return { isHoliday: false, isSuspended: false }; }
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
    const hiddenInput = document.getElementById('usb-scanner-input');
    if (!hiddenInput) {
        // Create hidden input if not present
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'usb-scanner-input';
        input.style.position = 'fixed';
        input.style.top = '-100px';
        input.style.left = '-100px';
        input.style.opacity = '0';
        document.body.appendChild(input);
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
async function onScanSuccess(decodedText) {
    const now = Date.now();
    if (scanCooldowns.has(decodedText) && (now - scanCooldowns.get(decodedText)) < ANTI_DUPLICATE_THRESHOLD) {
        showToast('Duplicate scan – please wait', 'warning');
        return;
    }
    scanCooldowns.set(decodedText, now);
    if (!SCAN_REGEX.test(decodedText)) { showToast('Invalid QR format', 'error'); return; }
    await processScan(decodedText);
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
        const holidayCheck = await checkIsHoliday(today, gradeLevel);
        const hour = new Date().getHours();
        if (holidayCheck.isHoliday && holidayCheck.isSuspended) {
            if (!(holidayCheck.timeCoverage === 'Morning' && hour >= 12) && !(holidayCheck.timeCoverage === 'Afternoon' && hour < 12)) {
                showToast(`School suspended: ${holidayCheck.description}`, 'error');
                return;
            }
        }

        const scanResult = await handleAttendanceScan(student);
        const gradeDisplay = student.classes?.grade_level || 'N/A';
        const section = student.classes?.department || '';
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
    const gateStatus = await window.evaluateGateStatus();
    const checkDate = new Date();
    checkDate.setMinutes(checkDate.getMinutes() - checkDate.getTimezoneOffset());
    const dateStr = checkDate.toISOString().split('T')[0];
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
    const currentTime = now.toTimeString().split(' ')[0].substring(0,5);
    const gradeLevel = student.classes?.grade_level || null;
    let status = 'On Time';
    let direction = 'ENTRY';
    if (priorLog?.time_in && !priorLog.time_out) {
        direction = 'EXIT';
        if (now.getHours() < 10) throw new Error('Exit scans disabled during morning entry hours.');
        const dismissal = await window.getDismissalTime(gradeLevel);
        let exitStatus = 'Normal Exit';
        if (isEarlyExit(currentTime, dismissal)) exitStatus = 'Early Exit';
        else if (isLateExit(currentTime, dismissal)) exitStatus = 'Late Exit';
        await supabase.from('attendance_logs').update({ time_out: now.toISOString(), status: exitStatus }).eq('id', priorLog.id);
        status = exitStatus;
    } else {
        const threshold = await window.getLateThreshold(gradeLevel);
        if (isLate(currentTime, threshold)) status = 'Late';
        await supabase.from('attendance_logs').insert({ student_id: student.id, log_date: dateStr, time_in: now.toISOString(), status });
    }
    return { direction, status };
}

async function createParentNotification(student, direction, status) {
    if (!student.parent_id) return;
    const action = direction === 'ENTRY' ? 'entered' : 'exited';
    const time = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
    const message = `Your child, ${student.full_name}, ${action} at ${time} (${status})`;
    await supabase.from('notifications').insert({
        recipient_id: student.parent_id, recipient_role: 'parent',
        title: direction === 'ENTRY' ? 'Arrival Alert' : 'Departure Alert',
        message, type: direction === 'ENTRY' ? 'arrival' : 'departure'
    });
}

// FIXED: use adviser_id, not teacher_id
async function notifyTeacherFromTeacherModule(student, direction, status) {
    if (!student.class_id) return;
    const { data: classData } = await supabase.from('classes').select('adviser_id').eq('id', student.class_id).single();
    if (!classData?.adviser_id) return;
    const time = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
    const grade = student.classes?.grade_level || 'Unknown';
    const section = student.classes?.department || '';
    let title = '', message = '';
    if (status === 'Late') { title = 'Late Arrival Alert'; message = `${student.full_name} (${grade} - ${section}) arrived LATE at ${time}`; }
    else if (status === 'Early Exit') { title = 'Early Exit Alert'; message = `${student.full_name} (${grade} - ${section}) left EARLY at ${time}`; }
    else if (status === 'Late Exit') { title = 'Late Exit Alert'; message = `${student.full_name} (${grade} - ${section}) left LATE at ${time}`; }
    if (title) {
        await supabase.from('notifications').insert({
            recipient_id: classData.adviser_id, recipient_role: 'teacher',
            title, message, type: 'attendance_alert'
        });
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