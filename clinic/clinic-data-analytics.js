/**
 * Clinic Data Analytics - Intelligence Center
 * Handles visit logs, charts, and export functionality
 */

// Store visit data globally
let visitData = [];
let reasonsChart = null;
let dailyChart = null;

/**
 * Fetch visits by date range with JOINs
 * Gets student details, class info, and referring teacher
 */
async function fetchVisitsByDateRange(dateFrom, dateTo) {
    try {
        const startOfDay = new Date(dateFrom);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);

        const { data, error } = await supabase
            .from('clinic_visits')
            .select(`
                *,
                students!inner (
                    full_name,
                    student_id_text,
                    classes!inner (
                        grade_level,
                        section_name
                    )
                ),
                teachers (
                    full_name
                )
            `)
            .gte('time_in', startOfDay.toISOString())
            .lte('time_in', endOfDay.toISOString())
            .order('time_in', { ascending: false });

        if (error) {
            console.error('Error fetching visits:', error);
            return [];
        }

        // Flatten nested objects for easier access
        return data.map(visit => ({
            ...visit,
            students: {
                ...visit.students,
                ...visit.students?.classes
            },
            full_name: visit.students?.full_name,
            student_id_text: visit.students?.student_id_text,
            grade_level: visit.students?.grade_level,
            section_name: visit.students?.section_name,
            referred_by_name: visit.teachers?.full_name
        }));
    } catch (err) {
        console.error('Exception fetching visits:', err);
        return [];
    }
}

/**
 * Fetch daily clinic statistics
 */
async function fetchDailyClinicStats(date) {
    try {
        const { data, error } = await supabase
            .from('clinic_visits')
            .select('time_out')
            .gte('time_in', `${date}T00:00:00`)
            .lte('time_in', `${date}T23:59:59`);

        if (error) {
            console.error('Error fetching stats:', error);
            return { totalCheckIns: 0, stillInClinic: 0, dischargedToday: 0 };
        }

        const totalCheckIns = data.length;
        const dischargedToday = data.filter(v => v.time_out).length;
        const stillInClinic = totalCheckIns - dischargedToday;

        return { totalCheckIns, stillInClinic, dischargedToday };
    } catch (err) {
        console.error('Exception fetching stats:', err);
        return { totalCheckIns: 0, stillInClinic: 0, dischargedToday: 0 };
    }
}

/**
 * Fetch and aggregate visit reasons with TEXT NORMALIZATION
 * Key fix: Normalize text so 'Fever' and 'fever' are counted together
 */
async function fetchVisitReasons(date) {
    try {
        const { data, error } = await supabase
            .from('clinic_visits')
            .select('reason')
            .gte('time_in', `${date}T00:00:00`)
            .lte('time_in', `${date}T23:59:59}`)
            .not('reason', 'is', null);

        if (error) {
            console.error('Error fetching reasons:', error);
            return {};
        }

        // Count reasons with text normalization
        const reasonCounts = {};
        
        data.forEach(visit => {
            // Normalize text: lowercase, trim, then capitalize first letter
            const rawReason = (visit.reason || 'Not Specified').trim().toLowerCase();
            const reason = rawReason.charAt(0).toUpperCase() + rawReason.slice(1);
            reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
        });

        // Sort by count descending
        const sortedReasons = Object.entries(reasonCounts)
            .sort((a, b) => b[1] - a[1])
            .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});

        return sortedReasons;
    } catch (err) {
        console.error('Exception fetching reasons:', err);
        return {};
    }
}

/**
 * Calculate duration between time_in and time_out
 * Returns formatted string (e.g., "45m", "1h 30m")
 */
function calculateDuration(timeIn, timeOut) {
    if (!timeIn) return 'N/A';
    
    const start = new Date(timeIn);
    
    if (!timeOut) {
        // Still in clinic - calculate from start to now
        const now = new Date();
        const diffMs = now - start;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 60) return `${diffMins}m`;
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        return `${hours}h ${mins}m`;
    }
    
    const end = new Date(timeOut);
    const diffMs = end - start;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 0) return 'Error';
    if (diffMins < 60) return `${diffMins}m`;
    
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format time for display
 */
function formatTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Export data to CSV file
 */
function exportToCSV(exportData, filename) {
    if (!exportData || exportData.length === 0) {
        showToast('No data to export', 'warning');
        return;
    }

    // Get headers from first object
    const headers = Object.keys(exportData[0]);
    
    // Build CSV content
    const csvContent = [
        headers.join(','),
        ...exportData.map(row => headers.map(header => {
            const value = row[header];
            // Escape commas and quotes
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value || '';
        }).join(','))
    ].join('\n');

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    // Create toast element if it doesn't exist
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.className = 'fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white z-50 transition-all duration-300 transform translate-y-full opacity-0';
        document.body.appendChild(toast);
    }

    // Set type styles
    const styles = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-yellow-500',
        info: 'bg-blue-500'
    };

    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white z-50 transition-all duration-300 transform translate-y-full opacity-0 ${styles[type] || styles.info}`;
    toast.textContent = message;

    // Show toast
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-full', 'opacity-0');
    });

    // Hide after 3 seconds
    setTimeout(() => {
        toast.classList.add('translate-y-full', 'opacity-0');
    }, 3000);
}
