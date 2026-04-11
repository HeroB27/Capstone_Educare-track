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
const ANTI_DUPLICATE_THRESHOLD = 120000;
const SCAN_REGEX = /^EDU-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4,6}$/i;

let isProcessingScan = false;
const scanCooldowns = new Map();

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// ==========================================
// FALLBACKS for missing core functions (non-recursive)
// ==========================================
if (typeof window.getLateThreshold !== 'function') {
    window.getLateThreshold = async function(gradeLevel) {
        // Default late threshold: 8:00 AM
        return '08:00';
    };
}

if (typeof window.getDismissalTime !== 'function') {
    window.getDismissalTime = function(gradeLevel) {
        // Default dismissal time: 3:00 PM
        return '15:00';
    };
}

// ============================================================================
// HELPER FUNCTIONS (Timezone, Holidays, Gate Status, Grade Schedules)
// ============================================================================

function getLocalISOString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function checkIsHoliday(dateStr) {
    try {
        const { data, error } = await supabase
            .from('holidays')
            .select('description, is_suspended, target_grades, time_coverage')
            .eq('holiday_date', dateStr)
            .maybeSingle();
        if (error || !data) return { isHoliday: false, isSuspended: false };
        return {
            isHoliday: true,
            isSuspended: data.is_suspended === true,
            description: data.description,
            targetGrades: data.target_grades,
            timeCoverage: data.time_coverage || 'Full Day'
        };
    } catch (e) {
        console.error('checkIsHoliday error:', e);
        return { isHoliday: false, isSuspended: false };
    }
}

async function evaluateGateStatus() {
    return { active: true, allowEntry: true, message: 'GATE ACTIVE' };
}

async function getGradeSchedule(gradeLevel) {
    try {
        const { data, error } = await supabase
            .from('grade_schedules')
            .select('*')
            .eq('grade_level', gradeLevel)
            .maybeSingle();
        if (error || !data) {
            return await getDefaultSchoolHours();
        }
        return data;
    } catch (e) {
        return await getDefaultSchoolHours();
    }
}

async function getDefaultSchoolHours() {
    try {
        const { data, error } = await supabase
            .from('settings')
            .select('setting_key, setting_value')
            .in('setting_key', ['school_start_time', 'school_end_time']);
        
        if (error || !data || data.length === 0) {
            return { start_time: '07:30:00', end_time: '15:00:00', late_threshold: '07:30:00', early_cutoff: '15:00:00' };
        }
        
        const settingsMap = {};
        data.forEach(s => { settingsMap[s.setting_key] = s.setting_value; });
        
        const startTime = settingsMap['school_start_time'] || '07:30:00';
        const endTime = settingsMap['school_end_time'] || '15:00:00';
        
        return {
            start_time: startTime,
            end_time: endTime,
            late_threshold: startTime,
            early_cutoff: endTime
        };
    } catch (e) {
        return { start_time: '07:30:00', end_time: '15:00:00', late_threshold: '07:30:00', early_cutoff: '15:00:00' };
    }
}

function isLate(scanTime, gradeLevel, lateThreshold) {
    if (!lateThreshold) return false;
    const [scanHour, scanMin] = scanTime.split(':').map(Number);
    const [thresHour, thresMin] = lateThreshold.split(':').map(Number);
    const scanMinutes = scanHour * 60 + scanMin;
    const thresMinutes = thresHour * 60 + thresMin;
    return scanMinutes > thresMinutes;
}

function isEarlyExit(scanTime, dismissalTime) {
    if (!dismissalTime) return false;
    const [scanHour, scanMin] = scanTime.split(':').map(Number);
    const [disHour, disMin] = dismissalTime.split(':').map(Number);
    const scanMinutes = scanHour * 60 + scanMin;
    const disMinutes = disHour * 60 + disMin;
    return scanMinutes < disMinutes;
}

function isLateExit(scanTime, dismissalTime) {
    if (!dismissalTime) return false;
    const [scanHour, scanMin] = scanTime.split(':').map(Number);
    const [disHour, disMin] = dismissalTime.split(':').map(Number);
    const scanMinutes = scanHour * 60 + scanMin;
    const disMinutes = disHour * 60 + disMin;
    return scanMinutes > disMinutes + 30;
}

function setWelcomeMessage(elementId, user) {
    const el = document.getElementById(elementId);
    if (el && user && user.full_name) el.innerText = user.full_name;
}

// ============================================================================
// PHASE 4: PARTIAL ABSENCE, PATTERN DETECTION, ADMIN ALERTS
// ============================================================================

async function sendPartialAbsenceNotification(studentId, absenceType) {
    try {
        const student = await getStudentById(studentId);
        if (!student || !student.parent_id) return;
        const message = absenceType === 'Morning Absent'
            ? `Your child ${student.full_name} was marked as absent this morning. Please submit an excuse letter.`
            : `Your child ${student.full_name} did not return this afternoon. Please submit an excuse letter.`;
        await supabase.from('notifications').insert({
            recipient_id: student.parent_id,
            recipient_role: 'parent',
            title: absenceType === 'Morning Absent' ? 'Morning Absence Notice' : 'Afternoon Absence Notice',
            message: message,
            type: 'absence_reminder'
        });
    } catch (error) { console.error('sendPartialAbsenceNotification error:', error); }
}

async function checkPartialAbsence(studentId, direction, status) {
    try {
        const today = getLocalISOString();
        const currentHour = new Date().getHours();
        const { data: logs, error } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', studentId)
            .eq('log_date', today);
        if (error || !logs || logs.length === 0) return;

        if (direction === 'ENTRY' && currentHour >= 12) {
            const hasMorningRecord = logs.some(log => {
                const logTime = new Date(log.time_in).getHours();
                return logTime < 12;
            });
            if (!hasMorningRecord) {
                await supabase.from('attendance_logs').insert({
                    student_id: studentId,
                    log_date: today,
                    time_in: new Date().toISOString(),
                    status: 'Morning Absent',
                    morning_absent: true,
                    remarks: 'Auto-marked: Morning Absent - Please submit excuse letter'
                });
                await sendPartialAbsenceNotification(studentId, 'Morning Absent');
            }
        }

        if (direction === 'EXIT' && currentHour < 12) {
            const hasAfternoonReturn = logs.some(log => {
                if (!log.time_out) return false;
                const returnTime = new Date(log.time_out).getHours();
                return returnTime >= 12;
            });
            if (!hasAfternoonReturn) {
                const latestLog = logs.find(log => log.time_in && !log.time_out);
                if (latestLog) {
                    await supabase.from('attendance_logs')
                        .update({ afternoon_absent: true })
                        .eq('id', latestLog.id);
                }
                await sendPartialAbsenceNotification(studentId, 'Afternoon Absent');
            }
        }
    } catch (error) { console.error('checkPartialAbsence error:', error); }
}

async function createAttendancePattern(studentId, patternType, description, severity) {
    try {
        const today = getLocalISOString();
        const { data: existing } = await supabase
            .from('attendance_patterns')
            .select('*')
            .eq('student_id', studentId)
            .eq('pattern_type', patternType)
            .gte('created_at', today);
        if (existing && existing.length > 0) return;
        await supabase.from('attendance_patterns').insert({
            student_id: studentId,
            pattern_type: patternType,
            description: description,
            severity: severity
        });
    } catch (error) { console.error('createAttendancePattern error:', error); }
}

async function detectAttendancePatterns(student, direction, status) {
    try {
        const studentId = student.id;
        const { data: recentLogs } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', studentId)
            .gte('time_in', new Date(Date.now() - 10 * 60 * 1000).toISOString())
            .order('time_in', { ascending: false });

        if (recentLogs && recentLogs.length >= 3) {
            await createAttendancePattern(studentId, 'rapid_scans',
                `${student.full_name} scanned multiple times rapidly - possible system test`, 'medium');
        }

        if (direction === 'EXIT' && recentLogs && recentLogs.length > 0) {
            const lastLog = recentLogs[0];
            if (lastLog && lastLog.time_in) {
                const entryTime = new Date(lastLog.time_in).getTime();
                const exitTime = Date.now();
                if (exitTime - entryTime < 5 * 60 * 1000) {
                    await createAttendancePattern(studentId, 'immediate_exit',
                        `${student.full_name} left immediately after entering - suspicious behavior`, 'high');
                }
            }
        }

        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: lateLogs } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', studentId)
            .eq('status', 'Late')
            .gte('time_in', weekAgo);
        if (lateLogs && lateLogs.length >= 3) {
            await createAttendancePattern(studentId, 'frequent_late',
                `${student.full_name} was late ${lateLogs.length} times this week`, 'medium');
        }

        const { data: earlyExitLogs } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', studentId)
            .eq('status', 'Early Exit')
            .gte('time_in', weekAgo);
        if (earlyExitLogs && earlyExitLogs.length >= 3) {
            await createAttendancePattern(studentId, 'frequent_early_exit',
                `${student.full_name} left early ${earlyExitLogs.length} times this week`, 'medium');
        }
    } catch (error) { console.error('detectAttendancePatterns error:', error); }
}

async function createAdminAlert(student, direction, status) {
    try {
        const { data: recentPatterns } = await supabase
            .from('attendance_patterns')
            .select('*')
            .eq('student_id', student.id)
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .in('severity', ['high', 'medium']);
        if (!recentPatterns || recentPatterns.length === 0) return;

        const hasHighSeverity = recentPatterns.some(p => p.severity === 'high');
        const mediumCount = recentPatterns.filter(p => p.severity === 'medium').length;
        if (hasHighSeverity || mediumCount >= 2) {
            let gradeLevel = 'Unknown';
            if (student.classes) gradeLevel = student.classes.grade_level || 'Unknown';
            await supabase.from('admin_alerts').insert({
                alert_type: 'attendance_pattern',
                title: 'Student Attendance Alert',
                message: `${student.full_name} (${gradeLevel}) has multiple attendance irregularities. Please review.`,
                severity: hasHighSeverity ? 'high' : 'medium',
                metadata: {
                    student_id: student.id,
                    student_name: student.full_name,
                    patterns: recentPatterns.map(p => p.pattern_type)
                }
            });
        }
    } catch (error) { console.error('createAdminAlert error:', error); }
}

// ============================================================================
// MOBILE SIDEBAR TOGGLE
// ============================================================================

function toggleMobileSidebar() {
    const sidebar = document.getElementById('mobile-sidebar');
    if (sidebar) sidebar.classList.toggle('hidden');
}

// ============================================================================
// SCANNER INITIALIZATION & CORE LOGIC
// ============================================================================

function startScanningProcess() {
    const overlay = document.getElementById('start-overlay');
    if (overlay) overlay.classList.add('hidden');
    try {
        const audio = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audio.createOscillator();
        osc.connect(audio.destination);
        osc.start();
        osc.stop(audio.currentTime + 0.001);
    } catch (e) { console.log('Audio unlock failed', e); }
    initializeScanner();
}

document.addEventListener('DOMContentLoaded', () => {
    if (currentUser) setWelcomeMessage('guard-name', currentUser);
});

function initializeScanner() {
    startCameraScanner();
    setupUsbScanner();
}

function startCameraScanner() {
    const readerElement = document.getElementById('reader');
    if (!readerElement) return;
    if (typeof jsQR === 'undefined') {
        console.warn('jsQR not loaded');
        return;
    }
    video = document.createElement('video');
    video.setAttribute('playsinline', 'true');
    video.setAttribute('autoplay', 'true');
    video.muted = true;
    canvas = document.createElement('canvas');
    canvasContext = canvas.getContext('2d', { willReadFrequently: true });
    readerElement.appendChild(video);
    startCamera();
}

async function startCamera() {
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        video.srcObject = videoStream;
        video.onloadedmetadata = () => {
            video.play();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            scanFrame();
        };
    } catch (error) {
        console.error('Camera error:', error);
        showError('Cannot access camera. Please allow permissions.');
    }
}

function scanFrame() {
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationFrameId = requestAnimationFrame(scanFrame);
        return;
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

function setupUsbScanner() {
    const hiddenInput = document.getElementById('usb-scanner-input');
    if (!hiddenInput) return;
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
    hiddenInput.focus();
    document.addEventListener('click', () => hiddenInput.focus());
}

function validateQRCode(qrCode) { return SCAN_REGEX.test(qrCode); }
function extractStudentId(qrCode) { return qrCode; }

async function onScanSuccess(decodedText) {
    const now = Date.now();
    if (now - lastScanTime < ANTI_DUPLICATE_THRESHOLD) {
        playBuzzer();
        triggerScanFeedback(false, 'Duplicate scan - please wait', 'DUPLICATE', '');
        return;
    }
    lastScanTime = now;
    playBeepSound();
    if (!validateQRCode(decodedText)) { showError('Invalid QR Code format.'); return; }
    const studentId = extractStudentId(decodedText);
    if (!studentId) { showError('Could not extract student ID.'); return; }
    await handleScan(studentId, decodedText);
}

// ============================================================================
// MAIN SCAN PROCESSING
// ============================================================================

async function handleScan(studentId, qrCode) {
    try {
        showLoading(true);
        const gateStatus = await evaluateGateStatus();
        const statusIndicator = document.getElementById('status-indicator');
        if (statusIndicator && !gateStatus.allowEntry) {
            statusIndicator.innerHTML = `<span class="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold animate-pulse">${gateStatus.message}</span>`;
        } else if (statusIndicator && gateStatus.active) {
            statusIndicator.innerHTML = `<span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">GATE ACTIVE</span>`;
        }
        if (!gateStatus.active) { showWarning(gateStatus.message); return; }

        const today = getLocalISOString();
        const holidayCheck = await checkIsHoliday(today);
        if (holidayCheck.isHoliday && holidayCheck.isSuspended) {
            const currentHour = new Date().getHours();
            if (holidayCheck.timeCoverage === 'Morning' && currentHour >= 12) {
                // allowed
            } else if (holidayCheck.timeCoverage === 'Afternoon' && currentHour < 12) {
                // allowed
            } else {
                showWarning(`School suspended: ${holidayCheck.description}`);
                return;
            }
        }

        const student = await getStudentById(studentId);
        if (!student) { showError('Student not found.'); return; }
        if (student.status !== 'Enrolled') { showError(`Student account is ${student.status}.`); return; }

        const lastLog = await getLastLogToday(student.id);
        let direction = determineTapDirection(lastLog);
        if (!gateStatus.allowEntry && direction === 'ENTRY') { showError(`ENTRY DENIED: ${gateStatus.message}`); return; }
        if (lastLog?.status === 'Excused' && direction === 'ENTRY') { showWarning(`${student.full_name} already excused today.`); return; }

        const nowDate = new Date();
        const scanTime = nowDate.toTimeString().slice(0,5);
        const gradeLevel = await getGradeLevel(student.class_id);
        const lateThreshold = await getLateThreshold(gradeLevel);
        const dismissalTime = await getDismissalTime(gradeLevel);
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

        // Phase 4 calls
        await checkPartialAbsence(student.id, direction, statusInfo.status);
        await detectAttendancePatterns(student, direction, statusInfo.status);
        await createAdminAlert(student, direction, statusInfo.status);

        displayScanResult(student, direction, statusInfo, scanTime);
        addToRecentScans(student, direction, statusInfo, scanTime);
    } catch (err) {
        console.error('handleScan error:', err);
        showError('Error processing scan.');
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

async function getStudentById(studentId) {
    try {
        let { data, error } = await supabase
            .from('students')
            .select(`id, student_id_text, full_name, qr_code_data, profile_photo_url, class_id, parent_id, status, classes(grade_level, department)`)
            .eq('student_id_text', studentId)
            .maybeSingle();
        if (!data && !error) {
            const res2 = await supabase.from('students').select('*').eq('qr_code_data', studentId).maybeSingle();
            if (res2.data) data = res2.data;
        }
        if (!data && !error) {
            const res3 = await supabase.from('students').select('*').eq('lrn', studentId).maybeSingle();
            if (res3.data) data = res3.data;
        }
        if (!data || error) return null;
        if (data.status !== 'Enrolled') return null;
        return data;
    } catch (e) { return null; }
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

function determineTapDirection(lastLog) {
    if (!lastLog) return 'ENTRY';
    if (lastLog.time_in && !lastLog.time_out) return 'EXIT';
    return 'ENTRY';
}

async function saveAttendanceLog(studentId, direction, status) {
    const today = getLocalISOString();
    const now = new Date().toISOString();
    if (direction === 'ENTRY') {
        const { data, error } = await supabase.from('attendance_logs')
            .insert({ student_id: studentId, log_date: today, time_in: now, status, remarks: '' })
            .select().single();
        if (error) throw error;
        return data;
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
            return existing[0];
        } else {
            const { data } = await supabase.from('attendance_logs')
                .insert({ student_id: studentId, log_date: today, time_in: now, time_out: now, status, remarks: '' })
                .select().single();
            return data;
        }
    }
}

async function createNotification(studentId, direction, status) {
    const student = await getStudentById(studentId);
    if (!student?.parent_id) return;
    const time = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12: true });
    const notifType = direction === 'ENTRY' ? 'gate_entry' : 'gate_exit';
    const action = direction === 'ENTRY' ? 'entered' : 'exited';
    const message = `Your child, ${student.full_name}, ${action} at ${time} (${status})`;
    await supabase.from('notifications').insert({
        recipient_id: student.parent_id,
        recipient_role: 'parent',
        title: direction === 'ENTRY' ? 'Arrival Alert' : 'Departure Alert',
        message, type: notifType
    });

    if (['Late', 'Early Exit', 'Late Exit'].includes(status)) {
        let alertTitle = '';
        if (status === 'Late') alertTitle = 'Late Arrival Notice';
        else if (status === 'Early Exit') alertTitle = 'Early Dismissal Notice';
        else if (status === 'Late Exit') alertTitle = 'Late Exit Notice';
        
        await supabase.from('notifications').insert({
            recipient_id: student.parent_id,
            recipient_role: 'parent',
            title: alertTitle,
            message: `Your child ${student.full_name} ${status === 'Late' ? 'arrived late' : 'left early'} at ${time}. Status: ${status}`,
            type: 'attendance_alert'
        });
    }
}

async function notifyTeacher(student, direction, status) {
    if (!student.class_id) return;
    const { data: classData } = await supabase.from('classes').select('adviser_id').eq('id', student.class_id).maybeSingle();
    if (!classData?.adviser_id) return;
    const time = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12: true });
    const grade = student.classes?.grade_level || 'Unknown';
    const section = student.classes?.department || '';
    let title='', message='';
    if (status === 'Late') { title='Late Arrival Alert'; message=`${student.full_name} (${grade} - ${section}) arrived LATE at ${time}`; }
    else if (status === 'Early Exit') { title='Early Exit Alert'; message=`${student.full_name} (${grade} - ${section}) left EARLY at ${time}`; }
    else if (status === 'Late Exit') { title='Late Exit Alert'; message=`${student.full_name} (${grade} - ${section}) left LATE at ${time}`; }
    if (title) await supabase.from('notifications').insert({ recipient_id: classData.adviser_id, recipient_role: 'teacher', title, message, type:'attendance_alert' });
}

async function checkClinicStatus(studentId) {
    const { data } = await supabase
        .from('clinic_visits')
        .select('action_taken')
        .eq('student_id', studentId)
        .is('time_out', null)
        .order('time_in', { ascending: false })
        .limit(1);
    if (data?.length && data[0].action_taken?.toLowerCase().includes('sent home')) return true;
    return false;
}

function calculateStatus(scanTime, direction, gradeLevel, lateThreshold, dismissalTime) {
    const result = { status: 'Normal', backgroundColor: 'bg-green-600', message: '', icon: '✓' };
    if (direction === 'ENTRY') {
        if (isLate(scanTime, gradeLevel, lateThreshold)) {
            result.status = 'Late';
            result.backgroundColor = 'bg-yellow-500';
            result.message = `Late Arrival (Threshold: ${lateThreshold})`;
            result.icon = '⏰';
        } else {
            result.status = 'On Time';
            result.message = 'On Time';
        }
    } else {
        if (isEarlyExit(scanTime, dismissalTime)) {
            result.status = 'Early Exit';
            result.backgroundColor = 'bg-red-600';
            result.message = `Early Exit (Dismissal: ${dismissalTime})`;
            result.icon = '⚠️';
        } else if (isLateExit(scanTime, dismissalTime)) {
            result.status = 'Late Exit';
            result.backgroundColor = 'bg-yellow-500';
            result.message = `Late Exit (>${dismissalTime}+30min)`;
            result.icon = '⏰';
        } else {
            result.status = 'Normal Exit';
            result.message = 'Normal Dismissal';
        }
    }
    return result;
}

// ============================================================================
// UI HELPERS
// ============================================================================

function displayScanResult(student, direction, statusInfo, scanTime) {
    const resultCard = document.getElementById('scan-result');
    const placeholder = document.getElementById('scan-placeholder');
    const studentName = document.getElementById('student-name');
    const studentInfo = document.getElementById('student-info');
    const statusBadge = document.getElementById('status-badge');
    const studentImg = document.getElementById('student-img');
    if (!resultCard) return;
    placeholder.classList.add('hidden');
    resultCard.classList.remove('hidden');
    studentName.innerText = student.full_name;
    const grade = student.classes?.grade_level || 'Unknown';
    const section = student.classes?.department || '';
    studentInfo.innerText = `${grade} ${section} • ${student.student_id_text}`;
    if (student.profile_photo_url) { studentImg.src = student.profile_photo_url; studentImg.parentElement.style.display = 'block'; }
    else { studentImg.parentElement.style.display = 'none'; }
    statusBadge.className = `inline-block px-8 py-4 rounded-lg text-2xl font-bold ${statusInfo.backgroundColor} text-white shadow-lg`;
    statusBadge.innerHTML = `<span class="block">${statusInfo.status}</span><span class="block text-sm font-normal mt-1">${statusInfo.message} • ${formatTime(scanTime)}</span>`;
}

function addToRecentScans(student, direction, statusInfo, scanTime) {
    const recentList = document.getElementById('recent-scans-list');
    if (!recentList) return;
    const grade = student.classes?.grade_level || '';
    const action = direction === 'ENTRY' ? 'Entered' : 'Exited';
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-4 bg-gray-800 rounded-lg mb-2';
    div.innerHTML = `
        <div class="flex items-center gap-3">
            <div class="h-10 w-10 rounded-full bg-gray-600 flex items-center justify-center">${student.profile_photo_url ? `<img src="${student.profile_photo_url}" class="h-full w-full object-cover">` : '👤'}</div>
            <div><p class="font-semibold">${student.full_name}</p><p class="text-sm text-gray-400">${grade} • ${scanTime}</p></div>
        </div>
        <span class="px-3 py-1 rounded text-sm font-bold ${statusInfo.backgroundColor} text-white">${action}</span>
    `;
    recentList.prepend(div);
    while (recentList.children.length > 10) recentList.removeChild(recentList.lastChild);
}

function showLoading(show) {
    const el = document.getElementById('loading-indicator');
    if (el) el.classList.toggle('hidden', !show);
}
function showError(msg) {
    const el = document.getElementById('error-message');
    if (el) { el.innerText = msg; el.classList.remove('hidden'); setTimeout(() => el.classList.add('hidden'), 3000); }
    else alert(msg);
}
function showWarning(msg) {
    const el = document.getElementById('warning-message');
    if (el) { el.innerText = msg; el.classList.remove('hidden'); setTimeout(() => el.classList.add('hidden'), 3000); }
    else alert(msg);
}
function playBeepSound() {
    try {
        const audio = new Audio('https://www.soundjay.com/button/beep-07.wav');
        audio.volume = 0.5;
        audio.play().catch(e => console.log('Audio play failed:', e));
    } catch (e) { console.log('Audio not available'); }
}
function formatTime(time24) {
    const [h,m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2,'0')} ${period}`;
}

function triggerScanFeedback(isSuccess, message, actionType, status) {
    // optional visual overlay – kept for compatibility
}

function playBeep() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.frequency.value = 800; gain.gain.value = 0.1;
    osc.start(); setTimeout(() => osc.stop(), 150);
}
function playBuzzer() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.frequency.value = 200; osc.type = 'sawtooth'; gain.gain.value = 0.1;
    osc.start(); setTimeout(() => osc.stop(), 300);
}

// Audio unlock on first click
document.body?.addEventListener('click', () => { if (audioCtx.state === 'suspended') audioCtx.resume(); }, { once: true });

window.addEventListener('beforeunload', () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (videoStream) videoStream.getTracks().forEach(t => t.stop());
});

window.toggleMobileSidebar = toggleMobileSidebar;