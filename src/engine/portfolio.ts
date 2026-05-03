/**
 * Advanced Taxable Lot Tracking
 *
 * To accurately model the tax drag sequences of a taxable brokerage account,
 * we must model individual tax lots, their cost basis, and holding periods.
 * This module allows for tax-optimized withdrawal strategies (e.g. HIFO vs FIFO).
 */

export interface TaxLot {
  id: string; // Unique identifier
  yearPurchased: number; // Age or Year of the simulation when purchased
  shares: number; // Number of shares (or nominal fraction)
  costBasisPerShare: number;
}

export type SalesStrategy = "FIFO" | "LIFO" | "HIFO" | "LOFO";

export class TaxableLotTracker {
  // Max safe limit for a 100-year retirement simulation
  private static readonly MAX_LOTS = 200;

  // Parallel strided arrays for lot data
  private _shares = new Float64Array(TaxableLotTracker.MAX_LOTS);
  private _costBasisPerShare = new Float64Array(TaxableLotTracker.MAX_LOTS);
  private _yearPurchased = new Float64Array(TaxableLotTracker.MAX_LOTS);

  private _lotCount = 0;
  private currentPricePerShare = 1.0;

  constructor(initialValue: number, initialBasisAssumed: number = 0.7) {
    if (initialValue > 0) {
      this._shares[0] = initialValue;
      this._costBasisPerShare[0] = initialBasisAssumed;
      this._yearPurchased[0] = -1; // Legacy lot, always long-term
      this._lotCount = 1;
    }
  }

  public getTotalValue(): number {
    let total = 0;
    for (let i = 0; i < this._lotCount; i++) {
      total += this._shares[i] * this.currentPricePerShare;
    }
    return total;
  }

  public getTotalUnrealizedGains(): number {
    let gains = 0;
    for (let i = 0; i < this._lotCount; i++) {
      const value = this._shares[i] * this.currentPricePerShare;
      const basis = this._shares[i] * this._costBasisPerShare[i];
      const gain = value - basis;
      if (gain > 0) gains += gain;
    }
    return gains;
  }

  /**
   * Apply a market growth/drop factor to the entire portfolio.
   * This simply updates the current price per share.
   */
  public applyGrowth(factor: number): void {
    this.currentPricePerShare *= factor;
  }

  /**
   * Reinvest dividends/capital gains or handle new contributions.
   * Creates a new 'lot' dynamically at the current market price without creating objects.
   */
  public addContribution(amount: number, currentYear: number): void {
    if (amount <= 0 || this._lotCount >= TaxableLotTracker.MAX_LOTS) return;

    const sharesPurchased = amount / this.currentPricePerShare;

    this._shares[this._lotCount] = sharesPurchased;
    this._costBasisPerShare[this._lotCount] = this.currentPricePerShare;
    this._yearPurchased[this._lotCount] = currentYear;
    this._lotCount++;
  }

  /**
   * Sell lots to generate required cash, optimizing for tax efficiency.
   * Modifies arrays in place.
   */
  public sellForCash(
    targetAmount: number,
    strategy: SalesStrategy = "HIFO",
  ): {
    cashRaised: number;
    realizedGains: number;
  } {
    if (targetAmount <= 0) return { cashRaised: 0, realizedGains: 0 };

    const totalValue = this.getTotalValue();
    if (targetAmount >= totalValue) {
      const gains = this.getTotalUnrealizedGains();
      this._lotCount = 0; // Wipe all lots
      return { cashRaised: totalValue, realizedGains: gains };
    }

    this.sortLots(strategy);

    let remainingCashNeeded = targetAmount;
    let realizedGains = 0;
    let cashRaised = 0;

    for (let i = 0; i < this._lotCount && remainingCashNeeded > 0; i++) {
      const shares = this._shares[i];
      const cbps = this._costBasisPerShare[i];
      const lotValue = shares * this.currentPricePerShare;

      if (lotValue <= remainingCashNeeded) {
        // Sell entire lot
        cashRaised += lotValue;
        const basis = shares * cbps;
        const gain = lotValue - basis;
        if (gain > 0) realizedGains += gain;

        remainingCashNeeded -= lotValue;
        this._shares[i] = 0; // mark for cleanup
      } else {
        // Sell partial lot
        const sharesToSell = remainingCashNeeded / this.currentPricePerShare;
        this._shares[i] -= sharesToSell;

        cashRaised += remainingCashNeeded;
        const basis = sharesToSell * cbps;
        const gain = remainingCashNeeded - basis;
        if (gain > 0) realizedGains += gain;

        remainingCashNeeded = 0;
      }
    }

    this.compactLots();

    return { cashRaised, realizedGains };
  }

  public applyStepUpInBasis(): void {
    for (let i = 0; i < this._lotCount; i++) {
      this._costBasisPerShare[i] = this.currentPricePerShare;
    }
  }

  private compactLots(): void {
    let writeIdx = 0;
    for (let readIdx = 0; readIdx < this._lotCount; readIdx++) {
      if (this._shares[readIdx] > 1e-6) {
        if (writeIdx !== readIdx) {
          this._shares[writeIdx] = this._shares[readIdx];
          this._costBasisPerShare[writeIdx] = this._costBasisPerShare[readIdx];
          this._yearPurchased[writeIdx] = this._yearPurchased[readIdx];
        }
        writeIdx++;
      }
    }
    this._lotCount = writeIdx;
  }

  // Simple insertion sort for parallel array movement (extremely fast since N < 100 usually)
  private sortLots(strategy: SalesStrategy): void {
    if (this._lotCount <= 1) return;

    for (let i = 1; i < this._lotCount; i++) {
      const s = this._shares[i];
      const c = this._costBasisPerShare[i];
      const y = this._yearPurchased[i];

      let j = i - 1;

      // Determine condition based on strategy
      let shouldSwap: boolean;
      while (j >= 0) {
        if (strategy === "HIFO") shouldSwap = this._costBasisPerShare[j] < c;
        else if (strategy === "LOFO")
          shouldSwap = this._costBasisPerShare[j] > c;
        else if (strategy === "FIFO") shouldSwap = this._yearPurchased[j] > y;
        else if (strategy === "LIFO") shouldSwap = this._yearPurchased[j] < y;
        else break;

        if (!shouldSwap) break;

        this._shares[j + 1] = this._shares[j];
        this._costBasisPerShare[j + 1] = this._costBasisPerShare[j];
        this._yearPurchased[j + 1] = this._yearPurchased[j];
        j--;
      }

      this._shares[j + 1] = s;
      this._costBasisPerShare[j + 1] = c;
      this._yearPurchased[j + 1] = y;
    }
  }
}
