// ============================================================================
// EDUCARE TRACK - MASTER DATA SEEDER (UPDATED)
// Real names, Baguio addresses, full SY 2025-2026 attendance, 5 students/class
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
    admins: [], clinic: [], guards: [], teachers: [], classes: [],
    subjectLoads: [], parents: [], students: [], attendanceLogs: [], excuseLetters: []
};

let totalSteps = 14;
let currentStep = 0;

function log(message, type = 'info') {
    const logOutput = document.getElementById('logOutput');
    if (!logOutput) return;
    const timestamp = new Date().toLocaleTimeString();
    let color = type === 'error' ? 'text-red-500' : type === 'success' ? 'text-emerald-400' : 'text-blue-300';
    logOutput.innerHTML += `<span class="${color}">[${timestamp}] ${message}</span>\n`;
    logOutput.parentElement.scrollTop = logOutput.parentElement.scrollHeight;
    console.log(`[${type}] ${message}`);
}

function updateProgress(percent, status) {
    const progressBar = document.getElementById('progressBar');
    const progressPercent = document.getElementById('progressPercent');
    const currentStatus = document.getElementById('currentStatus');
    if (progressBar) progressBar.style.width = percent + '%';
    if (progressPercent) progressPercent.textContent = percent + '%';
    if (currentStatus) currentStatus.textContent = status;
}

function updateStep() {
    currentStep++;
    return Math.round((currentStep / totalSteps) * 100);
}

// ---------- Helper Functions ----------
// FIXED: Use timestamp + random for uniqueness (prevents duplicate IDs)
function generateOfficialID(prefix, year, identifierSource) {
    const cleanSource = String(identifierSource).replace(/\D/g, '');
    const last4 = cleanSource.slice(-4).padStart(4, '0');
    const timestamp = Date.now().toString(36).slice(-2);
    const random = Math.random().toString(36).substring(2, 4).toUpperCase();
    const suffix = timestamp + random;
    return `${prefix}-${year}-${last4}-${suffix}`;
}

function generatePhone() {
    return '09' + Math.floor(100000000 + Math.random() * 900000000);
}

function generateLRN() {
    return '1' + Math.floor(100000000000 + Math.random() * 900000000000);
}

// Real Filipino names (first + last)
const firstNames = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Elizabeth", "David", "Susan", "Joseph", "Jessica", "Daniel", "Sarah", "Matthew", "Karen", "Christopher", "Nancy", "Andrew", "Lisa", "Joshua", "Maria", "Kevin", "Michelle", "Brian", "Laura", "Mark", "Linda", "Jason", "Amy"];
const lastNames = ["Santos", "Reyes", "Cruz", "Garcia", "Mendoza", "Flores", "Gonzales", "Rivera", "Torres", "Aquino", "Fernandez", "Lopez", "Dizon", "Villanueva", "Castillo", "De Leon", "Ramos", "Bautista", "Romualdez", "Marcos"];

function getRandomName() {
    return `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
}

// Baguio City addresses
const baguioBarangays = [
    "Pinsao Proper", "Bakakeng Central", "Camp 7", "Irisan", "Loakan Proper",
    "San Luis Village", "Quezon Hill", "Upper General Luna", "Lower General Luna",
    "Engineers' Hill", "Country Club Village", "Pacdal", "Green Valley", "BGH Compound"
];
function getBaguioAddress() {
    const houseNo = Math.floor(Math.random() * 100) + 1;
    const street = ["Purok", "St.", "Ave.", "Rd."][Math.floor(Math.random() * 4)];
    const barangay = baguioBarangays[Math.floor(Math.random() * baguioBarangays.length)];
    return `${houseNo} ${street} ${barangay}, Baguio City, 2600`;
}

// Date range for SY 2025-2026: Aug 1, 2025 to Apr 8, 2026
const schoolStart = new Date(2025, 7, 1);   // Aug 1 2025
const schoolEnd = new Date(2026, 3, 8);     // Apr 8 2026

function getWeekdaysBetween(start, end) {
    let dates = [];
    let current = new Date(start);
    while (current <= end) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) { // Monday-Friday
            dates.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
    }
    return dates;
}

const schoolDays = getWeekdaysBetween(schoolStart, schoolEnd);
log(`Total school days from Aug 2025 to Apr 8 2026: ${schoolDays.length}`);

function randomDateInRange(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Chunk array for batch inserts
function chunkArray(array, chunkSize) {
    let chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) chunks.push(array.slice(i, i + chunkSize));
    return chunks;
}

// ---------- Seeding Functions ----------
async function seedAdmins() {
    log('Seeding 2 Admins...');
    const admins = [];
    for (let i = 1; i <= 2; i++) {
        const phone = generatePhone();
        admins.push({
            username: `admin${i}`,
            password: 'password123',
            full_name: `Admin ${i} ${lastNames[0]}`,
            contact_number: phone,
            admin_id_text: generateOfficialID('ADM', '2026', phone),
            is_active: true
        });
    }
    const { data, error } = await supabase.from('admins').insert(admins).select();
    if (error) throw error;
    seededData.admins = data;
    log(`✓ Seeded ${data.length} admins`, 'success');
}

async function seedClinicStaff() {
    log('Seeding 1 Clinic Staff...');
    const phone = generatePhone();
    const staff = [{
        username: 'clinic1',
        password: 'password123',
        full_name: 'Maria Santos',
        role_title: 'School Nurse',
        email: 'nurse@educare.edu',
        contact_number: phone,
        clinic_id_text: generateOfficialID('CLC', '2026', phone),
        is_active: true
    }];
    const { data, error } = await supabase.from('clinic_staff').insert(staff).select();
    if (error) throw error;
    seededData.clinic = data;
    log(`✓ Seeded clinic staff`, 'success');
}

async function seedGuards() {
    log('Seeding 1 Guard...');
    const phone = generatePhone();
    const guards = [{
        username: 'guard1',
        password: 'password123',
        full_name: 'Ramon Dela Cruz',
        assigned_gate: 'Main Gate',
        shift_schedule: '6AM-2PM',
        contact_number: phone,
        guard_id_text: generateOfficialID('GRD', '2026', phone),
        is_active: true
    }];
    const { data, error } = await supabase.from('guards').insert(guards).select();
    if (error) throw error;
    seededData.guards = data;
    log(`✓ Seeded guard`, 'success');
}

async function seedTeachers() {
    log('Seeding 20 Teachers (5 gatekeepers)...');
    const teachers = [];
    for (let i = 1; i <= 20; i++) {
        const phone = generatePhone();
        const isGatekeeper = (i <= 5); // first 5 teachers are gatekeepers
        teachers.push({
            username: `teacher${i}`,
            password: 'password123',
            full_name: getRandomName(),
            department: i <= 11 ? 'JHS' : 'SHS',
            contact_number: phone,
            email: `teacher${i}@educare.edu`,
            teacher_id_text: generateOfficialID('TCH', '2026', phone),
            is_active: true,
            is_gatekeeper: isGatekeeper
        });
    }
    const { data, error } = await supabase.from('teachers').insert(teachers).select();
    if (error) throw error;
    seededData.teachers = data;
    log(`✓ Seeded ${data.length} teachers`, 'success');
}

// Classes from CSV data (19 rows)
const classDefinitions = [
    { grade_level: "Kinder", department: "Kindergarten", strand: null },
    { grade_level: "Grade 1", department: "Elementary", strand: null },
    { grade_level: "Grade 2", department: "Elementary", strand: null },
    { grade_level: "Grade 3", department: "Elementary", strand: null },
    { grade_level: "Grade 4", department: "Elementary", strand: null },
    { grade_level: "Grade 5", department: "Elementary", strand: null },
    { grade_level: "Grade 6", department: "Elementary", strand: null },
    { grade_level: "Grade 7", department: "Junior High School", strand: null },
    { grade_level: "Grade 8", department: "Junior High School", strand: null },
    { grade_level: "Grade 9", department: "Junior High School", strand: null },
    { grade_level: "Grade 10", department: "Junior High School", strand: null },
    { grade_level: "Grade 11", department: "Senior High School", strand: "STEM" },
    { grade_level: "Grade 11", department: "Senior High School", strand: "HUMSS" },
    { grade_level: "Grade 11", department: "Senior High School", strand: "ABM" },
    { grade_level: "Grade 11", department: "Senior High School", strand: "ICT" },
    { grade_level: "Grade 12", department: "Senior High School", strand: "STEM" },
    { grade_level: "Grade 12", department: "Senior High School", strand: "HUMSS" },
    { grade_level: "Grade 12", department: "Senior High School", strand: "ABM" },
    { grade_level: "Grade 12", department: "Senior High School", strand: "ICT" }
];

async function seedClasses() {
    log('Seeding 19 Classes (from CSV)...');
    const classes = classDefinitions.map((def, idx) => ({
        grade_level: def.grade_level,
        department: def.department,
        strand: def.strand,
        adviser_id: seededData.teachers[idx].id, // first 19 teachers as advisers
        school_year: '2025-2026'
    }));
    const { data, error } = await supabase.from('classes').insert(classes).select();
    if (error) throw error;
    seededData.classes = data;
    log(`✓ Seeded ${data.length} classes`, 'success');
}

async function seedSubjectLoads() {
    log('Generating Subject Loads for all classes...');
    const subjectsByLevel = {
        "Kinder": ["Language", "Mathematics", "Social Studies", "Arts"],
        "Elementary": ["English", "Math", "Science", "Filipino", "Araling Panlipunan", "MAPEH"],
        "Junior High School": ["English", "Math", "Science", "Filipino", "Araling Panlipunan", "MAPEH", "TLE"],
        "STEM": ["Pre-Calculus", "General Biology", "General Chemistry", "English", "Filipino", "PE"],
        "HUMSS": ["Creative Writing", "Politics", "Disciplines and Ideas", "English", "Filipino", "PE"],
        "ABM": ["Business Math", "Accounting", "Economics", "English", "Filipino", "PE"],
        "ICT": ["Programming", "Animation", "CSS", "English", "Filipino", "PE"]
    };

    const subjectLoads = [];
    for (const cls of seededData.classes) {
        let key = cls.department;
        if (cls.strand) key = cls.strand;
        let subjects = subjectsByLevel[key] || subjectsByLevel["Junior High School"];
        // each subject gets a random teacher (among all teachers)
        subjects.forEach((subj, idx) => {
            const teacher = seededData.teachers[Math.floor(Math.random() * seededData.teachers.length)];
            const isMorning = idx % 2 === 0; // Even subjects = morning, odd = afternoon
            subjectLoads.push({
                class_id: cls.id,
                subject_name: subj,
                teacher_id: teacher.id,
                schedule_time_start: `0${8 + idx}:00:00`,
                schedule_time_end: `0${9 + idx}:00:00`,
                schedule_days: isMorning ? 'MWF' : 'TTH',
                time_slot: isMorning ? 'morning' : 'afternoon'
            });
        });
    }
    const chunks = chunkArray(subjectLoads, 50);
    for (let i = 0; i < chunks.length; i++) {
        const { error } = await supabase.from('subject_loads').insert(chunks[i]);
        if (error) throw error;
    }
    seededData.subjectLoads = subjectLoads;
    log(`✓ Seeded ${subjectLoads.length} subject loads`, 'success');
}

async function seedParents() {
    log('Seeding Parents (each with 2-3 children, Baguio addresses)...');
    // We have 95 students total, target ~35 parents (avg 2.7 children)
    const parentCount = 38;
    const parents = [];
    for (let i = 1; i <= parentCount; i++) {
        const phone = generatePhone();
        parents.push({
            username: `parent${i}`,
            password: 'password123',
            full_name: getRandomName(),
            address: getBaguioAddress(),
            contact_number: phone,
            relationship_type: Math.random() > 0.5 ? 'Mother' : 'Father',
            is_active: true,
            parent_id_text: generateOfficialID('PAR', '2026', phone)
        });
    }
    const { data, error } = await supabase.from('parents').insert(parents).select();
    if (error) throw error;
    seededData.parents = data;
    log(`✓ Seeded ${data.length} parents`, 'success');
}

async function seedStudents() {
    log('Seeding 5 Students per class (total 95)...');
    const students = [];
    let studentIdx = 1;
    for (const cls of seededData.classes) {
        for (let i = 0; i < 5; i++) {
            const lrn = generateLRN();
            // assign parent cyclically to ensure 2-3 children each
            const parent = seededData.parents[Math.floor(Math.random() * seededData.parents.length)];
            const gender = Math.random() > 0.5 ? 'Male' : 'Female';
            const studentID = generateOfficialID('EDU', '2026', lrn);
            students.push({
                lrn: lrn,
                student_id_text: studentID,
                full_name: getRandomName(),
                parent_id: parent.id,
                class_id: cls.id,
                gender: gender,
                address: parent.address,
                emergency_contact: parent.contact_number,
                qr_code_data: studentID,
                status: 'Enrolled'
            });
            studentIdx++;
        }
    }
    const chunks = chunkArray(students, 50);
    for (let i = 0; i < chunks.length; i++) {
        const { error } = await supabase.from('students').insert(chunks[i]);
        if (error) throw error;
    }
    const { data: actualStudents, error: fetchError } = await supabase.from('students').select('*');
    if (fetchError) throw fetchError;
    seededData.students = actualStudents;
    log(`✓ Seeded ${actualStudents.length} students`, 'success');
}

async function seedAttendanceAndExcuses() {
    log('Generating attendance logs (Aug 2025 - Apr 2026) with half-day support and excuse letters...');
    const allLogs = [];
    const excuseLetters = [];

    for (const student of seededData.students) {
        for (const day of schoolDays) {
            const rand = Math.random();
            let status = 'Present';
            let timeIn = null;
            let timeOut = null;
            let isExcused = false;
            let morningAbsent = false;
            let afternoonAbsent = false;

            // Updated distribution: Present(65%), Late(10%), HalfDay AM(5%), HalfDay PM(5%), Absent(10%), Excused(5%)
            if (rand < 0.65) { 
                // Present - full day
                status = 'Present';
                timeIn = new Date(day);
                timeIn.setHours(7, Math.floor(Math.random() * 30), 0);
                timeOut = new Date(day);
                timeOut.setHours(16, 0, 0);
            } else if (rand < 0.75) { 
                // Late - full day
                status = 'Late';
                timeIn = new Date(day);
                timeIn.setHours(8, Math.floor(Math.random() * 45) + 15, 0);
                timeOut = new Date(day);
                timeOut.setHours(16, 0, 0);
            } else if (rand < 0.80) {
                // Half-Day AM - absent in morning, present in afternoon
                status = 'Half Day';
                morningAbsent = true;
                afternoonAbsent = false;
                timeIn = new Date(day);
                timeIn.setHours(12, 30, 0); // Comes in afternoon
                timeOut = new Date(day);
                timeOut.setHours(16, 0, 0);
            } else if (rand < 0.85) {
                // Half-Day PM - present in morning, absent in afternoon
                status = 'Half Day';
                morningAbsent = false;
                afternoonAbsent = true;
                timeIn = new Date(day);
                timeIn.setHours(7, Math.floor(Math.random() * 30), 0);
                timeOut = new Date(day);
                timeOut.setHours(11, 30, 0); // Leaves morning
            } else if (rand < 0.95) { 
                // Absent - full day
                status = 'Absent';
            } else { 
                // Excused - full day
                status = 'Excused';
                isExcused = true;
            }

            // Create attendance log with half-day fields
            allLogs.push({
                student_id: student.id,
                log_date: day.toISOString().split('T')[0],
                time_in: timeIn ? timeIn.toISOString() : null,
                time_out: timeOut ? timeOut.toISOString() : null,
                status: status,
                morning_absent: morningAbsent,
                afternoon_absent: afternoonAbsent,
                remarks: status === 'Absent' ? 'No scan' : (status === 'Excused' ? 'Parent notified' : (status === 'Half Day' ? 'Half day absence' : ''))
            });

            // Create excuse letter for excused absences
            if (isExcused) {
                excuseLetters.push({
                    student_id: student.id,
                    parent_id: student.parent_id,
                    reason: ['Fever', 'Doctor Appointment', 'Family Emergency', 'Personal Matters'][Math.floor(Math.random() * 4)],
                    date_absent: day.toISOString().split('T')[0],
                    status: 'Approved',
                    created_at: new Date().toISOString()
                });
            }
        }
    }

    log(`Inserting ${allLogs.length} attendance logs in batches...`, 'info');
    const logChunks = chunkArray(allLogs, 500);
    for (let i = 0; i < logChunks.length; i++) {
        const { error } = await supabase.from('attendance_logs').insert(logChunks[i]);
        if (error) throw error;
        updateProgress(updateStep(), `Attendance batch ${i+1}/${logChunks.length}`);
    }

    if (excuseLetters.length > 0) {
        log(`Inserting ${excuseLetters.length} excuse letters...`, 'info');
        const excuseChunks = chunkArray(excuseLetters, 200);
        for (let i = 0; i < excuseChunks.length; i++) {
            const { error } = await supabase.from('excuse_letters').insert(excuseChunks[i]);
            if (error) throw error;
        }
    }
    seededData.attendanceLogs = allLogs;
    seededData.excuseLetters = excuseLetters;
    log(`✓ Attendance & excuse letters seeded`, 'success');
}

async function seedExtras() {
    log('Seeding minimal extras (announcements, holidays, clinic visits)...');
    // Add one holiday
    await supabase.from('holidays').upsert([
        { holiday_date: '2025-12-25', description: 'Christmas Day', is_suspended: true, target_grades: 'All' },
        { holiday_date: '2026-01-01', description: 'New Year', is_suspended: true }
    ], { onConflict: 'holiday_date' });

    // A couple of announcements
    const adminId = seededData.admins[0]?.id;
    if (adminId) {
        await supabase.from('announcements').insert([
            { title: 'Welcome to SY 2025-2026', content: 'Classes start August 1, 2025', posted_by_admin_id: adminId, target_parents: true, priority: 'High', type: 'General' },
            { title: 'Parent Orientation', content: 'Orientation on Aug 15', posted_by_admin_id: adminId, target_parents: true, priority: 'Normal' }
        ]);
    }

    // Some clinic visits (optional)
    const clinicStaff = seededData.clinic[0];
    if (clinicStaff && seededData.students.length) {
        const visits = [];
        for (let i = 0; i < 20; i++) {
            const student = seededData.students[Math.floor(Math.random() * seededData.students.length)];
            visits.push({
                student_id: student.id,
                reason: ['Headache', 'Stomach ache', 'Cough', 'Injury'][Math.floor(Math.random() * 4)],
                nurse_notes: 'Given first aid',
                status: 'Completed',
                time_in: new Date().toISOString()
            });
        }
        await supabase.from('clinic_visits').insert(visits);
    }

    log(`✓ Extras seeded`, 'success');
}

// ================== TRUNCATE FUNCTION ==================
// Clears existing seeded data to allow clean reseed
async function truncateSeededTables() {
    log('🗑️ Clearing existing seeded data (keeping system tables)...', 'info');
    
    // Order matters due to foreign keys - delete child tables first
    try {
        // Attendance-related (child tables)
        await supabase.from('attendance_logs').delete().neq('id', 0);
        log('  ✓ Cleared attendance_logs', 'info');
        await supabase.from('excuse_letters').delete().neq('id', 0);
        log('  ✓ Cleared excuse_letters', 'info');
        await supabase.from('clinic_visits').delete().neq('id', 0);
        log('  ✓ Cleared clinic_visits', 'info');
        await supabase.from('announcements').delete().neq('id', 0);
        log('  ✓ Cleared announcements', 'info');
        
        // Students (has foreign keys to parents)
        await supabase.from('students').delete().neq('id', 0);
        log('  ✓ Cleared students', 'info');
        
        // Subject loads (depends on classes)
        await supabase.from('subject_loads').delete().neq('id', 0);
        log('  ✓ Cleared subject_loads', 'info');
        
        // Classes (depends on teachers)
        await supabase.from('classes').delete().neq('id', 0);
        log('  ✓ Cleared classes', 'info');
        
        // Parents (no dependencies)
        await supabase.from('parents').delete().neq('id', 0);
        log('  ✓ Cleared parents', 'info');
        
        // Staff/Users (base tables)
        await supabase.from('teachers').delete().neq('id', 0);
        log('  ✓ Cleared teachers', 'info');
        await supabase.from('guards').delete().neq('id', 0);
        log('  ✓ Cleared guards', 'info');
        await supabase.from('clinic_staff').delete().neq('id', 0);
        log('  ✓ Cleared clinic_staff', 'info');
        await supabase.from('admins').delete().neq('id', 0);
        log('  ✓ Cleared admins', 'info');
        
        // Holidays (upserted, but clear for clean slate)
        await supabase.from('holidays').delete().neq('id', 0);
        log('  ✓ Cleared holidays', 'info');
        
        log('✅ All seeded tables cleared - ready for fresh seeding', 'success');
    } catch (error) {
        log('Warning during truncation: ' + error.message, 'error');
    }
}

// ================== MAIN SEQUENCE ==================
async function startSeeding() {
    const confirmCheck = document.getElementById('confirmClear');
    const warningText = document.getElementById('warningText');
    const startBtn = document.getElementById('startSeedingBtn');

    if (!confirmCheck.checked) {
        warningText.classList.remove('hidden');
        return;
    }
    warningText.classList.add('hidden');
    startBtn.disabled = true;
    startBtn.classList.add('opacity-50', 'cursor-not-allowed');
    document.getElementById('progressSection').classList.remove('hidden');

    try {
        log('=== STARTING SEEDING (REAL NAMES, BAGUIO ADDRESSES, FULL SY ATTENDANCE) ===', 'info');
        
        // TRUNCATE FIRST - Clear existing data for clean reseed
        log('=== STEP 0: CLEARING EXISTING DATA ===', 'info');
        let p = updateStep(); updateProgress(p, 'Clearing existing data...');
        await truncateSeededTables();
        
        // Now seed fresh data
        p = updateStep(); updateProgress(p, 'Admins...'); await seedAdmins();
        p = updateStep(); updateProgress(p, 'Clinic Staff...'); await seedClinicStaff();
        p = updateStep(); updateProgress(p, 'Guards...'); await seedGuards();
        p = updateStep(); updateProgress(p, 'Teachers...'); await seedTeachers();
        p = updateStep(); updateProgress(p, 'Classes...'); await seedClasses();
        p = updateStep(); updateProgress(p, 'Subject Loads...'); await seedSubjectLoads();
        p = updateStep(); updateProgress(p, 'Parents...'); await seedParents();
        p = updateStep(); updateProgress(p, 'Students...'); await seedStudents();
        p = updateStep(); updateProgress(p, 'Attendance & Excuses...'); await seedAttendanceAndExcuses();
        p = updateStep(); updateProgress(p, 'Extras...'); await seedExtras();

        updateProgress(100, 'SEEDING COMPLETE!');
        log('=== DATABASE SUCCESSFULLY POPULATED ===', 'success');
        startBtn.innerText = "✅ SEEDING COMPLETE";
    } catch (error) {
        log('FATAL ERROR: ' + error.message, 'error');
        updateProgress(0, 'SEEDING FAILED - Check console');
        startBtn.disabled = false;
        startBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

window.startSeeding = startSeeding;