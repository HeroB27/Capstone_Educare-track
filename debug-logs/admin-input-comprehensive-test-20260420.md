# Debug Log: Admin Input System - Comprehensive Test Plan

**Date:** 2026-04-20
**Test Type:** Manual Browser Test
**Status:** TEST PLAN READY

---

## Test Environment Prerequisites

Before testing, ensure:
1. [ ] Supabase project is running
2. [ ] Admin user credentials available
3. [ ] Browser console open (F12)
4. [ ] Network tab monitoring enabled

---

## Test Suite: All 6 Admin Input Features

### TEST 1: Student & Parent Enrollment

**URL:** `admin/admin-add-parent-and-child.html`

| Step | Test Action | Expected Result | Pass/Fail |
|------|------------|----------------|-----------|
| 1.1 | Click "New Enrollment" button | Wizard modal opens | |
| 1.2 | Fill parent: Name, Phone, Address | Fields accept input | |
| 1.3 | Create username and password | Credentials validated | |
| 1.4 | Add Student: Name, LRN (12 digits), Gender, Class | Student added | |
| 1.5 | Complete enrollment | Redirect to table with new record | |
| 1.6 | Verify ID card generated | QR code visible | |
| 1.7 | Edit parent record | Modal opens | |
| 1.8 | Change parent name | ID reissue prompt appears | |
| 1.9 | Search parent | Filter works | |
| 1.10 | Pagination | Page navigation works | |

**Console Errors to Check:**
- `Error loading parents and students:`
- `Error saving student:`

---

### TEST 2: Staff Enrollment (Teacher/Guard/Clinic)

**URL:** `admin/admin-add-staff.html`

| Step | Test Action | Expected Result | Pass/Fail |
|------|------------|----------------|-----------|
| 2.1 | Switch to Teachers tab | Teachers table loads | |
| 2.2 | Switch to Guards tab | Guards table loads | |
| 2.3 | Switch to Clinic tab | Clinic table loads | |
| 2.4 | Click "New Staff" | Wizard modal opens | |
| 2.5 | Select Teacher role | Extra fields show | |
| 2.6 | Enter Name, Phone, Email, Department | All accept input | |
| 2.7 | Create username and password | Credentials saved | |
| 2.8 | Complete enrollment | Record in table | |
| 2.9 | Edit staff record | Can modify | |
| 2.10 | Delete staff | Confirm dialog → removed | |

**Console Errors to Check:**
- `Error loading staff:`
- `Error saving staff:`

---

### TEST 3: Teacher Subject Assignment

**URL:** `admin/admin-class-management.html`

| Step | Test Action | Expected Result | Pass/Fail |
|------|------------|----------------|-----------|
| 3.1 | View class cards | Grid loads with classes | |
| 3.2 | Click "Subjects" on a class | Subject load modal opens | |
| 3.3 | Click "Add Subject" | New subject form | |
| 3.4 | Enter subject name | Accepts input | |
| 3.5 | Select teacher dropdown | Teachers list populated | |
| 3.6 | Select days (checkboxes) | Days selected | |
| 3.7 | Set time slot | Start/End times set | |
| 3.8 | Save subject load | Toast success | |
| 3.9 | Edit subject | Can modify | |
| 3.10 | Delete subject | Confirm → removed | |

**Console Errors to Check:**
- `Error loading classes:`
- `Error saving subject_load:`

---

### TEST 4: School Year Dates (First/Last Day)

**URL:** `admin/admin-settings.html`

| Step | Test Action | Expected Result | Pass/Fail |
|------|------------|----------------|-----------|
| 4.1 | Click "School Year" tab | Settings load | |
| 4.2 | Check current start date | Date populated | |
| 4.3 | Check current end date | Date populated | |
| 4.4 | Change start date | New date selected | |
| 4.5 | Change end date | New date selected | |
| 4.6 | Click "Save School Year Dates" | Button enabled | |
| 4.7 | Save | Toast success | |
| 4.8 | Reload page | Dates persisted | |

**Console Errors to Check:**
- `[SchoolYear] Error loading settings:`
- `[SchoolYear] Error saving:`

---

### TEST 5: Announcements

**URL:** `admin/admin-announcements.html`

| Step | Test Action | Expected Result | Pass/Fail |
|------|------------|----------------|-----------|
| 5.1 | Click "Post Broadcast" | Modal opens | |
| 5.2 | Enter title | Input accepts | |
| 5.3 | Select type (General/Emergency/Event) | Type selected | |
| 5.4 | Enter content | Text area accepts | |
| 5.5 | Check target Teachers | Checkbox works | |
| 5.6 | Check target Parents | Checkbox works | |
| 5.7 | Check target Guards | Checkbox works | |
| 5.8 | Check target Clinic | Checkbox works | |
| 5.9 | Schedule for future (date/time) | Scheduled set | |
| 5.10 | Save announcement | Toast success | |
| 5.11 | Verify in Active tab | Shows in list | |
| 5.12 | Edit announcement | Modal with data | |
| 5.13 | Delete announcement | Confirm → removed | |

**Console Errors to Check:**
- `Error saving announcement:`
- `Failed to load announcements:`

---

### TEST 6: Suspensions

**URL:** `admin/admin-calendar.html`

| Step | Test Action | Expected Result | Pass/Fail |
|------|------------|----------------|-----------|
| 6.1 | Click "Add Holiday" | Modal opens | |
| 6.2 | Toggle "Suspension" radio | Time coverage shows | |
| 6.3 | Enter description | Accepts input | |
| 6.4 | Select date range | Dates selected | |
| 6.5 | Select target grade level | Grade targeted | |
| 6.6 | Select half-day (Morning/Afternoon) | Time coverage set | |
| 6.7 | Save suspension | Toast success | |
| 6.8 | Verify red badge | Shows "Suspension" tag | |
| 6.9 | Test attendance check | Gate rejected during suspension | |
| 6.10 | Delete suspension | Confirm → removed | |

**Console Errors to Check:**
- `Error loading holidays:`
- `Error saving:`

---

## Known Issues Found

### Issue #1: Dual Suspension Tables
**Severity:** Medium

The `holidays` table AND `suspensions` table both handle suspensions. This creates confusion:
- admin-calendar.js writes to `holidays` (with `is_suspended=true`)
- Attendance system checks BOTH tables

**Recommendation:** Consolidate to one table.

### Issue #2: holidays Default Value
**Severity:** High

Schema shows `holidays.is_suspended DEFAULT true` - meaning ANY new entry defaults to SUSPENSION unless explicitly set.

**SQL Fix:**
```sql
ALTER TABLE holidays ALTER COLUMN is_suspended SET DEFAULT false;
```

---

## Test Summary

| Feature | Test Steps | Issues Found | Status |
|---------|-----------|--------------|--------|
| Student & Parent | 10 | None | ✅ READY |
| Staff | 10 | None | ✅ READY |
| Subject Assignment | 10 | None | ✅ READY |
| School Year | 8 | None | ✅ READY |
| Announcements | 13 | None | ✅ READY |
| Suspensions | 10 | Dual table issue | ⚠️ NEEDS FIX |

---

## Next Steps

1. Run manual tests using checklist above
2. Fix the dual suspensions issue
3. Fix holidays default value
4. Re-test suspensions feature

**Test Execution:** User to perform browser-based manual tests using this checklist.