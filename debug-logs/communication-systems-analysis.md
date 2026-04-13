# Debug Log: Inter-Module Communication Systems Analysis

**Date:** 2026-04-12

---

## Executive Summary

This document analyzes the communication pathways between all user roles in the Educare system:
- **Admin → Teacher**
- **Teacher → Parent**
- **Clinic → Parent/Teacher**
- **Guard → Teacher/Parent**

The system uses a unified `notifications` table for all inter-role communications, supplemented by the `announcements` table for broadcast messages.

---

## 1. Database Schema

### 1.1 Notifications Table
```
notifications (
  id, recipient_id, recipient_role, title, message, type,
  is_read, created_at, is_urgent, scheduled_at, sender_id, batch_id
)
```

**Key Fields:**
- `recipient_role`: 'teachers', 'parents', 'admins', 'clinic_staff', 'guards'
- `type`: 'attendance_alert', 'clinic_approval_required', 'absence_warning', 'emergency', etc.

### 1.2 Announcements Table
```
announcements (
  id, title, content, type, priority, target_teachers, target_parents,
  target_clinic, target_guards, posted_by_admin_id, scheduled_at, created_at
)
```

---

## 2. Communication Pathways

### 2.1 Admin → Teacher Communications

| Pathway | Mechanism | Files |
|---------|------------|-------|
| **Broadcast Announcements** | `announcements` table with `target_teachers=true` | `admin-announcements.js` (lines 263-292) |
| **Attendance Alerts** | Not directly - uses teacher notification views | - |
| **Teacher Notifications** | Teacher views own notification center | `teacher-core.js` |

**How it works:**
1. Admin creates announcement in `admin-announcements.html`
2. Selects "TEACHERS" target audience (checkbox)
3. Announcement saved to `announcements` table
4. Teachers see it in `teacher-announcements-board.html` (filters by `target_teachers=true`)

**Implementation Details (admin-announcements.js:263-292):**
```javascript
const payload = {
    title: annTitle,
    content: annContent,
    type: annType,
    target_teachers: targetTeachers,  // Boolean
    // ... other fields
};
```

**Teacher Side (teacher-core.js:682-687):**
```javascript
const { data } = await supabase
    .from('announcements')
    .select('*')
    .eq('target_teachers', true)
    .order('created_at', { ascending: false });
```

---

### 2.2 Teacher → Parent Communications

| Pathway | Mechanism | Files |
|---------|------------|-------|
| **Attendance Alerts** | `notifications` table | `teacher-homeroom.js`, `notification-engine.js` |
| **Subject Attendance Alerts** | `notifications` table | `teacher-subject-attendance.js:160-165` |
| **Absence Warning (DepEd)** | `notifications` table | `teacher-subject-attendance-table.js:178` |
| **Clinic Guard Pass** | `notifications` table | `teacher-guard-pass.js` |
| **Excuse Letter Status** | Handled by approval workflow | `teacher-excuse-letter-approval.js` |

**Implementation Details:**

**A. Homeroom Attendance (teacher-homeroom.js:173-196):**
```javascript
async function notifyParentOfAbsence(studentId, date, status) {
    // Creates notification for parent when student is Late or Absent
    await supabase.from('notifications').insert({
        recipient_id: student.parent_id,
        recipient_role: 'parent',
        title: `Attendance Alert: ${status}`,
        message: `Your child ${student.full_name} was marked ${status} on ${date}.`,
        type: 'attendance_alert'
    });
}
```

**B. Subject Attendance (teacher-subject-attendance.js:160-165):**
```javascript
// Notifies parent when student is marked late/absent in a specific subject
await supabase.from('notifications').insert({
    recipient_id: student.parent_id,
    recipient_role: 'parent',
    title: `Subject Alert: ${status} in ${currentSubjectName}`,
    message: `Your child ${student.full_name} was marked ${status} in ${currentSubjectName} on ${selectedDate}.`,
    type: 'attendance_alert'
});
```

**C. High Absence Warning (teacher-subject-attendance-table.js:178):**
```javascript
// Notifies parent when student reaches 15+ absences (DepEd threshold)
await supabase.from('notifications').insert({
    recipient_id: parentData.parent_id,
    recipient_role: 'parent',
    title: `Attendance Concern for ${student.full_name}`,
    message: `Your child has missed ${absences} days of school since ${schoolYearStart}...`,
    type: 'absence_warning'
});
```

**D. Notification Engine (core/notification-engine.js):**
- Routes notifications based on absence type (WHOLE_DAY, AM_HALF, PM_HALF)
- Notifies only affected subject teachers
- Notifies parent only for unexcused absences
- Notifies homeroom adviser

---

### 2.3 Clinic → Parent/Teacher Communications

| Pathway | Mechanism | Files |
|---------|------------|-------|
| **Child in Clinic** | `notifications` table | `clinic-core.js:1176-1195` |
| **Checkout Notification** | `notifications` table | `clinic-core.js:1228-1240` |
| **Teacher Approval Request** | `notifications` table | `clinic-core.js:615-634` |
| **Teacher Clearance** | `notifications` table | `clinic-core.js:1253-1266` |

**Implementation Details:**

**A. Notify Parent Child in Clinic (clinic-core.js:1176):**
```javascript
async function notifyParentChildInClinic(parentId, studentName) {
    await supabase.from('notifications').insert([{
        recipient_id: parentId,
        recipient_role: 'parent',
        title: 'Child at Clinic',
        message: `Your child ${studentName} is currently at the school clinic.`,
        type: 'clinic_alert'
    }]);
}
```

**B. Notify Teacher for Approval (clinic-core.js:615):**
```javascript
async function notifyTeacherForApproval(teacherId, studentName, nurseNotes, action, visitId) {
    await supabase.from('notifications').insert([{
        recipient_id: teacherId,
        recipient_role: 'teacher',
        title: 'Approval Required: Send Home',
        message: `Clinic recommends ${studentName} be sent home. Nurse notes: ${nurseNotes}...`,
        type: 'clinic_approval_required'
    }]);
}
```

**C. Notify Parent Checkout (clinic-core.js:1228):**
```javascript
async function notifyParentCheckOut(parentId, studentName, disposition) {
    await supabase.from('notifications').insert([{
        recipient_id: parentId,
        recipient_role: 'parent',
        title: 'Child Checked Out',
        message: `Your child ${studentName} has been checked out. Disposition: ${disposition}`,
        type: 'clinic_checkout'
    }]);
}
```

**D. Notify Teacher Clearance (clinic-core.js:1253):**
```javascript
async function notifyTeacherClearance(teacherId, studentName) {
    await supabase.from('notifications').insert([{
        recipient_id: teacherId,
        recipient_role: 'teacher',
        title: 'Student Cleared from Clinic',
        message: `${studentName} has been cleared and may return to class.`,
        type: 'clinic_clearance'
    }]);
}
```

---

### 2.4 Guard → Teacher/Parent Communications

| Pathway | Mechanism | Files |
|---------|------------|-------|
| **Attendance Alerts** | `notifications` table | `guard-core.js:654` |
| **Partial Absence Detection** | Auto-triggers parent notification | `guard-core.js:200-224` |
| **Pattern Detection** | Creates admin alerts | `guard-core.js:298-326` |

**Implementation Details:**

**A. Attendance Alert to Homeroom Teacher (guard-core.js:654):**
```javascript
// When student is scanned, notify their homeroom adviser
if (title) await supabase.from('notifications').insert({
    recipient_id: classData.adviser_id,
    recipient_role: 'teacher',
    title, message,
    type: 'attendance_alert'
});
```

**B. Partial Absence Detection (guard-core.js:190-223):**
```javascript
// If student arrives after 12 PM, auto-mark as Morning Absent
// and notify parent
if (direction === 'ENTRY' && currentHour >= 12) {
    await supabase.from('attendance_logs').insert({
        status: 'Morning Absent',
        morning_absent: true,
        remarks: 'Auto-marked: Morning Absent - Please submit excuse letter'
    });
    await sendPartialAbsenceNotification(studentId, 'Morning Absent');
}

// If student exits before 12 PM and doesn't return, mark PM absent
if (direction === 'EXIT' && currentHour < 12) {
    await supabase.from('attendance_logs')
        .update({ afternoon_absent: true })
        .eq('id', latestLog.id);
    await sendPartialAbsenceNotification(studentId, 'Afternoon Absent');
}
```

**C. Attendance Pattern Detection (guard-core.js:246-296):**
- Detects rapid scans (possible testing)
- Detects immediate exit after entry (suspicious)
- Detects frequent lates (pattern)
- Detects frequent early exits

Creates `attendance_patterns` records which trigger admin alerts (not teacher/parent notifications directly).

---

## 3. Notification Types Summary

| Type | From | To | Purpose |
|------|------|-----|---------|
| `attendance_alert` | Teacher/Guard | Parent | Student absent/late |
| `attendance_alert` | Guard | Teacher | Student attendance event |
| `subject_alert` | Teacher | Parent | Absent/late in specific subject |
| `absence_warning` | Teacher | Parent | 15+ absences (DepEd threshold) |
| `clinic_alert` | Clinic | Parent | Child at clinic |
| `clinic_approval_required` | Clinic | Teacher | Send home approval needed |
| `clinic_checkout` | Clinic | Parent | Child checked out |
| `clinic_clearance` | Clinic | Teacher | Student cleared to return |
| `emergency` | Admin | All | Emergency broadcast |

---

## 4. Missing/Partial Features Identified

| Issue | Location | Impact |
|-------|----------|--------|
| **No direct Admin→Teacher messages** | admin-announcements.js | Teachers only get broadcasts, not personalized messages |
| **No Teacher→Admin messages** | N/A | Teachers cannot message admins directly |
| **No Teacher→Teacher messages** | N/A | Teachers cannot communicate with each other |
| **No Guard→Parent direct messages** | guard-core.js | Parents only notified via automated events, not by guard manually |
| **Pattern notifications only to Admin** | guard-core.js:313 | Teachers don't get notified of student attendance patterns |

---

## 5. Recommendations

1. **Add Teacher Message Feature** - Allow teachers to send direct messages to admin
2. **Add Guard Manual Notification** - Allow guards to manually notify parents/teachers
3. **Add Teacher-to-Teacher Chat** - Enable peer communication for coordination
4. **Extend Pattern Notifications** - Send attendance patterns to homeroom teachers

---

## Conclusion

The Educare system has a **functioning notification architecture** that handles most communication needs:

- ✅ Admin → Teacher: Via announcements (broadcast)
- ✅ Teacher → Parent: Via attendance alerts and clinic notifications
- ✅ Clinic → Parent/Teacher: Via dedicated clinic notification functions
- ✅ Guard → Teacher: Via attendance alerts (automatic)
- ⚠️ Guard → Parent: Only automatic (partial absence), no manual option

The system uses a clean unified table structure but could benefit from direct messaging features between roles.