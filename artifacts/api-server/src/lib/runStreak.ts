function utcDayNumber(value: Date): number {
  return Math.floor(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()) /
      86_400_000,
  );
}

/** Counts consecutive UTC calendar days ending on the runner's latest run. */
export function calculateRunStreak(endedAtValues: readonly Date[]): number {
  const uniqueDays = [
    ...new Set(
      endedAtValues
        .filter((value) => Number.isFinite(value.getTime()))
        .map(utcDayNumber),
    ),
  ].sort((left, right) => right - left);

  if (uniqueDays.length === 0) return 0;
  const today = utcDayNumber(new Date());
  // Keep yesterday as a short grace window, but do not show a stale streak
  // to runners who have been inactive for multiple calendar days.
  if (uniqueDays[0] < today - 1) return 0;

  let streak = 1;
  let expectedPreviousDay = uniqueDays[0] - 1;
  for (const day of uniqueDays.slice(1)) {
    if (day !== expectedPreviousDay) break;
    streak += 1;
    expectedPreviousDay -= 1;
  }
  return streak;
}