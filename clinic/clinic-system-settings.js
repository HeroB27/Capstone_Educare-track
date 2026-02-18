// clinic/clinic-system-settings.js

// ============================================================================
// CLINIC SYSTEM SETTINGS - JavaScript Logic
// ============================================================================
// Features: Profile management, password change, notification preferences, clinic info
// ============================================================================

// Session Check
// currentUser is now global in clinic-core.js

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
// SETTINGS LOADING
// ============================================================================

/**
 * Load current settings from database
 */
async function loadSettings() {
    try {
        // Load notification preferences
        const { data: prefs, error: prefsError } = await supabase
            .from('clinic_notification_preferences')
            .select('*')
            .eq('clinic_staff_id', currentUser.id)
            .single();
        
        if (!prefsError && prefs) {
            document.getElementById('notify-new-patient').checked = prefs.new_patient_alerts ?? true;
            document.getElementById('notify-parent-contact').checked = prefs.parent_contact_alerts ?? true;
            document.getElementById('notify-system').checked = prefs.system_announcements ?? true;
        }
        
        // Load clinic info if available
        const { data: clinicInfo, error: clinicError } = await supabase
            .from('clinic_info')
            .select('*')
            .single();
        
        if (!clinicError && clinicInfo) {
            const contactInput = document.querySelector('input[placeholder="Enter contact number"]');
            const emergencyInput = document.querySelector('input[placeholder="Emergency contact"]');
            if (contactInput) contactInput.value = clinicInfo.contact_number || '';
            if (emergencyInput) emergencyInput.value = clinicInfo.emergency_line || '';
        }
        
    } catch (error) {
        console.error('Error loading settings:', error);
    }
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
        // Verify current password by attempting to sign in
        const { data: authData, error: authError } = await supabase
            .from('clinic_staff')
            .select('*')
            .eq('username', currentUser.username)
            .eq('password', currentPassword)
            .single();
        
        if (authError || !authData) {
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
// CLINIC INFORMATION
// ============================================================================

/**
 * Save clinic information
 */
async function saveClinicInfo() {
    const contactNumber = document.querySelector('input[placeholder="Enter contact number"]')?.value;
    const emergencyLine = document.querySelector('input[placeholder="Emergency contact"]')?.value;
    
    try {
        // Check if clinic info exists
        const { data: existingInfo, error: fetchError } = await supabase
            .from('clinic_info')
            .select('id')
            .single();
        
        if (fetchError && fetchError.code !== 'PGRST116') {
            showToast('Error fetching clinic info', 'error');
            return;
        }
        
        let error;
        
        if (existingInfo) {
            // Update existing record
            const { error: updateError } = await supabase
                .from('clinic_info')
                .update({
                    contact_number: contactNumber,
                    emergency_line: emergencyLine,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingInfo.id);
            
            error = updateError;
        } else {
            // Create new record
            const { error: insertError } = await supabase
                .from('clinic_info')
                .insert({
                    contact_number: contactNumber,
                    emergency_line: emergencyLine,
                    clinic_name: 'School Clinic',
                    operating_hours: '7:00 AM - 5:00 PM'
                });
            
            error = insertError;
        }
        
        if (error) {
            console.error('Error saving clinic info:', error);
            showToast('Failed to save clinic information', 'error');
            return;
        }
        
        showToast('Clinic information saved successfully', 'success');
        
    } catch (error) {
        console.error('Error saving clinic info:', error);
        showToast('An error occurred', 'error');
    }
}

// ============================================================================
// NOTIFICATION PREFERENCES
// ============================================================================

/**
 * Save notification preferences
 */
async function saveNotificationPreferences() {
    const newPatientAlerts = document.getElementById('notify-new-patient').checked;
    const parentContactAlerts = document.getElementById('notify-parent-contact').checked;
    const systemAnnouncements = document.getElementById('notify-system').checked;
    
    try {
        // Check if preferences exist
        const { data: existingPrefs, error: fetchError } = await supabase
            .from('clinic_notification_preferences')
            .select('id')
            .eq('clinic_staff_id', currentUser.id)
            .single();
        
        let error;
        
        if (existingPrefs) {
            // Update existing preferences
            const { error: updateError } = await supabase
                .from('clinic_notification_preferences')
                .update({
                    new_patient_alerts: newPatientAlerts,
                    parent_contact_alerts: parentContactAlerts,
                    system_announcements: systemAnnouncements,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingPrefs.id);
            
            error = updateError;
        } else {
            // Create new preferences
            const { error: insertError } = await supabase
                .from('clinic_notification_preferences')
                .insert({
                    clinic_staff_id: currentUser.id,
                    new_patient_alerts: newPatientAlerts,
                    parent_contact_alerts: parentContactAlerts,
                    system_announcements: systemAnnouncements
                });
            
            error = insertError;
        }
        
        if (error) {
            console.error('Error saving preferences:', error);
            showToast('Failed to save preferences', 'error');
            return;
        }
        
        showToast('Notification preferences saved', 'success');
        
    } catch (error) {
        console.error('Error saving preferences:', error);
        showToast('An error occurred', 'error');
    }
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
            checkbox.addEventListener('change', saveNotificationPreferences);
        }
    });
});
