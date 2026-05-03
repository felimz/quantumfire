import { describe, it, expect } from "vitest";
import {
  gaussianRandom,
  getMarketFactor,
  getGeometricRate,
  poissonRandom,
  getJumpDiffusionFactor,
} from "../math";
describe("gaussianRandom", () => {
  it("should return values centered around the given mean", () => {
    const samples = Array.from({ length: 50000 }, () => gaussianRandom(10, 1));
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(avg).toBeCloseTo(10, 0); // within ±0.5
  });

  it("should have approximately correct standard deviation", () => {
    const mean = 5;
    const stdev = 2;
    const samples = Array.from({ length: 50000 }, () =>
      gaussianRandom(mean, stdev),
    );
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance =
      samples.reduce((a, b) => a + (b - avg) ** 2, 0) / samples.length;
    const measuredStdev = Math.sqrt(variance);
    expect(measuredStdev).toBeCloseTo(stdev, 0);
  });
});

describe("getMarketFactor", () => {
  it("should return 1 + mean when volatility is 0", () => {
    expect(getMarketFactor(0.1, 0, 0)).toBeCloseTo(1.1, 10);
    expect(getMarketFactor(0.07, 0, 1.5)).toBeCloseTo(1.07, 10);
  });

  it("should return a growth factor > 1 for positive z-scores", () => {
    const factor = getMarketFactor(0.1, 0.17, 1.0);
    expect(factor).toBeGreaterThan(1.0);
  });

  it("should return a growth factor < 1 for sufficiently negative z-scores", () => {
    const factor = getMarketFactor(0.1, 0.17, -3.0);
    expect(factor).toBeLessThan(1.0);
  });

  it("should produce lognormal median equal to geometric mean at z=0", () => {
    const factor = getMarketFactor(0.1, 0.17, 0);
    const geometric = getGeometricRate(0.1, 0.17);
    expect(factor).toBeCloseTo(geometric, 4);
  });
});

describe("getGeometricRate", () => {
  it("should be less than 1 + mean (volatility drag)", () => {
    const geo = getGeometricRate(0.1, 0.17);
    expect(geo).toBeLessThan(1.1);
    expect(geo).toBeGreaterThan(1.0);
  });

  it("should equal 1 + mean when volatility is 0", () => {
    expect(getGeometricRate(0.1, 0)).toBeCloseTo(1.1, 10);
  });

  it("should decrease as volatility increases", () => {
    const geo1 = getGeometricRate(0.1, 0.1);
    const geo2 = getGeometricRate(0.1, 0.3);
    expect(geo1).toBeGreaterThan(geo2);
  });
});

describe("poissonRandom", () => {
  it("should return values centered around lambda", () => {
    const lambda = 2.5;
    const samples = Array.from({ length: 50000 }, () => poissonRandom(lambda));
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(avg).toBeCloseTo(lambda, 1);
  });

  it("should only return non-negative integers", () => {
    const samples = Array.from({ length: 100 }, () => poissonRandom(5));
    for (const val of samples) {
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("getJumpDiffusionFactor", () => {
  it("should match continuous model when jump intensity is 0", () => {
    const mean = 0.1;
    const vol = 0.15;
    const zScore = 1.2;

    // With 0 jump intensity, compensator is 0, so it should match regular getMarketFactor exactly
    const pure = getMarketFactor(mean, vol, zScore);
    const jump = getJumpDiffusionFactor(mean, vol, zScore, 0, -0.2, 0.1);

    expect(jump).toBeCloseTo(pure, 3);
  });

  it("should return > 0", () => {
    const jump = getJumpDiffusionFactor(0.1, 0.15, -3, 5, -0.5, 0.5);
    expect(jump).toBeGreaterThan(0);
  });

  it("should return > 0 even with extreme jump intensity (λ=10)", () => {
    // Many jumps per year — result should still be a valid positive number
    for (let i = 0; i < 50; i++) {
      const jump = getJumpDiffusionFactor(0.1, 0.15, 0, 10, -0.3, 0.1);
      expect(jump).toBeGreaterThan(0);
      expect(Number.isFinite(jump)).toBe(true);
    }
  });

  it("should only use jump component when volatility is 0 but jumps are active", () => {
    // With vol=0 and zScore=0, the continuous part is just drift.
    // With jumps active, the result will differ run to run due to Poisson.
    const results = new Set<number>();
    for (let i = 0; i < 100; i++) {
      results.add(getJumpDiffusionFactor(0.1, 0, 0, 1.0, -0.2, 0.05));
    }
    // With Poisson jumps, we should see at least 2 distinct values (0 jumps vs 1+ jumps)
    expect(results.size).toBeGreaterThanOrEqual(2);
  });

  it("should return 1 + mean when both volatility and jump intensity are 0", () => {
    const factor = getJumpDiffusionFactor(0.1, 0, 0, 0, -0.2, 0.1);
    expect(factor).toBeCloseTo(1.1, 8);
  });
});

describe("getGeometricRate edge cases", () => {
  it("should return < 1 for negative mean returns", () => {
    const geo = getGeometricRate(-0.1, 0.1);
    expect(geo).toBeLessThan(1.0);
  });

  it("should return exactly 1 for zero mean and zero vol", () => {
    expect(getGeometricRate(0, 0)).toBeCloseTo(1.0, 10);
  });
});

describe("getMarketFactor edge cases", () => {
  it("should center around 1.0 for zero mean with z=0", () => {
    const factor = getMarketFactor(0, 0.15, 0);
    // Geometric mean: exp(log(1+0) - 0.5*0.15^2) = exp(-0.01125) ≈ 0.9888
    expect(factor).toBeLessThan(1.0);
    expect(factor).toBeGreaterThan(0.95);
  });

  it("should produce average return close to arithmetic mean over many samples", () => {
    const samples = Array.from({ length: 50000 }, () => {
      const z = gaussianRandom(0, 1);
      return getMarketFactor(0.07, 0.15, z);
    });
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    // E[exp(X)] where X ~ N(mu-σ²/2, σ²) = exp(mu) = 1 + mean = 1.07
    expect(avg).toBeCloseTo(1.07, 1);
  });
});
