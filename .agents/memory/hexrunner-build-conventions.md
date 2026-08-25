---
name: HexRunner runtime constraints
description: Non-obvious backend and Expo runtime decisions that future work must preserve
---

## Backend decision

Use Replit PostgreSQL through the shared Express API, with a device-local anonymous identity unless the user later asks for accounts. Do not introduce an external backend.

**Why:** the user explicitly rejected the checklist's prescribed backend and chose to keep HexRunner data in Replit.

**How to apply:** mobile code talks only to the shared API; the server owns database access. Keep completed-run writes atomic and idempotent, and preserve one durable pending run for restart-safe retries.

## Expo package compatibility

For this Expo SDK generation, Metro's live compatibility check is stricter than older maps guidance.

**Why:** installing 1.18.0 produced an explicit Expo compatibility warning; 1.20.1 removed it and Metro booted cleanly.

**How to apply:** keep the installed maps version aligned with Expo's live compatibility check and do not register it as an Expo config plugin.

The Replit browser preview cannot bundle the package-level `react-native-maps` index when `Marker` is imported, because it pulls a native-only codegen module into the web graph.

**Why:** platform-checking only at render time is too late; Metro resolves all static imports before that check.

**How to apply:** keep a web fallback and either isolate map components in native platform files or import the platform-safe MapView entry directly. Recheck the web bundle whenever adding native map overlays.

Expo Location's web subscription cleanup can call a missing native emitter method, even though starting the watcher works.

**Why:** a Run session recorded successfully in the browser but crashed on Stop when the Expo subscription's remove method ran.

**How to apply:** keep browser previews on the browser geolocation fallback; use Expo Location's high-accuracy watcher on iOS/Android. Always test both watcher setup and cleanup.

React Native may expose a `TextDecoder` that rejects `utf-16le`, while H3 4.5 eagerly requests that encoding during module initialization.

**Why:** static H3 imports crashed Android route registration before Home or Run could render, even though the relevant decoder path was not used by territory calculations.

**How to apply:** preserve the native-safe H3 loading boundary that probes decoder support and lets H3 select its JavaScript fallback. Validate on a physical Android device after H3, Metro, or Expo upgrades.

## Hackathon compliance note

The user's own PRD warns project-creation timestamps should postdate the city battle start (29 Aug 2026 Bengaluru). User was told this on 25 Aug and proceeded — treat this as a practice build unless they say otherwise.
