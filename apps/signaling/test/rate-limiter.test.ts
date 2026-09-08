import { describe, expect, it } from "vitest";
import { TokenBucketRateLimiter } from "../src/rate-limiter";

describe("TokenBucketRateLimiter", () => {
  it("allows requests up to capacity then blocks", () => {
    const limiter = new TokenBucketRateLimiter(3, 0);
    const now = 0;
    expect(limiter.allow("k", now)).toBe(true);
    expect(limiter.allow("k", now)).toBe(true);
    expect(limiter.allow("k", now)).toBe(true);
    expect(limiter.allow("k", now)).toBe(false);
  });

  it("refills tokens over time", () => {
    const limiter = new TokenBucketRateLimiter(1, 1 / 1000); // 1 token per second
    expect(limiter.allow("k", 0)).toBe(true);
    expect(limiter.allow("k", 100)).toBe(false);
    expect(limiter.allow("k", 1100)).toBe(true);
  });

  it("tracks separate keys independently", () => {
    const limiter = new TokenBucketRateLimiter(1, 0);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("b", 0)).toBe(true);
    expect(limiter.allow("a", 0)).toBe(false);
  });
});
