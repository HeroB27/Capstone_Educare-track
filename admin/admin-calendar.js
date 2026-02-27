// admin/admin-calendar.js
// Manages School Calendar - Holidays and Suspension Days

let deleteTargetDate = null;

// 1. Initialize Page
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkSession === 'function') {
        if (!checkSession('admins')) return;
    }
    
    await loadHolidays();
    loadStats();
    setupEventListeners();
    
    // Real-time subscription for holidays
    supabase.channel('calendar-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'holidays' }, () => {
            loadHolidays();
            loadStats();
        })
        .subscribe();
});

// 2. Setup Event Listeners
function setupEventListeners() {
    const searchInput = document.getElementById('search-holidays');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(loadHolidays, 300));
    }
}

// 3. Load All Holidays from Database
async function loadHolidays() {
    const list = document.getElementById('holidays-list');
    if (!list) return;

    list.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-gray-400 italic">Loading holidays...</td></tr>';

    try {
        const searchQuery = document.getElementById('search-holidays')?.value || '';
        const filterType = document.getElementById('filter-type')?.value || 'all';

        let query = supabase.from('holidays').select('*').order('holiday_date', { ascending: true });

        // Apply search filter
        if (searchQuery) {
            query = query.ilike('description', `%${searchQuery}%`);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Apply type filter
        let filteredData = data;
        if (filterType === 'suspension') {
            filteredData = data.filter(h => h.is_suspended === true);
        } else if (filterType === 'holiday') {
            filteredData = data.filter(h => h.is_suspended === false);
        }

        if (!filteredData || filteredData.length === 0) {
            list.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-gray-400 italic">No holidays found. Click "Add Holiday" to create one.</td></tr>';
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        const currentMonth = new Date().toISOString().slice(0, 7);

        list.innerHTML = filteredData.map(holiday => {
            const isPast = holiday.holiday_date < today;
            const isSuspension = holiday.is_suspended === true;
            const isUpcoming = holiday.holiday_date >= today;
            const isThisMonth = holiday.holiday_date.startsWith(currentMonth);

            return `
                <tr class="hover:bg-violet-50/50 transition-colors ${isPast ? 'opacity-60' : ''}">
                    <td class="px-6 py-5">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 ${isSuspension ? 'bg-red-100' : 'bg-violet-100'} rounded-xl flex items-center justify-center">
                                <i data-lucide="${isSuspension ? 'ban' : 'cake'}" class="w-5 h-5 ${isSuspension ? 'text-red-600' : 'text-violet-600'}"></i>
                            </div>
                            <div>
                                <p class="font-black text-gray-800">${formatDate(holiday.holiday_date)}</p>
                                <p class="text-xs text-gray-400">${getDayName(holiday.holiday_date)}</p>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-5">
                        <p class="font-bold text-gray-800">${holiday.description || 'No description'}</p>
                    </td>
                    <td class="px-6 py-5">
                        <span class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider ${isSuspension 
                            ? 'bg-red-100 text-red-700' 
                            : 'bg-emerald-100 text-emerald-700'}">
                            ${isSuspension ? 'Suspension' : 'Holiday'}
                        </span>
                    </td>
                    <td class="px-6 py-5">
                        <span class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-gray-100 text-gray-600">
                            ${holiday.target_grades || 'All'}
                        </span>
                    </td>
                    <td class="px-6 py-5 text-right">
                        <div class="flex items-center justify-end gap-2">
                            <button onclick="editHoliday('${holiday.holiday_date}')" class="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-all">
                                <i data-lucide="pencil" class="w-4 h-4"></i>
                            </button>
                            <button onclick="deleteHoliday('${holiday.holiday_date}')" class="p-2.5 bg-red-100 text-red-600 rounded-xl hover:bg-red-200 transition-all">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        lucide.createIcons();

    } catch (err) {
        console.error("Error loading holidays:", err);
        list.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-red-500">Error loading holidays.</td></tr>';
    }
}

// 4. Load Statistics
async function loadStats() {
    try {
        const { data, error } = await supabase.from('holidays').select('*');
        if (error) throw error;

        const today = new Date().toISOString().split('T')[0];
        const currentMonth = new Date().toISOString().slice(0, 7);

        const totalHolidays = data?.length || 0;
        const suspensionDays = data?.filter(h => h.is_suspended === true).length || 0;
        const thisMonth = data?.filter(h => h.holiday_date.startsWith(currentMonth)).length || 0;
        const upcoming = data?.filter(h => h.holiday_date >= today).length || 0;

        document.getElementById('stat-total-holidays').innerText = totalHolidays;
        document.getElementById('stat-suspension-days').innerText = suspensionDays;
        document.getElementById('stat-this-month').innerText = thisMonth;
        document.getElementById('stat-upcoming').innerText = upcoming;

    } catch (err) {
        console.error("Error loading stats:", err);
    }
}

// 5. Open Modal for Adding/Editing
function openHolidayModal(editDate = null) {
    const modal = document.getElementById('holiday-modal');
    const title = document.getElementById('modal-title');
    const dateInput = document.getElementById('holiday-date');
    const descInput = document.getElementById('holiday-description');
    const typeRadios = document.getElementsByName('holiday-type');
    const targetSelect = document.getElementById('holiday-target-grades');
    const editDateInput = document.getElementById('edit-holiday-date');

    // Reset form
    dateInput.value = '';
    descInput.value = '';
    targetSelect.value = 'All';
    typeRadios[0].checked = true; // Default to suspension
    editDateInput.value = '';

    if (editDate) {
        // Edit mode - load existing data
        title.innerText = 'Edit Holiday';
        loadHolidayForEdit(editDate);
    } else {
        // Add mode
        title.innerText = 'Add Holiday';
        dateInput.value = getTodayDate();
    }

    modal.classList.remove('hidden');
    lucide.createIcons();
}

function closeHolidayModal() {
    document.getElementById('holiday-modal').classList.add('hidden');
}

// 6. Load Holiday for Editing
async function loadHolidayForEdit(date) {
    try {
        const { data, error } = await supabase
            .from('holidays')
            .select('*')
            .eq('holiday_date', date)
            .single();

        if (error) throw error;

        if (data) {
            document.getElementById('edit-holiday-date').value = data.holiday_date;
            document.getElementById('holiday-date').value = data.holiday_date;
            document.getElementById('holiday-description').value = data.description || '';
            document.getElementById('holiday-target-grades').value = data.target_grades || 'All';
            
            // Set radio button
            const typeRadios = document.getElementsByName('holiday-type');
            if (data.is_suspended === true) {
                typeRadios[0].checked = true;
            } else {
                typeRadios[1].checked = true;
            }
        }
    } catch (err) {
        console.error("Error loading holiday:", err);
        showNotification("Error loading holiday data", "error");
    }
}

// 7. Save Holiday (Add or Update)
async function saveHoliday() {
    const editDate = document.getElementById('edit-holiday-date').value;
    const holidayDate = document.getElementById('holiday-date').value;
    const description = document.getElementById('holiday-description').value;
    const typeRadios = document.getElementsByName('holiday-type');
    const isSuspended = typeRadios[0].checked ? true : false;
    const targetGrades = document.getElementById('holiday-target-grades').value;

    // Validation
    if (!holidayDate) {
        showNotification("Please select a date", "error");
        return;
    }
    if (!description.trim()) {
        showNotification("Please enter a description", "error");
        return;
    }

    const payload = {
        holiday_date: holidayDate,
        description: description.trim(),
        is_suspended: isSuspended,
        target_grades: targetGrades
    };

    try {
        const { error } = await supabase
            .from('holidays')
            .upsert(payload, { onConflict: 'holiday_date' });

        if (error) throw error;

        showNotification(editDate ? "Holiday updated successfully!" : "Holiday added successfully!", "success");
        closeHolidayModal();
        loadHolidays();
        loadStats();

    } catch (err) {
        console.error("Error saving holiday:", err);
        showNotification("Error saving holiday: " + err.message, "error");
    }
}

// 8. Edit Holiday
function editHoliday(date) {
    openHolidayModal(date);
}

// 9. Delete Holiday
function deleteHoliday(date) {
    deleteTargetDate = date;
    document.getElementById('delete-modal').classList.remove('hidden');
}

async function confirmDelete() {
    if (!deleteTargetDate) return;

    try {
        const { error } = await supabase
            .from('holidays')
            .delete()
            .eq('holiday_date', deleteTargetDate);

        if (error) throw error;

        showNotification("Holiday deleted successfully!", "success");
        document.getElementById('delete-modal').classList.add('hidden');
        loadHolidays();
        loadStats();

    } catch (err) {
        console.error("Error deleting holiday:", err);
        showNotification("Error deleting holiday: " + err.message, "error");
    }

    deleteTargetDate = null;
}

// Helper Functions
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
    });
}

function getDayName(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'long' });
}

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

// Debounce function for search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Notification helper (reuse from admin-settings.js)
function showNotification(msg, type = 'info') {
    const existing = document.getElementById('notification-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'notification-modal';
    modal.className = 'fixed inset-0 bg-black/50 z-[60] flex items-center justify-center animate-fade-in';

    const iconColor = type === 'success' ? 'text-emerald-500' : type === 'error' ? 'text-red-500' : 'text-violet-600';
    const bgColor = type === 'success' ? 'bg-emerald-50' : type === 'error' ? 'bg-red-50' : 'bg-violet-50';
    const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info';
    const title = type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Information';

    // Play sound
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
    } catch (e) { }

    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 transform transition-all animate-fade-in-up">
            <div class="flex flex-col items-center text-center">
                <div class="w-16 h-16 ${bgColor} ${iconColor} rounded-full flex items-center justify-center mb-4">
                    <i data-lucide="${iconName}" class="w-8 h-8"></i>
                </div>
                <h3 class="text-xl font-black text-gray-800 mb-2">${title}</h3>
                <p class="text-sm text-gray-500 font-medium mb-6">${msg}</p>
                <button id="notif-btn" class="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-gray-800 transition-all">Okay, Got it</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    document.getElementById('notif-btn').onclick = () => modal.remove();
    if (window.lucide) lucide.createIcons();
}
