// clinic/clinic-scanner.js

document.addEventListener('DOMContentLoaded', () => {
    initializeScanner();
    
    const timeEl = document.getElementById('current-time');
    setInterval(() => {
        if (timeEl) timeEl.innerText = new Date().toLocaleTimeString('en-US');
    }, 1000);
});

function initializeScanner() {
    if (typeof Html5QrcodeScanner === "undefined") return;

    const onScanSuccess = async (decodedText, decodedResult) => {
        const statusIndicator = document.getElementById('status-indicator');
        statusIndicator.innerHTML = `<p class="text-yellow-300">Processing: ${decodedText}</p>`;

        try {
            const { data: student, error: studentError } = await supabase
                .from('students').select('id, full_name').eq('student_id_text', decodedText).single();

            if (studentError || !student) throw new Error('Student ID not found.');

            const { data: visit, error: visitError } = await supabase
                .from('clinic_visits').select('id').eq('student_id', student.id).eq('status', 'Approved').is('time_in', null).maybeSingle();

            if (visitError) throw visitError;
            if (!visit) throw new Error(`${student.full_name} does not have an approved pass.`);

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