Date: 2026-04-08

Problem:
Student profile photos uploaded via file picker do not appear on the ID card. The upload appears to succeed but the image is not displayed.

What Cause It:
1. Missing error handling when uploading to Supabase Storage - if upload fails silently, the profile_photo_url remains null or broken
2. Storage bucket permissions - bucket "student-photos" was likely private (default), so even though URL is generated, the image cannot be accessed without a signed URL
3. No fallback handling for broken/missing image URLs in ID card display

Solution:
1. Updated saveStudentChanges() in admin-add-parent-and-child.js to add proper error handling with try/catch, upsert:true for uploads, and user notifications on success/failure
2. Added onerror fallback in viewStudentIDCard() to show avatar fallback when image URL is broken
3. Added onerror fallback in generatePortraitIDHTML() in admin-idmanagement.js for the main ID card view
4. Added onerror fallback in the student list table render in admin-idmanagement.js
5. Recommended to make storage bucket public in Supabase Dashboard

Files Modified:
- admin/admin-add-parent-and-child.js: saveStudentChanges() and viewStudentIDCard()
- admin/admin-idmanagement.js: generatePortraitIDHTML() and renderIDList()
