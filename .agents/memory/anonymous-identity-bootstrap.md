---
name: Anonymous identity bootstrap
description: Why fresh web identity enrollment must tolerate development remounts without racing persisted credentials.
---

Anonymous identity enrollment must stop after an effect is cancelled, and the resulting UID and credential must be persisted as one logical pair before the app publishes either one.

**Why:** React development remounts can overlap asynchronous enrollment attempts. A cancelled attempt that continues writing may leave storage referring to a different identity than the active app session, making territory and onboarding appear to change after reload.

**How to apply:** Keep cancellation checks around asynchronous enrollment boundaries, write the UID and credential together, and test reload persistence in a clean browser context without an initialization script that clears storage on every navigation.