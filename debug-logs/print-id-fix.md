# Print ID Fix - 2026-04-08

## Problem
The print function in `admin-add-parent-and-child.js` created a new window with only minimal inline styles. It did NOT include:
- Tailwind CSS classes (`.flex`, `.bg-white`, `.rounded-xl`, `.shadow-2xl`, etc.)
- Google Fonts (Inter)
- Print color adjustment rules
- Arbitrary value support for `w-[2in]` and `h-[3in]`

As a result, printed ID cards appeared as unstyled text without proper dimensions.

## Cause
The original `printIDCard()` function (line 1076) only wrote a minimal HTML document:
```javascript
printWindow.document.write(`<!DOCTYPE html><html><head><title>Student ID Card</title><style>body{font-family:'Inter',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;}</style></head><body><div class="flex gap-4">${container.innerHTML}</div><script>window.onload=()=>setTimeout(()=>{window.print();setTimeout(()=>window.close(),500)},500);<\/script></body></html>`);
```

## Solution
1. Updated `printIDCard()` in `admin-add-parent-and-child.js` to include:
   - Tailwind CSS CDN
   - Google Fonts (Inter)
   - Print color adjustment rules
   - Attribute selectors for arbitrary dimensions (`w-[2in]`, `h-[3in]`)
   - Proper body centering styles
   - Page break avoidance

2. Added print button to ID Management drawer in `admin-idmanagement.html`

3. Added `printCurrentID()` function in `admin-idmanagement.js` with the same styling approach

## Files Modified
- `admin/admin-add-parent-and-child.js` - Updated `printIDCard()` function
- `admin/admin-idmanagement.html` - Added Print button
- `admin/admin-idmanagement.js` - Added `printCurrentID()` function