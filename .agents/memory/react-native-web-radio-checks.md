---
name: React Native Web radio checks
description: How to avoid false-negative Playwright assertions for selected radio-like Pressables.
---

React Native Web can visually select a `Pressable` with `accessibilityRole="radio"` and `accessibilityState={{ checked: true }}` without emitting an `aria-checked` attribute that Playwright's `toBeChecked()` recognizes.

**Why:** A selected swatch rendered its check mark and selected border, and its enclosing accessibility label reflected the selected value, while `toBeChecked()` repeatedly reported it as unchecked.

**How to apply:** For these controls, assert a semantic enclosing label that names the selected value plus a stable selected visual state. Use `toBeChecked()` only after confirming the rendered DOM contains `aria-checked`.