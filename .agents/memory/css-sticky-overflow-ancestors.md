---
name: CSS sticky overflow ancestors
description: Prevent horizontal clipping wrappers from breaking long sticky scroll scenes.
---

Use `overflow-x: clip` rather than `overflow-x: hidden` on page-level wrappers
that contain long `position: sticky` scenes.

**Why:** A hidden overflow axis can create a new overflow ancestor. Sticky
children then stop pinning against the document viewport while their tall
runway continues, producing large blank solid-color gaps.

**How to apply:** Keep document-level sticky decks outside scrolling overflow
containers. Use `clip` for horizontal paint containment and verify intermediate
scroll positions, not only section endpoints.