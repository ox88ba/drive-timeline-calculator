# 2026-09-28 Share and stay cleanup

- Legacy selectedStayButtons may contain 20 from the retired fatigue-rest action. Preserve the duration but expose a selected, removable 20-minute button only for affected stops. Removing it preserves other selected durations.
- Remove drawer duplicate labels; put its night indicator next to lodging confirmation. Remove the date-divider background dashes and reduce card shadows.
- Naming input remains; shortcut buttons, address checkbox and zoom control are removed.
- The export freezes the trip payload and obtains one six-character code. The poster and both copy buttons use that same identity. Short URL: ?s=CODE. The server's existing seven-day expiry governs both.
- Short-link boot waits before starting the app, opens a read-only preview, and never overwrites the local draft. Failed or expired codes show a retry/return screen.
- Save long screenshot composes all rendered sections without segment footers. To stay within conservative mobile canvas limits, the full image is limited to 16,000 pixels high and 15 million pixels; oversized posters are downscaled, not cropped. High-resolution segmented images remain available.

Verification: 50 mobile regression cases; 375/390/393/430/1280 layout checks including 30/60 stops; real html2canvas full-image and segmented PNG generation; direct clipboard payload checks; share lifecycle/expiry unit tests. These are isolated desktop Chrome tests, not physical iPhone Safari validation.
