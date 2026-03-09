# TODO: Change Scanners from html5-qrcode to jsQR

## Status: COMPLETED

### HTML Files Updated:
- [x] 1. clinic/clinic-scanner.html - Replaced html5-qrcode script with jsQR
- [x] 2. guard/scanner.html - Replaced html5-qrcode script with jsQR
- [x] 3. guard/guard-dashboard.html - Replaced html5-qrcode script with jsQR
- [x] 4. teacher/teacher-gatekeeper-mode.html - Replaced html5-qrcode script with jsQR

### JavaScript Files Updated:
- [x] 5. clinic/clinic-scanner.js - Rewritten scanner to use jsQR
- [x] 6. guard/guard-core.js - Rewritten scanner to use jsQR
- [x] 7. teacher/teacher-gatekeeper-mode.js - Rewritten scanner to use jsQR

### Implementation Details:
- jsQR requires manual camera stream handling via MediaDevices API
- Implemented video element for camera stream
- Implemented canvas element for capturing frames
- Used requestAnimationFrame loop for continuous scanning
- Kept existing business logic (QR validation, database queries) unchanged
- Maintained USB HID scanner support for PC mode in guard module

### Library Change:
- Old: `<script src="https://unpkg.com/html5-qr-code" type="text/javascript"></script>`
- New: `<script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js" type="text/javascript"></script>`

