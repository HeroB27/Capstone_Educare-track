// ============================================================================
// EDUCARE TRACK - MASTER DATA SEEDER
// ============================================================================

const SUPABASE_URL = 'https://nfocaznjnyslkoejjoaa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mb2Nhem5qbnlzbGtvZWpqb2FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NTI0NzgsImV4cCI6MjA4NjQyODQ3OH0.x-jN27puW2W7HWG4uGiodPkenThqGXR_U8r_JgkajD0';

var supabase;
if (window.supabase && window.supabase.createClient) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabase = supabase;
} else {
    supabase = window.supabase;
}

let seededData = {
    admins: [], guards: [], teachers: [], classes: [], subjectLoads: [], parents: [], students: []
};

let totalSteps = 12;
let currentStep = 0;

function log(message, type = 'info') {
    const logOutput = document.getElementById('logOutput');
    const timestamp = new Date().toLocaleTimeString();
    let color = type === 'error' ? 'text-red-500' : type === 'success' ? 'text-emerald-400' : 'text-blue-300';
    logOutput.innerHTML += `<span class="${color}">[${timestamp}] ${message}</span>\n`;
    logOutput.parentElement.scrollTop = logOutput.parentElement.scrollHeight;
    console.log(`[${type}] ${message}`);
}

function updateProgress(percent, status) {
    document.getElementById('progressBar').style.width = percent + '%';
    document.getElementById('progressPercent').textContent = percent + '%';
    document.getElementById('currentStatus').textContent = status;
}

function updateStep() {
    currentStep++;
    return Math.round((currentStep / totalSteps) * 100);
}

function generateID(prefix, year, identifier) {
    let last4 = String(identifier).slice(-4).padStart(4, '0');
    let suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${year}-${last4}-${suffix}`;
}

function generatePhone() { return '09' + Math.floor(100000000 + Math.random() * 900000000); }
function generateLRN() { return '1' + Math.floor(100000000000 + Math.random() * 900000000000); }

function getWeekdays(startDate, endDate) {
    let dates = [];
    let current = new Date(startDate);
    while (current <= endDate) {
        if (current.getDay() !== 0 && current.getDay() !== 6) dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
    }
    return dates;
}

function chunkArray(array, chunkSize) {
    let chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) chunks.push(array.slice(i, i + chunkSize));
    return chunks;
}

// ================== SEEDING LOGIC ================== //

// 1. ADMINS
async function seedAdmins() {
    log('Seeding Admins...');
    const phone1 = generatePhone(); const phone2 = generatePhone();
    const admins = [
        { username: 'admin1', password: 'password123', full_name: 'Lead Admin', contact_number: phone1, admin_id_text: generateID('ADM', '2026', phone1), is_active: true },
        { username: 'admin2', password: 'password123', full_name: 'System Admin', contact_number: phone2, admin_id_text: generateID('ADM', '2026', phone2), is_active: true }
    ];
    const { data, error } = await supabase.from('admins').insert(admins).select();
    if (error) throw error;
    seededData.admins = data;
    log(`✓ Seeded ${data.length} admins`, 'success');
}

// 2. GUARDS
async function seedGuards() {
    log('Seeding Guards...');
    const phone = generatePhone();
    const guards = [{ username: 'guard1', password: 'password123', full_name: 'Kuya Guard', assigned_gate: 'Main Gate', guard_id_text: generateID('GRD', '2026', phone), contact_number: phone, is_active: true }];
    const { data, error } = await supabase.from('guards').insert(guards).select();
    if (error) throw error;
    seededData.guards = data;
    log(`✓ Seeded ${data.length} guard`, 'success');
}

// 3. TEACHERS (20 Total)
async function seedTeachers() {
    log('Seeding 20 Teachers...');
    const teachers = [];
    for (let i = 0; i < 20; i++) {
        const phone = generatePhone();
        teachers.push({
            username: `teacher${i+1}`, password: 'password123', full_name: `Teacher ${i+1} Name`,
            department: i < 11 ? 'JHS' : 'SHS', contact_number: phone, email: `teacher${i+1}@educare.edu`,
            teacher_id_text: generateID('TCH', '2026', phone), is_active: true, is_gatekeeper: i === 0
        });
    }
    const { data, error } = await supabase.from('teachers').insert(teachers).select();
    if (error) throw error;
    seededData.teachers = data;
    log(`✓ Seeded ${data.length} teachers`, 'success');
}

// 4. CLASSES (19 Total: K-10 + 8 Strands)
async function seedClasses() {
    log('Seeding 19 Classes...');
    const defs = [
        { grade: 'Kinder', strand: null }, { grade: 'Grade 1', strand: null }, { grade: 'Grade 2', strand: null },
        { grade: 'Grade 3', strand: null }, { grade: 'Grade 4', strand: null }, { grade: 'Grade 5', strand: null },
        { grade: 'Grade 6', strand: null }, { grade: 'Grade 7', strand: null }, { grade: 'Grade 8', strand: null },
        { grade: 'Grade 9', strand: null }, { grade: 'Grade 10', strand: null },
        { grade: 'Grade 11', strand: 'STEM' }, { grade: 'Grade 11', strand: 'HUMSS' }, { grade: 'Grade 11', strand: 'ABM' }, { grade: 'Grade 11', strand: 'ICT' },
        { grade: 'Grade 12', strand: 'STEM' }, { grade: 'Grade 12', strand: 'HUMSS' }, { grade: 'Grade 12', strand: 'ABM' }, { grade: 'Grade 12', strand: 'ICT' }
    ];
    const classes = defs.map((def, i) => ({
        grade_level: def.grade,
        section_name: def.strand ? def.strand : def.grade,
        strand: def.strand,
        adviser_id: seededData.teachers[i].id, // First 19 teachers are advisers. Teacher #20 is subject-only.
        school_year: '2025-2026'
    }));
    const { data, error } = await supabase.from('classes').insert(classes).select();
    if (error) throw error;
    seededData.classes = data;
    log(`✓ Seeded ${data.length} classes`, 'success');
}

// 5. SUBJECTS
async function seedSubjects() {
    log('Seeding Subject Loads...');
    const subjects = [];
    seededData.classes.forEach(cls => {
        let subjs = [];
        if (!cls.strand) subjs = ['Math', 'Science', 'English', 'Filipino', 'Makabayan'];
        else if (cls.strand === 'STEM') subjs = ['Calculus', 'Physics', 'Chemistry', 'Core English'];
        else if (cls.strand === 'HUMSS') subjs = ['Politics', 'Creative Writing', 'World Religions', 'Core Math'];
        else if (cls.strand === 'ABM') subjs = ['Business Math', 'Accounting', 'Economics', 'Management'];
        else if (cls.strand === 'ICT') subjs = ['Programming', 'Animation', 'CSS', 'Core Math'];

        subjs.forEach((subj, idx) => {
            subjects.push({
                class_id: cls.id, subject_name: subj, 
                teacher_id: seededData.teachers[Math.floor(Math.random() * 20)].id, // Randomly pick from all 20 teachers
                schedule_time_start: `0${8+idx}:00:00`, schedule_time_end: `0${9+idx}:00:00`, schedule_days: 'MWF'
            });
        });
    });
    const { data, error } = await supabase.from('subject_loads').insert(subjects).select();
    if (error) throw error;
    seededData.subjectLoads = data;
    log(`✓ Seeded ${data.length} subject assignments`, 'success');
}

// 6. PARENTS & STUDENTS
async function seedFamilies() {
    log('Seeding Parents and Students...');
    // We need 57 students (19 classes * 3).
    // Exactly 2 students per parent = 29 parents (28 have 2, 1 has 1).
    const parents = [];
    for(let i = 0; i < 29; i++) {
        const phone = generatePhone();
        parents.push({
            username: `parent${i+1}`, password: 'password123', full_name: `Parent ${i+1} Doe`,
            contact_number: phone, relationship_type: 'Mother', is_active: true, parent_id_text: generateID('PAR', '2026', phone)
        });
    }
    const { data: pData, error: pError } = await supabase.from('parents').insert(parents).select();
    if (pError) throw pError;
    seededData.parents = pData;

    const students = [];
    let studentIndex = 0;
    seededData.classes.forEach(cls => {
        for(let j = 0; j < 3; j++) {
            const lrn = generateLRN();
            const parentIndex = Math.floor(studentIndex / 2); // Ensures exactly 2 per parent
            students.push({
                lrn: lrn, student_id_text: generateID('EDU', '2026', lrn), full_name: `Student ${studentIndex+1} Name`,
                parent_id: seededData.parents[parentIndex].id, class_id: cls.id, gender: 'Female',
                status: 'Enrolled', qr_code_data: generateID('EDU', '2026', lrn)
            });
            studentIndex++;
        }
    });

    const { data: sData, error: sError } = await supabase.from('students').insert(students).select();
    if (sError) throw sError;
    seededData.students = sData;
    log(`✓ Seeded 29 Parents and 57 Students`, 'success');
}

// 7. EXTRAS (Announcements, Holiday, Clinic, Excuses)
async function seedExtras() {
    log('Seeding Announcements, Holidays, Clinic, and Excuses...');
    
    // Announcements
    await supabase.from('announcements').insert([
        { title: 'Welcome Week', content: 'School starts!', posted_by_admin_id: seededData.admins[0].id, target_parents: true, priority: 'High', type: 'General' },
        { title: 'Bring Books', content: 'Reminder for class.', posted_by_teacher_id: seededData.teachers[0].id, target_students: true, priority: 'Normal', type: 'Academic' }
    ]);

    // Holiday (UPSERT to prevent crash)
    await supabase.from('holidays').upsert([
        { holiday_date: '2026-12-25', description: 'Christmas Day', is_suspended: true, target_grades: 'All' }
    ], { onConflict: 'holiday_date' });

    // Clinic Visits (Using Valid Status)
    await supabase.from('clinic_visits').insert([
        { student_id: seededData.students[0].id, referred_by_teacher_id: seededData.teachers[0].id, reason: 'Headache', action_taken: 'Paracetamol', status: 'Completed', time_in: new Date().toISOString() },
        { student_id: seededData.students[1].id, referred_by_teacher_id: seededData.teachers[1].id, reason: 'Stomach Ache', action_taken: 'Rest', status: 'In Clinic', time_in: new Date().toISOString() }
    ]);

    // Excuses
    await supabase.from('excuse_letters').insert([
        { student_id: seededData.students[2].id, parent_id: seededData.parents[1].id, reason: 'Fever', date_absent: '2026-01-10', status: 'Pending' },
        { student_id: seededData.students[3].id, parent_id: seededData.parents[1].id, reason: 'Checkup', date_absent: '2026-01-11', status: 'Approved' }
    ]);
    
    log(`✓ Seeded 7 Extra Records perfectly`, 'success');
}

// 8. HISTORICAL ATTENDANCE (Jan 1 to Yesterday)
async function seedHistoricalAttendance() {
    log('Generating Historical Attendance (Jan 1 to Yesterday)...');
    
    const startDate = new Date('2026-01-01');
    const endDate = new Date(); endDate.setDate(endDate.getDate() - 1);
    const weekdays = getWeekdays(startDate, endDate);
    
    const logs = [];
    seededData.students.forEach(student => {
        weekdays.forEach(date => {
            const rand = Math.random();
            let status = 'Present';
            let timeIn = new Date(date);
            let timeOut = new Date(date); timeOut.setHours(16, 0, 0); // Standard exit
            
            if (rand > 0.95) { // 5% Absent
                status = 'Absent'; timeIn = null; timeOut = null;
            } else if (rand > 0.90) { // 5% Late
                status = 'Late'; timeIn.setHours(8, Math.floor(Math.random() * 30), 0);
            } else { // 90% Present
                timeIn.setHours(7, Math.floor(Math.random() * 15), 0);
            }

            logs.push({
                student_id: student.id, log_date: date.toISOString().split('T')[0],
                time_in: timeIn ? timeIn.toISOString() : null, time_out: timeOut ? timeOut.toISOString() : null,
                status: status, remarks: status === 'Absent' ? 'No scan' : ''
            });
        });
    });

    log(`Batch inserting ${logs.length} historical logs...`, 'info');
    const chunks = chunkArray(logs, 500);
    for (let i = 0; i < chunks.length; i++) {
        const { error } = await supabase.from('attendance_logs').insert(chunks[i]);
        if (error) throw error;
        updateProgress(currentStep, `Inserting historical batch ${i+1}/${chunks.length}...`);
    }
    log(`✓ Historical attendance seeded`, 'success');
}

// 9. TODAY'S ATTENDANCE
async function seedTodayAttendance() {
    log('Generating TODAY\'s Attendance...');
    
    // Force strict Philippine Timezone so it doesn't accidentally log as yesterday in the morning
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
    const today = new Date(); // Keep this instance so we can still do time math below
    
    const logs = [];

    seededData.students.forEach(student => {
        const rand = Math.random();
        let status = 'Present'; let timeIn = new Date(today);
        if (rand > 0.95) { status = 'Absent'; timeIn = null; } 
        else if (rand > 0.85) { status = 'Late'; timeIn.setHours(8, Math.floor(Math.random() * 30), 0); } 
        else { timeIn.setHours(7, Math.floor(Math.random() * 15), 0); }

        logs.push({
            student_id: student.id, log_date: todayStr,
            time_in: timeIn ? timeIn.toISOString() : null, status: status, remarks: ''
        });
    });

    const { error } = await supabase.from('attendance_logs').insert(logs);
    if (error) throw error;
    log(`✓ Today's attendance seeded`, 'success');
}

// ================== EXECUTION ENGINE ================== //

async function startSeeding() {
    const confirmCheck = document.getElementById('confirmClear');
    const warningText = document.getElementById('warningText');
    const startBtn = document.getElementById('startSeedingBtn');
    
    if (!confirmCheck.checked) { warningText.classList.remove('hidden'); return; }
    warningText.classList.add('hidden');
    startBtn.disabled = true;
    startBtn.classList.add('opacity-50', 'cursor-not-allowed');
    document.getElementById('progressSection').classList.remove('hidden');
    
    try {
        log('=== IGNITING SEED SEQUENCE ===', 'info');
        
        let p = updateStep(); updateProgress(p, 'Seeding Admins...'); await seedAdmins();
        p = updateStep(); updateProgress(p, 'Seeding Guards...'); await seedGuards();
        p = updateStep(); updateProgress(p, 'Seeding Teachers...'); await seedTeachers();
        p = updateStep(); updateProgress(p, 'Seeding Classes...'); await seedClasses();
        p = updateStep(); updateProgress(p, 'Seeding Subjects...'); await seedSubjects();
        p = updateStep(); updateProgress(p, 'Seeding Families...'); await seedFamilies();
        p = updateStep(); updateProgress(p, 'Seeding Extras...'); await seedExtras();
        p = updateStep(); updateProgress(p, 'Seeding History...'); await seedHistoricalAttendance();
        p = updateStep(); updateProgress(p, 'Seeding Today...'); await seedTodayAttendance();
        
        updateProgress(100, 'SEEDING COMPLETE!');
        log('=== DATABASE READY FOR CAPSTONE DEFENSE ===', 'success');
        startBtn.innerText = "✅ SEEDING COMPLETE";
        
    } catch (error) {
        log('FATAL ERROR: ' + error.message, 'error');
        updateProgress(0, 'SYSTEM FAILURE - Check Console');
        startBtn.disabled = false;
        startBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

window.startSeeding = startSeeding;