/**
 * healthcare.ts - Long-Term Care (LTC) and Healthcare Models
 *
 * Provides actuarial logic for determining if and when a catastrophic
 * healthcare event (like entering an LTC facility) occurs, and
 * calculates the associated cash flow requirements.
 */

import { gaussianRandom } from "./math";

export interface LTCShock {
  isActive: boolean;
  annualCostNominal: number;
  yearsRemaining: number;
}

export class HealthEngine {
  private hasLTC: boolean;
  private ltcStartAge: number;
  private ltcCost: number;
  private ltcDuration: number;
  private lifetimeProbabilityValue: number;

  constructor(
    private ltcShockEnabled: boolean,
    private lifetimeProbability: number,
    private baseAnnualCost: number,
    private duration: number,
    private meanStartAge: number,
    isDeterministic: boolean = false,
  ) {
    this.lifetimeProbabilityValue = lifetimeProbability;

    if (!this.ltcShockEnabled) {
      this.hasLTC = false;
      this.ltcStartAge = 999;
      this.ltcCost = 0;
      this.ltcDuration = 0;
      return;
    }

    if (isDeterministic) {
      // Deterministic mode: use expected-value semantics instead of random roll.
      // The cost is weighted by the probability of LTC occurring.
      // This makes the deterministic path truly reproducible.
      this.hasLTC = lifetimeProbability > 0;
      this.ltcStartAge = this.meanStartAge;
      this.ltcCost = this.baseAnnualCost * this.lifetimeProbabilityValue;
      this.ltcDuration = this.duration;
      return;
    }

    // Stochastic mode: roll the dice once at the beginning of the timeline
    this.hasLTC = Math.random() < this.lifetimeProbability;

    if (this.hasLTC) {
      // Typically occurs around meanStartAge (e.g. 82), with some variance.
      // We use a stdev of ~3 years.
      this.ltcStartAge = Math.round(gaussianRandom(this.meanStartAge, 3));
      this.ltcCost = this.baseAnnualCost;
      this.ltcDuration = this.duration;
    } else {
      this.ltcStartAge = 999;
      this.ltcCost = 0;
      this.ltcDuration = 0;
    }
  }

  /**
   * Determine the LTC burden for the given year.
   * Assumes cost inflates with general healthcare inflation.
   */
  public getLTCCostForYear(
    age: number,
    cumulativeHealthcareInflation: number,
  ): number {
    if (!this.hasLTC) return 0;

    const yearsSinceStart = age - this.ltcStartAge;

    // Check if we are currently inside the duration window
    if (yearsSinceStart >= 0 && yearsSinceStart < this.ltcDuration) {
      return this.ltcCost * cumulativeHealthcareInflation;
    }

    return 0;
  }
}
