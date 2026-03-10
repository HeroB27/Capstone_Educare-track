// teacher/teacher-calendar.js
// Teacher School Calendar - Read-Only View of Holidays and Suspension Days

// Visual Calendar Global Variables
let currentNavDate = new Date();
let flatHolidaysData = []; // Store raw db rows here

// FIX: Add currentUser reference to prevent ReferenceError
var currentUser = typeof checkSession !== 'undefined' ? checkSession('teachers') : null;

// 1. Initialize Page
document.addEventListener('DOMContentLoaded', async () => {
    // Redirect if not logged in
    if (!currentUser) {
        window.location.href = '../index.html';
        return;
    }
    
    await loadHolidays();
    loadStats();
    setupEventListeners();
    
    // Real-time subscription for holidays
    supabase.channel('calendar-realtime-teacher')
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

// Debounce utility function
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

// 3. Load All Holidays from Database (Read-Only)
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
            list.innerHTML = '<tr><td colspan="5" class="px-6 py-12 text-center text-gray-400 italic">No holidays found.</td></tr>';
            return;
        }

        // GROUPING ALGORITHM - Groups ONLY consecutive days with the same description
        const groupedHolidays = [];
        filteredData.forEach(row => {
            const existingGroup = groupedHolidays.find(g => {
                // Must have same description and type
                if (g.description !== row.description || g.is_suspended !== row.is_suspended) return false;
                
                // Must be EXACTLY consecutive dates
                const lastDate = new Date(g.end_date);
                const currDate = new Date(row.holiday_date);
                const diffTime = currDate.getTime() - lastDate.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                return diffDays === 1; 
            });

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

        // Read-only table - no edit/delete buttons
        list.innerHTML = groupedHolidays.map(group => {
            const isPast = group.end_date < today;
            const isSuspension = group.is_suspended === true;
            
            // Format date display
            const sDate = new Date(group.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const eDate = new Date(group.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const dateDisplay = group.duration > 1 ? `${sDate} - ${eDate}` : sDate;

            return `
                <tr class="hover:bg-blue-50/50 transition-colors ${isPast ? 'opacity-60' : ''}">
                    <td class="px-6 py-5">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 ${isSuspension ? 'bg-red-100' : 'bg-blue-100'} rounded-xl flex items-center justify-center">
                                <i data-lucide="${isSuspension ? 'ban' : 'cake'}" class="w-5 h-5 ${isSuspension ? 'text-red-600' : 'text-blue-600'}"></i>
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
                    <td class="px-6 py-5">
                        <span class="text-sm text-gray-500">${group.time_coverage || 'Full Day'}</span>
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
                <div class="mt-1">
                    <div class="${barColor} text-white text-[9px] font-bold px-1.5 py-0.5 rounded truncate">
                        ${label}
                    </div>
                </div>
            `;
        }
        
        grid.innerHTML += `
            <div class="bg-white p-2 hover:bg-gray-50 transition-colors ${isToday ? 'bg-blue-50' : ''} ${isWeekend && !eventInfo ? 'bg-gray-50' : ''}">
                <div class="flex justify-between items-start">
                    <span class="text-sm font-bold ${isToday ? 'bg-blue-600 text-white w-7 h-7 rounded-full flex items-center justify-center' : isWeekend ? 'text-gray-400' : 'text-gray-700'}">
                        ${day}
                    </span>
                    ${eventHtml}
                </div>
            </div>
        `;
    }
}
