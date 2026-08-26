/**
 * Token-bucket rate limiter, one instance per category per connection.
 * Kept in memory: limits are per-connection abuse protection, not durable state.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    /** Maximum burst size. */
    readonly capacity: number,
    /** Tokens refilled per second. */
    readonly refillPerSecond: number,
    private nowMs: () => number,
  ) {
    this.tokens = capacity;
    this.lastRefill = nowMs();
  }

  private refill(): void {
    const now = this.nowMs();
    const elapsed = Math.max(0, now - this.lastRefill);
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + (elapsed / 1000) * this.refillPerSecond);
    this.lastRefill = now;
  }

  tryTake(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}
