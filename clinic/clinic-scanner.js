// clinic/clinic-scanner.js - jsQR Implementation

document.addEventListener('DOMContentLoaded', () => {
    initializeScanner();
    
    const timeEl = document.getElementById('current-time');
    setInterval(() => {
        if (timeEl) timeEl.innerText = new Date().toLocaleTimeString('en-US');
    }, 1000);
});

// UPDATED: Standardized QR format - EDU-YYYY-LLLL-XXXX (accepts 4-6 char suffix)
const SCAN_REGEX = /^EDU-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4,6}$/i;

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
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationFrameId = requestAnimationFrame(scanFrame);
        return;
    }
    
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
    
    // Continue scanning
    animationFrameId = requestAnimationFrame(scanFrame);
}

/**
 * Handle successful QR code scan
 * ENHANCED: Includes button locking, walk-in creation, and better notifications
 * @param {string} decodedText - The scanned QR code data
 */
async function handleScanSuccess(decodedText) {
    const statusIndicator = document.getElementById('status-indicator');
    const scanButton = document.getElementById('manual-scan-btn');
    const lastScanDiv = document.getElementById('last-scan');
    const studentNameEl = document.getElementById('scan-student-name');
    const scanStatusEl = document.getElementById('scan-status');
    
    // ==========================================
    // PHASE 2: BUTTON LOCKING (Anti-Redundancy)
    // ==========================================
    // Lock button during processing to prevent double-entries
    if (scanButton) {
        scanButton.disabled = true;
        scanButton.innerHTML = '<i class="animate-spin mr-2">⏳</i> Processing...';
    }
    
    // Validate QR code format first
    if (!validateStudentIdFormat(decodedText)) {
        statusIndicator.innerHTML = `<p class="text-red-400">Invalid QR Code format. Expected: EDU-YYYY-G001-XXXX</p>`;
        lastScanDiv.classList.remove('hidden');
        studentNameEl.innerText = 'Invalid Format';
        scanStatusEl.innerText = 'Please scan a valid student ID';
        scanStatusEl.className = 'text-lg font-medium text-red-400';
        
        // Unlock button on error
        if (scanButton) {
            scanButton.disabled = false;
            scanButton.innerHTML = '<i data-lucide="search" class="w-5 h-5 mr-2"></i> Search';
            lucide.createIcons();
        }
        return;
    }
    
    statusIndicator.innerHTML = `<p class="text-yellow-300">Processing: ${decodedText}</p>`;
    lastScanDiv.classList.add('hidden'); // Hide until complete

    try {
        // Query by student_id_text field (the new format)
        const { data: student, error: studentError } = await supabase
            .from('students')
            .select('id, full_name, student_id_text, class_id, status, classes(grade_level, department, adviser_id), parent_id')
            .eq('student_id_text', decodedText)
            .single();

        if (studentError || !student) {
            throw new Error('Student ID not found. Please register first.');
        }
        
        // Check if student is active/enrolled - reject dropped/inactive students
        if (student.status === 'Dropped' || student.status === 'Inactive') {
            throw new Error('Student record is not active. Cannot use clinic services.');
        }

        // ==========================================
        // CHECK-IN WORKFLOW: Pending → Approved → Walk-in
        // ==========================================
        // First check for any existing pending/approved visits
        const { data: existingVisit } = await supabase
            .from('clinic_visits')
            .select('id, status, time_in, action_taken')
            .eq('student_id', student.id)
            .in('status', ['Pending', 'Approved', 'In Clinic'])
            .is('time_out', null)
            .order('time_in', { ascending: false })
            .limit(1)
            .maybeSingle();

        let visitResult = null;
        
        if (existingVisit) {
            // ==========================================
            // Case 1: Existing pending/approved visit found
            // ==========================================
            if (existingVisit.status === 'Pending') {
                // Auto-approve and check in
                await supabase
                    .from('clinic_visits')
                    .update({ 
                        status: 'In Clinic',
                        time_in: new Date().toISOString()
                    })
                    .eq('id', existingVisit.id);
                
                visitResult = { type: 'Admitted', name: student.full_name, action: 'Auto-approved from Pending' };
                
            } else if (existingVisit.status === 'Approved') {
                // Check in the student
                await supabase
                    .from('clinic_visits')
                    .update({ 
                        time_in: new Date().toISOString(),
                        status: 'In Clinic'
                    })
                    .eq('id', existingVisit.id);
                
                visitResult = { type: 'Checked In', name: student.full_name, action: 'From Approved Pass' };
                
            } else if (existingVisit.status === 'In Clinic') {
                // Already in clinic - just show info
                visitResult = { type: 'Already In', name: student.full_name, action: 'Currently at Clinic' };
            }
        } else {
            // ==========================================
            // Case 2: No existing visit - Create Walk-in
            // ==========================================
            // Use the general-core.js getLocalISOString() if available
            const localDate = new Date();
            localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
            const now = localDate.toISOString();
            
            // Create new walk-in visit record
            const { data: newVisit, error: createError } = await supabase
                .from('clinic_visits')
                .insert({
                    student_id: student.id,
                    status: 'In Clinic',
                    reason: 'Walk-in (No pass)',
                    referred_by_teacher_id: student.classes?.adviser_id || null,
                    time_in: now
                })
                .select()
                .single();
            
            if (createError) throw createError;
            
            visitResult = { type: 'Walk-in Created', name: student.full_name, action: 'New visit record created' };
        }

        // ==========================================
        // SUCCESS UI UPDATE
        // ==========================================
        lastScanDiv.classList.remove('hidden');
        studentNameEl.innerText = student.full_name;
        
        if (visitResult.type === 'Already In') {
            scanStatusEl.innerText = `✓ ${visitResult.action}`;
            scanStatusEl.className = 'text-lg font-medium text-yellow-400';
            statusIndicator.innerHTML = `<p class="text-yellow-300">Note: ${visitResult.action}</p>`;
        } else {
            scanStatusEl.innerText = `✓ ${visitResult.type} - ${visitResult.action}`;
            scanStatusEl.className = 'text-lg font-medium text-green-400';
            statusIndicator.innerHTML = `<p class="text-green-300">Success!</p>`;
        }
        
        // Use general-core.js showNotification for success
        if (typeof showNotification === 'function') {
            showNotification(`${student.full_name} has been ${visitResult.type.toLowerCase()} at the clinic`, 'success');
        }

    } catch (error) {
        lastScanDiv.classList.remove('hidden');
        studentNameEl.innerText = 'Scan Error';
        scanStatusEl.innerText = error.message;
        scanStatusEl.className = 'text-lg font-medium text-red-400';
        statusIndicator.innerHTML = `<p class="text-red-300">Error!</p>`;
        
        // Use general-core.js showNotification for error
        if (typeof showNotification === 'function') {
            showNotification(error.message, 'error');
        }
    } finally {
        // ==========================================
        // BUTTON UNLOCK (Anti-Redundancy)
        // ==========================================
        // Always unlock button after processing (success or error)
        if (scanButton) {
            scanButton.disabled = false;
            scanButton.innerHTML = '<i data-lucide="search" class="w-5 h-5 mr-2"></i> Search';
            lucide.createIcons();
        }
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

// ==========================================
// MANUAL SEARCH FUNCTION
// ==========================================
// Called by the manual search button in the UI
async function manualSearch() {
    const searchInput = document.getElementById('manual-student-search');
    const resultsDiv = document.getElementById('manual-search-results');
    const scanButton = document.getElementById('manual-scan-btn');
    
    if (!searchInput || !searchInput.value.trim()) {
        if (typeof showNotification === 'function') {
            showNotification('Please enter a student name or ID', 'error');
        }
        return;
    }
    
    const searchTerm = searchInput.value.trim();
    
    // Lock button during search
    if (scanButton) {
        scanButton.disabled = true;
        scanButton.innerHTML = '<i class="animate-spin mr-2">⏳</i> Searching...';
    }
    
    try {
        // Search by name or student_id_text
        const { data: students, error } = await supabase
            .from('students')
            .select('id, full_name, student_id_text, classes(grade_level, department)')
            .or(`full_name.ilike.%${searchTerm}%,student_id_text.ilike.%${searchTerm}%,lrn.ilike.%${searchTerm}%`)
            .limit(10);
        
        if (error) throw error;
        
        if (!students || students.length === 0) {
            resultsDiv.innerHTML = '<p class="text-gray-500 text-center py-4">No students found</p>';
            resultsDiv.classList.remove('hidden');
            return;
        }
        
        // Display results
        resultsDiv.innerHTML = students.map(student => `
            <button onclick="selectStudentForCheckIn('${student.student_id_text}', '${student.full_name.replace(/'/g, "\\'")}')" 
                class="w-full text-left p-3 rounded-xl hover:bg-red-50 transition-colors flex items-center justify-between">
                <div>
                    <p class="font-bold text-gray-800">${student.full_name}</p>
                    <p class="text-sm text-gray-500">${student.classes?.grade_level || ''} - ${student.classes?.department || ''}</p>
                </div>
                <div class="text-right">
                    <p class="text-xs font-mono text-gray-400">${student.student_id_text || 'N/A'}</p>
                    <i data-lucide="chevron-right" class="w-4 h-4 text-gray-400"></i>
                </div>
            </button>
        `).join('');
        
        resultsDiv.classList.remove('hidden');
        lucide.createIcons();
        
    } catch (err) {
        console.error('Manual search error:', err);
        if (typeof showNotification === 'function') {
            showNotification('Error searching for student', 'error');
        }
    } finally {
        // Unlock button
        if (scanButton) {
            scanButton.disabled = false;
            scanButton.innerHTML = 'Search';
        }
    }
}

// ==========================================
// SELECT STUDENT FOR CHECK-IN
// ==========================================
// Called when user selects a student from manual search results
async function selectStudentForCheckIn(studentIdText, studentName) {
    // Reuse the handleScanSuccess function logic
    await handleScanSuccess(studentIdText);
}