---
name: Cross-platform onboarding video codecs
description: Why cinematic mobile media needs separate native and browser encodings plus still-scene fallbacks.
---

Use H.264 MP4 for native Expo playback and VP9 WebM for browser playback when cinematic onboarding media must work in both environments. Keep a representative still for load failure and reduced-motion mode.

**Why:** Replit's Playwright Chromium can fetch a valid H.264 MP4 with the correct MIME type yet report no supported stream because that browser build lacks the codec. Network success alone does not prove media playback.

**How to apply:** For future HexRunner cinematic media, validate browser codec support, ready state, and advancing playback time. Preserve a platform-appropriate source and a non-animated poster for every scene.