---
name: Polling-safe interaction grants
description: Capability lifetime and issuance rules for actions launched from polling-based nearby markers
---

Polling must not invalidate a capability already rendered in an open action UI. Allow short overlap only through each capability's original bounded expiry, keep raw values out of storage, and revalidate live authorization at use time.

**Why:** strict latest-only rotation made a valid Wave modal fail whenever the next nearby poll landed between opening and sending. Unbounded overlap fixed the UX but created an authenticated write-amplification path.

**How to apply:** serialize and rate-limit capability issuance per viewer in durable server state at a cadence compatible with normal polling. Keep capabilities opaque, hashed at rest, viewer/target-bound, short lived, and independently recheck activity, distance, blocks, and rate limits when consumed.