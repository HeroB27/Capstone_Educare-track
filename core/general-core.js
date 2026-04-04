// core/general-core.js

// Global DEBUG flag (shared across all modules)
// Set to true to enable debug logging for all modules
window.DEBUG = false;

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

// EXPORT logout to window for global access (FIX: buttons in HTML couldn't call logout)
window.logout = logout;

// 3. Dynamic Greeting (Optional Helper)
// UPDATED: Now includes time-based greetings and weekend greetings
function setWelcomeMessage(elementId, user) {
    const el = document.getElementById(elementId);
    if(el && user) {
        const now = new Date();
        const day = now.getDay(); // 0 = Sunday, 6 = Saturday
        const hour = now.getHours();
        
        let greeting;
        
        // Check if it's weekend
        if (day === 0) {
            greeting = 'Happy Sunday';
        } else if (day === 6) {
            greeting = 'Happy Saturday';
        } else if (hour < 12) {
            greeting = 'Good Morning';
        } else if (hour < 18) {
            greeting = 'Good Afternoon';
        } else {
            greeting = 'Good Evening';
        }
        
        el.innerText = `${greeting}, ${user.full_name.split(' ')[0]}`;
    }
}

// 4. Check if Date is a Holiday/Suspended
// Used by Guard Scanner and Teacher Attendance before marking absences
// UPDATED: Now includes time_coverage for half-day suspension support
async function checkIsHoliday(date) {
    try {
        const { data, error } = await supabase
            .from('holidays')
            .select('id, is_suspended, description, time_coverage')
            .eq('holiday_date', date)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            console.error('Error checking holiday:', error);
            return { isHoliday: false, isSuspended: false, timeCoverage: null };
        }
        
        if (data) {
            // Map time_coverage to return value
            let timeCoverage = null;
            if (data.time_coverage === 'Morning Only') {
                timeCoverage = 'Morning';
            } else if (data.time_coverage === 'Afternoon Only') {
                timeCoverage = 'Afternoon';
            } else if (data.time_coverage === 'Full Day') {
                timeCoverage = 'Full Day';
            }
            
            return { 
                isHoliday: true, 
                isSuspended: data.is_suspended, 
                description: data.description,
                timeCoverage: timeCoverage
            };
        }
        
        return { isHoliday: false, isSuspended: false, timeCoverage: null };
    } catch (err) {
        console.error('Error in checkIsHoliday:', err);
        return { isHoliday: false, isSuspended: false, timeCoverage: null };
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

// 10. Check if a Date is a Valid School Day
// Used by Guard Scanner and Teacher Attendance before marking automatic absences
// Sundays are NEVER school days. Saturdays depend on the enable_saturday_classes setting.
window.isValidSchoolDay = async function(dateStr) {
    const dateObj = new Date(dateStr);
    const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 6 = Saturday

    // Sundays are NEVER school days
    if (dayOfWeek === 0) return false;

    // If it's Saturday, check the settings table
    if (dayOfWeek === 6) {
        try {
            const { data } = await supabase.from('settings').select('setting_value').eq('setting_key', 'enable_saturday_classes').single();
            return data && data.setting_value === 'true';
        } catch (e) {
            return false; // Default to false if error
        }
    }

    // Monday - Friday are valid school days
    return true;
};

// ==========================================
// PHASE 1: ANTI-REDUNDANCY UTILITIES
// Added to eliminate duplicate code across modules
// ==========================================

// 11. Unified Date Formatting
// Replaces duplicate formatDate() functions in admin, clinic, parent modules
function formatDate(dateStr, format = 'short') {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    
    if (format === 'short') {
        return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    if (format === 'long') {
        return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    if (format === 'datetime') {
        return date.toLocaleString('en-PH', { 
            year: 'numeric', month: 'short', day: 'numeric', 
            hour: '2-digit', minute: '2-digit' 
        });
    }
    
    return dateStr;
}

// 12. Unified Time Formatting
// Converts 24-hour time to 12-hour format with AM/PM
function formatTime(timeStr) {
    if (!timeStr) return '';
    
    // Handle if it's a full datetime string
    if (timeStr.includes('T')) {
        const date = new Date(timeStr);
        return date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
    }
    
    // Handle just time string (HH:MM:SS or HH:MM)
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    
    const hours = parseInt(parts[0]);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    
    return `${displayHours}:${minutes} ${ampm}`;
}

// 13. Settings Cache - Eliminates repeated database queries
// Used by admin and teacher modules to avoid fetching settings repeatedly
let settingsCache = null;
let settingsCacheTime = 0;

window.getSettings = async function(refresh = false) {
    const now = Date.now();
    
    // Return cached data if less than 5 minutes old
    if (!refresh && settingsCache && (now - settingsCacheTime) < 300000) {
        return settingsCache;
    }
    
    try {
        const { data, error } = await supabase.from('settings').select('*');
        if (error) {
            console.error('[getSettings] Error:', error);
            return null;
        }
        
        // Convert array to object for easy access
        settingsCache = data.reduce((acc, s) => {
            acc[s.setting_key] = s.setting_value;
            return acc;
        }, {});
        settingsCacheTime = now;
        
        return settingsCache;
    } catch (err) {
        console.error('[getSettings] Exception:', err);
        return null;
    }
};

// 14. Unified Confirmation Dialog
// Replaces duplicate modal code in admin, teacher, guard modules
window.showConfirm = function(title, message, onConfirm, onCancel) {
    const existing = document.getElementById('confirmation-modal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.id = 'confirmation-modal';
    modal.className = 'fixed inset-0 bg-black/50 z-[90] flex items-center justify-center animate-fade-in p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-auto p-6 transform transition-all animate-fade-in-up">
            <h3 class="text-xl font-black text-gray-800 mb-2">${title}</h3>
            <p class="text-sm text-gray-500 font-medium mb-6">${message}</p>
            <div class="flex gap-3">
                <button id="confirm-cancel" class="flex-1 py-3 bg-gray-200 text-gray-800 rounded-xl font-bold text-sm hover:bg-gray-300 transition-all">Cancel</button>
                <button id="confirm-ok" class="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-all">Confirm</button>
            </div>
        </div>`;
    
    document.body.appendChild(modal);
    
    document.getElementById('confirm-cancel').onclick = () => {
        modal.remove();
        if (onCancel) onCancel();
    };
    
    document.getElementById('confirm-ok').onclick = () => {
        modal.remove();
        if (onConfirm) onConfirm();
    };
};

// 15. Generic Modal for Custom Content
// Used when you need a modal with custom HTML content
window.showModal = function(id, title, contentHtml, buttons = [], onClose) {
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.id = id;
    modal.className = 'fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4';
    
    // Generate buttons HTML
    let buttonsHtml;
    if (buttons.length > 0) {
        buttonsHtml = buttons.map((btn, i) => 
            `<button id="${id}-btn-${i}" class="px-4 py-2 rounded-lg font-bold text-sm ${btn.primary ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-800'} ${btn.danger ? 'bg-red-600 text-white' : ''}">${btn.text}</button>`
        ).join('');
    } else {
        buttonsHtml = `<button id="${id}-btn-close" class="px-6 py-3 bg-gray-900 text-white rounded-xl font-bold text-sm">Close</button>`;
    }
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-auto p-6 max-h-[90vh] overflow-y-auto">
            <h3 class="text-xl font-black text-gray-800 mb-4">${title}</h3>
            <div class="mb-6">${contentHtml}</div>
            <div class="flex gap-3 justify-end">${buttonsHtml}</div>
        </div>`;
    
    document.body.appendChild(modal);
    
    // Attach button handlers
    if (buttons.length > 0) {
        buttons.forEach((btn, i) => {
            const btnEl = document.getElementById(`${id}-btn-${i}`);
            if (btnEl) {
                btnEl.onclick = () => {
                    modal.remove();
                    if (btn.onClick) btn.onClick();
                };
            }
        });
    } else {
        const closeBtn = document.getElementById(`${id}-btn-close`);
        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.remove();
                if (onClose) onClose();
            };
        }
    }
};

// ==========================================
// SMART GATEKEEPER PROTOCOL ENGINE
// ==========================================
// Evaluates campus gate status based on:
// - Weekend (Sunday always closed, Saturday depends on suspension settings)
// - Pre-Planned Suspensions (created before today = Campus Closed)
// - Emergency Mid-Day Suspensions (created today = Exits Only)
// Returns: { active, allowEntry, allowExit, message }
window.evaluateGateStatus = async function() {
    try {
        const localDate = new Date();
        localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
        const todayStr = localDate.toISOString().split('T')[0];
        const dayOfWeek = localDate.getDay(); // 0 = Sunday, 6 = Saturday

        // 1. Fetch Active Suspensions/Holidays for Today
        const { data: suspensions, error } = await supabase
            .from('suspensions')
            .select('title, created_at, start_date, saturday_enabled')
            .eq('is_active', true)
            .lte('start_date', todayStr)
            .gte('end_date', todayStr)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) throw error;

        // 2. Weekend Check (Strict Sunday block, Saturday depends on active suspensions)
        if (dayOfWeek === 0) {
            return { active: false, allowEntry: false, allowExit: false, message: 'CAMPUS CLOSED (Sunday)' };
        }
        if (dayOfWeek === 6) {
            // Check if there's an active override for this Saturday
            const hasSaturdayOverride = suspensions && suspensions.length > 0 && suspensions[0].saturday_enabled;
            if (!hasSaturdayOverride) {
                return { active: false, allowEntry: false, allowExit: false, message: 'CAMPUS CLOSED (Saturday)' };
            }
        }

        if (suspensions && suspensions.length > 0) {
            const sus = suspensions[0];
            const createdDateStr = new Date(sus.created_at).toISOString().split('T')[0];

            // 3. Emergency vs Pre-Planned Check
            if (createdDateStr === todayStr) {
                // Suspension was declared TODAY (Mid-day emergency)
                return { 
                    active: true, 
                    allowEntry: false, 
                    allowExit: true, 
                    message: `EMERGENCY EXITS ONLY: ${sus.title}` 
                };
            } else {
                // Suspension was declared BEFORE today (Pre-planned)
                return { 
                    active: false, 
                    allowEntry: false, 
                    allowExit: false, 
                    message: `CAMPUS CLOSED: ${sus.title}` 
                };
            }
        }

        // Default: Normal Operations
        return { active: true, allowEntry: true, allowExit: true, message: 'GATE ACTIVE' };

    } catch (err) {
        console.error("Gate Protocol Error:", err);
        // Fail-safe Open: If database fails, don't trap students at the gate
        return { active: true, allowEntry: true, allowExit: true, message: 'GATE ACTIVE (Offline Mode)' }; 
    }
};

// Export functions to window for global access
window.formatDate = formatDate;
window.formatTime = formatTime;

console.log('[GeneralCore] Phase 1 utilities loaded: formatDate, formatTime, getSettings, showConfirm, showModal');