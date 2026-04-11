// teacher/teacher-settings.js
// Teacher Settings - Expanded with Profile, Theme, and Password tabs

// FIX: Add currentUser reference to prevent ReferenceError
var currentUser = typeof checkSession !== 'undefined' ? checkSession('teachers') : null;

// Redirect if not logged in
if (!currentUser) {
    window.location.href = '../index.html';
}

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize icons
    if (window.lucide) {
        window.lucide.createIcons();
    }
    
    // Load teacher profile info
    loadTeacherProfile();
    
    // Load theme preferences
    loadTeacherThemePreferences();
    
    // Update color button states based on saved theme
    const theme = JSON.parse(localStorage.getItem('educare_theme') || '{}');
    if (theme.accentColor) {
        updateTeacherAccentColorButtons(theme.accentColor);
    }
});

/**
 * Switch between settings tabs
 */
function switchTeacherSettingsTab(evt, tabId) {
    // Hide all sections
    document.querySelectorAll('.settings-section').forEach(section => {
        section.classList.add('hidden');
    });
    
    // Remove active state from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('border-blue-500', 'text-blue-600');
        btn.classList.add('border-transparent', 'text-gray-400');
    });
    
    // Show selected section
    document.getElementById(`section-${tabId}`).classList.remove('hidden');
    
    // Add active state to clicked button
    const clickedBtn = document.getElementById(`btn-${tabId}`);
    clickedBtn.classList.remove('border-transparent', 'text-gray-400');
    clickedBtn.classList.add('border-blue-500', 'text-blue-600');
}

/**
 * Load teacher profile information
 */
async function loadTeacherProfile() {
    const container = document.getElementById('teacher-profile-content');
    if (!container) return;
    
    try {
        const { data: teacher, error } = await supabase
            .from('teachers')
            .select('*, classes(id, grade_level, department)')
            .eq('id', currentUser.id)
            .single();
        
        if (error || !teacher) {
            container.innerHTML = '<p class="text-red-500">Error loading profile</p>';
            return;
        }
        
        const homeroomInfo = teacher.classes 
            ? `${teacher.classes?.grade_level || 'Unassigned'} - ${teacher.classes?.department || 'N/A'}`
            : 'No Homeroom Assigned';
        
        container.innerHTML = `
            <div class="flex items-center gap-6 mb-8">
                <div class="w-24 h-24 bg-gradient-to-br from-blue-400 to-blue-600 rounded-3xl flex items-center justify-center text-white text-3xl font-black shadow-lg shadow-blue-500/30">
                    ${teacher.full_name ? teacher.full_name.charAt(0).toUpperCase() : 'T'}
                </div>
                <div>
                    <h4 class="text-2xl font-black text-gray-800">${escapeHtml(teacher.full_name || 'Unknown')}</h4>
                    <p class="text-gray-500 font-medium">Teacher</p>
                </div>
            </div>
            <div class="space-y-4">
                <div class="flex justify-between py-3 border-b border-gray-100">
                    <span class="text-gray-500 font-medium">Employee ID</span>
                    <span class="font-bold text-gray-800">${escapeHtml(teacher.employee_id || 'N/A')}</span>
                </div>
                <div class="flex justify-between py-3 border-b border-gray-100">
                    <span class="text-gray-500 font-medium">Email</span>
                    <span class="font-bold text-gray-800">${escapeHtml(teacher.email || 'N/A')}</span>
                </div>
                <div class="flex justify-between py-3 border-b border-gray-100">
                    <span class="text-gray-500 font-medium">Phone</span>
                    <span class="font-bold text-gray-800">${escapeHtml(teacher.phone || 'N/A')}</span>
                </div>
                <div class="flex justify-between py-3 border-b border-gray-100">
                    <span class="text-gray-500 font-medium">Homeroom Class</span>
                    <span class="font-bold text-gray-800">${homeroomInfo}</span>
                </div>
                <div class="flex justify-between py-3 border-b border-gray-100">
                    <span class="text-gray-500 font-medium">Gatekeeper Access</span>
                    <span class="font-bold ${teacher.is_gatekeeper ? 'text-green-600' : 'text-gray-400'}">
                        ${teacher.is_gatekeeper ? 'Enabled' : 'Disabled'}
                    </span>
                </div>
            </div>
        `;
        
    } catch (err) {
        console.error('Error loading teacher profile:', err);
        container.innerHTML = '<p class="text-red-500">Error loading profile</p>';
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Load theme preferences from localStorage
 */
function loadTeacherThemePreferences() {
    const theme = JSON.parse(localStorage.getItem('educare_theme') || '{}');
    
    // Load accent color
    if (theme.accentColor) {
        setTeacherThemeColor(theme.accentColor, false);
    }
    
    // Load sidebar style
    if (theme.sidebarStyle) {
        setTeacherSidebarStyle(theme.sidebarStyle, false);
    }
    
    // Load compact mode
    const compactToggle = document.getElementById('compact-mode');
    if (compactToggle && theme.compactMode) {
        compactToggle.checked = true;
    }
}

/**
 * Set accent color for teacher theme
 */
function setTeacherThemeColor(color, save = true) {
    // Remove all color classes
    document.body.classList.remove('theme-violet', 'theme-blue', 'theme-emerald', 'theme-amber', 'theme-rose');
    document.body.classList.add(`theme-${color}`);
    
    if (save) {
        const theme = JSON.parse(localStorage.getItem('educare_theme') || '{}');
        theme.accentColor = color;
        localStorage.setItem('educare_theme', JSON.stringify(theme));
    }
    
    updateTeacherAccentColorButtons(color);
}

/**
 * Update the visual state of color buttons
 */
function updateTeacherAccentColorButtons(activeColor) {
    document.querySelectorAll('[data-color-btn]').forEach(btn => {
        const btnColor = btn.getAttribute('data-color-btn');
        if (btnColor === activeColor) {
            btn.classList.add('ring-2', 'ring-offset-2', `ring-${activeColor}-600`);
            btn.classList.remove('ring-transparent');
        } else {
            btn.classList.remove('ring-2', 'ring-offset-2', 'ring-violet-600', 'ring-blue-600', 'ring-emerald-600', 'ring-amber-600', 'ring-rose-600');
            btn.classList.add('ring-transparent');
        }
    });
}

/**
 * Set sidebar style for teacher theme
 */
function setTeacherSidebarStyle(style, save = true) {
    document.body.classList.remove('sidebar-dark', 'sidebar-light');
    document.body.classList.add(`sidebar-${style}`);
    
    if (save) {
        const theme = JSON.parse(localStorage.getItem('educare_theme') || '{}');
        theme.sidebarStyle = style;
        localStorage.setItem('educare_theme', JSON.stringify(theme));
    }
}

/**
 * Save theme preferences
 */
function saveTeacherThemePreferences() {
    const compactToggle = document.getElementById('compact-mode');
    const isCompact = compactToggle ? compactToggle.checked : false;
    
    const theme = JSON.parse(localStorage.getItem('educare_theme') || '{}');
    theme.compactMode = isCompact;
    localStorage.setItem('educare_theme', JSON.stringify(theme));
    
    // Apply compact mode
    if (isCompact) {
        document.body.classList.add('compact-mode');
    } else {
        document.body.classList.remove('compact-mode');
    }
    
    showNotification("Settings successfully saved!", "success");
}

/**
 * Submit password change - Updated for new UI
 */
async function submitPasswordChange() {
    const current = document.getElementById('cp-current').value;
    const newPass = document.getElementById('cp-new').value;
    const confirmPass = document.getElementById('cp-confirm').value;
    
    if (!current || !newPass || !confirmPass) {
        return showNotification("All password fields are required.", "error");
    }
    if (newPass !== confirmPass) {
        return showNotification("New passwords do not match.", "error");
    }
    if (newPass.length < 6) {
        return showNotification("Password must be at least 6 characters.", "error");
    }
    
    const user = checkSession('teachers');
    if (!user) return;
    
    const { data, error } = await supabase
        .from('teachers')
        .select('id, full_name')
        .eq('id', user.id)
        .eq('password', current)
        .single();
    
    if (error || !data) {
        return showNotification("Incorrect current password.", "error");
    }
    
    const { error: updateErr } = await supabase
        .from('teachers')
        .update({ password: newPass })
        .eq('id', user.id);
    
    if (updateErr) {
        showNotification(updateErr.message, "error");
    } else {
        // Notify admin about password change
        await supabase.from('notifications').insert({
            recipient_role: 'admins',
            title: 'Password Change',
            message: `Teacher "${data.full_name}" has changed their password.`,
            type: 'system_alert',
            is_read: false
        });
        
        showNotification("Password updated successfully!", "success");
        
        // Clear form
        ['cp-current', 'cp-new', 'cp-confirm'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }
}

// EXPORT: Make button handler functions globally accessible for HTML onclick attributes
window.switchTeacherSettingsTab = switchTeacherSettingsTab;
window.submitPasswordChange = submitPasswordChange;
window.setTeacherThemeColor = setTeacherThemeColor;
window.setTeacherSidebarStyle = setTeacherSidebarStyle;
window.saveTeacherThemePreferences = saveTeacherThemePreferences;
