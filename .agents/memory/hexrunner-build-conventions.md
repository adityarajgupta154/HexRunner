---
name: HexRunner build conventions
description: How the checklist-driven HexRunner Expo build maps onto the Replit scaffold — task flow, structure mapping, theme, pending backend choice
---

## Task flow

The user drives this build from `attached_assets/HexRunner_Task_Checklist_*.docx` (19 tasks, 8 phases, strict order with "✓ Done when" gates), companion to two PRD docx files in the same folder.

**Why:** it's a 30-hour iQOO Hackathon runbook; the user pastes one task verbatim per message and verifies each gate on their iQOO phone via Expo Go.

**How to apply:** treat a pasted task as the whole scope — execute exactly it, map it onto the existing structure below (not a literal fresh scaffold), and report against its "done when" line. Don't build ahead of the current task.

## Structure mapping (differs from checklist's literal text)

- expo-router routes in `app/(tabs)/` are thin `export { default } from ...` re-exports; real screen components live in `src/screens/` — this reconciles file-based routing with the checklist's `src/screens/` requirement.
- `src/services/`, `src/context/`, `src/models/` exist (gitkeep) for later tasks (hexEngine, locationTracker, fitnessModel, antiSpoof, AuthContext, RunContext, fitnessWeights.json).
- TypeScript, not the checklist's JavaScript — user accepted scaffold default; later checklist tasks naming `.js` files should be created as `.ts`/`.tsx` at the same paths.
- expo-router's `Tabs` wraps `@react-navigation/bottom-tabs`, satisfying the checklist's navigation-library requirement without installing anything.

## Theme

Dark-only by design (user preference: high-contrast dark, no faint labels): both `light` and `dark` keys in `constants/colors.ts` hold the same dark palette; teal `#2DE0B0` is the claimed-hex/brand color. Changing `constants/colors.ts` shape can break the cast in `hooks/useColors.ts` — keep both keys defined.

## Pending decision

Checklist Phase 5 prescribes Firebase (Firestore + anonymous auth). The monorepo's shared Express + Postgres api-server is a viable alternative. **Raise this choice with the user when Phase 5 starts; do not silently swap.**

## Expo package compatibility

For this Expo SDK 54 scaffold, Metro's live compatibility check expects `react-native-maps` 1.20.1. Older guidance naming 1.18.0 is stale for this project.

**Why:** installing 1.18.0 produced an explicit Expo compatibility warning; 1.20.1 removed it and Metro booted cleanly.

**How to apply:** keep maps at Expo's currently expected version and never add it to the app.json plugins array.

The Replit browser preview cannot bundle the package-level `react-native-maps` index when `Marker` is imported, because it pulls a native-only codegen module into the web graph.

**Why:** platform-checking only at render time is too late; Metro resolves all static imports before that check.

**How to apply:** keep a web fallback and either isolate map components in native platform files or import the platform-safe MapView entry directly. Recheck the web bundle whenever adding native map overlays.

Expo Location's web subscription cleanup can call a missing native emitter method, even though starting the watcher works.

**Why:** a Run session recorded successfully in the browser but crashed on Stop when the Expo subscription's remove method ran.

**How to apply:** keep browser previews on the browser geolocation fallback; use Expo Location's high-accuracy watcher on iOS/Android. Always test both watcher setup and cleanup.

## Firebase environment bridge

Expo does not inline arbitrary client-side `process.env` names; only its public-prefixed convention is automatic. HexRunner keeps the requested `FIREBASE_*` Replit Secret names and bridges them through dynamic Expo config.

**Why:** direct `process.env.FIREBASE_*` reads can be undefined in the phone bundle even when the workflow process has the secrets. Firebase client configuration is public once bundled, regardless of being stored as Replit Secrets.

**How to apply:** add/change Firebase values only through Replit Secrets, restart Expo afterward, and keep the config bridge aligned with the service. Missing config must yield a diagnosable null-auth state, not crash startup.

## Hackathon compliance note

The user's own PRD warns project-creation timestamps should postdate the city battle start (29 Aug 2026 Bengaluru). User was told this on 25 Aug and proceeded — treat this as a practice build unless they say otherwise.
