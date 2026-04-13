# Debug Log: Loading Modal Timing Fix

**Date:** 2026-04-13

## Problem

When loading the admin or teacher data analytics page:
- The page showed blank content first
- The loading modal appeared too late (after data fetching started)
- Users saw an empty/blank screen before the loading indicator appeared

## Root Cause

The `loadAnalyticsData()` and `loadAnalytics()` functions were showing the loading modal only after some initial processing (like setting button states, etc.). The browser didn't have time to render the modal before data fetching began.

## Solution Applied

### 1. admin/admin-data-analytics.js

**Changes:**
1. Show loading modal IMMEDIATELY at the start of `loadAnalyticsData()` function
2. Use `requestAnimationFrame()` to force browser to render before continuing
3. Keep the existing finally block that hides the modal after completion

**Before:**
```javascript
async function loadAnalyticsData(event) {
    const btn = event?.currentTarget;
    if (btn) { ... }

    // Show loading modal - TOO LATE!
    const loadingModal = ...
```

**After:**
```javascript
async function loadAnalyticsData(event) {
    // IMMEDIATELY show loading modal before any other processing
    const loadingModal = document.getElementById('loadingModal');
    if (loadingModal) loadingModal.classList.remove('hidden');
    
    // Force browser to render before continuing
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // ... rest of code
```

### 2. teacher/teacher-data-analytics.js

Same fix applied to `loadAnalytics()` function.

## Result

The loading modal now appears immediately when:
- Page is first loaded/refreshed
- Date filter is changed
- Class filter is changed
- The "Load Analytics" button is clicked

This provides better user feedback and prevents the "blank screen" issue.
