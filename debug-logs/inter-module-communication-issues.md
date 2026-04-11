# DEBUG LOG: Inter-Module Communication Issues
## Date: 2026-04-09

## PROBLEM SUMMARY
Systematic review of all 5 EDUCARE modules (Admin, Teacher, Parent, Guard, Clinic) reveals multiple issues in data communication between modules.

---

## ISSUE #1: Guard Module - Wrong Column Reference for Teacher Notification
**File:** `guard/guard-core.js`  
**Line:** 617

**What is the problem:**
The `notifyTeacher` function queries `classes.teacher_id` but the correct column name in the schema is `adviser_id`.

```javascript
// CURRENT (BROKEN):
const { data: classData } = await supabase.from('classes').select('teacher_id').eq('id', student.class_id).maybeSingle();

// SHOULD BE:
const { data: classData } = await supabase.from('classes').select('adviser_id').eq('id', student.class_id).maybeSingle();
```

**What cause it:**
Database schema uses `adviser_id` in the `classes` table to reference the homeroom teacher, not `teacher_id`.

**What is the solution:**
Replace `teacher_id` with `adviser_id` in the query at line 617, and ensure the notification uses the correct teacher ID.

---

## ISSUE #2: General Core - Duplicate Function Definition
**File:** `core/general-core.js`  
**Lines:** 129-142 AND 206-230

**What is the problem:**
The function `getLateThreshold` is defined TWICE in the same file, which causes the second definition to overwrite the first. Both definitions have slightly different logic:
- First definition (line 129-142): Uses grade_schedules cache
- Second definition (line 206-230): Uses settings table

**What cause it:**
Code was likely added during development with conflicting approaches and neither was cleaned up.

**What is the solution:**
Remove the duplicate (lines 206-230), keeping the first definition that uses the grade_schedules table which is the correct approach per school requirements.

---

## ISSUE #3: Admin Dashboard - Outdated Holiday Check
**File:** `admin/admin-core.js`  
**Function:** `loadDashboardStats`

**What is the problem:**
Uses `holidays` table for suspension checks but the system now has both `holidays` and `suspensions` tables per schema.

```javascript
// Current query only checks holidays:
supabase.from('clinic_visits').select('*').eq('status', 'In Clinic')
```

**What cause it:**
The dashboard stats should properly filter "students currently in clinic" by checking time_in today, not relying on status alone.

**What is the solution:**
Ensure the query correctly filters for today's active clinic visits:
```javascript
supabase.from('clinic_visits')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'In Clinic')
  .gte('time_in', todayStart)  // Ensure time is today
```

---

## ISSUE #4: Teacher Module - Missing Homeroom Class Join
**File:** `teacher/teacher-core.js`  
**Function:** `loadDashboardHomeroomData`

**What is the problem:**
Queries homeroom via `adviser_id` but doesn't verify teacher has class_id association properly.

```javascript
// Only checks adviser_id:
const { data: homeroom } = await supabase
  .from('classes')
  .select('id')
  .eq('adviser_id', currentUser.id)
  .single();
```

**What cause it:**
No fallback or error handling if teacher is not assigned as adviser.

**What is the solution:**
Add proper status display showing "Subject Teacher" vs "Homeroom Adviser" based on whether adviser_id exists.

---

## ISSUE #5: Parent Module - Multi-Child Real-time Sync Gap
**File:** `parent/parent-core.js`  
**Function:** `setupRealtimeSubscriptions`

**What is the problem:**
When switching between children, the realtime subscription channel is recreated but old channel isn't properly cleaned up:
```javascript
// Line 127: if (realtimeChannel) supabase.removeChannel(realtimeChannel);
// This is correct, but check if channel exists first
```

**What cause it:**
Memory leak potential if cleanup fails silently.

**What is the solution:**
Add validation to ensure channel is valid before removal.

---

## ISSUE #6: Teacher -> Clinic Communication Gap
**Files:** `teacher/teacher-core.js` and `clinic/clinic-core.js`

**What is the problem:**
Teacher issues clinic pass, but the flow has gaps:
1. Teacher creates `clinic_visits` with `status = 'Pending'`
2. Clinic approves and changes to `'Approved'`
3. Teacher should receive notification but may not have proper handler

**Communication Flow:**
- Teacher: `issueClinicPass()` → inserts with 'Pending' status
- Clinic: `approveClinicPass()` → updates to 'Approved'
- Teacher: NO HANDLER for approval notification

**What cause it:**
Missing notification handler in teacher module for clinic pass approval.

**What is the solution:**
Add listener in teacher module for `clinic_approval_result` notification type to update UI.

---

## ISSUE #7: Clinic -> Teacher "Sent Home" Approval Missing
**File:** `clinic/clinic-core.js`  
**Function:** `addClinicFindings`

**What is the problem:**
The "Sent Home" workflow requires teacher approval but:
1. Clinic notifies teacher via `notifyTeacherForApproval()`
2. Teacher has NO UI to approve/disapprove the sent home request

**What cause it:**
Teacher module doesn't have a page/handler for clinic approval requests.

**What is the solution:**
Either:
a) Add clinic approval UI to teacher dashboard, OR
b) Make "Sent Home" auto-approved without teacher approval (simpler)

---

## ISSUE #8: Excuse Letter Status Not Reflected in Attendance
**File:** Multiple files  

**What is the problem:**
When teacher approves excuse letter, attendance is NOT automatically updated:
```javascript
// In teacher-core.js approveExcuseLetter():
const { error } = await supabase
  .from('excuse_letters')
  .update({ status: 'Approved', updated_at: new Date().toISOString() })
  .eq('id', letterId);
// MISSING: Does NOT update attendance_logs status!
```

**What cause it:**
Approval only updates excuse_letters table, doesn't mark student as excused for that date.

**What is the solution:**
After approval, insert/update attendance_log:
```javascript
await supabase.from('attendance_logs').upsert({
  student_id: letter.student_id,
  log_date: letter.date_absent,
  status: 'Excused',
  remarks: 'Excused via approved letter'
});
```

---

## ISSUE #9: Guard -> Teacher Late/Early Exit Notification
**File:** `guard/guard-core.js`  
**Function:** `notifyTeacher`

**What is the problem:**
Notifications sent to teacher but:
1. Uses `classData.adviser_id` but queries for `teacher_id`
2. No verification teacher exists before inserting notification

```javascript
// Line 626 - No null check
await supabase.from('notifications').insert({ 
  recipient_id: classData.teacher_id, // Wrong column
  recipient_role: 'teacher', 
  title, message, type:'attendance_alert' 
});
```

**What cause it:**
References wrong column AND doesn't handle missing teacher gracefully.

**What is the solution:**
```javascript
if (classData?.adviser_id) {
  await supabase.from('notifications').insert({ 
    recipient_id: classData.adviser_id,
    recipient_role: 'teacher', 
    title, message, type:'attendance_alert' 
  });
}
```

---

## ISSUE #10: Admin -> Class Management (Not Implemented)
**Status:** Feature not implemented per documentation

**What is the problem:**
Class management page does not exist in current codebase, which breaks:
- Subject teacher assignment
- Class attendance linking

**What is the solution:**
Priority implementation needed - this is central to the attendance system.

---

## SUMMARY OF ISSUES BY SEVERITY

| Priority | Issue | Files Affected |
|----------|-------|--------------|
| HIGH | #1 Wrong column reference | guard-core.js |
| HIGH | #8 Excuse letter attendance | teacher-core.js |
| HIGH | #10 Class management missing | admin folder |
| MEDIUM | #2 Duplicate function | general-core.js |
| MEDIUM | #5 Real-time cleanup | parent-core.js |
| MEDIUM | #7 Sent home approval | clinic-core.js / teacher-core.js |
| LOW | #3 Holiday vs suspension | admin-core.js |
| LOW | #4 Homeroom display | teacher-core.js |
| LOW | #6 Clinic notification | teacher-core.js |
| LOW | #9 Teacher notif null check | guard-core.js |

---

## NEXT STEPS

1. Fix HIGH priority issues first (Guard column, Excuse letters, Class management)
2. Verify each module can see data from other modules
3. Test end-to-end flows (e.g., Teacher creates excuse → Admin sees it → Parent notified)