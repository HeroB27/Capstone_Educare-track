# Educare Track - School Management System

## 📚 Overview

**Educare Track** is a comprehensive Capstone-level School Management System built with modern web technologies. It provides end-to-end solutions for managing student attendance, academic performance, administrative tasks, and communication across multiple user roles (Admins, Teachers, Parents, Guards, and Clinic Staff).

The system leverages **Supabase** as a Backend-as-a-Service (BaaS) platform, treating it like a traditional SQL database with simple table queries for authentication and business logic. Built with **Vanilla JavaScript** and styled with **Tailwind CSS**, the system follows a modular, role-based architecture with strict KISS (Keep It Simple, Stupid) principles.

---

## 🎯 Key Features

### 📅 Attendance Management
- **Real-time Gate Scanning**: Automated attendance tracking via gate entry/exit scans
- **Subject-Based Attendance**: Teachers can mark attendance per subject slot
- **Daily Summary Batch Jobs**: Automated nightly processing (00:05) consolidates attendance data
- **Critical Absence Alerts**: Automated nightly checks (01:00) flag students with ≥20% unexcused absences (DepEd 20% Rule)
- **Half-Day Tracking**: Supports morning-only and afternoon-only sessions
- **Kinder Session Handling**: Automatic exclusion of afternoon sessions for Kinder students
- **Excuse Letter Management**: Parent-submitted absence justifications with approval workflow
- **Afternoon Auto-Present Rule**: Non-Kinder students with no early exit are auto-marked Present in afternoon

### 🎓 Multi-Role Support
- **Admin**: Full system control, user management, class scheduling, announcements, audit logs
- **Teacher**: Homeroom attendance, subject attendance, student management, calendar, guard pass issuance
- **Parent**: Child attendance tracking, notifications, excuse letters, announcements, calendar
- **Guard**: Gate pass verification, student entry/exit logging, basic analytics
- **Clinic**: Visit tracking, health records, parent notifications, system settings

### 📊 Data Analytics
- **Attendance Analytics**: Summary-based and log-based analytics with toggle
- **Student Performance**: Unexcused absence rates, attendance percentages
- **Daily/Weekly/Monthly Reports**: Automated summary generation
- **Guard Pass Tracking**: Monitor issued passes and usage
- **Clinic Visit Analytics**: Health incident tracking

### 📢 Communication
- **Announcements Board**: Role-targeted announcements (teachers, parents, guards, clinic)
- **Notification System**: Real-time alerts for critical events (absences, passes, visits)
- **Excuse Letter Workflow**: Digital submission and approval process

### 🔐 Security & Compliance
- **Session Management**: Dual-storage (localStorage + sessionStorage) with Remember Me support
- **Role-Based Access Control**: Strict validation preventing unauthorized access
- **Audit Logging**: Comprehensive activity tracking
- **Data Privacy**: Proper separation of user roles and PII protection

---

## 🏗️ Architecture

### Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | HTML5, Vanilla JavaScript (ES6+) |
| **Styling** | Tailwind CSS (CDN) |
| **Backend** | Supabase (PostgreSQL BaaS) |
| **Database** | PostgreSQL with Supabase API |
| **Deployment** | Static hosting (no build tools required) |

### Design Philosophy

**KISS Principle (Keep It Simple, Stupid)**
- No frameworks (React, Vue, etc.)
- No build tools (Webpack, Vite, etc.)
- Vanilla JavaScript only
- Simple DOM manipulation
- Modular file structure

**Database Integrity**
- Supabase treated as standard SQL database
- No complex RLS policies
- Custom table-based authentication
- Simple queries without ORM abstraction

---

## 📂 Project Structure

```
Educare Track/
├── assets/
│   └── supabase-client.js      # Supabase client initialization
├── core/                       # Shared core modules
│   ├── attendance-daily-summary-batch.js  # Nightly batch job (00:05)
│   ├── attendance-rules.js     # DepEd 20% rule engine
│   ├── attendance-helpers.js   # Shared attendance utilities
│   ├── attendance-utils.js     # Additional attendance helpers
│   ├── general-core.js         # Session, auth, constants
│   └── notification-engine.js  # Notification system
├── admin/                      # Admin modules
│   ├── admin-core.js
│   ├── admin-attendance-settings.js
│   ├── admin-user-management.js
│   ├── admin-class-management.js
│   ├── admin-grade-schedules.js
│   ├── admin-guard-passes.js
│   ├── admin-audit-logs.js
│   └── ...
├── teacher/                    # Teacher modules
│   ├── teacher-core.js
│   ├── teacher-attendance.js
│   ├── teacher-homeroom.js
│   ├── teacher-subject-attendance.js
│   ├── teacher-calendar.js
│   ├── teacher-gatekeeper-mode.js
│   └── ...
├── parent/                     # Parent modules
│   ├── parent-core.js
│   ├── parent-dashboard.js
│   ├── parent-childs-attendance.js
│   ├── parent-calendar.js
│   ├── parent-notifications.js
│   └── ...
├── guard/                      # Guard modules
│   ├── guard-core.js
│   ├── guard-verification.js
│   ├── guard-basic-analytics.js
│   └── guard-system-settings.js
├── clinic/                     # Clinic modules
│   ├── clinic-core.js
│   ├── clinic-data-analytics.js
│   ├── clinic-notifications.js
│   └── clinic-system-settings.js
├── migrations/                 # Database migrations
│   ├── add_attendance_daily_summary_status_check.sql
│   ├── add_attendance_logs_indexes.sql
│   └── ...
├── database schema/            # Schema definitions
│   └── database-schema.txt
├── development-rules/          # Development guidelines
│   └── generalrules.md
├── plans/                      # Project plans & documentation
│   └── attendance_and_data_analytics.md
├── debug-logs/                 # Debug and issue logs
├── index.html                  # Main entry point
└── README.md                   # This file
```

---

## 🗄️ Database Schema

### Core Tables

#### **1. Users & Roles**
- `admins` - System administrators
- `teachers` - Teaching staff with homeroom assignments
- `parents` - Parent/guardian accounts
- `guards` - Gate security personnel
- `clinic_staff` - School health clinic staff
- `students` - Student records (linked to classes)

#### **2. Attendance**
- `attendance_daily_summary` - Daily consolidated attendance (morning/afternoon status)
- `attendance_logs` - Raw gate scans and subject attendance logs
- `attendance_patterns` - Critical absence pattern tracking

#### **3. Academic**
- `classes` - Class sections with grade level, adviser, room
- `subject_loads` - Teacher-subject assignments
- `grade_schedules` - School start/end times per grade level
- `holidays` - Holiday calendar with time coverage

#### **4. Operations**
- `guard_passes` - Issued gate passes for early exits
- `clinic_visits` - Student health visit records
- `excuse_letters` - Parent-submitted absence justifications
- `announcements` - System-wide communications
- `notifications` - User notifications

#### **5. System**
- `id_templates` - ID card template configurations
- `settings` - System settings (key-value)

### Key Relationships

```
classes ────┬─── teachers (adviser)
            └─── students (class_id)
                ├─── attendance_daily_summary (student_id)
                ├─── attendance_logs (student_id)
                ├─── guard_passes (student_id)
                └─── clinic_visits (student_id)

teachers ───┬─── guard_passes (teacher_id)
           └─── clinic_visits (referred_by_teacher_id)

parents ─── excuse_letters (parent_id)
           
guard_passes ── Early Exit Authorization ── attendance_logs (afternoon_status)
clinic_visits ── Sent Home ── attendance_logs (afternoon_status)
```

---

## ⚙️ Configuration

### Feature Flags

Located in `core/attendance-rules.js` and `core/attendance-helpers.js`:

```javascript
const USE_NEW_ATTENDANCE_LOGIC = true;      // Enable batch processing
const USE_SUMMARY_ANALYTICS = true;          // Use daily_summary vs raw logs
const CRITICAL_ABSENCE_THRESHOLD = 0.20;    // 20% unexcused threshold
```

### Supabase Configuration

File: `assets/supabase-client.js`

```javascript
const SUPABASE_URL = 'https://nfocaznjnyslkoejjoaa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

**Note**: The Supabase client uses a guard pattern to prevent re-declaration errors when scripts are loaded multiple times.

---

## 🔄 Attendance Logic

### Morning/Afternoon Sessions

| Grade Level | Morning Session | Afternoon Session |
|------------|----------------|-------------------|
| Kinder     | ✅ Tracked     | ❌ N/A (NULL)     |
| Grade 1-12 | ✅ Tracked     | ✅ Tracked        |

### Status Values

Defined in `core/general-core.js`:

- **Present** - Attended session
- **Late** - Arrived after scheduled start
- **Absent** - Did not attend
- **Excused** - Approved absence (excuse letter)
- **N/A** - Session not applicable (Kinder afternoon)

### Afternoon Auto-Present Rule

**If ALL conditions are met:**
1. Student is Non-Kinder (has afternoon session)
2. Morning status = Present/Late/Excused
3. Afternoon status = Absent (not already Present)
4. No early exit detected:
   - No `time_out` before dismissal in `attendance_logs`
   - No active Guard Pass
   - No "sent home" in `clinic_visits`
5. No authorized early exit recorded

**Then:** Afternoon status is auto-corrected to **Present**.

This prevents false afternoon absences for students who stay until dismissal but weren't scanned out.

---

## 🕐 Batch Jobs & Scheduling

### Nightly Batch Processing

#### **1. Daily Summary Batch** ⏰ 00:05

**File:** `core/attendance-daily-summary-batch.js`

**Runs:** Daily at 00:05 (processes yesterday's data)

**Functions:**
- Creates missing `attendance_daily_summary` rows for all enrolled students
- Derives morning/afternoon status from:
  - Gate scan data (`attendance_logs.time_in` / `time_out`)
  - Subject attendance records
  - Guard pass usage
  - Clinic visit "sent home" flags
- Applies afternoon auto-present rule
- Skips holidays and suspensions
- Handles half-day holidays correctly

**Key Methods:**
```javascript
syncDailySummaryForDate(dateStr)   // Main batch processing
runDailySync()                      // Runs for yesterday
syncStudentDailySummary(studentId, dateStr)  // Per-student
```

#### **2. Critical Absence Check** ⏰ 01:00

**File:** `core/attendance-rules.js`

**Runs:** Daily at 01:00

**Functions:**
- Calculates total school days (excludes Sundays, full-day holidays, suspensions)
- Counts unexcused absences per student (excludes excuse letters)
- Flags students with ≥20% unexcused absence rate
- Inserts into `attendance_patterns` table
- Sends notifications to:
  - Homeroom teacher
  - All admin users

**Key Methods:**
```javascript
checkCriticalAbsencesDryRun(schoolYear)  // Validation only
runCriticalAbsenceCheck(schoolYear)      // Full implementation
getTotalSchoolDays(schoolYear)           // School day calculation
```

### Manual Scheduler UI

**File:** `attendance-scheduler.html`

Features:
- "Run Now" buttons for each batch job
- Date picker for running jobs on specific dates
- Real-time logging
- Visual status indicators (Running/Idle)
- Dry-run mode for critical absence check

### Production Deployment

For automated cron scheduling:

**Linux (crontab):**
```bash
# Daily Summary: 00:05
5 0 * * * /usr/bin/curl -X POST https://yoursite.com/api/run-daily-summary

# Critical Absence Check: 01:00
0 1 * * * /usr/bin/curl -X POST https://yoursite.com/api/run-critical-absence-check
```

**Docker:**
```dockerfile
# Use node-cron package or cron container
```

**Windows:**
- Use Task Scheduler to trigger batch endpoints

---

## 🧪 Testing Suite

### Test Checklist

**File:** `test-attendance-checklist.js`

Comprehensive test suite covering:

#### **Test 1: Manual Absent Override Reflects in Analytics**
- Teacher marks student Absent in homeroom
- Verifies `attendance_daily_summary` updates correctly
- Checks both morning and afternoon marked as Absent

#### **Test 2: Excused Absences Not Flagged**
- Student has approved excuse letters
- Verifies excused absences excluded from critical absence calculation
- Confirms 20% threshold uses unexcused absences only

#### **Test 3: Half-Day Absences Computed Correctly**
- Student absent morning only (or afternoon only)
- Verifies summary shows correct split
- Confirms half-day handling in daily summary

#### **Test 4: Kinder Excluded from Afternoon**
- Kinder student (grade_level = 'Kinder')
- Verifies `afternoon_status = 'N/A'` in summary
- Morning session still tracked normally

#### **Test 5: Morning-Only Holiday Works**
- Holiday with `time_coverage = 'Morning Only'`
- Verifies no morning session, but afternoon session possible
- Checks holiday table configuration

#### **Test 6: Feature Flag Toggle Works**
- Verifies `USE_SUMMARY_ANALYTICS` flag exists
- Confirms analytics can toggle between modes
- All admin/teacher analytics respect the flag

**Usage:**
```javascript
// Run all tests
AttendanceTestSuite.runAll();

// Run individual test
AttendanceTestSuite.test1_manualAbsentOverride();
```

---

## 🔐 Authentication & Session Management

### Login Flow

1. **User enters credentials** on login page (`index.html`)
2. **System queries** corresponding user table (`admins`, `teachers`, etc.)
3. **On success:** User object stored in:
   - `localStorage` (if "Remember Me" checked)
   - `sessionStorage` (temporary session)
4. **Redirect** to appropriate dashboard

### Session Validation

**In every dashboard:** Call at the top:

```javascript
const user = checkSession('teacher');  // or 'admin', 'parent', etc.
if (!user) return;  // Redirects to login
```

**Function:** `checkSession(requiredRole)` in `core/general-core.js`

- Validates session exists in either storage
- Checks role matches required role
- Redirects to login on failure
- Returns user object on success

### Logout

**Function:** `logout()` in `core/general-core.js`

- Clears `educare_user` from both storages
- Clears all cached data
- Redirects to login page

---

## 📝 Development Guidelines

### Coding Standards

**NO OVERENGINEERING (KISS)**
- ❌ No frameworks (React, Vue, Angular)
- ❌ No build tools (Webpack, Vite)
- ❌ No complex package managers
- ✅ Vanilla JavaScript only
- ✅ Simple DOM manipulation

**DATABASE INTEGRITY**
- ✅ Always reference `database-schema.txt` before queries
- ❌ No inventing columns or tables
- ❌ No generic `users` table (use role-specific tables)
- ✅ Ask if column is missing

**FILE STRUCTURE**
- ✅ Keep logic in role-specific folders
- ✅ Shared utilities in `core/`
- ✅ Always go up one level (`../`) for shared resources
- ✅ Correct import path: `../assets/supabase-client.js`

**CODE QUALITY**
- ✅ Comment before every major function
- ✅ Explain what it does AND why
- ✅ Use `// UPDATED: [Reason]` when modifying existing code
- ✅ Explain business rules in comments
- ✅ Focus on functionality first, aesthetics second

**SUPABASE SYNTAX**
- ✅ Use v2 syntax: `supabase.from('table').select()`
- ❌ No `.auth.signIn()` (custom table auth)
- ✅ Use `.select()` to check credentials

### Example: Correct Query Pattern

```javascript
// ✅ CORRECT: Reference schema, use v2 syntax
const { data: teacher } = await supabase
    .from('teachers')
    .select('*')
    .eq('username', username)
    .single();

// ❌ WRONG: Generic users table doesn't exist
const { data: user } = await supabase
    .from('users')  // WRONG!
    .select('*')
    .eq('username', username);
```

---

## 🚀 Running the Application

### Prerequisites

- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet access (for Supabase CDN and API)
- No build tools required!

### Local Development

1. **Clone or extract** the project files
2. **Open** `index.html` in a web browser
3. **Login** with existing credentials or use seed data

### Using Seed Data

**File:** `database schema/seed-data.sql`

Import into Supabase to populate:
- Admin accounts
- Teachers with subjects
- Students with class assignments
- Parents linked to students

**Data Seeder Tool:** `data-seeder.html` / `data-seeder.js`

---

## 🔧 API Reference

### Core Modules

#### **general-core.js**
- `checkSession(requiredRole)` - Validate user session
- `logout()` - Clear session and redirect
- `setWelcomeMessage(elementId, user)` - Display greeting
- `ATTENDANCE_STATUS` - Canonical status constants

#### **attendance-helpers.js**
- `getLocalDateString(date)` - Format date (YYYY-MM-DD)
- `getTotalSchoolDays(startDate, endDate, gradeLevel)` - Count valid school days
- `countUnexcusedAbsentDays(studentId, startDate, endDate)` - Count unexcused absences
- `getAttendanceRate(studentId, startDate, endDate)` - Calculate percentage
- `syncStudentDailySummary(studentId, dateStr)` - Sync single student summary
- `applyAfternoonAutoPresentRule(studentId, dateStr)` - Apply auto-present logic
- `checkSchoolDay(dateStr, gradeLevel)` - Validate school day
- `isKinderStudent(studentId)` - Check if Kinder

#### **attendance-rules.js**
- `checkCriticalAbsencesDryRun(schoolYear)` - Validate without modifications
- `checkGradeCriticalAbsences(gradeLevel, schoolYear)` - Check single grade
- `calculateStudentAbsences(studentId, schoolYear, totalDays)` - Calculate stats
- `runCriticalAbsenceCheck(schoolYear)` - Full check with inserts and notifications

#### **attendance-daily-summary-batch.js**
- `syncDailySummaryForDate(dateStr)` - Main batch processor
- `runDailySync()` - Run for yesterday
- `runDailySyncForDate(dateStr)` - Run for specific date

#### **notification-engine.js**
- `createNotification(recipientId, title, message, type)` - Send notification
- `getNotifications(recipientId)` - Retrieve user notifications
- `markNotificationRead(notificationId)` - Mark as read

---

## 🐛 Troubleshooting

### Common Issues

#### **Session Persists After Logout**
- **Cause:** Ghost session in storage
- **Fix:** Clear localStorage and sessionStorage manually

#### **Attendance Data Not Updating**
- **Cause:** Batch job not running
- **Fix:** Manually run via `attendance-scheduler.html`

#### **Afternoon Status Always Absent**
- **Check:** Afternoon auto-present rule conditions
- Verify no early exits in `attendance_logs.time_out`
- Check `guard_passes` for active passes
- Check `clinic_visits` for "sent home" flags

#### **Critical Absence Not Flagging**
- **Check:** `USE_NEW_ATTENDANCE_LOGIC` is `true`
- Verify batch job ran (`attendance_daily_summary` has data)
- Check `CRITICAL_ABSENCE_THRESHOLD` value

#### **Kinder Afternoon Showing as Absent**
- **Expected:** Should be `'N/A'` not `'Absent'`
- **Fix:** Verify grade_level = 'Kinder' in `classes` table
- Check `attendance_daily_summary` afternoon_status

---

## 📚 Additional Documentation

- **Implementation Summary:** `IMPLEMENTATION_SUMMARY.md` - Phase 5 & 6 details
- **Database Schema:** `database schema/database-schema.txt` - Full table definitions
- **Development Rules:** `development-rules/generalrules.md` - Coding guidelines
- **Attendance Plan:** `plans/attendance_and_data_analytics.md` - Feature roadmap

---

## 🎓 Educational Context

**Educare Track** is designed as a Capstone project for educational institutions, demonstrating:

- Real-world full-stack development without frameworks
- Database design and normalization
- Batch processing and scheduled jobs
- Role-based access control
- Multi-tenant architecture (different user roles)
- Data analytics and reporting
- Automated alerting systems

The system follows DepEd (Department of Education) Philippines guidelines for attendance tracking, including the 20% critical absence rule for academic standing.

---

## 🛡️ Security Considerations

- **No client-side authentication logic:** Supabase handles API security
- **Role validation on every page:** Prevents URL-based access escalation
- **Session dual-storage:** Redundancy for Remember Me functionality
- **No sensitive data logging:** Credentials never logged
- **Parameterized queries:** Supabase client prevents SQL injection
- **HTTPS required:** Supabase enforces encrypted connections

---

## 📄 License

This is an educational project for academic purposes.

---

## 🔄 Maintenance

### Adding New Features

1. Reference `database-schema.txt` for table structure
2. Follow existing code patterns in similar modules
3. Add comments explaining logic and business rules
4. Test with `test-attendance-checklist.js`
5. Update this README if adding major features

### Database Changes

1. Create migration in `migrations/` folder
2. Update `database-schema.txt`
3. Test with seed data
4. Update affected modules

---

**Last Updated:** 2026-04-28  
**Version:** 1.0.0  
**Author:** Educare Track Development Team