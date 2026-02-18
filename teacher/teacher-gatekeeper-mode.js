// teacher-gatekeeper-mode.js
// Gatekeeper Mode - QR Scanner for Teachers

// 1. Global Variables
let isProcessingScan = false;
let html5QrcodeScanner = null;
const scanCooldowns = new Map(); // Prevent duplicate scans within 5 seconds

// 2. Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
    // Update time display
    updateTimeDisplay();
    setInterval(updateTimeDisplay, 1000);
    
    // Initialize QR Scanner
    await initializeScanner();
});

// 3. Update Time Display
function updateTimeDisplay() {
    const now = new Date();
    const timeEl = document.getElementById('current-time');
    const dateEl = document.getElementById('current-date');
    
    if (timeEl) {
        timeEl.innerText = now.toLocaleTimeString('en-PH', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            hour12: false 
        });
    }
    
    if (dateEl) {
        dateEl.innerText = now.toLocaleDateString('en-PH', { 
            weekday: 'long',
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
        });
    }
}

// 4. Initialize QR Scanner
async function initializeScanner() {
    try {
        html5QrcodeScanner = new Html5Qrcode("qr-reader");
        
        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        };
        
        await html5QrcodeScanner.start(
            { facingMode: "environment" },
            config,
            onScanSuccess,
            onScanFailure
        );
        
        console.log('QR Scanner started successfully');
    } catch (err) {
        console.error('Error starting QR scanner:', err);
        showStatus('Camera error. Please allow camera access.', 'error');
    }
}

// 5. Handle Successful Scan
function onScanSuccess(decodedText, decodedResult) {
    console.log('Scan result:', decodedText);
    processTeacherGateScan(decodedText);
}

// 6. Handle Scan Failure
function onScanFailure(error) {
    // Silently handle scan failures (normal when no QR in frame)
}

// 7. Process Teacher Gate Scan - Core Logic
async function processTeacherGateScan(qrCodeData) {
    if (isProcessingScan) return;
    
    const now = Date.now();
    if (scanCooldowns.has(qrCodeData) && (now - scanCooldowns.get(qrCodeData) < 5000)) {
        console.log('Duplicate scan ignored');
        return;
    }

    isProcessingScan = true;
    scanCooldowns.set(qrCodeData, now);

    try {
        const today = new Date().toISOString().split('T')[0];
        const currentTime = new Date().toISOString();

        // 1. Find the Student by QR code
        const { data: student, error: studentError } = await supabase
            .from('students')
            .select('id, full_name')
            .eq('qr_code_data', qrCodeData)
            .single();

        if (studentError || !student) {
            throw new Error("Invalid Student ID");
        }

        // 2. Check today's Log for this student
        const { data: existingLog } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('student_id', student.id)
            .eq('log_date', today)
            .maybeSingle();

        let actionType = '';
        let finalStatus = 'On Time';
        const teacherRemark = `Scanned by Teacher: ${currentUser.full_name}`; 

        if (!existingLog) {
            // TIME IN - No log exists for today
            actionType = 'ENTRY';
            
            // Check if late (after 8 AM)
            const currentHour = new Date().getHours();
            if (currentHour > 8) {
                finalStatus = 'Late';
            }

            // Create new attendance log
            await supabase.from('attendance_logs').insert({
                student_id: student.id,
                log_date: today,
                time_in: currentTime,
                status: finalStatus,
                remarks: teacherRemark
            });

        } else if (existingLog && !existingLog.time_out) {
            // TIME OUT - Has time_in but no time_out yet
            actionType = 'EXIT';
            
            // Update with time_out
            const existingRemarks = existingLog.remarks || '';
            await supabase.from('attendance_logs')
                .update({ 
                    time_out: currentTime,
                    remarks: existingRemarks ? `${existingRemarks} | Out: ${teacherRemark}` : `Out: ${teacherRemark}`
                })
                .eq('id', existingLog.id);

        } else {
            throw new Error("Student already scanned out.");
        }

        // Trigger success feedback
        triggerGatekeeperFeedback(true, student.full_name, actionType, finalStatus);

    } catch (err) {
        console.error('Gatekeeper scan error:', err);
        triggerGatekeeperFeedback(false, err.message, 'ERROR', '');
    } finally {
        isProcessingScan = false;
        
        // Clear cooldown after 5 seconds
        setTimeout(() => {
            scanCooldowns.delete(qrCodeData);
        }, 5000);
    }
}

// 8. Trigger Visual and Audio Feedback
function triggerGatekeeperFeedback(isSuccess, studentName, actionType, status) {
    const statusIndicator = document.getElementById('status-indicator');
    const lastScanDiv = document.getElementById('last-scan');
    const scanStudentName = document.getElementById('scan-student-name');
    const scanAction = document.getElementById('scan-action');
    const scanStatusEl = document.getElementById('scan-status');
    const scanTime = document.getElementById('scan-time');
    
    // Play audio
    if (isSuccess) {
        if (status === 'Late') {
            playAudio('audio-late');
        } else {
            playAudio('audio-success');
        }
    } else {
        playAudio('audio-error');
    }
    
    // Show last scan info
    lastScanDiv.classList.remove('hidden');
    scanStudentName.innerText = studentName;
    scanAction.innerText = actionType;
    scanTime.innerText = `Time: ${new Date().toLocaleTimeString('en-PH')}`;
    
    if (isSuccess) {
        // Success/Entry/Exit styling
        if (actionType === 'ENTRY') {
            if (status === 'Late') {
                scanStatusEl.innerText = '⚠️ Late Entry';
                scanStatusEl.className = 'text-lg font-medium text-yellow-400';
                statusIndicator.className = 'w-full text-center py-3 px-4 rounded-xl bg-yellow-600/30 border border-yellow-500 flash-warning';
                statusIndicator.innerHTML = '<p class="text-sm text-yellow-300">⚠️ Late Entry Recorded</p>';
            } else {
                scanStatusEl.innerText = '✅ On Time Entry';
                scanStatusEl.className = 'text-lg font-medium text-green-400';
                statusIndicator.className = 'w-full text-center py-3 px-4 rounded-xl bg-green-600/30 border border-green-500 flash-success';
                statusIndicator.innerHTML = '<p class="text-sm text-green-300">✅ Entry Recorded</p>';
            }
        } else if (actionType === 'EXIT') {
            scanStatusEl.innerText = '✅ Exit Recorded';
            scanStatusEl.className = 'text-lg font-medium text-blue-400';
            statusIndicator.className = 'w-full text-center py-3 px-4 rounded-xl bg-blue-600/30 border border-blue-500 flash-success';
            statusIndicator.innerHTML = '<p class="text-sm text-blue-300">✅ Exit Recorded</p>';
        }
        
        showToastSuccess(`${studentName} - ${actionType === 'ENTRY' ? (status === 'Late' ? 'Late Entry' : 'Entry') : 'Exit'} Recorded`);
        
    } else {
        // Error styling
        scanStatusEl.innerText = `❌ ${studentName}`;
        scanStatusEl.className = 'text-lg font-medium text-red-400';
        statusIndicator.className = 'w-full text-center py-3 px-4 rounded-xl bg-red-600/30 border border-red-500 flash-error';
        statusIndicator.innerHTML = `<p class="text-sm text-red-300">❌ ${studentName}</p>`;
        
        showToastError(studentName);
    }
    
    // Reset status after delay
    setTimeout(() => {
        statusIndicator.className = 'w-full text-center py-3 px-4 rounded-xl bg-slate-800/80 border border-slate-700';
        statusIndicator.innerHTML = '<p class="text-sm text-slate-300">Ready to scan student ID</p>';
    }, 3000);
}

// 9. Play Audio Feedback
function playAudio(audioId) {
    try {
        const audio = document.getElementById(audioId);
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.log('Audio play failed:', e));
        }
    } catch (e) {
        console.log('Audio error:', e);
    }
}

// 10. Show Status Message
function showStatus(message, type) {
    const statusIndicator = document.getElementById('status-indicator');
    if (!statusIndicator) return;
    
    let className = 'w-full text-center py-3 px-4 rounded-xl ';
    let html = '';
    
    if (type === 'error') {
        className += 'bg-red-600/30 border border-red-500';
        html = `<p class="text-sm text-red-300">${message}</p>`;
    } else {
        className += 'bg-slate-800/80 border border-slate-700';
        html = `<p class="text-sm text-slate-300">${message}</p>`;
    }
    
    statusIndicator.className = className;
    statusIndicator.innerHTML = html;
}

// 11. Show Success Toast
function showToastSuccess(message) {
    const toast = document.getElementById('toast-success');
    const toastMessage = document.getElementById('toast-success-message');
    
    if (toast && toastMessage) {
        toastMessage.innerText = message;
        toast.classList.remove('translate-y-24', 'opacity-0');
        
        setTimeout(() => {
            toast.classList.add('translate-y-24', 'opacity-0');
        }, 3000);
    }
}

// 12. Show Error Toast
function showToastError(message) {
    const toast = document.getElementById('toast-error');
    const toastMessage = document.getElementById('toast-error-message');
    
    if (toast && toastMessage) {
        toastMessage.innerText = message;
        toast.classList.remove('translate-y-24', 'opacity-0');
        
        setTimeout(() => {
            toast.classList.add('translate-y-24', 'opacity-0');
        }, 3000);
    }
}

// 13. Manual Entry Functions
function showManualEntry() {
    const modal = document.getElementById('manual-entry-modal');
    const input = document.getElementById('manual-student-id');
    
    if (modal) {
        modal.classList.remove('hidden');
    }
    
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 100);
    }
}

function closeManualEntry() {
    const modal = document.getElementById('manual-entry-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function submitManualEntry() {
    const input = document.getElementById('manual-student-id');
    const studentId = input ? input.value.trim() : '';
    
    if (!studentId) {
        alert('Please enter a Student ID');
        return;
    }
    
    closeManualEntry();
    await processTeacherGateScan(studentId);
}

// 14. Cleanup on Page Unload
window.addEventListener('beforeunload', () => {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().catch(err => console.log('Error stopping scanner:', err));
    }
});
