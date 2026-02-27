// teacher-homeroom.js
// Real-time Homeroom Attendance with Gate Status Integration

// Store teacher's homeroom student IDs for real-time filtering
let myHomeroomStudentIds = [];
let myHomeroomClassId = null;

// THE PARANOIA SHIELD: Debounce timer for real-time updates
let refreshTimeout;

// Real-time subscription channel reference for cleanup
let attendanceSubscription = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Subscribe to real-time attendance updates
    // Note: We set up subscription first, then load students to populate IDs
    setupRealTimeSubscription();
    
    // Load students (this will populate myHomeroomStudentIds)
    await loadHomeroomStudents();
});

// Set up real-time subscription for attendance changes
function setupRealTimeSubscription() {
    if (!supabase) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    attendanceSubscription = supabase
        .channel('attendance-changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'attendance_logs',
            filter: `log_date=eq.${today}`
        }, (payload) => {
            // THE PARANOIA SHIELD: Debounced Refresh
            // Check if the affected student is in our homeroom class
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
    
    // Cleanup on page unload to prevent memory leaks
    window.addEventListener('beforeunload', () => {
        if (attendanceSubscription) {
            supabase.removeChannel(attendanceSubscription);
        }
        clearTimeout(refreshTimeout);
    });
}

// Debounce timer for search
let searchDebounceTimer;

function debouncedSearch() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        loadHomeroomStudents();
    }, 300);
}
