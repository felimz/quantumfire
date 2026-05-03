import { describe, it, expect } from "vitest";
import {
  generateClaytonCopulaUniforms,
  generateCorrelatedShocks,
  normInv,
} from "../dependence";

describe("normInv", () => {
  it("should match standard normal percentiles", () => {
    expect(normInv(0.5)).toBeCloseTo(0, 5);
    expect(normInv(0.8413447)).toBeCloseTo(1, 4);
    expect(normInv(0.9772498)).toBeCloseTo(2, 4);
    expect(normInv(0.1586553)).toBeCloseTo(-1, 4);
    expect(normInv(0.0227501)).toBeCloseTo(-2, 4);
  });
});

describe("generateClaytonCopulaUniforms", () => {
  it("should generate array of specified dimensions", () => {
    const uniforms = generateClaytonCopulaUniforms(2, 3);
    expect(uniforms.length).toBe(3);
    uniforms.forEach((u) => {
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
    });
  });

  // Math test: Theta -> 0 should approach independence, meaning product of ranks
  // Should roughly equal independent probability (0.5 * 0.5 = 0.25)
  // Theta > 0 should show lower tail dependence (p(U1<0.1, U2<0.1) > 0.01)

  it("should exhibit lower tail dependence for high theta", () => {
    // Generate 10000 samples with high dependance (theta = 5)
    // Looking at the bottom decile (U < 0.1)
    let simultaneousTailHits = 0;
    const iterations = 10000;

    for (let i = 0; i < iterations; i++) {
      const [u1, u2] = generateClaytonCopulaUniforms(5, 2);
      if (u1 < 0.1 && u2 < 0.1) {
        simultaneousTailHits++;
      }
    }

    // Independent probability of both being < 0.1 is 0.1 * 0.1 = 0.01
    // With high Clayton Copula theta, this should be significantly higher.
    const jointProb = simultaneousTailHits / iterations;

    // We expect the joint tail probability to be much higher than 1%
    expect(jointProb).toBeGreaterThan(0.04);
  });
});

describe("generateCorrelatedShocks", () => {
  it("should output standard normal variables", () => {
    // Generate many points and check if margins are standard normal
    let sum = 0;
    let sqSum = 0;
    const iterations = 10000;

    for (let i = 0; i < iterations; i++) {
      const shocks = generateCorrelatedShocks(2, 1);
      sum += shocks[0];
      sqSum += shocks[0] * shocks[0];
    }

    const mean = sum / iterations;
    const variance = sqSum / iterations - mean * mean;

    expect(mean).toBeCloseTo(0, 1);
    expect(variance).toBeCloseTo(1, 1);
  });
});
