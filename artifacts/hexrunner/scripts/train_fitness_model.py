"""Train HexRunner's tiny on-device fitness classifier.

This file intentionally uses only Python's standard library, so it can be
uploaded to and run directly in Google Colab without installing packages.
"""

import json
import math
from pathlib import Path

SEED = 0x484558
ROWS_PER_TIER = 125
EPOCHS = 2000
LEARNING_RATE = 0.8


class Lcg:
    """Small cross-language deterministic pseudo-random number generator."""

    def __init__(self, seed):
        self.state = seed & 0xFFFFFFFF

    def random(self):
        self.state = (1664525 * self.state + 1013904223) & 0xFFFFFFFF
        return self.state / 4294967296

    def centered(self):
        return self.random() * 2.0 - 1.0


def clamp(value, lower, upper):
    return max(lower, min(upper, value))


def make_dataset():
    """Return 500 disclosed synthetic rows: 125 for each fitness tier."""
    rng = Lcg(SEED)
    # distance km, duration minutes, speed km/h, reported-level index
    centers = [
        (1.6, 22.0, 4.8, 0.0),
        (3.5, 34.0, 6.3, 1.0),
        (6.2, 46.0, 8.6, 2.0),
        (10.2, 63.0, 11.8, 3.0),
    ]
    rows = []
    for label, (distance, duration, speed, level) in enumerate(centers):
        for _ in range(ROWS_PER_TIER):
            # The ranges deliberately overlap: run history and self-report both
            # contribute, rather than any one feature acting as the label.
            raw = [
                clamp(distance + rng.centered() * 1.5, 0.1, 15.0),
                clamp(duration + rng.centered() * 13.0, 3.0, 120.0),
                clamp(speed + rng.centered() * 2.0, 1.0, 16.0),
                clamp(level + rng.centered() * 0.55, 0.0, 3.0),
            ]
            rows.append((
                [raw[0] / 15.0, raw[1] / 120.0, raw[2] / 16.0, raw[3] / 3.0],
                label,
            ))
    return rows


def softmax(values):
    peak = max(values)
    exponents = [math.exp(value - peak) for value in values]
    total = sum(exponents)
    return [value / total for value in exponents]


def train():
    rows = make_dataset()
    rng = Lcg(SEED ^ 0xA11CE)
    w1 = [[rng.centered() * 0.5 for _ in range(8)] for _ in range(4)]
    b1 = [0.0] * 8
    w2 = [[rng.centered() * 0.5 for _ in range(4)] for _ in range(8)]
    b2 = [0.0] * 4

    for _ in range(EPOCHS):
        dw1 = [[0.0] * 8 for _ in range(4)]
        db1 = [0.0] * 8
        dw2 = [[0.0] * 4 for _ in range(8)]
        db2 = [0.0] * 4

        for inputs, label in rows:
            hidden_raw = [
                b1[h] + sum(inputs[i] * w1[i][h] for i in range(4))
                for h in range(8)
            ]
            hidden = [max(0.0, value) for value in hidden_raw]
            logits = [
                b2[o] + sum(hidden[h] * w2[h][o] for h in range(8))
                for o in range(4)
            ]
            probabilities = softmax(logits)
            output_gradient = [
                probabilities[o] - (1.0 if o == label else 0.0)
                for o in range(4)
            ]

            for h in range(8):
                for o in range(4):
                    dw2[h][o] += hidden[h] * output_gradient[o]
            for o in range(4):
                db2[o] += output_gradient[o]
            for h in range(8):
                hidden_gradient = sum(
                    w2[h][o] * output_gradient[o] for o in range(4)
                )
                if hidden_raw[h] <= 0.0:
                    hidden_gradient = 0.0
                db1[h] += hidden_gradient
                for i in range(4):
                    dw1[i][h] += inputs[i] * hidden_gradient

        step = LEARNING_RATE / len(rows)
        for i in range(4):
            for h in range(8):
                w1[i][h] -= step * dw1[i][h]
        for h in range(8):
            b1[h] -= step * db1[h]
            for o in range(4):
                w2[h][o] -= step * dw2[h][o]
        for o in range(4):
            b2[o] -= step * db2[o]

    return {
        "formatVersion": 1,
        "architecture": [4, 8, 4],
        "tiers": ["beginner", "casual", "regular", "trained"],
        "normalization": {
            "distanceKm": 15,
            "durationMinutes": 120,
            "speedKmh": 16,
            "reportedLevelIndex": 3,
        },
        "provenance": {
            "dataset": "synthetic-v1",
            "rows": len(rows),
            "seed": SEED,
            "epochs": EPOCHS,
            "learningRate": LEARNING_RATE,
            "trainer": "scripts/train_fitness_model.py",
        },
        "W1": w1,
        "b1": b1,
        "W2": w2,
        "b2": b2,
    }


if __name__ == "__main__":
    destination = Path(__file__).resolve().parents[1] / "src/models/fitnessWeights.json"
    destination.write_text(json.dumps(train(), indent=2) + "\n", encoding="utf-8")
    print("Wrote", destination)