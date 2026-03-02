# Gatekeeper QR Code Format Mismatch - Critical Issue
Date: 2026-03-02

## Problem
The guard scanner expects QR codes in the format `EDU-YYYY-G###-XXXX` (e.g., `EDU-2026-G001-A1B2`) but the database contains QR codes in the format `QR-NAME-ID` (e.g., `QR-JUAN-CRUZ-001`).

## Root Cause
- **Expected format in code:** `/^EDU-\d{4}-[GK]\d{3}-[A-Z0-9]{4}$/`
- **Actual format in database:** `QR-JUAN-CRUZ-001`, `QR-MARIA-CRUZ-002`, etc.

## Impact
- All QR code scans will fail with "Invalid QR Code format" error
- The system cannot scan any students until QR codes are regenerated in the correct format

## Solution Options

### Option 1: Update QR Code Generation (Recommended)
Update the QR code generation to use the expected format:
- Format: `EDU-2026-G001-A1B2`
- Where: Year=2026, Grade=G001 (for Grade 1), UniqueID=A1B2

### Option 2: Modify Code to Accept Current Format
Change the SCAN_REGEX to accept both formats:
```javascript
const SCAN_REGEX = /(^EDU-\d{4}-[GK]\d{1,3}-[A-Z0-9]{4}$)|(^QR-.+$)/;
```

And update `extractStudentId()` to handle both formats.

## Database Evidence
```
Student: Juan Cruz Jr. - QR: QR-JUAN-CRUZ-001
Student: Maria Cruz - QR: QR-MARIA-CRUZ-002
Student: Mark Santos - QR: QR-MARK-SANTOS-003
Student: Anna Santos - QR: QR-ANNA-SANTOS-004
```

## Recommended Action
Regenerate all student QR codes in the `EDU-YYYY-G###-XXXX` format to match the scanner validation.
