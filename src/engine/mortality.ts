/**
 * mortality.ts - Actuarial Survival Models
 *
 * Provides Gompertz-Makeham approximations of human mortality
 * to weight sequence-of-return failures by the actual probability
 * of living to experience them.
 */

export function getSurvivalProbability(
  currentAge: number,
  targetAge: number,
): number {
  if (targetAge <= currentAge) return 1.0;

  // Typical Gompertz-Makeham parameters for adult human mortality
  const A = 0.0005; // Makeham term (age-independent accidents/shocks)
  const B = 0.000035; // Gompertz base (baseline biological aging rate)
  const C = 0.09; // Gompertz exponential growth (mortality risk doubles roughly every 8 years)

  const duration = targetAge - currentAge;

  const term1 = A * duration;
  const term2 = (B / C) * (Math.exp(C * targetAge) - Math.exp(C * currentAge));

  const cumulativeHazard = term1 + term2;

  return Math.exp(-cumulativeHazard);
}
