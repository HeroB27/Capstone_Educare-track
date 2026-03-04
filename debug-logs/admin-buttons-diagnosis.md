# Admin Module Buttons - Root Cause Analysis
**Date:** 2026-03-04

## Problem Summary
Most buttons in the admin module are not working properly or not working at all.

---

## Root Cause Analysis

### Possible Sources Investigated:

1. **JavaScript not loading** - ❌ Ruled out - Files are properly included in HTML
2. **Functions not defined** - ❌ Ruled out - Most functions exist in JS files  
3. **Event listeners not attached** - ❌ Ruled out - onclick handlers are inline
4. **Session check blocking access** - ❌ Ruled out - Dashboard loads for admin
5. **Function parameter mismatches** - ✅ **PRIMARY CAUSE** - Multiple mismatches found
6. **Missing function definitions** - ✅ **SECONDARY CAUSE** - Some functions don't exist
7. **JavaScript errors blocking execution** - ✅ Contributing factor

---

## Issue #1: Function Parameter Mismatches

### A. switchTab() Function Signature Mismatch

**Files Affected:**
- [`admin/admin-settings.html`](admin/admin-settings.html:91) calls `switchTab(event, 'password-resets')`
- [`admin/admin-attendance-settings.html`](admin/admin-attendance-settings.html:109-112) calls `switchTab(event, 'thresholds')` etc.

**JavaScript Definitions:**
- [`admin/admin-settings.js:15`](admin/admin-settings.js:15) defines `function switchTab(tabId)` - **MISSING event parameter**
- [`admin/admin-attendance-settings.js:359`](admin/admin-attendance-settings.js:359) defines `function switchTab(tabId)` - **MISSING event parameter**

**Impact:** Tabs in Settings and Attendance Settings pages do not work

---

### B. setEnrollType() Function Signature Mismatch

**HTML:** [`admin/admin-user-management.html:141-142`](admin/admin-user-management.html:141-142)
```html
<button onclick="setEnrollType(event, 'parent')">
<button onclick="setEnrollType(event, 'staff')">
```

**JavaScript:** [`admin/admin-user-management.js:173`](admin/admin-user-management.js:173)
```javascript
function setEnrollType(type) {  // MISSING event parameter
```

**Impact:** Switching between Parent/Staff enrollment types fails

---

### C. switchView() Function Signature Mismatch

**HTML:** [`admin/admin-user-management.html:98-99`](admin/admin-user-management.html:98-99)
```html
<button onclick="switchView(event, 'staff')">
<button onclick="switchView(event, 'parents')">
```

**JavaScript:** [`admin/admin-user-management.js:656`](admin/admin-user-management.js:656)
```javascript
function switchView(v) {  // MISSING event parameter
```

**Impact:** Switching between Staff/Parents tabs in User Management fails

---

### D. saveAllSchedules() Uses event Without Parameter

**HTML:** [`admin/admin-grade-schedules.html:112`](admin/admin-grade-schedules.html:112)
```html
<button onclick="saveAllSchedules(event)">
```

**JavaScript:** [`admin/admin-grade-schedules.js:149`](admin/admin-grade-schedules.js:149)
```javascript
async function saveAllSchedules() {  // MISSING event parameter
    const btn = event.currentTarget;  // ERROR: event is undefined
```

**Impact:** Grade Schedules save button fails

---

### E. saveNotificationSettings() Missing Parameter

**HTML:** [`admin/admin-attendance-settings.html:289`](admin/admin-attendance-settings.html:289)
```html
<button onclick="saveNotificationSettings(event)">
```

**JavaScript:** [`admin/admin-attendance-settings.js:400`](admin/admin-attendance-settings.js:400)
```javascript
async function saveNotificationSettings() {  // MISSING event parameter
    const btn = event.currentTarget;  // ERROR: event is undefined
```

**Impact:** Auto-notification settings save fails

---

### F. saveWeekendSettings() Missing Parameter

**HTML:** [`admin/admin-attendance-settings.html:222`](admin/admin-attendance-settings.html:222)
```html
<button onclick="saveWeekendSettings(event)">
```

**JavaScript:** [`admin/admin-attendance-settings.js:416`](admin/admin-attendance-settings.js:416)
```javascript
async function saveWeekendSettings() {  // MISSING event parameter
    const btn = event.currentTarget;  // ERROR: event is undefined
```

**Impact:** Weekend/Breaks settings save fails

---

## Issue #2: Missing Function Definitions

### A. setCategory() Function Does Not Exist

**HTML:** [`admin/admin-announcements.html:143-145`](admin/admin-announcements.html:143-145)
```html
<button onclick="setCategory(event, 'Calamity')">
<button onclick="setCategory(event, 'Holiday')">
<button onclick="setCategory(event, 'Others')">
```

**JavaScript:** Function `setCategory` **NOT FOUND** in any admin JS file

**Impact:** Category selection in Announcements fails

---

### B. switchAnnouncementTab() Function Does Not Exist

**HTML:** [`admin/admin-announcements.html:102-103`](admin/admin-announcements.html:102-103)
```html
<button onclick="switchAnnouncementTab('active')">
<button onclick="switchAnnouncementTab('scheduled')">
```

**JavaScript:** Function `switchAnnouncementTab` **NOT FOUND** in any admin JS file

**Impact:** Switching between Active/Scheduled announcements fails

---

### C. saveAttendanceRules() Function Does Not Exist

**HTML:** [`admin/admin-attendance-settings.html:184`](admin/admin-attendance-settings.html:184)
```html
<button onclick="saveAttendanceRules(event)">
```

**JavaScript:** Function `saveAttendanceRules` **NOT FOUND** in any admin JS file

**Impact:** Attendance rules save button fails

---

## Summary of Issues

| Page | Button/Feature | Issue | Severity |
|------|---------------|-------|----------|
| Settings | Tab navigation | switchTab() missing event param | HIGH |
| Attendance Settings | Tab navigation | switchTab() missing event param | HIGH |
| Attendance Settings | Save Rules | saveAttendanceRules() not defined | CRITICAL |
| Attendance Settings | Save Notifications | saveNotificationSettings() missing param | HIGH |
| Attendance Settings | Save Weekend | saveWeekendSettings() missing param | HIGH |
| User Management | Enrollment Type | setEnrollType() missing event param | HIGH |
| User Management | Staff/Parent Tab | switchView() missing event param | HIGH |
| Grade Schedules | Save All | saveAllSchedules() missing param | HIGH |
| Announcements | Category Buttons | setCategory() not defined | CRITICAL |
| Announcements | Tab Switch | switchAnnouncementTab() not defined | CRITICAL |

---

## Recommended Fixes

### Fix #1: Add event parameter to switchTab in both files
```javascript
// admin/admin-settings.js line 15
function switchTab(event, tabId) {

// admin/admin-attendance-settings.js line 359  
function switchTab(event, tabId) {
```

### Fix #2: Add event parameter to setEnrollType
```javascript
// admin/admin-user-management.js line 173
function setEnrollType(event, type) {
```

### Fix #3: Add event parameter to switchView
```javascript
// admin/admin-user-management.js line 656
function switchView(event, v) {
```

### Fix #4: Add event parameter to saveAllSchedules
```javascript
// admin/admin-grade-schedules.js line 149
async function saveAllSchedules(event) {
```

### Fix #5: Add event parameter to saveNotificationSettings and saveWeekendSettings
```javascript
// admin/admin-attendance-settings.js
async function saveNotificationSettings(event) {
async function saveWeekendSettings(event) {
```

### Fix #6: Add missing setCategory function
Add to admin/admin-announcements.js:
```javascript
function setCategory(event, category) {
    selectedCategory = category;
    // Update UI to show selected category
}
```

### Fix #7: Add missing switchAnnouncementTab function
Add to admin/admin-announcements.js:
```javascript
function switchAnnouncementTab(tab) {
    currentAnnTab = tab;
    // Load announcements for that tab
}
```

### Fix #8: Add missing saveAttendanceRules function
Add to admin/admin-attendance-settings.js with the actual save logic

---

## Verification Steps

1. Open browser DevTools (F12)
2. Go to Console tab
3. Navigate to each admin page
4. Click each button and observe console for errors
5. Expected: No JavaScript errors after fixes applied
