# Suspension Feature Debug Log

## Date: 2026-03-10

### Problem
The Declare Suspension feature needs to support:
1. Multi-day durations (Start Date to End Date)
2. Half-day suspensions (Full Day, Morning Only, Afternoon Only)
3. Integration with attendance logic via checkSuspensionStatus()

### Root Cause Analysis

**5-7 Possible Sources of Problems:**
1. **Date Loop Logic** - While loop may have off-by-one errors (inclusive vs exclusive end date)
2. **Upsert Conflict Resolution** - The onConflict may not work if holiday_date is not properly indexed  
3. **Date Format Mismatch** - JavaScript date formatting might differ from PostgreSQL format (YYYY-MM-DD)
4. **Weekend Inclusion** - The loop might include weekends when they should potentially be skipped
5. **Coverage Value Mapping** - The time_coverage values need to match the dropdown options exactly
6. **time_coverage Column Missing** - The column was added via ALTER TABLE but may not exist
7. **Bulk Insert Array Format** - Supabase might require different payload format for bulk inserts

**2 Most Likely Sources:**
1. **Date iteration logic** - Need to ensure proper inclusive date handling in while loop
2. **Upsert syntax for Supabase v2** - Need to verify correct onConflict syntax for bulk operations

### Solution

**HTML Patch:**
- Replace single eventDate with Start Date + End Date inputs
- Replace scheduleType select with time_coverage select (Full Day, Morning Only, Afternoon Only)

**JavaScript Patch:**
- Use while loop to iterate from startDate to endDate (inclusive)
- Build array of payload objects for each date
- Use supabase.from('holidays').upsert(payloadArray, { onConflict: 'holiday_date' })

**Utility Function:**
- Create window.checkSuspensionStatus(dateStr) that queries holidays table
- Returns { isSuspended: boolean, coverage: string | null }

### Validation
Add console.log statements to verify:
- Date range calculation
- Payload array construction
- Upsert response
