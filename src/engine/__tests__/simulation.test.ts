import { describe, it, expect } from "vitest";
import { runPath } from "../simulation";
import { DEFAULT_PARAMS } from "../../constants";

describe("runPath", () => {
  const shortParams = {
    ...DEFAULT_PARAMS,
    currentAge: 60,
    retirementAge: 65,
    deathAge: 70,
    advancedTaxEnabled: false,
    proportionalWithdrawals: false,
    taxAwareBracketFill: false,
    stochasticInflationEnabled: false,
    jumpDiffusionEnabled: false,
    copulaEnabled: false,
    glidepathEnabled: false,
    cashBufferEnabled: false,
    stepUpInBasisEnabled: false,
  };

  it("should produce path of correct length", () => {
    const result = runPath(shortParams, true);
    const expectedLength = shortParams.deathAge - shortParams.currentAge + 1;
    expect(result.path).toHaveLength(expectedLength);
    expect(result.salary).toHaveLength(expectedLength);
    expect(result.taxablePath).toHaveLength(expectedLength);
  });

  it("deterministic path should have zero-indexed initial total exactly reflect initial inputs", () => {
    const result = runPath(shortParams, true);
    const expectedStartWithoutCashflow =
      shortParams.taxable +
      shortParams.deferred +
      shortParams.roth +
      shortParams.hsa +
      shortParams.cashBuffer;

    expect(result.path[0]).toBeCloseTo(expectedStartWithoutCashflow, 2);
  });

  it("deterministic path should grow during accumulation years", () => {
    const result = runPath(shortParams, true);
    // Year 0 to Year 1 (accumulation) — portfolio should grow from contributions + returns
    expect(result.path[1]).toBeGreaterThan(result.path[0]);
  });

  it("should not bankrupt with deterministic high-return scenario", () => {
    const richParams = {
      ...DEFAULT_PARAMS,
      currentAge: 50,
      retirementAge: 55,
      deathAge: 60,
      meanReturn: 0.15,
      volatility: 0.0, // still stochastic path, but 0 vol = no risk
    };
    const result = runPath(richParams, false);
    expect(result.isBankrupt).toBe(false);
  });

  it("stochastic path should produce different values each run (non-deterministic)", () => {
    const result1 = runPath(shortParams, false);
    const result2 = runPath(shortParams, false);
    // Extremely unlikely to be identical
    const lastIdx = result1.path.length - 1;
    const identical = result1.path[lastIdx] === result2.path[lastIdx];
    // Not a strict test — just a sanity check that randomness is present
    // Run 3 times to reduce chance of false positive
    const result3 = runPath(shortParams, false);
    const allSame =
      identical && result2.path[lastIdx] === result3.path[lastIdx];
    expect(allSame).toBe(false);
  });

  describe("Guyton-Klinger Guardrails", () => {
    const gkParams = {
      ...DEFAULT_PARAMS,
      currentAge: 60,
      retirementAge: 61,
      deathAge: 65,
      taxable: 0,
      deferred: 1_000_000,
      roth: 0,
      withdrawalStrategy: "percentage" as const,
      initialWithdrawalRate: 0.05, // $50k initial spend
      inflationRate: 0.03, // 3% inflation
      spendingPolicy: "guytonKlinger" as const,
      gkCapitalPreservationThreshold: 1.2, // Trigger cut if WR > 6.0% (5% * 1.2)
      gkProsperityThreshold: 0.8, // Trigger raise if WR < 4.0% (5% * 0.8)
      gkAdjustmentRate: 0.1, // Adjust by 10%
      advancedTaxEnabled: false,
      proportionalWithdrawals: false,
      taxAwareBracketFill: false,
      stochasticInflationEnabled: false,
      jumpDiffusionEnabled: false,
      copulaEnabled: false,
      glidepathEnabled: false,
      cashBufferEnabled: false,
      stepUpInBasisEnabled: false,
    };

    it("should trigger Capital Preservation rule and cut spending when portfolio drops", () => {
      // Force a massive drop in the portfolio (-20% return) right after retirement
      const crashParams = {
        ...gkParams,
        meanReturn: -0.2, // -20%
        volatility: 0,
      };

      const result = runPath(crashParams, true);

      // Expected logic:
      // Year 0 (Age 60): Portfolio = 1m
      // Year 1 (Age 61): Pre-retirement, portfolio drops 20% to ~800k.
      // Year 2 (Age 62, first retirement year):
      //    Wait, retirement year is 61. So gap year is age 61. Withdrawals start at age 62 > retirementAge.
      // Age 61 (Year 1): Portfolio drops.
      // Age 62 (Year 2): Initial spend 50k. Portfolio is ~800k. WR = 50k / 800k = 6.25% > 6.0%.
      // Since GK is enabled, it should trigger Capital Preservation cut!
      // Spend should be cut by 10% (50k -> 45k) and inflation skipped.

      const noGkResult = runPath(
        { ...crashParams, spendingPolicy: "fixedReal" },
        true,
      );

      // Total withdrawal in 4th year (index 3) should be significantly lower with GK enabled.
      expect(result.totalWithdrawal[3]).toBeLessThan(
        noGkResult.totalWithdrawal[3],
      );
    });

    it("should trigger Prosperity rule and raise spending when portfolio booms", () => {
      // Force a massive boom in the portfolio (+50% return)
      const boomParams = {
        ...gkParams,
        meanReturn: 0.5, // +50%
        volatility: 0,
      };

      const result = runPath(boomParams, true);
      const noGkResult = runPath(
        { ...boomParams, spendingPolicy: "fixedReal" },
        true,
      );

      // Total withdrawal should be higher with GK enabled due to prosperity raise
      expect(result.totalWithdrawal[3]).toBeGreaterThan(
        noGkResult.totalWithdrawal[3],
      );
    });
  });

  describe("Roth Conversions", () => {
    it("should successfully convert deferred to Roth and pay taxes from taxable account", () => {
      const rothParams = {
        ...DEFAULT_PARAMS,
        currentAge: 60,
        retirementAge: 61,
        deathAge: 65,
        taxable: 500_000,
        deferred: 1_000_000,
        roth: 0,
        withdrawalStrategy: "percentage" as const,
        initialWithdrawalRate: 0.04, // 40k spend
        inflationRate: 0.0,
        meanReturn: 0.0,
        volatility: 0.0,
        taxRateIncome: 0.2, // 20% ordinary
        socialSecurityMonthly: 0, // Disable SS for simpler math

        rothConversionEnabled: true,
        rothConversionAmount: 50_000,
        rothConversionEndAge: 65,
      };

      const result = runPath(rothParams, true);
      const noConversionResult = runPath(
        { ...rothParams, rothConversionEnabled: false },
        true,
      );

      // In Year 2 (age 62, first withdrawal/conversion year)
      // Conversion of 50k from Deferred to Roth
      // Tax on 50k = 10k.
      // Base spending need = 40k. Total liquidity need = 50k.
      // Taxable should drop by 50k + capgains tax instead of 40k.
      // Roth should increase by 50k.

      const yr = 2; // Age 62

      // The Roth balance should be strictly higher because of the conversion
      expect(result.rothPath[yr]).toBeGreaterThan(
        noConversionResult.rothPath[yr],
      );

      // Deferred balance should be lower because it was converted
      expect(result.deferredPath[yr]).toBeLessThan(
        noConversionResult.deferredPath[yr],
      );

      // Taxable balance should be lower because it was used to pay the conversion tax
      expect(result.taxablePath[yr]).toBeLessThan(
        noConversionResult.taxablePath[yr],
      );
    });
  });

  describe("Institutional Market Dynamics (Phase 1)", () => {
    it("should process stochastic inflation leading to variable spending", () => {
      const inflationParams = {
        ...shortParams,
        withdrawalStrategy: "percentage" as const,
        initialWithdrawalRate: 0.05,
        stochasticInflationEnabled: true,
        inflationReversionSpeed: 0.3,
        inflationRate: 0.03, // baseline
        inflationVolatility: 0.05, // high vol to ensure movement
      };

      const result = runPath(inflationParams, false);
      const detResult = runPath(inflationParams, true);

      // In the stochastic path, inflation wanders, meaning the nominal withdrawal
      // amounts should diverge from the fixed-inflation deterministic path
      const lastYr = result.totalWithdrawal.length - 1;
      expect(result.totalWithdrawal[lastYr]).not.toBe(
        detResult.totalWithdrawal[lastYr],
      );
    });

    it("should process bond allocation and glidepath over time", () => {
      // With glidepath enabled, the portfolio starts at 100% equity and glides
      // toward bondAllocation (50%) at retirement. This means more time in
      // equities during accumulation → higher terminal wealth vs a fixed 50/50.
      const glideParams = {
        ...DEFAULT_PARAMS,
        currentAge: 45,
        retirementAge: 65,
        deathAge: 70,
        taxable: 0,
        deferred: 1_000_000,
        roth: 0,

        bondAllocation: 0.5, // Target 50% bonds at retirement
        bondMeanReturn: 0.05,
        bondVolatility: 0.0,
        meanReturn: 0.1, // Higher equity return
        volatility: 0.0,

        glidepathEnabled: true,
        glidepathTargetEquity: 0.5, // Legacy param, ignored in new semantics
      };

      // Fixed allocation holds 50% bonds the entire time
      const fixedParams = { ...glideParams, glidepathEnabled: false };

      const glidepathResult = runPath(glideParams, true);
      const fixedResult = runPath(fixedParams, true);

      // Glidepath spends more years in equities → higher terminal wealth
      const lastYr = glidepathResult.path.length - 1;
      expect(glidepathResult.path[lastYr]).toBeGreaterThan(
        fixedResult.path[lastYr],
      );
    });

    it("should linearly transition to the exact target allocation over 15 years", () => {
      const startAge = 50;
      const retireAge = 65;

      const linearParams = {
        ...DEFAULT_PARAMS,
        currentAge: startAge,
        retirementAge: retireAge,
        deathAge: retireAge, // Stop at retirement to inspect final balance
        taxable: 0,
        roth: 0,
        deferred: 1_000_000,
        hsa: 0,
        cashBuffer: 0,
        salary: 0,
        contribution401k: 0,
        socialSecurityMonthly: 0,
        inflationRate: 0.0,

        bondAllocation: 0.5, // Target 50% bonds at retirement
        bondMeanReturn: 0.0,
        bondVolatility: 0.0,
        meanReturn: 0.0,
        volatility: 0.0,

        glidepathEnabled: true,
        glidepathTargetEquity: 0.5, // Legacy param
      };

      const result = runPath(linearParams, true);

      const duration = retireAge - startAge + 1; // 16 elements (age 50 to 65)

      // Initial Mix Test (Year 0 / Age 50)
      // Year 0 snapshot is raw starting inputs — glidepath starts at 100% equity.
      const year0Idx = 0;
      const year0Total =
        result.deferredEquityPath[year0Idx] + result.deferredBondPath[year0Idx];
      expect(year0Total).toBeCloseTo(1_000_000);
      const year0EquityPct = result.deferredEquityPath[year0Idx] / year0Total;
      expect(year0EquityPct).toBeCloseTo(1.0, 4); // 100% equity at start

      // Year 1 Test (Age 51)
      // 1 year of glidepath progress: equity = 1.0 - (0.5 * 1) / 15
      const year1Idx = 1;
      const year1Total =
        result.deferredEquityPath[year1Idx] + result.deferredBondPath[year1Idx];
      expect(year1Total).toBeCloseTo(1_000_000);
      const year1EquityPct = result.deferredEquityPath[year1Idx] / year1Total;
      expect(year1EquityPct).toBeCloseTo(1.0 - (0.5 * 1) / 15, 4);

      // Midpoint Test (Year 8 / Age 58)
      // 8 years of glidepath progress.
      const year8Idx = 8;
      const year8Total =
        result.deferredEquityPath[year8Idx] + result.deferredBondPath[year8Idx];
      const year8EquityPct = result.deferredEquityPath[year8Idx] / year8Total;
      expect(year8EquityPct).toBeCloseTo(1.0 - (0.5 * 8) / 15, 4);

      // Final Target Test (Year 15 / Age 65)
      // 15 years of glidepath progress = fully shifted to target.
      const finalIdx = duration - 1;
      const finalTotal =
        result.deferredEquityPath[finalIdx] + result.deferredBondPath[finalIdx];
      const finalEquityPct = result.deferredEquityPath[finalIdx] / finalTotal;

      expect(finalEquityPct).toBeCloseTo(0.5, 4);
    });
  });

  describe("Portfolio Depletion Logic", () => {
    const depletionParams = {
      ...DEFAULT_PARAMS,
      currentAge: 60,
      retirementAge: 60, // Retiring immediately
      deathAge: 70,
      taxable: 30_000,
      deferred: 40_000,
      roth: 30_000,
      hsa: 0,
      cashBuffer: 0,
      salary: 0,
      socialSecurityMonthly: 0,
      pensionEnabled: false,
      healthcareEnabled: false,
      ltcShockEnabled: false,
      stochasticInflationEnabled: false,
      jumpDiffusionEnabled: false,
      copulaEnabled: false,
      glidepathEnabled: false,
      cashBufferEnabled: false,
      rothConversionEnabled: false,
      taxAwareBracketFill: false,
      meanReturn: 0.0, // No market growth
      volatility: 0.0,
      bondMeanReturn: 0.0,
      bondVolatility: 0.0,
      inflationRate: 0.0,
      withdrawalStrategy: "percentage" as const,
      initialWithdrawalRate: 0.2, // 20k per year on 100k starting balance -> bankrupt in 5 years
      advancedTaxEnabled: false, // Turn off taxes for exact math
      taxRateIncome: 0.0,
      taxRateCapGains: 0.0,
      taxDragBrokerage: 0.0,
    };

    it("should deplete sequentially and hit bankruptcy accurately", () => {
      const result = runPath(
        { ...depletionParams, proportionalWithdrawals: false },
        true,
      );

      // Starting total: 100k. Withdraw 20k/yr.
      // Year 0 (Age 60): 100k (literal input balance, no growth, no cashflow)
      // Year 1 (Age 61): Growth applied first (intrinsic asset alpha), then snapshot, then withdrawal.
      //   With 0% mean return but +2% brokerage alpha and +0.5% Roth alpha, there's slight growth.

      expect(result.path[0]).toBe(100_000);
      // Year 1 includes 1 year of intrinsic asset alpha before the snapshot
      expect(result.path[1]).toBeGreaterThan(79_000);
      expect(result.path[1]).toBeLessThan(82_000);

      // Without per-bucket alpha boosts, the portfolio depletes at year 5.
      expect(result.path[5]).toBe(0);
      expect(result.path[6]).toBe(0);
      expect(result.isBankrupt).toBe(true);
      expect(result.bankruptcyAge).toBe(64);

      // Verify sequential depletion (Taxable -> Deferred -> Roth)
      // Yr 0 (100k no growth). Taxable started at 30k.
      expect(result.taxablePath[0]).toBe(30_000);

      // Yr 1: Growth applied first (intrinsic +2% brokerage alpha), then withdraw 20k.
      // Taxable started at 30k, grew slightly, then 20k withdrawn.
      expect(result.taxablePath[1]).toBeGreaterThan(9_000);
      expect(result.taxablePath[1]).toBeLessThan(11_500);

      // Yr 2 (Taxable depletes fully, Deferred starts depleting)
      expect(result.taxablePath[2]).toBe(0);
      expect(result.deferredPath[2]).toBeLessThan(40_000); // 40k started, now tapped

      // Yr 6 (Everything is 0)
      expect(result.taxablePath[6]).toBe(0);
      expect(result.deferredPath[6]).toBe(0);
      expect(result.rothPath[6]).toBe(0);
    });

    it("should deplete proportionally and hit bankruptcy accurately", () => {
      const result = runPath(
        { ...depletionParams, proportionalWithdrawals: true },
        true,
      );

      // Proportional logic uses hardcoded tax buffer heuristics (1.05 for taxable, /0.85 for deferred)
      // which means it inherently withdraws slightly MORE than 100% of the nominal need if true taxes are 0.
      // Therefore, it depletes faster than sequential and hits 0 exactly in Year 5 (Age 65).
      expect(result.path[5]).toBe(0);
      expect(result.isBankrupt).toBe(true);
      expect(result.bankruptcyAge).toBe(64);

      // Verify proportional depletion (30% Taxable, 40% Def, 30% Roth roughly)
      // All accounts should be intact in Year 0.
      expect(result.taxablePath[0]).toBe(30_000);

      // Yr 1: tapped simultaneously
      expect(result.taxablePath[1]).toBeLessThan(30_000);
      expect(result.deferredPath[1]).toBeLessThan(40_000);
      expect(result.rothPath[1]).toBeLessThan(30_000);

      // Unlike sequential, they should all still be alive in Year 2 because they drain uniformly
      expect(result.taxablePath[2]).toBeGreaterThan(0);
      expect(result.deferredPath[2]).toBeGreaterThan(0);
      expect(result.rothPath[2]).toBeGreaterThan(0);
    });
  });
});
