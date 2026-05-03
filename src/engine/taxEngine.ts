/**
 * taxEngine.ts - Advanced US Tax Simulator (Progressive brackets, Capital gains stacking, IRMAA, NIIT)
 *
 * Note: Tax brackets are dynamically adjusted for inflation in the main simulation loop.
 * This module purely calculates tax given nominal brackets for the year.
 */

// Simplified 2026 Single Filer nominal brackets
export const BRACKETS_INCOME = [
  { max: 12400, rate: 0.1 },
  { max: 50400, rate: 0.12 },
  { max: 105700, rate: 0.22 },
  { max: 201775, rate: 0.24 },
  { max: 256225, rate: 0.32 },
  { max: 640600, rate: 0.35 },
  { max: Infinity, rate: 0.37 },
];

// Long-Term Capital Gains brackets stack ON TOP of ordinary income
export const BRACKETS_LTCG = [
  { max: 49450, rate: 0.0 },
  { max: 545500, rate: 0.15 },
  { max: Infinity, rate: 0.2 },
];

export const STANDARD_DEDUCTION_SINGLE = 16100;

/**
 * Net Investment Income Tax (NIIT)
 * 3.8% surcharge on investment income when MAGI exceeds threshold.
 */
export const NIIT_THRESHOLD_SINGLE = 200000;
export const NIIT_RATE = 0.038;

/**
 * Calculates the amount of Social Security benefits subject to federal income tax.
 * IRS phases in taxation up to 85% based on "Combined Income" (MAGI + 50% of SS).
 */
export const calculateTaxableSS = (
  ssBenefit: number,
  otherIncome: number,
  inflationMult: number = 1.0,
): number => {
  const combinedIncome = otherIncome + 0.5 * ssBenefit;

  // Single Filer thresholds
  const baseAmount = 25000 * inflationMult;
  const upperAmount = 34000 * inflationMult;

  if (combinedIncome <= baseAmount) {
    return 0;
  }

  let taxable = 0;
  if (combinedIncome > baseAmount) {
    const amountOverBase = Math.min(combinedIncome, upperAmount) - baseAmount;
    taxable += amountOverBase * 0.5;
  }

  if (combinedIncome > upperAmount) {
    const amountOverUpper = combinedIncome - upperAmount;
    taxable += amountOverUpper * 0.85;
  }

  // Maximum taxable amount is 85% of the total benefit
  return Math.min(taxable, ssBenefit * 0.85);
};

/**
 * Calculates total federal tax incorporating ordinary income and capital gains correctly stacked.
 */
export const calculateTaxes = (
  ordinaryIncome: number,
  ltcg: number,
  inflationMult: number = 1.0,
): {
  ordinaryTax: number;
  cgTax: number;
  niit: number;
  totalTax: number;
  effectiveRate: number;
} => {
  const stdDed = STANDARD_DEDUCTION_SINGLE * inflationMult;

  // Taxable Ordinary Income (cannot be < 0)
  const taxableOrdinary = Math.max(0, ordinaryIncome - stdDed);
  let remainingOrd = taxableOrdinary;
  let ordinaryTax = 0;
  let ordFloor = 0;

  for (const bracket of BRACKETS_INCOME) {
    const adjustedMax = bracket.max * inflationMult;
    const bracketSpan = adjustedMax - ordFloor;

    if (remainingOrd > 0) {
      const taxableInBracket = Math.min(remainingOrd, bracketSpan);
      ordinaryTax += taxableInBracket * bracket.rate;
      remainingOrd -= taxableInBracket;
    }
    ordFloor = adjustedMax;
  }

  // Capital Gains stack on top of ordinary income
  // E.g., if you have 80k ordinary and 30k LTCG, the first 14k of LTCG is at 0%,
  // the remaining 16k is at 15%.
  let remainingCG = ltcg;
  let cgTax = 0;
  // What is our "current floor" after ordinary income filled up the bottom?
  let cgFloor = taxableOrdinary;

  for (const bracket of BRACKETS_LTCG) {
    const adjustedMax = bracket.max * inflationMult;

    // If the cgFloor is already above this bracket's max, skip it.
    if (cgFloor >= adjustedMax) continue;

    const availableSpaceInBracket = adjustedMax - cgFloor;

    if (remainingCG > 0) {
      const cgInBracket = Math.min(remainingCG, availableSpaceInBracket);
      cgTax += cgInBracket * bracket.rate;
      remainingCG -= cgInBracket;
      cgFloor += cgInBracket;
    }
  }

  // Calculate Net Investment Income Tax (NIIT)
  let niit = 0;
  const magi = ordinaryIncome + ltcg; // Simplified MAGI
  const adjustedNiitThreshold = NIIT_THRESHOLD_SINGLE * inflationMult;

  if (magi > adjustedNiitThreshold) {
    const excessMagi = magi - adjustedNiitThreshold;
    niit = Math.min(excessMagi, ltcg) * NIIT_RATE;
  }

  const totalTax = ordinaryTax + cgTax + niit;
  const effectiveRate = magi > 0 ? totalTax / magi : 0;

  return { ordinaryTax, cgTax, niit, totalTax, effectiveRate };
};
