// School Year Configuration Helper
// Provides global access to admin-configurable school year dates
// Uses existing 'settings' table for persistence

// DEFAULT SCHOOL YEAR DATES: 2025-2026 (Aug 11, 2025 - Apr 28, 2026)
// UPDATED: 2026-04-20 - User confirmed default dates
const DEFAULT_SCHOOL_YEAR_START = '2025-08-11';
const DEFAULT_SCHOOL_YEAR_END = '2026-04-28';

function getDefaultSchoolYearStart() {
    return DEFAULT_SCHOOL_YEAR_START;
}

function getDefaultSchoolYearEnd() {
    return DEFAULT_SCHOOL_YEAR_END;
}

let cachedSchoolYearStart = null;
let cachedSchoolYearEnd = null;
let cacheLoaded = false;

async function getSchoolYearStart() {
    if (!cacheLoaded) {
        await loadSchoolYearCache();
    }
    return cachedSchoolYearStart || getDefaultSchoolYearStart();
}

async function getSchoolYearEnd() {
    if (!cacheLoaded) {
        await loadSchoolYearCache();
    }
    return cachedSchoolYearEnd || getDefaultSchoolYearEnd();
}

async function loadSchoolYearCache() {
    try {
        if (typeof supabase === 'undefined') {
            console.warn('[SchoolYear] Supabase not loaded, using defaults');
            cacheLoaded = true;
            return;
        }
        
        const { data, error } = await supabase
            .from('settings')
            .select('setting_key, setting_value')
            .in('setting_key', ['school_year_start', 'school_year_end']);
        
        if (error) {
            console.warn('[SchoolYear] Failed to load settings:', error.message);
            cacheLoaded = true;
            return;
        }
        
        if (data) {
            data.forEach(item => {
                if (item.setting_key === 'school_year_start') {
                    cachedSchoolYearStart = item.setting_value;
                } else if (item.setting_key === 'school_year_end') {
                    cachedSchoolYearEnd = item.setting_value;
                }
            });
        }
        
        if (!cachedSchoolYearStart || !cachedSchoolYearEnd) {
            console.warn('[SchoolYear] No dates configured, using defaults: Aug 11 - Apr 28');
        }
        
        cacheLoaded = true;
    } catch (e) {
        console.warn('[SchoolYear] Error loading school year settings:', e.message);
        cacheLoaded = true;
    }
}

async function setSchoolYearDates(startDate, endDate) {
    if (typeof supabase === 'undefined') {
        throw new Error('Supabase not loaded');
    }
    
    const startObj = new Date(startDate);
    const endObj = new Date(endDate);
    
    if (isNaN(startObj.getTime()) || isNaN(endObj.getTime())) {
        throw new Error('Invalid dates');
    }
    
    if (endObj <= startObj) {
        throw new Error('End date must be after start date');
    }
    
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    if (startObj < twoYearsAgo) {
        console.warn('[SchoolYear] Warning: Start date is more than 2 years in the past');
    }
    
    const { error: error1 } = await supabase
        .from('settings')
        .upsert({ setting_key: 'school_year_start', setting_value: startDate }, { onConflict: 'setting_key' });
    
    if (error1) throw error1;
    
    const { error: error2 } = await supabase
        .from('settings')
        .upsert({ setting_key: 'school_year_end', setting_value: endDate }, { onConflict: 'setting_key' });
    
    if (error2) throw error2;
    
    cachedSchoolYearStart = startDate;
    cachedSchoolYearEnd = endDate;
    
    console.log(`[SchoolYear] Dates saved: ${startDate} to ${endDate}`);
    return true;
}

async function getQuarters() {
    const start = await getSchoolYearStart();
    const end = await getSchoolYearEnd();
    
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    const startMonth = startDate.getMonth();
    const startYear = startDate.getFullYear();
    const endMonth = endDate.getMonth();
    const endYear = endDate.getFullYear();
    
    const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
    const quarterLength = Math.ceil(totalMonths / 3);
    
    const quarters = [];
    
    let q1Start = new Date(startDate);
    let q1End = new Date(startDate);
    q1End.setMonth(q1End.getMonth() + quarterLength - 1);
    q1End.setDate(0);
    quarters.push({ name: 'Q1', start: q1Start.toISOString().split('T')[0], end: q1End.toISOString().split('T')[0] });
    
    let q2Start = new Date(q1End);
    q2Start.setDate(q2Start.getDate() + 1);
    let q2End = new Date(q2Start);
    q2End.setMonth(q2End.getMonth() + quarterLength - 1);
    q2End.setDate(0);
    quarters.push({ name: 'Q2', start: q2Start.toISOString().split('T')[0], end: q2End.toISOString().split('T')[0] });
    
    let q3Start = new Date(q2End);
    q3Start.setDate(q3Start.getDate() + 1);
    quarters.push({ name: 'Q3', start: q3Start.toISOString().split('T')[0], end: endDate.toISOString().split('T')[0] });
    
    return quarters;
}

function calculateQuarter(logDate, quarters) {
    const date = new Date(logDate);
    for (const q of quarters) {
        const qStart = new Date(q.start);
        const qEnd = new Date(q.end);
        if (date >= qStart && date <= qEnd) {
            return q.name;
        }
    }
    return 'Q3';
}

function getMonthLabel(monthStr, startMonth = 7) {
    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = parseInt(monthStr);
    if (month >= 8 && month <= 12) return monthNames[month];
    if (month >= 1 && month <= 4) return monthNames[month];
    return monthNames[month];
}

async function getSchoolYearMonthOptions() {
    const start = await getSchoolYearStart();
    const end = await getSchoolYearEnd();
    
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    const options = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
        const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = getMonthLabel(String(current.getMonth() + 1));
        options.push({ value: monthKey, label: `${monthLabel} ${current.getFullYear()}` });
        current.setMonth(current.getMonth() + 1);
    }
    
    return options;
}

function invalidateSchoolYearCache() {
    cachedSchoolYearStart = null;
    cachedSchoolYearEnd = null;
    cacheLoaded = false;
}

async function getSchoolYearLabel() {
    const start = await getSchoolYearStart();
    const end = await getSchoolYearEnd();
    const startYear = new Date(start).getFullYear();
    const endYear = new Date(end).getFullYear();
    return `${startYear}-${endYear}`;
}

// ============================================================================
// SCHOOL YEAR DATE VALIDATION - ADDED: 2026-04-20
// Validates if dates are within configured school year
// ============================================================================

/**
 * Check if a date is within the configured school year
 * @param {string|Date} date - Date to check (YYYY-MM-DD or Date object)
 * @returns {Promise<{valid: boolean, message: string}>}
 */
async function isDateWithinSchoolYear(date) {
    try {
        const schoolYearStart = await getSchoolYearStart();
        const schoolYearEnd = await getSchoolYearEnd();
        
        let dateStr;
        if (date instanceof Date) {
            dateStr = date.toISOString().split('T')[0];
        } else {
            dateStr = date;
        }
        
        if (dateStr < schoolYearStart) {
            return { 
                valid: false, 
                message: `Date ${dateStr} is before school year start (${schoolYearStart})` 
            };
        }
        
        if (dateStr > schoolYearEnd) {
            return { 
                valid: false, 
                message: `Date ${dateStr} is after school year end (${schoolYearEnd})` 
            };
        }
        
        return { valid: true, message: 'Date is within school year' };
    } catch (err) {
        console.error('[SchoolYear] Error validating date:', err);
        // Allow by default if validation fails
        return { valid: true, message: 'Validation failed, allowing' };
    }
}

/**
 * Check if today is within school year
 * @returns {Promise<{valid: boolean, message: string}>}
 */
async function isTodayWithinSchoolYear() {
    const today = new Date().toISOString().split('T')[0];
    return isDateWithinSchoolYear(today);
}

/**
 * Get school year validation error for display
 * @returns {Promise<string|null>} Error message or null if valid
 */
async function getSchoolYearValidationError() {
    const check = await isTodayWithinSchoolYear();
    return check.valid ? null : check.message;
}

// ============================================================================
// EXPORTS
// ============================================================================

window.getSchoolYearStart = getSchoolYearStart;
window.getSchoolYearEnd = getSchoolYearEnd;
window.getQuarters = getQuarters;
window.setSchoolYearDates = setSchoolYearDates;
window.getDefaultSchoolYearStart = getDefaultSchoolYearStart;
window.getDefaultSchoolYearEnd = getDefaultSchoolYearEnd;
window.getSchoolYearMonthOptions = getSchoolYearMonthOptions;
window.calculateQuarter = calculateQuarter;
window.invalidateSchoolYearCache = invalidateSchoolYearCache;
window.getSchoolYearLabel = getSchoolYearLabel;
window.isDateWithinSchoolYear = isDateWithinSchoolYear;
window.isTodayWithinSchoolYear = isTodayWithinSchoolYear;
window.getSchoolYearValidationError = getSchoolYearValidationError;