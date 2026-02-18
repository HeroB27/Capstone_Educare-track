// admin/admin-idtemplate.js

// 1. Session Check
// currentUser is now global in admin-core.js

// Current template settings
// UPDATED: Simplified to only support student templates for physical card printing
let currentTemplateType = 'student';
let templateSettings = {
    student: {
        primaryColor: '#4f46e5',
        secondaryColor: '#f59e0b',
        schoolName: 'Educare School',
        schoolAddress: '123 Education Street, Manila',
        layoutStyle: 'horizontal',
        photoPosition: 'left',
        fields: {
            qr: true,
            lrn: true,
            contact: true,
            address: false,
            bloodType: false,
            emergency: false
        }
    }
};

// 2. Initialize Page
document.addEventListener('DOMContentLoaded', () => {
    if (currentUser) {
        document.getElementById('admin-name').innerText = currentUser.full_name || 'Admin';
    }
    
    // Load saved student template
    loadTemplate();
    
    // Initial preview
    updatePreview();
    
    // Set up color input listeners
    document.getElementById('primaryColor').addEventListener('input', (e) => {
        document.getElementById('primaryColorText').value = e.target.value;
        updateColor('primary');
    });
    
    document.getElementById('secondaryColor').addEventListener('input', (e) => {
        document.getElementById('secondaryColorText').value = e.target.value;
        updateColor('secondary');
    });
});

// ============ TAB SWITCHING ============

// 3. Switch Template Tab
function switchTemplateTab(tabName) {
    // Update tab styling
    document.getElementById('tab-design').className = 'px-4 py-2 border-b-2 border-transparent text-gray-500 hover:text-gray-700';
    document.getElementById('tab-preview').className = 'px-4 py-2 border-b-2 border-transparent text-gray-500 hover:text-gray-700';
    document.getElementById('tab-saved').className = 'px-4 py-2 border-b-2 border-transparent text-gray-500 hover:text-gray-700';
    document.getElementById('tab-' + tabName).className = 'px-4 py-2 border-b-2 border-violet-500 text-violet-600 font-medium';
    
    // Show/hide content
    document.getElementById('designTab').classList.add('hidden');
    document.getElementById('previewTab').classList.add('hidden');
    document.getElementById('savedTab').classList.add('hidden');
    document.getElementById(tabName + 'Tab').classList.remove('hidden');
    
    // Re-render previews if switching to preview tab
    if (tabName === 'preview') {
        renderLivePreviews();
    }
}

// ============ TEMPLATE SELECTION ============

// 4. Select Template Type
// UPDATED: Simplified to only handle student template
function selectTemplate(type) {
    // Always use student type
    currentTemplateType = 'student';
    
    // Update button styles - only highlight student
    document.querySelectorAll('.template-btn').forEach(btn => {
        btn.classList.remove('border-violet-500', 'bg-violet-50');
        if (btn.dataset.type === 'student') {
            btn.classList.add('border-violet-500', 'bg-violet-50');
        }
    });
    
    // Load settings for student template
    const settings = templateSettings['student'];
    document.getElementById('primaryColor').value = settings.primaryColor;
    document.getElementById('primaryColorText').value = settings.primaryColor;
    document.getElementById('secondaryColor').value = settings.secondaryColor;
    document.getElementById('secondaryColorText').value = settings.secondaryColor;
    document.getElementById('schoolName').value = settings.schoolName;
    document.getElementById('schoolAddress').value = settings.schoolAddress;
    document.getElementById('layoutStyle').value = settings.layoutStyle;
    document.getElementById('photoPosition').value = settings.photoPosition;
    
    // Update field checkboxes
    document.getElementById('fieldQR').checked = settings.fields.qr;
    document.getElementById('fieldLRN').checked = settings.fields.lrn;
    document.getElementById('fieldContact').checked = settings.fields.contact;
    document.getElementById('fieldAddress').checked = settings.fields.address;
    document.getElementById('fieldBloodType').checked = settings.fields.bloodType;
    document.getElementById('fieldEmergency').checked = settings.fields.emergency;
    
    updatePreview();
}

// ============ COLOR UPDATE ============

// 5. Update Color from Text Input
function updateColor(type) {
    const textInput = type === 'primary' ? document.getElementById('primaryColorText') : document.getElementById('secondaryColorText');
    const colorInput = type === 'primary' ? document.getElementById('primaryColor') : document.getElementById('secondaryColor');
    
    colorInput.value = textInput.value;
    templateSettings[currentTemplateType][type + 'Color'] = textInput.value;
    updatePreview();
}

// ============ PREVIEW ============

// 6. Update Template Preview
function updatePreview() {
    const settings = templateSettings[currentTemplateType];
    
    // Update settings from form
    settings.primaryColor = document.getElementById('primaryColor').value;
    settings.secondaryColor = document.getElementById('secondaryColor').value;
    settings.schoolName = document.getElementById('schoolName').value;
    settings.schoolAddress = document.getElementById('schoolAddress').value;
    settings.layoutStyle = document.getElementById('layoutStyle').value;
    settings.photoPosition = document.getElementById('photoPosition').value;
    
    settings.fields.qr = document.getElementById('fieldQR').checked;
    settings.fields.lrn = document.getElementById('fieldLRN').checked;
    settings.fields.contact = document.getElementById('fieldContact').checked;
    settings.fields.address = document.getElementById('fieldAddress').checked;
    settings.fields.bloodType = document.getElementById('fieldBloodType').checked;
    settings.fields.emergency = document.getElementById('fieldEmergency').checked;
    
    // Render preview
    const previewEl = document.getElementById('templatePreview');
    previewEl.innerHTML = generateIDCardHTML(currentTemplateType, settings, {
        idText: 'PREVIEW-001',
        fullName: 'Sample User',
        secondaryInfo: 'Grade 7 - Section A',
        lrn: '123456789012',
        contact: '0912-345-6789',
        address: '123 Sample Street, City',
        bloodType: 'O+',
        emergency: 'Mother: 0999-888-7777'
    });
    
    // Generate QR code
    const qrContainer = previewEl.querySelector('.qr-code-container');
    if (qrContainer) {
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: 'PREVIEW-001',
            width: 60,
            height: 60
        });
    }
}

// 7. Generate ID Card HTML
function generateIDCardHTML(type, settings, data) {
    const layoutStyle = settings.layoutStyle;
    const photoPos = settings.photoPosition;
    
    // Type-specific styling
    const typeConfig = {
        student: { label: 'STUDENT ID', bgGradient: settings.primaryColor },
        teacher: { label: 'FACULTY ID', bgGradient: '#2563eb' },
        staff: { label: 'STAFF ID', bgGradient: '#059669' }
    };
    
    const config = typeConfig[type];
    
    if (layoutStyle === 'horizontal') {
        return `
            <div style="display: flex; height: 100%; background: linear-gradient(to right, ${settings.primaryColor} 35%, white 35%);">
                <div style="width: 35%; background: ${settings.primaryColor}; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0.1in; color: white; text-align: center;">
                    <div style="width: 0.7in; height: 0.7in; background: white; border-radius: 50%; margin-bottom: 0.08in; overflow: hidden;">
                        <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 0.25in; font-weight: bold; color: ${settings.primaryColor};">${data.fullName.charAt(0)}</div>
                    </div>
                    <div class="qr-code-container" style="margin-top: 0.05in;"></div>
                    <p style="font-size: 0.08in; margin-top: 0.05in;">SCAN FOR INFO</p>
                </div>
                <div style="width: 65%; padding: 0.1in; display: flex; flex-direction: column;">
                    <div style="background: ${settings.secondaryColor}; color: white; padding: 0.03in 0.08in; font-size: 0.1in; font-weight: bold; position: absolute; top: 0.1in; right: 0.1in;">${config.label}</div>
                    <p style="font-size: 0.07in; color: #666; margin-bottom: 0.02in;">${settings.schoolName}</p>
                    <p style="font-size: 0.07in; color: #666; margin-bottom: 0.05in;">${settings.schoolAddress}</p>
                    <p style="font-size: 0.13in; font-weight: bold; margin-bottom: 0.02in; line-height: 1.1;">${data.fullName}</p>
                    <p style="font-size: 0.09in; color: #666; margin-bottom: 0.03in;">${data.secondaryInfo}</p>
                    <p style="font-size: 0.08in; font-weight: bold; color: ${settings.primaryColor};">${data.idText}</p>
                    ${settings.fields.lrn && data.lrn ? `<p style="font-size: 0.07in; color: #666;">LRN: ${data.lrn}</p>` : ''}
                    ${settings.fields.contact && data.contact ? `<p style="font-size: 0.07in; color: #666;">📞 ${data.contact}</p>` : ''}
                    ${settings.fields.bloodType && data.bloodType ? `<p style="font-size: 0.07in; color: #666;">🩸 ${data.bloodType}</p>` : ''}
                    <p style="font-size: 0.06in; color: #999; margin-top: auto;">Valid until: ${new Date().getFullYear() + 1}</p>
                </div>
            </div>
        `;
    } else if (layoutStyle === 'vertical') {
        return `
            <div style="height: 100%; background: white; display: flex; flex-direction: column;">
                <div style="background: linear-gradient(135deg, ${settings.primaryColor}, ${settings.secondaryColor}); padding: 0.1in; text-align: center; color: white;">
                    <p style="font-size: 0.07in; margin-bottom: 0.02in;">${settings.schoolName}</p>
                    <p style="font-size: 0.1in; font-weight: bold;">${config.label}</p>
                </div>
                <div style="flex: 1; padding: 0.1in; text-align: center;">
                    <div style="width: 0.8in; height: 0.8in; background: #f0f0f0; border-radius: 50%; margin: 0 auto 0.08in; overflow: hidden;">
                        <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 0.3in; font-weight: bold; color: ${settings.primaryColor};">${data.fullName.charAt(0)}</div>
                    </div>
                    <div class="qr-code-container" style="margin: 0 auto;"></div>
                    <p style="font-size: 0.12in; font-weight: bold; margin-bottom: 0.02in;">${data.fullName}</p>
                    <p style="font-size: 0.09in; color: #666; margin-bottom: 0.05in;">${data.secondaryInfo}</p>
                    <p style="font-size: 0.1in; font-weight: bold; color: ${settings.primaryColor};">${data.idText}</p>
                </div>
            </div>
        `;
    } else {
        // Compact layout
        return `
            <div style="height: 100%; background: white; display: flex; border: 2px solid ${settings.primaryColor};">
                <div style="width: 30%; background: ${settings.primaryColor}; display: flex; align-items: center; justify-content: center; padding: 0.05in;">
                    <div style="width: 0.5in; height: 0.5in; background: white; border-radius: 50%; overflow: hidden;">
                        <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 0.18in; font-weight: bold; color: ${settings.primaryColor};">${data.fullName.charAt(0)}</div>
                    </div>
                </div>
                <div style="width: 70%; padding: 0.05in; display: flex; flex-direction: column; justify-content: center;">
                    <p style="font-size: 0.1in; font-weight: bold;">${data.fullName}</p>
                    <p style="font-size: 0.08in; color: #666;">${data.secondaryInfo}</p>
                    <p style="font-size: 0.09in; font-weight: bold; color: ${settings.primaryColor};">${data.idText}</p>
                    <div class="qr-code-container" style="position: absolute; bottom: 0.05in; right: 0.05in; width: 0.35in; height: 0.35in;"></div>
                </div>
            </div>
        `;
    }
}

// ============ LIVE PREVIEWS ============

// 8. Render Live Previews
function renderLivePreviews() {
    const sampleData = {
        student: {
            idText: 'EDU-2025-9012-ABCD',
            fullName: 'Juan Dela Cruz',
            secondaryInfo: 'Grade 7 - Section Rose',
            lrn: '123456789012',
            contact: '0912-345-6789',
            address: '123 Main St, Manila',
            bloodType: 'O+',
            emergency: 'Mother: 0999-888-7777'
        },
        teacher: {
            idText: 'TCH-2025-6789-WXYZ',
            fullName: 'Maria Santos',
            secondaryInfo: 'Mathematics Department',
            lrn: '',
            contact: '0912-345-1111',
            address: '456 School Rd, QC',
            bloodType: 'A+',
            emergency: '0912-345-2222'
        },
        staff: {
            idText: 'ADM-2025-3333-QQRS',
            fullName: 'Robert Lee',
            secondaryInfo: 'Administrative Staff',
            lrn: '',
            contact: '0912-345-3333',
            address: '789 Office Ave, Makati',
            bloodType: 'B+',
            emergency: '0912-345-4444'
        }
    };
    
    // Render student preview
    const studentPreview = document.getElementById('studentPreview');
    studentPreview.innerHTML = generateIDCardHTML('student', templateSettings.student, sampleData.student);
    const studentQR = studentPreview.querySelector('.qr-code-container');
    if (studentQR) {
        new QRCode(studentQR, { text: sampleData.student.idText, width: 60, height: 60 });
    }
    
    // Render teacher preview
    const teacherPreview = document.getElementById('teacherPreview');
    teacherPreview.innerHTML = generateIDCardHTML('teacher', templateSettings.teacher, sampleData.teacher);
    const teacherQR = teacherPreview.querySelector('.qr-code-container');
    if (teacherQR) {
        new QRCode(teacherQR, { text: sampleData.teacher.idText, width: 60, height: 60 });
    }
    
    // Render staff preview
    const staffPreview = document.getElementById('staffPreview');
    staffPreview.innerHTML = generateIDCardHTML('staff', templateSettings.staff, sampleData.staff);
    const staffQR = staffPreview.querySelector('.qr-code-container');
    if (staffQR) {
        new QRCode(staffQR, { text: sampleData.staff.idText, width: 60, height: 60 });
    }
}

// ============ SAVE/LOAD TEMPLATES ============

// 9. Save Template
async function saveTemplate() {
    const settings = templateSettings[currentTemplateType];
    
    try {
        const { error } = await supabase
            .from('id_templates')
            .upsert({
                template_type: currentTemplateType,
                settings: settings,
                updated_at: new Date().toISOString()
            }, { onConflict: 'template_type' });
        
        if (error) throw error;
        
        alert('Template saved successfully!');
        loadSavedTemplates();
        
    } catch (error) {
        console.error('Error saving template:', error);
        alert('Error saving template: ' + error.message);
    }
}

// 10. Load Saved Template
// UPDATED: Simplified to only load student template
async function loadTemplate() {
    try {
        const { data, error } = await supabase
            .from('id_templates')
            .select('*')
            .eq('template_type', 'student')
            .single();

        if (data && data.settings) {
            templateSettings.student = { ...templateSettings.student, ...data.settings };
        }
        
        // Apply settings to UI
        const settings = templateSettings.student;
        document.getElementById('primaryColor').value = settings.primaryColor;
        document.getElementById('primaryColorText').value = settings.primaryColor;
        document.getElementById('secondaryColor').value = settings.secondaryColor;
        document.getElementById('secondaryColorText').value = settings.secondaryColor;
        document.getElementById('schoolName').value = settings.schoolName;
        document.getElementById('schoolAddress').value = settings.schoolAddress;
        document.getElementById('layoutStyle').value = settings.layoutStyle;
        document.getElementById('photoPosition').value = settings.photoPosition;
        
        document.getElementById('fieldQR').checked = settings.fields.qr;
        document.getElementById('fieldLRN').checked = settings.fields.lrn;
        document.getElementById('fieldContact').checked = settings.fields.contact;
        document.getElementById('fieldAddress').checked = settings.fields.address;
        document.getElementById('fieldBloodType').checked = settings.fields.bloodType;
        document.getElementById('fieldEmergency').checked = settings.fields.emergency;
        
        updatePreview();
        
    } catch (error) {
        console.log('No saved template found, using defaults');
    }
}

// 11. Generate Preview Thumbnail
function generatePreviewThumbnail(template) {
    const sampleData = {
        idText: 'SAMPLE-001',
        fullName: 'User Name',
        secondaryInfo: 'Sample User',
        lrn: '123456789012',
        contact: '0912-345-6789',
        address: 'Sample Address',
        bloodType: 'A+',
        emergency: 'Emergency Contact'
    };
    
    return generateIDCardHTML(template.template_type, template.settings, sampleData);
}

// 12. Load Template (from saved templates list)
// UPDATED: Simplified to only load student template
function loadTemplateFromList(type) {
    selectTemplate('student');
    alert('Loaded student template');
    switchTemplateTab('design');
}

// 13. Delete Template
// UPDATED: Simplified to only delete student template
async function deleteTemplate(type) {
    if (!confirm('Are you sure you want to delete the student template?')) {
        return;
    }
    
    try {
        const { error } = await supabase
            .from('id_templates')
            .delete()
            .eq('template_type', 'student');
        
        if (error) throw error;
        
        alert('Template deleted');
        // Reload defaults
        templateSettings.student = {
            primaryColor: '#4f46e5',
            secondaryColor: '#f59e0b',
            schoolName: 'Educare School',
            schoolAddress: '123 Education Street, Manila',
            layoutStyle: 'horizontal',
            photoPosition: 'left',
            fields: {
                qr: true,
                lrn: true,
                contact: true,
                address: false,
                bloodType: false,
                emergency: false
            }
        };
        updatePreview();
        
    } catch (error) {
        console.error('Error deleting template:', error);
        alert('Error deleting template: ' + error.message);
    }
}

// 14. Reset Template
function resetTemplate() {
    selectTemplate('student');
    alert('Template reset to defaults');
    updatePreview();
}
