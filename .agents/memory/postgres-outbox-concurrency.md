---
name: PostgreSQL outbox concurrency
description: Durable correlation, stale lease completion, and late-event classification rules for multi-instance outboxes.
---

Cross-process notification correlation must come from durable state rather than process-local memory. Lease completion must update by the exact current lock token and treat a missed guarded update as a no-op.

**Why:** A restart or another API instance can observe recovery, and a worker can finish after its lease is reclaimed. Process-local correlation can lose the matching event, while stale completion can overwrite a newer worker's terminal result.

When an unmatched event may become terminal after a grace window, serialize that classification with insertion of its matching event using the same per-correlation-key transaction lock, then recheck in a fresh database statement. Matching insertion should also reconcile an already-classified row.

**Why:** A time window alone does not remove the race at its boundary; snapshot visibility can classify an event immediately before a late matching insert commits.

**How to apply:** Use this pattern for any multi-instance PostgreSQL outbox with ordered event pairs, expiring leases, or delayed orphan cleanup. Keep payloads limited to the minimum non-sensitive operational fields.