"""Train and export HexRunner's tiny NumPy fitness classifier.

The disclosed synthetic label rule is a product heuristic, not a medical or
professional fitness assessment.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

SEED = 0x484558
ROWS_PER_CLASS = 125
EPOCHS = 2_000
LEARNING_RATE = 0.15

TIERS = ["beginner", "casual", "regular", "trained"]
ARCHITECTURE = [4, 8, 4]

PACE_MIN_MIN_PER_KM = 3.0
PACE_MAX_MIN_PER_KM = 12.0
MAX_AVG_DISTANCE_KM = 15.0
MAX_RECENT_RUNS = 5
MAX_ACTIVITY_LEVEL = 3

# Features are [pace score, distance, frequency, activity], all in [0, 1].
# A higher pace score means a faster (lower minutes/km) average pace.
LABEL_WEIGHTS = np.array([0.35, 0.30, 0.20, 0.15], dtype=np.float64)
LABEL_THRESHOLDS = np.array([0.27, 0.48, 0.69], dtype=np.float64)


def normalize_features(
    avg_pace_min_per_km: np.ndarray,
    avg_distance_km: np.ndarray,
    recent_run_count: np.ndarray,
    activity_level: np.ndarray,
) -> np.ndarray:
    """Normalize the four raw inputs to the exact features used on-device."""
    pace_score = np.clip(
        (PACE_MAX_MIN_PER_KM - avg_pace_min_per_km)
        / (PACE_MAX_MIN_PER_KM - PACE_MIN_MIN_PER_KM),
        0.0,
        1.0,
    )
    distance_score = np.clip(avg_distance_km / MAX_AVG_DISTANCE_KM, 0.0, 1.0)
    frequency_score = np.clip(recent_run_count / MAX_RECENT_RUNS, 0.0, 1.0)
    activity_score = np.clip(activity_level / MAX_ACTIVITY_LEVEL, 0.0, 1.0)
    return np.column_stack(
        [pace_score, distance_score, frequency_score, activity_score]
    )


def label_features(features: np.ndarray) -> np.ndarray:
    """Apply the disclosed weighted-score thresholds to normalized rows."""
    fitness_score = features @ LABEL_WEIGHTS
    return np.digitize(fitness_score, LABEL_THRESHOLDS).astype(np.int64)


def make_dataset(rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """Generate 500 balanced rows labeled by the explicit score rule."""
    buckets: list[list[np.ndarray]] = [[] for _ in TIERS]

    while any(len(bucket) < ROWS_PER_CLASS for bucket in buckets):
        batch_size = 1_024
        avg_pace = rng.uniform(
            PACE_MIN_MIN_PER_KM, PACE_MAX_MIN_PER_KM, batch_size
        )
        avg_distance = rng.uniform(0.5, MAX_AVG_DISTANCE_KM, batch_size)
        run_count = rng.integers(1, MAX_RECENT_RUNS + 1, batch_size)
        activity_level = rng.integers(0, MAX_ACTIVITY_LEVEL + 1, batch_size)

        features = normalize_features(
            avg_pace, avg_distance, run_count, activity_level
        )
        labels = label_features(features)

        for row, label in zip(features, labels, strict=True):
            bucket = buckets[int(label)]
            if len(bucket) < ROWS_PER_CLASS:
                bucket.append(row)

    dataset = [
        (row, label)
        for label, bucket in enumerate(buckets)
        for row in bucket
    ]
    rng.shuffle(dataset)
    features = np.vstack([row for row, _ in dataset])
    labels = np.array([label for _, label in dataset], dtype=np.int64)
    return features, labels


def softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - logits.max(axis=1, keepdims=True)
    exponentials = np.exp(shifted)
    return exponentials / exponentials.sum(axis=1, keepdims=True)


def train(
    features: np.ndarray,
    labels: np.ndarray,
    epochs: int,
    learning_rate: float,
    rng: np.random.Generator,
) -> tuple[dict[str, np.ndarray], dict[str, float]]:
    """Train a 4→8 ReLU→4 softmax network with full-batch gradient descent."""
    row_count = features.shape[0]
    targets = np.eye(ARCHITECTURE[-1], dtype=np.float64)[labels]

    weights = {
        "W1": rng.normal(
            0.0, np.sqrt(2.0 / ARCHITECTURE[0]), (ARCHITECTURE[0], ARCHITECTURE[1])
        ),
        "b1": np.zeros(ARCHITECTURE[1], dtype=np.float64),
        "W2": rng.normal(
            0.0, np.sqrt(2.0 / ARCHITECTURE[1]), (ARCHITECTURE[1], ARCHITECTURE[2])
        ),
        "b2": np.zeros(ARCHITECTURE[2], dtype=np.float64),
    }

    for epoch in range(epochs):
        hidden_raw = features @ weights["W1"] + weights["b1"]
        hidden = np.maximum(hidden_raw, 0.0)
        probabilities = softmax(hidden @ weights["W2"] + weights["b2"])

        output_gradient = (probabilities - targets) / row_count
        d_w2 = hidden.T @ output_gradient
        d_b2 = output_gradient.sum(axis=0)
        hidden_gradient = (output_gradient @ weights["W2"].T) * (hidden_raw > 0.0)
        d_w1 = features.T @ hidden_gradient
        d_b1 = hidden_gradient.sum(axis=0)

        weights["W1"] -= learning_rate * d_w1
        weights["b1"] -= learning_rate * d_b1
        weights["W2"] -= learning_rate * d_w2
        weights["b2"] -= learning_rate * d_b2

        if epoch == 0 or (epoch + 1) % 250 == 0:
            loss = -np.mean(np.log(probabilities[np.arange(row_count), labels] + 1e-12))
            accuracy = np.mean(probabilities.argmax(axis=1) == labels)
            print(
                f"epoch {epoch + 1:4d}/{epochs}: "
                f"loss={loss:.4f}, accuracy={accuracy:.1%}"
            )

    hidden = np.maximum(features @ weights["W1"] + weights["b1"], 0.0)
    probabilities = softmax(hidden @ weights["W2"] + weights["b2"])
    metrics = {
        "trainingAccuracy": float(np.mean(probabilities.argmax(axis=1) == labels)),
        "crossEntropy": float(
            -np.mean(np.log(probabilities[np.arange(row_count), labels] + 1e-12))
        ),
    }
    return weights, metrics


def export_weights(
    destination: Path,
    weights: dict[str, np.ndarray],
    metrics: dict[str, float],
    row_count: int,
    epochs: int,
    learning_rate: float,
) -> None:
    payload = {
        "formatVersion": 2,
        "architecture": ARCHITECTURE,
        "tiers": TIERS,
        "features": [
            "normalizedAvgPace",
            "normalizedAvgDistance",
            "normalizedRunFrequency",
            "normalizedActivityLevel",
        ],
        "normalization": {
            "avgPaceMinPerKm": {
                "minimum": PACE_MIN_MIN_PER_KM,
                "maximum": PACE_MAX_MIN_PER_KM,
                "formula": "clip((maximum - pace) / (maximum - minimum), 0, 1)",
            },
            "avgDistanceKm": {"divisor": MAX_AVG_DISTANCE_KM},
            "recentRunCount": {"divisor": MAX_RECENT_RUNS},
            "activityLevelIndex": {"divisor": MAX_ACTIVITY_LEVEL},
        },
        "labelRule": {
            "scoreWeights": LABEL_WEIGHTS.tolist(),
            "thresholds": LABEL_THRESHOLDS.tolist(),
            "classes": TIERS,
        },
        "provenance": {
            "dataset": "synthetic-balanced-rule-v2",
            "rows": row_count,
            "rowsPerClass": ROWS_PER_CLASS,
            "seed": SEED,
            "epochs": epochs,
            "learningRate": learning_rate,
            "optimizer": "full-batch-gradient-descent",
            "trainer": "scripts/train_fitness_model.py",
        },
        "metrics": metrics,
        **{name: value.tolist() for name, value in weights.items()},
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {destination}")


def parse_args() -> argparse.Namespace:
    default_output = (
        Path(__file__).resolve().parents[1] / "src/models/fitnessWeights.json"
    )
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--epochs", type=int, default=EPOCHS)
    parser.add_argument("--learning-rate", type=float, default=LEARNING_RATE)
    parser.add_argument("--output", type=Path, default=default_output)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.epochs <= 0:
        raise ValueError("--epochs must be positive")
    if args.learning_rate <= 0:
        raise ValueError("--learning-rate must be positive")

    dataset_rng = np.random.default_rng(SEED)
    training_rng = np.random.default_rng(SEED ^ 0xA11CE)
    features, labels = make_dataset(dataset_rng)
    weights, metrics = train(
        features, labels, args.epochs, args.learning_rate, training_rng
    )
    export_weights(
        args.output,
        weights,
        metrics,
        len(features),
        args.epochs,
        args.learning_rate,
    )
    print(
        f"Final training accuracy: {metrics['trainingAccuracy']:.1%}; "
        f"cross-entropy: {metrics['crossEntropy']:.4f}"
    )


if __name__ == "__main__":
    main()