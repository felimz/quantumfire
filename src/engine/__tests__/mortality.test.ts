import { describe, it, expect } from "vitest";
import { getSurvivalProbability } from "../mortality";

describe("mortality (getSurvivalProbability)", () => {
  it("should return 1.0 if targetAge is less than or equal to currentAge", () => {
    expect(getSurvivalProbability(50, 50)).toBe(1.0);
    expect(getSurvivalProbability(50, 49)).toBe(1.0);
  });

  it("should return a probability between 0 and 1 for future ages", () => {
    const prob = getSurvivalProbability(50, 51);
    expect(prob).toBeGreaterThan(0);
    expect(prob).toBeLessThan(1);
  });

  it("should have decreasing survival probabilities over time", () => {
    const p1 = getSurvivalProbability(50, 60);
    const p2 = getSurvivalProbability(50, 70);
    const p3 = getSurvivalProbability(50, 80);

    expect(p1).toBeGreaterThan(p2);
    expect(p2).toBeGreaterThan(p3);
  });

  it("should have realistic Gompertz-Makeham curve drop-offs at extreme ages", () => {
    // According to typical mortality curves, surviving from 50 to 120 is astronomically low
    const p120 = getSurvivalProbability(50, 120);
    expect(p120).toBeLessThan(0.001); // Less than 0.1% chance
  });
});
