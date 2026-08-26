# Memory Index

- [HexRunner runtime constraints](hexrunner-build-conventions.md) — Replit/PostgreSQL backend plus Expo web, maps, and browser-geolocation compatibility lessons.
- [Drizzle array parameters](drizzle-array-parameters.md) — avoid interpolating JS arrays into raw PostgreSQL array casts for lock/query helpers.
- [Foreground presence leases](foreground-presence-leases.md) — rotate ephemeral presence IDs after backgrounding while keeping the recorded run ID stable.
- [Discovery-anchor privacy](discovery-anchor-privacy.md) — bind Home anchors to foreground sessions and retain latest-only continuity across end/expiry to prevent scan resets.
- [Polling-safe interaction grants](interaction-grant-overlap.md) — keep displayed capabilities briefly valid across polls while bounding issuance to prevent write amplification.
- [Equity baseline privacy](equity-baseline-privacy.md) — keep reward baselines unlinkable, replay-resistant, closed-day-only, and frozen per city/day.
- [PostgreSQL outbox concurrency](postgres-outbox-concurrency.md) — correlate events durably, token-guard lease completion, and serialize terminal classification with late inserts.
