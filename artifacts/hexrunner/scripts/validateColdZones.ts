import {
  getEquityZoneDisplayState,
  getSummaryCreditCopy,
  type EquityZoneStatusLike,
} from '../src/services/equityZoneDisplay';

function assertEqual(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`FAIL: ${message}. Expected ${expected}, got ${actual}`);
  }
}

function runValidations() {
  console.log('Running cold zones validation...');

  const activeCold: EquityZoneStatusLike = {
    availability: 'available',
    freshness: 'current',
    tier: 'cold',
    multiplier: 2,
    eligible: true,
  };

  assertEqual(
    getEquityZoneDisplayState(activeCold, false, false),
    'cold_zone_active',
    'active cold'
  );

  const staleCold: EquityZoneStatusLike = {
    ...activeCold,
    freshness: 'stale',
  };

  assertEqual(
    getEquityZoneDisplayState(staleCold, false, false),
    'stale_error',
    'stale cold status should not show 2x'
  );

  const unavailableCold: EquityZoneStatusLike = {
    ...activeCold,
    availability: 'unavailable',
  };

  assertEqual(
    getEquityZoneDisplayState(unavailableCold, false, false),
    'unavailable',
    'unavailable cold status should not show 2x'
  );

  const mismatchedTier: EquityZoneStatusLike = {
    ...activeCold,
    tier: 'medium',
  };

  assertEqual(
    getEquityZoneDisplayState(mismatchedTier, false, false),
    'standard',
    'mismatched tier should be standard'
  );

  // Copy checks
  const cappedCopy = getSummaryCreditCopy(10, 5, 100, 100);
  assertEqual(cappedCopy.warning, 'Daily bonus cap reached (100). Standard credits still apply.', 'capped copy');

  const zeroBonusCopy = getSummaryCreditCopy(0, 0, 10, 100);
  assertEqual(zeroBonusCopy.suggestion, 'Standard sector coverage confirmed. Explore cold zones for bonus multipliers.', 'zero bonus copy');

  console.log('Cold zones validation passed!');
}

runValidations();
