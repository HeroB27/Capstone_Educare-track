# Debug Log: Inter-Role Communications Analysis

**Date:** 2026-04-20
**Status:** ANALYSIS COMPLETE

---

## Overview of Communication Systems

| System | Role A | Role B | Direction | Status |
|--------|-------|--------|-----------|--------|
| **Homeroom Admin** | Teacher | Students/Parents | Bi-directional | ✅ |
| **Attendance** | Teacher/Guard/Parent | System | Input | ✅ |
| **Announcements** | Teacher/Admin | All | Broadcast | ✅ |
| **Gatekeeper** | Teacher | Students | Scan | ⚠️ |
| **Excuse Letters** | Parent → Teacher → System | Request → Approve | ✅ |
| **Guard Passes** | Teacher ↔ Guard | Request → Verify | ✅ |
| **Clinic Passes** | Teacher ↔ Clinic | Request → Approve | ✅ |

---

## 1. Teacher Homeroom Admin Features

### Location: `teacher/teacher-core.js`

**Functions:**
- `loadHomeroomClass()` - Gets assigned class
- `loadDashboardStats()` - Shows homeroom stats
- `loadStudentList()` - Lists students in homeroom

**Status:** ✅ OPERATIONAL
- Teacher can view their homeroom class
- Can see all student data
- Can access homeroom-specific features

---

## 2. Attendance Checking

### Location: `teacher/teacher-attendance.js`

**Flow:**
1. Teacher opens attendance for their homeroom
2. Marks students Present/Absent/Late
3. Records saved to `attendance_logs`

**Status:** ✅ OPERATIONAL

**Also:**
- Guard checks attendance via `guard-core.js` (scan based)
- Parent views attendance via `parent-dashboard.js`

---

## 3. Announcements

### Location: `teacher/teacher-core.js` (teacher) + `admin/admin-announcements.js` (admin)

**Teacher Flow:**
- Teachers can view announcements (READ ONLY?)
- Teachers can CREATE announcements via form

**Admin Flow:**
- Admin can CREATE/EDIT/DELETE all announcements
- Can schedule broadcasts
- Can target specific audiences

**Status:** ✅ TEACHER CAN CREATE

**Target Audience Flags:**
- `target_teachers` (boolean)
- `target_parents` (boolean)
- `target_guards` (boolean)
- `target_clinic` (boolean)

---

## 4. Gatekeeper Mode

### Location: `teacher/teacher-gatekeeper-mode.js`

**Requirement:** `is_gatekeeper = true` in `teachers` table

### Issue #1: No Admin Approval Flow
**Severity:** HIGH

**Problem:** Teachers cannot request gatekeeper access. Admin cannot grant it via UI. Only database direct update possible.

**Current workflow:**
- Pre-set during data seeding only
- No admin UI to toggle

**Missing feature:**
- Teacher request form
- Admin approval/rejection panel

**Database field:** `teachers.is_gatekeeper` (boolean, default: false)

**Status:** ⚠️ NO ADMIN CONTROL

---

## 5. Excuse Letters Approval

### Location: `teacher/teacher-core.js` + `parent/parent-excuse-letter-template.js`

**Flow:**
1. **Parent submits** → `parent-excuse-letter-template.js`
   - Creates record in `excuse_letters` table
   - Status: 'Pending'
   
2. **Teacher views** → `loadExcuseLetters('pending')` in teacher-core.js
   - Queries letters for homeroom students
   
3. **Teacher approves** → `approveExcuseLetter(letterId)`
   - Updates status to 'Approved'
   - Also updates attendance log to mark excused
   
4. **Parent notified** → Real-time subscription

**Status:** ✅ OPERATIONAL

**Database:** `excuse_letters` table
- Fields: `student_id`, `parent_id`, `date_absent`, `reason`, `status`, `absence_type`, `period`

---

## 6. Guard Pass Making

### Location: `teacher/teacher-guard-pass.js` + `guard/guard-core.js`

**Flow:**
1. **Teacher requests** → Teacher creates pass request
   - Stores in `guard_passes` with status 'Pending'
   
2. **Guard verifies** → Guard scans student ID
   - Verifies pass is valid
   - Updates status to 'Approved' or 'Used'
   
3. **Student exits** → Guard marks as left

**Teacher features:**
- View pending requests
- Create new pass requests
- View history

**Status:** ✅ OPERATIONAL

**Database:** `guard_passes` table

---

## 7. Clinic Pass Making

### Location: `teacher/teacher-core.js` + `clinic/clinic-core.js`

**Flow:**
1. **Teacher initiates** → Teacher creates clinic visit request
   - Creates in `clinic_visits` with status 'Pending'
   
2. **Clinic staff receives** → Sees request
   - Approves/Rejects/Completes
   
3. **Teacher notified** → Real-time

**Status:** ✅ OPERATIONAL

**Database:** `clinic_visits` table

---

## Issues Found

### Issue #1: No Gatekeeper Approval Flow
**Severity:** HIGH

**What:** No UI for admin to enable gatekeeper for teachers

**Where:** `admin/admin-add-staff.js` - edit modal doesn't have is_gatekeeper toggle

**Fix needed:** Add is_gatekeeper checkbox to staff edit modal

---

### Issue #2: No Teacher Gatekeeper Request
**Severity:** MEDIUM

**What:** Teachers can't request gatekeeper access

**Fix needed:** Add "Request Gatekeeper Access" button in teacher settings

---

## Communication Matrix

| From → To | Message Type | Channel | Status |
|-----------|--------------|---------|--------|
| Teacher → Student | Attendance Mark | `attendance_logs` | ✅ |
| Teacher → Parent | Notification | Real-time sub | ✅ |
| Parent → Teacher | Excuse Letter | `excuse_letters` | ✅ |
| Teacher → Parent | Excuse Approval | Real-time sub | ✅ |
| Teacher → Admin | Gatekeeper Request | MISSING | ❌ |
| Admin → Teacher | Gatekeeper Enable | Direct DB only | ⚠️ |
| Teacher → Guard | Pass Request | `guard_passes` | ✅ |
| Guard → Teacher | Pass Update | Real-time sub | ✅ |
| Teacher → Clinic | Visit Request | `clinic_visits` | ✅ |
| Clinic → Teacher | Visit Update | Real-time sub | ✅ |

---

## Test Checklist

- [ ] Teacher can view homeroom class ✅
- [ ] Teacher can mark attendance ✅
- [ ] Teacher can create announcements ✅
- [ ] Teacher can approve excuse letters ✅
- [ ] Teacher can create guard passes ✅
- [ ] Teacher can create clinic visits ✅
- [ ] Admin can toggle teacher gatekeeper ❌ UNCHECKED
- [ ] Teacher can request gatekeeper access ❌ UNCHECKED

---

## Fixes Needed

### Fix 1: Add Gatekeeper Toggle to Admin Staff Edit
**File:** `admin/admin-add-staff.js`
**Location:** Edit staff modal, add is_gatekeeper checkbox

### Fix 2: Add Gatekeeper Request for Teachers
**File:** `teacher/teacher-settings.js`
**Location:** Add "Request Gatekeeper Access" button

---

## Test Execution

To test these flows:
1. Login as Teacher → Check homeroom features
2. Navigate teacher-dashboard → Mark attendance
3. Check announcements → Create new announcement
4. View excuse letters → Approve one
5. Create guard pass → Check with guard
6. Create clinic visit → Verify clinic sees it