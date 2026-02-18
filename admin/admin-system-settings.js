// admin/admin-system-settings.js

// 1. Session Check
// currentUser is now global in admin-core.js

// 2. Initialize Page
document.addEventListener('DOMContentLoaded', () => {
    if (currentUser) {
        document.getElementById('admin-name').innerText = currentUser.full_name || 'Admin';
    }
    
    // Set current month/year
    const now = new Date();
    document.getElementById('holidayMonth').value = now.getMonth();
    populateYearDropdown();
    loadHolidays();
    loadThresholds();
});

// 3. Populate Year Dropdown
function populateYearDropdown() {
    const yearSelect = document.getElementById('holidayYear');
    const currentYear = new Date().getFullYear();
    
    for (let year = currentYear - 1; year <= currentYear + 2; year++) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (year === currentYear) option.selected = true;
        yearSelect.appendChild(option);
    }
}

// ============ TAB SWITCHING ============

// 4. Switch Settings Tab
function switchSettingsTab(tabName) {
    // Update tab styling
    document.getElementById('tab-thresholds').className = 'px-4 py-2 border-b-2 border-transparent text-gray-500 hover:text-gray-700';
    document.getElementById('tab-holidays').className = 'px-4 py-2 border-b-2 border-transparent text-gray-500 hover:text-gray-700';
    document.getElementById('tab-' + tabName).className = 'px-4 py-2 border-b-2 border-violet-500 text-violet-600 font-medium';
    
    // Show/hide content
    document.getElementById('thresholdsTab').classList.add('hidden');
    document.getElementById('holidaysTab').classList.add('hidden');
    document.getElementById(tabName + 'Tab').classList.remove('hidden');
}

// ============ THRESHOLD SETTINGS ============

// 5. Load Thresholds from Database
async function loadThresholds() {
    try {
        const { data, error } = await supabase
            .from('settings')
            .select('*');
        
        if (error) throw error;
        
        // Create map of settings
        const settingsMap = {};
        (data || []).forEach(s => {
            settingsMap[s.setting_key] = s.setting_value;
        });
        
        // Set values
        if (settingsMap['threshold_kinder']) document.getElementById('threshold_kinder').value = settingsMap['threshold_kinder'];
        if (settingsMap['threshold_g1_g3']) document.getElementById('threshold_g1_g3').value = settingsMap['threshold_g1_g3'];
        if (settingsMap['threshold_g4_g6']) document.getElementById('threshold_g4_g6').value = settingsMap['threshold_g4_g6'];
        if (settingsMap['threshold_g7_g8']) document.getElementById('threshold_g7_g8').value = settingsMap['threshold_g7_g8'];
        if (settingsMap['threshold_g9_g10']) document.getElementById('threshold_g9_g10').value = settingsMap['threshold_g9_g10'];
        if (settingsMap['threshold_shs_am']) document.getElementById('threshold_shs_am').value = settingsMap['threshold_shs_am'];
        if (settingsMap['threshold_shs_pm']) document.getElementById('threshold_shs_pm').value = settingsMap['threshold_shs_pm'];
        
    } catch (error) {
        console.error('Error loading thresholds:', error);
        // Use default values on error
    }
}

// 6. Save Thresholds
async function saveThresholds() {
    const thresholds = [
        { key: 'threshold_kinder', value: document.getElementById('threshold_kinder').value },
        { key: 'threshold_g1_g3', value: document.getElementById('threshold_g1_g3').value },
        { key: 'threshold_g4_g6', value: document.getElementById('threshold_g4_g6').value },
        { key: 'threshold_g7_g8', value: document.getElementById('threshold_g7_g8').value },
        { key: 'threshold_g9_g10', value: document.getElementById('threshold_g9_g10').value },
        { key: 'threshold_shs_am', value: document.getElementById('threshold_shs_am').value },
        { key: 'threshold_shs_pm', value: document.getElementById('threshold_shs_pm').value }
    ];
    
    try {
        for (const threshold of thresholds) {
            // Upsert each threshold
            const { error } = await supabase
                .from('settings')
                .upsert({
                    setting_key: threshold.key,
                    setting_value: threshold.value,
                    description: 'Late threshold for ' + threshold.key.replace('threshold_', '')
                }, { onConflict: 'setting_key' });
            
            if (error) throw error;
        }
        
        alert('Late thresholds saved successfully!');
        
    } catch (error) {
        console.error('Error saving thresholds:', error);
        alert('Error saving thresholds: ' + error.message);
    }
}

// ============ HOLIDAY MANAGEMENT ============

// 7. Load Holidays
async function loadHolidays() {
    const month = parseInt(document.getElementById('holidayMonth').value);
    const year = parseInt(document.getElementById('holidayYear').value);
    
    try {
        const { data, error } = await supabase
            .from('holidays')
            .select('*')
            .gte('holiday_date', year + '-' + String(month + 1).padStart(2, '0') + '-01')
            .lte('holiday_date', year + '-' + String(month + 1).padStart(2, '0') + '-31');
        
        if (error) throw error;
        
        renderHolidaysList(data || []);
        
    } catch (error) {
        console.error('Error loading holidays:', error);
        document.getElementById('holidaysList').innerHTML = '<p class="text-red-500 text-center py-8">Error loading holidays</p>';
    }
}

// 8. Render Holidays List
function renderHolidaysList(holidays) {
    const container = document.getElementById('holidaysList');
    
    if (holidays.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-8">No holidays marked for this month</p>';
        return;
    }
    
    container.innerHTML = holidays.map(holiday => `
        <div class="flex items-center justify-between border rounded-lg p-4 ${holiday.is_suspended ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}">
            <div class="flex items-center gap-4">
                <div class="text-center bg-white rounded-lg p-2 border min-w-[60px]">
                    <p class="text-xs text-gray-500">${formatMonthShort(holiday.holiday_date)}</p>
                    <p class="text-xl font-bold text-violet-600">${formatDay(holiday.holiday_date)}</p>
                </div>
                <div>
                    <h4 class="font-medium">${holiday.description}</h4>
                    <p class="text-sm text-gray-500">
                        ${holiday.is_suspended ? '🏫 School Suspension - No absences' : '📅 Holiday'}
                    </p>
                </div>
            </div>
            <button onclick="deleteHoliday(${holiday.id})" class="text-red-600 hover:text-red-800">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
        </div>
    `).join('');
}

// 9. Open Add Holiday Modal
function openAddHolidayModal() {
    document.getElementById('holidayDate').value = '';
    document.getElementById('holidayDescription').value = '';
    document.getElementById('holidayIsSuspended').checked = true;
    document.getElementById('addHolidayModal').classList.remove('hidden');
}

// 10. Close Add Holiday Modal
function closeAddHolidayModal() {
    document.getElementById('addHolidayModal').classList.add('hidden');
}

// 11. Save Holiday
async function saveHoliday() {
    const date = document.getElementById('holidayDate').value;
    const description = document.getElementById('holidayDescription').value.trim();
    const isSuspended = document.getElementById('holidayIsSuspended').checked;
    
    // Validation
    if (!date || !description) {
        alert('Please fill in all required fields.');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('holidays')
            .insert({
                holiday_date: date,
                description: description,
                is_suspended: isSuspended
            });
        
        if (error) throw error;
        
        alert('Holiday saved successfully!');
        closeAddHolidayModal();
        loadHolidays();
        
    } catch (error) {
        console.error('Error saving holiday:', error);
        alert('Error saving holiday: ' + error.message);
    }
}

// 12. Delete Holiday
async function deleteHoliday(id) {
    if (!confirm('Are you sure you want to delete this holiday?')) {
        return;
    }
    
    try {
        const { error } = await supabase
            .from('holidays')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        loadHolidays();
        
    } catch (error) {
        console.error('Error deleting holiday:', error);
        alert('Error deleting holiday: ' + error.message);
    }
}

// ============ HELPER FUNCTIONS ============

// 13. Format Date Helpers
function formatMonthShort(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short' });
}

function formatDay(dateString) {
    const date = new Date(dateString);
    return date.getDate();
}
