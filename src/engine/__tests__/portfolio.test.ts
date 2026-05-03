import { describe, it, expect } from "vitest";
import { TaxableLotTracker } from "../portfolio";

describe("TaxableLotTracker", () => {
  it("should initialize with legacy lot correctly", () => {
    const tracker = new TaxableLotTracker(100_000, 0.5);
    expect(tracker.getTotalValue()).toBe(100_000);
    expect(tracker.getTotalUnrealizedGains()).toBe(50_000); // 100k - (100k * 0.5)
  });

  it("should apply market growth correctly", () => {
    const tracker = new TaxableLotTracker(100_000, 1.0); // 100k basis
    tracker.applyGrowth(1.1); // +10%

    expect(tracker.getTotalValue()).toBeCloseTo(110_000);
    expect(tracker.getTotalUnrealizedGains()).toBeCloseTo(10_000);
  });

  it("should add new contributions as separate lots", () => {
    const tracker = new TaxableLotTracker(100_000, 0.5);

    // Market goes up 20%
    tracker.applyGrowth(1.2); // Value: 120k, Basis: 50k, Gains: 70k

    // Add 10k fresh contribution
    tracker.addContribution(10_000, 1);

    expect(tracker.getTotalValue()).toBeCloseTo(130_000);
    // The new 10k has 0 unrealized gains. Total gains should still be 70k.
    expect(tracker.getTotalUnrealizedGains()).toBeCloseTo(70_000);
  });

  describe("HIFO Selling Strategy", () => {
    it("should prioritize selling lots with the highest cost basis (lowest gains) first", () => {
      const tracker = new TaxableLotTracker(0, 0); // Empty start

      // Buy Lot A at $1 / share ($10k value, $10k basis)
      tracker.addContribution(10_000, 1);

      // Market goes up to $2 / share
      tracker.applyGrowth(2.0); // Value: 20k, Basis: 10k

      // Buy Lot B at $2 / share ($10k value, $10k basis)
      tracker.addContribution(10_000, 2);

      // Total value: 30k.
      // Lot A: 20k value, 10k basis, 10k gains
      // Lot B: 10k value, 10k basis, 0 gains

      const { cashRaised, realizedGains } = tracker.sellForCash(10_000, "HIFO");

      expect(cashRaised).toBeCloseTo(10_000);

      // HIFO should sell Lot B first because it has the highest cost basis ($2/share vs $1/share)
      // Lot B has 0 gains.
      expect(realizedGains).toBeCloseTo(0);

      // Remaining portfolio should basically just be Lot A
      expect(tracker.getTotalValue()).toBeCloseTo(20_000);
      expect(tracker.getTotalUnrealizedGains()).toBeCloseTo(10_000);
    });

    it("should split lots when selling partial amounts", () => {
      const tracker = new TaxableLotTracker(10_000, 0.5); // 10k value, 5k basis

      const { cashRaised, realizedGains } = tracker.sellForCash(4_000, "HIFO");

      expect(cashRaised).toBeCloseTo(4_000);
      // 40% of the lot was sold. 40% of 5k gains = 2k.
      expect(realizedGains).toBeCloseTo(2_000);

      expect(tracker.getTotalValue()).toBeCloseTo(6_000);
      expect(tracker.getTotalUnrealizedGains()).toBeCloseTo(3_000);
    });
  });

  describe("Step-Up in Basis", () => {
    it("should eliminate all unrealized gains", () => {
      const tracker = new TaxableLotTracker(100_000, 0.1); // 90k gains
      tracker.applyStepUpInBasis();

      expect(tracker.getTotalValue()).toBe(100_000); // Value unchanged
      expect(tracker.getTotalUnrealizedGains()).toBe(0); // Gains wiped out
    });

    it("should eliminate gains even after large appreciation", () => {
      const tracker = new TaxableLotTracker(100_000, 0.5);
      tracker.applyGrowth(3.0); // 3x appreciation → 300k value, 250k gains
      expect(tracker.getTotalUnrealizedGains()).toBeCloseTo(250_000);

      tracker.applyStepUpInBasis();
      expect(tracker.getTotalValue()).toBeCloseTo(300_000);
      expect(tracker.getTotalUnrealizedGains()).toBe(0);
    });
  });

  describe("FIFO Selling Strategy", () => {
    it("should sell oldest lots first", () => {
      const tracker = new TaxableLotTracker(0, 0);

      // Buy Lot A (year 1) at $1/share
      tracker.addContribution(10_000, 1);
      // Market goes to $2/share
      tracker.applyGrowth(2.0);
      // Buy Lot B (year 2) at $2/share
      tracker.addContribution(10_000, 2);

      // Total: 30k. Lot A: 20k value, 10k basis. Lot B: 10k value, 10k basis.
      // FIFO sells Lot A first (yearPurchased=1) → high gains
      const { cashRaised, realizedGains } = tracker.sellForCash(10_000, "FIFO");

      expect(cashRaised).toBeCloseTo(10_000);
      // FIFO sells from Lot A which has 50% gains → 5k gains on 10k sale
      expect(realizedGains).toBeCloseTo(5_000);
    });
  });

  describe("LOFO Selling Strategy", () => {
    it("should sell lowest cost basis lots first (maximizes tax)", () => {
      const tracker = new TaxableLotTracker(0, 0);

      // Buy Lot A at $1/share
      tracker.addContribution(10_000, 1);
      // Market goes to $2/share
      tracker.applyGrowth(2.0);
      // Buy Lot B at $2/share
      tracker.addContribution(10_000, 2);

      // LOFO sells Lot A first (lowest basis $1/share) → maximum gains
      const { cashRaised, realizedGains } = tracker.sellForCash(10_000, "LOFO");

      expect(cashRaised).toBeCloseTo(10_000);
      expect(realizedGains).toBeCloseTo(5_000); // 50% of Lot A is gains
    });
  });

  describe("LIFO Selling Strategy", () => {
    it("should sell newest lots first", () => {
      const tracker = new TaxableLotTracker(0, 0);

      // Buy Lot A at $1/share
      tracker.addContribution(10_000, 1);
      // Market goes to $2/share
      tracker.applyGrowth(2.0);
      // Buy Lot B at $2/share
      tracker.addContribution(10_000, 2);

      // LIFO sells Lot B first (yearPurchased=2) → zero gains
      const { cashRaised, realizedGains } = tracker.sellForCash(10_000, "LIFO");

      expect(cashRaised).toBeCloseTo(10_000);
      expect(realizedGains).toBeCloseTo(0); // Lot B has no gains
    });
  });

  describe("Edge Cases", () => {
    it("should return zero when selling from empty tracker", () => {
      const tracker = new TaxableLotTracker(0, 0);
      const { cashRaised, realizedGains } = tracker.sellForCash(10_000, "HIFO");
      expect(cashRaised).toBe(0);
      expect(realizedGains).toBe(0);
    });

    it("should fully liquidate when selling more than total value", () => {
      const tracker = new TaxableLotTracker(50_000, 0.6); // 50k value, 30k basis
      const { cashRaised, realizedGains } = tracker.sellForCash(
        100_000,
        "HIFO",
      );

      expect(cashRaised).toBeCloseTo(50_000); // Can only raise what exists
      expect(realizedGains).toBeCloseTo(20_000); // 50k - 30k basis
      expect(tracker.getTotalValue()).toBe(0);
    });

    it("should have zero unrealized gains after market crash below basis", () => {
      const tracker = new TaxableLotTracker(100_000, 1.0); // basis = price = 1.0
      tracker.applyGrowth(0.5); // Market crashes 50%

      // Value is 50k, basis is still 100k*1.0, gains = max(0, 50k-100k) = 0
      expect(tracker.getTotalValue()).toBeCloseTo(50_000);
      expect(tracker.getTotalUnrealizedGains()).toBe(0);
    });

    it("should sell with zero target amount returning zero", () => {
      const tracker = new TaxableLotTracker(50_000, 0.5);
      const { cashRaised, realizedGains } = tracker.sellForCash(0, "HIFO");
      expect(cashRaised).toBe(0);
      expect(realizedGains).toBe(0);
    });

    it("should handle multiple lots with partial sells correctly", () => {
      const tracker = new TaxableLotTracker(0, 0);

      // Create 5 lots at different prices
      tracker.addContribution(10_000, 1); // $1/share
      tracker.applyGrowth(1.5); // $1.50/share
      tracker.addContribution(15_000, 2); // 10k shares at $1.50
      tracker.applyGrowth(2.0); // $3.00/share
      tracker.addContribution(9_000, 3); // 3k shares at $3.00

      const totalBefore = tracker.getTotalValue();
      const { cashRaised } = tracker.sellForCash(5_000, "HIFO");

      expect(cashRaised).toBeCloseTo(5_000);
      expect(tracker.getTotalValue()).toBeCloseTo(totalBefore - 5_000);
    });

    it("should not add contribution when amount is zero or negative", () => {
      const tracker = new TaxableLotTracker(50_000, 0.5);
      tracker.addContribution(0, 1);
      tracker.addContribution(-100, 2);
      expect(tracker.getTotalValue()).toBe(50_000);
    });
  });
});
