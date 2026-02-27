// teacher-homeroom.js
// Real-time Homeroom Attendance with Gate Status Integration

// Store teacher's homeroom student IDs for real-time filtering
let myHomeroomStudentIds = [];

// THE PARANOIA SHIELD: Debounce timer for real-time updates
let refreshTimeout;

document.addEventListener('DOMContentLoaded', async () => {
    await loadHomeroomStudents();
    
    // Subscribe to real-time attendance updates
    if (supabase) {
        supabase
            .channel('attendance-changes')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'attendance_logs',
                filter: `log_date=eq.${new Date().toISOString().split('T')[0]}`
            }, (payload) => {
                // THE PARANOIA SHIELD: Debounced Refresh
                if (payload.new && myHomeroomStudentIds.includes(payload.new.student_id)) {
                    // Clear the old timer
                    clearTimeout(refreshTimeout);
                    // Set a new timer. It only fires after 1.5 seconds of silence!
                    refreshTimeout = setTimeout(() => {
                        loadHomeroomStudents();
                    }, 1500);
                }
            })
            .subscribe();
    }
});
