import { checkForSpoofing, type LocationPoint } from '../src/services/antiSpoof';
import {
  predictFitnessProfile,
  type FitnessTier,
  type RecentRun,
} from '../src/services/fitnessModel';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const profiles: Array<{
  expected: FitnessTier;
  level: FitnessTier;
  run: RecentRun;
}> = [
  {
    expected: 'beginner',
    level: 'beginner',
    run: { distanceKm: 1.5, elapsedSeconds: 20 * 60 },
  },
  {
    expected: 'casual',
    level: 'casual',
    run: { distanceKm: 3.5, elapsedSeconds: 34 * 60 },
  },
  {
    expected: 'regular',
    level: 'regular',
    run: { distanceKm: 6.2, elapsedSeconds: 46 * 60 },
  },
  {
    expected: 'trained',
    level: 'trained',
    run: { distanceKm: 10.2, elapsedSeconds: 63 * 60 },
  },
];

for (const profile of profiles) {
  const prediction = predictFitnessProfile([profile.run], profile.level);
  assert(
    prediction.tier === profile.expected,
    `Expected ${profile.expected}, received ${prediction.tier}.`,
  );
  console.log(`${profile.expected}: ${prediction.tier} (${prediction.budget})`);
}

assert(
  predictFitnessProfile([], 'trained').tier === 'casual',
  'A brand-new user must default to casual.',
);

function pathAtSpeed(speedKmh: number, seconds: number): LocationPoint[] {
  const latitude = 51.5;
  const kmPerLongitudeDegree = 111.32 * Math.cos((latitude * Math.PI) / 180);
  return Array.from({ length: seconds / 10 + 1 }, (_, index) => ({
    lat: latitude,
    lng: -0.12 + ((speedKmh * (index * 10)) / 3_600) / kmPerLongitudeDegree,
    timestamp: index * 10_000,
  }));
}

const walking = checkForSpoofing(pathAtSpeed(5, 60));
assert(!walking.suspicious, `Walking path flagged: ${walking.reason}`);

const vehicle = checkForSpoofing(pathAtSpeed(35, 60));
assert(vehicle.suspicious, 'Vehicle-speed path was not flagged.');

const teleport = checkForSpoofing([
  { lat: 51.5, lng: -0.12, timestamp: 0 },
  { lat: 51.55, lng: -0.02, timestamp: 5_000 },
]);
assert(teleport.suspicious, 'Teleport path was not flagged.');

const noisyTimestamps = checkForSpoofing([
  { lat: 51.5, lng: -0.12, timestamp: 10_000 },
  { lat: 51.500001, lng: -0.120001, timestamp: 10_000 },
  { lat: 51.500002, lng: -0.120002, timestamp: 9_000 },
]);
assert(
  !noisyTimestamps.suspicious,
  'Tiny noise or non-positive intervals were incorrectly flagged.',
);

console.log('Anti-spoof validation: walking passed; vehicle and teleport flagged.');