---
name: Discovery-anchor privacy
description: Privacy and anti-scanning rules for Home nearby-runner discovery
---

Home discovery anchors must use a new opaque session ID for every focused foreground lifecycle. Ending a session must create a coordinate-free tombstone before deleting its active anchor, under the same per-user lock used by updates.

**Why:** aborting a request does not guarantee the server stopped processing it. Without session-bound tombstones, a delayed anchor update can commit after blur/background cleanup and resurrect a private location.

**How to apply:** always end the current Home session on blur, background, mode change, or unmount, even when its anchor update is still pending. A new foreground lifecycle uses a new session ID.

Anchor continuity and rate limits must survive explicit end and active-anchor expiry through one latest-only, non-discoverable anti-abuse snapshot with a bounded TTL. It is never a search center or marker candidate.

**Why:** deleting the only continuity record lets a client repeatedly create an anchor at arbitrary coordinates, query nearby runners, end it, and immediately repeat elsewhere.

**How to apply:** update the single latest continuity snapshot atomically with accepted anchors, enforce relocation/rate checks across sessions, and document its retention as a deliberate privacy-versus-abuse tradeoff rather than location attestation.