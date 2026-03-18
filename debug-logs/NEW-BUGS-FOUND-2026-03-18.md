# 📋 EDUCARE TRACK - REAL FUNCTIONAL BUGS (For Capstone Demo)
**Date:** 2026-03-18
**Priority:** ACTUAL RUNTIME ERRORS ONLY
**Philosophy:** "If it works, leave it alone" - Capstone focus

---

## 🔴 CRITICAL - ACTUAL RUNTIME ERRORS

These would CRASH or BREAK the demo:

### 1. Missing Database Constraint - attendance_logs
| | |
|---|---|
| **Issue:** | Code uses `.upsert({ student_id, log_date }, { onConflict: 'student_id, log_date' })` but no unique constraint exists |
| **Impact:** | Runtime crash when saving attendance |
| **Fix:** | Run SQL to add constraint |

```sql
-- Add unique constraint to attendance_logs
ALTER TABLE attendance_logs ADD CONSTRAINT attendance_logs_student_date_key UNIQUE (student_id, log_date);
```

### 2. QR Code Data Format - Gatekeeper Scanner
| | |
|---|---|
| **Issue:** | Old QR format `QR-NAME-ID` vs new format `EDU-2026-G010-XXXX` |
| **Impact:** | Scanner won't recognize student IDs |
| **Fix:** | Regenerate QR codes in database (run SQL from earlier debug logs)

---

## 🟡 POTENTIAL ISSUES - May cause problems

### 3. Student Status Check - Dropped Students
| | |
|---|---|
| **Issue:** | No check for student status (Active/Enrolled vs Dropped) |
| **Impact:** | Dropped students could still scan in |
| **Fix:** | Add status check in guard-core.js getStudentById()

---

## ✅ CODE QUALITY - IGNORE FOR CAPSTONE

These are NOT bugs - they work fine, just not "clean":

- ❌ console.log statements (don't affect functionality)
- ❌ alert() boxes (work fine, just ugly)
- ❌ XSS warnings (theoretical, works in demo)
- ❌ data-seeder files (useful for testing)
- ❌ Math.random() (fine for demo data)
- ❌ Multiple SQL files (don't affect runtime)

---

## 🎯 YOUR CAPSTONE PRIORITY LIST

1. **Run the SQL** to add attendance_logs constraint (if not already done)
2. **Verify QR codes** in database use correct format
3. **Test the demo flow** - login → scan → attendance shows up

Everything else is just code style - leave it alone!

---

*Simplified for Capstone - "It Works!" Focus*
