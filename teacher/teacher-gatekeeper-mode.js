// teacher/teacher-gatekeeper-mode.js

// Ensure teacher is logged in and has gatekeeper rights
const currentUser = checkSession('teachers');
if (!currentUser || !currentUser.is_gatekeeper) {
    // Use custom toast for early message before core loads
    showToast("Unauthorized Access. Redirecting to dashboard.", 'error');
    setTimeout(() => {
        window.location.href = 'teacher-dashboard.html';
    }, 2000);
}

// Global variables for scanner logic
let html5QrcodeScanner;
let lastScanResult = null;
const SCAN_DEBOUNCE_MS = 3000; // 3 seconds between scans of the same ID

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    initializeDateTime();
    initializeScanner();
});

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

// Initialize the QR code scanner
function initializeScanner() {
    if (typeof Html5QrcodeScanner === "undefined") {
        console.error("html5-qrcode library not loaded.");
        return;
    }

    function onScanSuccess(decodedText, decodedResult) {
        if (lastScanResult === decodedText) {
            return;
        }
        lastScanResult = decodedText;
        setTimeout(() => { lastScanResult = null; }, SCAN_DEBOUNCE_MS);

        processScan(decodedText);
    }

    function onScanFailure(error) {
        // This can be noisy, so it's commented out.
        // console.warn(`QR scan error: ${error}`);
    }

    html5QrcodeScanner = new Html5QrcodeScanner(
        "qr-reader", 
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
    );
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
}

// Main logic to process a scan
async function processScan(studentIdText) {
    const statusIndicator = document.getElementById('status-indicator');
    statusIndicator.innerHTML = `<p class="text-sm text-yellow-300">Processing: ${studentIdText}</p>`;
    
    try {
        const { data: student, error: studentError } = await supabase
            .from('students')
            .select('id, full_name, classes(grade_level, section_name)')
            .eq('student_id_text', studentIdText)
            .single();

        if (studentError || !student) throw new Error('Student ID not found.');

        // Get student grade level
        const gradeLevel = student.classes?.grade_level;
        if (!gradeLevel) {
            throw new Error('Student grade level not found. Please contact administrator.');
        }
        
        const today = new Date().toISOString().split('T')[0];
        const { data: lastLog, error: logError } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', student.id)
            .eq('log_date', today)
            .is('time_out', null)
            .maybeSingle();

        if (logError) throw logError;

        const now = new Date();
        const scanTime = now.toTimeString().split(' ')[0].substring(0, 5);
        let action, status, logData;

        if (lastLog) {
            action = 'EXIT';
            const dismissalTime = await getDismissalTime(gradeLevel);
            status = isEarlyExit(scanTime, dismissalTime) ? 'Early Exit' : 'Normal Exit';
            
            logData = await supabase
                .from('attendance_logs')
                .update({ time_out: now.toISOString(), status: status })
                .eq('id', lastLog.id)
                .select()
                .single();

        } else {
            action = 'ENTRY';
            const lateThreshold = await getLateThreshold(gradeLevel);
            status = isLate(scanTime, gradeLevel, lateThreshold) ? 'Late' : 'On Time';

            logData = await supabase
                .from('attendance_logs')
                .insert({
                    student_id: student.id,
                    log_date: today,
                    time_in: now.toISOString(),
                    status: status
                })
                .select()
                .single();
        }
        
        if (logData.error) throw logData.error;

        updateLastScanUI(student, action, status, scanTime);
        playAudioFeedback(status);
        showToast(`${student.full_name} scanned ${action.toLowerCase()} successfully.`, 'success');

    } catch (error) {
        console.error('Scan processing error:', error);
        updateLastScanUI(null, 'ERROR', error.message, new Date().toTimeString().split(' ')[0].substring(0, 5));
        playAudioFeedback('error');
        showToast(error.message, 'error');
    } finally {
        statusIndicator.innerHTML = `<p class="text-sm text-slate-300">Ready to scan next student ID</p>`;
    }
}

// UI Update function
function updateLastScanUI(student, action, status, time) {
    const lastScanEl = document.getElementById('last-scan');
    const studentNameEl = document.getElementById('scan-student-name');
    const statusEl = document.getElementById('scan-status');
    const timeEl = document.getElementById('scan-time');
    const actionEl = document.getElementById('scan-action');

    lastScanEl.classList.remove('hidden');
    
    if (student) {
        studentNameEl.textContent = student.full_name;
        statusEl.textContent = status;
        timeEl.textContent = `Time: ${time}`;
        actionEl.textContent = action;
        
        let actionColor = 'bg-green-600';
        if (action === 'EXIT') actionColor = 'bg-blue-600';
        if (action === 'ERROR') actionColor = 'bg-red-600';
        actionEl.className = `px-3 py-1 rounded-full text-xs font-bold uppercase ${actionColor}`;
        
        let statusColor = 'text-green-400';
        if (status === 'Late' || status === 'Early Exit') statusColor = 'text-yellow-400';
        if (action === 'ERROR') statusColor = 'text-red-400';
        statusEl.className = `text-lg font-medium ${statusColor}`;

    } else {
        studentNameEl.textContent = 'Scan Error';
        statusEl.textContent = status; // The error message
        timeEl.textContent = `Time: ${time}`;
        actionEl.textContent = 'ERROR';
        actionEl.className = 'px-3 py-1 rounded-full text-xs font-bold uppercase bg-red-600';
        statusEl.className = 'text-lg font-medium text-red-400';
    }
}

// Audio feedback
function playAudioFeedback(status) {
    let audioId = 'audio-success';
    if (status === 'Late' || status === 'Early Exit') {
        audioId = 'audio-late';
    } else if (status === 'error') {
        audioId = 'audio-error';
    }
    document.getElementById(audioId)?.play().catch(e => console.warn("Audio play failed:", e));
}

// Toast notifications
function showToast(message, type = 'success') {
    const toastId = type === 'success' ? 'toast-success' : 'toast-error';
    const toast = document.getElementById(toastId);
    
    if (toast) {
        toast.innerHTML = message;
        toast.classList.remove('translate-y-24', 'opacity-0');
        setTimeout(() => {
            toast.classList.add('translate-y-24', 'opacity-0');
        }, 3000);
    }
}

// Manual Entry Modal
function showManualEntry() {
    document.getElementById('manual-entry-modal').classList.remove('hidden');
    document.getElementById('manual-entry-modal').classList.add('flex');
    document.getElementById('manual-student-id').focus();
}

function closeManualEntry() {
    document.getElementById('manual-entry-modal').classList.add('hidden');
    document.getElementById('manual-entry-modal').classList.remove('flex');
}

function submitManualEntry() {
    const studentId = document.getElementById('manual-student-id').value.trim();
    if (studentId) {
        processScan(studentId).then(() => {
            // Clear the input after successful submission
            document.getElementById('manual-student-id').value = '';
        });
    }
    closeManualEntry();
}

// ============================================
// MISSING HELPER FUNCTIONS FOR GATEKEEPER MODE
// ============================================

// Get dismissal time based on grade level
async function getDismissalTime(gradeLevel) {
    // Default dismissal times by grade level
    const defaultDismissalTimes = {
        'Kinder': '14:30',
        'Grade 1': '15:00',
        'Grade 2': '15:00',
        'Grade 3': '15:00',
        'Grade 4': '15:30',
        'Grade 5': '15:30',
        'Grade 6': '15:30',
        'Grade 7': '16:00',
        'Grade 8': '16:00',
        'Grade 9': '16:00',
        'Grade 10': '16:00',
        'Grade 11': '16:30',
        'Grade 12': '16:30'
    };
    
    // Try to get from grade_schedules table
    try {
        const { data: schedule, error } = await supabase
            .from('grade_schedules')
            .select('end_time')
            .eq('grade_level', gradeLevel)
            .single();
        
        if (!error && schedule && schedule.end_time) {
            // Convert time to HH:MM format
            const endTime = schedule.end_time;
            if (typeof endTime === 'string') {
                return endTime.substring(0, 5);
            }
        }
    } catch (e) {
        console.warn('Could not fetch grade schedule, using default:', e);
    }
    
    // Return default or fallback
    return defaultDismissalTimes[gradeLevel] || '15:30';
}

// Get late threshold based on grade level
async function getLateThreshold(gradeLevel) {
    // Default late thresholds (typically 15 min after start time)
    const defaultLateThresholds = {
        'Kinder': '07:45',
        'Grade 1': '07:45',
        'Grade 2': '07:45',
        'Grade 3': '07:45',
        'Grade 4': '07:45',
        'Grade 5': '07:45',
        'Grade 6': '07:45',
        'Grade 7': '07:30',
        'Grade 8': '07:30',
        'Grade 9': '07:30',
        'Grade 10': '07:30',
        'Grade 11': '07:30',
        'Grade 12': '07:30'
    };
    
    // Try to get from grade_schedules table
    try {
        const { data: schedule, error } = await supabase
            .from('grade_schedules')
            .select('late_threshold')
            .eq('grade_level', gradeLevel)
            .single();
        
        if (!error && schedule && schedule.late_threshold) {
            const lateThreshold = schedule.late_threshold;
            if (typeof lateThreshold === 'string') {
                return lateThreshold.substring(0, 5);
            }
        }
    } catch (e) {
        console.warn('Could not fetch grade schedule, using default:', e);
    }
    
    return defaultLateThresholds[gradeLevel] || '07:45';
}

// Check if student is late
function isLate(scanTime, gradeLevel, threshold) {
    // threshold should be in HH:MM format
    return scanTime > threshold;
}

// Check if student is leaving early
function isEarlyExit(scanTime, dismissalTime) {
    // If scan time is before dismissal time, it's early exit
    return scanTime < dismissalTime;
}