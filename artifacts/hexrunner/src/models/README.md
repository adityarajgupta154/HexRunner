# Fitness model

`fitnessWeights.json` is a small, offline classifier trained with NumPy by
`scripts/train_fitness_model.py`. It deterministically creates 500 balanced
synthetic examples (125 per tier) from normalized average pace, average
distance, recent-run frequency, and self-reported activity level. Labels come
from the disclosed weighted-score thresholds recorded in the JSON. It trains a
4-input → 8-ReLU → 4-softmax network with full-batch gradient descent for 2,000
epochs.

Install `scripts/requirements-model.txt`, then run
`python scripts/train_fitness_model.py`. The JSON records its seed, feature
normalization, labeling rule, architecture, training metrics, and learned
parameters. Re-running the script replaces the JSON deterministically. The
synthetic labels are a product heuristic, not a medical assessment. Inference
is performed locally and makes no network calls.