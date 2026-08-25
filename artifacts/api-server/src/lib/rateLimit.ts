type Bucket = { count: number; resetsAt: number };

const buckets = new Map<string, Bucket>();

export function consumeRateLimit(
  namespace: string,
  identity: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const key = `${namespace}:${identity}`;
  const current = buckets.get(key);
  if (!current || current.resetsAt <= now) {
    buckets.set(key, { count: 1, resetsAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;

  if (buckets.size > 10_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetsAt <= now) buckets.delete(bucketKey);
    }
  }
  return true;
}