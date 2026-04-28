Date: 2026-04-14

Problem:
The upload picture feature in admin user management is not working when editing a student or adding new students in the wizard.

What causes it:
1. The photo upload code uses Supabase Storage to upload images to a 'student-photos' bucket
2. The wizard student form did not have a photo upload input field
3. Photos were being stored by array index which gets misaligned when forms are removed
4. The ID Preview step was not reading the photo file properly

What is the solution:
Added the following fixes:

1. **Added photo upload input to student form** (addStudentForm function):
   - File input for uploading photos from device
   - Camera button to capture photo from webcam
   - Preview container showing selected/captured photo

2. **Changed photo storage from index-based to formId-based**:
   - Photos now stored in studentsPhotos object using formId as key
   - This fixes issues when removing/adding student forms

3. **Fixed ID Preview photo display**:
   - Added fallback lookup from studentsPhotos using student.formId
   - Read file as data URL for preview

4. **Fixed database save**:
   - Added fallback lookup for photo when saving to database
   - Handle blobs from webcam capture properly

5. **Fixed Invalid Parent ID issue**:
   - Added robust validation for parent ID in openEditParentModal
   - Fixed filter comparison to use string comparison for IDs

6. **Fixed duplicate LRN error when going back**:
   - Added studentsSavedToDB flag to prevent re-saving students
   - Only saves students on first visit to step 5

7. **Removed ID Management from navigation**:
   - Removed ID Management link from all admin sidebar navigation
   - Kept ID Template for customizing ID card colors
   - Updated 13 HTML files to remove the ID Management link

Additional Note:
- Network errors (ERR_NAME_NOT_RESOLVED) are due to internet connectivity issues, not code problems
- The LRN duplicate error is expected when trying to add a student with an existing LRN