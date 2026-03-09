// clinic/clinic-scanner.js - jsQR Implementation

document.addEventListener('DOMContentLoaded', () => {
    initializeScanner();
    
    const timeEl = document.getElementById('current-time');
    setInterval(() => {
        if (timeEl) timeEl.innerText = new Date().toLocaleTimeString('en-US');
    }, 1000);
});

// NEW: QR Code format validation regex
// Matches: EDU-YYYY-LLLL-XXXX (e.g., EDU-2026-G001-A1B2)
const SCAN_REGEX = /^EDU-\d{4}-[GK]\d{3}-[A-Z0-9]{4}$/;

// jsQR scanner variables
let videoStream = null;
let video = null;
let canvas = null;
let canvasContext = null;
let animationFrameId = null;
let lastScanTime = 0;
const SCAN_COOLDOWN = 3000; // 3 seconds cooldown between scans

/**
 * Validate student ID format
 * @param {string} studentId - The student ID to validate
 * @returns {boolean} - True if valid format
 */
function validateStudentIdFormat(studentId) {
    if (!studentId || typeof studentId !== 'string') {
        return false;
    }
    return SCAN_REGEX.test(studentId.trim());
}

/**
 * Initialize the jsQR scanner
 */
function initializeScanner() {
    const readerElement = document.getElementById('qr-reader');
    
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
            if (now - lastScanTime > SCAN_COOLDOWN) {
                lastScanTime = now;
                handleScanSuccess(code.data);
            }
        }
    }
    
    // Continue scanning
    animationFrameId = requestAnimationFrame(scanFrame);
}

/**
 * Handle successful QR code scan
 * @param {string} decodedText - The scanned QR code data
 */
async function handleScanSuccess(decodedText) {
    const statusIndicator = document.getElementById('status-indicator');
    
    // Validate QR code format first
    if (!validateStudentIdFormat(decodedText)) {
        statusIndicator.innerHTML = `<p class="text-red-400">Invalid QR Code format. Expected: EDU-YYYY-G001-XXXX</p>`;
        document.getElementById('last-scan').classList.remove('hidden');
        document.getElementById('scan-student-name').innerText = 'Invalid Format';
        document.getElementById('scan-status').innerText = 'Please scan a valid student ID';
        document.getElementById('scan-status').className = 'text-lg font-medium text-red-400';
        return;
    }
    
    statusIndicator.innerHTML = `<p class="text-yellow-300">Processing: ${decodedText}</p>`;

    try {
        // Query by student_id_text field (the new format)
        const { data: student, error: studentError } = await supabase
            .from('students').select('id, full_name, student_id_text')
            .eq('student_id_text', decodedText)
            .single();

        if (studentError || !student) {
            throw new Error('Student ID not found. Please register first.');
        }

        // Check for approved clinic pass
        const { data: visit, error: visitError } = await supabase
            .from('clinic_visits')
            .select('id, time_in, action_taken')
            .eq('student_id', student.id)
            .eq('status', 'Approved')
            .is('time_out', null)
            .maybeSingle();

        if (visitError) throw visitError;
        if (!visit) {
            throw new Error(`${student.full_name} does not have an approved clinic pass.`);
        }

        // Check in the student
        await clinicCheckIn(visit.id);

        document.getElementById('last-scan').classList.remove('hidden');
        document.getElementById('scan-student-name').innerText = student.full_name;
        document.getElementById('scan-status').innerText = 'Checked In Successfully';
        document.getElementById('scan-status').className = 'text-lg font-medium text-green-400';
        statusIndicator.innerHTML = `<p class="text-green-300">Success!</p>`;

    } catch (error) {
        document.getElementById('last-scan').classList.remove('hidden');
        document.getElementById('scan-student-name').innerText = 'Scan Error';
        document.getElementById('scan-status').innerText = error.message;
        document.getElementById('scan-status').className = 'text-lg font-medium text-red-400';
        statusIndicator.innerHTML = `<p class="text-red-300">Error!</p>`;
    }
}

/**
 * Check in a student at the clinic
 * @param {number} visitId - The clinic visit ID
 */
async function clinicCheckIn(visitId) {
    // FIX: Timezone-adjusted timestamp so morning patients appear on today's analytics
    const localDate = new Date();
    localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
    const now = localDate.toISOString();

    const { error } = await supabase
        .from('clinic_visits')
        .update({ time_in: now })
        .eq('id', visitId);
    
    if (error) {
        console.error('Error checking in student:', error);
        throw new Error('Failed to check in at clinic');
    }
}

/**
 * Stop the scanner and release camera
 */
function stopScanner() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', stopScanner);

