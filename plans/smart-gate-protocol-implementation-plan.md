# Smart Gate Protocol Implementation Plan

## Overview
Implement "Smart Gate Protocols" for the Gatekeeper Scanning Engine across Teacher and Guard modules. This includes Pre-Planned Suspension lockouts, Mid-Day Emergency modes (Exits Only), Weekend detection, and Duplicate Scan protection.

---

## CRITICAL PRE-FLIGHT FIX: Standardize QR Scanning Format
**Official Student ID Format:** `EDU-YYYY-LLLL-XXXX` (e.g., EDU-2026-G010-A1B2)

### Current vs Target Regex
| File | Current | Target |
|------|---------|--------|
| `guard/guard-core.js` | `/^STU-\d{4}-\d{4}$/` | `/^EDU-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i` |
| `teacher/teacher-gatekeeper-mode.js` | `/^EDU-\d{4}-[GK]\d{1,3}-[A-Z0-9]{4}$/` | `/^EDU-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i` |
| `clinic/clinic-scanner.js` | `/^EDU-\d{4}-[GK]\d{3}-[A-Z0-9]{4}$/` | `/^EDU-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i` |

---

## Project Context
- **Stack:** HTML5, Tailwind CSS (CDN), Vanilla JavaScript, Supabase (BaaS)
- **Database:** Supabase (suspensions table with `created_at`, `start_date`, `end_date`, `is_active`, `title`, `saturday_enabled`)
- **Target Files:**
  - `core/general-core.js` - Add Smart Gate Evaluator
  - `teacher/teacher-gatekeeper-mode.js` - Upgrade Teacher Scanner
  - `guard/guard-core.js` - Upgrade Guard Scanner

---

## Implementation Phases

### PHASE 0: Pre-Flight Fix (QR Regex Standardization)
**Target Files:** All scanner JS files

Update SCAN_REGEX in:
- [ ] `guard/guard-core.js` (line 20)
- [ ] `teacher/teacher-gatekeeper-mode.js` (line 26)
- [ ] `clinic/clinic-scanner.js` (line 14)

**New Regex:** `const SCAN_REGEX = /^EDU-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;`

---

### PHASE 1: Smart Gate Evaluator (Core)
**Target File:** `core/general-core.js`

Add the `window.evaluateGateStatus()` function that:
1. Checks weekend status (Sunday closed, Saturday depends on settings)
2. Fetches active suspensions for today
3. Determines if pre-planned (Campus Closed) or emergency (Exits Only)
4. Returns gate status object with `active`, `allowEntry`, `allowExit`, `message`

```javascript
// ==========================================
// SMART GATEKEEPER PROTOCOL ENGINE
// ==========================================
window.evaluateGateStatus = async function() {
    try {
        const localDate = new Date();
        localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
        const todayStr = localDate.toISOString().split('T')[0];
        const dayOfWeek = localDate.getDay(); // 0 = Sunday, 6 = Saturday

        // 1. Fetch Active Suspensions/Holidays for Today
        const { data: suspensions, error } = await supabase
            .from('suspensions')
            .select('title, created_at, start_date, saturday_enabled')
            .eq('is_active', true)
            .lte('start_date', todayStr)
            .gte('end_date', todayStr)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) throw error;

        // 2. Weekend Check (Strict Sunday block, Saturday depends on active suspensions)
        if (dayOfWeek === 0) {
            return { active: false, allowEntry: false, allowExit: false, message: 'CAMPUS CLOSED (Sunday)' };
        }
        if (dayOfWeek === 6) {
            // Check if there's an active override for this Saturday
            const hasSaturdayOverride = suspensions && suspensions.length > 0 && suspensions[0].saturday_enabled;
            if (!hasSaturdayOverride) {
                return { active: false, allowEntry: false, allowExit: false, message: 'CAMPUS CLOSED (Saturday)' };
            }
        }

        if (suspensions && suspensions.length > 0) {
            const sus = suspensions[0];
            const createdDateStr = new Date(sus.created_at).toISOString().split('T')[0];

            // 3. Emergency vs Pre-Planned Check
            if (createdDateStr === todayStr) {
                // Suspension was declared TODAY (Mid-day emergency)
                return { 
                    active: true, 
                    allowEntry: false, 
                    allowExit: true, 
                    message: `EMERGENCY EXITS ONLY: ${sus.title}` 
                };
            } else {
                // Suspension was declared BEFORE today (Pre-planned)
                return { 
                    active: false, 
                    allowEntry: false, 
                    allowExit: false, 
                    message: `CAMPUS CLOSED: ${sus.title}` 
                };
            }
        }

        // Default: Normal Operations
        return { active: true, allowEntry: true, allowExit: true, message: 'GATE ACTIVE' };

    } catch (err) {
        console.error("Gate Protocol Error:", err);
        // Fail-safe Open: If database fails, don't trap students at the gate
        return { active: true, allowEntry: true, allowExit: true, message: 'GATE ACTIVE (Offline Mode)' }; 
    }
};
```

---

### PHASE 2: Upgrade Teacher Scanner
**Target File:** `teacher/teacher-gatekeeper-mode.js`

#### Changes Required:
1. Update SCAN_REGEX to unified format
2. Add gate status evaluation at start of scan processing
3. Add UI indicator for emergency mode (red pulsing badge)
4. Apply directional locks based on gate status

---

### PHASE 3: Upgrade Guard Scanner
**Target File:** `guard/guard-core.js`

#### Changes Required:
1. Update SCAN_REGEX to unified format
2. Add gate status evaluation in `onScanSuccess` function
3. Add UI indicator for emergency mode
4. Apply directional locks based on gate status

---

### PHASE 4: UI Refinement
**Target Files:**
- `teacher/teacher-gatekeeper-mode.html`
- `guard/scanner.html`

#### Goals:
1. Make scanner UIs mobile-friendly
2. Match design with clinic scanner (`clinic/clinic-scanner.html`)

---

## Business Logic Rules

### 1. Weekend Lock
- **Sunday:** Always closed (no override)
- **Saturday:** Closed unless `saturday_enabled = true` in suspension

### 2. Pre-Planned Suspension
- If suspension was created **before** today → **Campus Closed**
- Scanner completely disabled
- UI shows: "CAMPUS CLOSED: [Reason]"

### 3. Emergency Mid-Day Suspension
- If suspension was created **today** → **Emergency Mode**
- Tap-Ins (Entries) blocked
- Tap-Outs (Exits) permitted
- UI shows: "EMERGENCY EXITS ONLY: [Reason]"

### 4. Duplicate Scan Protection
- Block same student within 2-minute window
- Use local Map for instant blocking without Supabase queries

---

## Implementation Order

1. **Phase 0:** Standardize QR Regex across all scanners
2. **Phase 1:** Add `evaluateGateStatus()` to `core/general-core.js`
3. **Phase 2:** Upgrade Teacher Scanner
4. **Phase 3:** Upgrade Guard Scanner
5. **Phase 4:** UI Refinement

---

## Testing Checklist

- [ ] Test QR regex validates new format correctly
- [ ] Test Sunday closure (should show CAMPUS CLOSED)
- [ ] Test pre-planned suspension (created before today)
- [ ] Test emergency suspension (created today)
- [ ] Test entry blocked during emergency mode
- [ ] Test exit allowed during emergency mode
- [ ] Test mobile responsiveness of scanner UIs
