// clinic/clinic-system-settings.js

// ============================================================================
// CLINIC SYSTEM SETTINGS - JavaScript Logic
// ============================================================================
// Features: Profile management, password change, notification preferences
// NOTE: Uses localStorage for preferences, clinic_staff table for profile
// ============================================================================

// Session Check
// currentUser is now global in clinic-core.js

// Local storage key for clinic preferences
const CLINIC_SETTINGS_KEY = 'educare_clinic_settings';

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (currentUser) {
        // Set clinic staff name
        const sidebarName = document.getElementById('clinic-name-sidebar');
        if (sidebarName) sidebarName.textContent = currentUser.full_name || 'Nurse';
        
        const headerName = document.getElementById('clinic-name');
        if (headerName) headerName.textContent = currentUser.full_name || 'Nurse';
        
        // Load current settings
        loadSettings();
    }
});

// ============================================================================
// SETTINGS LOADING (localStorage for preferences, clinic_staff table for profile)
// ============================================================================

/**
 * Load current settings from localStorage and database
 */
async function loadSettings() {
    try {
        // Load notification preferences from localStorage
        loadNotificationPreferences();
        
        // Load clinic info from localStorage
        loadClinicInfoToForm();
        
        // Load clinic staff profile from database
        await loadClinicProfile();
        
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

/**
 * Load clinic info to form from localStorage
 */
function loadClinicInfoToForm() {
    const clinicInfo = loadClinicInfo();
    if (!clinicInfo) return;
    
    const contactInput = document.querySelector('input[placeholder="Enter contact number"]');
    const emergencyInput = document.querySelector('input[placeholder="Emergency contact"]');
    
    if (contactInput) contactInput.value = clinicInfo.contact_number || '';
    if (emergencyInput) emergencyInput.value = clinicInfo.emergency_line || '';
}

/**
 * Load notification preferences from localStorage
 */
function loadNotificationPreferences() {
    const prefs = getNotificationPreferences();
    
    const newPatientCheck = document.getElementById('notify-new-patient');
    const parentContactCheck = document.getElementById('notify-parent-contact');
    const systemCheck = document.getElementById('notify-system');
    
    if (newPatientCheck) newPatientCheck.checked = prefs.newPatientAlerts ?? true;
    if (parentContactCheck) parentContactCheck.checked = prefs.parentContactAlerts ?? true;
    if (systemCheck) systemCheck.checked = prefs.systemAnnouncements ?? true;
}

/**
 * Get notification preferences from localStorage
 */
function getNotificationPreferences() {
    const stored = localStorage.getItem(CLINIC_SETTINGS_KEY);
    return stored ? JSON.parse(stored) : {
        newPatientAlerts: true,
        parentContactAlerts: true,
        systemAnnouncements: true
    };
}

/**
 * Save notification preferences to localStorage
 */
function saveNotificationPreferencesToStorage(prefs) {
    localStorage.setItem(CLINIC_SETTINGS_KEY, JSON.stringify(prefs));
}

/**
 * Load clinic staff profile from database
 */
async function loadClinicProfile() {
    if (!currentUser || !currentUser.id) return;
    
    try {
        // First populate from currentUser (stored in localStorage from login)
        populateProfileDisplay();
        
        // Then fetch fresh data from database
        const { data: clinicStaff, error } = await supabase
            .from('clinic_staff')
            .select('*')
            .eq('id', currentUser.id)
            .single();
        
        if (error) {
            console.error('Error loading clinic profile:', error);
            return;
        }
        
        // Update currentUser with fresh data if needed
        if (clinicStaff) {
            currentUser = { ...currentUser, ...clinicStaff };
            populateProfileDisplay();
        }
        
        // Populate form fields
        const fullnameInput = document.getElementById('profile-name');
        const roleInput = document.getElementById('profile-role');
        const staffIdInput = document.getElementById('profile-staff-id');
        const usernameInput = document.getElementById('profile-username');
        const emailInput = document.querySelector('input[type="email"]');
        const contactInput = document.querySelector('input[placeholder*="contact"]');
        
        if (fullnameInput) fullnameInput.value = clinicStaff?.full_name || '';
        if (roleInput) roleInput.value = clinicStaff?.role_title || 'Nurse';
        if (staffIdInput) staffIdInput.value = clinicStaff?.clinic_id_text || '';
        if (usernameInput) usernameInput.value = clinicStaff?.username || '';
        if (emailInput) emailInput.value = clinicStaff?.email || '';
        if (contactInput) contactInput.value = clinicStaff?.contact_number || '';
        
    } catch (error) {
        console.error('Error:', error);
    }
}

/**
 * Populate profile display elements from currentUser
 */
function populateProfileDisplay() {
    const avatarEl = document.getElementById('profile-avatar');
    const nameEl = document.getElementById('profile-display-name');
    const roleEl = document.getElementById('profile-display-role');
    const idEl = document.getElementById('profile-display-id');
    
    if (avatarEl && currentUser?.full_name) {
        avatarEl.textContent = currentUser.full_name.charAt(0).toUpperCase();
    }
    if (nameEl) {
        nameEl.textContent = currentUser?.full_name || 'Nurse';
    }
    if (roleEl) {
        roleEl.textContent = currentUser?.role_title || 'Clinic Staff';
    }
    if (idEl) {
        idEl.textContent = 'ID: ' + (currentUser?.clinic_id_text || 'N/A');
    }
    
    // Also update sidebar
    const sidebarName = document.getElementById('clinic-name-sidebar');
    if (sidebarName) sidebarName.textContent = currentUser?.full_name || 'Nurse';
    
    const headerName = document.getElementById('clinic-name');
    if (headerName) headerName.textContent = currentUser?.full_name || 'Nurse';
}

// ============================================================================
// PASSWORD CHANGE
// ============================================================================

/**
 * Handle password change form submission
 */
async function handlePasswordChange(event) {
    event.preventDefault();
    
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    // Validate passwords match
    if (newPassword !== confirmPassword) {
        showToast('New passwords do not match', 'error');
        return;
    }
    
    // Validate password length
    if (newPassword.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }
    
    try {
        // Verify current password by fetching from clinic_staff
        const { data: clinicStaff, error: fetchError } = await supabase
            .from('clinic_staff')
            .select('password')
            .eq('id', currentUser.id)
            .single();
        
        if (fetchError || !clinicStaff) {
            showToast('Error verifying password', 'error');
            return;
        }
        
        if (clinicStaff.password !== currentPassword) {
            showToast('Current password is incorrect', 'error');
            return;
        }
        
        // Update password
        const { error: updateError } = await supabase
            .from('clinic_staff')
            .update({ password: newPassword })
            .eq('id', currentUser.id);
        
        if (updateError) {
            showToast('Failed to update password', 'error');
            return;
        }
        
        showToast('Password updated successfully', 'success');
        
        // Clear form
        document.getElementById('password-form').reset();
        
    } catch (error) {
        console.error('Error changing password:', error);
        showToast('An error occurred', 'error');
    }
}

// ============================================================================
// CLINIC INFORMATION (localStorage-based)
// ============================================================================

/**
 * Save clinic contact information to localStorage
 */
async function saveClinicInfo() {
    const contactNumber = document.querySelector('input[placeholder="Enter contact number"]')?.value;
    const emergencyLine = document.querySelector('input[placeholder="Emergency contact"]')?.value;
    
    // Get existing clinic info from localStorage
    const stored = localStorage.getItem(CLINIC_SETTINGS_KEY);
    const prefs = stored ? JSON.parse(stored) : {};
    
    // Update with new values
    prefs.clinicContactNumber = contactNumber;
    prefs.clinicEmergencyLine = emergencyLine;
    prefs.clinicUpdatedAt = new Date().toISOString();
    
    // Save to localStorage
    localStorage.setItem(CLINIC_SETTINGS_KEY, JSON.stringify(prefs));
    
    showToast('Clinic information saved successfully', 'success');
}

/**
 * Load clinic info from localStorage
 */
function loadClinicInfo() {
    const stored = localStorage.getItem(CLINIC_SETTINGS_KEY);
    if (!stored) return null;
    
    const prefs = JSON.parse(stored);
    return {
        contact_number: prefs.clinicContactNumber || '',
        emergency_line: prefs.clinicEmergencyLine || ''
    };
}

// ============================================================================
// NOTIFICATION PREFERENCES (localStorage-based)
// ============================================================================

/**
 * Save notification preferences to localStorage
 */
async function saveNotificationPreferences() {
    const newPatientAlerts = document.getElementById('notify-new-patient')?.checked;
    const parentContactAlerts = document.getElementById('notify-parent-contact')?.checked;
    const systemAnnouncements = document.getElementById('notify-system')?.checked;
    
    const prefs = {
        newPatientAlerts: newPatientAlerts ?? true,
        parentContactAlerts: parentContactAlerts ?? true,
        systemAnnouncements: systemAnnouncements ?? true
    };
    
    saveNotificationPreferencesToStorage(prefs);
    showToast('Notification preferences saved', 'success');
}

// ============================================================================
// PROFILE SETTINGS
// ============================================================================

/**
 * Update profile information
 */
async function updateProfile() {
    const nameInput = document.getElementById('profile-name');
    const roleInput = document.getElementById('profile-role');
    
    // These are disabled, so we can't update them directly
    // In a real system, you'd have editable fields for profile updates
    showToast('Profile information is read-only. Contact admin to make changes.', 'info');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    // Create toast element if it doesn't exist
    let toast = document.getElementById('toast-notification');
    
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.className = 'fixed bottom-4 right-4 z-50 px-6 py-3 rounded-xl shadow-lg transform transition-all duration-300 translate-y-full opacity-0';
        document.body.appendChild(toast);
    }
    
    // Set colors based on type
    const typeClasses = {
        success: 'bg-green-500 text-white',
        error: 'bg-red-500 text-white',
        warning: 'bg-amber-500 text-white',
        info: 'bg-blue-500 text-white'
    };
    
    toast.className = `fixed bottom-4 right-4 z-50 px-6 py-3 rounded-xl shadow-lg transform transition-all duration-300 ${typeClasses[type] || typeClasses.info}`;
    toast.textContent = message;
    
    // Show toast
    toast.classList.remove('translate-y-full', 'opacity-0');
    
    // Hide after 3 seconds
    setTimeout(() => {
        toast.classList.add('translate-y-full', 'opacity-0');
    }, 3000);
}

// Save notification preferences when checkboxes change
document.addEventListener('DOMContentLoaded', () => {
    const checkboxes = ['notify-new-patient', 'notify-parent-contact', 'notify-system'];
    
    checkboxes.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.addEventListener('change', () => {
                saveNotificationPreferences();
            });
        }
    });
});
