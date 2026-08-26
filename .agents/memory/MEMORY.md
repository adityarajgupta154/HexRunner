# Memory Index

- [HexRunner runtime constraints](hexrunner-build-conventions.md) — Replit/PostgreSQL backend plus Expo web, maps, and browser-geolocation compatibility lessons.
- [Drizzle array parameters](drizzle-array-parameters.md) — avoid interpolating JS arrays into raw PostgreSQL array casts for lock/query helpers.
- [Foreground presence leases](foreground-presence-leases.md) — rotate ephemeral presence IDs after backgrounding while keeping the recorded run ID stable.
- [Discovery-anchor privacy](discovery-anchor-privacy.md) — bind Home anchors to foreground sessions and retain latest-only continuity across end/expiry to prevent scan resets.
- [Polling-safe interaction grants](interaction-grant-overlap.md) — keep displayed capabilities briefly valid across polls while bounding issuance to prevent write amplification.
- [Equity baseline privacy](equity-baseline-privacy.md) — keep reward baselines unlinkable, replay-resistant, closed-day-only, and frozen per city/day.
- [PostgreSQL outbox concurrency](postgres-outbox-concurrency.md) — correlate events durably, token-guard lease completion, and serialize terminal classification with late inserts.
- [Voice event authority](voice-event-authority.md) — spoken run events must use authoritative confirmations and reject stale asynchronous context.
- [First-launch browser checks](first-launch-browser-checks.md) — baseline handoff checks need both protected identity state and an available location.
- [Anonymous identity bootstrap](anonymous-identity-bootstrap.md) — keep fresh web identity setup cancellation-aware and persist each UID/credential pair atomically.
- [React Native Web radio checks](react-native-web-radio-checks.md) — verify selected Pressables through visual/accessibility labels when aria-checked is absent.
- [Cross-platform onboarding video codecs](onboarding-video-codecs.md) — pair native H.264 with web VP9 and still posters; fetched MP4s may remain undecodable in Chromium.
- [Expo Video shared-object cleanup](expo-video-cleanup.md) — let useVideoPlayer own release; unmount cleanup must not call methods on a player that may already be released.
- [Framer Motion scroll keyframes](framer-motion-scroll-keyframes.md) — clamp dynamic scroll ranges to ordered 0–1 values before useTransform reaches WAAPI.
- [CSS sticky overflow ancestors](css-sticky-overflow-ancestors.md) — use overflow-x clip, not hidden, around long sticky decks to prevent blank runways.
