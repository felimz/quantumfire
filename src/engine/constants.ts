/**
 * Engine-level constants extracted from simulation.ts.
 *
 * Centralises all "magic numbers" so that parameter choices
 * and heuristic assumptions are documented in one place.
 */

// ── Asset-class risk profiles (relative to base meanReturn / volatility) ──

/** Roth IRA: same return profile as base equity */
export const ROTH_MEAN_BOOST = 0.0;
/** Roth IRA: same volatility as base equity */
export const ROTH_VOL_MULT = 1.0;

/** Taxable brokerage: same return profile as base equity */
export const TAXABLE_MEAN_BOOST = 0.0;
/** Taxable brokerage: same volatility as base equity */
export const TAXABLE_VOL_MULT = 1.0;

// ── Simulation heuristics ──

/** Assumed cost-basis ratio on pre-existing ("legacy") taxable lots */
export const LEGACY_COST_BASIS_RATIO = 0.7;

/** Heuristic: ~30% of brokerage balance is unrealized gains (simple-tax mode) */
export const GAINS_FRACTION_HEURISTIC = 0.3;

/** Heuristic: assumed 15% effective tax rate for deferred gross-up */
export const EFFECTIVE_TAX_RATE_HEURISTIC = 0.15;

/** 5% over-sale buffer to cover capital-gains tax on taxable withdrawals */
export const TAX_BUFFER_MULTIPLIER = 1.05;

// ── Glidepath ──

/** Number of years over which the linear equity→bond transition occurs */
export const GLIDEPATH_TRANSITION_YEARS = 15;

// ── Healthcare / Inflation ──

/** CPI + 2% proxy used when no explicit healthcare inflation rate is set */
export const HEALTHCARE_INFLATION_ADDER = 0.02;

/** Hard floor preventing unrealistic persistent deflation spirals */
export const INFLATION_FLOOR = -0.02;

// ── Cash buffer ──

/** Replenish cash buffer only when equity return exceeds this threshold */
export const CASH_BUFFER_REPLENISH_THRESHOLD = 0.05;

/** Target cash buffer size expressed as a multiple of annual spending */
export const CASH_BUFFER_TARGET_YEARS = 2;

/** Symmetric inflation ceiling to prevent unrealistic hyperinflation spirals */
export const INFLATION_CEILING = 0.12;
