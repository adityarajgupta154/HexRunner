import rawWeights from '../models/fitnessWeights.json';

export const FITNESS_TIERS = [
  'beginner',
  'casual',
  'regular',
  'trained',
] as const;

export type FitnessTier = (typeof FITNESS_TIERS)[number];

export const FITNESS_BUDGETS: Readonly<Record<FitnessTier, number>> = {
  beginner: 6,
  casual: 10,
  regular: 15,
  trained: 20,
};

export function hexBudgetForTier(tier: FitnessTier): number {
  return FITNESS_BUDGETS[tier];
}

export type RecentRun = {
  distanceKm: number;
  averagePaceMinPerKm?: number | null;
  elapsedSeconds?: number;
  durationSeconds?: number;
  endedAt?: string | number | Date;
};

type FitnessWeights = {
  W1: number[][];
  b1: number[];
  W2: number[][];
  b2: number[];
};

const INPUT_SIZE = 4;
const HIDDEN_SIZE = 8;
const OUTPUT_SIZE = 4;
const MAX_RECENT_RUNS = 5;

function assertVector(
  value: unknown,
  length: number,
  name: string,
): asserts value is number[] {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    value.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))
  ) {
    throw new Error(
      `Invalid fitness model weights: ${name} must contain ${length} finite numbers.`,
    );
  }
}

function assertMatrix(
  value: unknown,
  rows: number,
  columns: number,
  name: string,
): asserts value is number[][] {
  if (!Array.isArray(value) || value.length !== rows) {
    throw new Error(
      `Invalid fitness model weights: ${name} must have shape ${rows}x${columns}.`,
    );
  }
  value.forEach((row, index) =>
    assertVector(row, columns, `${name}[${index}]`),
  );
}

export function validateFitnessWeights(value: unknown): FitnessWeights {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid fitness model weights: expected an object.');
  }
  const candidate = value as Partial<FitnessWeights>;
  assertMatrix(candidate.W1, INPUT_SIZE, HIDDEN_SIZE, 'W1');
  assertVector(candidate.b1, HIDDEN_SIZE, 'b1');
  assertMatrix(candidate.W2, HIDDEN_SIZE, OUTPUT_SIZE, 'W2');
  assertVector(candidate.b2, OUTPUT_SIZE, 'b2');
  return {
    W1: candidate.W1,
    b1: candidate.b1,
    W2: candidate.W2,
    b2: candidate.b2,
  };
}

const weights = validateFitnessWeights(rawWeights);

function clamp(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(upper, value));
}

export function matrixMultiply(
  vector: readonly number[],
  matrix: readonly (readonly number[])[],
): number[] {
  if (matrix.length !== vector.length || matrix.length === 0) {
    throw new Error('Matrix multiply shape mismatch.');
  }
  const columns = matrix[0]?.length ?? 0;
  if (
    columns === 0 ||
    vector.some((value) => !Number.isFinite(value)) ||
    matrix.some(
      (row) =>
        row.length !== columns || row.some((value) => !Number.isFinite(value)),
    )
  ) {
    throw new Error('Matrix multiply requires a rectangular finite matrix.');
  }
  return Array.from({ length: columns }, (_, column) =>
    vector.reduce((sum, value, row) => sum + value * matrix[row][column], 0),
  );
}

export function relu(values: readonly number[]): number[] {
  return values.map((value) => Math.max(0, value));
}

export function softmax(values: readonly number[]): number[] {
  if (
    values.length === 0 ||
    values.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('Softmax requires at least one finite value.');
  }
  const maximum = Math.max(...values);
  const exponentials = values.map((value) => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map((value) => value / total);
}

function addBias(values: readonly number[], bias: readonly number[]): number[] {
  if (values.length !== bias.length) {
    throw new Error('Fitness model bias shape mismatch.');
  }
  return values.map((value, index) => value + bias[index]);
}

function levelIndex(level: FitnessTier | undefined): number {
  const index = level ? FITNESS_TIERS.indexOf(level) : -1;
  return index < 0 ? 1 : index;
}

function endedAtMilliseconds(value: RecentRun['endedAt']): number | null {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  return null;
}

/**
 * Computes [pace score, distance, recent-run frequency, reported activity],
 * each normalized to 0–1. A higher pace score means a faster average pace.
 * Invalid runs are ignored. Dated runs are sorted newest-first; otherwise input
 * order is treated as newest-first. At most five valid runs contribute.
 */
export function computeFitnessFeatures(
  recentRuns: readonly RecentRun[],
  selfReportedLevel: FitnessTier = 'casual',
): number[] {
  const validRuns = recentRuns
    .map((run, index) => {
      const durationSeconds = run.elapsedSeconds ?? run.durationSeconds;
      const calculatedPace =
        run.distanceKm > 0 && Number.isFinite(durationSeconds)
          ? (durationSeconds ?? 0) / 60 / run.distanceKm
          : Number.NaN;
      return {
        distanceKm: run.distanceKm,
        durationSeconds,
        averagePaceMinPerKm:
          run.averagePaceMinPerKm ?? calculatedPace,
        timestamp: endedAtMilliseconds(run.endedAt),
        index,
      };
    })
    .filter(
      (run) =>
        Number.isFinite(run.distanceKm) &&
        run.distanceKm >= 0 &&
        Number.isFinite(run.averagePaceMinPerKm) &&
        run.averagePaceMinPerKm > 0,
    )
    .sort((left, right) => {
      if (left.timestamp === null && right.timestamp === null) {
        return left.index - right.index;
      }
      if (left.timestamp === null) return 1;
      if (right.timestamp === null) return -1;
      return right.timestamp - left.timestamp;
    })
    .slice(0, MAX_RECENT_RUNS);

  if (validRuns.length === 0) {
    return [0, 0, 0, levelIndex(selfReportedLevel) / 3];
  }

  const totalDistanceKm = validRuns.reduce(
    (sum, run) => sum + run.distanceKm,
    0,
  );
  const averagePaceMinPerKm =
    validRuns.reduce(
      (sum, run) => sum + run.averagePaceMinPerKm,
      0,
    ) / validRuns.length;
  const averageDistanceKm = totalDistanceKm / validRuns.length;
  const recentRunFrequency = validRuns.length / MAX_RECENT_RUNS;

  return [
    clamp((12 - averagePaceMinPerKm) / 9, 0, 1),
    clamp(averageDistanceKm / 15, 0, 1),
    clamp(recentRunFrequency, 0, 1),
    levelIndex(selfReportedLevel) / 3,
  ];
}

export function predictTier(features: readonly number[]): {
  tier: FitnessTier;
  probabilities: Readonly<Record<FitnessTier, number>>;
  budget: number;
} {
  if (
    features.length !== INPUT_SIZE ||
    features.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('Fitness prediction requires exactly 4 finite features.');
  }
  const hidden = relu(addBias(matrixMultiply(features, weights.W1), weights.b1));
  const probabilities = softmax(
    addBias(matrixMultiply(hidden, weights.W2), weights.b2),
  );
  const tierIndex = probabilities.reduce(
    (best, probability, index) =>
      probability > probabilities[best] ? index : best,
    0,
  );
  const tier = FITNESS_TIERS[tierIndex];
  return {
    tier,
    probabilities: {
      beginner: probabilities[0],
      casual: probabilities[1],
      regular: probabilities[2],
      trained: probabilities[3],
    },
    budget: hexBudgetForTier(tier),
  };
}

export function predictFitnessProfile(
  recentRuns: readonly RecentRun[],
  selfReportedLevel: FitnessTier = 'casual',
): ReturnType<typeof predictTier> {
  // Product requirement: users without usable run history begin at casual,
  // regardless of an incomplete or optimistic onboarding answer.
  const features = computeFitnessFeatures(recentRuns, selfReportedLevel);
  if (features[0] === 0 && features[1] === 0 && features[2] === 0) {
    return {
      tier: 'casual',
      probabilities: { beginner: 0, casual: 1, regular: 0, trained: 0 },
      budget: hexBudgetForTier('casual'),
    };
  }
  return predictTier(features);
}