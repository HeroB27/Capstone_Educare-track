# Debug Log: teacher-subject-attendance.js - currentClassId not defined

**Date**: 2026-03-21
**Error**: ReferenceError: currentClassId is not defined
**Location**: teacher-subject-attendance.js:351

## Problem
The function `loadSubjectStudents()` references `currentClassId` at line 351:
```javascript
const classId = currentClassId || (allStudents[0]?.class_id);
```

But `currentClassId` is never declared or set anywhere in the file.

## Root Cause Analysis

### Source 1: Missing Variable Declaration (MOST LIKELY)
- The file declares `currentSubjectLoadId` and `currentSubjectName` as global state variables (lines 13-14)
- But `currentClassId` is never declared
- The developer likely intended to set this when selecting a subject card

### Source 2: Data Already Available
- Inside `loadSubjectStudents`, the `subjectLoad` object already contains `class_id` (fetched at lines 282-288)
- The code fetches: `select('class_id, subject_name')` from `subject_loads`
- So `subjectLoad.class_id` already has the value we need

## Solution Options

### Option A: Use existing data directly (RECOMMENDED)
The `subjectLoad.class_id` is already fetched. We can use it directly:
```javascript
const classId = subjectLoad.class_id;
```

### Option B: Declare currentClassId globally
Add `let currentClassId = null;` to global state and set it in `selectSubjectCard`:
```javascript
currentClassId = subjectLoad.class_id;
```

## Recommendation
Option A is cleaner - the data is already fetched and there's no need for an additional global variable.

## FIX APPLIED (2026-03-21)
Changed line 351 from:
```javascript
const classId = currentClassId || (allStudents[0]?.class_id);
```
To:
```javascript
const classId = subjectLoad.class_id;
```

**Status**: FIXED - Students will now load correctly in teacher-subject-attendance.js
