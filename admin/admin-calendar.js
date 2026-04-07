// admin/admin-calendar.js
// School Calendar - Holidays & Suspensions (Fully Functional)

let currentNavDate = new Date();
let flatHolidaysData = [];

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkSession === 'function' && !checkSession('admins')) return;
    
    setupModalClose('holiday-modal');
    setupModalClose('delete-modal');
    
    await loadHolidays();
    loadStats();
    setupEventListeners();
    
    // Real‑time subscription
    supabase.channel('calendar-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'holidays' }, () => {
            loadHolidays();
            loadStats();
        })
        .subscribe();
});

// Modal close handlers
function setupModalClose(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const closeButtons = modal.querySelectorAll('.modal-close, .close-btn, .modal-close-btn');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            modal.classList.add('hidden');
        });
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });
}

function setupEventListeners() {
    const searchInput = document.getElementById('search-holidays');
    if (searchInput) searchInput.addEventListener('input', debounce(loadHolidays, 300));
    
    // Hide time coverage for regular holidays
    const radioHoliday = document.querySelector('input[name="holiday-type"][value="false"]');
    const radioSuspension = document.querySelector('input[name="holiday-type"][value="true"]');
    const timeCoverageDiv = document.getElementById('time-coverage-container');
    if (radioHoliday && radioSuspension && timeCoverageDiv) {
        const toggle = () => {
            timeCoverageDiv.style.display = radioSuspension.checked ? 'block' : 'none';
        };
        radioHoliday.addEventListener('change', toggle);
        radioSuspension.addEventListener('change', toggle);
        toggle();
    }
}

// Load holidays from DB
async function loadHolidays() {
    const list = document.getElementById('holidays-list');
    if (!list) return;
    list.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-gray-400 italic">Loading holidays...</td></tr>';

    try {
        const searchQuery = document.getElementById('search-holidays')?.value || '';
        const filterType = document.getElementById('filter-type')?.value || 'all';
        let query = supabase.from('holidays').select('*').order('holiday_date', { ascending: true });
        if (searchQuery) query = query.ilike('description', `%${searchQuery}%`);
        const { data, error } = await query;
        if (error) throw error;

        flatHolidaysData = data;
        renderVisualCalendar();

        let filteredData = data;
        if (filterType === 'suspension') filteredData = data.filter(h => h.is_suspended === true);
        else if (filterType === 'holiday') filteredData = data.filter(h => h.is_suspended === false);

        if (!filteredData.length) {
            list.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-gray-400 italic">No holidays found. Click "Add Holiday" to create one.</td></tr>';
            return;
        }

        // Group consecutive days with same description & suspension type
        const grouped = [];
        for (let i = 0; i < filteredData.length; i++) {
            const current = filteredData[i];
            if (grouped.length === 0) {
                grouped.push({ ...current, start_date: current.holiday_date, end_date: current.holiday_date, duration: 1 });
                continue;
            }
            const last = grouped[grouped.length - 1];
            const lastDate = new Date(last.end_date);
            const currDate = new Date(current.holiday_date);
            const diffDays = (currDate - lastDate) / (1000 * 60 * 60 * 24);
            if (diffDays === 1 && last.description === current.description && last.is_suspended === current.is_suspended) {
                last.end_date = current.holiday_date;
                last.duration++;
            } else {
                grouped.push({ ...current, start_date: current.holiday_date, end_date: current.holiday_date, duration: 1 });
            }
        }

        const today = new Date().toISOString().split('T')[0];
        list.innerHTML = grouped.map(group => {
            const isPast = group.end_date < today;
            const isSuspension = group.is_suspended === true;
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
                    <td class="px-6 py-5"><p class="font-bold text-gray-800">${escapeHtml(group.description) || 'No description'}</p></td>
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
                            <button onclick='editHolidayGroup("${escapeHtml(group.description)}", "${group.start_date}", "${group.end_date}")' class="p-2.5 bg-violet-50 text-violet-500 rounded-xl hover:bg-violet-100 hover:text-violet-600 transition-all" title="Edit Event">
                                <i data-lucide="edit-2" class="w-4 h-4"></i>
                            </button>
                            <button onclick="deleteHolidayGroup('${escapeHtml(group.description)}')" class="p-2.5 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 hover:text-red-600 transition-all" title="Delete Event">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        lucide.createIcons();
    } catch (err) {
        console.error(err);
        list.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-red-500">Error loading holidays.</td></tr>';
    }
}

// Stats cards
async function loadStats() {
    try {
        const { data, error } = await supabase.from('holidays').select('*');
        if (error) throw error;
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = new Date().toISOString().slice(0, 7);
        const total = data?.length || 0;
        const suspensions = data?.filter(h => h.is_suspended === true).length || 0;
        const thisMonth = data?.filter(h => h.holiday_date.startsWith(currentMonth)).length || 0;
        const upcoming = data?.filter(h => h.holiday_date >= today).length || 0;
        document.getElementById('stat-total-holidays').innerText = total;
        document.getElementById('stat-suspension-days').innerText = suspensions;
        document.getElementById('stat-this-month').innerText = thisMonth;
        document.getElementById('stat-upcoming').innerText = upcoming;
    } catch (err) { console.error(err); }
}

// Visual calendar navigation
function changeMonth(offset) {
    if (offset === 0) currentNavDate = new Date();
    else currentNavDate.setMonth(currentNavDate.getMonth() + offset);
    renderVisualCalendar();
}

// Render visual calendar grid with multi‑day event bars
function renderVisualCalendar() {
    const year = currentNavDate.getFullYear();
    const month = currentNavDate.getMonth();
    document.getElementById('calendar-month-year').textContent = currentNavDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    
    // Build array of dates in this month
    const dates = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const cellDate = new Date(year, month, d);
        const dateStr = new Date(cellDate.getTime() - (cellDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        dates.push({ day: d, dateStr, cellDate });
    }
    
    // Map events
    const eventMap = new Map();
    flatHolidaysData.forEach(h => { eventMap.set(h.holiday_date, h); });
    
    // Find consecutive runs
    const spans = [];
    let currentSpan = null;
    for (let i = 0; i < dates.length; i++) {
        const { dateStr, day } = dates[i];
        const ev = eventMap.get(dateStr);
        if (ev) {
            if (!currentSpan) {
                currentSpan = { startIdx: i, endIdx: i, event: ev, days: [day] };
            } else {
                const prevDate = new Date(dates[i-1].dateStr);
                const currDate = new Date(dateStr);
                const diff = (currDate - prevDate) / (1000*60*60*24);
                if (diff === 1 && currentSpan.event.description === ev.description && currentSpan.event.is_suspended === ev.is_suspended) {
                    currentSpan.endIdx = i;
                    currentSpan.days.push(day);
                } else {
                    spans.push(currentSpan);
                    currentSpan = { startIdx: i, endIdx: i, event: ev, days: [day] };
                }
            }
        } else {
            if (currentSpan) {
                spans.push(currentSpan);
                currentSpan = null;
            }
        }
    }
    if (currentSpan) spans.push(currentSpan);
    
    // Create empty cells for previous month days
    for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += `<div class="bg-gray-50/50 p-2"></div>`;
    }
    
    const todayStr = new Date().toISOString().split('T')[0];
    // We'll render each cell, but for multi‑day spans we'll draw a single bar that spans across cells
    // using an absolutely positioned element? Simpler: keep per‑day markers but show duration text.
    // For a cleaner look, we show a combined bar only on the first day of a span.
    for (let i = 0; i < dates.length; i++) {
        const { day, dateStr, cellDate } = dates[i];
        const isToday = dateStr === todayStr;
        const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
        const ev = eventMap.get(dateStr);
        
        let eventHtml = '';
        const span = spans.find(s => i >= s.startIdx && i <= s.endIdx);
        if (span && i === span.startIdx) {
            // Multi‑day span – show a single bar with duration
            const isSusp = span.event.is_suspended;
            const barColor = isSusp ? 'bg-red-500' : 'bg-emerald-500';
            const label = span.event.time_coverage !== 'Full Day' ? `${span.event.description} (${span.event.time_coverage})` : span.event.description;
            const duration = span.days.length > 1 ? ` (${span.days.length}d)` : '';
            eventHtml = `
                <div class="mt-1 w-full overflow-hidden rounded shadow-sm">
                    <div class="flex ${barColor} h-6 rounded-md items-center px-1 text-[9px] font-bold text-white truncate" title="${label}">
                        ${label}${duration}
                    </div>
                </div>
            `;
        } else if (ev && (!span || i !== span.startIdx)) {
            // Single day or subsequent days of a span (optional: hide to avoid duplication)
            // We'll show a small indicator for non‑first days to keep consistency.
            const isSusp = ev.is_suspended;
            const barColor = isSusp ? 'bg-red-500' : 'bg-emerald-500';
            const lightColor = isSusp ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700';
            const label = ev.time_coverage !== 'Full Day' ? `${ev.description} (${ev.time_coverage})` : ev.description;
            eventHtml = `
                <div class="mt-1 w-full flex overflow-hidden rounded shadow-sm">
                    <div class="w-1 ${barColor} shrink-0"></div>
                    <div class="${lightColor} text-[9px] font-bold p-1 truncate w-full text-left" title="${label}">${label}</div>
                </div>
            `;
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

// Open modal for adding/editing
function openHolidayModal(editDate = null, clickedDate = null) {
    const modal = document.getElementById('holiday-modal');
    const title = document.getElementById('modal-title');
    document.getElementById('holiday-start-date').value = '';
    document.getElementById('holiday-end-date').value = '';
    document.getElementById('holiday-description').value = '';
    document.getElementById('holiday-target-grades').value = 'All Levels';
    document.getElementById('holiday-coverage').value = 'Full Day';
    document.getElementsByName('holiday-type')[0].checked = true;
    document.getElementById('edit-holiday-range').value = '';
    if (editDate) {
        title.innerText = 'Edit Holiday';
        loadHolidayForEdit(editDate);
    } else {
        title.innerText = 'Add Holiday';
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

// Load single day data for editing (when clicking a date cell)
async function loadHolidayForEdit(date) {
    try {
        const { data, error } = await supabase.from('holidays').select('*').eq('holiday_date', date).single();
        if (error) throw error;
        if (data) {
            document.getElementById('edit-holiday-range').value = date;
            document.getElementById('holiday-start-date').value = data.holiday_date;
            document.getElementById('holiday-end-date').value = data.holiday_date;
            document.getElementById('holiday-description').value = data.description || '';
            document.getElementById('holiday-target-grades').value = data.target_grades || 'All Levels';
            document.getElementById('holiday-coverage').value = data.time_coverage || 'Full Day';
            document.getElementsByName('holiday-type')[data.is_suspended ? 0 : 1].checked = true;
        }
    } catch (err) {
        showNotification("Error loading holiday", "error");
    }
}

// Edit an entire grouped range
function editHolidayGroup(description, startDate, endDate) {
    const modal = document.getElementById('holiday-modal');
    document.getElementById('modal-title').innerText = 'Edit Holiday Range';
    document.getElementById('edit-holiday-range').value = `${description}|${startDate}|${endDate}`;
    document.getElementById('holiday-start-date').value = startDate;
    document.getElementById('holiday-end-date').value = endDate;
    // Load first day to populate fields
    supabase.from('holidays').select('*').eq('holiday_date', startDate).single()
        .then(({ data, error }) => {
            if (error) throw error;
            document.getElementById('holiday-description').value = data.description;
            document.getElementById('holiday-target-grades').value = data.target_grades || 'All Levels';
            document.getElementById('holiday-coverage').value = data.time_coverage || 'Full Day';
            document.getElementsByName('holiday-type')[data.is_suspended ? 0 : 1].checked = true;
        })
        .catch(err => showNotification("Error loading range data", "error"));
    modal.classList.remove('hidden');
    lucide.createIcons();
}

let pendingAnnouncement = null;

// Save holiday (multi‑day support, edit range support)
async function saveHoliday(event) {
    if (event) event.preventDefault();
    const btn = document.getElementById('save-holiday-btn');
    const origText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i> Processing...';
        btn.disabled = true;
    }
    
    const editRange = document.getElementById('edit-holiday-range').value;
    const startDate = document.getElementById('holiday-start-date').value;
    const endDate = document.getElementById('holiday-end-date').value;
    const description = document.getElementById('holiday-description').value.trim();
    const isSuspended = document.getElementsByName('holiday-type')[0].checked;
    const targetGrades = document.getElementById('holiday-target-grades').value;
    const timeCoverage = document.getElementById('holiday-coverage').value;
    
    if (!startDate || !endDate) {
        showNotification("Please select start and end dates", "error");
        if (btn) resetButton(btn, origText);
        return;
    }
    if (new Date(startDate) > new Date(endDate)) {
        showNotification("Start date cannot be after end date", "error");
        if (btn) resetButton(btn, origText);
        return;
    }
    if (!description) {
        showNotification("Please enter a description", "error");
        if (btn) resetButton(btn, origText);
        return;
    }
    
    // If editing a range, delete old days first
    if (editRange && editRange !== startDate) {
        const [oldDesc, oldStart, oldEnd] = editRange.split('|');
        const { error: delError } = await supabase
            .from('holidays')
            .delete()
            .gte('holiday_date', oldStart)
            .lte('holiday_date', oldEnd)
            .eq('description', oldDesc);
        if (delError) {
            showNotification("Error updating range: " + delError.message, "error");
            if (btn) resetButton(btn, origText);
            return;
        }
    } else if (editRange && editRange === startDate) {
        // Editing a single day – delete that day before upsert
        const { error: delError } = await supabase.from('holidays').delete().eq('holiday_date', startDate);
        if (delError) console.warn(delError);
    }
    
    // Build payload for all days in range
    const payload = [];
    let current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        payload.push({
            holiday_date: dateStr,
            description: description,
            is_suspended: isSuspended,
            target_grades: targetGrades,
            time_coverage: isSuspended ? timeCoverage : 'Full Day'
        });
        current.setDate(current.getDate() + 1);
    }
    
    try {
        const { error } = await supabase.from('holidays').upsert(payload, { onConflict: 'holiday_date' });
        if (error) throw error;
        closeHolidayModal();
        loadHolidays();
        loadStats();
        if (isSuspended && !editRange) {
            pendingAnnouncement = { description, startDate, endDate, targetGrades, timeCoverage };
            document.getElementById('announce-suspension-modal').classList.remove('hidden');
        } else {
            showNotification(editRange ? "Holiday range updated!" : "Dates saved successfully!", "success");
        }
    } catch (err) {
        showNotification(err.message || "Error saving holiday", "error");
    } finally {
        if (btn) resetButton(btn, origText);
    }
}

function resetButton(btn, origText) {
    btn.innerHTML = origText;
    btn.disabled = false;
    if (window.lucide) lucide.createIcons();
}

function closeAnnounceModal() {
    pendingAnnouncement = null;
    document.getElementById('announce-suspension-modal').classList.add('hidden');
    showNotification("Suspension saved.", "info");
}

async function confirmAndAnnounceSuspension() {
    if (!pendingAnnouncement) return;
    const btn = document.getElementById('confirm-announce-btn');
    btn.disabled = true;
    btn.innerText = "Broadcasting...";
    const adminId = checkSession('admins')?.id || null;
    const sDate = new Date(pendingAnnouncement.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const eDate = new Date(pendingAnnouncement.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dateStr = pendingAnnouncement.startDate === pendingAnnouncement.endDate ? sDate : `${sDate} to ${eDate}`;
    const title = `CLASS SUSPENSION: ${pendingAnnouncement.description}`;
    const content = `Classes suspended on ${dateStr}. Coverage: ${pendingAnnouncement.timeCoverage}. Grades: ${pendingAnnouncement.targetGrades}.`;
    try {
        const { error } = await supabase.from('announcements').insert([{
            title, content, posted_by_admin_id: adminId, priority: 'High', type: 'General',
            target_parents: true, target_students: true, target_teachers: true, target_guards: true, target_clinic: true
        }]);
        if (error) throw error;
        document.getElementById('announce-suspension-modal').classList.add('hidden');
        showNotification("Suspension & announcement broadcasted!", "success");
    } catch (err) {
        showNotification("Error: " + err.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerText = "Yes, Announce";
        pendingAnnouncement = null;
    }
}

async function deleteHolidayGroup(description) {
    showConfirmationModal("Delete Holiday Range?", `Delete all days with description "${description}"?`, async () => {
        try {
            const { error } = await supabase.from('holidays').delete().eq('description', description);
            if (error) throw error;
            showNotification("Holiday range deleted.", "success");
            loadHolidays();
            loadStats();
        } catch (err) {
            showNotification("Error: " + err.message, "error");
        }
    });
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Global exports
window.openHolidayModal = openHolidayModal;
window.closeHolidayModal = closeHolidayModal;
window.saveHoliday = saveHoliday;
window.loadHolidays = loadHolidays;
window.deleteHolidayGroup = deleteHolidayGroup;
window.editHolidayGroup = editHolidayGroup;
window.closeAnnounceModal = closeAnnounceModal;
window.confirmAndAnnounceSuspension = confirmAndAnnounceSuspension;
window.changeMonth = changeMonth;