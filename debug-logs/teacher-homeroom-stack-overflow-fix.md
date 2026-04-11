# Debug Log: teacher-homeroom-table.js Stack Overflow

**Date:** 2026-04-08

## Problem
Maximum call stack size exceeded error occurring in saveAllPending function at teacher-homeroom-table.js:347

Stack trace showed infinite loop:
- showNotification (teacher-homeroom-table.js:415) → showToast (teacher-core.js:1098) → showNotification (teacher-homeroom-table.js:415) → repeat

## Cause
Circular dependency between two functions:
1. `showNotification` in teacher-homeroom-table.js calls `window.showToast`
2. `showToast` in teacher-core.js calls `window.showNotification`

When both are loaded, they call each other infinitely.

## Solution
1. Modified `showToast` in teacher-core.js to have its own implementation instead of calling showNotification
2. Added guard flag `toastActive` to prevent concurrent toasts
3. Exported `showNotification` to window for other modules to use

## Files Modified
- teacher/teacher-core.js:1096-1115
- teacher/teacher-homeroom-table.js:414-419