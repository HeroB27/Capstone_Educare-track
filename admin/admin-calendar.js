// admin/admin-calendar.js
// Manages School Calendar - Holidays and Suspension Days

// Visual Calendar Global Variables
let currentNavDate = new Date();
let flatHolidaysData = []; // Store raw db rows here

// 1. Initialize Page
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkSession === 'function') {
        if (!checkSession('admins')) return;
    }
    
    // Setup modal close handlers
    setupModalClose('holiday-modal');
    setupModalClose('delete-modal');
    
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

// Modal Utility Function - Sets up close handlers (X button + background click)
// Finds close buttons by class: 'modal-close', 'close-btn', 'modal-close-btn'
function setupModalClose(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    // Find close buttons by class
    const closeButtons = modal.querySelectorAll('.modal-close, .close-btn, .modal-close-btn');
    
    // Add click handler to close buttons
    closeButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            modal.classList.add('hidden');
        });
    });
    
    // Add background click handler to close modal when clicking directly on backdrop
    modal.addEventListener('click', (e) => {
        // Only close if clicking on the modal backdrop itself (not on children)
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
}

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

        // Store raw data for visual calendar and render it
        flatHolidaysData = data;
        renderVisualCalendar();

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

        // GROUPING ALGORITHM - Groups contiguous days with same description
        const groupedHolidays = [];
        filteredData.forEach(row => {
            const existingGroup = groupedHolidays.find(g => g.description === row.description && g.is_suspended === row.is_suspended);
            if (existingGroup) {
                existingGroup.end_date = row.holiday_date;
                existingGroup.duration += 1;
            } else {
                groupedHolidays.push({
                    ...row,
                    start_date: row.holiday_date,
                    end_date: row.holiday_date,
                    duration: 1
                });
            }
        });

        const today = new Date().toISOString().split('T')[0];

        list.innerHTML = groupedHolidays.map(group => {
            const isPast = group.end_date < today;
            const isSuspension = group.is_suspended === true;
            
            // Format date display
            const sDate = new Date(group.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const eDate = new Date(group.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const dateDisplay = group.duration > 1 ? `${sDate} - ${eDate}` : sDate;

            return `
                <tr class="hover:bg-violet-50/50 transition-colors ${isPast ? 'opacity-60' : ''}">
                    <td class="px-6 py-5">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 ${isSuspension ? 'bg-red-100' : 'bg-violet-100'} rounded-xl flex items-center justify-center">
                                <i data-lucide="${isSuspension ? 'ban' : 'cake'}" class="w-5 h-5 ${isSuspension ? 'text-red-600' : 'text-violet-600'}"></i>
                            </div>
                            <div>
                                <p class="font-black text-gray-800">${dateDisplay}</p>
                                <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">${group.duration > 1 ? group.duration + ' Days' : '1 Day'}</p>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-5">
                        <p class="font-bold text-gray-800">${group.description || 'No description'}</p>
                    </td>
                    <td class="px-6 py-5">
                        <div class="flex flex-col gap-1 items-start">
                            <span class="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${isSuspension ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}">
                                ${isSuspension ? 'Suspension' : 'Holiday'}
                            </span>
                            ${(isSuspension && group.time_coverage && group.time_coverage !== 'Full Day') 
                                ? `<span class="px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider bg-orange-100 text-orange-700">${group.time_coverage}</span>` : ''}
                        </div>
                    </td>
                    <td class="px-6 py-5">
                        <span class="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-gray-100 text-gray-600">
                            ${group.target_grades || 'All Levels'}
                        </span>
                    </td>
                    <td class="px-6 py-5 text-right">
                        <div class="flex items-center justify-end gap-2">
                            <button onclick="editCalendarEvent('${group.id}', '${group.start_date}')" class="p-2.5 bg-violet-50 text-violet-500 rounded-xl hover:bg-violet-100 hover:text-violet-600 transition-all" title="Edit Event">
                                <i data-lucide="edit-2" class="w-4 h-4"></i>
                            </button>
                            <button onclick="deleteHolidayGroup('${group.description}')" class="p-2.5 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 hover:text-red-600 transition-all" title="Delete Event">
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
        // Check for network errors
        const errorMessage = err.message || '';
        if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('timeout') || err.name === 'TypeError') {
            list.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-yellow-600">Network error. Please check your internet connection and try again.</td></tr>';
        } else {
            list.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-red-500">Error loading holidays.</td></tr>';
        }
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

// VISUAL CALENDAR FUNCTIONS
// Change month navigation
function changeMonth(offset) {
    if (offset === 0) currentNavDate = new Date();
    else currentNavDate.setMonth(currentNavDate.getMonth() + offset);
    renderVisualCalendar();
}

// Render the visual calendar grid
function renderVisualCalendar() {
    const year = currentNavDate.getFullYear();
    const month = currentNavDate.getMonth();
    
    document.getElementById('calendar-month-year').textContent = currentNavDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    
    // Blank previous month cells
    for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += `<div class="bg-gray-50/50 p-2"></div>`;
    }
    
    const todayStr = new Date().toISOString().split('T')[0];
    
    for (let day = 1; day <= daysInMonth; day++) {
        const cellDate = new Date(year, month, day);
        // Adjust for local timezone offset string
        const dateStr = new Date(cellDate.getTime() - (cellDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        
        const isToday = dateStr === todayStr;
        const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
        
        // Check if this day has an event
        const eventInfo = flatHolidaysData.find(h => h.holiday_date === dateStr);
        let eventHtml = '';
        
        if (eventInfo) {
            const isSuspension = eventInfo.is_suspended;
            const barColor = isSuspension ? 'bg-red-500' : 'bg-emerald-500';
            const lightColor = isSuspension ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700';
            const label = eventInfo.time_coverage !== 'Full Day' ? `${eventInfo.description} (${eventInfo.time_coverage})` : eventInfo.description;
            
            eventHtml = `
                <div class="mt-1 w-full flex overflow-hidden rounded shadow-sm">
                    <div class="w-1 ${barColor} shrink-0"></div>
                    <div class="${lightColor} text-[9px] font-bold p-1 truncate w-full text-left" title="${label}">${label}</div>
                </div>`;
        }

        grid.innerHTML += `
            <div onclick="openHolidayModal(null, '${dateStr}')" class="bg-white p-2 border border-transparent hover:border-violet-300 hover:shadow-md cursor-pointer transition-all flex flex-col group relative ${isWeekend ? 'bg-gray-50' : ''}">
                <div class="flex justify-between items-start">
                    <span class="text-sm font-bold ${isToday ? 'bg-violet-600 text-white w-6 h-6 rounded-full flex items-center justify-center' : 'text-gray-700'}">${day}</span>
                    <i data-lucide="plus" class="w-3 h-3 text-violet-300 opacity-0 group-hover:opacity-100 transition-opacity mt-1"></i>
                </div>
                <div class="flex-1 mt-1 flex flex-col gap-1 overflow-y-auto custom-scrollbar">
                    ${eventHtml}
                </div>
            </div>`;
    }
    lucide.createIcons();
}

// 5. Open Modal for Adding/Editing
function openHolidayModal(editDate = null, clickedDate = null) {
    const modal = document.getElementById('holiday-modal');
    const title = document.getElementById('modal-title');
    document.getElementById('holiday-start-date').value = '';
    document.getElementById('holiday-end-date').value = '';
    document.getElementById('holiday-description').value = '';
    document.getElementById('holiday-target-grades').value = 'All Levels';
    document.getElementById('holiday-coverage').value = 'Full Day';
    document.getElementsByName('holiday-type')[0].checked = true;
    document.getElementById('edit-holiday-date').value = '';

    if (editDate) {
        title.innerText = 'Edit Holiday';
        loadHolidayForEdit(editDate);
    } else {
        title.innerText = 'Add Holiday';
        // If they clicked a specific date on the calendar grid, use it. Otherwise use today.
        const defaultDate = clickedDate ? clickedDate : getTodayDate();
        document.getElementById('holiday-start-date').value = defaultDate;
        document.getElementById('holiday-end-date').value = defaultDate;
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
            document.getElementById('holiday-start-date').value = data.holiday_date;
            document.getElementById('holiday-end-date').value = data.holiday_date;
            document.getElementById('holiday-description').value = data.description || '';
            document.getElementById('holiday-target-grades').value = data.target_grades || 'All Levels';
            document.getElementById('holiday-coverage').value = data.time_coverage || 'Full Day';
            document.getElementsByName('holiday-type')[data.is_suspended ? 0 : 1].checked = true;
        }
    } catch (err) {
        console.error("Error loading holiday:", err);
        showNotification("Error loading holiday data", "error");
    }
}

// 7. Save Holiday (Add or Update) - With Multi-Day Support
// UPDATED: Added button locking pattern
let pendingAnnouncement = null;

async function saveHoliday(event) {
    if (event) event.preventDefault();
    
    const btn = document.getElementById('save-holiday-btn');
    const origText = btn ? btn.innerHTML : '';
    
    // 1. Lock UI
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i> Processing...';
        btn.disabled = true;
    }
    
    const editDate = document.getElementById('edit-holiday-date').value;
    const startDate = document.getElementById('holiday-start-date').value;
    const endDate = document.getElementById('holiday-end-date').value;
    const description = document.getElementById('holiday-description').value;
    const isSuspended = document.getElementsByName('holiday-type')[0].checked;
    const targetGrades = document.getElementById('holiday-target-grades').value;
    const timeCoverage = document.getElementById('holiday-coverage').value;

    if (!startDate || !endDate) {
        showNotification("Please select start and end dates", "error");
        if (btn) { btn.innerHTML = origText; btn.disabled = false; }
        return;
    }
    if (new Date(startDate) > new Date(endDate)) {
        showNotification("Start date cannot be after end date", "error");
        if (btn) { btn.innerHTML = origText; btn.disabled = false; }
        return;
    }
    if (!description.trim()) {
        showNotification("Please enter a description", "error");
        if (btn) { btn.innerHTML = origText; btn.disabled = false; }
        return;
    }

    const payloadArray = [];
    let currentDate = new Date(startDate);
    const finalDate = new Date(endDate);

    while (currentDate <= finalDate) {
        payloadArray.push({
            holiday_date: currentDate.toISOString().split('T')[0],
            description: description.trim(),
            is_suspended: isSuspended,
            target_grades: targetGrades,
            time_coverage: isSuspended ? timeCoverage : 'Full Day'
        });
        currentDate.setDate(currentDate.getDate() + 1);
    }

    try {
        const { error } = await supabase.from('holidays').upsert(payloadArray, { onConflict: 'holiday_date' });
        if (error) throw error;
        
        closeHolidayModal();
        loadHolidays();
        loadStats();

        // NEW: If it's a suspension, ask if they want to announce it
        if (isSuspended && !editDate) {
            pendingAnnouncement = { description, startDate, endDate, targetGrades, timeCoverage };
            document.getElementById('announce-suspension-modal').classList.remove('hidden');
        } else {
            showNotification(editDate ? "Holiday updated successfully!" : "Dates registered successfully!", "success");
        }
    } catch (err) {
        console.error(err);
        // 3. Catch & Notify Error
        showNotification(err.message || "Error saving holiday. Please try again.", "error");
    } finally {
        // 4. Unlock UI
        if (btn) {
            btn.innerHTML = origText;
            btn.disabled = false;
            if (window.lucide) lucide.createIcons();
        }
    }
}

// 8. Announcer Functions for Suspension Modal
function closeAnnounceModal() {
    pendingAnnouncement = null;
    document.getElementById('announce-suspension-modal').classList.add('hidden');
    showNotification("Suspension saved into Calendar.", "info");
}

async function confirmAndAnnounceSuspension() {
    if (!pendingAnnouncement) return;
    const btn = document.getElementById('confirm-announce-btn');
    btn.disabled = true; btn.innerText = "Broadcasting...";

    const adminId = checkSession('admins')?.id || null;
    const sDate = new Date(pendingAnnouncement.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const eDate = new Date(pendingAnnouncement.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dateStr = pendingAnnouncement.startDate === pendingAnnouncement.endDate ? sDate : `${sDate} to ${eDate}`;
    
    const title = `CLASS SUSPENSION: ${pendingAnnouncement.description}`;
    const content = `Please be advised that classes are suspended on ${dateStr}. Coverage: ${pendingAnnouncement.timeCoverage}. Affected Grades: ${pendingAnnouncement.targetGrades}.`;

    try {
        const { error } = await supabase.from('announcements').insert([{
            title: title, content: content, posted_by_admin_id: adminId, priority: 'High', type: 'General',
            target_parents: true, target_students: true, target_teachers: true, target_guards: true, target_clinic: true
        }]);
        if (error) throw error;
        
        document.getElementById('announce-suspension-modal').classList.add('hidden');
        showNotification("Suspension saved & Announcement broadcasted!", "success");
    } catch (err) {
        showNotification("Error broadcasting announcement: " + err.message, "error");
    } finally {
        btn.disabled = false; btn.innerText = "Yes, Announce";
        pendingAnnouncement = null;
    }
}

// ATTENDANCE INTERCEPTOR UTILITY (For Guard/Teacher modules to call)
window.checkSuspensionStatus = async function(dateStr) {
    try {
        const { data, error } = await supabase.from('holidays').select('*').eq('holiday_date', dateStr).maybeSingle();
        if (error || !data) return { isSuspended: false, coverage: null, targetGrades: null };
        return { isSuspended: data.is_suspended, coverage: data.time_coverage || 'Full Day', targetGrades: data.target_grades };
    } catch (err) { return { isSuspended: false, coverage: null, targetGrades: null }; }
};

// 8. Edit Holiday
function editHoliday(date) {
    openHolidayModal(date);
}

// 9. Delete Holiday (Single date - deletes entire range with same description)
async function deleteHoliday(date) {
    try {
        // Get the holiday to find its description
        const { data: holiday, error: fetchError } = await supabase
            .from('holidays')
            .select('description')
            .eq('holiday_date', date)  // FIXED: was 'date', should be 'holiday_date'
            .single();
        
        if (fetchError) throw fetchError;
        if (!holiday) {
            showNotification("Holiday not found", "error");
            return;
        }
        
        // Delete all holidays with the same description (the entire range)
        const { error } = await supabase
            .from('holidays')
            .delete()
            .eq('description', holiday.description);
            
        if (error) throw error;
        showNotification("Holiday range deleted successfully!", "success");
        loadHolidays();
        loadStats();
    } catch (err) {
        showNotification("Error deleting: " + err.message, "error");
    }
}

// 9b. Delete Holiday (Grouped - deletes all rows with same description)
let pendingDeleteDesc = null;

function deleteHolidayGroup(description) {
    pendingDeleteDesc = description;
    document.getElementById('delete-modal').classList.remove('hidden');
}

async function confirmDelete() {
    if (!pendingDeleteDesc) return;
    try {
        const { error } = await supabase.from('holidays').delete().eq('description', pendingDeleteDesc);
        if (error) throw error;
        showNotification("Event deleted successfully!", "success");
        loadHolidays();
        loadStats();
    } catch (err) {
        showNotification("Error deleting: " + err.message, "error");
    } finally {
        pendingDeleteDesc = null;
        document.getElementById('delete-modal').classList.add('hidden');
    }
}

// Helper Functions (UPDATED: using general-core.js formatDate)
// formatDate removed - now using window.formatDate from general-core.js
// formatTime removed - now using window.formatTime from general-core.js

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

// showConfirmationModal REMOVED - now using general-core.js showConfirm

// Notification helper (REMOVED - now using general-core.js showNotification)
// UPDATED: Using window.showNotification from general-core.js

// =============================================================================
// CALENDAR EDIT FUNCTIONS - Dynamic Modal Implementation
// =============================================================================

/**
 * Edit Calendar Event - Opens dynamic modal with pre-filled data
 */
async function editCalendarEvent(id, startDate) {
    try {
        // Fetch the exact event from holidays table
        const { data: event, error } = await supabase
            .from('holidays')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;

        // Build Modal UI
        const modalHtml = `
            <div id="editCalendarModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-fade-in">
                <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                    <div class="bg-gradient-to-r from-violet-900 to-indigo-800 px-5 py-4 flex justify-between items-center text-white">
                        <h3 class="font-black text-sm uppercase">Edit Calendar Event</h3>
                        <button onclick="document.getElementById('editCalendarModal').remove()" class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"><i data-lucide="x" class="w-4 h-4"></i></button>
                    </div>
                    <div class="p-5 space-y-4">
                        <input type="hidden" id="edit-cal-id" value="${event.id}">
                        
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Event Title</label>
                            <input type="text" id="edit-cal-desc" value="${event.description || ''}" class="w-full px-3 py-2 bg-gray-50 border-2 border-transparent rounded-xl font-bold text-sm outline-none focus:border-violet-200">
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Date</label>
                                <input type="date" id="edit-cal-date" value="${event.holiday_date || ''}" class="w-full px-3 py-2 bg-gray-50 border-2 border-transparent rounded-xl font-bold text-sm outline-none focus:border-violet-200">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Type</label>
                                <select id="edit-cal-type" class="w-full px-3 py-2 bg-gray-50 border-2 border-transparent rounded-xl font-bold text-sm outline-none focus:border-violet-200">
                                    <option value="false" ${!event.is_suspended ? 'selected' : ''}>Holiday</option>
                                    <option value="true" ${event.is_suspended ? 'selected' : ''}>Suspension</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Target Grades (Optional)</label>
                            <select id="edit-cal-grades" class="w-full px-3 py-2 bg-gray-50 border-2 border-transparent rounded-xl font-bold text-sm outline-none focus:border-violet-200">
                                <option value="All" ${event.target_grades === 'All' || !event.target_grades ? 'selected' : ''}>All Levels</option>
                                <option value="Grade 7" ${event.target_grades === 'Grade 7' ? 'selected' : ''}>Grade 7</option>
                                <option value="Grade 8" ${event.target_grades === 'Grade 8' ? 'selected' : ''}>Grade 8</option>
                                <option value="Grade 9" ${event.target_grades === 'Grade 9' ? 'selected' : ''}>Grade 9</option>
                                <option value="Grade 10" ${event.target_grades === 'Grade 10' ? 'selected' : ''}>Grade 10</option>
                                <option value="Grade 11" ${event.target_grades === 'Grade 11' ? 'selected' : ''}>Grade 11</option>
                                <option value="Grade 12" ${event.target_grades === 'Grade 12' ? 'selected' : ''}>Grade 12</option>
                            </select>
                        </div>
                    </div>
                    <div class="px-5 py-4 bg-gray-50 border-t flex justify-end gap-3">
                        <button onclick="document.getElementById('editCalendarModal').remove()" class="px-4 py-2 text-gray-400 font-bold uppercase text-xs tracking-widest">Cancel</button>
                        <button onclick="saveCalendarEdit()" id="btn-save-cal" class="px-6 py-2 bg-violet-600 text-white rounded-xl font-bold uppercase text-xs tracking-widest shadow-lg">Save Update</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        lucide.createIcons();
    } catch (e) {
        showNotification("Error loading event: " + e.message, "error");
    }
}

/**
 * Save Calendar Edit - Updates event and fires notification
 */
async function saveCalendarEdit() {
    const id = document.getElementById('edit-cal-id').value;
    const description = document.getElementById('edit-cal-desc').value.trim();
    const date = document.getElementById('edit-cal-date').value;
    const isSuspended = document.getElementById('edit-cal-type').value === 'true';
    const targetGrades = document.getElementById('edit-cal-grades').value;

    if (!description || !date) return showNotification("Title and Date are required.", "error");

    const btn = document.getElementById('btn-save-cal');
    btn.disabled = true; btn.innerText = "Saving...";

    try {
        // 1. Update Calendar Record
        const { error: updateErr } = await supabase.from('holidays').update({
            description: description,
            holiday_date: date,
            is_suspended: isSuspended,
            target_grades: targetGrades
        }).eq('id', id);

        if (updateErr) throw updateErr;

        // 2. Fire Automated Notification
        await supabase.from('notifications').insert([{
            title: 'Calendar Updated',
            message: `School admin updated a calendar event: ${description}. Please check the calendar.`,
            recipient_role: 'all',
            type: 'system',
            is_read: false
        }]);

        // 3. Cleanup
        document.getElementById('editCalendarModal').remove();
        showNotification("Event updated and users notified!", "success");
        
        // 4. Reload Calendar
        loadHolidays();

    } catch (e) {
        console.error(e);
        showNotification("Error updating event: " + e.message, "error");
        btn.disabled = false; btn.innerText = "Save Update";
    }
}

// ===== GLOBAL WINDOW ATTACHMENTS FOR HTML ONCLICK HANDLERS =====
window.openHolidayModal = openHolidayModal;
window.closeHolidayModal = closeHolidayModal;
window.saveHoliday = saveHoliday;
window.loadHolidays = loadHolidays;
window.editHoliday = editHoliday;
window.deleteHoliday = deleteHoliday;
window.deleteHolidayGroup = deleteHolidayGroup;
window.confirmDelete = confirmDelete;
window.openDeleteModal = openDeleteModal;
window.closeAnnounceModal = closeAnnounceModal;
window.confirmAndAnnounceSuspension = confirmAndAnnounceSuspension;

// NEW: Calendar Edit Functions
window.editCalendarEvent = editCalendarEvent;
window.saveCalendarEdit = saveCalendarEdit;
