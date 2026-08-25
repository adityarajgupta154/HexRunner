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

React Native may expose a `TextDecoder` that rejects `utf-16le`, while H3 4.5 can request that encoding during initialization. H3 failures inside map/GPS callbacks also bypass React error boundaries.

**Why:** static H3 imports once crashed Android route registration, and an Expo Go project-level failure later occurred after map/API startup where a callback exception would not reach a screen boundary.

**How to apply:** keep H3 initialization lazy and preserve the decoder compatibility probe. Catch and log H3 work inside map events, GPS callbacks, and finalization; never rely on a React boundary there. Validate on physical Android after H3, Metro, or Expo upgrades.

Full-screen raster slides inside a horizontal React Native Web list must use the rendered root frame, not static device or source-image dimensions.

**Why:** browser previews can expose physical-pixel or natural-image sizes to React Native layout, producing a cropped poster and page offsets larger than the visible CSS viewport even though the app root itself is correctly sized.

**How to apply:** measure the rendered web root, give every page an explicit matching frame, size the image explicitly, keep later pages opaque, and verify paging with a real coordinate tap rather than a DOM-triggered click.

## Territory presentation boundary

Keep H3 authoritative but visually hidden; render organic paint from H3 ownership and live GPS paths instead of exposing the cell lattice.

**Why:** stable cell IDs are required for transactional ownership, takeovers, budgets, and anti-abuse checks, while visible hex grids make the product feel like a board game rather than a personal running experience.

**How to apply:** map and animation work may derive circles, ribbons, or merged display shapes from H3, but must not replace the persisted ownership model or submit display polygons as claim authority.

## Crowdsourced safety boundary

Safety reports must remain coarse, advisory, run-bound signals; never expose raw reporter trails or treat sparse data as evidence that an area is safe.

**Why:** location safety data can identify runners and can be poisoned by cheap anonymous identities unless privacy thresholds, provenance, and abuse barriers are enforced together.

**How to apply:** keep trusted contacts device-local, queue only coarse cells, verify report area/time against a plausible saved run, serialize quotas, and show “not enough data” below the established-run crowd threshold.

## Civic photo evidence boundary

Treat client-uploaded civic photos as temporary staging only; accepted reports must reference a server-sealed immutable copy, never an object covered by a client-visible write URL.

**Why:** validating a staging object is insufficient while its signed upload URL remains usable, because the client could replace the bytes after validation. Retained consumed grants can also starve draft cleanup unless staging cleanup advances monotonically.

**How to apply:** bound and decode the complete image, hash and copy it to a server-only object, enforce a hard sealed-draft expiry, delete staging after the upload URL expires, and keep consumed-staging cleanup in a separate marked queue from expired drafts.

## Hackathon compliance note

The user's own PRD warns project-creation timestamps should postdate the city battle start (29 Aug 2026 Bengaluru). User was told this on 25 Aug and proceeded — treat this as a practice build unless they say otherwise.
