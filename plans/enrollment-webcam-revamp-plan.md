# Enrollment UI/UX Revamp & Webcam Capture Implementation

## Overview
This plan outlines the implementation of a streamlined student enrollment system with:
1. **Single-dropdown class selection** (replacing cascading Grade → Strand → Class)
2. **Birthdate field** (new addition)
3. **Webcam Capture** for 1x1 ID photo (Capstone Flex feature)

## Implementation Status: ✅ COMPLETED

### Changes Made:

#### 1. Schema Migration
- Created `database schema/add-birthdate-column.sql` - Add birthdate column to students table

#### 2. Webcam & Class Utilities (Lines 22-95)
- Added `activeStreams` object to track webcam streams
- Added `globalClassOptions` for pre-loaded class dropdown
- Added `preloadClassOptions()` - Pre-loads classes on page load
- Added `startWebcam(formId)` - Initialize webcam stream
- Added `capturePhoto(formId)` - Capture frame to File object

#### 3. DOMContentLoaded Update
- Now calls `preloadClassOptions()` before loading forms

#### 4. `addStudentForm()` Revamp (Lines 403-456)
- Single class dropdown using `globalClassOptions`
- Birthdate input field (`<input type="date">`)
- Webcam capture UI with Use Webcam/Snap Photo buttons
- File upload fallback via hidden input

#### 5. `captureStudentData()` Update
- Now fetches birthdate from new dob field
- Uses `fileObj` property from photo container for webcam captures

#### 6. `saveStudentsToDB()` Update
- Includes `birthdate` in insert payload
- Handles webcam photo file extension

#### 7. `updateStudentSummaryView()` Update
- Shows Birthdate instead of Gender

#### 8. `openLateEnrolleeModal()` Revamp
- Same simplified single-dropdown UI
- Webcam capture + birthdate field

#### 9. `saveLateEnrollee()` Update
- Uses birthdate and class_id directly (no cascading)
- Handles webcam photo upload

#### 10. Window Exports
- Exposed `startWebcam` and `capturePhoto` to window

#### 11. Cleanup
- Removed unused `loadClassesForDropdown` and `toggleStrandField` functions