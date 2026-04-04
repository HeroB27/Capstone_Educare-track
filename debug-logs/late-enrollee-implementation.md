# Feature Implementation: Add Late Enrollee

**Date:** 2026-03-28

**File Modified:** `admin/admin-add-parent-and-child.js`

---

## Overview

This feature allows admins to add a new student (late enrollee) to an existing parent account without restarting the full enrollment wizard. This is useful when students transfer in mid-year.

---

## Implementation Steps

### Step 1: Add Button to Edit Parent Modal

Added a green dashed button below the linked students section in the `editParent()` function:

```javascript
// Inside the modal HTML template
${studentFieldsHtml}
<div class="mt-4 pt-4 border-t border-gray-100">
    <button onclick="openLateEnrolleeModal('${parent.id}')" type="button" class="w-full py-3 border-2 border-dashed border-emerald-200 text-emerald-600 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-emerald-50 transition-all flex items-center justify-center gap-2">
        <i data-lucide="user-plus" class="w-4 h-4"></i> Add Late Enrollee (New Child)
    </button>
</div>
```

---

### Step 2: Handle Grade Level Change

Created `handleGradeChange(selectElement, prefix)` function that:
- Shows/hides SHS strand dropdown for Grade 11-12
- Populates class dropdown based on selected grade

```javascript
async function handleGradeChange(selectElement, prefix) {
    const grade = selectElement.value;
    const classSelect = document.getElementById(`class-${prefix}`);
    const strandDiv = document.getElementById(`strand-${prefix}`);
    
    // Show/hide strand dropdown for SHS (Grade 11-12)
    if (grade === 'Grade 11' || grade === 'Grade 12') {
        if (strandDiv) strandDiv.classList.remove('hidden');
    } else {
        if (strandDiv) strandDiv.classList.add('hidden');
    }
    
    // Fetch classes for selected grade
    if (classSelect) {
        classSelect.innerHTML = '<option value="">Loading...</option>';
        // ... queries classes filtered by grade
    }
}
```

---

### Step 3: Create Late Enrollee Modal

Created `openLateEnrolleeModal(parentId)` function that spawns a modal with:
- Student Full Name input
- LRN input (12 digits)
- Gender dropdown
- Grade Level dropdown
- Class Assignment dropdown
- SHS Strand dropdown (hidden unless Grade 11-12)

```javascript
async function openLateEnrolleeModal(parentId) {
    // Fetch all classes for dropdown
    const { data: classes } = await supabase.from('classes').select('*').order('grade_level').order('department');
    
    // Modal HTML with form fields...
    const modalHtml = `
        <div id="lateEnrolleeModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[250] p-4 animate-fade-in">
            <!-- Modal content with form fields -->
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    lucide.createIcons();
}
```

---

### Step 4: Save Late Enrollee

Created `saveLateEnrollee()` function that handles:
1. Validation (12-digit LRN, required fields)
2. Fetches parent data for auto-fill
3. Generates new student ID using `generateOfficialID()`
4. Inserts student into database
5. Sends notification to teachers
6. Prompts to print ID card

```javascript
async function saveLateEnrollee() {
    // 1. Validation
    if (!name || lrn.length !== 12 || !gender || !grade || !classId) {
        showNotification("Please fill all required fields correctly. LRN must be 12 digits.", "error");
        return;
    }
    
    // 2. Fetch Parent Data for Auto-fill
    const { data: parent } = await supabase.from('parents').select('address, contact_number').eq('id', parentId).single();
    
    // 3. Generate new ID
    const currentYear = new Date().getFullYear().toString();
    const studentID = generateOfficialID('EDU', currentYear, lrn);
    
    // 4. Insert Student
    const { data: newStudent, error: stuErr } = await supabase.from('students').insert([{
        parent_id: parentId,
        full_name: name,
        lrn: lrn,
        gender: gender,
        class_id: classId,
        strand: strand,
        address: parent.address,
        emergency_contact: parent.contact_number,
        student_id_text: studentID,
        qr_code_data: studentID,
        status: 'Enrolled',
        is_active: true
    }]).select().single();
    
    // 5. Fire Notification to Teachers
    await supabase.from('notifications').insert([{
        title: 'Late Enrollee Added',
        message: `${name} has been enrolled as a late addition and assigned to Class ID ${classId}. Please update your class records.`,
        recipient_role: 'teachers',
        type: 'system',
        is_read: false
    }]);
    
    // 6. Cleanup & Success
    showNotification(`Late Enrollee Added! ID: ${studentID}`, "success");
    
    // Prompt to print ID
    setTimeout(() => {
        showConfirmationModal("Print ID Card?", "The student is enrolled. Would you like to go to ID Management to print their ID?", () => {
            window.location.href = 'admin-idmanagement.html';
        });
    }, 1500);
}
```

---

### Step 5: Global Window Bindings

Added functions to window exports for HTML onclick handlers:

```javascript
window.openLateEnrolleeModal = openLateEnrolleeModal;
window.saveLateEnrollee = saveLateEnrollee;
window.handleGradeChange = handleGradeChange;
```

---

## User Flow

1. **Admin clicks "Edit"** on a parent account in the Parents & Students page
2. **Scrolls to bottom** of the Edit Parent modal
3. **Clicks "Add Late Enrollee (New Child)"** button (green dashed)
4. **Fills in student details:**
   - Full Name
   - LRN (12 digits)
   - Gender
   - Grade Level
   - Class
   - Strand (if SHS)
5. **Clicks "Enroll & Generate ID"**
6. **System:**
   - Generates `EDU-2026-XXXX-XXXX` ID
   - Auto-fills address/contact from parent
   - Creates student record
   - Notifies teachers
7. **Success message** with prompt to print ID card

---

## Key Features

| Feature | Description |
|---------|-------------|
| ID Generation | Auto-generates unique EDU-XXXX-XXXX ID |
| Parent Link | Automatically links to existing parent |
| Address Auto-fill | Uses parent's address and contact |
| Teacher Notification | Alerts teachers about new student |
| ID Printing | Prompts to print ID card after enrollment |
| SHS Support | Shows strand dropdown for Grade 11-12 |
| Dynamic Classes | Populates class dropdown based on grade |

---

## Database Changes

No new tables required. Uses existing:
- `students` table - inserts new student record
- `notifications` table - sends alert to teachers

---

## Files Modified

| File | Changes |
|------|---------|
| `admin/admin-add-parent-and-child.js` | Added button, modal, handleGradeChange(), openLateEnrolleeModal(), saveLateEnrollee() |

---

## Testing Checklist

- [ ] Button appears in Edit Parent modal
- [ ] Modal opens over edit modal
- [ ] Grade level change shows/hides strand dropdown
- [ ] Class dropdown populates based on grade
- [ ] Validation works (12-digit LRN required)
- [ ] Student record created with correct ID
- [ ] Parent address/contact auto-filled
- [ ] Teacher receives notification
- [ ] Success message displays
- [ ] Print ID prompt appears
