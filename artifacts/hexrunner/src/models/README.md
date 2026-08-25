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
parameters. Learned values and metrics are exported to 12 decimal places so
equivalent floating-point arithmetic produces a byte-identical artifact across
Python and NumPy builds, including Google Colab. The synthetic labels are a
product heuristic, not a medical assessment. Inference is performed locally and
makes no network calls.

For retained Colab evidence, upload
`scripts/hexrunner_fitness_colab.ipynb`, this trainer, and the committed JSON.
Run all notebook cells, then download the executed notebook. Its output records
the sample count, epoch count, exported path, SHA-256 digest, and byte-for-byte
comparison with the committed model.