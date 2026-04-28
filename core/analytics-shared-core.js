// ============================================================================
// analytics-shared-core.js
// Shared Analytics Helper Functions - ALIGNED WITH CORRECTED ATTENDANCE LOGIC
// ============================================================================
// This module provides unified analytics functions that use attendance_daily_summary
// as the source of truth, properly handle excused=present for rates, apply DepEd 20% rule,
// and exclude Kinder afternoon sessions.
// ============================================================================

/**
 * Get total school days between two dates, excluding:
 * - Sundays (day 0)
 * - Holidays (from holidays table with is_suspended=true)
 * - Suspensions (from suspensions table)
 * 
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {string} gradeLevel - Optional grade level for grade-specific suspensions
 * @returns {Promise<number>} Total school days
 */
async function getTotalSchoolDays(startDate, endDate, gradeLevel = null) {
    try {
        // Count weekdays (Mon-Sat, excluding Sunday)
        let count = 0;
        let current = new Date(startDate);
        const end = new Date(endDate);
        
        while (current <= end) {
            const day = current.getDay();
            if (day !== 0) count++; // Exclude Sundays only
            current.setDate(current.getDate() + 1);
        }
        
        // Subtract holidays/suspensions that fall on weekdays
        const { data: holidays } = await supabase
            .from('holidays')
            .select('holiday_date, is_suspended, target_grades')
            .gte('holiday_date', startDate)
            .lte('holiday_date', endDate);
        
        if (holidays?.length) {
            for (const h of holidays) {
                // Subtract full-day suspensions
                if (h.is_suspended === true && h.target_grades === 'All') {
                    count--;
                }
                // Subtract grade-specific suspensions
                else if (h.is_suspended === true && h.target_grades && gradeLevel) {
                    const grades = Array.isArray(h.target_grades) ? h.target_grades : [h.target_grades];
                    if (grades.includes(gradeLevel)) {
                        count--;
                    }
                }
            }
        }
        
        // Subtract suspension entries from suspensions table
        const { data: suspensions } = await supabase
            .from('suspensions')
            .select('start_date, end_date, suspension_type, affected_grades')
            .lte('start_date', endDate)
            .gte('end_date', startDate)
            .eq('is_active', true);
        
        if (suspensions?.length) {
            for (const susp of suspensions) {
                if (susp.suspension_type === 'semestral_break' || 
                    susp.suspension_type === 'suspension') {
                    // For full suspensions, count days in range
                    const sStart = new Date(susp.start_date);
                    const sEnd = new Date(susp.end_date);
                    let tempDate = new Date(sStart > new Date(startDate) ? sStart : new Date(startDate));
                    const tempEnd = new Date(sEnd < new Date(endDate) ? sEnd : new Date(endDate));
                    
                    while (tempDate <= tempEnd) {
                        if (tempDate.getDay() !== 0) count--;
                        tempDate.setDate(tempDate.getDate() + 1);
                    }
                }
            }
        }
        
        return Math.max(1, count);
    } catch (err) {
        console.error('[Analytics] Error calculating school days:', err);
        return countSchoolDaysSimple(startDate, endDate);
    }
}

/**
 * Simple school day counter (Mon-Sat only, no holiday exclusion)
 * Fallback implementation
 */
function countSchoolDaysSimple(startDate, endDate) {
    let count = 0;
    let current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) count++; // Exclude Sun (0) and Sat (6)
        current.setDate(current.getDate() + 1);
    }
    return Math.max(1, count);
}

/**
 * Fetch attendance stats from attendance_daily_summary (source of truth)
 * 
 * @param {number[]} studentIds - Array of student IDs
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @param {string} gradeLevel - Optional grade level for Kinder exclusion
 * @returns {Promise<Object>} Status counts
 */
async function fetchSummaryStats(studentIds, startDate, endDate, gradeLevel = null) {
    const isKinder = gradeLevel?.toLowerCase().includes('kinder');
    
    try {
        // Fetch from summary table (source of truth)
        const { data: summaries, error } = await supabase
            .from('attendance_daily_summary')
            .select('student_id, date, morning_status, afternoon_status')
            .in('student_id', studentIds)
            .gte('date', startDate)
            .lte('date', endDate);
        
        if (error) throw error;
        
        // Fetch excused letters for this period
        const { data: excuses } = await supabase
            .from('excuse_letters')
            .select('student_id, date_absent')
            .eq('status', 'Approved')
            .in('student_id', studentIds)
            .gte('date_absent', startDate)
            .lte('date_absent', endDate);
        
        const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);
        
        const counts = { Present: 0, Late: 0, Absent: 0, Excused: 0, HalfDay: 0 };
        
        summaries?.forEach(summary => {
            const morningStatus = summary.morning_status;
            const afternoonStatus = summary.afternoon_status;
            const isExcused = excusedSet.has(`${summary.student_id}-${summary.date}`);
            
            // Morning calculation
            const morningPresent = ['Present', 'Late', 'Excused'].includes(morningStatus);
            const afternoonPresent = isKinder ? false : ['Present', 'Late', 'Excused'].includes(afternoonStatus);
            
            if (isExcused) {
                counts.Excused++;
                counts.Present += morningPresent ? 1 : 0;
                if (!isKinder && afternoonPresent) counts.Present += 1;
            } else if (morningPresent && afternoonPresent) {
                counts.Present += isKinder ? 1 : 2;
            } else if (morningPresent || afternoonPresent) {
                counts.Present += 1;
                counts.HalfDay++;
            } else {
                counts.Absent++;
            }
        });
        
        return counts;
    } catch (err) {
        console.error('[Analytics] Error fetching summary stats:', err);
        return { Present: 0, Late: 0, Absent: 0, Excused: 0, HalfDay: 0 };
    }
}

/**
 * Fetch critical absences using DepEd 20% rule
 * 
 * @param {number[]} studentIds - Array of student IDs
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @param {string} gradeLevel - Grade level for Kinder check
 * @returns {Promise<Object[]>} Array of critical absence records
 */
async function fetchCriticalAbsences(studentIds, startDate, endDate, gradeLevel = null) {
    const isKinder = gradeLevel?.toLowerCase().includes('kinder');
    
    try {
        // Calculate total school days
        const totalSchoolDays = await getTotalSchoolDays(startDate, endDate, gradeLevel);
        
        // Fetch all summary records
        const { data: summaries } = await supabase
            .from('attendance_daily_summary')
            .select('student_id, date, morning_status, afternoon_status')
            .in('student_id', studentIds)
            .gte('date', startDate)
            .lte('date', endDate);
        
        // Fetch excused
        const { data: excuses } = await supabase
            .from('excuse_letters')
            .select('student_id, date_absent')
            .eq('status', 'Approved')
            .in('student_id', studentIds)
            .gte('date_absent', startDate)
            .lte('date_absent', endDate);
        
        const excusedSet = new Set(excuses?.map(e => `${e.student_id}-${e.date_absent}`) || []);
        
        // Count absences per student
        const absenceData = {};
        studentIds.forEach(id => {
            absenceData[id] = { absent: 0, halfday: 0, totalDays: 0 };
        });
        
        summaries?.forEach(summary => {
            const s = absenceData[summary.student_id];
            if (!s) return;
            
            s.totalDays++;
            const isExcused = excusedSet.has(`${summary.student_id}-${summary.date}`);
            const morningAbsent = !['Present', 'Late', 'Excused'].includes(summary.morning_status);
            const afternoonAbsent = isKinder ? true : !['Present', 'Late', 'Excused'].includes(summary.afternoon_status);
            
            if (isExcused) {
                // Excused doesn't count as absence for critical threshold
            } else if (morningAbsent && afternoonAbsent) {
                s.absent++;
            } else if (morningAbsent || afternoonAbsent) {
                s.halfday++;
            }
        });
        
        // Find critical students using 20% rule
        const criticalStudents = [];
        for (const [studentId, data] of Object.entries(absenceData)) {
            const unexcusedDays = data.absent + (data.halfday * 0.5);
            
            // DEPED RULE: 20% of school days OR 10+ unexcused (whichever triggers first)
            const threshold = Math.max(10, totalSchoolDays * 0.2);
            
            if (unexcusedDays >= threshold) {
                criticalStudents.push({
                    studentId: Number(studentId),
                    absent: data.absent,
                    halfday: data.halfday,
                    adjustedAbsence: unexcusedDays,
                    totalDays: s.totalDays,
                    rate: data.totalDays > 0 ? unexcusedDays / data.totalDays : 0
                });
            }
        }
        
        return criticalStudents.sort((a, b) => b.adjustedAbsence - a.adjustedAbsence);
    } catch (err) {
        console.error('[Analytics] Error fetching critical absences:', err);
        return [];
    }
}

/**
 * Calculate average attendance rate using summary table
 * Counts excused as present per DepEd rules
 * 
 * @param {number[]} studentIds - Array of student IDs
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @param {string} gradeLevel - Optional grade level
 * @returns {Promise<number>} Average attendance rate (0-100)
 */
async function fetchAverageAttendanceRate(studentIds, startDate, endDate, gradeLevel = null) {
    try {
        const counts = await fetchSummaryStats(studentIds, startDate, endDate, gradeLevel);
        
        const totalPresent = counts.Present;
        const totalPossible = (counts.Present + counts.Absent + counts.HalfDay) * (gradeLevel?.toLowerCase().includes('kinder') ? 1 : 2);
        
        if (totalPossible === 0) return 0;
        
        return Math.round((totalPresent / totalPossible) * 100);
    } catch (err) {
        console.error('[Analytics] Error calculating rate:', err);
        return 0;
    }
}

/**
 * Check if student grade is Kinder (afternoon excluded)
 */
function isKinderGrade(gradeLevel) {
    if (!gradeLevel) return false;
    const lower = gradeLevel.toLowerCase();
    return lower.includes('kinder') || lower.includes('nursery');
}

// ============================================================================
// GLOBAL WINDOW ATTACHMENTS
// ============================================================================
window.getTotalSchoolDays = getTotalSchoolDays;
window.fetchSummaryStats = fetchSummaryStats;
window.fetchCriticalAbsences = fetchCriticalAbsences;
window.fetchAverageAttendanceRate = fetchAverageAttendanceRate;
window.countSchoolDaysSimple = countSchoolDaysSimple;
window.isKinderGrade = isKinderGrade;