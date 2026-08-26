---
name: Framer Motion scroll keyframes
description: Constraint for dynamic scroll-linked useTransform input ranges.
---

Clamp dynamically calculated scroll-progress input ranges to strictly ordered
values inside 0–1 before passing them to `useTransform`.

**Why:** First/last items in mapped scroll scenes can produce negative or
greater-than-one offsets. When Framer Motion promotes those values to WAAPI,
Chromium can throw “Offsets must be monotonically non-decreasing” during mount
and prevent the entire React tree from rendering.

**How to apply:** For staggered or indexed sticky scenes, calculate bounded
fade-in, active, and fade-out points before creating each motion value. Keep
hooks in stable child components rather than calling them directly inside a
mapping callback.