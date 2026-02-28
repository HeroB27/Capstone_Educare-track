// parent/parent-settings.js
// UPDATED: Added loading states, use currentUser directly, improved UX

// Load notification preferences on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadNotificationPreferences();
});

/**
 * Load notification preferences from parents table
 */
async function loadNotificationPreferences() {
    try {
        const { data, error } = await supabase
            .from('parents')
            .select('notification_preferences')
            .eq('id', window.currentUser?.id)
            .single();

        if (error || !data) return;

        const prefs = data.notification_preferences || {};
        
        // Set checkbox states
        if (prefs.entry_exit !== undefined) {
            document.getElementById('pref-entryexit').checked = prefs.entry_exit;
        }
        if (prefs.clinic !== undefined) {
            document.getElementById('pref-clinic').checked = prefs.clinic;
        }
        if (prefs.urgent !== undefined) {
            document.getElementById('pref-urgent').checked = prefs.urgent;
        }
        if (prefs.excuse !== undefined) {
            document.getElementById('pref-excuse').checked = prefs.excuse;
        }
    } catch (err) {
        console.error('Error loading preferences:', err);
    }
}

/**
 * Save notification preferences
 */
async function saveNotificationPreferences() {
    const prefs = {
        entry_exit: document.getElementById('pref-entryexit')?.checked ?? true,
        clinic: document.getElementById('pref-clinic')?.checked ?? true,
        urgent: document.getElementById('pref-urgent')?.checked ?? true,
        excuse: document.getElementById('pref-excuse')?.checked ?? true
    };

    const btn = document.getElementById('save-prefs-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        const { error } = await supabase
            .from('parents')
            .update({ notification_preferences: prefs })
            .eq('id', window.currentUser?.id);

        if (error) throw error;

        showMessage('Preferences saved successfully!', 'success');
    } catch (err) {
        showMessage('Error saving preferences: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Preferences';
    }
}

/**
 * Submit password change with loading state
 * SECURITY NOTE: This stores passwords in plaintext - requires backend migration to Supabase Auth
 */
async function submitPasswordChange() {
    const current = document.getElementById('cp-current').value;
    const newPass = document.getElementById('cp-new').value;
    const confirmPass = document.getElementById('cp-confirm').value;

    if (!current || !newPass || !confirmPass) {
        return showMessage('All password fields are required.', 'error');
    }
    if (newPass !== confirmPass) {
        return showMessage('New passwords do not match.', 'error');
    }
    if (newPass.length < 6) {
        return showMessage('Password must be at least 6 characters.', 'error');
    }

    // Use currentUser directly instead of checkSession
    const user = window.currentUser;
    if (!user) {
        return showMessage('Session expired. Please login again.', 'error');
    }

    const btn = document.getElementById('update-pass-btn');
    btn.disabled = true;
    btn.textContent = 'Updating...';

    try {
        // SECURITY WARNING: This compares plaintext passwords - should use Supabase Auth
        const { data, error } = await supabase
            .from('parents')
            .select('id')
            .eq('id', user.id)
            .eq('password', current)
            .single();

        if (error || !data) {
            throw new Error('Incorrect current password.');
        }

        const { error: updateErr } = await supabase
            .from('parents')
            .update({ password: newPass })
            .eq('id', user.id);

        if (updateErr) throw updateErr;

        showMessage('Password updated successfully!', 'success');
        
        // Clear form fields
        ['cp-current', 'cp-new', 'cp-confirm'].forEach(id => {
            document.getElementById(id).value = '';
        });

    } catch (err) {
        showMessage(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Update Password';
    }
}

/**
 * Show message to user
 */
function showMessage(text, type) {
    const msgEl = document.getElementById('settings-message');
    if (!msgEl) return;
    
    msgEl.textContent = text;
    msgEl.className = `mt-4 p-3 rounded-lg ${type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`;
    msgEl.classList.remove('hidden');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        msgEl.classList.add('hidden');
    }, 5000);
}

// Make functions available globally
window.submitPasswordChange = submitPasswordChange;
window.saveNotificationPreferences = saveNotificationPreferences;
