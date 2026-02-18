// admin/admin-attendance-settings.js

// 1. Session Check
// currentUser is now global in admin-core.js

// 2. Initialize Page
document.addEventListener('DOMContentLoaded', () => {
    if (currentUser) {
        document.getElementById('admin-name').innerText = currentUser.full_name || 'Admin';
    }
    
    // Load all settings
    loadThresholdSettings();
    loadAttendanceRules();
    loadNotificationSettings();
});

// ============ TAB SWITCHING ============

// 3. Switch Settings Tab
function switchTab(tabName) {
    // Update tab styling
    document.getElementById('tab-thresholds').className = 'px-4 py-2 border-b-2 border-transparent text-gray-500 hover:text-gray-700';
    document.getElementById('tab-attendance-rules').className = 'px-4 py-2 border-b-2 border-transparent text-gray-500 hover:text-gray-700';
    document.getElementById('tab-notifications').className = 'px-4 py-2 border-b-2 border-transparent text-gray-500 hover:text-gray-700';
    document.getElementById('tab-' + tabName).className = 'px-4 py-2 border-b-2 border-violet-500 text-violet-600 font-medium';
    
    // Show/hide content
    document.getElementById('thresholdsTab').classList.add('hidden');
    document.getElementById('attendanceRulesTab').classList.add('hidden');
    document.getElementById('notificationsTab').classList.add('hidden');
    document.getElementById(tabName + 'Tab').classList.remove('hidden');
}

// ============ THRESHOLD SETTINGS ============

// 4. Load Threshold Settings from Database
async function loadThresholdSettings() {
    try {
        // Fetch all threshold settings from settings table
        const { data, error } = await supabase
            .from('settings')
            .select('*')
            .or('setting_key.like.%threshold_%,setting_key.like.%entry_%,setting_key.like.%dismissal_%,setting_key.like.%grace_%');
        
        if (error) throw error;
        
        // Create map of settings
        const settingsMap = {};
        (data || []).forEach(s => {
            settingsMap[s.setting_key] = s.setting_value;
        });
        
        // Entry Time Fields
        const entryFields = ['entry_kinder', 'entry_g1_g6', 'entry_g7_g10', 'entry_g11_g12'];
        entryFields.forEach(field => {
            const element = document.getElementById(field);
            if (element && settingsMap[field]) {
                element.value = settingsMap[field];
            } else if (element) {
                // Set default values
                const defaults = {
                    'entry_kinder': '07:30',
                    'entry_g1_g6': '07:30',
                    'entry_g7_g10': '07:30',
                    'entry_g11_g12': '07:30'
                };
                element.value = defaults[field] || '07:30';
            }
        });
        
        // Late Threshold Fields
        const thresholdFields = [
            'threshold_kinder', 'threshold_g1_g3', 'threshold_g4_g6',
            'threshold_g7_g8', 'threshold_g9_g10', 'threshold_shs_am'
        ];
        
        thresholdFields.forEach(field => {
            const element = document.getElementById(field);
            if (element && settingsMap[field]) {
                element.value = settingsMap[field];
            } else if (element) {
                // Set default values (threshold = entry time + 15 min buffer)
                const defaults = {
                    'threshold_kinder': '08:00',
                    'threshold_g1_g3': '08:00',
                    'threshold_g4_g6': '08:00',
                    'threshold_g7_g8': '08:00',
                    'threshold_g9_g10': '08:00',
                    'threshold_shs_am': '08:00'
                };
                element.value = defaults[field] || '08:15';
            }
        });
        
        // Dismissal Time Fields
        const dismissalFields = ['dismissal_kinder', 'dismissal_g1_g6', 'dismissal_g7_g10', 'dismissal_g11_g12'];
        dismissalFields.forEach(field => {
            const element = document.getElementById(field);
            if (element && settingsMap[field]) {
                element.value = settingsMap[field];
            } else if (element) {
                // Set default values per grade level
                const defaults = {
                    'dismissal_kinder': '11:30',
                    'dismissal_g1_g6': '15:00',
                    'dismissal_g7_g10': '16:00',
                    'dismissal_g11_g12': '16:30'
                };
                element.value = defaults[field] || '15:00';
            }
        });
        
        // Grace Period
        const graceElement = document.getElementById('grace_period_minutes');
        if (graceElement && settingsMap['grace_period_minutes']) {
            graceElement.value = settingsMap['grace_period_minutes'];
        } else if (graceElement) {
            graceElement.value = '15'; // Default 15 minutes
        }
        
    } catch (error) {
        console.error('Error loading threshold settings:', error);
        // Set default values on error
        setDefaultTimeValues();
    }
}

// Set default time values when DB fetch fails
function setDefaultTimeValues() {
    const defaults = {
        'entry_kinder': '07:30', 'entry_g1_g6': '07:30', 'entry_g7_g10': '07:30', 'entry_g11_g12': '07:30',
        'threshold_kinder': '08:00', 'threshold_g1_g3': '08:00', 'threshold_g4_g6': '08:00',
        'threshold_g7_g8': '08:00', 'threshold_g9_g10': '08:00', 'threshold_shs_am': '08:00',
        'dismissal_kinder': '11:30', 'dismissal_g1_g6': '15:00', 'dismissal_g7_g10': '16:00', 'dismissal_g11_g12': '16:30',
        'grace_period_minutes': '15'
    };
    
    Object.keys(defaults).forEach(field => {
        const element = document.getElementById(field);
        if (element) element.value = defaults[field];
    });
}

// 5. Save Threshold Settings
// UPDATED: Use bulk upsert instead of individual requests to prevent API spam
async function saveThresholds() {
    const settings = [
        // Entry Times
        { key: 'entry_kinder', value: document.getElementById('entry_kinder').value, desc: 'Kinder entry time' },
        { key: 'entry_g1_g6', value: document.getElementById('entry_g1_g6').value, desc: 'Grades 1-6 entry time' },
        { key: 'entry_g7_g10', value: document.getElementById('entry_g7_g10').value, desc: 'Grades 7-10 entry time' },
        { key: 'entry_g11_g12', value: document.getElementById('entry_g11_g12').value, desc: 'Grades 11-12 entry time' },
        // Late Thresholds (with grace period)
        { key: 'threshold_kinder', value: document.getElementById('threshold_kinder').value, desc: 'Kinder late threshold' },
        { key: 'threshold_g1_g3', value: document.getElementById('threshold_g1_g3').value, desc: 'Grades 1-3 late threshold' },
        { key: 'threshold_g4_g6', value: document.getElementById('threshold_g4_g6').value, desc: 'Grades 4-6 late threshold' },
        { key: 'threshold_g7_g8', value: document.getElementById('threshold_g7_g8').value, desc: 'Grades 7-8 late threshold' },
        { key: 'threshold_g9_g10', value: document.getElementById('threshold_g9_g10').value, desc: 'Grades 9-10 late threshold' },
        { key: 'threshold_shs_am', value: document.getElementById('threshold_shs_am').value, desc: 'SHS AM session late threshold' },
        // Dismissal Times
        { key: 'dismissal_kinder', value: document.getElementById('dismissal_kinder').value, desc: 'Kinder dismissal time' },
        { key: 'dismissal_g1_g6', value: document.getElementById('dismissal_g1_g6').value, desc: 'Grades 1-6 dismissal time' },
        { key: 'dismissal_g7_g10', value: document.getElementById('dismissal_g7_g10').value, desc: 'Grades 7-10 dismissal time' },
        { key: 'dismissal_g11_g12', value: document.getElementById('dismissal_g11_g12').value, desc: 'Grades 11-12 dismissal time' },
        // Grace Period
        { key: 'grace_period_minutes', value: document.getElementById('grace_period_minutes').value, desc: 'Grace period in minutes for late arrival' }
    ];
    
    try {
        // Bulk upsert all settings in a single request
        const bulkData = settings.map(setting => ({
            setting_key: setting.key,
            setting_value: setting.value,
            description: setting.desc
        }));

        const { error } = await supabase
            .from('settings')
            .upsert(bulkData, { onConflict: 'setting_key' });
        
        if (error) throw error;
        
        alert('Time settings saved successfully!');
        
    } catch (error) {
        console.error('Error saving thresholds:', error);
        alert('Error saving settings: ' + error.message);
    }
}

// ============ ATTENDANCE RULES ============

// 6. Load Attendance Rules
async function loadAttendanceRules() {
    try {
        const { data, error } = await supabase
            .from('settings')
            .select('*')
            .in('setting_key', ['halfday_minutes', 'auto_absent_after', 'tardiness_cap', 'allow_excuse_override']);
        
        if (error) throw error;
        
        const settingsMap = {};
        (data || []).forEach(s => {
            settingsMap[s.setting_key] = s.setting_value;
        });
        
        // Set values
        if (settingsMap['halfday_minutes']) {
            document.getElementById('halfday_minutes').value = settingsMap['halfday_minutes'];
        }
        if (settingsMap['auto_absent_after']) {
            document.getElementById('auto_absent_after').value = settingsMap['auto_absent_after'];
        }
        if (settingsMap['tardiness_cap']) {
            document.getElementById('tardiness_cap').value = settingsMap['tardiness_cap'];
        }
        if (settingsMap['allow_excuse_override']) {
            document.getElementById('allow_excuse_override').value = settingsMap['allow_excuse_override'];
        }
        
    } catch (error) {
        console.error('Error loading attendance rules:', error);
    }
}

// 7. Save Attendance Rules
// UPDATED: Use bulk upsert instead of individual requests to prevent API spam
async function saveAttendanceRules() {
    const settings = [
        { key: 'halfday_minutes', value: document.getElementById('halfday_minutes').value, desc: 'Minimum minutes for half-day' },
        { key: 'auto_absent_after', value: document.getElementById('auto_absent_after').value, desc: 'Minutes after start to auto-mark absent' },
        { key: 'tardiness_cap', value: document.getElementById('tardiness_cap').value, desc: 'Max tardiness minutes before absent' },
        { key: 'allow_excuse_override', value: document.getElementById('allow_excuse_override').value, desc: 'Allow excuse letter for tardiness' }
    ];
    
    try {
        // Bulk upsert all rules in a single request
        const bulkData = settings.map(setting => ({
            setting_key: setting.key,
            setting_value: setting.value,
            description: setting.desc
        }));

        const { error } = await supabase
            .from('settings')
            .upsert(bulkData, { onConflict: 'setting_key' });
        
        if (error) throw error;
        
        alert('Attendance rules saved successfully!');
        
    } catch (error) {
        console.error('Error saving attendance rules:', error);
        alert('Error saving rules: ' + error.message);
    }
}

// ============ NOTIFICATION SETTINGS ============

// 8. Load Notification Settings
async function loadNotificationSettings() {
    try {
        const { data: settings, error } = await supabase.from('settings').select('*');
        if (error) throw error;

        settings.forEach(setting => {
            const element = document.getElementById(setting.setting_key);
            if (element) {
                // If it's a checkbox, evaluate the string strictly
                if (element.type === 'checkbox') {
                    element.checked = (setting.setting_value === 'true');
                } 
                // If it's a time/text input, just assign the value
                else {
                    element.value = setting.setting_value;
                }
            }
        });
    } catch (err) {
        console.error("Error loading settings:", err);
    }
}

// 9. Save Notification Settings
// UPDATED: Use bulk upsert instead of individual requests to prevent API spam
async function saveNotificationSettings() {
    const settings = [
        { key: 'notify_late', value: document.getElementById('notify_late').checked.toString(), desc: 'Notify on late arrival' },
        { key: 'notify_absent', value: document.getElementById('notify_absent').checked.toString(), desc: 'Notify on absence' },
        { key: 'notify_clinic', value: document.getElementById('notify_clinic').checked.toString(), desc: 'Notify on clinic visit' },
        { key: 'notify_early_dismissal', value: document.getElementById('notify_early_dismissal').checked.toString(), desc: 'Notify on early dismissal' },
        { key: 'notify_batch_am', value: document.getElementById('notify_batch_am').value, desc: 'AM batch notification time' },
        { key: 'notify_batch_pm', value: document.getElementById('notify_batch_pm').value, desc: 'PM batch notification time' }
    ];
    
    try {
        // Bulk upsert all settings in a single request
        const bulkData = settings.map(setting => ({
            setting_key: setting.key,
            setting_value: setting.value,
            description: setting.desc
        }));

        const { error } = await supabase
            .from('settings')
            .upsert(bulkData, { onConflict: 'setting_key' });
        
        if (error) throw error;
        
        alert('Notification settings saved successfully!');
        
    } catch (error) {
        console.error('Error saving notification settings:', error);
        alert('Error saving settings: ' + error.message);
    }
}
