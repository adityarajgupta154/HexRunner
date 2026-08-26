---
name: First-launch browser checks
description: Non-obvious prerequisites for exercising the cinematic onboarding-to-baseline handoff on mobile web
---

First-launch browser checks must provide a valid protected device identity and an available geolocation before asserting that baseline setup appears.

**Why:** the cinematic gate can render while identity initializes, but the Home screen returns its location status before mounting baseline setup. A test can correctly save the selected pace and still never see the baseline modal if location is unavailable.

**How to apply:** satisfy identity and location prerequisites before making cross-screen baseline assertions; otherwise test preference persistence independently from modal visibility.