# Timezone Bug Diagnosis - Admin Dashboard Counters

**Date:** 2026-03-09

## Problem
The Admin Dashboard is showing 0 for all attendance counters (Present, Late, Absent, Clinic).

## Root Cause Analysis
1. **Seeder Issue:** The `data-seeder.js` uses `new Date().toISOString()` which converts to UTC
   - At 7:40 AM Philippine Time (UTC+8), it's still 11:40 PM UTC (23:40) the previous day
   - The seeded attendance logs were saved with yesterday's date (March 8)

2. **Dashboard Issue:** The `admin-core.js` uses `toISOString().split('T')[0]` which also converts to UTC
   - It queries the database for today's date (March 9 in PHT)
   - But the data was saved as March 8 in UTC, so 0 records are found

## Solution Applied

### Patch 1: admin-core.js
- Changed `loadDashboardStats()` to use strict Philippine Timezone (Asia/Manila)
- Uses `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' })` to get the correct date
- Modified clinic query to explicitly check for 'In Clinic' status with proper time boundary

### Patch 2: data-seeder.js  
- Changed `seedTodayAttendance()` to use strict Philippine Timezone
- Uses `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' })` to generate correct date string

## Verification Steps
1. Run TRUNCATE SQL command in Supabase SQL Editor
2. Click "Start Seeding" on data-seeder.html
3. Refresh Admin Dashboard - counters should now show correct values
