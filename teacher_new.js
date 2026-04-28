function showNoStudentsMessage() {
    const tbody = document.getElementById('homeroomAttendanceTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-400 italic">No students enrolled in your homeroom.</td></tr>';
}

async function loadPeriodStats(startDate, endDate) {
  if (!studentIdsInHomeroom.length) return;
  
  if (USE_SUMMARY_ANALYTICS) {
    // NEW: Use attendance_daily_summary as source of truth
    const { data: summaries } = await supabase
      .from('attendance_daily_summary')
      .select('student_id, morning_status, afternoon_status')
      .in('student_id', studentIdsInHomeroom)
      .gte('date', startDate)
      .lte('date', endDate);

    // Get grade levels (to skip Kinder afternoon)
    const { data: students } = await supabase.from('students').select('id, class_id').in('id', studentIdsInHomeroom);
    const { data: classes } = await supabase.from('classes').select('id, grade_level');
    const gradeMap = Object.fromEntries(classes?.map(c => [c.id, c.grade_level]) || []);
    const studentGrade = Object.fromEntries(students?.map(s => [s.id, gradeMap[s.class_id]]) || []);

    let present = 0, late = 0, absent = 0, excused = 0, halfDay = 0;
    for (const row of summaries) {
      const isKinder = studentGrade[row.student_id] === 'Kinder';
      // Morning
      processStatus(row.morning_status);
      // Afternoon
      if (!isKinder && row.afternoon_status) processStatus(row.afternoon_status);
    }
    function processStatus(status) {
      if (status === 'Present') present++;
      else if (status === 'Late') { late++; present++; }
      else if (status === 'Excused') { excused++; present++; }
      else if (status === 'Absent') absent++;
      // Half‑day is not directly stored; we can approximate if needed
    }

    // Calculate average attendance rate
    const totalRecords = summaries.length;
    const presentPercent = totalRecords > 0 ? Math.round((present / totalRecords) * 100) : 0;

    const avgEl = document.getElementById('avgAttendanceRate');
    if (avgEl) avgEl.innerText = presentPercent + '%';

    // Render status distribution pie chart
    renderPieChart({
      Present: present,
      Absent: absent,
      Late: late,
      Excused: excused,
      HalfDay: halfDay
    });
  } else {
    // LEGACY: Use attendance_logs (existing implementation)
    const gradeLevel = currentHomeroomClass?.grade_level || '';
    const gradeIsKinder = isKinderGrade(gradeLevel);
    
    const { data: logs, error } = await supabase
        .from('attendance_logs')
        .select('student_id, log_date, status, morning_absent, afternoon_absent')
        .in('student_id', studentIdsInHomeroom)
        .gte('log_date', startDate)
        .lte('log_date', endDate);

    if (error) {
      console.error('Error in loadPeriodStats:', error);
      return;
    }
    
    const { data: holidays } = await supabase
        .from('holidays')
        .select('holiday_date')
        .gte('holiday_date', startDate)
        .lte('holiday_date', endDate);
    
    const holidaySet = new Set(holidays?.map(h => h.holiday_date) || []);
    
    if (!logs?.length) {
      const avgEl = document.getElementById('avgAttendanceRate');
      if (avgEl) avgEl.innerText = '0%';
      renderPieChart({ Present: 0, Absent: 0, Late: 0, Excused: 0, HalfDay: 0 });
      return;
    }

    const { data: excuses } = await supabase
        .from('excuse_letters')
        .select('student_id, date_absent')
        .eq('status', 'Approved')
        .in('student_id', studentIdsInHomeroom)
        .gte('date_absent', startDate)
        .lte('date_absent', endDate);

    const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);

    const counts = { Present: 0, Late: 0, Absent: 0, Excused: 0, HalfDay: 0 };
    
    logs.forEach(log => {
      const morningAbsent = log.morning_absent || false;
      const afternoonAbsent = log.afternoon_absent || false;
      const isFullDayAbsent = morningAbsent && afternoonAbsent;
      const isHalfDay = (morningAbsent !== afternoonAbsent && !isFullDayAbsent) || log.status === 'Half Day';
      
      const isExcused = excusedSet.has(`${log.student_id}-${log.log_date}`);
      
      if (isExcused) {
        counts.Excused++;
        counts.Present++;
        if (!gradeIsKinder) counts.Present++; // PM also counts if not Kinder
      } else if (isHalfDay) {
        counts.HalfDay++;
        counts.Present += 0.5;
      } else if (isFullDayAbsent) {
        counts.Absent++;
      } else if (log.status === 'Present' || log.status === 'On Time') {
        counts.Present++;
        if (!gradeIsKinder) counts.Present++;
      } else if (log.status === 'Late') {
        counts.Late++;
        counts.Present++;
        if (!gradeIsKinder) counts.Present++;
      } else if (log.status === 'Absent') {
        counts.Absent++;
      } else {
        counts.Present++;
        if (!gradeIsKinder) counts.Present++;
      }
    });

    const schoolDays = countSchoolDays(startDate, endDate);
    const holidayCount = holidaySet.size;
    const actualSchoolDays = Math.max(1, schoolDays - holidayCount);
    
    const halfSessions = gradeIsKinder ? 1 : 2;
    const totalPresentFraction = counts.Present;
    const totalPossible = actualSchoolDays * studentIdsInHomeroom.length * halfSessions;
    const presentPercent = Math.round((totalPresentFraction / totalPossible) * 100);
    
    const avgEl = document.getElementById('avgAttendanceRate');
    if (avgEl) avgEl.innerText = presentPercent + '%';
    
    const displayPresent = counts.Present - (counts.HalfDay * 0.5);
    renderPieChart({
        Present: Math.round(displayPresent),
        Absent: counts.Absent,
        Late: counts.Late,
        Excused: counts.Excused,
        HalfDay: counts.HalfDay
    });
  }
}

// Legacy fallback - kept for compatibility
async function loadPeriodStatsLegacy(startDate, endDate) {
