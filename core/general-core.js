// core/general-core.js

// 1. Session Checker
// Call this at the top of every dashboard's specific core.js
function checkSession(requiredRole) {
    // BUG FIX: Check both localStorage (Remember Me) AND sessionStorage (Temporary)
    const userStr = localStorage.getItem('educare_user') || sessionStorage.getItem('educare_user');
    
    // If no session exists, kick them out
    if (!userStr) {
        showNotification("No active session. Please login.", 'error');
        window.location.href = '../index.html'; // Go up one level to root
        return null;
    }

    try {
        const user = JSON.parse(userStr);

        // Strict Role Check (Security)
        if (user.role !== requiredRole) {
            showNotification(`Unauthorized! You are logged in as ${user.role}, not ${requiredRole}.`, 'error');
            window.location.href = '../index.html';
            return null;
        }

        return user;
    } catch (e) {
        // If the JSON is corrupted, force a logout
        showNotification("Session corrupted. Please login again.", 'error');
        logout();
        return null;
    }
}

// 2. Logout Function
function logout() {
    if(confirm("Are you sure you want to logout?")) {
        // BUG FIX: Clear EVERYTHING from both storages to prevent ghost sessions
        localStorage.removeItem('educare_user'); 
        sessionStorage.removeItem('educare_user');
        sessionStorage.removeItem('teacher_identity_loaded'); 
        
        // Nuke all other potential cached data
        localStorage.clear();
        sessionStorage.clear();
        
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

/**
 * Returns the current local date as an ISO string (YYYY-MM-DD) without time.
 * This correctly handles timezone offsets, fixing the "Morning UTC Trap".
 * @returns {string} The local date in YYYY-MM-DD format.
 */
function getLocalISOString() {
    const date = new Date();
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
}

/**
 * Normalizes various grade level formats into a consistent, padded code (e.g., "G1" -> "G001").
 * This ensures reliable database lookups.
 * @param {string} grade - The grade level string (e.g., "Grade 1", "G1", "G001").
 * @returns {string} The normalized grade code.
 */
function normalizeGradeCode(grade) {
    if (!grade) return '';
    const gradeStr = String(grade).toUpperCase().replace('GRADE ', '').trim();

    if (gradeStr.startsWith('G')) {
        const num = gradeStr.replace('G', '');
        if (!isNaN(num) && num.length > 0) {
            return `G${num.padStart(3, '0')}`;
        }
    }

    if (!isNaN(gradeStr) && gradeStr.length > 0) {
        return `G${gradeStr.padStart(3, '0')}`;
    }

    // Handle specific cases like Kinder
    if (gradeStr === 'KINDER' || gradeStr === 'K') return 'Kinder';

    return grade; // Return as-is if no match
}

// FIX: Centralized Notification System to ensure UI consistency.
function showNotification(msg, type = 'info', callback = null) {
    const existing = document.getElementById('notification-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'notification-modal';
    modal.className = 'fixed inset-0 bg-black/50 z-[999] flex items-center justify-center animate-fade-in p-4';

    const iconColor = type === 'success' ? 'text-emerald-500' : type === 'error' ? 'text-red-500' : 'text-violet-600';
    const bgColor = type === 'success' ? 'bg-emerald-50' : type === 'error' ? 'bg-red-50' : 'bg-violet-50';
    const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info';
    const title = type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Information';

    const dndEnabled = localStorage.getItem('educare_dnd_enabled') === 'true';
    if (!dndEnabled) {
        // Feedback: Vibrate (Mobile) & Sound (Desktop)
        if (navigator.vibrate) navigator.vibrate(type === 'error' ? [100, 50, 100] : 100);
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = type === 'error' ? 220 : 550;
            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
            osc.start();
            osc.stop(ctx.currentTime + 0.2);
        } catch (e) {
            // Audio context can fail in some environments, fail silently.
        }
    }

    modal.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-auto p-6 transform transition-all animate-fade-in-up">
        <div class="flex flex-col items-center text-center">
            <div class="w-16 h-16 ${bgColor} ${iconColor} rounded-full flex items-center justify-center mb-4"><i data-lucide="${iconName}" class="w-8 h-8"></i></div>
            <h3 class="text-xl font-black text-gray-800 mb-2">${title}</h3>
            <p class="text-sm text-gray-500 font-medium mb-6">${msg}</p>
            <button id="notif-btn" class="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-gray-800 transition-all">Okay, Got it</button>
        </div></div>`;

    document.body.appendChild(modal);
    document.getElementById('notif-btn').onclick = () => { modal.remove(); if (callback) callback(); };
    if (window.lucide) window.lucide.createIcons();
}

// 9. Create Notification for Early Exit // Sends alert to parent and teacher when student exits early
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