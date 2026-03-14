// parent/parent-calendar.js
// School Calendar logic for parents

// Current calendar state
let currentCalendarDate = new Date();
let calendarData = {
    holidays: [],
    events: []
};

/**
 * Initialize calendar page
 */
document.addEventListener('DOMContentLoaded', async () => {
    await loadCalendarData();
    renderCalendar();
    renderUpcomingEvents();
});

/**
 * Load holidays and events for current month
 */
async function loadCalendarData() {
    try {
        const year = currentCalendarDate.getFullYear();
        const month = currentCalendarDate.getMonth();
        
        // Get first and last day of month
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        
        const firstDayStr = firstDay.toISOString().split('T')[0];
        const lastDayStr = lastDay.toISOString().split('T')[0];
        
        // Fetch holidays
        const { data: holidays, error: holidayError } = await supabase
            .from('holidays')
            .select('*')
            .gte('holiday_date', firstDayStr)
            .lte('holiday_date', lastDayStr);
        
        if (holidayError) {
            console.error('Error fetching holidays:', holidayError);
        }
        
        // Fetch events from announcements (where scheduled_at is set and in the future)
        const { data: events, error: eventError } = await supabase
            .from('announcements')
            .select('id, title, content, scheduled_at, priority')
            .not('scheduled_at', 'is', null)
            .gte('scheduled_at', firstDayStr)
            .lte('scheduled_at', lastDayStr)
            .order('scheduled_at');
        
        if (eventError) {
            console.error('Error fetching events:', eventError);
        }
        
        calendarData.holidays = holidays || [];
        calendarData.events = events || [];
        
    } catch (err) {
        console.error('Error loading calendar data:', err);
    }
}

/**
 * Render the calendar grid
 */
function renderCalendar() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    // Update header
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('current-month-year').textContent = `${monthNames[month]} ${year}`;
    
    const container = document.getElementById('calendar-grid');
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    // Get day of week for first day (0 = Sunday, convert to Monday-based)
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek < 0) startDayOfWeek = 6; // Sunday becomes 6
    
    // Today's date for comparison
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // Build calendar HTML
    let html = '';
    
    // Empty cells for days before first of month
    for (let i = 0; i < startDayOfWeek; i++) {
        html += '<div class="calendar-day empty"></div>';
    }
    
    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        // Determine day status
        const dayStatus = getDayStatus(dateStr);
        const isToday = dateStr === todayStr;
        
        let classes = 'calendar-day';
        if (isToday) {
            classes += ' today';
        } else if (dayStatus.type === 'holiday') {
            classes += ' holiday';
        } else if (dayStatus.type === 'event') {
            classes += ' event';
        } else if (dayStatus.type === 'school-day') {
            classes += ' school-day';
        }
        
        // Icon based on status
        let icon = '';
        if (dayStatus.type === 'holiday') {
            icon = '<span class="text-xs">🎄</span>';
        } else if (dayStatus.type === 'event') {
            icon = '<span class="text-xs">🎉</span>';
        } else if (dayStatus.isWeekend) {
            icon = '';
        } else {
            icon = '<span class="text-xs opacity-30">📚</span>';
        }
        
        html += `
            <div class="${classes}">
                <span class="font-medium ${isToday ? 'text-green-700' : 'text-gray-700'}">${day}</span>
                ${icon}
            </div>
        `;
    }
    
    // Fill remaining cells to complete the grid
    const totalCells = startDayOfWeek + daysInMonth;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    for (let i = 0; i < remainingCells; i++) {
        html += '<div class="calendar-day empty"></div>';
    }
    
    container.innerHTML = html;
}

/**
 * Get the status of a specific day
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {object} - { type: 'school-day'|'holiday'|'event'|'weekend', isWeekend: boolean, data: object }
 */
function getDayStatus(dateStr) {
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();
    
    // Check if weekend
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    
    // Check holidays
    const holiday = calendarData.holidays.find(h => {
        const holidayDate = new Date(h.holiday_date);
        return holidayDate.toISOString().split('T')[0] === dateStr;
    });
    
    if (holiday) {
        return { type: 'holiday', isWeekend, data: holiday };
    }
    
    // Check events
    const event = calendarData.events.find(e => {
        if (!e.scheduled_at) return false;
        const eventDate = new Date(e.scheduled_at);
        return eventDate.toISOString().split('T')[0] === dateStr;
    });
    
    if (event) {
        return { type: 'event', isWeekend, data: event };
    }
    
    // Regular school day
    if (isWeekend) {
        return { type: 'weekend', isWeekend: true, data: null };
    }
    
    return { type: 'school-day', isWeekend: false, data: null };
}

/**
 * Render upcoming events list
 */
async function renderUpcomingEvents() {
    const container = document.getElementById('upcoming-events');
    
    try {
        const today = new Date();
        const nextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
        
        // Fetch upcoming events and holidays
        const [{ data: holidays }, { data: events }] = await Promise.all([
            supabase
                .from('holidays')
                .select('*')
                .gte('holiday_date', today.toISOString().split('T')[0])
                .lte('holiday_date', nextMonth.toISOString().split('T')[0])
                .order('holiday_date')
                .limit(5),
            supabase
                .from('announcements')
                .select('id, title, content, scheduled_at, priority')
                .not('scheduled_at', 'is', null)
                .gte('scheduled_at', today.toISOString().split('T')[0])
                .lte('scheduled_at', nextMonth.toISOString().split('T')[0])
                .order('scheduled_at')
                .limit(5)
        ]);
        
        // Combine and sort
        const items = [];
        
        (holidays || []).forEach(h => {
            items.push({
                date: h.holiday_date,
                title: h.description,
                type: 'holiday',
                icon: '🎄'
            });
        });
        
        (events || []).forEach(e => {
            items.push({
                date: e.scheduled_at,
                title: e.title,
                type: 'event',
                icon: '🎉'
            });
        });
        
        // Sort by date
        items.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Take top 5
        const topItems = items.slice(0, 5);
        
        if (topItems.length === 0) {
            container.innerHTML = `
                <p class="text-center text-gray-500 py-4 text-sm">No upcoming events</p>
            `;
            return;
        }
        
        container.innerHTML = topItems.map(item => {
            const date = new Date(item.date);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            const bgClass = item.type === 'holiday' 
                ? 'bg-red-50 border-red-100' 
                : 'bg-yellow-50 border-yellow-100';
            
            return `
                <div class="flex items-center gap-3 p-3 ${bgClass} rounded-xl border">
                    <span class="text-xl">${item.icon}</span>
                    <div class="flex-1 min-w-0">
                        <p class="font-medium text-gray-800 text-sm truncate">${item.title}</p>
                        <p class="text-xs text-gray-500">${dateStr}</p>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (err) {
        console.error('Error loading upcoming events:', err);
        container.innerHTML = `
            <p class="text-center text-gray-500 py-4 text-sm">Unable to load events</p>
        `;
    }
}

/**
 * Navigate to previous month
 */
async function prevMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    await loadCalendarData();
    renderCalendar();
    renderUpcomingEvents();
}

/**
 * Navigate to next month
 */
async function nextMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    await loadCalendarData();
    renderCalendar();
    renderUpcomingEvents();
}

// Make functions available globally
window.prevMonth = prevMonth;
window.nextMonth = nextMonth;
