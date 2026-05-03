/**
 * IRS Required Minimum Distribution (RMD) logic.
 *
 * Uses the actual Uniform Lifetime Table (updated for SECURE 2.0 Act,
 * effective 2024+) rather than a linear approximation.
 */

/**
 * IRS Uniform Lifetime Table — divisor by age.
 * Source: IRS Publication 590-B, Table III (2024+).
 * Under SECURE 2.0 Act (born 1960+), RMDs begin at age 75.
 * Entries below 75 are omitted since getRMDDivisor returns 0 for those ages.
 */
const UNIFORM_LIFETIME_TABLE: Record<number, number> = {
  75: 24.6,
  76: 23.7,
  77: 22.9,
  78: 22.0,
  79: 21.1,
  80: 20.2,
  81: 19.4,
  82: 18.5,
  83: 17.7,
  84: 16.8,
  85: 16.0,
  86: 15.2,
  87: 14.4,
  88: 13.7,
  89: 12.9,
  90: 12.2,
  91: 11.5,
  92: 10.8,
  93: 10.1,
  94: 9.5,
  95: 8.9,
  96: 8.4,
  97: 7.8,
  98: 7.3,
  99: 6.8,
  100: 6.4,
  101: 6.0,
  102: 5.6,
  103: 5.2,
  104: 4.9,
  105: 4.6,
  106: 4.3,
  107: 4.1,
  108: 3.9,
  109: 3.7,
  110: 3.5,
  111: 3.4,
  112: 3.3,
  113: 3.1,
  114: 3.0,
  115: 2.9,
};

/** SECURE 2.0 Act RMD start age (born 1960+). */
const RMD_START_AGE = 75;

/**
 * Returns the RMD divisor for a given age, or 0 if RMDs have not started.
 *
 * For ages beyond the table maximum (116+), returns 2.0 as a minimum floor.
 */
export const getRMDDivisor = (age: number): number => {
  if (age < RMD_START_AGE) return 0;

  const tableValue = UNIFORM_LIFETIME_TABLE[age];
  if (tableValue !== undefined) return tableValue;

  // Ages beyond the table (116+): floor at 2.0
  return 2.0;
};
