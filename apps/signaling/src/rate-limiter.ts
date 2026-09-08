/** Simple per-key token bucket, used to rate-limit session creation and message volume by IP/connection. */
export class TokenBucketRateLimiter {
  private readonly buckets = new Map<string, { tokens: number; lastRefill: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number,
  ) {}

  allow(key: string, now = Date.now(), cost = 1): boolean {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    }
    const elapsed = Math.max(0, now - bucket.lastRefill);
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerMs);
    bucket.lastRefill = now;
    if (bucket.tokens < cost) return false;
    bucket.tokens -= cost;
    return true;
  }

  /** Drops buckets untouched for longer than `maxIdleMs`, to bound memory usage. */
  sweep(maxIdleMs: number, now = Date.now()): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > maxIdleMs) this.buckets.delete(key);
    }
  }
}
