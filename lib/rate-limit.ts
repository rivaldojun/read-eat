/**
 * Minimal in-process rate limiter used to stay polite with external APIs
 * (Reddit, Gemini, Stripe). Enforces both a sliding-window cap and an optional
 * minimum interval between successive calls.
 *
 * Note: this is per-process (fine for the single-user MVP / a single cron
 * worker). When the radar moves to a dedicated worker, swap for a shared limiter
 * (e.g. Redis token bucket) without touching call sites.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RateLimiter {
  private timestamps: number[] = [];
  private lastCall = 0;

  /**
   * @param maxPerWindow max calls allowed per window
   * @param windowMs sliding window size (default 60s)
   * @param minIntervalMs minimum gap between two calls (default 0)
   */
  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs = 60_000,
    private readonly minIntervalMs = 0,
  ) {}

  /** Resolves when it is safe to make the next call. */
  async acquire(): Promise<void> {
    if (this.minIntervalMs > 0) {
      const since = Date.now() - this.lastCall;
      if (since < this.minIntervalMs) await sleep(this.minIntervalMs - since);
    }

    // Drop timestamps outside the window, then wait if we are at the cap.
    const cutoff = Date.now() - this.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);
    if (this.timestamps.length >= this.maxPerWindow) {
      const oldest = this.timestamps[0];
      const wait = oldest + this.windowMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.timestamps = this.timestamps.filter((t) => t > Date.now() - this.windowMs);
    }

    const now = Date.now();
    this.timestamps.push(now);
    this.lastCall = now;
  }
}

/** Shared limiter for Reddit reads (~60 req/min, brief §6). */
export const redditLimiter = new RateLimiter(60, 60_000, 250);
