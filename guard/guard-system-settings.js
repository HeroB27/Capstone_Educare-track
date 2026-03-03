// guard/guard-system-settings.js

// ============================================================================
// GUARD SYSTEM SETTINGS - JavaScript Logic
// ============================================================================
// NOTE: This page handles LOCAL DEVICE SETTINGS ONLY (camera, sounds, brightness)
// It does NOT handle global system settings (those are admin-only)
// ============================================================================

// Session Check
// currentUser is now global in guard-core.js

// Local device settings keys (stored in localStorage per device)
const DEVICE_SETTINGS_KEY = 'educare_guard_device_settings';

// Debug flag - set to false in production
const DEBUG_MODE = false;

// ============================================================================
// NOTIFICATION SYSTEM (Replaces native alert)
// ============================================================================
function showNotification(msg, type = 'success', duration = 3000) {
    const existing = document.getElementById('notification-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'notification-modal';
    modal.className = 'fixed inset-0 bg-black/50 z-[999] flex items-center justify-center animate-fade-in p-4';

    const colors = {
        success: { bg: 'bg-emerald-50', icon: 'text-emerald-500', iconName: 'check-circle' },
        error: { bg: 'bg-red-50', icon: 'text-red-500', iconName: 'alert-circle' },
        info: { bg: 'bg-violet-50', icon: 'text-violet-600', iconName: 'info' }
    };
    const color = colors[type] || colors.success;

    const dndEnabled = localStorage.getItem('educare_dnd_enabled') === 'true';
    if (!dndEnabled && navigator.vibrate) {
        navigator.vibrate(type === 'error' ? [100, 50, 100] : 100);
    }

    modal.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-auto p-6 transform transition-all animate-fade-in-up">
        <div class="flex flex-col items-center text-center">
            <div class="w-16 h-16 ${color.bg} ${color.icon} rounded-full flex items-center justify-center mb-4">
                <i data-lucide="${color.iconName}" class="w-8 h-8"></i>
            </div>
            <h3 class="text-xl font-black text-gray-800 mb-2">${type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Information'}</h3>
            <p class="text-sm text-gray-500 font-medium mb-6">${msg}</p>
            <button id="notif-btn" class="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-gray-800 transition-all">Okay, Got it</button>
        </div>
    </div>`;

    document.body.appendChild(modal);
    document.getElementById('notif-btn').onclick = () => modal.remove();
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => modal.remove(), duration);
}

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (currentUser) {
        // Set guard name in sidebar
        const sidebarName = document.getElementById('guard-name-sidebar');
        if (sidebarName) sidebarName.textContent = currentUser.full_name || 'Guard';
        
        // Set header name
        const headerName = document.getElementById('guard-name');
        if (headerName) headerName.textContent = currentUser.full_name || 'Guard';
        
        // Load guard profile data
        loadGuardProfile();
    }
    
    // Set current date
    setCurrentDate();
    
    // Load local device settings
    loadDeviceSettings();
    
    // Load notification preferences
    loadNotificationPreferences();
});

/**
 * Set current date in sidebar
 */
function setCurrentDate() {
    const now = new Date();
    const dateEl = document.getElementById('current-date');
    const dayEl = document.getElementById('current-day');
    
    if (dateEl) {
        dateEl.textContent = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    }
    if (dayEl) {
        dayEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
}

// ============================================================================
// LOCAL DEVICE SETTINGS (Camera, Sounds, Brightness)
// ============================================================================

/**
 * Get device settings from localStorage
 */
function getDeviceSettings() {
    const stored = localStorage.getItem(DEVICE_SETTINGS_KEY);
    return stored ? JSON.parse(stored) : {
        cameraId: 'default',
        soundEnabled: true,
        beepVolume: 0.5,
        brightness: 100,
        vibrationEnabled: true
    };
}

/**
 * Save device settings to localStorage
 */
function saveDeviceSettings(settings) {
    localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Load and apply device settings to UI
 */
function loadDeviceSettings() {
    const settings = getDeviceSettings();
    
    // Apply to form elements
    const cameraSelect = document.getElementById('camera-select');
    const soundToggle = document.getElementById('sound-toggle');
    const volumeSlider = document.getElementById('volume-slider');
    const brightnessSlider = document.getElementById('brightness-slider');
    const vibrationToggle = document.getElementById('vibration-toggle');
    
    if (cameraSelect) cameraSelect.value = settings.cameraId || 'default';
    if (soundToggle) soundToggle.checked = settings.soundEnabled !== false;
    if (volumeSlider) volumeSlider.value = settings.beepVolume * 100;
    if (brightnessSlider) brightnessSlider.value = settings.brightness || 100;
    if (vibrationToggle) vibrationToggle.checked = settings.vibrationEnabled !== false;
    
    // Apply brightness to page
    applyBrightness(settings.brightness || 100);
}

/**
 * Apply brightness to the page
 */
function applyBrightness(value) {
    document.body.style.filter = `brightness(${value}%)`;
}

/**
 * Save all device settings
 */
function saveDeviceSettingsFromForm() {
    const cameraSelect = document.getElementById('camera-select');
    const soundToggle = document.getElementById('sound-toggle');
    const volumeSlider = document.getElementById('volume-slider');
    const brightnessSlider = document.getElementById('brightness-slider');
    const vibrationToggle = document.getElementById('vibration-toggle');
    
    const settings = {
        cameraId: cameraSelect?.value || 'default',
        soundEnabled: soundToggle?.checked ?? true,
        beepVolume: (volumeSlider?.value || 50) / 100,
        brightness: parseInt(brightnessSlider?.value || 100),
        vibrationEnabled: vibrationToggle?.checked ?? true
    };
    
    saveDeviceSettings(settings);
    applyBrightness(settings.brightness);
    
    // Show feedback
    showNotification('Device settings saved! (Local to this device only)');
}

// ============================================================================
// PROFILE LOADING
// ============================================================================

/**
 * Load guard profile data from database
 */
async function loadGuardProfile() {
    if (!currentUser || !currentUser.id) return;
    
    try {
        const { data: guard, error } = await supabase
            .from('guards')
            .select('*')
            .eq('id', currentUser.id)
            .single();
        
        if (error) {
            console.error('Error loading guard profile:', error);
            return;
        }
        
        // Populate form fields
        const fullnameInput = document.getElementById('guard-fullname');
        const emailInput = document.getElementById('guard-email');
        const phoneInput = document.getElementById('guard-phone');
        const usernameInput = document.getElementById('guard-username');
        
        if (fullnameInput) fullnameInput.value = guard?.full_name || '';
        if (emailInput) emailInput.value = guard?.email || '';
        if (phoneInput) phoneInput.value = guard?.contact_number || '';
        if (usernameInput) usernameInput.value = guard?.username || '';
        
    } catch (error) {
        console.error('Error:', error);
    }
}

// ============================================================================
// PROFILE UPDATE
// ============================================================================

/**
 * Save guard profile changes
 */
async function saveProfile() {
    if (!currentUser || !currentUser.id) {
        showNotification('You must be logged in to update your profile', 'error');
        return;
    }
    
    const fullname = document.getElementById('guard-fullname')?.value?.trim();
    const email = document.getElementById('guard-email')?.value?.trim();
    const phone = document.getElementById('guard-phone')?.value?.trim();
    
    // Validation
    if (!fullname) {
        showNotification('Full name is required', 'error');
        return;
    }
    
    if (!email) {
        showNotification('Email is required', 'error');
        return;
    }
    
    if (phone && !phone.startsWith('09')) {
        showNotification('Phone number must start with 09', 'error');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('guards')
            .update({
                full_name: fullname,
                email: email,
                contact_number: phone
            })
            .eq('id', currentUser.id);
        
        if (error) {
            showNotification('Error updating profile: ' + error.message, 'error');
            return;
        }
        
        showNotification('Profile updated successfully!');
        
        // Update local session
        if (currentUser) {
            currentUser.full_name = fullname;
            currentUser.email = email;
            localStorage.setItem('educare_user', JSON.stringify(currentUser));
        }
        
    } catch (error) {
        console.error('Error:', error);
        showNotification('An error occurred while updating your profile', 'error');
    }
}

// ============================================================================
// PASSWORD CHANGE
// ============================================================================

/**
 * Change guard password
 */
async function changePassword() {
    if (!currentUser || !currentUser.id) {
        showNotification('You must be logged in to change your password', 'error');
        return;
    }
    
    const currentPassword = document.getElementById('current-password')?.value;
    const newPassword = document.getElementById('new-password')?.value;
    const confirmPassword = document.getElementById('confirm-password')?.value;
    
    // Validation
    if (!currentPassword) {
        showNotification('Current password is required', 'error');
        return;
    }
    
    if (!newPassword) {
        showNotification('New password is required', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showNotification('New password must be at least 6 characters', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showNotification('New passwords do not match', 'error');
        return;
    }
    
    // Verify current password
    try {
        const { data: guard, error } = await supabase
            .from('guards')
            .select('password')
            .eq('id', currentUser.id)
            .single();
        
        if (error) {
            showNotification('Error verifying password: ' + error.message, 'error');
            return;
        }
        
        if (guard.password !== currentPassword) {
            showNotification('Current password is incorrect', 'error');
            return;
        }
        
        // Update password
        const { error: updateError } = await supabase
            .from('guards')
            .update({ password: newPassword })
            .eq('id', currentUser.id);
        
        if (updateError) {
            showNotification('Error changing password: ' + updateError.message, 'error');
            return;
        }
        
        // Notify admin about password change
        await supabase.from('notifications').insert({
            recipient_role: 'admins',
            title: 'Password Change',
            message: `Guard "${currentUser.full_name}" has changed their password.`,
            type: 'system_alert',
            is_read: false
        });
        
        showNotification('Password changed successfully!');
        
        // Clear form
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
        
    } catch (error) {
        console.error('Error:', error);
        showNotification('An error occurred while changing your password', 'error');
    }
}

// ============================================================================
// NOTIFICATION PREFERENCES (stored in localStorage per user)
// ============================================================================

const NOTIFICATION_PREFS_KEY = 'educare_guard_notification_prefs';

/**
 * Load notification preferences from localStorage
 */
function loadNotificationPreferences() {
    const stored = localStorage.getItem(NOTIFICATION_PREFS_KEY);
    const prefs = stored ? JSON.parse(stored) : {
        scanNotifications: true,
        announcementAlerts: true
    };
    
    // Set form values
    const scanToggle = document.getElementById('notify-scan');
    const announcementToggle = document.getElementById('notify-announcements');
    
    if (scanToggle) scanToggle.checked = prefs.scanNotifications !== false;
    if (announcementToggle) announcementToggle.checked = prefs.announcementAlerts !== false;
}

/**
 * Save notification preferences
 */
async function saveNotificationPreferences() {
    if (!currentUser || !currentUser.id) {
        showNotification('You must be logged in to save preferences', 'error');
        return;
    }
    
    const scanNotifications = document.getElementById('notify-scan')?.checked;
    const announcementAlerts = document.getElementById('notify-announcements')?.checked;
    
    try {
        // Save to localStorage (per user on this device)
        const prefs = {
            scanNotifications: scanNotifications,
            announcementAlerts: announcementAlerts,
            savedAt: new Date().toISOString()
        };
        localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
        
        showNotification('Notification preferences saved!');
        
    } catch (error) {
        console.error('Error saving preferences:', error);
        showNotification('An error occurred while saving preferences', 'error');
    }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Logout function
 */
function logout() {
    localStorage.removeItem('educare_session');
    localStorage.removeItem('educare_user');
    sessionStorage.removeItem('teacher_identity_loaded');
    window.location.href = '../index.html';
}
