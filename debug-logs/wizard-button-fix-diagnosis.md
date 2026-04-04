# Wizard Button Fix Diagnosis

**Date:** 2026-03-21

## Problem

The "New Enrollment" and "New Staff" buttons were not working properly. When clicked, it appeared that nothing happened.

## Root Causes Identified

### Issue 1: The "Buried Alive" Bug
- The wizard was technically opening, but it was spawning at the very bottom of the page underneath the massive CRUD table containing 29 parents
- Since the table wasn't hidden or scrolled away, users couldn't see the wizard

### Issue 2: The Scope Disconnect
- The code was split into separate JS files
- The `onclick="toggleWizard()"` handlers in HTML could no longer "see" the JavaScript functions
- Functions weren't globally scoped (not attached to `window` object)

## Solution Applied

### Fix 1: Hide CRUD Section + Scroll to Top (`admin-add-parent-and-child.js`)
Updated `toggleWizard()` function to:
1. Hide the `crud-section` when wizard opens
2. Show the `crud-section` when wizard closes
3. Scroll to top (`window.scrollTo(0, 0)`) when wizard opens

### Fix 2: Add Scroll to Top (`admin-add-staff.js`)
Added `window.scrollTo(0, 0)` to the `toggleWizard()` function for consistency.

### Fix 3: Global Window Attachments
Added window object attachments at the end of both JS files:

**admin-add-parent-and-child.js:**
```javascript
window.toggleWizard = toggleWizard;
window.nextStep = nextStep;
window.prevStep = prevStep;
window.addStudentForm = addStudentForm;
window.removeStudentForm = removeStudentForm;
window.updateStudentSummaryView = updateStudentSummaryView;
window.updateIDPreview = updateIDPreview;
window.editParent = editParent;
window.deleteParent = deleteParent;
window.closeEditParentModal = closeEditParentModal;
window.saveParentEdit = saveParentEdit;
window.logout = logout;
window.filterParentsStudents = filterParentsStudents;
```

**admin-add-staff.js:**
```javascript
window.toggleWizard = toggleWizard;
window.nextStep = nextStep;
window.prevStep = prevStep;
window.selectRole = selectRole;
window.editStaff = editStaff;
window.deleteStaff = deleteStaff;
window.closeEditStaffModal = closeEditStaffModal;
window.saveStaffEdit = saveStaffEdit;
window.switchStaffView = switchStaffView;
window.filterStaff = filterStaff;
window.logout = logout;
```

## Expected Behavior After Fix

1. Click "New Enrollment" → Table hides → Wizard appears at top → Page scrolls to top
2. Click "Close Wizard" → Wizard hides → Table reappears → Page stays in place
3. All buttons (edit, delete, filter, etc.) now work because functions are globally accessible

## Files Modified

- `admin/admin-add-parent-and-child.js`
- `admin/admin-add-staff.js`

---

# Additional Fix: Staff Management N/A Issue

**Date:** 2026-03-21

## Problem

The Staff Management page was showing "N/A" for the official ID field.

## Root Cause

The code was using `staff.official_id` which doesn't exist in the database schema. Based on the schema:
- Teachers have `teacher_id_text`
- Guards have `guard_id_text`
- Clinic staff have `clinic_id_text`

Additionally, the code was using `staff.phone` but the schema uses `contact_number`.

## Solution Applied

Updated [`renderStaffTable()`](admin/admin-add-staff.js:52) in `admin-add-staff.js` to map the correct ID and phone fields:

```javascript
if (currentStaffView === 'teachers') {
    staffData = teachers.map(t => ({ 
        ...t, 
        role_type: 'Teacher', 
        department: t.department,
        official_id: t.teacher_id_text,
        phone: t.contact_number
    }));
} else if (currentStaffView === 'guards') {
    staffData = guards.map(g => ({ 
        ...g, 
        role_type: 'Guard',
        official_id: g.guard_id_text,
        phone: g.contact_number
    }));
} else if (currentStaffView === 'clinic') {
    staffData = clinic.map(c => ({ 
        ...c, 
        role_type: c.role_title || 'Clinic Staff',
        official_id: c.clinic_id_text,
        phone: c.contact_number
    }));
}
```

## Files Modified

- `admin/admin-add-staff.js`

---

# Additional Fix: Parent/Student Database Mismatch

**Date:** 2026-03-21

## Problem

Saving parent and student data was failing due to database field mismatches.

## Root Cause

The code was inserting fields into the `students` table that don't exist in the schema:
- `dob` - NOT in students table
- `strand` - NOT in students table (it's in classes table)
- `is_active` - NOT in students table (should be `status`)

## Solution Applied

Updated [`saveStudentsToDB()`](admin/admin-add-parent-and-child.js:670) in `admin-add-parent-and-child.js`:

**Before (incorrect):**
```javascript
return {
    parent_id: currentParentId,
    full_name: student.full_name,
    lrn: student.lrn,
    gender: student.gender,
    dob: student.dob || null,        // ❌ NOT IN SCHEMA
    class_id: student.class_id,
    strand: student.strand || null,  // ❌ NOT IN SCHEMA
    student_id_text: studentID,
    qr_code_data: studentID,
    is_active: true                  // ❌ NOT IN SCHEMA
};
```

**After (correct):**
```javascript
return {
    parent_id: currentParentId,
    full_name: student.full_name,
    lrn: student.lrn,
    gender: student.gender,
    class_id: student.class_id,
    student_id_text: studentID,
    qr_code_data: studentID,
    status: 'Enrolled'                // ✅ Matches schema
};
```

## Files Modified

- `admin/admin-add-parent-and-child.js`
