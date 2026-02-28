// parent/parent-schedule.js

document.addEventListener('DOMContentLoaded', async () => {
    // The `currentChild` variable is global from parent-core.js
    if (currentChild) {
        await loadSchedule();
    }
    
    // Listen for child changes from the core switcher
    document.addEventListener('childChanged', async (e) => {
        await loadSchedule();
    });
});

async function loadSchedule() {
    const container = document.getElementById('schedule-container');
    if (!container || !currentChild) {
        container.innerHTML = '<p class="text-center text-gray-500 p-8">Select a child to view their schedule.</p>';
        return;
    }

    // Check if child has a class assigned
    if (!currentChild.class_id) {
        container.innerHTML = '<p class="text-center text-gray-500 p-8">This student has not been assigned to a class yet.</p>';
        return;
    }

    container.innerHTML = '<p class="text-center text-gray-500 p-8">Loading schedule...</p>';

    try {
        const { data: schedule, error } = await supabase
            .from('subject_loads')
            .select(`
                subject_name,
                schedule_time_start,
                schedule_time_end,
                schedule_days,
                teachers (full_name)
            `)
            .eq('class_id', currentChild.class_id)
            .order('schedule_time_start');

        if (error) throw error;

        if (schedule.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 p-8">No class schedule has been set up for this student.</p>';
            return;
        }

        // Group subjects by day of week
        const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const scheduleByDay = {};
        
        // Initialize all days
        dayOrder.forEach(day => scheduleByDay[day] = []);
        
        // Group subjects by their scheduled days
        schedule.forEach(item => {
            const days = item.schedule_days ? item.schedule_days.split(',').map(d => d.trim()) : [];
            days.forEach(day => {
                if (scheduleByDay[day]) {
                    scheduleByDay[day].push(item);
                }
            });
        });

        // Render schedule grouped by day
        let html = '';
        dayOrder.forEach(day => {
            const subjects = scheduleByDay[day];
            if (subjects.length === 0) return;
            
            // Sort by time
            subjects.sort((a, b) => {
                const timeA = a.schedule_time_start || '';
                const timeB = b.schedule_time_start || '';
                return timeA.localeCompare(timeB);
            });
            
            html += `
                <div class="mb-4">
                    <h3 class="font-bold text-gray-700 text-sm uppercase tracking-wide mb-2">${day}</h3>
                    <div class="space-y-2">
            `;
            
            html += subjects.map(item => `
                <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                    <div class="flex justify-between items-center">
                        <div>
                            <h4 class="font-bold text-gray-800">${item.subject_name}</h4>
                            <p class="text-sm text-gray-500">${item.teachers?.full_name || 'N/A'}</p>
                        </div>
                        <div class="text-right">
                            <p class="font-mono text-sm font-medium text-green-600">
                                ${formatTime(item.schedule_time_start)} - ${formatTime(item.schedule_time_end)}
                            </p>
                        </div>
                    </div>
                </div>
            `).join('');
            
            html += '</div></div>';
        });

        if (html === '') {
            container.innerHTML = '<p class="text-center text-gray-500 p-8">No class schedule has been set up for this student.</p>';
            return;
        }

        container.innerHTML = html;

    } catch (err) {
        console.error("Error loading schedule:", err);
        container.innerHTML = '<p class="text-center text-red-500 p-8">Could not load schedule.</p>';
    }
}