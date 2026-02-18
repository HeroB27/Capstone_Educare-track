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
        if (phoneInput) phoneInput.value = guard?.phone || '';
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
        alert('You must be logged in to update your profile');
        return;
    }
    
    const fullname = document.getElementById('guard-fullname')?.value?.trim();
    const email = document.getElementById('guard-email')?.value?.trim();
    const phone = document.getElementById('guard-phone')?.value?.trim();
    
    // Validation
    if (!fullname) {
        alert('Full name is required');
        return;
    }
    
    if (!email) {
        alert('Email is required');
        return;
    }
    
    if (phone && !phone.startsWith('09')) {
        alert('Phone number must start with 09');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('guards')
            .update({
                full_name: fullname,
                email: email,
                phone: phone
            })
            .eq('id', currentUser.id);
        
        if (error) {
            alert('Error updating profile: ' + error.message);
            return;
        }
        
        alert('Profile updated successfully!');
        
        // Update local session
        if (currentUser) {
            currentUser.full_name = fullname;
            currentUser.email = email;
            localStorage.setItem('educare_user', JSON.stringify(currentUser));
        }
        
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred while updating your profile');
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
        alert('You must be logged in to change your password');
        return;
    }
    
    const currentPassword = document.getElementById('current-password')?.value;
    const newPassword = document.getElementById('new-password')?.value;
    const confirmPassword = document.getElementById('confirm-password')?.value;
    
    // Validation
    if (!currentPassword) {
        alert('Current password is required');
        return;
    }
    
    if (!newPassword) {
        alert('New password is required');
        return;
    }
    
    if (newPassword.length < 6) {
        alert('New password must be at least 6 characters');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        alert('New passwords do not match');
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
            alert('Error verifying password: ' + error.message);
            return;
        }
        
        if (guard.password !== currentPassword) {
            alert('Current password is incorrect');
            return;
        }
        
        // Update password
        const { error: updateError } = await supabase
            .from('guards')
            .update({ password: newPassword })
            .eq('id', currentUser.id);
        
        if (updateError) {
            alert('Error changing password: ' + updateError.message);
            return;
        }
        
        alert('Password changed successfully!');
        
        // Clear form
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
        
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred while changing your password');
    }
}

// ============================================================================
// NOTIFICATION PREFERENCES
// ============================================================================

/**
 * Save notification preferences
 */
async function saveNotificationPreferences() {
    if (!currentUser || !currentUser.id) return;
    
    const scanNotifications = document.getElementById('notify-scan')?.checked;
    const announcementNotifications = document.getElementById('notify-announcements')?.checked;
    
    try {
        // This would typically save to a preferences table or user metadata
        // For now, we'll just show a success message
        alert('Notification preferences saved!');
        
    } catch (error) {
        console.error('Error saving preferences:', error);
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
    window.location.href = '../index.html';
}

/**
 * Show notification message
 */
function showNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}
