# Guard Module - Wire and Light Bulb Verification Report

## Executive Summary
The Guard Module has **1 CRITICAL BUG** that will cause all scans to fail. The other 3 areas are properly wired.

---

## Verification Results by Feature Area

### ✅ 1. Morning UTC Timezone Trap - ALREADY FIXED
**Status: WORKING CORRECTLY**

The code uses `getLocalISOString()` instead of raw UTC:
- [`guard-core.js:292`](guard/guard-core.js:292): `const today = getLocalISOString();`
- [`guard-core.js:399`](guard/guard-core.js:399): `const today = getLocalISOString();`
- [`guard-core.js:663`](guard/guard-core.js:663): `const today = getLocalISOString();`

This prevents the "previous day" bug in Philippine timezone.

---

### ✅ 2. Duplicate Scan & Sound Feedback - FULLY WIRED
**Status: WORKING CORRECTLY**

- **Duplicate threshold**: 120000ms (2 minutes) - Line 19
- **Buzzer on duplicate**: Line 226 - `playBuzzer()` is called
- **UI Toast**: Line 227 - `triggerScanFeedback(false, 'Duplicate scan - please wait 2 minutes', 'DUPLICATE', '')`
- **Audio safely wrapped**: Line 987 - `.catch(e => console.log('Audio play failed:', e))`

---

### ✅ 3. Status Calculation Logic - FULLY WIRED
**Status: WORKING CORRECTLY**

- **Late threshold lookup**: Line 334 - `const lateThreshold = await getLateThreshold(gradeLevel);`
- **Calculate status**: Line 337 - `calculateStatus(scanTime, direction, gradeLevel, lateThreshold, dismissalTime);`
- **Late exit check**: Lines 484, 536-544 - `isLateExit()` is wired into the save payload

---

### 🔴 4. QR Regex & Parsing Engine - CRITICAL BUG FOUND

#### The Problem
The code expects format: `EDU-2026-G001-A1B2` (Regex: `/^EDU-\d{4}-[GK]\d{3}-[A-Z0-9]{4}$/`)

But the **actual database data** uses: `STU-2025-0001`, `STU-2025-0002`, etc.

See [`seed-data.sql:177-192`](database schema/seed-data.sql:177):
```sql
('123456789001', 'STU-2025-0001', 'Alden Rivera', ..., 'STU-2025-0001', 'Enrolled'),
```

#### The Crash Chain
1. **SCAN_REGEX fails** (Line 20): `STU-2025-0001` doesn't match `/^EDU-\d{4}-[GK]\d{3}-[A-Z0-9]{4}$/`
2. **Even if we bypass regex**: `extractStudentId("STU-2025-0001")` returns `"0001"` (parts[3])
3. **Lookup fails**: `.eq('qr_code_data', "0001")` won't find `"STU-2025-0001"`

#### ✅ THE FIX
Update [`guard-core.js`](guard/guard-core.js) lines 20 and 267:

```javascript
// Line 20 - Update SCAN_REGEX to match actual data format:
// OLD (BROKEN):
const SCAN_REGEX = /^EDU-\d{4}-[GK]\d{3}-[A-Z0-9]{4}$/;

// NEW (FIXED):
const SCAN_REGEX = /^STU-\d{4}-\d{4}$/;  // Matches STU-2025-0001

// Lines 267-274 - Update extractStudentId to return full ID:
// OLD (BROKEN):
function extractStudentId(qrCode) {
    const parts = qrCode.split('-');
    if (parts.length === 4) {
        return parts[3];  // Returns "0001" - WRONG!
    }
    return null;
}

// NEW (FIXED):
function extractStudentId(qrCode) {
    // Return the full QR code as-is (e.g., "STU-2025-0001")
    // The getStudentById function will handle the lookup
    return qrCode;
}
```

---

## Summary

| Feature | Status | Fix Required |
|---------|--------|--------------|
| Morning UTC Trap | ✅ Already fixed | No |
| Duplicate & Sound | ✅ Wired | No |
| Status Calculation | ✅ Wired | No |
| QR Regex/Parsing | ❌ CRITICAL BUG | ✅ JS fix above |
