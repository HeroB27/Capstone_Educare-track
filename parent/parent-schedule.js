// parent-schedule.js – Tabular weekly schedule (days as columns)
// with 12-hour time format and flexible day parsing (supports "MWF" and "M,W,F")

document.addEventListener('DOMContentLoaded', async () => {
    if (window.currentChild) {
        await ensureFullChildData();
        await loadSchedule();
    }
    document.addEventListener('childChanged', async () => {
        await ensureFullChildData();
        await loadSchedule();
    });
});

async function ensureFullChildData() {
    if (!window.currentChild) return;
    if (window.currentChild.class_id && window.currentChild.classes) return;

    console.log("Fetching missing class data for child ID:", window.currentChild.id);
    const { data, error } = await supabase
        .from('students')
        .select(`
            class_id,
            classes ( grade_level, strand, department )
        `)
        .eq('id', window.currentChild.id)
        .single();

    if (error) {
        console.error("Failed to fetch class data:", error);
        return;
    }
    if (data) {
        window.currentChild.class_id = data.class_id;
        window.currentChild.classes = data.classes;
        console.log("Updated child:", window.currentChild);
    }
}

// Convert 24-hour time (e.g., "14:30:00") to 12-hour format (e.g., "2:30 PM")
function formatTime12hr(timeStr) {
    if (!timeStr) return '--:--';
    let [hour, minute] = timeStr.split(':');
    hour = parseInt(hour, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    let hour12 = hour % 12;
    if (hour12 === 0) hour12 = 12;
    return `${hour12}:${minute} ${ampm}`;
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

function normalizeDayString(dayStr) {
    const map = {
        'M': 'Mon', 'T': 'Tue', 'W': 'Wed', 'Th': 'Thu', 'F': 'Fri',
        'Monday': 'Mon', 'Tuesday': 'Tue', 'Wednesday': 'Wed', 'Thursday': 'Thu', 'Friday': 'Fri',
        'Saturday': 'Sat', 'Sunday': 'Sun',
        'Mon': 'Mon', 'Tue': 'Tue', 'Wed': 'Wed', 'Thu': 'Thu', 'Fri': 'Fri',
        'Sat': 'Sat', 'Sun': 'Sun'
    };
    return map[dayStr] || null;
}

// Days to display as columns (Mon to Fri, optionally Sat/Sun if data exists)
const displayDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Extract day codes from both "M,W,F" and "MWF" formats
function extractDayCodes(daysStr) {
    if (!daysStr) return [];
    
    if (daysStr.includes(',')) {
        return daysStr.split(',').map(d => d.trim()).filter(d => d);
    }
    
    const dayCodes = [];
    const patterns = [
        { code: 'Th', regex: /Th/g },
        { code: 'M', regex: /M/g },
        { code: 'T', regex: /T/g },
        { code: 'W', regex: /W/g },
        { code: 'F', regex: /F/g },
        { code: 'Sat', regex: /Sat/g },
        { code: 'Sun', regex: /Sun/g }
    ];
    
    let remaining = daysStr;
    for (const pattern of patterns) {
        if (remaining.includes(pattern.code)) {
            dayCodes.push(pattern.code);
            remaining = remaining.replace(new RegExp(pattern.code, 'g'), '');
        }
    }
    return dayCodes;
}

async function loadSchedule() {
    const container = document.getElementById('schedule-container');
    if (!container || !window.currentChild) {
        container.innerHTML = '<p class="text-center text-gray-500 p-8">Select a child to view their schedule.</p>';
        return;
    }

    if (!window.currentChild.class_id) {
        container.innerHTML = '<p class="text-center text-gray-500 p-8">This student has not been assigned to any class. Please contact the school.</p>';
        return;
    }

    container.innerHTML = '<p class="text-center text-gray-500 p-8">Loading schedule...</p>';

    try {
        // Check suspension
        const localDate = new Date();
        localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
        const today = localDate.toISOString().split('T')[0];
        const gradeLevel = window.currentChild.classes?.grade_level;

        if (gradeLevel) {
            const { data: suspension } = await supabase
                .from('holidays')
                .select('*')
                .eq('holiday_date', today)
                .eq('is_suspended', true)
                .maybeSingle();

            if (suspension && (suspension.target_grades === 'All' || suspension.target_grades?.includes(gradeLevel))) {
                container.innerHTML = `
                    <div class="bg-red-50 border-2 border-red-200 rounded-2xl p-6 text-center">
                        <i data-lucide="alert-triangle" class="w-12 h-12 text-red-500 mx-auto mb-3"></i>
                        <h3 class="text-lg font-black text-red-700 mb-1">Classes Suspended Today</h3>
                        <p class="text-sm text-red-600 font-medium">${escapeHtml(suspension.description)}</p>
                    </div>
                `;
                lucide?.createIcons();
                return;
            }
        }

        // Fetch subject loads
        const { data: schedule, error } = await supabase
            .from('subject_loads')
            .select(`
                subject_name,
                schedule_time_start,
                schedule_time_end,
                schedule_days,
                teachers (full_name)
            `)
            .eq('class_id', window.currentChild.class_id)
            .order('schedule_time_start', { nullsFirst: false });

        if (error) throw error;

        console.log("Raw schedule data:", schedule);

        if (!schedule || schedule.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 p-8">No subjects have been assigned to this class yet.</p>';
            return;
        }

        // Build a map: dayFullName -> array of subject items
        const scheduleByDay = {};
        displayDays.forEach(day => scheduleByDay[day] = []);

        schedule.forEach(item => {
            if (!item.schedule_days) {
                console.warn(`Subject "${item.subject_name}" has no schedule_days.`);
                return;
            }
            const dayCodes = extractDayCodes(item.schedule_days);
            dayCodes.forEach(shortDay => {
                const fullDay = normalizeDayString(shortDay);
                if (fullDay && scheduleByDay[fullDay]) {
                    scheduleByDay[fullDay].push(item);
                } else {
                    console.warn(`Unrecognized day code: "${shortDay}" for subject "${item.subject_name}"`);
                }
            });
        });

        // Sort subjects within each day by start time
        for (let day in scheduleByDay) {
            scheduleByDay[day].sort((a, b) => {
                const timeA = a.schedule_time_start || '';
                const timeB = b.schedule_time_start || '';
                return timeA.localeCompare(timeB);
            });
        }

        // Determine which days actually have data (to hide empty columns if desired, but keep all for consistency)
        const hasData = displayDays.some(day => scheduleByDay[day].length > 0);
        if (!hasData) {
            container.innerHTML = '<p class="text-center text-gray-500 p-8">No subjects scheduled on any day. Please check subject days.</p>';
            return;
        }

        // Build HTML table
        let html = `
            <div class="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gradient-to-r from-green-50 to-emerald-50">
                        <tr>
        `;
        displayDays.forEach(day => {
            html += `<th class="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-green-800 border-r last:border-r-0">${day}</th>`;
        });
        html += `</tr></thead><tbody class="divide-y divide-gray-100"><tr>`;

        // Each cell contains the list of subjects for that day
        displayDays.forEach(day => {
            const subjects = scheduleByDay[day];
            html += `<td class="px-4 py-3 align-top border-r last:border-r-0">`;
            if (subjects.length === 0) {
                html += `<p class="text-xs text-gray-400 italic">— No class —</p>`;
            } else {
                subjects.forEach(subj => {
                    const timeStr = subj.schedule_time_start && subj.schedule_time_end
                        ? `${formatTime12hr(subj.schedule_time_start)} – ${formatTime12hr(subj.schedule_time_end)}`
                        : 'Time TBA';
                    html += `
                        <div class="mb-3 pb-2 border-b border-gray-100 last:border-0">
                            <p class="font-bold text-sm text-gray-800">${escapeHtml(subj.subject_name)}</p>
                            <p class="text-xs text-gray-500 mt-0.5">${escapeHtml(subj.teachers?.full_name || 'No teacher')}</p>
                            <p class="text-xs font-mono text-green-600 mt-1">${timeStr}</p>
                        </div>
                    `;
                });
            }
            html += `</td>`;
        });

        html += `</tr></tbody></table></div>`;

        container.innerHTML = html;
        lucide?.createIcons();

    } catch (err) {
        console.error("Schedule error:", err);
        container.innerHTML = '<p class="text-center text-red-500 p-8">Could not load schedule. See console for details.</p>';
    }
}