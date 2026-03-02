# Forgot Password & User Management Schema Analysis

## Executive Summary

This document analyzes two critical issues:
1. **Forgot Password functionality** - Current implementation and gaps
2. **User Management Schema Alignment** - Database vs Code mismatches

---

## Part 1: Forgot Password Analysis

### Current Implementation (`index.html`)

```
javascript
async function handleForgotPassword() {
    const username = prompt("Please enter your username to request a password reset:");
    if (!username) return;

    try {
        await supabase.from('notifications').insert({
            recipient_role: 'admins',
            title: 'Password Reset Request',
            message: `User '${username}' has requested a password reset.`,
            type: 'system_alert',
            is_read: false
        });
        alert("Admin has been notified of your request.");
    } catch (e) {
        alert("Request failed: " + e.message);
    }
}
```

### Issues Identified

| Issue | Severity | Description |
|-------|----------|-------------|
| No username verification | 🔴 High | Doesn't verify if username exists in database |
| No recipient_id | 🟡 Medium | Uses `recipient_role` only; should also use `recipient_id` for targeted delivery |
| No actual password reset | 🔴 High | Only notifies admin - password is never changed |
| No admin response mechanism | 🔴 High | Admin has no interface to reset passwords |
| No user verification | 🔴 High | Anyone can request reset for any username |
| No email/phone verification | 🟡 Medium | Can't verify user identity |

### Database Schema (notifications table)

```
sql
CREATE TABLE public.notifications (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  recipient_id bigint,           -- Missing in current implementation
  recipient_role text,
  title text,
  message text,
  type text,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);
```

### Recommended Fix

The forgot password should:
1. Verify the username exists in any user table
2. Insert a notification with `recipient_id` targeting all admins (or use recipient_role with proper filtering)
3. **Better approach**: Add actual password reset functionality:
   - Generate a reset token
   - Store token with expiry in database
   - Send to user's registered contact (if email/phone available)
   - Allow password change via token

---

## Part 2: User Management Schema Alignment

### Database Schema vs Code Comparison

| Table | Code Uses | Schema Has | Match? |
|-------|-----------|------------|--------|
| **admins** | | | |
| | `username` | ✅ | ✅ |
| | `password` | ✅ | ✅ |
| | `full_name` | ✅ | ✅ |
| | `contact_number` | ✅ | ✅ |
| | `is_active` | ❌ | **MISSING** |
| | `admin_id_text` | ❌ | Not needed |
| **teachers** | | | |
| | `username` | ✅ | ✅ |
| | `password` | ✅ | ✅ |
| | `full_name` | ✅ | ✅ |
| | `department` | ✅ | ✅ |
| | `contact_number` | ✅ | ✅ |
| | `email` | ✅ | ✅ |
| | `is_active` | ✅ | ✅ |
| | `is_gatekeeper` | ✅ | ✅ |
| | `teacher_id_text` | ✅ | ✅ |
| **parents** | | | |
| | `username` | ✅ | ✅ |
| | `password` | ✅ | ✅ |
| | `full_name` | ✅ | ✅ |
| | `address` | ✅ | ✅ |
| | `contact_number` | ✅ | ✅ |
| | `relationship_type` | ✅ | ✅ |
| | `is_active` | ✅ | ✅ |
| | `parent_id_text` | ✅ | ✅ |
| **guards** | | | |
| | `username` | ✅ | ✅ |
| | `password` | ✅ | ✅ |
| | `full_name` | ✅ | ✅ |
| | `assigned_gate` | ✅ | ✅ |
| | `shift_schedule` | ✅ | ✅ |
| | `guard_id_text` | ✅ | ✅ |
| **clinic_staff** | | | |
| | `username` | ✅ | ✅ |
| | `password` | ✅ | ✅ |
| | `full_name` | ✅ | ✅ |
| | `role_title` | ✅ | ✅ |
| | `clinic_id_text` | ✅ | ✅ |
| **students** | | | |
| | `lrn` | ✅ | ✅ |
| | `student_id_text` | ✅ | ✅ |
| | `full_name` | ✅ | ✅ |
| | `parent_id` | ✅ | ✅ |
| | `class_id` | ✅ | ✅ |
| | `gender` | ✅ | ✅ |
| | `address` | ✅ | ✅ |
| | `emergency_contact` | ✅ | ✅ |
| | `qr_code_data` | ✅ | ✅ |
| | `profile_photo_url` | ✅ | ✅ |
| | `status` | ✅ | ✅ |

### 🔴 Critical Issue: Missing `is_active` in admins table

**Current Login Code (`index.html`):**
```
javascript
// Checks is_active for all users
if (user.is_active === false) {
    throw new Error("Your account has been deactivated...");
}
```

**Problem:**
- The `admins` table does NOT have an `is_active` column in the schema
- When admin logs in, `user.is_active` will be `undefined`
- The check `user.is_active === false` evaluates to `false` (not true)
- So deactivated admins CAN STILL LOGIN because the check fails differently

**Impact:**
- Admin cannot be deactivated using the existing `toggleStatus()` function
- The `is_active` check doesn't work properly for admins

---

## Part 3: Login Flow Analysis

### Current Code (`index.html`)

```
javascript
for (const r of roles) {
    const { data, error } = await supabase
        .from(r)
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .maybeSingle();
    if (data) { user = data; role = r; break; }
}

if (!user) throw new Error("Invalid credentials");

// CRITICAL FIX: Check if the user account is active
if (user.is_active === false) {
    throw new Error("Your account has been deactivated...");
}
```

### Issues

1. **Password stored in plain text** - Security risk
2. **No password hashing** - Should use bcrypt or similar
3. **No rate limiting** - Brute force vulnerable
4. **Admin `is_active` check broken** - Due to missing column

---

## Summary of Required Fixes

### 1. Forgot Password (Priority: High)
- [ ] Add username verification before requesting reset
- [ ] Add recipient_id to notifications for proper targeting
- [ ] Create admin interface to respond to reset requests
- [ ] Implement actual password reset flow (token-based)

### 2. Schema Alignment (Priority: High)
- [ ] Add `is_active` column to `admins` table
- [ ] Ensure all user tables have consistent structure

### 3. Security Improvements (Priority: Medium)
- [ ] Implement password hashing (bcrypt)
- [ ] Add rate limiting for login attempts
- [ ] Add login audit logging

---

## Files Reviewed

- `index.html` - Login and forgot password
- `admin/admin-user-management.js` - User CRUD operations
- `database schema/database-schema.txt` - Table definitions
- `teacher/teacher-core.js` - Teacher settings (password change)
- `parent/parent-core.js` - Parent settings

---

*Analysis Date: 2025*
