---
name: Expo Video shared-object cleanup
description: Preventing released VideoPlayer errors during native component unmount.
---

Let `useVideoPlayer` own the native player's release lifecycle. Component cleanup may cancel pending timers, but it must not call player methods during unmount.

**Why:** Expo's shared-object hook can release the player before a later component effect cleanup runs. Calling pause or another method then throws a released-object native error even though the player worked during normal rendering.

**How to apply:** Keep playback calls in mounted effects or user actions, cancel pending callbacks on cleanup, and rely on the hook to release its player.