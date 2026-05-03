/**
 * Pure mathematical utilities for the simulation engine.
 * No financial domain logic — only statistics and distributions.
 */

let cachedZ: number | null = null;

/**
 * Fast approximation of Math.exp(x) using Schryer's algorithm.
 * Significantly faster than Math.exp in V8 for x near 0 (< 30% error on tails).
 * Used only in the Monte Carlo hot path for market factors where ultra-precision
 * is superseded by massive scale law of large numbers.
 */
export const fastExp = (x: number): number => {
  // e^x ≈ (1 + x/256)^256
  // This is highly accurate for small x (like annual returns).
  x = 1.0 + x / 256.0;
  x *= x;
  x *= x;
  x *= x;
  x *= x;
  x *= x;
  x *= x;
  x *= x;
  x *= x;
  return x;
};

/**
 * Box-Muller transform for generating normally distributed random numbers.
 * Generates two values simultaneously and caches one for the next call to halve performance overhead.
 * @returns A sample from N(mean, stdev²)
 */
export const gaussianRandom = (mean: number, stdev: number): number => {
  if (cachedZ !== null) {
    const tmp = cachedZ;
    cachedZ = null;
    return tmp * stdev + mean;
  }

  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();

  const common = Math.sqrt(-2.0 * Math.log(u));
  const z = common * Math.cos(2.0 * Math.PI * v);
  cachedZ = common * Math.sin(2.0 * Math.PI * v);

  return z * stdev + mean;
};

/**
 * Generates a random number from a Poisson distribution.
 * Used for simulating the occurrences of rare events (jumps).
 * @param lambda The expected number of events (mean)
 * @returns Number of events
 */
export const poissonRandom = (lambda: number): number => {
  const L = Math.exp(-lambda);
  let p = 1.0;
  let k = 0;

  do {
    k++;
    p *= Math.random();
  } while (p > L);

  return k - 1;
};

/**
 * Converts an arithmetic mean return and volatility into a single-period
 * lognormal growth factor, shocked by the given z-score.
 *
 * @param mean      Arithmetic mean return (e.g. 0.10 for 10%)
 * @param volatility Annual volatility (e.g. 0.17)
 * @param zScore    Standard normal shock (0 = expected, negative = crash)
 * @returns Growth factor (e.g. 1.07 means +7% this period)
 */
export const getMarketFactor = (
  mean: number,
  volatility: number,
  zScore: number,
): number => {
  if (volatility === 0) return 1 + mean;

  const mu = Math.log1p(mean); // faster and more precise than Math.log(1 + x)
  const sigma = volatility;
  const drift = mu - 0.5 * (sigma * sigma);
  const shock = sigma * zScore;
  return fastExp(drift + shock);
};

/**
 * Deterministic geometric mean approximation.
 * Accounts for volatility drag: geometric ≈ arithmetic × e^(-σ²/2)
 *
 * @returns Growth factor (e.g. 1.08 means +8% annualized)
 */
export const getGeometricRate = (mean: number, volatility: number): number => {
  return (1 + mean) * Math.exp(-0.5 * volatility * volatility);
};

/**
 * Merton Jump-Diffusion model for simulating asset returns with rare crashes.
 * Combines continuous lognormal drift with discrete Poisson-distributed jumps.
 *
 * @param mean Continuous arithmetic mean return
 * @param volatility Continuous annual volatility
 * @param zScore Standard normal shock for the continuous component
 * @param jumpIntensity Expected number of jumps per period (lambda)
 * @param jumpMean Average size of the jump (e.g., -0.20 for a 20% crash)
 * @param jumpVol Volatility of the jump size
 * @returns Growth factor for the period
 */
export const getJumpDiffusionFactor = (
  mean: number,
  volatility: number,
  zScore: number,
  jumpIntensity: number,
  jumpMean: number,
  jumpVol: number,
): number => {
  if (volatility === 0 && jumpIntensity === 0) return 1 + mean;

  // 1. Continuous Component (Brownian Motion)
  // Adjust the continuous drift to compensate for the expected jump impact
  // so the overall expected return equals `mean`.
  // E[Jump term] = exp(lambda * (exp(mu_j + sigma_j^2 / 2) - 1))
  const jumpCompensator =
    jumpIntensity * (Math.exp(jumpMean + 0.5 * jumpVol * jumpVol) - 1);
  const continuousMu = Math.log(1 + mean) - jumpCompensator;

  const continuousDrift = continuousMu - 0.5 * (volatility * volatility);
  const continuousShock = volatility * zScore;

  // 2. Jump Component (Compound Poisson Process)
  const numJumps = poissonRandom(jumpIntensity);
  let aggregateJumpShock = 0;

  for (let i = 0; i < numJumps; i++) {
    // Each jump size is lognormally distributed
    aggregateJumpShock += gaussianRandom(jumpMean, jumpVol);
  }

  return Math.exp(continuousDrift + continuousShock + aggregateJumpShock);
};
