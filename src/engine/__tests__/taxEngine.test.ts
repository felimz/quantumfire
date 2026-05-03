import { describe, it, expect } from "vitest";
import {
  calculateTaxes,
  calculateTaxableSS,
  STANDARD_DEDUCTION_SINGLE,
} from "../taxEngine";

describe("taxEngine calculations", () => {
  it("should calculate ordinary income tax crossing multiple brackets", () => {
    const income = 150_000;
    const result = calculateTaxes(income, 0);
    expect(result.ordinaryTax).toBeCloseTo(24734, 0);
    expect(result.cgTax).toBe(0);
    expect(result.niit).toBe(0);
    expect(result.totalTax).toBe(result.ordinaryTax);
  });

  it("should stack capital gains on top of ordinary income correctly", () => {
    const ordinaryIncome = 40_000 + STANDARD_DEDUCTION_SINGLE;
    const ltcg = 30_000;
    const result = calculateTaxes(ordinaryIncome, ltcg);
    const expectedCgTax = 20550 * 0.15;
    expect(result.cgTax).toBeCloseTo(expectedCgTax, 0);
  });

  it("should calculate NIIT when MAGI exceeds threshold", () => {
    const result = calculateTaxes(150_000, 100_000);
    expect(result.niit).toBeCloseTo(1900, 0);
  });

  it("should return zero tax if income is below standard deduction", () => {
    const result = calculateTaxes(10_000, 0);
    expect(result.totalTax).toBe(0);
    expect(result.effectiveRate).toBe(0);
  });

  it("should return zero tax for zero income", () => {
    const result = calculateTaxes(0, 0);
    expect(result.ordinaryTax).toBe(0);
    expect(result.cgTax).toBe(0);
    expect(result.niit).toBe(0);
    expect(result.totalTax).toBe(0);
    expect(result.effectiveRate).toBe(0);
  });

  it("should apply correct rate at bracket boundary (exactly at 12% cap)", () => {
    // Taxable ordinary = exactly 50,400 (top of 12% bracket)
    const income = 50_400 + STANDARD_DEDUCTION_SINGLE;
    const result = calculateTaxes(income, 0);
    // 12,400 @ 10% = 1,240 + 38,000 @ 12% = 4,560 = 5,800
    expect(result.ordinaryTax).toBeCloseTo(5800, 0);
  });

  it("should scale brackets with inflationMult", () => {
    const income = 150_000;
    const inflationMult = 2.0; // Double all brackets

    const resultNominal = calculateTaxes(income, 0, 1.0);
    const resultInflated = calculateTaxes(income, 0, inflationMult);

    // With doubled brackets and deduction, 150k income has much more room
    // in lower brackets, so tax should be significantly lower
    expect(resultInflated.totalTax).toBeLessThan(resultNominal.totalTax);
  });

  it("should produce zero NIIT when MAGI is exactly at threshold", () => {
    // MAGI = 200,000 exactly (threshold). No excess → no NIIT.
    const result = calculateTaxes(150_000, 50_000);
    expect(result.niit).toBe(0);
  });

  it("should produce tiny NIIT when MAGI is $1 over threshold", () => {
    // MAGI = 200,001. Excess = 1. NIIT = min(1, ltcg) * 3.8%
    const result = calculateTaxes(150_000, 50_001);
    expect(result.niit).toBeCloseTo(1 * 0.038, 2);
  });

  it("should calculate LTCG at 0% when total income is below 0% bracket cap", () => {
    // Ordinary taxable = 0 (income below std deduction)
    // LTCG fills from bottom → first 49,450 at 0%
    const result = calculateTaxes(0, 30_000);
    expect(result.cgTax).toBe(0); // All gains within 0% bracket
  });

  it("should handle very high income reaching top brackets", () => {
    const result = calculateTaxes(1_000_000, 0);
    expect(result.ordinaryTax).toBeGreaterThan(0);
    expect(result.effectiveRate).toBeGreaterThan(0.3); // Effective > 30% at $1M
    expect(result.effectiveRate).toBeLessThan(0.37); // Can't exceed top marginal
  });
});

describe("calculateTaxableSS", () => {
  it("should return 0 when combined income is below base threshold ($25k)", () => {
    // combinedIncome = otherIncome + 0.5 * SS = 10,000 + 0.5 * 20,000 = 20,000 < 25,000
    expect(calculateTaxableSS(20_000, 10_000)).toBe(0);
  });

  it("should return 0 for zero SS benefit", () => {
    expect(calculateTaxableSS(0, 50_000)).toBe(0);
  });

  it("should return partial (50%) taxation between base and upper thresholds", () => {
    // combinedIncome = 0 + 0.5 * 60,000 = 30,000. Between 25k and 34k.
    // taxable = (30,000 - 25,000) * 0.5 = 2,500
    const taxable = calculateTaxableSS(60_000, 0);
    expect(taxable).toBeCloseTo(2500, 0);
  });

  it("should cap at 85% of SS benefit even for very high income", () => {
    // With very high other income, the formula would try to tax > 85%
    // but the function caps at 85% * ssBenefit
    const ss = 30_000;
    const taxable = calculateTaxableSS(ss, 500_000);
    expect(taxable).toBe(ss * 0.85);
  });

  it("should apply both 50% and 85% tiers for income crossing both thresholds", () => {
    // combinedIncome = 20,000 + 0.5 * 40,000 = 40,000 (above upper 34k)
    // Tier 1: min(40k, 34k) - 25k = 9,000 * 0.5 = 4,500
    // Tier 2: 40k - 34k = 6,000 * 0.85 = 5,100
    // Total = 9,600
    const taxable = calculateTaxableSS(40_000, 20_000);
    expect(taxable).toBeCloseTo(9600, 0);
  });

  it("should scale thresholds with inflationMult", () => {
    const ss = 30_000;
    const other = 15_000;
    // At inflationMult=1, combined = 30k, above base 25k → some taxation
    const tax1 = calculateTaxableSS(ss, other, 1.0);
    // At inflationMult=2, base = 50k, combined = 30k < 50k → zero taxation
    const tax2 = calculateTaxableSS(ss, other, 2.0);
    expect(tax1).toBeGreaterThan(0);
    expect(tax2).toBe(0);
  });
});
