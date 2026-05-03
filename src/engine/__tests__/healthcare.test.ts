import { describe, it, expect } from "vitest";
import { HealthEngine } from "../healthcare";

describe("HealthEngine", () => {
  describe("Deterministic (ltcShockEnabled = false)", () => {
    it("should disable LTC completely and return 0 costs", () => {
      const engine = new HealthEngine(false, 0.5, 100000, 3, 80);

      expect(engine["hasLTC"]).toBe(false);
      expect(engine["ltcStartAge"]).toBe(999);
      expect(engine["ltcCost"]).toBe(0);
      expect(engine["ltcDuration"]).toBe(0);

      // Regardless of age and inflation, cost should be 0
      expect(engine.getLTCCostForYear(80, 1.5)).toBe(0);
      expect(engine.getLTCCostForYear(90, 2.0)).toBe(0);
    });
  });

  describe("Stochastic (ltcShockEnabled = true)", () => {
    it("should never trigger if lifetimeProbability is 0", () => {
      const engine = new HealthEngine(true, 0, 100000, 3, 80);
      expect(engine["hasLTC"]).toBe(false);
      expect(engine.getLTCCostForYear(80, 1.0)).toBe(0);
    });

    it("should always trigger if lifetimeProbability is 1", () => {
      const engine = new HealthEngine(true, 1, 100000, 3, 80);
      expect(engine["hasLTC"]).toBe(true);

      // The start age will be gaussian varying around 80, so we can't test exact start reliably here
      // without mocking math.random, but we can verify cost structures
      expect(engine["ltcCost"]).toBe(100000);
      expect(engine["ltcDuration"]).toBe(3);
    });

    it("should apply cumulative inflation accurately inside the duration window", () => {
      // Force the LTC to occur at exactly age 80 by directly manipulating private fields for test predictability
      const engine = new HealthEngine(true, 1, 100000, 3, 80);
      engine["ltcStartAge"] = 80;

      // Age 79: Before window
      expect(engine.getLTCCostForYear(79, 1.0)).toBe(0);

      // Age 80: Inside window, inflation = 1.0 (0%)
      expect(engine.getLTCCostForYear(80, 1.0)).toBeCloseTo(100000, 0);

      // Age 81: Inside window, inflation = 1.1 (10%)
      expect(engine.getLTCCostForYear(81, 1.1)).toBeCloseTo(110000, 0);

      // Age 82: Inside window, inflation = 1.2 (20%)
      expect(engine.getLTCCostForYear(82, 1.2)).toBeCloseTo(120000, 0);

      // Age 83: Outside window (duration is 3 years: 80, 81, 82)
      expect(engine.getLTCCostForYear(83, 1.3)).toBe(0);
    });

    it("should handle duration of exactly 1 year", () => {
      const engine = new HealthEngine(true, 1, 50000, 1, 75);
      engine["ltcStartAge"] = 75;

      expect(engine.getLTCCostForYear(74, 1.0)).toBe(0);
      expect(engine.getLTCCostForYear(75, 1.0)).toBeCloseTo(50000, 0);
      expect(engine.getLTCCostForYear(76, 1.0)).toBe(0); // Duration=1 → only age 75
    });

    it("should handle duration of 0 (no cost even if triggered)", () => {
      const engine = new HealthEngine(true, 1, 100000, 0, 80);
      engine["ltcStartAge"] = 80;

      // Duration 0 means yearsSinceStart < 0 is never satisfied for >= 0
      expect(engine.getLTCCostForYear(80, 1.0)).toBe(0);
      expect(engine.getLTCCostForYear(81, 1.0)).toBe(0);
    });

    it("should scale correctly with very high inflation multiplier", () => {
      const engine = new HealthEngine(true, 1, 100000, 3, 85);
      engine["ltcStartAge"] = 85;

      // 10x inflation → $1M annual cost
      expect(engine.getLTCCostForYear(85, 10.0)).toBeCloseTo(1_000_000, 0);
    });

    it("should never fire if start age is in the past relative to query", () => {
      const engine = new HealthEngine(true, 1, 100000, 3, 70);
      engine["ltcStartAge"] = 70;

      // Ages 73+ are outside the window (70, 71, 72)
      expect(engine.getLTCCostForYear(73, 1.0)).toBe(0);
      expect(engine.getLTCCostForYear(80, 1.0)).toBe(0);
      // But ages within window should still work
      expect(engine.getLTCCostForYear(70, 1.0)).toBeCloseTo(100000, 0);
      expect(engine.getLTCCostForYear(72, 1.0)).toBeCloseTo(100000, 0);
    });
  });
});
