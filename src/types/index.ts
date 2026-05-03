export interface SimulationParams {
  currentAge: number;
  retirementAge: number;
  deathAge: number;

  // Portfolio Starting Balances
  taxable: number; // "Brokerage"
  deferred: number; // "401k"
  roth: number; // "Roth IRA"
  cashBuffer: number; // Risk-free cash buffer (to mitigate SORR)
  hsa: number; // Health Savings Account (triple tax-advantaged, used for healthcare first)

  // Cash Flow & Growth
  salary: number;
  salaryGrowth: number; // Decimal (e.g., 0.045)
  inflationRate: number; // Decimal (e.g., 0.026)

  // Stochastic Inflation (Ornstein-Uhlenbeck)
  stochasticInflationEnabled: boolean;
  inflationReversionSpeed: number; // 'a' in Vasicek model (e.g. 0.3)
  inflationVolatility: number; // (e.g. 0.015)

  // Contributions
  contribution401k: number;
  contributionRoth: number;
  contributionBrokerage: number;
  contributionHSA: number;
  companyMatchRate: number; // Decimal (e.g., 0.05), applied to salary into 401k
  companyDiscretionaryRate: number; // Decimal (e.g., 0.04), profit sharing/discretionary into 401k

  // External Income & Asymmetric Cash Flow
  socialSecurityMonthly: number; // Expected monthly benefit today
  socialSecurityAge: number; // Age to claim (e.g. 62-70)

  pensionEnabled: boolean;
  pensionMonthly: number;
  pensionStartAge: number;
  pensionInflationAdjusted: boolean;

  realEstateDownsizeEnabled: boolean;
  realEstateDownsizeAge: number;
  realEstateDownsizeNetProceeds: number; // Cash added to taxable

  // Healthcare & Shocks
  healthcareEnabled: boolean;
  healthcareAnnualBaseCost: number; // Base cost at current age
  healthcareInflationRate: number; // Usually > general inflation

  ltcShockEnabled: boolean;
  ltcShockLifetimeProbability: number; // E.g., 0.15 (15% chance of needing LTC)
  ltcShockAnnualCost: number; // Nominal today, e.g., 100000
  ltcShockDuration: number; // E.g., 3 years
  ltcShockStartAge: number; // Mean age of occurrence, e.g., 82

  // Retirement Spending
  withdrawalStrategy: "replacement" | "percentage";
  spendingPolicy: "fixedReal" | "guytonKlinger" | "vanguardDynamic";
  retirementSpendReplacement: number; // Decimal (e.g., 0.80 of final salary)
  initialWithdrawalRate: number; // Decimal (e.g., 0.04 for 4%)

  // Tax-Aware Withdrawals (Fidelity Alternate Strategy)
  taxAwareBracketFill: boolean; // Pre-drain 401k up to bracket cap to prevent RMD torpedo
  taxAwareBracketCap: number; // e.g., 89075 = top of 22% bracket for MFJ (2024 nominal)
  proportionalWithdrawals: boolean; // Withdraw across all 3 buckets proportionally to balance tax burden

  // Guyton-Klinger Dynamic Spending Guardrails
  gkCapitalPreservationThreshold: number; // e.g., 1.2 (+20% of initial WR triggering a cut)
  gkProsperityThreshold: number; // e.g., 0.8 (-20% of initial WR triggering a raise)
  gkAdjustmentRate: number; // e.g., 0.1 (10% adjustment when thresholds are hit)

  // Vanguard Dynamic Spending
  vanguardCeilingPct: number; // e.g., 0.05 (+5% real spending increase ceiling)
  vanguardFloorPct: number; // e.g., -0.025 (-2.5% real spending decrease floor)

  // Sequence of Returns Risk (SORR) Mitigation
  cashBufferEnabled: boolean;
  cashBufferTargetYield: number; // Yield of the cash buffer (e.g. 0.04)
  cashBufferEquityDropTrigger: number; // % drop in equities that triggers using cash buffer (e.g. -0.10)

  // Roth Conversions
  rothConversionEnabled: boolean;
  rothConversionAmount: number; // Fixed annual amount to convert
  rothConversionEndAge: number; // Age to stop converting (e.g. 72 when RMDs start)

  // Market Assumptions
  meanReturn: number;
  volatility: number;

  // Jump-Diffusion
  jumpDiffusionEnabled: boolean;
  jumpIntensity: number; // lambda (e.g., 0.1 for crash every 10 yrs)
  jumpMean: number; // mu_j (e.g., -0.20)
  jumpVol: number; // sigma_j (e.g., 0.05)

  // Copula Dependence (Tail dependence)
  copulaEnabled: boolean;
  copulaTheta: number; // Theta > 0, higher = more severe tail dependence

  // Bond Allocation (Glidepath)
  bondAllocation: number; // e.g. 0.40 for 40% bonds
  bondMeanReturn: number; // e.g. 0.04
  bondVolatility: number; // e.g. 0.06
  glidepathEnabled: boolean;
  glidepathTargetEquity: number; // e.g. 0.30 at retirement

  // Tax Assumptions
  advancedTaxEnabled: boolean;
  taxRateIncome: number; // Effective income tax rate (used if advancedTaxEnabled is false)
  taxRateCapGains: number; // Long-term capital gains rate (used if advancedTaxEnabled is false)
  taxDragBrokerage: number; // Annual tax drag on taxable accounts (e.g. 0.005)

  // Estate / Legacy
  stepUpInBasisEnabled: boolean;
  heirTaxRate: number; // Tax rate applied to inherited deferred accounts (e.g. 0.24)
}

export interface YearResult {
  age: number;
  // Enhanced Fan Chart Percentiles
  p5: number;
  p10: number;
  p25: number;
  median: number;
  average: number;
  p75: number;
  p90: number;
  p95: number;
  deterministic: number;

  // Deterministic Account Breakdown
  detTaxable: number;
  detDeferred: number;
  detRoth: number;
  detHsa: number;
  detInflationMultiplier: number;

  survivalRate: number;
  mortalityWeightedSuccessRate?: number;
  salary: number;
  totalContribution: number;
  annualInvestmentGain: number;
  totalWithdrawal: number;
  taxPaid: number;
}

export interface MonteCarloResult {
  data: YearResult[];
  successRate: number;
  mortalityWeightedSuccessRate?: number;
  medianTerminalWealth: number;
  worstCaseTerminalWealth: number;
  deterministicTerminalWealth: number;
  simulationsRun: number;
  // Longitudinal paths sorted by terminal wealth (keys 1-99 for percentiles)
  percentilePaths?: Record<number, number[]>;
  percentileDetails?: Record<
    number,
    {
      crashes: number;
      maxDrawdown: number;
      avgInflation: number;
      depletionAge: number | null;
    }
  >;
}
