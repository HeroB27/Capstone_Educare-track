// ============================================================================
// GUARD MODULE - Complete Core (including Phase 4)
// ============================================================================
// Features: Hybrid scanner (Camera + USB HID), Tap Direction Logic,
// Status Calculation, Real-time Notifications, Partial Absence,
// Pattern Detection, Admin Alerts
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
const ANTI_DUPLICATE_THRESHOLD = 30000; // 30 seconds
const SCAN_REGEX = /^EDU-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4,6}$/i;
const scanCooldowns = new Map();
let lastToastTime = 0;

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
        return {
            isHoliday: true,
            isSuspended: isSuspended,
            description: data.description,
            timeCoverage: data.time_coverage || 'Full Day'
        };
    } catch (e) {
        return { isHoliday: false, isSuspended: false };
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
// PHASE 4: PARTIAL ABSENCE, PATTERN DETECTION, ADMIN ALERTS
// ============================================================================
async function sendPartialAbsenceNotification(studentId, absenceType) {
    const student = await getStudentById(studentId);
    if (!student?.parent_id) return;
    const message = absenceType === 'Morning Absent'
        ? `Your child ${student.full_name} was marked as absent this morning. Please submit an excuse letter.`
        : `Your child ${student.full_name} did not return this afternoon. Please submit an excuse letter.`;
    await supabase.from('notifications').insert({
        recipient_id: student.parent_id,
        recipient_role: 'parent',
        title: absenceType === 'Morning Absent' ? 'Morning Absence Notice' : 'Afternoon Absence Notice',
        message, type: 'absence_reminder'
    });
}

async function checkPartialAbsence(studentId, direction, status) {
    try {
        const today = getLocalISOString();
        const currentHour = new Date().getHours();
        const { data: logs } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', studentId)
            .eq('log_date', today);
        if (!logs || logs.length === 0) return;
        const mainLog = logs.find(log => log.time_in !== null);
        if (!mainLog) return;

        if (direction === 'ENTRY' && currentHour >= 12) {
            const hasMorningRecord = logs.some(log => new Date(log.time_in).getHours() < 12);
            if (!hasMorningRecord && !mainLog.morning_absent) {
                await supabase.from('attendance_logs')
                    .update({ morning_absent: true, remarks: 'Morning absent – excuse letter required' })
                    .eq('id', mainLog.id);
                await sendPartialAbsenceNotification(studentId, 'Morning Absent');
            }
        }
        if (direction === 'EXIT' && currentHour < 12) {
            const hasAfternoonReturn = logs.some(log => log.time_out && new Date(log.time_out).getHours() >= 12);
            if (!hasAfternoonReturn && !mainLog.afternoon_absent) {
                await supabase.from('attendance_logs')
                    .update({ afternoon_absent: true, remarks: (mainLog.remarks || '') + '; Afternoon absent – excuse letter required' })
                    .eq('id', mainLog.id);
                await sendPartialAbsenceNotification(studentId, 'Afternoon Absent');
            }
        }
    } catch (error) { console.error('checkPartialAbsence error:', error); }
}

async function createAttendancePattern(studentId, patternType, description, severity) {
    const today = getLocalISOString();
    const { data: existing } = await supabase
        .from('attendance_patterns')
        .select('*')
        .eq('student_id', studentId)
        .eq('pattern_type', patternType)
        .gte('created_at', today);
    if (existing?.length) return;
    await supabase.from('attendance_patterns').insert({ student_id: studentId, pattern_type: patternType, description, severity });
}

async function detectAttendancePatterns(student, direction, status) {
    const studentId = student.id;
    const { data: recentLogs } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('student_id', studentId)
        .gte('time_in', new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .order('time_in', { ascending: false });
    if (recentLogs?.length >= 3) {
        await createAttendancePattern(studentId, 'rapid_scans', `${student.full_name} scanned multiple times rapidly`, 'medium');
    }
    if (direction === 'EXIT' && recentLogs?.[0]?.time_in) {
        const entry = new Date(recentLogs[0].time_in).getTime();
        if (Date.now() - entry < 5 * 60 * 1000) {
            await createAttendancePattern(studentId, 'immediate_exit', `${student.full_name} left immediately after entering`, 'high');
        }
    }
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: lateLogs } = await supabase.from('attendance_logs').select('*').eq('student_id', studentId).eq('status', 'Late').gte('time_in', weekAgo);
    if (lateLogs?.length >= 3) {
        await createAttendancePattern(studentId, 'frequent_late', `${student.full_name} was late ${lateLogs.length} times this week`, 'medium');
    }
    const { data: earlyExitLogs } = await supabase.from('attendance_logs').select('*').eq('student_id', studentId).eq('status', 'Early Exit').gte('time_in', weekAgo);
    if (earlyExitLogs?.length >= 3) {
        await createAttendancePattern(studentId, 'frequent_early_exit', `${student.full_name} left early ${earlyExitLogs.length} times this week`, 'medium');
    }
}

async function createAdminAlert(student, direction, status) {
    const { data: recentPatterns } = await supabase
        .from('attendance_patterns')
        .select('*')
        .eq('student_id', student.id)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .in('severity', ['high', 'medium']);
    if (!recentPatterns?.length) return;
    const hasHigh = recentPatterns.some(p => p.severity === 'high');
    const mediumCount = recentPatterns.filter(p => p.severity === 'medium').length;
    if (hasHigh || mediumCount >= 2) {
        const grade = student.classes?.grade_level || 'Unknown';
        await supabase.from('admin_alerts').insert({
            alert_type: 'attendance_pattern',
            title: 'Student Attendance Alert',
            message: `${student.full_name} (${grade}) has multiple attendance irregularities. Please review.`,
            severity: hasHigh ? 'high' : 'medium',
            metadata: { student_id: student.id, student_name: student.full_name, patterns: recentPatterns.map(p => p.pattern_type) }
        });
    }
}

// ============================================================================
// SCANNER INITIALIZATION (Camera + USB)
// ============================================================================
function setupUsbScanner() {
    const hiddenInput = document.getElementById('usb-scanner-input');
    if (!hiddenInput) return;
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
async function onScanSuccess(decodedText) {
    const now = Date.now();
    if (scanCooldowns.has(decodedText) && (now - scanCooldowns.get(decodedText)) < ANTI_DUPLICATE_THRESHOLD) {
        showToast('Duplicate scan – please wait', 'warning');
        return;
    }
    scanCooldowns.set(decodedText, now);
    if (!SCAN_REGEX.test(decodedText)) { showToast('Invalid QR format', 'error'); return; }
    await handleScan(decodedText);
}

async function handleScan(studentIdText) {
    try {
        const gateStatus = await window.evaluateGateStatus();
        const statusIndicator = document.getElementById('status-indicator');
        if (statusIndicator) {
            if (!gateStatus.allowEntry) statusIndicator.innerHTML = `<span class="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold animate-pulse">${gateStatus.message}</span>`;
            else statusIndicator.innerHTML = `<span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">GATE ACTIVE</span>`;
        }
        if (!gateStatus.active) { showToast(gateStatus.message, 'error'); return; }

        const today = getLocalISOString();
        const student = await getStudentById(studentIdText);
        if (!student) { showToast('Student not found', 'error'); return; }
        if (student.status !== 'Enrolled') { showToast(`Student account is ${student.status}`, 'error'); return; }

        const gradeLevel = await getGradeLevel(student.class_id);
        const holidayCheck = await checkIsHoliday(today, gradeLevel);
        if (holidayCheck.isHoliday && holidayCheck.isSuspended) {
            const hour = new Date().getHours();
            if (!(holidayCheck.timeCoverage === 'Morning' && hour >= 12) && !(holidayCheck.timeCoverage === 'Afternoon' && hour < 12)) {
                showToast(`School suspended: ${holidayCheck.description}`, 'error');
                return;
            }
        }

        const lastLog = await getLastLogToday(student.id);
        let direction = !lastLog || (lastLog.time_in && lastLog.time_out) ? 'ENTRY' : 'EXIT';
        if (!gateStatus.allowEntry && direction === 'ENTRY') { showToast(`ENTRY DENIED: ${gateStatus.message}`, 'error'); return; }
        if (lastLog?.status === 'Excused' && direction === 'ENTRY') { showToast(`${student.full_name} already excused today`, 'warning'); return; }

        const nowDate = new Date();
        const scanTime = nowDate.toTimeString().slice(0,5);
        const lateThreshold = await window.getLateThreshold(gradeLevel);
        const dismissalTime = await window.getDismissalTime(gradeLevel);
        let statusInfo = calculateStatus(scanTime, direction, gradeLevel, lateThreshold, dismissalTime);

        let isMedicalExit = false;
        if (direction === 'EXIT') {
            isMedicalExit = await checkClinicStatus(student.id);
            if (isMedicalExit) {
                statusInfo.status = 'Medical Exit';
                statusInfo.backgroundColor = 'bg-blue-600';
                statusInfo.message = 'Authorized Medical Exit';
            }
        }

        await saveAttendanceLog(student.id, direction, statusInfo.status);
        await createNotification(student.id, direction, statusInfo.status);
        if (['Late','Early Exit','Late Exit'].includes(statusInfo.status)) {
            await notifyTeacher(student, direction, statusInfo.status);
        }

        await checkPartialAbsence(student.id, direction, statusInfo.status);
        await detectAttendancePatterns(student, direction, statusInfo.status);
        await createAdminAlert(student, direction, statusInfo.status);

        displayScanResult(student, direction, statusInfo, scanTime);
        addToRecentScans(student, direction, statusInfo, scanTime);
        playBeepSound();
    } catch (err) {
        console.error('Scan error:', err);
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
        const { error } = await supabase.from('attendance_logs').insert({ student_id: studentId, log_date: today, time_in: now, status });
        if (error) throw error;
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
        } else {
            await supabase.from('attendance_logs').insert({ student_id: studentId, log_date: today, time_in: now, time_out: now, status });
        }
    }
}

async function createNotification(studentId, direction, status) {
    const student = await getStudentById(studentId);
    if (!student?.parent_id) return;
    const time = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12: true });
    const action = direction === 'ENTRY' ? 'entered' : 'exited';
    const message = `Your child, ${student.full_name}, ${action} at ${time} (${status})`;
    await supabase.from('notifications').insert({
        recipient_id: student.parent_id,
        recipient_role: 'parent',
        title: direction === 'ENTRY' ? 'Arrival Alert' : 'Departure Alert',
        message, type: direction === 'ENTRY' ? 'gate_entry' : 'gate_exit'
    });
    if (['Late','Early Exit','Late Exit'].includes(status)) {
        let title = status === 'Late' ? 'Late Arrival Notice' : (status === 'Early Exit' ? 'Early Dismissal Notice' : 'Late Exit Notice');
        await supabase.from('notifications').insert({
            recipient_id: student.parent_id, recipient_role: 'parent',
            title, message: `Your child ${student.full_name} ${status === 'Late' ? 'arrived late' : 'left early'} at ${time}.`, type: 'attendance_alert'
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
    if (status === 'Late') { title = 'Late Arrival Alert'; message = `${student.full_name} (${grade} - ${section}) arrived LATE at ${time}`; }
    else if (status === 'Early Exit') { title = 'Early Exit Alert'; message = `${student.full_name} (${grade} - ${section}) left EARLY at ${time}`; }
    else if (status === 'Late Exit') { title = 'Late Exit Alert'; message = `${student.full_name} (${grade} - ${section}) left LATE at ${time}`; }
    if (title) {
        await supabase.from('notifications').insert({ recipient_id: classData.adviser_id, recipient_role: 'teacher', title, message, type: 'attendance_alert' });
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
    const result = { status: 'Normal', backgroundColor: 'bg-green-600', message: '' };
    if (direction === 'ENTRY') {
        if (isLate(scanTime, lateThreshold)) {
            result.status = 'Late';
            result.backgroundColor = 'bg-yellow-500';
            result.message = `Late Arrival (Threshold: ${lateThreshold})`;
        } else { result.status = 'On Time'; result.message = 'On Time'; }
    } else {
        if (isEarlyExit(scanTime, dismissalTime)) {
            result.status = 'Early Exit';
            result.backgroundColor = 'bg-red-600';
            result.message = `Early Exit (Dismissal: ${dismissalTime})`;
        } else if (isLateExit(scanTime, dismissalTime)) {
            result.status = 'Late Exit';
            result.backgroundColor = 'bg-yellow-500';
            result.message = `Late Exit (>${dismissalTime}+30min)`;
        } else { result.status = 'Normal Exit'; result.message = 'Normal Dismissal'; }
    }
    return result;
}

function displayScanResult(student, direction, statusInfo, scanTime) {
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

function playBeepSound() {
    try {
        const audio = new Audio('https://www.soundjay.com/button/beep-07.wav');
        audio.volume = 0.5;
        audio.play().catch(() => {});
    } catch(e) {}
}

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (currentUser && document.getElementById('guard-name')) {
        document.getElementById('guard-name').innerText = currentUser.full_name;
    }
    initializeScanner();
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