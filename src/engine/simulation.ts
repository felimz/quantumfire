/**
 * Single-path simulator for the retirement model.
 *
 * Runs one timeline (deterministic or stochastic) from currentAge → deathAge,
 * tracking three account buckets (taxable, deferred, Roth), contributions,
 * withdrawals, and RMDs.
 */

import { SimulationParams } from "../types";
import {
  gaussianRandom,
  getMarketFactor,
  getGeometricRate,
  getJumpDiffusionFactor,
} from "./math";
import { generateCorrelatedShocks } from "./dependence";
import { getRMDDivisor } from "./rmd";
import { TaxableLotTracker } from "./portfolio";
import { calculateTaxes, calculateTaxableSS } from "./taxEngine";
import {
  FixedRealSpending,
  GuytonKlingerSpending,
  VanguardDynamicSpending,
} from "./spending";
import { HealthEngine } from "./healthcare";
import {
  ROTH_MEAN_BOOST,
  ROTH_VOL_MULT,
  TAXABLE_MEAN_BOOST,
  TAXABLE_VOL_MULT,
  LEGACY_COST_BASIS_RATIO,
  GAINS_FRACTION_HEURISTIC,
  EFFECTIVE_TAX_RATE_HEURISTIC,
  TAX_BUFFER_MULTIPLIER,
  GLIDEPATH_TRANSITION_YEARS,
  HEALTHCARE_INFLATION_ADDER,
  INFLATION_FLOOR,
  CASH_BUFFER_REPLENISH_THRESHOLD,
  CASH_BUFFER_TARGET_YEARS,
  INFLATION_CEILING,
} from "./constants";

export interface SimulationBuffers {
  path: Float64Array;
  salary: Float64Array;
  annualContrib: Float64Array;
  totalWithdrawal: Float64Array;
  taxPaid: Float64Array;
  annualInvestmentGain: Float64Array;
  taxablePath: Float64Array;
  deferredPath: Float64Array;
  deferredEquityPath: Float64Array;
  deferredBondPath: Float64Array;
  rothPath: Float64Array;
  hsaPath: Float64Array;
  inflationPath: Float64Array;
}

export interface PathResult {
  isBankrupt: boolean;
  bankruptcyAge: number | null;
  estateValue: number; // Terminal value after inherited taxes and step-up basis
}

// ── Helpers to eliminate duplicated patterns inside runPath ──

interface DeferredState {
  deferredEquity: number;
  deferredBond: number;
  deferredTotal: number;
}

/**
 * Withdraw `amount` from the deferred bucket, splitting proportionally
 * across the equity and bond sub-accounts.
 * Mutates `state` in place.
 */
function withdrawFromDeferred(amount: number, state: DeferredState): void {
  const eqRatio =
    state.deferredTotal > 0 ? state.deferredEquity / state.deferredTotal : 0;
  state.deferredEquity -= amount * eqRatio;
  state.deferredBond -= amount * (1 - eqRatio);
  state.deferredTotal -= amount;
}

/**
 * Compute income tax on ordinary income and/or capital gains,
 * dispatching to the progressive tax engine when enabled.
 */
function computeIncomeTax(
  ordinaryIncome: number,
  capitalGains: number,
  flatIncomeRate: number,
  flatCapGainsRate: number,
  cumulativeInflation: number,
  useAdvanced: boolean,
): { incomeTax: number; cgTax: number; totalTax: number } {
  if (useAdvanced) {
    const res = calculateTaxes(
      ordinaryIncome,
      capitalGains,
      cumulativeInflation,
    );
    return {
      incomeTax: res.ordinaryTax,
      cgTax: res.cgTax,
      totalTax: res.totalTax,
    };
  }
  const incomeTax = ordinaryIncome * flatIncomeRate;
  const cgTax = capitalGains * flatCapGainsRate;
  return { incomeTax, cgTax, totalTax: incomeTax + cgTax };
}

export const runPath = (
  params: SimulationParams,
  isDeterministic: boolean,
  buffers?: SimulationBuffers,
  simIndex: number = 0,
  numSimulations: number = 1,
): PathResult & SimulationBuffers => {
  const {
    currentAge,
    retirementAge,
    deathAge,
    salaryGrowth,
    inflationRate,
    contribution401k,
    contributionRoth,
    contributionBrokerage,
    companyMatchRate,
    companyDiscretionaryRate,
    retirementSpendReplacement,
    initialWithdrawalRate,
    withdrawalStrategy,
    spendingPolicy,
    meanReturn,
    volatility,
    taxRateIncome,
    taxRateCapGains,
    taxDragBrokerage,

    socialSecurityMonthly,
    socialSecurityAge,
    pensionEnabled,
    pensionMonthly,
    pensionStartAge,
    pensionInflationAdjusted,

    realEstateDownsizeEnabled,
    realEstateDownsizeAge,
    realEstateDownsizeNetProceeds,

    healthcareEnabled,
    healthcareAnnualBaseCost,
    healthcareInflationRate,
    ltcShockEnabled,
    ltcShockLifetimeProbability,
    ltcShockAnnualCost,
    ltcShockDuration,
    ltcShockStartAge,

    gkCapitalPreservationThreshold,
    gkProsperityThreshold,
    gkAdjustmentRate,

    vanguardCeilingPct,
    vanguardFloorPct,

    cashBufferEnabled,
    cashBufferTargetYield,
    cashBufferEquityDropTrigger,

    rothConversionEnabled,
    rothConversionAmount,
    rothConversionEndAge,

    stochasticInflationEnabled,
    inflationReversionSpeed,
    inflationVolatility,

    jumpDiffusionEnabled,
    jumpIntensity,
    jumpMean,
    jumpVol,

    copulaEnabled,
    copulaTheta,

    bondAllocation,
    bondMeanReturn,
    bondVolatility,
    glidepathEnabled,

    advancedTaxEnabled,
    stepUpInBasisEnabled,
    heirTaxRate,

    taxAwareBracketFill,
    taxAwareBracketCap,
    proportionalWithdrawals,
  } = params;

  const taxableLots = new TaxableLotTracker(
    params.taxable,
    LEGACY_COST_BASIS_RATIO,
  );
  let taxable = params.taxable; // Keep for quick reference, but sync with tracker
  // When glidepath is enabled, start at 100% equity — bonds are introduced
  // gradually as retirement approaches. When disabled, use the static allocation.
  const initialBondPct = glidepathEnabled ? 0 : bondAllocation;
  let deferredEquity = params.deferred * (1 - initialBondPct);
  let deferredBond = params.deferred * initialBondPct;
  let roth = params.roth;
  let cashBuffer = params.cashBuffer;
  let hsa = params.hsa; // HSA: triple-tax advantaged, grows tax-free, funds medical tax-free

  let currentSalary = params.salary;
  let current401kContrib = contribution401k;
  let currentRothContrib = contributionRoth;
  let currentBrokerageContrib = contributionBrokerage;
  let currentHSAContrib = params.contributionHSA;

  let initialWithdrawalRateBaseline = 0;
  let cumulativeInflation = 1.0;
  let cumulativeHealthcareInflation = 1.0;
  let currentInflationRate = inflationRate;

  const duration = deathAge - currentAge + 1;

  // We are now writing directly to pre-allocated strided 1D buffers passed from runMonteCarlo
  // Data layout: values for a given year are contiguous (e.g. year 0 is 0 -> numSimulations-1)

  // If buffers are not provided (e.g., in unit tests), create a local set
  const actualBuffers = buffers || {
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

  const getStrideIdx = (yr: number) => yr * numSimulations + simIndex;

  // Previous year's withdrawal for dynamic spending policies
  let previousNominalWithdrawal = 0;
  let initialPortfolioValue = 0;

  let isBankrupt = false;
  let bankruptcyAge: number | null = null;

  // --- Asset Class Profiles ---
  let rothMean = meanReturn;
  let rothVol = volatility;
  let taxableMean = meanReturn;
  let taxableVol = volatility;

  // If these constants exist and are imported, we can apply them:
  // (Assuming ROTH_MEAN_BOOST, ROTH_VOL_MULT, etc. were defined somewhere and we want to use them)
  rothMean += ROTH_MEAN_BOOST;
  rothVol *= ROTH_VOL_MULT;
  taxableMean += TAXABLE_MEAN_BOOST;
  taxableVol *= TAXABLE_VOL_MULT;

  // Deferred: Split into Equity and Bond
  const deferredEqMean = meanReturn;
  const deferredEqVol = volatility;

  // Initialize HealthEngine (determines if and when LTC shock hits this path)
  const healthEngine = new HealthEngine(
    ltcShockEnabled,
    ltcShockLifetimeProbability,
    ltcShockAnnualCost,
    ltcShockDuration,
    ltcShockStartAge,
    isDeterministic,
  );

  // Initialize the specific spending policy
  let spendingEngine = new FixedRealSpending();
  if (spendingPolicy === "guytonKlinger") {
    spendingEngine = new GuytonKlingerSpending(
      gkCapitalPreservationThreshold,
      gkProsperityThreshold,
      gkAdjustmentRate,
    );
  } else if (spendingPolicy === "vanguardDynamic") {
    spendingEngine = new VanguardDynamicSpending(
      vanguardCeilingPct,
      vanguardFloorPct,
    );
  }

  // Keep a running tracker of nominal flow per year
  // Since we record the START of the year, we want to log the "previous year's" flows
  // For year 0, flow is exactly 0.
  let prevYearNominalContrib = 0;
  let prevYearNominalWithdrawal = 0;
  let prevYearNominalTaxPaid = 0;
  let prevYearNominalInvestmentGain: number;

  for (let year = 0; year < duration; year++) {
    const age = currentAge + year;

    let deferredTotal = deferredEquity + deferredBond;
    const preGrowthTotal = taxable + deferredTotal + roth;

    // --- 1. Economic Environment (Stochastic Inflation & Market Shocks) ---
    // Applied BEFORE the snapshot so that year T's snapshot reflects T years of compounding.
    // Year 0 is skipped: snapshot === user's literal starting inputs.
    let deferredEqGrowthFactor = 1.0;

    if (year > 0) {
      if (isDeterministic || !stochasticInflationEnabled) {
        currentInflationRate = inflationRate;
      } else {
        // Vasicek / Ornstein-Uhlenbeck Process for Inflation
        // dr = a(b-r)dt + sigma*dW
        const dw = gaussianRandom(0, 1);
        const dr =
          inflationReversionSpeed * (inflationRate - currentInflationRate) +
          inflationVolatility * dw;
        currentInflationRate += dr;
      }

      currentInflationRate = Math.max(currentInflationRate, INFLATION_FLOOR);
      currentInflationRate = Math.min(currentInflationRate, INFLATION_CEILING);

      // Correlated Market Shocks (4 Assets: Taxable, Def-Eq, Def-Bond, Roth)
      let shocks: number[];
      if (isDeterministic) {
        shocks = [0, 0, 0, 0];
      } else if (copulaEnabled) {
        shocks = generateCorrelatedShocks(copulaTheta, 4);
      } else {
        const zScore = gaussianRandom(0, 1);
        const bondZScore = gaussianRandom(0, 1);
        shocks = [zScore, zScore, bondZScore, zScore];
      }

      const [taxableZ, deferredEqZ, deferredBondZ, rothZ] = shocks;

      let taxableGrowthFactor: number;
      let deferredBondGrowthFactor: number;
      let rothGrowthFactor: number;

      if (isDeterministic) {
        deferredEqGrowthFactor = getGeometricRate(
          deferredEqMean,
          deferredEqVol,
        );
        deferredBondGrowthFactor = getGeometricRate(
          bondMeanReturn,
          bondVolatility,
        );
        rothGrowthFactor = getGeometricRate(rothMean, rothVol);
        taxableGrowthFactor = getGeometricRate(taxableMean, taxableVol);
      } else if (jumpDiffusionEnabled) {
        deferredEqGrowthFactor = getJumpDiffusionFactor(
          deferredEqMean,
          deferredEqVol,
          deferredEqZ,
          jumpIntensity,
          jumpMean,
          jumpVol,
        );
        deferredBondGrowthFactor = getJumpDiffusionFactor(
          bondMeanReturn,
          bondVolatility,
          deferredBondZ,
          0,
          0,
          0,
        ); // Bonds don't jump like equities
        rothGrowthFactor = getJumpDiffusionFactor(
          rothMean,
          rothVol,
          rothZ,
          jumpIntensity,
          jumpMean,
          jumpVol,
        );
        taxableGrowthFactor = getJumpDiffusionFactor(
          taxableMean,
          taxableVol,
          taxableZ,
          jumpIntensity,
          jumpMean,
          jumpVol,
        );
      } else {
        deferredEqGrowthFactor = getMarketFactor(
          deferredEqMean,
          deferredEqVol,
          deferredEqZ,
        );
        deferredBondGrowthFactor = getMarketFactor(
          bondMeanReturn,
          bondVolatility,
          deferredBondZ,
        );
        rothGrowthFactor = getMarketFactor(rothMean, rothVol, rothZ);
        taxableGrowthFactor = getMarketFactor(
          taxableMean,
          taxableVol,
          taxableZ,
        );
      }
      cumulativeInflation *= 1 + currentInflationRate;

      // Healthcare inflation is generally structural, sticky, and runs hotter than core CPI.
      const currentHCInflation = Math.max(
        0,
        currentInflationRate + HEALTHCARE_INFLATION_ADDER,
      );
      cumulativeHealthcareInflation *=
        1 + (healthcareEnabled ? healthcareInflationRate : currentHCInflation);

      const netTaxableGrowth = taxableGrowthFactor - taxDragBrokerage;

      taxableLots.applyGrowth(netTaxableGrowth);
      taxable = taxableLots.getTotalValue();
      deferredEquity *= deferredEqGrowthFactor;
      deferredBond *= deferredBondGrowthFactor;
      roth *= rothGrowthFactor;
      cashBuffer *= 1 + cashBufferTargetYield;
      hsa *= deferredEqGrowthFactor;

      // Salary & contribution growth — must happen alongside inflation so that
      // currentSalary / cumulativeInflation stays consistent in the snapshot.
      //
      // Design: Salary and brokerage contributions grow with salaryGrowth (user-specified nominal).
      // 401k, Roth, and HSA contributions grow with currentInflationRate (which may be
      // stochastic). This mirrors IRS contribution limits which are CPI-indexed, not
      // salary-indexed. In volatile inflation environments, these rates can diverge.
      if (age < retirementAge) {
        currentSalary *= 1 + salaryGrowth;
        currentBrokerageContrib *= 1 + salaryGrowth;
        current401kContrib *= 1 + currentInflationRate;
        currentRothContrib *= 1 + currentInflationRate;
        currentHSAContrib *= 1 + currentInflationRate;
      }
    } // End if (year > 0)

    deferredTotal = deferredEquity + deferredBond;

    // Glidepath Rebalancing
    // When enabled, the portfolio starts at 100% equity (0% bonds) and linearly
    // shifts toward the user's configured bondAllocation over the
    // GLIDEPATH_TRANSITION_YEARS before retirement. This matches Target-Date
    // Fund behavior and the UI tooltip: "If Dynamic Glidepath is enabled,
    // [Bond Allocation] becomes the target allocation at retirement age."
    //
    // When bondAllocation = 0%, startEquity = targetEquity = 1.0 → no-op.
    if (year > 0 && glidepathEnabled && deferredTotal > 0) {
      const yearsToRetirement = Math.max(0, retirementAge - age);
      const glidepathDuration = GLIDEPATH_TRANSITION_YEARS;

      // Start fully in equities; glide toward the user's bond target at retirement
      const startEquity = 1.0; // 100% equity at accumulation start
      const targetEquity = 1 - bondAllocation; // bondAllocation is the retirement target

      let targetEquityPct = startEquity;

      if (yearsToRetirement === 0) {
        // At or past retirement — hold steady at the target
        targetEquityPct = targetEquity;
      } else if (yearsToRetirement < glidepathDuration) {
        // Within the transition window — linearly interpolate
        const totalShift = startEquity - targetEquity;
        const progress =
          (glidepathDuration - yearsToRetirement) / glidepathDuration;
        targetEquityPct = startEquity - totalShift * progress;
      }
      // else: too far from retirement, stay at startEquity (100%)

      deferredEquity = deferredTotal * targetEquityPct;
      deferredBond = deferredTotal * (1 - targetEquityPct);
      deferredTotal = deferredEquity + deferredBond;
    }

    const postGrowthTotal = taxable + deferredTotal + roth + cashBuffer;
    prevYearNominalInvestmentGain = postGrowthTotal - preGrowthTotal;

    // --- SNAPSHOT & RECORD (After Growth, Before Cash Flows) ---
    // Year 0: no growth was applied, so snapshot === user's literal starting inputs.
    // Year T (T>0): snapshot reflects T years of compounding + inflation.
    let totalNetWorthStart = taxable + deferredTotal + roth + hsa + cashBuffer;
    if (totalNetWorthStart < 0) totalNetWorthStart = 0;

    const idx = getStrideIdx(year);
    actualBuffers.path[idx] = totalNetWorthStart / cumulativeInflation;
    actualBuffers.salary[idx] = currentSalary / cumulativeInflation;

    // For cash flow metrics, record what happened between exactly T-1 and T
    actualBuffers.annualContrib[idx] =
      prevYearNominalContrib / cumulativeInflation;
    actualBuffers.totalWithdrawal[idx] =
      prevYearNominalWithdrawal / cumulativeInflation;
    actualBuffers.taxPaid[idx] = prevYearNominalTaxPaid / cumulativeInflation;
    actualBuffers.annualInvestmentGain[idx] =
      prevYearNominalInvestmentGain / cumulativeInflation;

    // Combine taxable and cashBuffer for reporting
    actualBuffers.taxablePath[idx] =
      (taxable + cashBuffer) / cumulativeInflation;
    actualBuffers.deferredPath[idx] = deferredTotal / cumulativeInflation;
    actualBuffers.deferredEquityPath[idx] =
      deferredEquity / cumulativeInflation;
    actualBuffers.deferredBondPath[idx] = deferredBond / cumulativeInflation;
    actualBuffers.rothPath[idx] = roth / cumulativeInflation;
    actualBuffers.hsaPath[idx] = hsa / cumulativeInflation;
    actualBuffers.inflationPath[idx] = cumulativeInflation;

    if (totalNetWorthStart === 0 && age < deathAge) {
      isBankrupt = true;
      if (bankruptcyAge === null) bankruptcyAge = age;
    }

    prevYearNominalContrib = 0;
    prevYearNominalWithdrawal = 0;
    prevYearNominalTaxPaid = 0;

    // --- REAL ESTATE DOWNSIZING EVENT ---
    if (realEstateDownsizeEnabled && age === realEstateDownsizeAge) {
      // Assuming the proceeds appreciate with inflation for simplicity before the sale
      const localizedProceeds =
        realEstateDownsizeNetProceeds * cumulativeInflation;
      taxableLots.addContribution(localizedProceeds, year);
      taxable = taxableLots.getTotalValue();
    }

    if (age < retirementAge) {
      // --- ACCUMULATION ---
      // retirementAge is the FIRST retired year.

      const matchAmount = currentSalary * companyMatchRate;
      const discretionaryAmount = currentSalary * companyDiscretionaryRate;
      const totalCompanyAmount = matchAmount + discretionaryAmount;

      // Contributions go into deferred pool, allocated based on current ratio
      const newDeferredCore = current401kContrib + totalCompanyAmount;
      const currentEquityPct =
        deferredTotal > 0 ? deferredEquity / deferredTotal : 1 - bondAllocation;

      deferredEquity += newDeferredCore * currentEquityPct;
      deferredBond += newDeferredCore * (1 - currentEquityPct);
      deferredTotal += newDeferredCore;

      roth += currentRothContrib;
      hsa += currentHSAContrib;

      if (currentBrokerageContrib > 0) {
        taxableLots.addContribution(currentBrokerageContrib, year);
        taxable = taxableLots.getTotalValue();
      }

      prevYearNominalContrib =
        current401kContrib +
        totalCompanyAmount +
        currentRothContrib +
        currentBrokerageContrib +
        currentHSAContrib;
    } else {
      // --- RETIREMENT (age >= retirementAge) ---
      // Portfolio has had one final year of growth after the last paycheck before any withdrawals occur.
      const currentPortfolio = taxable + deferredTotal + roth + cashBuffer;

      // Withdrawals begin the year of retirement age
      if (age >= retirementAge) {
        if (initialPortfolioValue === 0) {
          // Year 1 of retirement: Snapshot the portfolio right before the first withdrawal
          initialPortfolioValue = currentPortfolio;
          if (withdrawalStrategy === "percentage") {
            initialWithdrawalRateBaseline = initialWithdrawalRate;
          } else {
            // If strategy is replacement, we calculate what % of the initial portfolio the replacement amount represents.
            // Note: currentSalary already reflects salaryGrowth compounding. Do NOT apply an extra
            // inflation factor here — the spending policy handles inflation on subsequent years.
            const firstYearSpend =
              currentSalary * retirementSpendReplacement;
            initialWithdrawalRateBaseline =
              currentPortfolio > 0 ? firstYearSpend / currentPortfolio : 0;
          }
          currentSalary = 0;
        }

        const retirementSpend = spendingEngine.calculateTargetSpend(
          currentPortfolio,
          previousNominalWithdrawal,
          currentInflationRate,
          initialWithdrawalRateBaseline,
          initialPortfolioValue,
        );

        previousNominalWithdrawal = retirementSpend;

        let need = retirementSpend;

        // --- HEALTHCARE & LTC SHOCKS ---
        /**
         * @bucket Health Savings Account (HSA)
         * HSA funds are triple-tax-advantaged (pre-tax in, tax-free growth,
         * tax-free out for medical expenses). To maximize this advantage,
         * the HSA is intentionally preserved as the LAST resort in the
         * withdrawal waterfall (Bucket D). Healthcare costs are added to
         * the general spending need and funded through the standard
         * Taxable → Deferred → Roth → HSA waterfall.
         */
        let healthNeed = 0;
        if (healthcareEnabled) {
          healthNeed +=
            healthcareAnnualBaseCost * cumulativeHealthcareInflation;
        }
        const ltcCostYear = healthEngine.getLTCCostForYear(
          age,
          cumulativeHealthcareInflation,
        );
        healthNeed += ltcCostYear;

        if (healthNeed > 0) {
          need += healthNeed;
        }

        // --- SOCIAL SECURITY & PENSION ---
        let totalIncomeStreams = 0;
        if (age >= socialSecurityAge && socialSecurityMonthly > 0) {
          const nominalAnnualSS =
            socialSecurityMonthly * 12 * cumulativeInflation;

          // IRS progressive phase-in: 0%, 50%, or up to 85% of SS is taxable
          // based on "Combined Income" (other income + 50% of SS benefit).
          //
          // NOTE: This estimate only includes pension + RMD income. Income from
          // bracket-fill conversions and Roth conversions (resolved later in
          // the yearly loop) is not yet known. This causes a slight under-
          // estimation of taxable SS in years where those features are active.
          let otherIncomeEstimate = 0;
          if (pensionEnabled && age >= pensionStartAge && pensionMonthly > 0) {
            let pensionEst = pensionMonthly * 12;
            if (pensionInflationAdjusted) pensionEst *= cumulativeInflation;
            otherIncomeEstimate += pensionEst;
          }
          // Include RMD if applicable (pre-computed estimate)
          const rmdDivisorEst = getRMDDivisor(age);
          if (rmdDivisorEst > 0 && deferredTotal > 0) {
            otherIncomeEstimate += deferredTotal / rmdDivisorEst;
          }

          const taxableSS = advancedTaxEnabled
            ? calculateTaxableSS(nominalAnnualSS, otherIncomeEstimate, cumulativeInflation)
            : nominalAnnualSS * 0.85; // Simplified mode: conservative 85% assumption
          const { incomeTax: ssTax } = computeIncomeTax(
            taxableSS,
            0,
            taxRateIncome,
            taxRateCapGains,
            cumulativeInflation,
            advancedTaxEnabled,
          );

          const netSS = nominalAnnualSS - ssTax;
          totalIncomeStreams += netSS;
        }

        // Pension
        if (pensionEnabled && age >= pensionStartAge && pensionMonthly > 0) {
          let nominalPension = pensionMonthly * 12;
          if (pensionInflationAdjusted) {
            nominalPension *= cumulativeInflation;
          }
          const { incomeTax: pensionTax } = computeIncomeTax(
            nominalPension,
            0,
            taxRateIncome,
            taxRateCapGains,
            cumulativeInflation,
            advancedTaxEnabled,
          );
          const netPension = nominalPension - pensionTax;
          totalIncomeStreams += netPension;
        }

        // Under the "replacement" strategy, SS/pension offsets the spending need
        // (they are part of the income being "replaced").
        // Under the "percentage" (4% rule) strategy, the withdrawal amount is
        // determined entirely by the initial portfolio balance and inflation.
        // SS/pension is ADDITIVE income on top — it does NOT reduce portfolio draws.
        // Instead, net SS/pension proceeds are deposited into the taxable account.
        if (withdrawalStrategy === "replacement") {
          need = Math.max(0, need - totalIncomeStreams);
        } else if (totalIncomeStreams > 0) {
          // 4% rule: SS/pension is surplus income, deposit into brokerage
          taxableLots.addContribution(totalIncomeStreams, year);
          taxable = taxableLots.getTotalValue();
        }

        // --- RMD LOGIC ---
        const rmdDivisor = getRMDDivisor(age);
        if (rmdDivisor > 0 && deferredTotal > 0) {
          const rmdAmount = deferredTotal / rmdDivisor;
          const defState: DeferredState = {
            deferredEquity,
            deferredBond,
            deferredTotal,
          };
          withdrawFromDeferred(rmdAmount, defState);
          ({ deferredEquity, deferredBond, deferredTotal } = defState);

          const { incomeTax: rmdTax } = computeIncomeTax(
            rmdAmount,
            0,
            taxRateIncome,
            taxRateCapGains,
            cumulativeInflation,
            advancedTaxEnabled,
          );

          prevYearNominalTaxPaid += rmdTax;

          const rmdNet = rmdAmount - rmdTax;

          if (rmdNet >= need) {
            const excess = rmdNet - need;
            taxableLots.addContribution(excess, year);
            taxable = taxableLots.getTotalValue();
            need = 0;
          } else {
            need -= rmdNet;
          }

          prevYearNominalWithdrawal += rmdAmount;
        }

        // --- TAX-AWARE BRACKET FILLING (Fidelity Alternate Strategy) ---
        /**
         * @strategy Target Bracket Filling
         * Before executing the standard waterfall, intentionally pre-drain the 401(k)
         * up to the top of the target tax bracket (e.g., $89,075 for 22% MFJ).
         * This "fills the bracket" by realizing ordinary income NOW at a known, low
         * marginal rate, rather than being forced to realize it later at much higher
         * rates when Required Minimum Distributions (RMDs) compound with Social Security.
         * The net proceeds are strategically routed to the Roth bucket.
         * This is a primary mathematical lever for combating the "Tax Torpedo".
         */
        // This is the key lever for combating the "Tax Torpedo".
        if (
          taxAwareBracketFill &&
          age >= retirementAge &&
          deferredTotal > 0
        ) {
          const adjustedCap = taxAwareBracketCap * cumulativeInflation;
          const bracketHeadroom = Math.max(0, adjustedCap - need);

          if (bracketHeadroom > 0) {
            const fillAmount = Math.min(deferredTotal, bracketHeadroom);
            if (fillAmount > 0) {
              const defState: DeferredState = {
                deferredEquity,
                deferredBond,
                deferredTotal,
              };
              withdrawFromDeferred(fillAmount, defState);
              ({ deferredEquity, deferredBond, deferredTotal } = defState);

              const { incomeTax: fillTax } = computeIncomeTax(
                fillAmount,
                0,
                taxRateIncome,
                taxRateCapGains,
                cumulativeInflation,
                advancedTaxEnabled,
              );
              roth += fillAmount - fillTax;
              // Adding missing tax tracking for bracket filling
              prevYearNominalTaxPaid += fillTax;
            }
          }
        }

        // --- ROTH CONVERSION LOGIC ---
        if (
          rothConversionEnabled &&
          age <= rothConversionEndAge &&
          deferredTotal > 0 &&
          rothConversionAmount > 0
        ) {
          const convertNominal = Math.min(
            rothConversionAmount * cumulativeInflation,
            deferredTotal,
          );
          if (convertNominal > 0) {
            const defState: DeferredState = {
              deferredEquity,
              deferredBond,
              deferredTotal,
            };
            withdrawFromDeferred(convertNominal, defState);
            ({ deferredEquity, deferredBond, deferredTotal } = defState);

            roth += convertNominal;

            const { incomeTax: conversionTax } = computeIncomeTax(
              convertNominal,
              0,
              taxRateIncome,
              taxRateCapGains,
              cumulativeInflation,
              advancedTaxEnabled,
            );
            need += conversionTax;
            // Additional tax tracking
            prevYearNominalTaxPaid += conversionTax;
          }
        }

        // --- CASH BUFFER SORR MITIGATION ---
        // If equities took a severe hit (e.g., dropped more than 10%), use the cash buffer
        // to pay for living expenses instead of selling equities at the bottom.
        const equityReturn = deferredEqGrowthFactor - 1;
        if (
          cashBufferEnabled &&
          need > 0 &&
          equityReturn <= cashBufferEquityDropTrigger &&
          cashBuffer > 0
        ) {
          const withdrawal = Math.min(cashBuffer, need);
          cashBuffer -= withdrawal;
          need -= withdrawal;
          prevYearNominalWithdrawal += withdrawal;
        }

        // --- PROPORTIONAL WITHDRAWALS (Fidelity Alternate Strategy) ---
        /**
         * @strategy Proportional Withdrawals
         * The "Standard Approach" forces retirees to drain accounts sequentially:
         * Taxable -> Tax-Deferred -> Tax-Free. While simple, this mathematically guarantees
         * a massive late-in-life tax spike (the Tax Torpedo) when the Deferred bucket finally
         * triggers massive RMDs at peak portfolio sizes.
         *
         * The Proportional Strategy instead withdraws from ALL THREE buckets simultaneously,
         * perfectly matched to their current balance ratios. This dynamically spreads the
         * tax burden evenly across the entire retirement lifecycle.
         */
        const totalAssetsForProportional = taxable + deferredTotal + roth;
        if (
          proportionalWithdrawals &&
          need > 0 &&
          totalAssetsForProportional > 0
        ) {
          const taxableRatio = taxable / totalAssetsForProportional;
          const deferredRatio = deferredTotal / totalAssetsForProportional;
          const rothRatio = roth / totalAssetsForProportional;

          // Calculate raw target amounts
          const rothNeed = need * rothRatio;
          const taxableSaleTarget = need * taxableRatio * TAX_BUFFER_MULTIPLIER;
          const grossDeferredNeed =
            (need * deferredRatio) / (1 - EFFECTIVE_TAX_RATE_HEURISTIC);

          // 1. Proportional Deferred
          if (deferredTotal > 0 && grossDeferredNeed > 0) {
            const defWithdrawal = Math.min(deferredTotal, grossDeferredNeed);
            const defState: DeferredState = {
              deferredEquity,
              deferredBond,
              deferredTotal,
            };
            withdrawFromDeferred(defWithdrawal, defState);
            ({ deferredEquity, deferredBond, deferredTotal } = defState);

            const { incomeTax: defTax } = computeIncomeTax(
              defWithdrawal,
              0,
              taxRateIncome,
              taxRateCapGains,
              cumulativeInflation,
              advancedTaxEnabled,
            );

            need -= Math.max(0, defWithdrawal - defTax);
            prevYearNominalTaxPaid += defTax;
            prevYearNominalWithdrawal += defWithdrawal;
          }

          // 2. Proportional Taxable
          if (taxable > 0 && need > 0 && taxableSaleTarget > 0) {
            const saleTarget = Math.min(taxable, taxableSaleTarget);
            const { cashRaised, realizedGains } = taxableLots.sellForCash(
              saleTarget,
              "HIFO",
            );
            taxable = taxableLots.getTotalValue();

            if (advancedTaxEnabled) {
              const { totalTax } = computeIncomeTax(
                0,
                realizedGains,
                taxRateIncome,
                taxRateCapGains,
                cumulativeInflation,
                true,
              );
              need -= Math.max(0, cashRaised - totalTax);
              prevYearNominalTaxPaid += totalTax;
            } else {
              const estimatedTax =
                cashRaised * taxRateCapGains * GAINS_FRACTION_HEURISTIC;
              need -= Math.max(0, cashRaised - estimatedTax);
              prevYearNominalTaxPaid += estimatedTax;
            }
            prevYearNominalWithdrawal += cashRaised;
          }

          // 3. Proportional Roth
          if (roth > 0 && need > 0 && rothNeed > 0) {
            const rWithdrawal = Math.min(roth, rothNeed);
            roth -= rWithdrawal;
            need -= rWithdrawal;
            prevYearNominalWithdrawal += rWithdrawal;
          }
        }

        // --- STANDARD WATERFALL (if need remains) ---
        if (need > 0) {
          // A. Taxable
          if (taxable > 0) {
            if (advancedTaxEnabled) {
              const saleTarget = Math.min(
                taxable,
                need * TAX_BUFFER_MULTIPLIER,
              );
              const { cashRaised, realizedGains } = taxableLots.sellForCash(
                saleTarget,
                "HIFO",
              );
              const { totalTax } = computeIncomeTax(
                0,
                realizedGains,
                taxRateIncome,
                taxRateCapGains,
                cumulativeInflation,
                true,
              );

              prevYearNominalTaxPaid += totalTax;

              taxable = taxableLots.getTotalValue();
              need -= cashRaised - totalTax;
              need = Math.max(0, need); // Clamp: gross-up heuristic may overshoot
              prevYearNominalWithdrawal += cashRaised;
            } else {
              // The withdrawal (gross sale amount) needed to net 'need'
              // cashNet = gross - gross * taxRate * heuristic
              // gross = cashNet / (1 - taxRate * heuristic)
              const grossNeed =
                need / (1 - taxRateCapGains * GAINS_FRACTION_HEURISTIC);
              const withdrawal = Math.min(taxable, grossNeed);

              taxableLots.sellForCash(withdrawal, "HIFO");
              taxable = taxableLots.getTotalValue();

              // The net cash raised to satisfy need is the gross withdrawal minus the estimated tax
              const estimatedTax =
                withdrawal * taxRateCapGains * GAINS_FRACTION_HEURISTIC;
              prevYearNominalTaxPaid += estimatedTax;
              need -= withdrawal - estimatedTax;
              prevYearNominalWithdrawal += withdrawal;
            }
          }
          // B. Deferred — full income tax
          if (need > 0 && deferredTotal > 0) {
            const grossNeed = advancedTaxEnabled
              ? need / (1 - EFFECTIVE_TAX_RATE_HEURISTIC)
              : need / (1 - taxRateIncome);

            const withdrawal = Math.min(deferredTotal, grossNeed);
            const defState: DeferredState = {
              deferredEquity,
              deferredBond,
              deferredTotal,
            };
            withdrawFromDeferred(withdrawal, defState);
            ({ deferredEquity, deferredBond, deferredTotal } = defState);

            const { incomeTax: taxOnWithdrawal } = computeIncomeTax(
              withdrawal,
              0,
              taxRateIncome,
              taxRateCapGains,
              cumulativeInflation,
              advancedTaxEnabled,
            );

            prevYearNominalTaxPaid += taxOnWithdrawal;

            need -= withdrawal - taxOnWithdrawal;
            prevYearNominalWithdrawal += withdrawal;
          }
          // C. Roth — tax-free
          if (need > 0 && roth > 0) {
            const withdrawal = Math.min(roth, need);
            roth -= withdrawal;
            need -= withdrawal;
            prevYearNominalWithdrawal += withdrawal;
          }
          // D. HSA — last resort (per user request to preserve triple-tax advantage)
          if (need > 0 && hsa > 0) {
            const withdrawal = Math.min(hsa, need);
            hsa -= withdrawal;
            // need is no longer tracked after final waterfall bucket
            prevYearNominalWithdrawal += withdrawal;
          }
        }

        // --- CASH BUFFER REPLENISHMENT ---
        // If the market had a strong positive year, refill the cash buffer from taxable/roth gains
        if (
          cashBufferEnabled &&
          equityReturn > CASH_BUFFER_REPLENISH_THRESHOLD &&
          taxable + deferredTotal + roth > 0
        ) {
          const targetBuffer = retirementSpend * CASH_BUFFER_TARGET_YEARS;
          if (cashBuffer < targetBuffer) {
            const refillNeed = targetBuffer - cashBuffer;
            if (taxable > refillNeed) {
              const { cashRaised, realizedGains } = taxableLots.sellForCash(
                refillNeed,
                "HIFO",
              );
              taxable = taxableLots.getTotalValue();

              // Account for capital gains tax on the buffer sale
              if (realizedGains > 0) {
                const bufferTax = advancedTaxEnabled
                  ? computeIncomeTax(0, realizedGains, taxRateIncome, taxRateCapGains, cumulativeInflation, true).totalTax
                  : realizedGains * taxRateCapGains;
                prevYearNominalTaxPaid += bufferTax;
                cashBuffer += Math.max(0, cashRaised - bufferTax);
              } else {
                cashBuffer += cashRaised;
              }
            }
          }
        }
      }
    }

    if (taxable + deferredTotal + roth + cashBuffer + hsa === 0 && age < deathAge) {
      isBankrupt = true;
      if (bankruptcyAge === null) bankruptcyAge = age;
    }
  }

  // Calculate terminal estate value
  // Taxable gets step-up in basis (zero cap gains tax for heirs)
  // Roth passes tax free
  // Deferred is subject to SECURE Act 10-year rule, effectively taxed at heir's marginal rate
  let estateValue = taxable + roth;
  if (stepUpInBasisEnabled) {
    taxableLots.applyStepUpInBasis(); // Flushes unrealized gains
    // Taxable flows directly to heirs with no embedded tax
  } else {
    // If no step up, heirs would eventually pay tax on the embedded gains
    const embeddedGains = taxableLots.getTotalUnrealizedGains();
    estateValue -= embeddedGains * taxRateCapGains;
  }

  // Apply the heir's tax drag to the deferred bucket
  estateValue += (deferredEquity + deferredBond) * (1 - heirTaxRate);

  estateValue = estateValue / cumulativeInflation;

  const res: PathResult & SimulationBuffers = {
    isBankrupt,
    bankruptcyAge,
    estateValue,
    ...actualBuffers,
  };

  return res;
};
