# Long screenshot v2 verification

Run `node tests/share-layout.test.cjs` for UTC+8 day splitting, duration sums,
invalid timestamps, filename sanitization and bounded image slices.

Serve the project locally and open `tests/share-preview.html`. This fixture does
not call navigation or AI APIs and does not modify saved itineraries. Its map is
explicitly synthetic. Images appended below the modal are the actual html2canvas
outputs, not DOM previews. Reload to clear these test-only image copies.

Verified on 2026-09-23 in the desktop browser and a 393×852 viewport:
- A 12-destination itinerary creates four 1200px-wide PNGs, each under 7200px high.
- Long place names wrap; summary values are centered; dark editor theme does not
  change the daylight export.
- Custom titles update the poster; map failure disables export with an actionable
  message, and unchecking map allows generation.
- Mobile preview fits its container; actual PNGs retain the full 600px layout.

Before release, still verify on a real iPhone Safari: real AMap/WebGL snapshot,
native multi-file sharing, and saving every image to Photos/Files. The fixture
does not prove platform-specific sharing or cross-origin map capture behavior.

Implementation: `share-layout.js` holds deterministic helpers, `share-v2.js`
builds the frozen export document, and `share-v2.css` isolates its layout. The
legacy `share.js` is retained but no longer loaded. Export does not fetch missing
navigation geometry or trigger new AI analysis.
