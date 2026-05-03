/**
 * Monte Carlo orchestrator.
 *
 * Runs N stochastic paths + 1 deterministic baseline,
 * then aggregates percentile statistics per year.
 */

import { SimulationParams, MonteCarloResult, YearResult } from "../types";
import { runPath } from "./simulation";
import { getSurvivalProbability } from "./mortality";

/**
 * Linearly interpolate a percentile from a sorted array.
 * Matches NumPy's default "linear" method for smooth results at any N.
 */
const interpolatePercentile = (sorted: Float64Array, p: number): number => {
  const n = sorted.length;
  const idx = p * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, n - 1);
  const frac = idx - lo;
  return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
};

const getPercentiles = (arr: Float64Array, sortBuffer: Float64Array) => {
  sortBuffer.set(arr);
  sortBuffer.sort();

  // Count survivors robustly — scan all values, don't assume contiguous zeros
  let survivors = 0;
  for (let i = 0; i < sortBuffer.length; i++) {
    if (sortBuffer[i] > 0) survivors++;
  }

  return {
    p5: interpolatePercentile(sortBuffer, 0.05),
    p10: interpolatePercentile(sortBuffer, 0.1),
    p25: interpolatePercentile(sortBuffer, 0.25),
    median: interpolatePercentile(sortBuffer, 0.5),
    p75: interpolatePercentile(sortBuffer, 0.75),
    p90: interpolatePercentile(sortBuffer, 0.9),
    p95: interpolatePercentile(sortBuffer, 0.95),
    survivors,
  };
};

const getMedian = (arr: Float64Array, sortBuffer: Float64Array) => {
  sortBuffer.set(arr);
  sortBuffer.sort();
  return sortBuffer[Math.floor(sortBuffer.length * 0.5)];
};

const getAverage = (arr: Float64Array) => {
  if (arr.length === 0) return 0;
  let sum = 0;
  // Loop unrolling for sum
  const len = arr.length;
  let i = 0;
  for (; i <= len - 4; i += 4) {
    sum += arr[i] + arr[i + 1] + arr[i + 2] + arr[i + 3];
  }
  for (; i < len; i++) sum += arr[i];
  return sum / len;
};

export const runMonteCarlo = (
  params: SimulationParams,
  numSimulations: number = 20000,
): MonteCarloResult => {
  const duration = params.deathAge - params.currentAge + 1;
  const totalElements = numSimulations * duration;

  // 1. Allocate massive strided memory buffers upfront (13 typed arrays)
  const buffers = {
    path: new Float64Array(totalElements),
    salary: new Float64Array(totalElements),
    annualContrib: new Float64Array(totalElements),
    totalWithdrawal: new Float64Array(totalElements),
    taxPaid: new Float64Array(totalElements),
    annualInvestmentGain: new Float64Array(totalElements),
    taxablePath: new Float64Array(totalElements),
    deferredPath: new Float64Array(totalElements),
    deferredEquityPath: new Float64Array(totalElements),
    deferredBondPath: new Float64Array(totalElements),
    rothPath: new Float64Array(totalElements),
    hsaPath: new Float64Array(totalElements),
    inflationPath: new Float64Array(totalElements),
  };

  let failures = 0;

  // 2. Run Monte Carlo stochastic paths into the buffers
  for (let i = 0; i < numSimulations; i++) {
    const res = runPath(params, false, buffers, i, numSimulations);

    if (res.isBankrupt) {
      failures++;
    }
  }

  // 3. Run Deterministic (Baseline) in isolation using 1 size buffer
  const detBuffers = {
    path: new Float64Array(duration),
    salary: new Float64Array(duration),
    annualContrib: new Float64Array(duration),
    totalWithdrawal: new Float64Array(duration),
    taxPaid: new Float64Array(duration),
    annualInvestmentGain: new Float64Array(duration),
    taxablePath: new Float64Array(duration),
    deferredPath: new Float64Array(duration),
    deferredEquityPath: new Float64Array(duration),
    deferredBondPath: new Float64Array(duration),
    rothPath: new Float64Array(duration),
    hsaPath: new Float64Array(duration),
    inflationPath: new Float64Array(duration),
  };
  runPath(params, true, detBuffers, 0, 1);

  // 4. Aggregate Data transversally via zero-cost subarrays
  const data: YearResult[] = [];
  const sortBuffer = new Float64Array(numSimulations);

  let cumulativeMortalityWeightedFailuresPerYear = 0;
  let previousFailures = 0;

  for (let year = 0; year < duration; year++) {
    const age = params.currentAge + year;

    // Slice out the continuous block representing all simulations for THIS year
    const startIdx = year * numSimulations;
    const endIdx = startIdx + numSimulations;

    const yearWealth = buffers.path.subarray(startIdx, endIdx);
    const yearSalary = buffers.salary.subarray(startIdx, endIdx);
    const yearContrib = buffers.annualContrib.subarray(startIdx, endIdx);
    const yearWithdrawal = buffers.totalWithdrawal.subarray(startIdx, endIdx);
    const yearTax = buffers.taxPaid.subarray(startIdx, endIdx);
    const yearGain = buffers.annualInvestmentGain.subarray(startIdx, endIdx);

    const wealthStats = getPercentiles(yearWealth, sortBuffer);
    const averageWealth = getAverage(yearWealth);
    const medianSalary = getMedian(yearSalary, sortBuffer);
    const medianContrib = getMedian(yearContrib, sortBuffer);
    const medianWithdrawal = getMedian(yearWithdrawal, sortBuffer);
    const medianTax = getMedian(yearTax, sortBuffer);
    const medianGain = getMedian(yearGain, sortBuffer);

    const currentFailures = numSimulations - wealthStats.survivors;
    const newFailures = currentFailures - previousFailures;
    const survivalProb = getSurvivalProbability(params.currentAge, age);

    cumulativeMortalityWeightedFailuresPerYear += newFailures * survivalProb;
    previousFailures = currentFailures;

    const survivalRate = (wealthStats.survivors / numSimulations) * 100;
    const mortalityWeightedSuccessRate =
      ((numSimulations - cumulativeMortalityWeightedFailuresPerYear) /
        numSimulations) *
      100;

    data.push({
      age,
      p5: wealthStats.p5,
      p10: wealthStats.p10,
      p25: wealthStats.p25,
      median: wealthStats.median,
      average: averageWealth,
      p75: wealthStats.p75,
      p90: wealthStats.p90,
      p95: wealthStats.p95,
      deterministic: detBuffers.path[year],

      detTaxable: detBuffers.taxablePath[year],
      detDeferred: detBuffers.deferredPath[year],
      detRoth: detBuffers.rothPath[year],
      detHsa: detBuffers.hsaPath[year],
      detInflationMultiplier: detBuffers.inflationPath[year],

      survivalRate,
      mortalityWeightedSuccessRate,
      salary: medianSalary,
      totalContribution: medianContrib,
      annualInvestmentGain: medianGain,
      totalWithdrawal: medianWithdrawal,
      taxPaid: medianTax,
    });
  }

  const lastYearData = data[data.length - 1];

  // --- 4. Extract Scrubber Percentile Paths ---
  // Reconstruct longitudinal paths from the transverse strided arrays for the 99 target paths
  // 1st step: reconstruct the final terminal balances to sort
  const finalYearOffset = (duration - 1) * numSimulations;
  const terminalWealths = buffers.path.subarray(
    finalYearOffset,
    finalYearOffset + numSimulations,
  );

  const pathEndpoints = new Array(numSimulations);
  for (let idx = 0; idx < numSimulations; idx++) {
    const val = terminalWealths[idx];
    let depletionAge: number | null = null;
    let peakWealth = 0;

    for (let yr = 0; yr < duration; yr++) {
      const yrOffset = yr * numSimulations;
      const w = buffers.path[yrOffset + idx];
      if (w > peakWealth) peakWealth = w;
      if (w <= 0 && depletionAge === null && yr > 0) {
        depletionAge = params.currentAge + yr;
      }
    }
    pathEndpoints[idx] = { idx, val, depletionAge, peakWealth };
  }

  pathEndpoints.sort((a, b) => {
    if (a.val !== b.val) return a.val - b.val;

    // For ties (e.g. both went bankrupt), sorting by earlier depletion age (earlier = worse)
    if (a.depletionAge !== null && b.depletionAge !== null) {
      if (a.depletionAge !== b.depletionAge)
        return a.depletionAge - b.depletionAge;
    } else if (a.depletionAge !== null) {
      return -1;
    } else if (b.depletionAge !== null) {
      return 1;
    }

    // Secondary explicitly tied break: sort by peak net worth
    return a.peakWealth - b.peakWealth;
  });

  const percentilePaths: Record<number, number[]> = {};
  const percentileDetails: Record<
    number,
    {
      crashes: number;
      maxDrawdown: number;
      avgInflation: number;
      depletionAge: number | null;
    }
  > = {};

  for (let p = 1; p <= 99; p++) {
    const lowP = Math.max(0, p - 1);
    const highP = Math.min(100, p + 1);

    const lowIdx = Math.floor(pathEndpoints.length * (lowP / 100));
    const targetHighIdx = Math.floor(pathEndpoints.length * (highP / 100));
    // safe guard on boundaries
    const highIdx = Math.min(pathEndpoints.length - 1, targetHighIdx);

    const cohortSize = highIdx - lowIdx + 1;
    // Cache the indices array for fast lookups in the inner loop
    const cohortIndices = new Int32Array(cohortSize);
    for (let c = 0; c < cohortSize; c++) {
      cohortIndices[c] = pathEndpoints[lowIdx + c].idx;
    }

    // Reconstruct full path as the average of the cohort
    const wPath = new Float64Array(duration);
    let maxSoFar = 0;
    let maxDrawdown = 0;
    let crashes = 0;
    let depletionAge: number | null = null;

    for (let yr = 0; yr < duration; yr++) {
      const yrOffset = yr * numSimulations;
      let sum = 0;

      // extremely fast v8 continuous memory mapping array traversal
      for (let c = 0; c < cohortSize; c++) {
        sum += buffers.path[yrOffset + cohortIndices[c]];
      }

      const val = sum / cohortSize;
      wPath[yr] = val;

      if (val > maxSoFar) maxSoFar = val;

      if (maxSoFar > 0) {
        const drawdown = (maxSoFar - val) / maxSoFar;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }

      if (yr > 0) {
        const prevVal = wPath[yr - 1];
        if (prevVal > 0) {
          const drop = (prevVal - val) / prevVal;
          if (drop >= 0.15) crashes++;
        }
      }

      if (val <= 0 && depletionAge === null && yr > 0) {
        depletionAge = params.currentAge + yr;
      }
    }

    percentilePaths[p] = Array.from(wPath);
    percentileDetails[p] = {
      crashes,
      maxDrawdown,
      avgInflation: params.inflationRate,
      depletionAge,
    };
  }

  return {
    data,
    successRate: ((numSimulations - failures) / numSimulations) * 100,
    mortalityWeightedSuccessRate:
      ((numSimulations - cumulativeMortalityWeightedFailuresPerYear) /
        numSimulations) *
      100,
    medianTerminalWealth: lastYearData.median,
    worstCaseTerminalWealth: lastYearData.p10,
    deterministicTerminalWealth: lastYearData.deterministic,
    simulationsRun: numSimulations,
    percentilePaths,
    percentileDetails,
  };
};
