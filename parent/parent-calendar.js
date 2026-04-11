// parent-calendar.js – School Calendar for Parents
// Fetches holidays created by admin and displays them

let currentCalendarDate = new Date();
let holidaysMap = new Map(); // date string -> holiday object

document.addEventListener('DOMContentLoaded', async () => {
    // Wait for parent-core to set currentUser if needed, but calendar works without login
    await renderCalendar();
    await loadUpcomingEvents();
    setupCalendarNavigation();
});

// Setup month navigation buttons
function setupCalendarNavigation() {
    const prevBtn = document.querySelector('button[onclick="prevMonth()"]');
    const nextBtn = document.querySelector('button[onclick="nextMonth()"]');
    if (prevBtn) prevBtn.onclick = () => changeMonth(-1);
    if (nextBtn) nextBtn.onclick = () => changeMonth(1);
}

async function changeMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    await renderCalendar();
    await loadUpcomingEvents();
}

async function renderCalendar() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    // Update month header
    const monthYearElem = document.getElementById('current-month-year');
    if (monthYearElem) {
        monthYearElem.textContent = currentCalendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    
    // Get first day of month and days in month
    const firstDayOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Get day of week for first day (0 = Sunday)
    const firstDayWeekIndex = firstDayOfMonth.getDay();
    // Empty cells before 1st day (Monday first)
    const emptyCells = (firstDayWeekIndex + 6) % 7;
    
    // Fetch holidays for this month
    const { start, end } = getMonthBounds(year, month);
    const holidays = await fetchHolidays(start, end);
    holidaysMap.clear();
    holidays.forEach(h => {
        holidaysMap.set(h.holiday_date, h);
    });
    
    // Build calendar grid
    const grid = document.getElementById('calendar-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    // Add empty cells for alignment
    for (let i = 0; i < emptyCells; i++) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'calendar-day empty bg-gray-50 p-2 text-center';
        emptyDiv.style.minHeight = '80px';
        grid.appendChild(emptyDiv);
    }
    
    const todayStr = getLocalDateString();
    
    // Add day cells
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dateStr = getLocalDateString(date);
        const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isToday = dateStr === todayStr;
        const holiday = holidaysMap.get(dateStr);
        
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day p-2 text-center border border-gray-100';
        dayDiv.style.minHeight = '80px';
        
        // Apply background based on holiday type OR school day (Mon-Fri)
        if (holiday) {
            if (holiday.is_suspended) {
                dayDiv.classList.add('bg-red-50', 'border-red-200');
            } else {
                dayDiv.classList.add('bg-yellow-50', 'border-yellow-200');
            }
        } else if (isWeekend) {
            // Weekend - light gray background
            dayDiv.classList.add('bg-gray-100');
        } else {
            // Regular school day (Mon-Fri) - light green background (matches legend!)
            dayDiv.classList.add('bg-green-50', 'border-green-200');
        }
        
        if (isToday) {
            dayDiv.classList.add('ring-2', 'ring-green-500', 'ring-inset');
        }
        
        // Day number
        const dayNumber = document.createElement('div');
        dayNumber.className = `text-sm font-bold mb-1 ${isToday ? 'text-green-700' : 'text-gray-700'}`;
        dayNumber.textContent = d;
        dayDiv.appendChild(dayNumber);
        
        // Holiday / suspension info
        if (holiday) {
            const badge = document.createElement('div');
            badge.className = 'text-[10px] font-black uppercase tracking-wide p-1 rounded mt-1 break-words';
            if (holiday.is_suspended) {
                badge.className += ' bg-red-200 text-red-800';
                badge.innerHTML = `<i data-lucide="ban" class="w-3 h-3 inline mr-1"></i> Suspension`;
            } else {
                badge.className += ' bg-yellow-200 text-yellow-800';
                badge.innerHTML = `<i data-lucide="cake" class="w-3 h-3 inline mr-1"></i> Holiday`;
            }
            dayDiv.appendChild(badge);
            
            const desc = document.createElement('div');
            desc.className = 'text-[10px] text-gray-600 mt-1 truncate';
            desc.title = holiday.description;
            desc.textContent = holiday.description.length > 20 ? holiday.description.slice(0,18)+'...' : holiday.description;
            dayDiv.appendChild(desc);
            
            if (holiday.is_suspended && holiday.time_coverage && holiday.time_coverage !== 'Full Day') {
                const coverage = document.createElement('div');
                coverage.className = 'text-[9px] text-red-600 font-bold mt-0.5';
                coverage.textContent = holiday.time_coverage;
                dayDiv.appendChild(coverage);
            }
        }
        
        grid.appendChild(dayDiv);
    }
    
    // Refresh lucide icons if any
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function loadUpcomingEvents() {
    const container = document.getElementById('upcoming-events');
    if (!container) return;
    
    container.innerHTML = '<div class="flex justify-center py-4"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div></div>';
    
    const today = getLocalDateString();
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const endDate = getLocalDateString(nextYear);
    
    const holidays = await fetchHolidays(today, endDate);
    // Sort by date
    holidays.sort((a,b) => a.holiday_date.localeCompare(b.holiday_date));
    const upcoming = holidays.slice(0, 5);
    
    if (upcoming.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 text-sm py-4">No upcoming holidays or suspensions.</p>';
        return;
    }
    
    container.innerHTML = upcoming.map(h => {
        const dateObj = new Date(h.holiday_date);
        const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const typeLabel = h.is_suspended ? 'Suspension' : 'Holiday';
        const typeColor = h.is_suspended ? 'text-red-600 bg-red-50' : 'text-yellow-600 bg-yellow-50';
        return `
            <div class="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div class="min-w-[50px] text-center">
                    <div class="font-black text-gray-800">${dateObj.getDate()}</div>
                    <div class="text-[10px] font-bold text-gray-400 uppercase">${dateObj.toLocaleDateString('en-US', { month: 'short' })}</div>
                </div>
                <div class="flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-xs font-black px-2 py-0.5 rounded-full ${typeColor}">${typeLabel}</span>
                        ${h.is_suspended && h.time_coverage !== 'Full Day' ? `<span class="text-xs font-bold text-orange-600">${h.time_coverage}</span>` : ''}
                    </div>
                    <p class="font-bold text-gray-800 text-sm mt-1">${escapeHtml(h.description) || 'Event'}</p>
                    ${h.target_grades && h.target_grades !== 'All Levels' ? `<p class="text-[10px] text-gray-500 mt-0.5">Affects: ${h.target_grades}</p>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Helper (already in parent-utils but ensure it's available)
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Make navigation functions global for inline onclick
window.prevMonth = () => changeMonth(-1);
window.nextMonth = () => changeMonth(1);