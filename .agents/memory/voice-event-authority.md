---
name: Voice event authority
description: Rules for choosing and validating events before the run companion speaks.
---

Treat spoken status as a stronger claim than an optimistic visual preview: territory rewards require an authoritative save result, and delayed area advisories require both the same active run and the same current coarse area.

**Why:** Audio is hard to retract. Optimistic ownership data can falsely announce a reward, while delayed advisory lookups can describe an area the runner already left and suppress a relevant advisory through cooldown.

**How to apply:** For future voice events, bind each announcement to a stable event ID and its authoritative source. Any asynchronous location-derived response must validate its run/session and current coarse context before entering the speech queue.