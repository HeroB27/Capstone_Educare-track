// teacher/teacher-attendance-rules.js
// Teacher Attendance Rules - Read-Only View of Grade-Level Schedules

// FIX: Add currentUser reference to prevent ReferenceError
var currentUser = typeof checkSession !== 'undefined' ? checkSession('teachers') : null;

// Redirect if not logged in
if (!currentUser) {
    window.location.href = '../index.html';
}

// Grade level definitions (same as admin)
const GRADE_LEVELS = [
    { id: 'kinder', name: 'Kindergarten', shortName: 'Kinder', icon: 'baby' },
    { id: 'grades1_3', name: 'Grades 1-3', shortName: 'G1-3', icon: 'shapes' },
    { id: 'grades4_6', name: 'Grades 4-6', shortName: 'G4-6', icon: 'book-open' },
    { id: 'jhs', name: 'Junior High School', shortName: 'JHS', icon: 'graduation-cap' },
    { id: 'shs', name: 'Senior High School', shortName: 'SHS', icon: 'school' }
];

// Default schedule times (fallback)
const DEFAULT_SCHEDULES = {
    kinder: { start: '07:30', end: '13:00', late: '08:00', early: '12:30' },
    grades1_3: { start: '07:30', end: '13:00', late: '08:00', early: '12:30' },
    grades4_6: { start: '07:30', end: '15:00', late: '08:00', early: '14:30' },
    jhs: { start: '07:30', end: '16:00', late: '08:00', early: '15:30' },
    shs: { start: '07:30', end: '16:30', late: '08:00', early: '16:00' }
};

// 1. Initialize Page
document.addEventListener('DOMContentLoaded', async () => {
    await loadMyHomeroom();
    await loadGradeSchedules();
    
    // Initialize icons
    if (window.lucide) {
        window.lucide.createIcons();
    }
});

// 2. Load Teacher's Homeroom Class
async function loadMyHomeroom() {
    const homeroomCard = document.getElementById('my-homeroom-card');
    const homeroomName = document.getElementById('my-homeroom-name');
    const homeroomSchedule = document.getElementById('my-homeroom-schedule');
    
    try {
        // Get teacher's homeroom class
        const { data: teacherClass, error } = await supabase
            .from('classes')
            .select('id, grade_level, section_name')
            .eq('adviser_id', currentUser.id)
            .single();
        
        // SAFE CHECK: Ensure teacher actually has an assigned homeroom and grade level
        if (error || !teacherClass || !teacherClass.grade_level) {
            homeroomCard.classList.add('hidden');
            return; // Exit silently, allowing the rest of the page to load
        }
        
        // Show homeroom card
        homeroomCard.classList.remove('hidden');
        homeroomName.textContent = `${teacherClass.grade_level} - ${teacherClass.section_name}`;
        
        // Find the grade level info safely
        const gradeInfo = GRADE_LEVELS.find(g => {
            const gl = teacherClass.grade_level.toLowerCase();
            return gl.includes(g.id) || 
                   (g.id === 'kinder' && gl.includes('kinder')) ||
                   (g.id === 'grades1_3' && (gl.includes('grade 1') || gl.includes('grade 2') || gl.includes('grade 3'))) ||
                   (g.id === 'grades4_6' && (gl.includes('grade 4') || gl.includes('grade 5') || gl.includes('grade 6'))) ||
                   (g.id === 'jhs' && gl.includes('junior')) ||
                   (g.id === 'shs' && gl.includes('senior'));
        });
        
        // Try to get the schedule from settings
        const { data: settingsData } = await supabase.from('settings').select('*');
        const settings = {};
        settingsData?.forEach(s => settings[s.setting_key] = s.setting_value);
        
        const defaults = gradeInfo ? DEFAULT_SCHEDULES[gradeInfo.id] : DEFAULT_SCHEDULES.shs;
        const startTime = settings[`grade_${gradeInfo?.id || 'shs'}_start`] || defaults.start;
        const lateThreshold = settings[`grade_${gradeInfo?.id || 'shs'}_late_threshold`] || defaults.late;
        
        homeroomSchedule.textContent = `Start: ${startTime} | Late after: ${lateThreshold}`;
        
    } catch (err) {
        console.error('Error loading homeroom:', err);
        homeroomCard.classList.add('hidden');
    }
}

// 3. Load Grade Schedules (Read-Only)
async function loadGradeSchedules() {
    const container = document.getElementById('grade-schedules-container');
    container.innerHTML = '';

    try {
        // Load all settings
        const { data: settingsData, error } = await supabase.from('settings').select('*');
        if (error) throw error;

        // Create settings lookup
        const settings = {};
        settingsData?.forEach(s => settings[s.setting_key] = s.setting_value);

        // Build the grid (read-only - no edit buttons)
        container.innerHTML = GRADE_LEVELS.map(grade => {
            const defaults = DEFAULT_SCHEDULES[grade.id];
            const startTime = settings[`grade_${grade.id}_start`] || defaults.start;
            const endTime = settings[`grade_${grade.id}_end`] || defaults.end;
            const lateThreshold = settings[`grade_${grade.id}_late_threshold`] || defaults.late;
            const earlyCutoff = settings[`grade_${grade.id}_early_cutoff`] || defaults.early;

            return `
                <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div class="px-6 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center gap-3">
                        <div class="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                            <i data-lucide="${grade.icon}" class="w-5 h-5 text-blue-600"></i>
                        </div>
                        <div>
                            <h3 class="font-black text-gray-800">${grade.name}</h3>
                            <p class="text-xs text-gray-400">${grade.shortName}</p>
                        </div>
                    </div>
                    <div class="p-6 space-y-5">
                        <!-- Morning Schedule -->
                        <div>
                            <p class="text-xs font-bold text-gray-400 uppercase mb-3">Morning (AM)</p>
                            <div class="grid grid-cols-2 gap-4">
                                <div class="bg-green-50 rounded-xl p-4">
                                    <p class="text-xs text-green-600 font-bold uppercase mb-1">Start Time</p>
                                    <p class="text-2xl font-black text-gray-800">${startTime}</p>
                                </div>
                                <div class="bg-yellow-50 rounded-xl p-4">
                                    <p class="text-xs text-yellow-600 font-bold uppercase mb-1">Late After</p>
                                    <p class="text-2xl font-black text-gray-800">${lateThreshold}</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Afternoon Schedule -->
                        <div>
                            <p class="text-xs font-bold text-gray-400 uppercase mb-3">Afternoon (PM)</p>
                            <div class="grid grid-cols-2 gap-4">
                                <div class="bg-orange-50 rounded-xl p-4">
                                    <p class="text-xs text-orange-600 font-bold uppercase mb-1">Dismissal</p>
                                    <p class="text-2xl font-black text-gray-800">${endTime}</p>
                                </div>
                                <div class="bg-purple-50 rounded-xl p-4">
                                    <p class="text-xs text-purple-600 font-bold uppercase mb-1">Early Leave</p>
                                    <p class="text-2xl font-black text-gray-800">${earlyCutoff}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Re-initialize icons
        if (window.lucide) {
            window.lucide.createIcons();
        }

    } catch (err) {
        console.error("Error loading grade schedules:", err);
        container.innerHTML = `
            <div class="col-span-full text-center py-12">
                <p class="text-red-500">Error loading grade schedules.</p>
            </div>
        `;
    }
}
