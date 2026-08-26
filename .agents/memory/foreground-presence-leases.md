---
name: Foreground presence leases
description: Why HexRunner rotates live-presence identities across app background and resume.
---

Keep the saved run identity stable, but give each uninterrupted foreground live-presence period its own ephemeral lease ID. Backgrounding or stopping terminally ends that lease; resuming creates a new lease and waits for a new foreground GPS fix before publishing.

**Why:** Server tombstones are required so delayed heartbeats cannot resurrect a runner after they disappear. Reusing a tombstoned ID would prevent legitimate resume, while reusing the cached pre-background fix could briefly expose a stale location.

**How to apply:** Multiplayer, contest, and connection features must treat the recorded run ID and current presence lease as separate concepts. Never revive an ended lease after resume or persist the publisher's in-memory latest fix.