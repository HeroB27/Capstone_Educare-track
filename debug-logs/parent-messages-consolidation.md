# Parent Module - Messages Consolidation

**Date:** 2026-04-12

## Problem

Parent module had redundant communication features:
- `parent-notifications.html` - For gate, clinic, excuse alerts
- `parent-announcements-board.html` - For announcements + teacher messages

The announcements-board already fetched from `notifications` table, making notifications page redundant.

## Solution

Created unified `parent-messages.html` with:
- Single page for all communication (gate alerts, clinic updates, excuse letters, teacher messages)
- Unified filtering: [All] [Gate] [Clinic] [Excuse] [Unread] [Urgent]
- Combined data from notifications table only (filtered by type and child)
- Read status stored in localStorage

## Files Changed

1. **Created:** `parent/parent-messages.html` - New unified messages page
2. **Updated:** `parent/parent-sidebar.html` - Navigation now points to messages
3. **Updated:** `parent/parent-core.js` - Added 'messages' route, updated 'notifications' and 'announcements' to point to messages
4. **Updated:** `parent/parent-dashboard.html` - Quick actions now point to messages

## Files Deprecated (kept but not linked)

- `parent/parent-notifications.html`
- `parent/parent-announcements-board.html`

## Key Features

- Gate alerts (pickup requests, gate passes)
- Clinic notifications (health alerts, clinic visits)
- Excuse letter notifications
- Teacher messages about children
- Filter by category OR by status (unread/urgent)
- "Mark all as read" functionality
- Auto-refresh every 45 seconds