import { describe, it, expect } from "vitest";
import {
  FixedRealSpending,
  GuytonKlingerSpending,
  VanguardDynamicSpending,
} from "../spending";

describe("Spending Policies", () => {
  describe("FixedRealSpending", () => {
    it("should return Initial Withdrawal Rate * Initial Portfolio on first year (previous = 0)", () => {
      const policy = new FixedRealSpending();
      // 4% of $1,000,000
      expect(policy.calculateTargetSpend(1000000, 0, 0.05, 0.04, 1000000)).toBe(
        40000,
      );
    });

    it("should strictly adjust the previous withdrawal by inflation in subsequent years", () => {
      const policy = new FixedRealSpending();
      // Previous was 40,000, inflation is 5%. New spend is 42,000
      expect(
        policy.calculateTargetSpend(800000, 40000, 0.05, 0.04, 1000000),
      ).toBe(42000);
    });
  });

  describe("GuytonKlingerSpending", () => {
    it("should act like FixedReal on the first year", () => {
      const policy = new GuytonKlingerSpending();
      expect(policy.calculateTargetSpend(1000000, 0, 0.02, 0.04, 1000000)).toBe(
        40000,
      );
    });

    it("should trigger Prosperity Rule (increase + inflation) if WR drops below threshold", () => {
      const policy = new GuytonKlingerSpending(1.2, 0.8, 0.1);
      // Initial WR = 4%. Prosperity threshold = 0.8 * 4% = 3.2%
      // Portfolio skyrocketed to 2M. Previous spend = 50k. Current WR = 50k / 2M = 2.5% (< 3.2%)
      // Target spend = 50k * 1.1 = 55k. Apply inflation (3%) = 55k * 1.03 = 56650
      const spend = policy.calculateTargetSpend(
        2000000,
        50000,
        0.03,
        0.04,
        1000000,
      );
      expect(spend).toBeCloseTo(56650, 0);
    });

    it("should trigger Capital Preservation Rule (cut & freeze) if WR rises above threshold", () => {
      const policy = new GuytonKlingerSpending(1.2, 0.8, 0.1);
      // Initial WR = 4%. Preservation threshold = 1.2 * 4% = 4.8%
      // Portfolio crashed to 800k. Previous spend = 50k. Current WR = 50k / 800k = 6.25% (> 4.8%)
      // Target spend = 50k * 0.9 = 45k. Skip inflation!
      const spend = policy.calculateTargetSpend(
        800000,
        50000,
        0.05,
        0.04,
        1000000,
      );
      expect(spend).toBeCloseTo(45000, 0);
    });

    it("should just apply inflation if WR is within the safe bounds", () => {
      const policy = new GuytonKlingerSpending(1.2, 0.8, 0.1);
      // WR = 40k / 1M = 4%, identical to target
      const spend = policy.calculateTargetSpend(
        1000000,
        40000,
        0.02,
        0.04,
        1000000,
      );
      expect(spend).toBeCloseTo(40800, 0); // 40000 * 1.02
    });
  });

  describe("VanguardDynamicSpending", () => {
    it("should act like unconstrained on the first year", () => {
      const policy = new VanguardDynamicSpending();
      expect(policy.calculateTargetSpend(1000000, 0, 0.02, 0.04, 1000000)).toBe(
        40000,
      );
    });

    it("should cap spending at the +5% ceiling if unconstrained withdrawal is massive", () => {
      const policy = new VanguardDynamicSpending(0.05, -0.025);
      // Portfolio grows massively to 2,000,000.
      // Unconstrained 4% = $80,000
      // Previous spend was $40,000, 2% inflation = $40,800.
      // Ceiling is $40,800 * 1.05 = $42,840. We must be capped here.
      const spend = policy.calculateTargetSpend(
        2000000,
        40000,
        0.02,
        0.04,
        1000000,
      );
      expect(spend).toBeCloseTo(42840, 0);
    });

    it("should floor spending at the -2.5% floor if portfolio crashes", () => {
      const policy = new VanguardDynamicSpending(0.05, -0.025);
      // Portfolio drops to $500,000.
      // Unconstrained 4% = $20,000.
      // Previous spend $40,000, 2% inflation = $40,800.
      // Floor is $40,800 * 0.975 = $39,780. We must be floored here.
      const spend = policy.calculateTargetSpend(
        500000,
        40000,
        0.02,
        0.04,
        1000000,
      );
      expect(spend).toBeCloseTo(39780, 0);
    });

    it("should just take the unconstrained 4% if it's within boundaries", () => {
      const policy = new VanguardDynamicSpending(0.05, -0.025);
      // Portfolio = $1,000,000. 4% = $40,000.
      // Previous = 40,000. 0% inflation.
      // Boundaries are $39,000 to $42,000. $40,000 is perfectly bounded.
      const spend = policy.calculateTargetSpend(
        1000000,
        40000,
        0.0,
        0.04,
        1000000,
      );
      expect(spend).toBeCloseTo(40000, 0);
    });
  });

  describe("Edge Cases", () => {
    it("FixedReal with negative inflation should decrease spending", () => {
      const policy = new FixedRealSpending();
      const spend = policy.calculateTargetSpend(
        1000000,
        40000,
        -0.05,
        0.04,
        1000000,
      );
      expect(spend).toBeCloseTo(38000, 0); // 40k * 0.95
    });

    it("GK with zero portfolio should return 0 (no division by zero)", () => {
      const policy = new GuytonKlingerSpending();
      const spend = policy.calculateTargetSpend(0, 50000, 0.03, 0.04, 1000000);
      expect(spend).toBe(0);
    });

    it("GK with negative inflation should reduce nominal spend", () => {
      const policy = new GuytonKlingerSpending(1.2, 0.8, 0.1);
      // WR = 40k / 1M = 4%, within safe bounds → just apply inflation
      const spend = policy.calculateTargetSpend(
        1000000,
        40000,
        -0.03,
        0.04,
        1000000,
      );
      expect(spend).toBeCloseTo(38800, 0); // 40k * 0.97
    });

    it("Vanguard with negative inflation should still enforce floor/ceiling", () => {
      const policy = new VanguardDynamicSpending(0.05, -0.025);
      // Portfolio crashed → unconstrained = 500k * 0.04 = 20k
      // Previous = 40k, inflation = -0.02 → adjusted = 40k * 0.98 = 39,200
      // Floor = 39,200 * 0.975 = 38,220
      // Unconstrained 20k < floor 38,220 → floor enforced
      const spend = policy.calculateTargetSpend(
        500000,
        40000,
        -0.02,
        0.04,
        1000000,
      );
      expect(spend).toBeCloseTo(38220, 0);
    });

    it("Vanguard should return unconstrained when exactly equal to ceiling", () => {
      const policy = new VanguardDynamicSpending(0.05, -0.025);
      // Construct scenario where unconstrained = ceiling
      // Previous = 40k, 0% inflation → adjusted = 40k
      // Ceiling = 40k * 1.05 = 42k
      // If portfolio = 42k / 0.04 = 1,050,000 → unconstrained = 42k = ceiling
      const spend = policy.calculateTargetSpend(
        1_050_000,
        40000,
        0.0,
        0.04,
        1000000,
      );
      expect(spend).toBeCloseTo(42000, 0);
    });
  });
});
