---
name: Equity baseline privacy
description: Privacy, replay, retention, and snapshot rules for coarse activity-based equity rewards.
---

Coarse reward baselines must not retain runner IDs, coordinates, or joinable run IDs. Use domain-separated opaque keys for run idempotency and per-runner/day/area replay resistance, and keep only the coarse area, city, and UTC day needed by the classifier.

**Why:** A raw run reference makes an otherwise coarse aggregate privately joinable back to precise route history, while run-only deduplication lets repeated routes inflate a low-activity baseline. Historical backfills can also rewrite future reward tiers unless baseline inputs are closed by server day.

**How to apply:** Accept at most one contribution per runner/UTC-day/coarse-area, admit only runs completed on the current server UTC day, prune against wall-clock time on both reads and writes, and freeze each city/day evaluation under a stable lock. Ownership and bonus accounting remain separate.