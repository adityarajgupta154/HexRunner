# HexRunner

A GPS territory-control fitness game (Expo React Native): runners claim hexagonal map cells by moving through the real world, defend them from other players, and climb a leaderboard. Built phone-first for the iQOO Hackathon 2026 (Open Innovation track).

## Run & Operate

- Mobile app runs via workflow `artifacts/hexrunner: expo` — test on a phone by scanning the QR code with Expo Go (Android)
- `pnpm --filter @workspace/hexrunner run typecheck` — typecheck the app
- `pnpm run typecheck` — full typecheck across all packages
- Shared API server (`artifacts/api-server`, port env-driven) exists but is not used yet
- Firebase client config is read from Replit Secrets by `app.config.js`; restart the Expo workflow after adding or changing Firebase values

## Firebase configuration

Required Replit Secrets:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

Optional: `FIREBASE_MEASUREMENT_ID`

Anonymous Authentication must also be enabled for the Firebase project. Until configuration exists, AuthContext intentionally exposes `uid: null` and a configuration error while allowing the app to keep running.

## Where things live

- Routes: `artifacts/hexrunner/app/(tabs)/` — thin re-exports of screen components (expo-router file-based routing)
- Screens: `artifacts/hexrunner/src/screens/` (HomeScreen, RunScreen, LeaderboardScreen, ProfileScreen)
- Shared UI: `artifacts/hexrunner/src/components/`
- Reserved for upcoming checklist phases: `artifacts/hexrunner/src/services/`, `src/context/`, `src/models/`
- Theme tokens: `artifacts/hexrunner/constants/colors.ts` (dark-only palette, teal primary = claimed-hex color)

## Architecture decisions

- Build strictly follows the user's task checklist (`attached_assets/HexRunner_Task_Checklist_*.docx`, 19 tasks, 8 phases) — one task per user message, verify each "✓ Done when" gate, never skip ahead
- expo-router file-based routing; its `Tabs` navigator is backed by `@react-navigation/bottom-tabs` (fulfils the checklist's navigation requirement)
- TypeScript instead of the checklist's JavaScript (scaffold default; file paths otherwise match the checklist)
- Dark-only UI: both palette keys in `constants/colors.ts` hold the same dark palette; `userInterfaceStyle: "dark"` in app.json

## Product

- Phase 1 complete: 4-tab shell (Home, Run, Leaderboard, Profile) with branded placeholder screens and custom app icon

## User preferences

- User pastes checklist tasks verbatim, one at a time — execute exactly that task, then report against its "✓ Done when" line
- High-contrast dark interfaces; no faint labels; obvious next actions

## Gotchas

- Checklist Phase 5 prescribes Firebase; the monorepo also offers the shared Express + Postgres backend — surface this choice to the user when Phase 5 starts, don't silently pick
- Expo SDK 54 currently expects `react-native-maps` 1.20.1; keep it aligned with Metro's compatibility check and do NOT add it to app.json plugins

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Product context: `attached_assets/HexRunner_PRD_*.docx` and `attached_assets/HexRunner_Replit_Build_PRD_*.docx`
