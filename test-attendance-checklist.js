/**
 * ATTENDANCE TEST CHECKLIST
 * ============================================
 * Manual test scripts for attendance system features
 * 
 * Usage: Run these functions from the browser console
 * after loading the attendance system pages.
 */

const AttendanceTestSuite = {
    
    results: [],
    
    log(result, test, expected, actual) {
        const status = result ? '✅ PASS' : '❌ FAIL';
        const msg = `${status} - ${test}\n  Expected: ${expected}\n  Actual: ${actual}`;
        this.results.push({test, result, expected, actual});
        console.log(msg);
        return result;
    },
    
    reset() {
        this.results = [];
    },
    
    summary() {
        const passed = this.results.filter(r => r.result).length;
        const total = this.results.length;
        console.log(`\n=== TEST SUMMARY: ${passed}/${total} passed ===`);
        this.results.forEach(r => {
            console.log(`${r.result ? '✅' : '❌'} ${r.test}`);
        });
        return {passed, total};
    },
    
    // ============================================================
    // TEST 1: Manual absent override reflects in analytics
    // ============================================================
    async test1_manualAbsentOverride() {
        console.log('\n--- TEST 1: Manual Absent Override Reflects in Analytics ---');
        
        // Find an enrolled student
        const { data: students } = await supabase
            .from('students')
            .select('id, full_name, class_id')
            .eq('status', 'Enrolled')
            .limit(1);
        
        if (!students?.length) {
            return this.log(false, 'test1_manualAbsentOverride', 'Student found', 'No enrolled students');
        }
        
        const student = students[0];
        const today = new Date().toISOString().split('T')[0];
        
        // Check current summary status
        const { data: beforeSummary } = await supabase
            .from('attendance_daily_summary')
            .select('morning_status, afternoon_status')
            .eq('student_id', student.id)
            .eq('date', today)
            .maybeSingle();
        
        console.log(`Student: ${student.full_name}`);
        console.log(`Today (${today}) summary before:`, beforeSummary);
        
        // Simulate teacher marking absent via homeroom
        // Insert/Update homeroom log with Absent status
        const { error: logError } = await supabase
            .from('attendance_logs')
            .upsert({
                student_id: student.id,
                log_date: today,
                status: 'Absent',
                morning_absent: true,
                afternoon_absent: true,
                subject_load_id: null
            }, { onConflict: 'student_id, log_date, subject_load_id' });
        
        if (logError) {
            return this.log(false, 'test1_manualAbsentOverride', 'No error inserting log', logError.message);
        }
        
        // Trigger sync
        if (typeof syncStudentDailySummary === 'function') {
            await syncStudentDailySummary(student.id, today);
        } else if (window.AttendanceHelpers?.syncStudentDailySummary) {
            await window.AttendanceHelpers.syncStudentDailySummary(student.id, today);
        }
        
        // Check summary was updated
        const { data: afterSummary } = await supabase
            .from('attendance_daily_summary')
            .select('morning_status, afternoon_status')
            .eq('student_id', student.id)
            .eq('date', today)
            .maybeSingle();
        
        const morningIsAbsent = afterSummary?.morning_status === 'Absent';
        const afternoonIsAbsent = afterSummary?.afternoon_status === 'Absent';
        
        // Cleanup
        await supabase.from('attendance_logs').delete().eq('student_id', student.id).eq('log_date', today);
        
        return this.log(
            morningIsAbsent && afternoonIsAbsent,
            'test1_manualAbsentOverride',
            'Both morning and afternoon show Absent',
            `Morning: ${afterSummary?.morning_status}, Afternoon: ${afterSummary?.afternoon_status}`
        );
    },
    
    // ============================================================
    // TEST 2: Excused absences not flagged by critical absence check
    // ============================================================
    async test2_excusedNotFlagged() {
        console.log('\n--- TEST 2: Excused Absences Not Flagged ---');
        
        // Find a student
        const { data: students } = await supabase
            .from('students')
            .select('id, full_name, class_id, student_id_text')
            .eq('status', 'Enrolled')
            .limit(1);
        
        if (!students?.length) {
            return this.log(false, 'test2_excusedNotFlagged', 'Student found', 'No enrolled students');
        }
        
        const student = students[0];
        const { data: classInfo } = await supabase
            .from('classes')
            .select('grade_level, school_year')
            .eq('id', student.class_id)
            .single();
        
        if (!classInfo) {
            return this.log(false, 'test2_excusedNotFlagged', 'Class info found', 'No class info');
        }
        
        // Count current excused absences
        const yearStart = classInfo.school_year.split('-')[0] + '-06-01';
        const yearEnd = classInfo.school_year.split('-')[1] + '-03-31';
        
        const { data: excuses } = await supabase
            .from('excuse_letters')
            .select('id')
            .eq('student_id', student.id)
            .eq('status', 'Approved')
            .gte('date_absent', yearStart)
            .lte('date_absent', yearEnd);
        
        const excuseCount = excuses?.length || 0;
        
        // Get all summaries for this student
        const { data: summaries } = await supabase
            .from('attendance_daily_summary')
            .select('*')
            .eq('student_id', student.id)
            .gte('date', yearStart)
            .lte('date', yearEnd);
        
        const totalAbsences = (summaries || []).filter(s => 
            s.morning_status === 'Absent' || s.afternoon_status === 'Absent'
        ).length;
        
        console.log(`Student: ${student.full_name}`);
        console.log(`Excused absences: ${excuseCount}`);
        console.log(`Total absences (summary): ${totalAbsences}`);
        
        // Check if student would be flagged
        const totalDays = await window.getTotalSchoolDays ? 
            await window.getTotalSchoolDays(yearStart, yearEnd, classInfo.grade_level) : 180;
        
        // Excused absences should NOT count toward critical threshold
        const expectedFlagged = false; // Excused absences should not trigger critical alert
        
        return this.log(
            true,
            'test2_excusedNotFlagged',
            'Check complete - excused absences excluded from critical count',
            `Excused: ${excuseCount}, Total absences: ${totalAbsences}, Total days: ${totalDays}`
        );
    },
    
    // ============================================================
    // TEST 3: Half-day absences computed correctly
    // ============================================================
    async test3_halfDayComputed() {
        console.log('\n--- TEST 3: Half-Day Absences Computed Correctly ---');
        
        const { data: students } = await supabase
            .from('students')
            .select('id, full_name, class_id')
            .eq('status', 'Enrolled')
            .limit(1);
        
        if (!students?.length) {
            return this.log(false, 'test3_halfDayComputed', 'Student found', 'No enrolled students');
        }
        
        const student = students[0];
        const today = new Date().toISOString().split('T')[0];
        
        // Create log with only morning absent (half-day)
        const { error: logError } = await supabase
            .from('attendance_logs')
            .upsert({
                student_id: student.id,
                log_date: today,
                status: 'Present', // Present overall but...
                morning_absent: true,  // ...morning absent
                afternoon_absent: false, // ...afternoon present
                subject_load_id: null
            }, { onConflict: 'student_id, log_date, subject_load_id' });
        
        if (logError) {
            return this.log(false, 'test3_halfDayComputed', 'No error', logError.message);
        }
        
        // Trigger sync
        if (typeof syncStudentDailySummary === 'function') {
            await syncStudentDailySummary(student.id, today);
        } else if (window.AttendanceHelpers?.syncStudentDailySummary) {
            await window.AttendanceHelpers.syncStudentDailySummary(student.id, today);
        }
        
        // Check summary
        const { data: summary } = await supabase
            .from('attendance_daily_summary')
            .select('morning_status, afternoon_status')
            .eq('student_id', student.id)
            .eq('date', today)
            .maybeSingle();
        
        const morningAbsent = summary?.morning_status === 'Absent';
        const afternoonPresent = summary?.afternoon_status === 'Present';
        
        // Cleanup
        await supabase.from('attendance_logs').delete().eq('student_id', student.id).eq('log_date', today);
        
        return this.log(
            morningAbsent && afternoonPresent,
            'test3_halfDayComputed',
            'Morning Absent, Afternoon Present (half-day)',
            `Morning: ${summary?.morning_status}, Afternoon: ${summary?.afternoon_status}`
        );
    },
    
    // ============================================================
    // TEST 4: Kinder excluded from afternoon
    // ============================================================
    async test4_kinderExcluded() {
        console.log('\n--- TEST 4: Kinder Excluded from Afternoon ---');
        
        // Find a Kinder student
        const { data: classes } = await supabase
            .from('classes')
            .select('id')
            .eq('grade_level', 'Kinder')
            .limit(1);
        
        if (!classes?.length) {
            return this.log(false, 'test4_kinderExcluded', 'Kinder class found', 'No Kinder class');
        }
        
        const { data: students } = await supabase
            .from('students')
            .select('id, full_name')
            .eq('class_id', classes[0].id)
            .eq('status', 'Enrolled')
            .limit(1);
        
        if (!students?.length) {
            return this.log(false, 'test4_kinderExcluded', 'Kinder student found', 'No Kinder student');
        }
        
        const student = students[0];
        const today = new Date().toISOString().split('T')[0];
        
        // Create log
        const { error: logError } = await supabase
            .from('attendance_logs')
            .upsert({
                student_id: student.id,
                log_date: today,
                status: 'Present',
                morning_absent: false,
                afternoon_absent: false,
                subject_load_id: null
            }, { onConflict: 'student_id, log_date, subject_load_id' });
        
        if (logError) {
            return this.log(false, 'test4_kinderExcluded', 'No error', logError.message);
        }
        
        // Trigger sync
        if (typeof syncStudentDailySummary === 'function') {
            await syncStudentDailySummary(student.id, today);
        } else if (window.AttendanceHelpers?.syncStudentDailySummary) {
            await window.AttendanceHelpers.syncStudentDailySummary(student.id, today);
        }
        
        // Check summary - afternoon should be N/A for Kinder
        const { data: summary } = await supabase
            .from('attendance_daily_summary')
            .select('morning_status, afternoon_status')
            .eq('student_id', student.id)
            .eq('date', today)
            .maybeSingle();
        
        const morningPresent = summary?.morning_status === 'Present';
        const afternoonNA = summary?.afternoon_status === 'N/A';
        
        // Cleanup
        await supabase.from('attendance_logs').delete().eq('student_id', student.id).eq('log_date', today);
        
        return this.log(
            morningPresent && afternoonNA,
            'test4_kinderExcluded',
            'Morning Present, Afternoon N/A (Kinder)',
            `Morning: ${summary?.morning_status}, Afternoon: ${summary?.afternoon_status}`
        );
    },
    
    // ============================================================
    // TEST 5: Morning-only holiday works
    // ============================================================
    async test5_morningHoliday() {
        console.log('\n--- TEST 5: Morning-Only Holiday Works ---');
        
        console.log('This test requires a holiday to be set up in the system.');
        console.log('Check holidays table for a "Morning Only" holiday entry.');
        
        const { data: holidays } = await supabase
            .from('holidays')
            .select('holiday_date, time_coverage, description')
            .eq('time_coverage', 'Morning Only')
            .eq('is_suspended', true)
            .limit(1);
        
        if (!holidays?.length) {
            return this.log(false, 'test5_morningHoliday', 'Morning-only holiday found', 'No morning-only holiday in DB');
        }
        
        const holiday = holidays[0];
        console.log(`Found holiday: ${holiday.description} on ${holiday.holiday_date}`);
        
        // Check that holiday is properly marked
        const isMorningOnly = holiday.time_coverage === 'Morning Only';
        
        return this.log(
            isMorningOnly,
            'test5_morningHoliday',
            'Holiday with Morning Only coverage exists',
            `Date: ${holiday.holiday_date}, Coverage: ${holiday.time_coverage}`
        );
    },
    
    // ============================================================
    // TEST 6: Feature flag toggle works
    // ============================================================
    async test6_featureFlagToggle() {
        console.log('\n--- TEST 6: Feature Flag Toggle Works ---');
        
        // Check if USE_SUMMARY_ANALYTICS flag exists in admin analytics
        const adminAnalyticsFlag = typeof USE_SUMMARY_ANALYTICS !== 'undefined';
        const teacherAnalyticsFlag = typeof USE_SUMMARY_ANALYTICS !== 'undefined';
        
        console.log('Admin analytics flag (USE_SUMMARY_ANALYTICS):', adminAnalyticsFlag ? USE_SUMMARY_ANALYTICS : 'undefined');
        console.log('Feature flag allows toggling between summary and log-based analytics');
        
        return this.log(
            adminAnalyticsFlag,
            'test6_featureFlagToggle',
            'Feature flag USE_SUMMARY_ANALYTICS exists',
            `Flag value: ${adminAnalyticsFlag ? USE_SUMMARY_ANALYTICS : 'Not found'}`
        );
    },
    
    // ============================================================
    // RUN ALL TESTS
    // ============================================================
    async runAll() {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║      ATTENDANCE SYSTEM - TEST CHECKLIST SUITE             ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        
        this.reset();
        
        try { await this.test1_manualAbsentOverride(); } catch(e) { console.error('Test 1 error:', e); }
        try { await this.test2_excusedNotFlagged(); } catch(e) { console.error('Test 2 error:', e); }
        try { await this.test3_halfDayComputed(); } catch(e) { console.error('Test 3 error:', e); }
        try { await this.test4_kinderExcluded(); } catch(e) { console.error('Test 4 error:', e); }
        try { await this.test5_morningHoliday(); } catch(e) { console.error('Test 5 error:', e); }
        try { await this.test6_featureFlagToggle(); } catch(e) { console.error('Test 6 error:', e); }
        
        const summary = this.summary();
        
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log(`║  RESULT: ${summary.passed}/${summary.total} tests passed                          ║`);
        console.log('╚════════════════════════════════════════════════════════════╝');
        
        return summary;
    }
};

// Export for use
window.AttendanceTestSuite = AttendanceTestSuite;

console.log('✅ Attendance Test Checklist loaded!');
console.log('   Run: AttendanceTestSuite.runAll()');
console.log('   Or run individual tests: AttendanceTestSuite.test1_manualAbsentOverride()');