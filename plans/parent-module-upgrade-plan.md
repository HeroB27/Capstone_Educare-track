# Parent Module Upgrade Plan - Educare Track

## Document Information
- **Project:** Educare Track - Parent Module
- **Version:** 2.0 (Upgrade)
- **Date:** 2026-03-11
- **Status:** Planning Phase

---

## Executive Summary

This document outlines the comprehensive upgrade plan for the Parent Module of Educare Track. The upgrade focuses on transforming the existing module into a mobile-first, feature-rich transparency portal with real-time notifications, enhanced attendance tracking, and improved communication channels.

### Key Upgrade Objectives
1. **Mobile-Friendly UI** - Top navigation bar optimized for touch devices
2. **Real-Time Notifications** - Centralized notification box with multiple notification types
3. **Enhanced Excuse Letters** - Full CRUD operations with multimedia support
4. **School Calendar** - Integration of school events and holidays
5. **Comprehensive Child View** - Unified view of child information across all modules

---

## 1. Current State Analysis

### Existing Files Structure
```
parent/
├── parent-core.js              (430 lines) - Session management, child switching, real-time subscriptions
├── parent-dashboard.html       (678 lines) - Main dashboard with status cards
├── parent-children.html        - Children management
├── parent-children.js          - Children logic
├── parent-childs-attendance.html - Attendance calendar view
├── parent-childs-attendance.js - Attendance logic with CSV export
├── parent-excuse-letter-template.html - Excuse letter form
├── parent-excuse-letter-template.js   - Excuse submission logic
├── parent-notifications.html   - Notifications list
├── parent-notifications.js     - Real-time notifications
├── parent-announcements-board.html - School announcements
├── parent-announcements-board.js   - Announcements logic
├── parent-schedule.html        - Class schedule view
├── parent-schedule.js          - Schedule logic
├── parent-settings.html       - Account settings
├── parent-settings.js         - Settings logic
└── parent-announcements.js    - Legacy announcements
```

### Current Features
| Feature | Status | Implementation |
|---------|--------|----------------|
| Bottom Navigation Bar | ✅ Active | Fixed bottom nav with 4 tabs |
| Dashboard | ✅ Active | Status cards, attendance summary, clinic alerts |
| My Children | ✅ Active | List view with basic info |
| Attendance Calendar | ✅ Active | Monthly calendar with color coding |
| Excuse Letters | ⚠️ Partial | Upload, submit, status tracking |
| Notifications | ✅ Active | Real-time updates via Supabase |
| Announcements | ✅ Active | Targeted announcements |
| Schedule View | ✅ Active | Class schedule display |
| Settings | ✅ Active | Account settings |

### Current Database Schema (Relevant Tables)
```sql
-- parents table
CREATE TABLE public.parents (
  id bigint, parent_id_text text, username text, password text,
  full_name text, address text, contact_number text,
  relationship_type text, is_active boolean
);

-- students table (linked to parents)
CREATE TABLE public.students (
  id bigint, lrn text, student_id_text text, full_name text,
  parent_id bigint, class_id bigint, gender text, address text,
  emergency_contact text, qr_code_data text, profile_photo_url text,
  status text
);

-- attendance_logs table
CREATE TABLE public.attendance_logs (
  id bigint, student_id bigint, log_date date, time_in timestamp,
  time_out timestamp, status text, remarks text,
  morning_absent boolean, afternoon_absent boolean
);

-- excuse_letters table
CREATE TABLE public.excuse_letters (
  id bigint, student_id bigint, parent_id bigint, reason text,
  date_absent date, image_proof_url text, status text,
  teacher_remarks text, created_at timestamp, updated_at timestamp
);

-- clinic_visits table
CREATE TABLE public.clinic_visits (
  id bigint, student_id bigint, referred_by_teacher_id bigint,
  reason text, nurse_notes text, action_taken text,
  time_in timestamp, time_out timestamp, parent_notified boolean,
  status text, parent_notified_at timestamp
);

-- notifications table
CREATE TABLE public.notifications (
  id bigint, recipient_id bigint, recipient_role text,
  title text, message text, type text, is_read boolean,
  created_at timestamp, is_urgent boolean
);

-- announcements table
CREATE TABLE public.announcements (
  id bigint, title text, content text, posted_by_admin_id bigint,
  target_teachers boolean, target_parents boolean, target_guards boolean,
  target_clinic boolean, created_at timestamp, posted_by_teacher_id bigint,
  priority text, type text, scheduled_at timestamp, target_students boolean
);

-- holidays table
CREATE TABLE public.holidays (
  holiday_date date, description text, is_suspended boolean,
  target_grades text, time_coverage text
);
```

---

## 2. Upgrade Requirements

### 2.1 Navigation Bar (Top - Mobile First)

#### Current Implementation
- Bottom navigation bar with 4 tabs: Home, Attendance, Excuse, Children

#### Required Changes
```
┌─────────────────────────────────────────┐
│  [Logo]  My Children  Announcements    │
│          Excuse Letters  Settings       │  <- TOP NAVIGATION BAR
├─────────────────────────────────────────┤
│                                         │
│           MAIN CONTENT AREA             │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

**Specification:**
| Component | Description |
|-----------|-------------|
| Position | Fixed top, 60px height |
| Background | White with subtle shadow |
| Items | My Children, Announcements, Excuse Letters, Settings |
| Active State | Green underline indicator |
| Mobile Behavior | Horizontal scroll if overflow |
| Child Switcher | Dropdown in header showing current child |

**Files to Modify:**
- `parent-dashboard.html` - Replace bottom nav with top nav
- `parent-children.html` - Add top navigation
- `parent-childs-attendance.html` - Add top navigation
- `parent-excuse-letter-template.html` - Add top navigation
- `parent-notifications.html` - Add top navigation
- `parent-announcements-board.html` - Add top navigation
- `parent-schedule.html` - Add top navigation
- `parent-settings.html` - Add top navigation
- `parent-core.js` - Add navigation helper functions

### 2.2 My Children Module

#### Current Implementation
- Basic list of children with minimal info
- Separate pages for attendance, clinic history, schedule

#### Required Changes
```
┌─────────────────────────────────────────┐
│  [←Back]     My Children      [Edit]   │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │    👤 Child Name                │    │
│  │    Grade X - Section A          │    │
│  │    LRN: 123456789012            │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─ Quick Stats ────────────────────┐  │
│  │  Present  |  Late  |  Absent     │  │
│  │    95%    |   3    |    1        │  │
│  └───────────────────────────────────┘  │
│                                         │
│  [📅 Attendance] [🏥 Clinic] [📅 Schedule] │
│                                         │
│  ── Recent Activity ──                 │
│  • Time in: 7:30 AM                    │
│  • Clinic visit: 10:00 AM              │
└─────────────────────────────────────────┘
```

**Features:**
1. **Child Information Card**
   - Profile photo (or initials avatar)
   - Full name, LRN, grade level, section
   - Emergency contact number
   - Quick status indicator (In School / Out of School)

2. **Quick Stats Banner**
   - Monthly attendance percentage
   - Total lates this month
   - Total absences this month

3. **Action Buttons**
   - View Attendance (opens calendar)
   - View Clinic History (opens visits list)
   - View Schedule (opens class schedule)

4. **Recent Activity Feed**
   - Last 5 activities (gate logs, clinic visits, notes)

**Files to Modify:**
- `parent-children.html` - Complete UI redesign
- `parent-children.js` - Enhanced logic for unified view

### 2.3 Excuse Letters Module

#### Current Implementation
- Form with child selection
- File upload for proof
- Status tracking (Pending/Approved/Rejected)

#### Required Changes
```
┌─────────────────────────────────────────┐
│  [←Back]   Submit Excuse Letter         │
├─────────────────────────────────────────┤
│                                         │
│  Select Child:                          │
│  ┌─────────────────────────────────┐    │
│  │ 👤 Child A  ✓                   │    │
│  │ 👤 Child B                       │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Date of Absence: [📅 Picker]           │
│                                         │
│  Reason:                                │
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  │ (multiline text area)           │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Proof (Optional):                      │
│  ┌─────────────────────────────────┐    │
│  │     📷 Upload Photo/PDF         │    │
│  │     Max size: 5MB              │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [ Submit Excuse Letter ]               │
│                                         │
│  ── My Excuse Letters ──               │
│  ┌─────────────────────────────────┐    │
│  │ Jan 15, 2026 - Medical          │    │
│  │ Status: Approved ✓              │    │
│  │ [Edit] [Delete]                 │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**Features:**
1. **Child Dropdown** (Required)
   - Radio button selection for multiple children
   - Shows child's name and grade level

2. **Date Picker**
   - Date picker for absence date
   - Cannot select future dates
   - Can select past dates (within current school year)

3. **Reason Text Area**
   - Multiline text input
   - Placeholder: "Enter reason for absence..."
   - Required field

4. **Proof Upload** (Optional)
   - Accept: image/jpeg, image/png, image/jpg, application/pdf
   - Max size: 5MB
   - Preview after upload
   - Can remove uploaded file before submit

5. **Excuse History List**
   - List of all submitted excuse letters
   - Shows: date, reason, status, teacher remarks
   - **Edit** button - opens edit modal
   - **Delete** button - with confirmation
   - Status badges: Pending (yellow), Approved (green), Rejected (red)

6. **Edit Functionality**
   - Modify reason, date, or proof
   - Cannot edit if already approved
   - Shows "Editing" indicator

**Files to Modify:**
- `parent-excuse-letter-template.html` - Enhanced UI with edit/delete buttons
- `parent-excuse-letter-template.js` - Add edit, delete, update functions

### 2.4 Notification Box

#### Current Implementation
- Separate notifications page with list view

#### Required Changes
```
┌─────────────────────────────────────────┐
│  [🔔 Notifications (5)]       [Mark All Read] │
├─────────────────────────────────────────┤
│                                         │
│  ┌─ Today's Alerts ──────────────────┐  │
│  │                                     │  │
│  │  🚪 GATE ACTIVITY                 │  │
│  │  👤 Your child entered at 6:30 AM │  │
│  │  2 minutes ago                    │  │
│  │                                     │  │
│  │  🏥 CLINIC VISIT                  │  │
│  │  👤 Visited clinic - Headache     │  │
│  │  10:30 AM - Nurse notified ✓    │  │
│  │                                     │  │
│  │  📢 ANNOUNCEMENT                 │  │
│  │  📌 Science Fair Tomorrow        │  │
│  │  Please prepare your child...     │  │
│  │  1 hour ago                       │  │
│  │                                     │  │
│  │  📝 EXCUSE LETTER                │  │
│  │  Your excuse for Jan 15 was      │  │
│  │  APPROVED by Mr. Garcia          │  │
│  │  2 hours ago                      │  │
│  │                                     │  │
│  │  ⚠️ CRITICAL ALERT              │  │
│  │  Your child has 3 consecutive    │  │
│  │  absences. Please submit excuse. │  │
│  │  Urgent - Please respond ASAP    │  │
│  │                                     │  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

**Notification Types:**
| Type | Icon | Color | Description |
|------|------|-------|-------------|
| Gate Entry | 🚪 | Green | Child entered school |
| Gate Exit | 🚪 | Gray | Child exited school |
| Clinic Visit | 🏥 | Red | Child visited clinic |
| Announcement | 📢 | Blue | School announcement |
| Excuse Letter | 📝 | Purple | Excuse status update |
| Critical Alert | ⚠️ | Red | Urgent attendance alert |
| Late Notification | ⏰ | Yellow | Child marked late |

**Features:**
1. **Unified Notification Box**
   - Accessible from any page via header icon
   - Badge showing unread count
   - Quick toggle for notification types

2. **Real-Time Updates**
   - Supabase realtime subscription
   - Toast notification for new items

3. **Filter Options**
   - All
   - Gate Activity
   - Announcements
   - Clinic Visits
   - Excuse Letters

4. **Notification Categories**
   - Gate Activity (time in/out)
   - Announcements
   - Clinic Visits
   - Excuse Letter Remarks
   - Critical Absences / Late Notifications

**Files to Modify:**
- `parent-notifications.html` - Add top navigation, enhance UI
- `parent-notifications.js` - Add category filters, enhanced realtime
- `parent-core.js` - Add notification helper functions
- `parent-dashboard.html` - Add notification bell in header

### 2.5 Dashboard Enhancements

#### Current Implementation
- Status card with pulse animation
- Attendance summary
- Quick action buttons
- Clinic history preview

#### Required Changes
```
┌─────────────────────────────────────────┐
│  [Child Avatar ▼]  Child Name    [🔔]  │
│  ● In School / ○ Out of School          │
├─────────────────────────────────────────┤
│                                         │
│  ┌─ Today's Status ──────────────────┐ │
│  │         ⏰ 7:30 AM                  │ │
│  │         In School                  │ │
│  │  Time In: 7:30  |  Time Out: --    │ │
│  └─────────────────────────────────────┘ │
│                                         │
│  ┌─ Attendance This Month ───────────┐ │
│  │  ████████████░░░░░  85%           │ │
│  │  Present: 17  Late: 3  Absent: 2  │ │
│  └─────────────────────────────────────┘ │
│                                         │
│  ┌─ Latest Announcement ─────────────┐ │
│  │  📢 School Closure Tomorrow       │ │
│  │  Due to typhoon signal #3...      │ │
│  │  [Read More]                      │ │
│  └─────────────────────────────────────┘ │
│                                         │
│  ┌─ Quick Actions ───────────────────┐ │
│  │  [Submit Excuse] [View Calendar]  │ │
│  │  [Contact Teacher] [View Schedule]│ │
│  └─────────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

**Features:**
1. **Live Status Card**
   - Prominent In School / Out of School indicator
   - Today's time in/out
   - Pulse animation when inside school

2. **Attendance Summary**
   - Monthly percentage with progress bar
   - Days present, late, absent counts
   - Color-coded breakdown

3. **Latest Announcement Preview**
   - Most recent announcement for parent
   - Preview text with "Read More" link

4. **Quick Actions Grid**
   - Submit Excuse Letter
   - View Calendar
   - Contact Teacher (opens email/phone)
   - View Schedule

**Files to Modify:**
- `parent-dashboard.html` - Complete UI redesign
- `parent-dashboard.js` - Enhanced data loading (integrate into main script)

### 2.6 School Calendar Integration

#### Current Implementation
- Separate schedule page showing class schedule
- Holidays loaded for attendance calendar

#### Required Changes
```
┌─────────────────────────────────────────┐
│  [←Back]     School Calendar            │
├─────────────────────────────────────────┤
│     ◀  March 2026  ▶                   │
│  Mon  Tue  Wed  Thu  Fri  Sat  Sun     │
│   2    3    4    5    6    7    8      │
│        📚      📚                    │
│   9   10   11   12   13   14   15     │
│   📚   📚   📚   📚                    │
│  ───────────────────────────────────   │
│   16   17   18   19   20   21   22     │
│   📚   📚   🎉                        │
│   ───────────────────────────────────   │
│   23   24   25   26   27   28   29     │
│               🎄                       │
│  ───────────────────────────────────   │
│                                         │
│  📚 = Regular Class Day                 │
│  🎉 = Special Event                     │
│  🎄 = Holiday/Suspension                │
│                                         │
│  ── Upcoming Events ──                 │
│  • Mar 15 - Science Fair               │
│  • Mar 25 - Christmas Break            │
└─────────────────────────────────────────┘
```

**Features:**
1. **Monthly Calendar View**
   - Month navigation (previous/next)
   - Day cells showing status
   - Color coding: School day, Holiday, Event

2. **Legend**
   - Regular class day (white/green)
   - Holiday/Suspension (red)
   - Special event (yellow)

3. **Upcoming Events List**
   - Next 5 upcoming events
   - Date and description

4. **Data Sources**
   - `holidays` table for suspensions
   - `announcements` table for events
   - Could add `school_events` table for calendar-specific events

**Files to Create:**
- `parent/parent-calendar.html` - New calendar page
- `parent/parent-calendar.js` - Calendar logic

**Files to Modify:**
- `parent-core.js` - Add calendar data helper functions

---

## 3. Implementation Roadmap

### Phase 1: UI/UX Overhaul (Week 1-2)
**Objective:** Replace bottom navigation with top navigation and mobile-first design

| Status | Task | Files | Description |
|--------|------|-------|-------------|
| ☑️ | 1.1 | All HTML files | Replace bottom nav with top nav bar |
| ☑️ | 1.2 | parent-core.js | Add navigation helper functions |
| ⬜ | 1.3 | All HTML files | Test responsive behavior |
| ☑️ | 1.4 | parent-dashboard.html | Update header with notification bell |

### Phase 2: Notification Box (Week 3)
**Objective:** Centralized notification system with categories

#### Current Implementation Status (What exists vs. what's needed)

| Feature | Status | What's Done | What's Needed |
|---------|--------|-------------|---------------|
| Filter Tabs | ✅ Done | Added: Gate Activity, Excuse Letters, Announcements | - |
| Notification Types | ✅ Done | Added: gate_entry, gate_exit, late_notification, critical_absence | - |
| Real-time Subscriptions | ✅ Done | Working for INSERT and UPDATE events | - |
| Toast Notifications | ✅ Done | Color-coded toast popup | - |
| Mark as Read/Delete | ✅ Done | Working | - |
| Notification Bell | ✅ Done | In dashboard header + badge update | - |
| Notification Helpers in core | ✅ Done | Added helper functions | - |
| Color Coding | ✅ Done | Per notification type | - |

---

#### Phase 2 Tasks (Detailed) - COMPLETED

##### 2.1 Enhance Notification UI (parent-notifications.html/js)
✅ Completed:
- Added new filter buttons: Gate Activity, Excuse Letters, Announcements
- Updated filter logic to handle category-based filtering
- Added icon mapping for: gate_entry (🚪), gate_exit (🚪), late_notification (⏰), critical_absence (⚠️)
- Added color coding per type: gate=green, clinic=red, announcement=blue, excuse=purple, critical=yellow
- Updated filter tabs styling with proper active states

##### 2.2 Add Notification Helpers (parent-core.js)
✅ Completed:
- Added `getNotificationIcon(type)` helper function
- Added `getNotificationColor(type)` helper for color classes
- Added `getNotificationLabel(type)` helper for display labels
- Added `showNotificationToast(notification)` reusable toast function
- Added `updateNotificationBadge()` function for header badge

##### 2.3 Notification Bell Integration (parent-dashboard.html)
✅ Completed:
- Notification bell exists in header
- Badge shows unread count
- Fixed recipient_role from 'parent' to 'parents'
- Added badge update on notifications load

##### 2.4 Ensure Realtime Subscriptions Work
✅ Completed:
- Added UPDATE event subscription for is_read changes
- Added toast notification on new INSERT events
- Added badge update on notification changes

---

## Phase 3: Excuse Letter Enhancements (Week 4)
**Objective:** Full CRUD for excuse letters - Enhanced

#### Current Implementation Status

| Feature | Status | What's Done | What's Needed |
|---------|--------|-------------|---------------|
| Submit (Create) | ✅ Done | Form submission with file upload | - |
| View History (Read) | ✅ Done | List with status badges | - |
| Edit Function | ✅ Done | Can edit date, reason, and proof file | - |
| Delete/Cancel | ✅ Done | Works for pending excuses | - |
| Status Badges | ✅ Done | Pending/Approved/Rejected | - |
| Status Updates | ✅ Done | Realtime subscription with toast notifications | - |
| Edit Modal | ✅ Done | File upload, confirmation, validation | - |
| Status Timestamps | ✅ Done | Shows when status changed | - |

---

#### Phase 3 Tasks - COMPLETED

##### 3.1 Enhance Edit Functionality ✅
- Added file input to edit modal
- Updated submitEdit() to handle file upload
- Added edit file preview functionality
- Added hidden file input in modal HTML

##### 3.2 Add Realtime Status Updates ✅
- Added subscription for excuse_letters table
- Show toast on status change
- Update history on status change
- Added excuse-specific notification helper

##### 3.3 Improve Edit Modal UX ✅
- Added confirmation before edit save
- Show "Editing" indicator (saving state)
- Validate edit before submit

##### 3.4 Status Tracking Enhancement ✅
- Added status timestamps in history
- Shows relative time for status changes

---

## Phase 4: My Children Module (Week 5)
**Objective:** Unified child information view

#### Current Implementation Status

| Feature | Status | What's Done | What's Needed |
|---------|--------|-------------|---------------|
| Children List | ✅ Done | Shows children with status | - |
| Child Detail Modal | ✅ Done | Shows profile, adviser contact | - |
| Today's Status | ✅ Done | Inside/Outside indicator | - |
| Clinic Status | ✅ Done | Shows if in clinic | - |
| Attendance Stats | ✅ Done | Shows counts + percentage | - |
| Action Buttons | ✅ Done | View Attendance, Clinic, Schedule | - |
| Recent Activity Feed | ✅ Done | Gate logs + clinic visits | - |

---

#### Phase 4 Tasks (Detailed)

##### 4.1 Enhance Child Card Display
**Improve the list view with quick stats**

| Task | File | Description |
|------|------|-------------|
| 4.1.1 | parent-children.js | Add attendance percentage to list card |
| 4.1.2 | parent-children.js | Add quick stats (lates, absences this month) |
| 4.1.3 | parent-children.js | Add profile photo display |

##### 4.2 Add Action Buttons to Detail Modal
**Quick navigation to key features**

| Task | File | Description |
|------|------|-------------|
| 4.2.1 | parent-children.js | Add "View Attendance" button |
| 4.2.2 | parent-children.js | Add "View Clinic History" button |
| 4.2.3 | parent-children.js | Add "View Schedule" button |
| 4.2.4 | parent-children.js | Implement navigation functions |

##### 4.3 Add Recent Activity Feed
**Show last 5 activities (gate logs, clinic visits)**

| Task | File | Description |
|------|------|-------------|
| 4.3.1 | parent-children.js | Add function to fetch recent activities |
| 4.3.2 | parent-children.js | Fetch gate logs for child |
| 4.3.3 | parent-children.js | Fetch clinic visits for child |
| 4.3.4 | parent-children.js | Render activity feed in modal |

##### 4.4 Attendance Percentage Enhancement
**Show monthly attendance percentage**

| Task | File | Description |
|------|------|-------------|
| 4.4.1 | parent-children.js | Calculate attendance percentage |
| 4.4.2 | parent-children.js | Add progress bar visualization |
| 4.4.3 | parent-children.js | Color code based on percentage |

---

#### Phase 4 Implementation Checklist

- [x] 4.1.1 Add attendance percentage to list card
- [x] 4.1.2 Add quick stats (lates, absences this month)
- [x] 4.1.3 Add profile photo display
- [x] 4.2.1 Add "View Attendance" button
- [x] 4.2.2 Add "View Clinic History" button
- [x] 4.2.3 Add "View Schedule" button
- [x] 4.2.4 Implement navigation functions
- [x] 4.3.1 Add function to fetch recent activities
- [x] 4.3.2 Fetch gate logs for child
- [x] 4.3.3 Fetch clinic visits for child
- [x] 4.3.4 Render activity feed in modal
- [x] 4.4.1 Calculate attendance percentage
- [x] 4.4.2 Add progress bar visualization
- [x] 4.4.3 Color code based on percentage

---

#### Phase 4 Status: ✅ COMPLETED (2026-03-11)

---

#### Phase 4 File Changes Summary

**Files to Modify:**
- `parent/parent-children.js` - Enhanced child cards, action buttons, activity feed
- `parent/parent-children.html` - May need minor updates for action buttons

### Phase 5: School Calendar (Week 6)
**Objective:** Integrated calendar view showing holidays, events, and school activities

---

#### PHASE 5 DETAILED PLAN

**What is PHASE 5?**
Create a new School Calendar page (`parent-calendar.html/js`) that shows:
- Monthly calendar view with holidays/events
- Color coding: School day (green), Holiday (red), Special event (yellow)
- Upcoming events list
- This is DIFFERENT from the existing Class Schedule page (which shows subject timetable)

---

#### Current Implementation Status

| Feature | Status | What's Existing | What's Needed |
|---------|--------|-----------------|---------------|
| Class Schedule | ✅ Exists | Shows subject timetable per day | - |
| School Calendar | ❌ Missing | None | New page needed |
| Holiday Display | ✅ Partial | Shows suspension on schedule page | Show full month calendar |
| Events Display | ⚠️ Partial | In announcements | Need calendar view |

---

#### PHASE 5 Tasks - Detailed

##### 5.1 Create Calendar Page (parent-calendar.html)
**Create new HTML file**

| Task | File | Description |
|------|------|-------------|
| 5.1.1 | parent/parent-calendar.html | Create new calendar HTML page with top navigation |
| 5.1.2 | parent/parent-calendar.html | Add month navigation header (◀ Month Year ▶) |
| 5.1.3 | parent/parent-calendar.html | Add calendar grid (7 columns for days) |
| 5.1.4 | parent/parent-calendar.html | Add legend section (📚=Class, 🎉=Event, 🎄=Holiday) |
| 5.1.5 | parent/parent-calendar.html | Add upcoming events list section |

##### 5.2 Create Calendar Logic (parent-calendar.js)
**Implement calendar rendering and data fetching**

| Task | File | Description |
|------|------|-------------|
| 5.2.1 | parent/parent-calendar.js | Add month navigation state (currentMonth, currentYear) |
| 5.2.2 | parent/parent-calendar.js | Add `renderCalendar()` function to generate calendar grid |
| 5.2.3 | parent/parent-calendar.js | Add `fetchHolidays(month, year)` to get holidays from DB |
| 5.2.4 | parent/parent-calendar.js | Add `fetchEvents(month, year)` to get events from announcements |
| 5.2.5 | parent/parent-calendar.js | Add `getDayStatus(date)` to determine day type (school/event/holiday) |
| 5.2.6 | parent/parent-calendar.js | Add `renderUpcomingEvents()` to show next 5 events |
| 5.2.7 | parent/parent-calendar.js | Add prev/next month navigation handlers |

##### 5.3 Add Calendar Helpers to Core
**Add helper functions to parent-core.js**

| Task | File | Description |
|------|------|-------------|
| 5.3.1 | parent-core.js | Add `getHolidaysForMonth(year, month)` helper function |
| 5.3.2 | parent-core.js | Add `getEventsForMonth(year, month)` helper function |
| 5.3.3 | parent-core.js | Add `isSchoolDay(date)` helper function |

##### 5.4 Add Calendar to Navigation
**Link calendar page from all parent pages**

| Task | File | Description |
|------|------|-------------|
| 5.4.1 | parent-dashboard.html | Add "Calendar" to top navigation |
| 5.4.2 | parent-children.html | Add "Calendar" to top navigation |
| 5.4.3 | parent-schedule.html | Add "Calendar" to top navigation |
| 5.4.4 | parent-core.js | Add `navigateTo('calendar')` handler |

---

#### Database Data Sources

| Table | Data Used | Purpose |
|-------|-----------|----------|
| `holidays` | holiday_date, description, is_suspended, target_grades | Show suspensions/holidays |
| `announcements` | title, content, scheduled_at, priority | Show school events |

---

#### UI/UX Specification

```
┌─────────────────────────────────────────┐
│  [←Back]     School Calendar            │
├─────────────────────────────────────────┤
│     ◀  March 2026  ▶                   │
│  Mon  Tue  Wed  Thu  Fri  Sat  Sun     │
│   2    3    4    5    6    7    8      │
│        📚      📚                    │
│   9   10   11   12   13   14   15     │
│   📚   📚   📚   📚                    │
│  ───────────────────────────────────   │
│   16   17   18   19   20   21   22     │
│   📚   📚   🎉                        │
│  ───────────────────────────────────   │
│   23   24   25   26   27   28   29     │
│               🎄                       │
│  ───────────────────────────────────   │
│                                         │
│  📚 = Regular Class Day  (green)        │
│  🎉 = Special Event     (yellow)        │
│  🎄 = Holiday/Suspension (red)          │
│                                         │
│  ── Upcoming Events ──                 │
│  • Mar 15 - Science Fair               │
│  • Mar 25 - Christmas Break            │
└─────────────────────────────────────────┘
```

---

#### Implementation Checklist

- [x] 5.1.1 Create parent-calendar.html
- [x] 5.1.2 Add month navigation header
- [x] 5.1.3 Add calendar grid
- [x] 5.1.4 Add legend section
- [x] 5.1.5 Add upcoming events list
- [x] 5.2.1 Add month navigation state
- [x] 5.2.2 Add renderCalendar() function
- [x] 5.2.3 Add fetchHolidays() function
- [x] 5.2.4 Add fetchEvents() function
- [x] 5.2.5 Add getDayStatus() function
- [x] 5.2.6 Add renderUpcomingEvents()
- [x] 5.2.7 Add navigation handlers
- [x] 5.3.1 Add getHolidaysForMonth() to core
- [x] 5.3.2 Add getEventsForMonth() to core
- [x] 5.3.3 Add isSchoolDay() to core
- [x] 5.4.1 Add Calendar to dashboard nav
- [x] 5.4.2 Add Calendar to children nav
- [x] 5.4.3 Add Calendar to schedule nav
- [x] 5.4.4 Add navigateTo('calendar') handler

---

#### PHASE 5 Status: ✅ COMPLETED (2026-03-11)

---

#### Files to Create

| File | Purpose |
|------|--------|
| `parent/parent-calendar.html` | New calendar page UI |
| `parent/parent-calendar.js` | Calendar logic |

#### Files to Modify

| File | Changes |
|------|--------|
| `parent/parent-core.js` | Add calendar helper functions |
| `parent/parent-dashboard.html` | Add Calendar to nav |
| `parent/parent-children.html` | Add Calendar to nav |
| `parent/parent-schedule.html` | Add Calendar to nav |

---

### Phase 6: Testing & Polish (Week 7)
**Objective:** Bug fixing and mobile optimization

| Status | Task | Description |
|--------|------|-------------|
| ⬜ | 6.1 | Cross-browser testing |
| ⬜ | 6.2 | Mobile device testing |
| ⬜ | 6.3 | Performance optimization |
| ⬜ | 6.4 | Documentation update |

---

## 4. File Modification Summary

### New Files to Create
| File | Purpose |
|------|---------|
| `parent/parent-calendar.html` | School calendar page |
| `parent/parent-calendar.js` | Calendar logic |

### Files to Modify (Complete Rewrite)
| File | Changes |
|------|---------|
| `parent/parent-dashboard.html` | Top nav, enhanced header, notification bell |
| `parent/parent-children.html` | Complete redesign with unified view |
| `parent/parent-children.js` | Enhanced logic with clinic integration |
| `parent/parent-excuse-letter-template.html` | Edit/delete UI, enhanced form |
| `parent/parent-excuse-letter-template.js` | CRUD operations |
| `parent/parent-notifications.html` | Top nav, category filters |
| `parent/parent-notifications.js` | Enhanced categorization |

### Files to Modify (Add Top Nav)
| File | Changes |
|------|---------|
| `parent/parent-childs-attendance.html` | Add top navigation |
| `parent/parent-announcements-board.html` | Add top navigation |
| `parent/parent-schedule.html` | Add top navigation |
| `parent/parent-settings.html` | Add top navigation |

### Core Files to Modify
| File | Changes |
|------|---------|
| `parent/parent-core.js` | Add navigation helpers, notification helpers, calendar helpers |

---

## 5. Technical Considerations

### Supabase Realtime Subscriptions
All real-time features use Supabase's postgres_changes:
```javascript
// Example subscription pattern
supabase.channel('channel-name')
  .on('postgres_changes', {
    event: '*', // INSERT, UPDATE, DELETE
    schema: 'public',
    table: 'table_name',
    filter: 'column=eq.value'
  }, callback)
  .subscribe();
```

### Storage for Excuse Letter Proofs
- Bucket name: `excuse-proofs`
- Path structure: `{parent_id}/{excuse_id}/{filename}`
- Public access enabled for reading

### Notification Types (for type column)
- `gate_entry` - Child entered school
- `gate_exit` - Child exited school
- `clinic_visit` - Clinic visit occurred
- `announcement` - New announcement
- `excuse_approved` - Excuse letter approved
- `excuse_rejected` - Excuse letter rejected
- `critical_absence` - Multiple absences detected
- `late_notification` - Child marked late

---

## 6. Testing Checklist

### Mobile Responsiveness
- [ ] Top navigation fits on mobile screens
- [ ] All touch targets are at least 44px
- [ ] No horizontal scrolling on main content
- [ ] Bottom action buttons are thumb-friendly

### Functionality
- [ ] Real-time updates work for all notification types
- [ ] Excuse letter edit/delete works correctly
- [ ] Child switching updates all components
- [ ] Calendar displays correct data

### Accessibility
- [ ] Color contrast meets WCAG AA
- [ ] Icons have text alternatives
- [ ] Focus states are visible

---

## 7. Next Steps

1. **Review this plan** with stakeholders
2. **Approve the roadmap** and timeline
3. **Begin Phase 1 implementation** - UI/UX Overhaul
4. **Set up development environment** if needed
5. **Begin coding** following the file modification summary

---

*Document created: 2026-03-11*
*Last updated: 2026-03-11*
