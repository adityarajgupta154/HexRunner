# Fitness model

`fitnessWeights.json` is a small, offline classifier trained by
`scripts/train_fitness_model.py`. The script is standard-library Python and can
run as-is in Google Colab. It deterministically creates 500 synthetic examples
(125 per tier), using disclosed tier centers and bounded uniform variation for
distance, duration, speed, and self-reported level. It then trains a
4-input → 8-ReLU → 4-softmax network with full-batch gradient descent for 2,000
epochs.

The JSON records its seed, normalization constants, architecture, training
parameters, and real learned parameters. Re-running the script replaces the
JSON deterministically. The synthetic labels are a product heuristic, not a
medical assessment. Inference is performed locally and makes no network calls.