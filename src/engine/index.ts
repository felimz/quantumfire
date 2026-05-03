/**
 * Barrel export for the simulation engine.
 */

export { gaussianRandom, getMarketFactor, getGeometricRate } from "./math";
export { getRMDDivisor } from "./rmd";
export { runPath } from "./simulation";
export type { PathResult } from "./simulation";
export { runMonteCarlo } from "./monteCarlo";
export * from "./constants";
