# ID Card & Enrollment Form Implementation Plan

**Date:** 2026-04-03

## Overview
This plan addresses consistency issues between Main Wizard and Late Enrollee modal:
1. **ID Card Design:** Fix student ID preview with 2x3 Front/Back layout and photo upload
2. **Form Consistency:** Make Late Enrollee modal look and act EXACTLY like Step 4

---

## STEP 1: Fix ID Preview (`admin/admin-add-parent-and-child.js`)

### Goal
Replace `updateIDPreview()` with strict 2x3 Front/Back layout, handle local photo upload preview, remove parent ID card

### Changes
- **Function:** `updateIDPreview()` (lines 663-739)
- **Photo handling:** Use `URL.createObjectURL()` for local file preview
- **Layout:** 2x3 portrait Front and Back side-by-side
- **School details:** 
  - Name: "Educare Colleges Inc"
  - Address: "Purok 4 Irisan Baguio City"
- **Content:**
  - Front: School header, student photo, student name, address, class
  - Back: QR code, student ID, guardian/contact info, "If this ID is lost..." note

---

## STEP 2: Sync ID Management (`admin/admin-idmanagement.js`)

### Goal
Update `generatePortraitIDHTML()` to match the 2x3 layout from Step 1

### Changes
- **Function:** `generatePortraitIDHTML(u, config)` (lines 353-403)
- Match the exact layout and styling from Step 1
- Ensure photo display uses `profile_photo_url`
- Include strand in class label for SHS

---

## STEP 3: Unify Grade Level Enrollment UI (Main Wizard)

### Goal
Hide class dropdown by default in Main Wizard (matching Late Enrollee modal)

### Changes
- **File:** `admin/admin-add-parent-and-child.js`
- **Function:** `addStudentForm()`
- **Action:** Wrap class select in hidden container
- **HTML structure:**
  ```html
  <div class="col-span-2 hidden" id="class-container-${id}">
      <select id="${formId}-class" class="s-class ...">
          <option value="">Select Class</option>
      </select>
  </div>
  ```

---

## STEP 4: Bulletproof Auto-assignment

### Goal
Ensure grade change automatically selects class for K-10, shows dropdown for SHS

### Changes
- **File:** `admin/admin-add-parent-and-child.js`
- **Function:** `handleGradeChange(gradeSelect, formId)`
- **Logic:**
  - If only 1 class exists: auto-select and hide container (K-10)
  - If multiple classes exist: show container for strand selection (SHS)

---

## STEP 5: Rewrite Late Enrollee Modal UI

### Goal
Make Late Enrollee modal look EXACTLY like Step 4 of the main wizard

### Changes
- **File:** `admin/admin-add-parent-and-child.js`
- **Function:** `openLateEnrolleeModal(parentId)`
- **New layout:** Clean white inputs on gray background, no labels above inputs
- **Match Step 4:** Same grid structure, same placeholders, same styling
- **Hidden class dropdown:** Same behavior as Main Wizard
- **Photo upload:** Add camera icon preview box

---

## STEP 6: Add Photo Upload Logic to saveLateEnrollee()

### Goal
Enable photo upload for Late Enrollee, same as main wizard

### Changes
- **File:** `admin/admin-add-parent-and-child.js`
- **Function:** `saveLateEnrollee()`
- **Logic:**
  - Handle file upload from `late-s-photo` input
  - Upload to Supabase Storage `profiles` bucket
  - Save photo URL to `profile_photo_url` field

---

## Files to Modify

| File | Steps |
|------|-------|
| `admin/admin-add-parent-and-child.js` | 1, 3, 4, 5, 6 |
| `admin/admin-idmanagement.js` | 2 |

---

## Implementation Status

- [ ] STEP 1: Fix ID Preview (2x3 front/back, photo upload)
- [ ] STEP 2: Sync ID Management layout
- [ ] STEP 3: Unify Grade Level Enrollment UI (Main Wizard)
- [ ] STEP 4: Bulletproof Auto-assignment
- [ ] STEP 5: Rewrite Late Enrollee Modal UI
- [ ] STEP 6: Add photo upload logic to saveLateEnrollee()
- [ ] Verify all changes work correctly