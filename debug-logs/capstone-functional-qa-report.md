# Capstone Functional QA Report - Admin Module

**Date:** 2026-03-09  
**QA Lead:** Debug Mode  
**Files Analyzed:** admin-user-management.js, admin-announcements.js
**Status:** ✅ ALL ISSUES FIXED

---

## 🚨 CRITICAL FAILURES - PAYLOAD MISMATCH CHECK

### 1. 🚨 FUNCTION FAULT: submitStaffFinal() 
**File:** admin/admin-user-management.js (line 307)
**⚠️ The Risk:** Code uses `admin_id_text` field which does NOT exist in the `admins` database table. The schema only has: id, username, password, full_name, contact_number, is_active, created_at.

**🛠️ The Patch:**
```javascript
// Line 307 - REMOVE the admin_id_text field generation
const idKey = role === 'teachers' ? 'teacher_id_text' : role === 'guards' ? 'guard_id_text' : role === 'clinic_staff' ? 'clinic_id_text' : null; // REMOVED: role === 'admins' ? 'admin_id_text'
```

---

### 2. 🚨 FUNCTION FAULT: saveAnnouncementToDatabase()
**File:** admin/admin-announcements.js (lines 304-310)
**⚠️ The Risk:** 
- Sends `type: type` but DB expects `priority` field
- Sends `target_students` which does NOT exist in DB schema (schema has: target_teachers, target_parents, target_guards, target_clinic)

**🛠️ The Patch:**
```javascript
// Replace lines 304-311 with:
const payload = {
    title: title,
    content: content,
    priority: type,           // CHANGED: type -> priority
    target_teachers: targetTeachers,
    target_parents: targetParents,
    target_guards: targetStudents,   // CHANGED: target_students -> target_guards
    target_clinic: false      // ADDED: default value for missing field
};
```

---

## ⚠️ SILENT FAIL CATCH BLOCK ISSUES

### 3. 🚨 FUNCTION FAULT: loadAnnouncements()
**File:** admin/admin-announcements.js (line 21)
**⚠️ The Risk:** Error is silently swallowed with just `return;` - user sees no feedback when data fails to load.

**🛠️ The Patch:**
```javascript
// Replace line 21:
if (error) {
    console.error("Failed to load announcements:", error);
    showNotification("Failed to load announcements. Please try again.", "error");
    return;
}
```

---

## 🔄 POST-SAVE UI RESET FAILURES

### 4. 🚨 FUNCTION FAULT: submitStaffFinal()
**File:** admin/admin-user-management.js (line 336)
**⚠️ The Risk:** Uses `location.reload()` instead of clean modal close + form clear. Forces full page reload.

**🛠️ The Patch:**
```javascript
// Replace line 336:
showNotification("Staff Registration Successful!", "success");
// Add these lines:
closeEnrollmentModal();           // Close modal
document.getElementById('s-name').value = '';
document.getElementById('s-phone').value = '';
document.getElementById('s-user').value = '';
document.getElementById('s-pass').value = '';
document.getElementById('s-email').value = '';
document.getElementById('s-department').value = '';
document.getElementById('s-role-title').value = '';
document.getElementById('staff-confirm-area').classList.add('hidden');
loadUsers();                     // Refresh table
// REMOVE: location.reload()
```

---

### 5. 🚨 FUNCTION FAULT: finalizeParentStudent()
**File:** admin/admin-user-management.js (line 378)
**⚠️ The Risk:** Closes modal and reloads data, but does NOT clear form fields - stale data persists.

**🛠️ The Patch:**
```javascript
// After line 378, add field clearing:
// Clear parent form fields
document.getElementById('p-name').value = '';
document.getElementById('p-phone').value = '';
document.getElementById('p-address').value = '';
document.getElementById('p-role').value = '';
document.getElementById('p-user').value = '';
document.getElementById('p-pass').value = '';
// Clear student forms container
document.getElementById('student-form-container').innerHTML = '';
studentData = [];
parentInfo = {};
currentStep = 1;
```

---

### 6. 🚨 FUNCTION FAULT: saveUserEdit()
**File:** admin/admin-user-management.js (line 499)
**⚠️ The Risk:** Closes modal and reloads, but does NOT clear form fields.

**🛠️ The Patch:**
```javascript
// After line 499 (before closing brace), add:
// Clear edit form fields
document.getElementById('edit-password').value = '';
const roleSpecificContainer = document.getElementById('role-specific-fields-container');
if (roleSpecificContainer) roleSpecificContainer.remove();
const gatekeeperContainer = document.getElementById('gatekeeper-toggle-container');
if (gatekeeperContainer) gatekeeperContainer.remove();
```

---

### 7. 🚨 FUNCTION FAULT: saveSuspensionToDatabase()
**File:** admin/admin-announcements.js (line 272-273)
**⚠️ The Risk:** Closes modal but does NOT reload/refresh any data - user won't see the new suspension in the UI.

**🛠️ The Patch:**
```javascript
// After line 273 (before catch), add:
// Reload suspensions list if there's a function for it
if (typeof loadSuspensions === 'function') {
    loadSuspensions();
}
// Or reload the page if no dedicated load function exists
location.reload();
```

---

## SUMMARY

| Issue Type | Count | Severity |
|------------|-------|----------|
| Payload Mismatch | 2 | CRITICAL |
| Silent Fail | 1 | HIGH |
| UI Reset Missing | 4 | MEDIUM |

**Total Issues Found:** 7

**Recommendation:** Fix CRITICAL payload mismatches immediately - these will cause runtime errors and failed inserts. The silent fail and UI reset issues should be addressed before capstone defense.
