// core/general-core.js

// 1. Session Checker
// Call this at the top of every dashboard's specific core.js
function checkSession(requiredRole) {
    const userStr = localStorage.getItem('educare_user');
    
    // If no session exists, kick them out
    if (!userStr) {
        alert("No active session. Please login.");
        window.location.href = '../index.html'; // Go up one level to root
        return null;
    }

    const user = JSON.parse(userStr);

    // Strict Role Check (Security)
    // If a Student tries to open admin-dashboard.html, this blocks them.
    if (user.role !== requiredRole) {
        alert(`Unauthorized! You are logged in as ${user.role}, not ${requiredRole}.`);
        window.location.href = '../index.html';
        return null;
    }

    return user;
}

// 2. Logout Function
function logout() {
    if(confirm("Are you sure you want to logout?")) {
        localStorage.removeItem('educare_user'); 
        localStorage.removeItem('educare_session');
        sessionStorage.removeItem('teacher_identity_loaded'); // Clear teacher session cache
        localStorage.clear();
        window.location.href = '../index.html';
    }
}

// 3. Dynamic Greeting (Optional Helper)
function setWelcomeMessage(elementId, user) {
    const el = document.getElementById(elementId);
    if(el && user) {
        el.innerText = `Welcome, ${user.full_name}`;
    }
}

// 4. Check if Date is a Holiday/Suspended
// Used by Guard Scanner and Teacher Attendance before marking absences
async function checkIsHoliday(date) {
    try {
        const { data, error } = await supabase
            .from('holidays')
            .select('id, is_suspended, description')
            .eq('holiday_date', date)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            console.error('Error checking holiday:', error);
            return { isHoliday: false, isSuspended: false };
        }
        
        if (data) {
            return { isHoliday: true, isSuspended: data.is_suspended, description: data.description };
        }
        
        return { isHoliday: false, isSuspended: false };
    } catch (err) {
        console.error('Error in checkIsHoliday:', err);
        return { isHoliday: false, isSuspended: false };
    }
}

// 5. Get Late Threshold for Grade Level
// Returns the threshold time string (HH:MM) for a given grade level
let thresholdSettings = null; // Cache settings to reduce DB calls

async function getLateThreshold(gradeLevel) {
    try {
        // Fetch and cache settings if not already loaded
        if (!thresholdSettings) {
            const { data, error } = await supabase.from('settings').select('setting_key, setting_value');
            if (error) throw error;
            thresholdSettings = data.reduce((acc, setting) => {
                acc[setting.setting_key] = setting.setting_value;
                return acc;
            }, {});
        }

        // Determine which threshold to use based on grade level
        if (gradeLevel.includes('Kinder')) return thresholdSettings['threshold_kinder'] || '11:30';
        if (['1', '2', '3'].some(g => gradeLevel.includes(g))) return thresholdSettings['threshold_g1_g3'] || '08:00';
        if (['4', '5', '6'].some(g => gradeLevel.includes(g))) return thresholdSettings['threshold_g4_g6'] || '08:00';
        if (['7', '8', '9', '10'].some(g => gradeLevel.includes(g))) return thresholdSettings['threshold_g7_g10'] || '08:00';
        if (['11', '12'].some(g => gradeLevel.includes(g))) return thresholdSettings['threshold_shs'] || '07:30';

        return '08:00'; // Default fallback
    } catch (err) {
        console.error('Error getting late threshold:', err);
        return '08:00'; // Default fallback
    }
}

// 6. Check if Student is Late
// scanTime: time string (HH:MM), gradeLevel: string, threshold: time string (optional)
function isLate(scanTime, gradeLevel, customThreshold = null) {
    const threshold = customThreshold || '08:15';
    
    // Parse times
    const [scanHour, scanMin] = scanTime.split(':').map(Number);
    const [thresholdHour, thresholdMin] = threshold.split(':').map(Number);
    
    const scanMinutes = scanHour * 60 + scanMin;
    const thresholdMinutes = thresholdHour * 60 + thresholdMin;
    
    return scanMinutes > thresholdMinutes;
}

// 7. Check if Early Exit
// scanTime: time string (HH:MM), dismissalTime: time string (HH:MM)
function isEarlyExit(scanTime, dismissalTime) {
    const [scanHour, scanMin] = scanTime.split(':').map(Number);
    const [dismissHour, dismissMin] = dismissalTime.split(':').map(Number);
    
    const scanMinutes = scanHour * 60 + scanMin;
    const dismissMinutes = dismissHour * 60 + dismissMin;
    
    // If scanning out BEFORE dismissal time = early exit
    return scanMinutes < dismissMinutes;
}

// 8. Get Dismissal Time for Grade Level
// Returns dismissal time based on grade level
function getDismissalTime(gradeLevel) {
    // Default dismissal times by grade level
    if (gradeLevel.includes('Kinder') || gradeLevel === 'K') {
        return '11:30'; // Kinder dismisses at 11:30 AM
    } else if (['1', '2', '3', '4', '5', '6'].some(g => gradeLevel.includes(g))) {
        return '15:00'; // Elementary dismisses at 3:00 PM
    } else if (['7', '8', '9', '10'].some(g => gradeLevel.includes(g))) {
        return '16:00'; // Junior High dismisses at 4:00 PM
    } else if (['11', '12'].some(g => gradeLevel.includes(g))) {
        return '16:30'; // Senior High dismisses at 4:30 PM
    }
    
    return '15:00'; // Default
}

// 9. Create Notification for Early Exit
// Sends alert to parent and teacher when student exits early
async function createEarlyExitNotification(studentName, parentId, teacherId, exitTime) {
    try {
        // Notify Parent
        if (parentId) {
            await supabase.from('notifications').insert({
                recipient_id: parentId,
                recipient_role: 'parent',
                title: 'Early Exit Alert',
                message: `${studentName} exited early at ${exitTime}. This is marked as an unauthorized early exit.`,
                type: 'early_exit'
            });
        }
        
        // Notify Teacher
        if (teacherId) {
            await supabase.from('notifications').insert({
                recipient_id: teacherId,
                recipient_role: 'teacher',
                title: 'Early Exit Alert',
                message: `${studentName} exited early at ${exitTime}. This is marked as an unauthorized early exit.`,
                type: 'early_exit'
            });
        }
    } catch (err) {
        console.error('Error creating early exit notification:', err);
    }
}