# 6 UI Blockers & Query Crashes - FIXES

## FIX 1: Enrollment Modal 'Next Step' Blocked
**File:** `admin/admin-user-management.js`
**Problem:** nextStep() function not accessible from HTML onclick handlers
**Fix:** Attach to window object (add at end of file)

```javascript
// ===== ADD TO END OF admin/admin-user-management.js =====
// Make functions globally accessible for HTML onclick handlers
window.nextStep = nextStep;
window.prevStep = prevStep;
window.openEnrollmentModal = openEnrollmentModal;
window.closeEnrollmentModal = closeEnrollmentModal;
window.setEnrollType = setEnrollType;
window.showStep = showStep;
window.switchView = switchView;
```

---

## FIX 2: Class Management Modal Cannot Close
**File:** `admin/admin-class-management.js`
**Problem:** closeClassModal() not attached to window object
**Fix:** Add window attachment (add at end of file)

```javascript
// ===== ADD TO END OF admin/admin-class-management.js =====
// Make functions globally accessible for HTML onclick handlers
window.closeClassModal = closeClassModal;
window.openClassModal = openClassModal;
window.editClass = editClass;
window.deleteClass = deleteClass;
window.openSubjectLoad = openSubjectLoad;
window.closeSubjectLoadModal = closeSubjectLoadModal;
window.openAddSubjectModal = openAddSubjectModal;
window.closeAddSubjectModal = closeAddSubjectModal;
window.deleteSubject = deleteSubject;
window.loadClasses = loadClasses;
```

---

## FIX 3: Analytics Graph Crash (PGRST200) - ALREADY FIXED!
**File:** `admin/admin-data-analytics.js`
**Status:** The code already fetches `attendance_logs` and `excuse_letters` separately in JavaScript and merges them - this is correct! No fix needed.

---

## FIX 4: Announcement & Suspension Modals Crashing
**File:** `admin/admin-announcements.js`
**Problem 1:** openAnnouncementModal defined but setCategory has null safety issues
**Problem 2:** saveSuspension in admin-attendance-settings.js uses event.currentTarget

**Fix for admin-announcements.js - setCategory function:**

```javascript
// ===== REPLACE setCategory FUNCTION IN admin/admin-announcements.js =====
// Fixed with null safety checks
function setCategory(event, category) {
    if (event) event.preventDefault();
    selectedCategory = category;
    // Update UI to show selected category - with null safety
    const categoryButtons = document.querySelectorAll('.category-btn');
    if (categoryButtons && categoryButtons.length > 0) {
        categoryButtons.forEach(btn => {
            if (btn) {
                btn.classList.remove('border-violet-500', 'bg-violet-50');
                btn.classList.add('border-gray-50');
            }
        });
    }
    const selectedBtn = document.getElementById('cat-' + category);
    if (selectedBtn) {
        selectedBtn.classList.remove('border-gray-50');
        selectedBtn.classList.add('border-violet-500', 'bg-violet-50');
    }
}
```

**Fix for admin-announcements.js - Ensure window attachment:**

```javascript
// ===== ADD TO END OF admin/admin-announcements.js =====
// Make all modal functions globally accessible
window.openAnnouncementModal = openAnnouncementModal;
window.closeAnnouncementModal = closeAnnouncementModal;
window.openSuspensionModal = openSuspensionModal;
window.closeSuspensionModal = closeSuspensionModal;
window.setCategory = setCategory;
window.switchAnnouncementTab = switchAnnouncementTab;
```

**Fix for admin-attendance-settings.js - saveSuspension function:**

```javascript
// ===== REPLACE saveSuspension FUNCTION IN admin/admin-attendance-settings.js =====
// Fixed to not rely on event.currentTarget
async function saveSuspension(event) {
    if (event) event.preventDefault();
    
    const id = document.getElementById('suspension-id')?.value;
    const title = document.getElementById('suspension-title')?.value;
    const description = document.getElementById('suspension-description')?.value;
    const startDate = document.getElementById('suspension-start')?.value;
    const endDate = document.getElementById('suspension-end')?.value;
    const type = document.getElementById('suspension-type')?.value;
    const isActive = document.getElementById('suspension-active')?.checked;
    
    if (!title || !startDate || !endDate || !type) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
        showNotification('Start date must be before end date', 'error');
        return;
    }
    
    let affectedData = { affected_grades: [], affected_classes: [] };
    
    if (type === 'grade_suspension') {
        const checkedGrades = document.querySelectorAll('input[name="affected_grades"]:checked');
        affectedData.affected_grades = Array.from(checkedGrades).map(cb => cb.value);
    } else if (type === 'suspension') {
        const checkedClasses = document.querySelectorAll('input[name="affected_classes"]:checked');
        affectedData.affected_classes = Array.from(checkedClasses).map(cb => cb.value);
    } else if (type === 'saturday_class') {
        affectedData.saturday_enabled = document.getElementById('saturday_enabled')?.checked || false;
    }
    
    const payload = {
        title,
        description,
        start_date: startDate,
        end_date: endDate,
        suspension_type: type,
        is_active: isActive,
        ...affectedData
    };
    
    try {
        let error;
        if (id) {
            ({ error } = await supabase.from('suspensions').update(payload).eq('id', id));
        } else {
            ({ error } = await supabase.from('suspensions').insert(payload));
        }
        
        if (error) throw error;
        
        // CONSOLIDATED LOGIC: Auto-broadcast announcement when suspension is set
        if (isActive) {
            const typeLabel = type.replace(/_/g, ' ').toUpperCase();
            await supabase.from('announcements').insert([{
                title: `📢 ${typeLabel} ALERT: ${title}`,
                content: `A ${typeLabel} has been declared from ${formatDate(startDate)} to ${formatDate(endDate)}. ${description}`,
                target_parents: true,
                target_teachers: true,
                target_guards: true
            }]);
        }

        showNotification(id ? 'Suspension updated successfully' : 'Suspension added successfully', 'success');
        closeSuspensionModal();
        loadSuspensions();
        
    } catch (err) {
        console.error("Error saving suspension:", err);
        showNotification('Error saving: ' + err.message, 'error');
    }
}
```

---

## FIX 5: Disappearing Tabs (Settings & Gate Logic)
**File:** `admin/admin-settings.js`
**Problem:** switchTab adds 'hidden' to all but doesn't properly remove from target

**Fix for admin-settings.js - switchTab function:**

```javascript
// ===== REPLACE switchTab FUNCTION IN admin/admin-settings.js =====
// Fixed to properly show target tab
function switchTab(event, tabId) {
    if (event && event.preventDefault) event.preventDefault();
    
    const tabs = ['gate-logic', 'auto-alerts', 'password-resets'];
    tabs.forEach(t => {
        const section = document.getElementById(`section-${t}`);
        const btn = document.getElementById(`btn-${t}`);
        
        // Hide all sections
        if (section) {
            if (t === tabId) {
                section.classList.remove('hidden');
            } else {
                section.classList.add('hidden');
            }
        }
        
        // Update button styles
        if (btn) {
            if (t === tabId) {
                btn.classList.remove('border-transparent', 'text-gray-400');
                btn.classList.add('border-violet-500', 'text-violet-600');
            } else {
                btn.classList.remove('border-violet-500', 'text-violet-600');
                btn.classList.add('border-transparent', 'text-gray-400');
            }
        }
    });

    if (tabId === 'password-resets') {
        loadPasswordResets();
    }
}

// ===== ADD TO END OF admin/admin-settings.js =====
// Make tab functions globally accessible
window.switchTab = switchTab;
```

---

## FIX 6: ID Management Supabase 406 Error
**File:** `admin/admin-idmanagement.js`
**Problem:** Using `.select('*, classes(), parents()')` which may cause 406 if foreign key relationships don't exist
**Fix:** Use separate queries instead of joins

**Replace the loadStudentIDs function:**

```javascript
// ===== REPLACE loadStudentIDs FUNCTION IN admin/admin-idmanagement.js =====
// Fixed: Fetch in separate queries to avoid PGRST116/406 errors
async function loadStudentIDs() {
    const grid = document.getElementById('idGrid');
    
    // Step 1: Fetch all students
    const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('*')
        .order('full_name');
    
    if (studentsError) {
        console.error('Error fetching students:', studentsError);
        studentRecords = [];
        renderIDGrid([]);
        return;
    }
    
    // Step 2: Fetch classes separately
    const { data: classes, error: classesError } = await supabase
        .from('classes')
        .select('id, grade_level, section_name');
    
    // Step 3: Fetch parents separately
    const { data: parents, error: parentsError } = await supabase
        .from('parents')
        .select('id, full_name, contact_number');
    
    // Step 4: Map class and parent data to students in JavaScript
    const classMap = {};
    if (classes) {
        classes.forEach(c => { classMap[c.id] = c; });
    }
    
    const parentMap = {};
    if (parents) {
        parents.forEach(p => { parentMap[p.id] = p; });
    }
    
    // Merge data manually
    studentRecords = (students || []).map(s => ({
        ...s,
        classes: s.class_id ? classMap[s.class_id] : null,
        parents: s.parent_id ? parentMap[s.parent_id] : null
    }));
    
    // Update student count
    const countEl = document.getElementById('studentCount');
    if (countEl) countEl.textContent = `${studentRecords.length} Students`;
    
    renderIDGrid(studentRecords);
}
```

---

## SUMMARY OF FILES TO EDIT:
1. `admin/admin-user-management.js` - Add window attachments
2. `admin/admin-class-management.js` - Add window attachments  
3. `admin/admin-announcements.js` - Fix setCategory null safety + ensure window attachments
4. `admin/admin-attendance-settings.js` - Fix saveSuspension event handling
5. `admin/admin-settings.js` - Fix switchTab logic + add window attachment
6. `admin/admin-idmanagement.js` - Replace join query with separate queries

