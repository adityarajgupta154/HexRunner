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

## Hackathon compliance note

The user's own PRD warns project-creation timestamps should postdate the city battle start (29 Aug 2026 Bengaluru). User was told this on 25 Aug and proceeded — treat this as a practice build unless they say otherwise.
