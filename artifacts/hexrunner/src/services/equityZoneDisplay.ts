export type EquityZoneStatusLike = {
  availability: 'available' | 'insufficient_data' | 'unavailable';
  freshness: 'current' | 'stale' | 'unavailable';
  tier: 'cold' | 'medium' | 'hot' | null;
  multiplier: 1 | 2;
  eligible: boolean;
};

export type EquityZoneDisplayState = 
  | 'checking'
  | 'cold_zone_active'
  | 'standard'
  | 'insufficient_data'
  | 'unavailable'
  | 'stale_error';

export function getEquityZoneDisplayState(
  status: EquityZoneStatusLike | undefined | null,
  isFetching: boolean,
  isError: boolean
): EquityZoneDisplayState {
  if (isError) return 'stale_error';
  if (!status) return isFetching ? 'checking' : 'unavailable';
  
  if (status.availability === 'unavailable') return 'unavailable';
  if (status.availability === 'insufficient_data') return 'insufficient_data';
  if (status.freshness === 'stale' || status.freshness === 'unavailable') return 'stale_error';

  if (
    status.availability === 'available' &&
    status.freshness === 'current' &&
    status.tier === 'cold' &&
    status.multiplier === 2 &&
    status.eligible
  ) {
    return 'cold_zone_active';
  }

  return 'standard';
}

export function getSummaryCreditCopy(
  bonusCredit: number,
  coldZoneHexes: number,
  dailyBonusCredit: number,
  dailyBonusCap: number
): { warning: string | null; suggestion: string | null } {
  if (dailyBonusCredit >= dailyBonusCap && dailyBonusCap > 0) {
    return {
      warning: `Daily bonus cap reached (${dailyBonusCap}). Standard credits still apply.`,
      suggestion: null,
    };
  }
  
  if (bonusCredit === 0) {
    return {
      warning: null,
      suggestion: 'Standard sector coverage confirmed. Explore cold zones for bonus multipliers.',
    };
  }

  return { warning: null, suggestion: null };
}
