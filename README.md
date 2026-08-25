# HexRunner

**Run. Claim your hex. Defend your ground.**

HexRunner is a phone-first GPS fitness game built for the iQOO Hackathon 2026. Walking or running through the real world claims resolution-9 H3 territory, and another runner can steal that territory by crossing the same hex.

## What makes it different

- **Fair daily targets:** a tiny 4→8→4 neural network predicts a beginner, casual, regular, or trained fitness tier from recent runs.
- **Fully local inference:** trained weights ship in `fitnessWeights.json`; matrix multiplication, ReLU, and softmax run on the phone with no AI API call.
- **Uniform territory:** Uber H3 cells make every claimed area comparable instead of rewarding only large route polygons.
- **Advisory anti-spoofing:** on-device checks flag sustained vehicle speed and impossible GPS jumps without blocking a legitimate run.

## Demo flow

1. Open the app in Expo Go and allow foreground location access.
2. Start a run, move through nearby H3 cells, and watch claimed cells turn teal.
3. Stop to see distance, duration, pace, new territory, stolen territory, anti-spoof status, and daily-target progress.
4. Open Home, Leaderboard, and Profile to see persisted ownership, live rankings, totals, and recent runs.

## Tech stack

- Expo + React Native + TypeScript
- `expo-location`, `react-native-maps`, and `h3-js`
- Express + TypeScript API
- Replit PostgreSQL + Drizzle ORM
- TanStack Query with generated OpenAPI clients
- AsyncStorage for anonymous device identity and crash-safe pending-run recovery

Firebase is intentionally not used. Mobile clients access data only through the shared Replit API.

## Run locally on Replit

```bash
pnpm install
pnpm --filter @workspace/db run push
```

Start the configured workflows:

- `artifacts/api-server: API Server`
- `artifacts/hexrunner: expo`

Scan the Expo QR code with Expo Go on Android. The app needs foreground location permission for the native map and run tracking.

## Validation

```bash
pnpm run typecheck:libs
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/hexrunner run typecheck
pnpm --filter @workspace/hexrunner run validate:models
```

The model trainer is Colab-ready:

```bash
python artifacts/hexrunner/scripts/train_fitness_model.py
```

Training uses a deterministic, disclosed 500-row synthetic dataset and exports the on-device weights. See `artifacts/hexrunner/src/models/README.md` for provenance and limitations.

## Demo safety

Before judging, record one full outdoor run on the iQOO phone as a backup: Start → claim/steal hexes → Stop → Summary → Leaderboard. This protects the demo if venue GPS or networking is unreliable.