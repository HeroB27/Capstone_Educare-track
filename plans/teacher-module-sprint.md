# 🏃‍♂️ Teacher Module: Final Sprint Timeline

**Objective:** Achieve 100% feature parity with the Admin Module, implement the "Digital Checker / 8 Cups" asynchronous attendance logic, and resolve all navigation bugs.

## Phase 1: Navigation & Routing Stabilization (The Foundation)

*Before we build new features, the teacher must actually be able to click and navigate to the existing ones.*

* [x] **Task 1.1: Fix the Sidebar Links** ✅
* **File:** `teacher-dashboard.html` (and all other teacher HTML files)
* **Action:** Update the sidebar `<nav>` to include explicitly defined links for the Homeroom workflow. Consolidate `teacher-homeroomlist.html` and `teacher-homeroom.html` into a single, clear "Homeroom Advisory" link to prevent routing confusion.


* [x] **Task 1.2: Unhide Gatekeeper Toggle** ✅
* **File:** `teacher-core.js` & `teacher-dashboard.html`
* **Action:** Write the Javascript logic to remove the `hidden` class from `#gatekeeper-toggle` *only* if `currentUser.is_gatekeeper === true`.


* [x] **Task 1.3: Fix Gatekeeper Name Display** ✅
* **File:** `teacher-gatekeeper-mode.js`
* **Action:** Fetch `currentUser.full_name` from session storage and inject it into the `#teacher-name-display` element so it doesn't say "Teacher Name".



## Phase 2: The "Digital Checker" Core Logic (The 8 Cups)

*Implementing the asynchronous, time-agnostic subject attendance tracking.*

* [x] **Task 2.1: Add the Retroactive Date Picker** ✅
* **File:** `teacher-subject-attendance.html`
* **Action:** Add an `<input type="date">` at the top of the UI. Default it to "Today" (using Asia/Manila timezone logic).


* [x] **Task 2.2: Rewrite the Subject Fetcher** ✅
* **File:** `teacher-subject-attendance.js`
* **Action:** Modify the query to look at the *selected date* from the date picker. Convert that date to a day code (e.g., Wednesday = "W"). Query the database for subjects where `schedule_days` includes "W".


* [x] **Task 2.3: Implement the "Tray" Cross-Reference** ✅
* **File:** `teacher-subject-attendance.js`
* **Action:** When loading the students for a subject, simultaneously fetch today's `attendance_logs` (The Gate Tray). Add a visual badge next to the student's name showing `[Gate: Inside]` or `[Gate: No Scan]` so the teacher has context before marking them absent.


* [x] **Task 2.4: Asynchronous Bulk Save** ✅
* **File:** `teacher-subject-attendance.js`
* **Action:** Ensure the save function uses the "Remarks-based system" (e.g., `[Math: Present]`) so it safely appends to the student's daily record without overwriting the guard's original entry/exit timestamp.



## Phase 3: Settings & Hardcoded Data Removal (The Polish)

*Making the system dynamic and enterprise-ready.*

* [x] **Task 3.1: Expand Teacher Settings** ✅
* **File:** `teacher-settings.html` & `.js`
* **Action:** Upgrade the minimal 6-line file. Add UI for "Theme Customization" and "Profile Info" to match the Admin Settings layout.


* [x] **Task 3.2: Remove Hardcoded Grade Levels** ✅
* **File:** `teacher-core.js` & `teacher-gatekeeper-mode.js`
* **Action:** Replace hardcoded strings (like "Grade 11", "Grade 12") with dynamic queries that fetch the distinct `grade_level` values directly from the `classes` table.



## Phase 4: Feature Parity (The Missing Links)

*Building the final missing views so teachers have the same context as Admins.*

* [x] **Task 4.1: Build Teacher Calendar (Read-Only)** ✅
* **Files Created:** `teacher-calendar.html` & `teacher-calendar.js`
* **Action:** Cloned the visual UI of the Admin Calendar, removed all "Add/Edit/Delete" buttons. Teachers can now view upcoming suspensions and holidays. Added to sidebar.


* [x] **Task 4.2: Build Attendance Settings View (Read-Only)** ✅
* **Files Created:** `teacher-attendance-rules.html` & `.js`
* **Action:** Created a simple UI that fetches from `grade_schedules`. Teachers can now see exactly what time their homeroom students are considered "Late" by the system.


* [x] **Task 4.3: Teacher Audit Logs (Optional/Stretch Goal)** ✅
* **Action:** Added `logTeacherAction` function that logs teacher actions to the notifications table with `teacher_id`. Currently logging: EXCUSE_LETTER_APPROVE, EXCUSE_LETTER_REJECT, and SUBJECT_ATTENDANCE_MARK actions.



---

### 🚀 How to execute this:

Copy this list. When you are ready, say: **"Let's start Phase 1. Here are my `teacher-dashboard.html` and `teacher-gatekeeper-mode.js` files."** I will give you the exact Vanilla JS and Tailwind snippets to check off those boxes!
