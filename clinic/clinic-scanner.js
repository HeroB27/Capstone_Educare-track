// clinic/clinic-scanner.js

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

function initializeScanner() {
    if (typeof Html5QrcodeScanner === "undefined") return;

    const onScanSuccess = async (decodedText, decodedResult) => {
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
    };

    const html5QrcodeScanner = new Html5QrcodeScanner(
        "qr-reader", 
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
    );
    html5QrcodeScanner.render(onScanSuccess, (error) => {});
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
