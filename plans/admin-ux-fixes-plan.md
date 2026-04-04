# Admin Module UX Fixes - Execution Plan

## Task Overview
Fix "Illogical Enrollment" (auto-class selection) and deploy universal pagination across admin CRUD tables.

---

## STEP 1: Fix handleGradeChange in admin-user-management.js

**File:** `admin/admin-user-management.js`
**Lines:** 844-890
**Issue:** Missing auto-select logic when only 1 class exists for a grade (K-10)

**Current Code (lines 876-884):**
```javascript
const classOptions = classes && classes.length > 0 
    ? classes.map(c => {
        const displayName = c.strand ? `${c.grade_level} - ${c.strand}` : c.grade_level;
        return `<option value="${c.id}">${displayName}</option>`;
      }).join('')
    : '<option value="">No classes available for this grade</option>';
classSelect.innerHTML = classOptions;
```

**Required Changes:**
1. If `classes.length === 1`: auto-select and hide dropdown container
2. If `classes.length > 1`: show dropdown for SHS strands
3. If `classes.length === 0`: show "No classes available"

---

## STEP 2: Add Pagination to admin-add-parent-and-child.js

**File:** `admin/admin-add-parent-and-child.js`
**Function:** `renderParentStudentTable()` (line 61)

**Required Changes:**
1. Add pagination state: `currentPage`, `rowsPerPage`
2. Slice data before rendering
3. Add pagination controls HTML (Next/Prev + Page indicator)
4. Add pagination functions

---

## STEP 3: Add Pagination to admin-add-staff.js

**File:** `admin/admin-add-staff.js`
**Function:** `renderStaffTable()` (line 52)

**Required Changes:**
1. Add pagination state: `currentPage`, `rowsPerPage`
2. Slice data before rendering
3. Add pagination controls HTML
4. Add pagination functions

---

## Already Paginated (VERIFIED)
- `admin-idmanagement.js` ✓
- `admin-audit-logs.js` ✓

---

## Implementation Strategy
1. Add pagination to both files using identical pattern (10 rows/page)
2. Follow existing patterns from admin-idmanagement.js
3. Minimal UI changes - use Tailwind for controls