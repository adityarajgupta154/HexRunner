# HexRunner

A GPS territory-control fitness game (Expo React Native): runners claim hexagonal map cells by moving through the real world, defend them from other players, and climb a leaderboard. Built phone-first for the iQOO Hackathon 2026 (Open Innovation track).

## Run & Operate

- Mobile app runs via workflow `artifacts/hexrunner: expo` — test on a phone by scanning the QR code with Expo Go (Android)
- `pnpm --filter @workspace/hexrunner run typecheck` — typecheck the app
- `pnpm run typecheck` — full typecheck across all packages
- Shared API server (`artifacts/api-server`, port env-driven) persists completed runs to Replit PostgreSQL
- `pnpm --filter @workspace/db run push` — apply development schema changes
- Restart both the API and Expo workflows after changing the run persistence contract

## Replit data storage

- Anonymous device identity is stored locally with AsyncStorage; no external auth configuration is required
- Completed runs, ordered GPS points, and current H3 ownership are saved through `POST /api/runs`
- Mobile code must use the shared API client and must never connect directly to PostgreSQL
- Run IDs are client-generated idempotency keys so summary-screen retries cannot duplicate a run

## Where things live

- Routes: `artifacts/hexrunner/app/(tabs)/` — thin re-exports of screen components (expo-router file-based routing)
- Screens: `artifacts/hexrunner/src/screens/` (HomeScreen, RunScreen, LeaderboardScreen, ProfileScreen)
- Shared UI: `artifacts/hexrunner/src/components/`
- Runtime logic: `artifacts/hexrunner/src/services/` (location, H3, run persistence, fitness inference, anti-spoof checks)
- Local model: `artifacts/hexrunner/src/models/fitnessWeights.json` with training provenance in the adjacent README
- Theme tokens: `artifacts/hexrunner/constants/colors.ts` (dark-only palette, teal primary = claimed-hex color)

## Architecture decisions

- Build strictly follows the user's task checklist (`attached_assets/HexRunner_Task_Checklist_*.docx`, 19 tasks, 8 phases) — one task per user message, verify each "✓ Done when" gate, never skip ahead
- expo-router file-based routing; its `Tabs` navigator is backed by `@react-navigation/bottom-tabs` (fulfils the checklist's navigation requirement)
- TypeScript instead of the checklist's JavaScript (scaffold default; file paths otherwise match the checklist)
- Dark-only UI: both palette keys in `constants/colors.ts` hold the same dark palette; `userInterfaceStyle: "dark"` in app.json

## Product

- Code-complete flows: four-tab shell, live GPS/H3 maps, Start/Stop run tracking, crash-safe Replit persistence, territory lookup/takeover, leaderboard, profile/history, local fitness-tier target, advisory anti-spoofing, and polished summary states
- Team verification still required: native iQOO outdoor walk/map test, running the trainer in Colab for event evidence, and recording the backup demo video

## User preferences

- User pastes checklist tasks verbatim, one at a time — execute exactly that task, then report against its "✓ Done when" line
- High-contrast dark interfaces; no faint labels; obvious next actions

## Gotchas

- The user chose Replit Express + PostgreSQL instead of the checklist's external backend; keep all HexRunner persistence in Replit unless they explicitly change direction
- Expo SDK 54 currently expects `react-native-maps` 1.20.1; keep it aligned with Metro's compatibility check and do NOT add it to app.json plugins

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Product context: `attached_assets/HexRunner_PRD_*.docx` and `attached_assets/HexRunner_Replit_Build_PRD_*.docx`
