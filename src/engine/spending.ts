/**
 * spending.ts - Dynamic Spending Policy Wrappers
 *
 * Provides various strategies for adjusting retirement withdrawals dynamically
 * in response to portfolio performance and sequence-of-returns risk.
 */

export interface SpendingPolicy {
  /**
   * Calculate the approved withdrawal amount for the given year.
   *
   * @param currentPortfolioValue Total value of the portfolio at start of year
   * @param previousWithdrawal Nominal amount withdrawn the previous year (0 for first year)
   * @param currentInflationRate Inflation rate for the current year
   * @param initialWithdrawalRateBaseline The initial target WR, used as a reference point
   * @returns Nominal approved spending for this year
   */
  calculateTargetSpend(
    currentPortfolioValue: number,
    previousWithdrawal: number,
    currentInflationRate: number,
    initialWithdrawalRateBaseline: number,
    initialPortfolioValue: number,
  ): number;
}

export class FixedRealSpending implements SpendingPolicy {
  calculateTargetSpend(
    _currentPortfolioValue: number,
    previousWithdrawal: number,
    currentInflationRate: number,
    initialWithdrawalRateBaseline: number,
    initialPortfolioValue: number,
  ): number {
    if (previousWithdrawal === 0) {
      return initialPortfolioValue * initialWithdrawalRateBaseline;
    }
    // Baseline "4% Rule" mechanics: Just adjust last year's spend by inflation
    return previousWithdrawal * (1 + currentInflationRate);
  }
}

export class GuytonKlingerSpending implements SpendingPolicy {
  constructor(
    private capitalPreservationThreshold: number = 1.2, // e.g. 1.2 = 20% higher than initial WR
    private prosperityThreshold: number = 0.8, // e.g. 0.8 = 20% lower than initial WR
    private adjustmentRate: number = 0.1, // 10%
  ) {}

  calculateTargetSpend(
    currentPortfolioValue: number,
    previousWithdrawal: number,
    currentInflationRate: number,
    initialWithdrawalRateBaseline: number,
    initialPortfolioValue: number,
  ): number {
    if (previousWithdrawal === 0) {
      return initialPortfolioValue * initialWithdrawalRateBaseline;
    }

    if (currentPortfolioValue <= 0) return 0;

    let targetSpend = previousWithdrawal;
    let applyInflation = true;
    const currentWR = previousWithdrawal / currentPortfolioValue;

    // Capital Preservation Rule (Portfolio is dropping fast)
    if (
      currentWR >
      initialWithdrawalRateBaseline * this.capitalPreservationThreshold
    ) {
      targetSpend *= 1 - this.adjustmentRate;
      applyInflation = false; // Skip inflation adjustment when cutting spending
    }
    // Prosperity Rule (Portfolio is growing fast)
    else if (
      currentWR <
      initialWithdrawalRateBaseline * this.prosperityThreshold
    ) {
      targetSpend *= 1 + this.adjustmentRate;
    }

    if (applyInflation) {
      targetSpend *= 1 + currentInflationRate;
    }

    return targetSpend;
  }
}

export class VanguardDynamicSpending implements SpendingPolicy {
  constructor(
    private ceilingPct: number = 0.05, // Max +5% real spending increase per year
    private floorPct: number = -0.025, // Max -2.5% real spending decrease per year
  ) {}

  calculateTargetSpend(
    currentPortfolioValue: number,
    previousWithdrawal: number,
    currentInflationRate: number,
    initialWithdrawalRateBaseline: number,
    initialPortfolioValue: number,
  ): number {
    if (previousWithdrawal === 0) {
      return initialPortfolioValue * initialWithdrawalRateBaseline;
    }

    // Unconstrained withdrawal is simply applying the initial target WR to the current balance
    const unconstrainedWithdrawal =
      currentPortfolioValue * initialWithdrawalRateBaseline;

    // The previous withdrawal adjusted for inflation
    const inflationAdjustedPrevious =
      previousWithdrawal * (1 + currentInflationRate);

    // Calculate the hard boundaries for this year
    const maximumAllowed = inflationAdjustedPrevious * (1 + this.ceilingPct);
    const minimumAllowed = inflationAdjustedPrevious * (1 + this.floorPct);

    // Apply the boundaries
    if (unconstrainedWithdrawal > maximumAllowed) {
      return maximumAllowed;
    }

    if (unconstrainedWithdrawal < minimumAllowed) {
      return minimumAllowed;
    }

    return unconstrainedWithdrawal;
  }
}
