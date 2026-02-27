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

        // The formatTime function is available globally from parent-core.js
        container.innerHTML = schedule.map(item => `
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-bold text-gray-800">${item.subject_name}</h4>
                        <p class="text-sm text-gray-500">${item.teachers?.full_name || 'N/A'}</p>
                    </div>
                    <div class="text-right">
                        <p class="font-mono text-xs font-bold text-gray-400 uppercase">${item.schedule_days || 'N/A'}</p>
                        <p class="font-mono text-sm font-medium text-green-600">
                            ${formatTime(item.schedule_time_start)} - ${formatTime(item.schedule_time_end)}
                        </p>
                    </div>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error("Error loading schedule:", err);
        container.innerHTML = '<p class="text-center text-red-500 p-8">Could not load schedule.</p>';
    }
}