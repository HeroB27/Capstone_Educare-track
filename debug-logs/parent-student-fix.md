# Debug Log: Parent & Student Management Fixes

**Date:** 2026-04-14

## Issue 1: Student picture not showing in ID preview modal (STEP 6)

**What is the problem:**
When uploading a photo for a student in Step 4, the picture does not display in the ID preview (Step 6) during the enrollment wizard. However, when editing an existing student, the photo shows correctly.

**What cause it:**
The issue was that `studentsData` array is recreated every time `captureStudentData()` is called. This array stores a reference to the photo file object (`photoFile`) which gets lost when the array is recreated. The `formId` is stored correctly, but the `studentsPhotos` object lookup was not working reliably.

**What is the solution:**
1. Added a new variable `studentsPhotoDataUrls` to store data URLs directly when photos are selected
2. Modified `handlePhotoSelect()` to store the data URL immediately when a photo is selected
3. Modified `takeSnapshot()` to store the data URL when capturing from webcam
4. Updated `updateIDPreview()` to use the stored data URL first, which is the most reliable method
5. Updated `clearPhoto()`, `removeStudentForm()`, and `resetWizard()` to also clear `studentsPhotoDataUrls`

---

## Issue 2: Cannot save 2 or more children at the same time

**What is the problem:**
When linking 2 or more children to a parent during enrollment, only the first student enrolled is saved to the database.

**What cause it:**
The issue was in `saveStudentsToDB()` function where it was matching inserted students to their photos using array index position. When multiple students are inserted in a single batch insert:
1. The `insertedStudents` array may have indices that don't correspond 1:1 with the original `studentsData` array positions
2. The photo file matching was using index `i` to look up from `studentsData`, but the relationship could be broken

**What is the solution:**
1. Added debug logging to track the insertion and photo upload process
2. Improved the student-photo matching logic to use `formId` for reliable matching
3. Made filename generation more unique by including the student index in the filename
4. Added `captureStudentData()` call in `nextStep()` before validation to ensure data is fresh

---

## Issue 3: Remove "Save as JPEG" button

**What is the problem:**
The "Download JPEG" button was present in Step 6 of the enrollment wizard but was non-functional.

**What is the solution:**
Removed the "Download JPEG" button from the HTML template, keeping only the "Print / Save as PDF" button which works correctly.

---

## Summary of Changes

| File | Changes |
|------|---------|
| `admin-add-parent-and-child.js` | Added `studentsPhotoDataUrls` variable. Fixed photo handling across `handlePhotoSelect()`, `takeSnapshot()`, `updateIDPreview()`, `clearPhoto()`, `removeStudentForm()`, and `resetWizard()`. Enhanced `saveStudentsToDB()` with debug logging |
| `admin-add-parent-and-child.html` | Removed "Download JPEG" button |
