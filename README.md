# HexRunner

**Run. Claim your hex. Defend your ground.**

HexRunner is a phone-first GPS fitness game built for the iQOO Hackathon 2026. Walking or running through the real world claims resolution-9 H3 territory, and another runner can steal that territory by crossing the same hex.

## What makes it different

- **Fair daily targets:** a tiny 4→8→4 neural network predicts a beginner, casual, regular, or trained fitness tier from recent runs.
- **Fully local inference:** trained weights ship in `fitnessWeights.json`; matrix multiplication, ReLU, and softmax run on the phone with no AI API call.
- **Uniform territory:** Uber H3 cells make every claimed area comparable instead of rewarding only large route polygons.
- **Advisory anti-spoofing:** on-device checks flag sustained vehicle speed and impossible GPS jumps without blocking a legitimate run.

## Core experience

- **Live territory map:** foreground GPS centers a dark native map on the runner and renders nearby resolution-9 H3 cells.
- **Run tracking:** Start records timestamped GPS points, elapsed time, distance, pace, and unique cells crossed.
- **Territory takeovers:** unowned cells become new claims; cells owned by another runner transfer to the current runner when the completed run is saved.
- **Crash-safe saves:** a completed run is cached locally before upload. Retry remains available and Done stays disabled until the API confirms persistence.
- **Leaderboard and profile:** the top 20 runners, current-user highlighting, aggregate stats, AI tier, daily target, and recent runs all come from the shared API.
- **Friendly failure states:** loading, empty, offline, permission, retry, and advisory anti-spoof states are handled without discarding a completed run.

## On-device fitness AI

HexRunner does not call a hosted AI service for fitness classification.

The deterministic trainer in
`artifacts/hexrunner/scripts/train_fitness_model.py` creates a balanced
500-row synthetic dataset and trains a four-input, eight-hidden-unit,
four-output neural network. Its exported parameters are committed at:

`artifacts/hexrunner/src/models/fitnessWeights.json`

The mobile inference implementation in
`artifacts/hexrunner/src/services/fitnessModel.ts` imports
`fitnessWeights.json` and performs the complete forward pass locally with
plain TypeScript math:

1. Normalize average pace, average distance, recent-run frequency, and the
   self-reported activity level.
2. Multiply the four input features by the first weight matrix and add its
   bias.
3. Apply ReLU.
4. Multiply by the output matrix, add its bias, and apply softmax.
5. Select `beginner`, `casual`, `regular`, or `trained`.

The predicted tier sets a daily territory target:

| Tier | Daily target |
| --- | ---: |
| Beginner | 6 hexes |
| Casual | 10 hexes |
| Regular | 15 hexes |
| Trained | 20 hexes |

A runner without usable history defaults to **Casual / 10 hexes**. Inference
is private, offline, deterministic, and advisory rather than medical.

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

## Project layout

```text
artifacts/hexrunner/       Expo React Native mobile app
artifacts/api-server/      Express API and transactional run persistence
lib/api-spec/              OpenAPI contract and generated-client source
lib/db/                    Drizzle schema and PostgreSQL access
```

## Setup on Replit

### Prerequisites

- A Replit PostgreSQL database attached to the project
- The `SESSION_SECRET` Replit Secret for anonymous credential signing
- Expo Go installed on the Android/iQOO test phone
- Foreground location services enabled on the phone

Do not paste `SESSION_SECRET` into source files or chat. Store it with Replit
Secrets.

### Install and prepare the database

```bash
pnpm install
pnpm --filter @workspace/db run push
```

### Start the app

Start these existing Replit workflows:

- `artifacts/api-server: API Server`
- `artifacts/hexrunner: expo`

The Expo workflow injects the development API domain, starts Metro, and prints
an Expo QR code. Scan that QR code with Expo Go on Android. Grant foreground
location permission when prompted.

The browser preview is useful for navigation and save-flow checks, but native
maps and real GPS territory capture must be tested in Expo Go on a phone.

### First-run check

1. Open Home and confirm **LIVE GPS**, the current-location dot, and nearby H3
   outlines appear.
2. Open Run and tap **Start Run**.
3. Walk through at least one cell, then tap **Stop Run**.
4. Wait for **Saved to Replit** on Summary before tapping Done.
5. Confirm the run appears in Profile and the runner appears in Leaderboard.

## Validation

```bash
pnpm run typecheck:libs
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/hexrunner run typecheck
pnpm --filter @workspace/hexrunner run validate:models
pnpm run validate:run-saving
```

`validate:run-saving` exercises real anonymous credential enrollment and the
development PostgreSQL transaction, removes its own rows, and also checks the
mobile pending-run success, failure/retry, disabled-Done, and startup-recovery
paths.

The model trainer is Colab-ready:

```bash
python artifacts/hexrunner/scripts/train_fitness_model.py
```

Training uses a deterministic, disclosed 500-row synthetic dataset and exports the on-device weights. See `artifacts/hexrunner/src/models/README.md` for provenance and limitations.
For judge-ready Colab output and artifact comparison, use
`artifacts/hexrunner/scripts/hexrunner_fitness_colab.ipynb`.

## Record the judge-ready run

Use the iQOO phone's built-in screen recorder and capture one continuous,
unedited take:

1. Enable Do Not Disturb and hide notification previews.
2. Start screen recording before opening HexRunner.
3. Open Home and briefly show the live location and hex grid.
4. Open Run and tap **Start Run**.
5. Walk or jog a short safe loop through multiple cells.
6. If prepared in advance, cross one cell owned by another test runner to show
   a takeover.
7. Tap **Stop Run** and wait for **Saved to Replit**.
8. Hold on Summary long enough to show distance, duration, pace, new claims,
   stolen claims, and daily-target progress.
9. Open Leaderboard and show the updated ranking.
10. Open Profile and show the recent run.
11. End the recording only after all updated data is readable.

Replay the full take before retaining it. Confirm labels are legible, the save
succeeded, and no notification or account detail exposes private information.
Keep the video in the team's private submission folder rather than committing a
personal device recording to this repository.

See `artifacts/hexrunner/docs/JUDGE_EVIDENCE.md` for the complete AI, demo, and
event-rules evidence checklist.