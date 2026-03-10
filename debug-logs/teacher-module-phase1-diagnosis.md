# Teacher Module Sprint - Phase 1 Debug Diagnosis

**Date:** 2026-03-10
**Phase:** Phase 1: Navigation & Routing Stabilization

---

## What is the problem

The teacher module has three navigation/routing issues that need to be fixed in Phase 1:
1. Sidebar links need review and consolidation
2. Gatekeeper toggle is missing from teacher-dashboard.html
3. Teacher name is not displayed in Gatekeeper Mode

---

## What causes it

### Task 1.1: Sidebar Links Analysis
- **Current State:** The sidebar in `teacher-dashboard.html` (lines 33-61) already has a link for "Homeroom Class" pointing to `teacher-homeroomlist.html`
- **Assessment:** The current sidebar appears functional. The task mentions consolidating `teacher-homeroomlist.html` and `teacher-homeroom.html`, but this may be referring to the workflow rather than the link itself
- **Status:** Likely ALREADY FIXED or needs clarification

### Task 1.2: Gatekeeper Toggle Missing from Dashboard
- **Root Cause:** The `#gatekeeper-toggle` element exists in ALL teacher HTML files EXCEPT `teacher-dashboard.html`
- **Evidence:** 
  - Search found gatekeeper-toggle in: teacher-homeroom.html, teacher-homeroomlist.html, teacher-subject-attendance.html, teacher-clinicpass.html, teacher-excuse-letter-approval.html, teacher-data-analytics.html, teacher-announcements-board.html
  - Search found NO gatekeeper-toggle in teacher-dashboard.html
- **Logic Issue:** `teacher-core.js` (lines 29-33) has code to show the toggle:
  ```javascript
  const gatekeeperToggle = document.getElementById('gatekeeper-toggle');
  if (gatekeeperToggle && isGatekeeperMode) {
      gatekeeperToggle.classList.remove('hidden');
  }
  ```
  But since the element doesn't exist in dashboard, the toggle never appears
- **Status:** BUG CONFIRMED - Missing HTML element

### Task 1.3: Gatekeeper Name Display Missing
- **Root Cause:** There's NO element to display the teacher name in `teacher-gatekeeper-mode.html`
- **Evidence:**
  - Search for "teacher-name" in teacher-gatekeeper-mode.html returned 0 results
  - The header in teacher-gatekeeper-mode.html (lines 43-61) shows: "Gatekeeper Mode", time, and date - but NO teacher name
- **Expected Behavior:** According to the task, there should be a `#teacher-name-display` element showing the teacher's full name
- **Status:** BUG CONFIRMED - Missing HTML element and missing JS population logic

---

## What is the solution

### Task 1.1: Sidebar Links
- **Recommendation:** Verify current implementation is working as expected. The sidebar already has a "Homeroom Class" link that goes to teacher-homeroomlist.html

### Task 1.2: Add Gatekeeper Toggle to Dashboard
1. Add the gatekeeper toggle HTML to `teacher-dashboard.html` (similar to other teacher HTML files)
2. The existing logic in `teacher-core.js` will automatically show it when `isGatekeeperMode === true`

### Task 1.3: Add Teacher Name Display to Gatekeeper Mode
1. Add a `#teacher-name-display` element to `teacher-gatekeeper-mode.html` header
2. Add JavaScript in `teacher-gatekeeper-mode.js` to populate it with `currentUser.full_name` from session storage

---

## Files to Modify

| Task | File | Action |
|------|------|--------|
| 1.1 | teacher-dashboard.html | Verify sidebar (no change needed?) |
| 1.2 | teacher-dashboard.html | Add gatekeeper-toggle HTML element |
| 1.3 | teacher-gatekeeper-mode.html | Add teacher-name-display element |
| 1.3 | teacher-gatekeeper-mode.js | Add JS to populate teacher name |

---

## Diagnosis Confirmation

Please confirm if my diagnosis is correct before I proceed with the fixes.
