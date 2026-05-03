import { SimulationParams } from "../types";

export const DEFAULT_PARAMS: SimulationParams = {
  currentAge: 39,
  retirementAge: 55,
  deathAge: 95,

  // Assets
  taxable: 354100,
  deferred: 505300,
  roth: 154100,
  cashBuffer: 0,
  hsa: 13300,

  // Income & Growth
  salary: 177552,
  salaryGrowth: 0.045,
  inflationRate: 0.026,

  // Stochastic Inflation
  stochasticInflationEnabled: true,
  inflationReversionSpeed: 0.3,
  inflationVolatility: 0.015,

  // Contributions
  contribution401k: 24500,
  contributionRoth: 7500,
  contributionBrokerage: 18000,
  contributionHSA: 4400,
  companyMatchRate: 0.05,
  companyDiscretionaryRate: 0.04,

  // Social Security & Pensions
  socialSecurityMonthly: 2800,
  socialSecurityAge: 67,
  pensionEnabled: false,
  pensionMonthly: 0,
  pensionStartAge: 65,
  pensionInflationAdjusted: false,

  // Real Estate / Illiquid Assets
  realEstateDownsizeEnabled: false,
  realEstateDownsizeAge: 75,
  realEstateDownsizeNetProceeds: 250000,

  // Healthcare & Shocks
  healthcareEnabled: true,
  healthcareAnnualBaseCost: 8000,
  healthcareInflationRate: 0.05,
  ltcShockEnabled: true,
  ltcShockLifetimeProbability: 0.15,
  ltcShockAnnualCost: 100000,
  ltcShockDuration: 3,
  ltcShockStartAge: 82,

  // Spending
  withdrawalStrategy: "percentage",
  spendingPolicy: "fixedReal",
  retirementSpendReplacement: 0.7,
  initialWithdrawalRate: 0.033,

  // Tax-Aware Bracket Filling (Fidelity Alternate Strategy)
  taxAwareBracketFill: true,
  taxAwareBracketCap: 105700, // Top of 22% Single bracket (2026)
  proportionalWithdrawals: false,

  // Guyton-Klinger Defaults
  gkCapitalPreservationThreshold: 1.2, // 20% over initial WR
  gkProsperityThreshold: 0.8, // 20% under initial WR
  gkAdjustmentRate: 0.1, // 10% adjustments

  // Vanguard Dynamic Defaults
  vanguardCeilingPct: 0.05,
  vanguardFloorPct: -0.025,

  // Cash Buffer Rules
  cashBufferEnabled: true,
  cashBufferTargetYield: 0.04,
  cashBufferEquityDropTrigger: -0.1,

  // Roth Conversion Defaults
  rothConversionEnabled: true,
  rothConversionAmount: 50000,
  rothConversionEndAge: 72,

  // Market
  meanReturn: 0.1,
  volatility: 0.17,

  // Jump-Diffusion
  jumpDiffusionEnabled: true,
  jumpIntensity: 0.1, // 1 crash every 10 years
  jumpMean: -0.2, // 20% average crash magnitude
  jumpVol: 0.05,

  // Copula Dependence
  copulaEnabled: true,
  copulaTheta: 2.0, // Moderate tail dependence

  // Bond Allocation (Glidepath)
  bondAllocation: 0.0, // Start with 0% bonds (100% equity) for backwards compatibility
  bondMeanReturn: 0.04,
  bondVolatility: 0.06,
  glidepathEnabled: true,
  glidepathTargetEquity: 0.6,

  // Tax — configurable defaults
  advancedTaxEnabled: true,
  taxRateIncome: 0.22,
  taxRateCapGains: 0.15,
  taxDragBrokerage: 0.005,

  // Estate
  stepUpInBasisEnabled: true,
  heirTaxRate: 0.24,
};

export const COLORS = {
  primary: "#6366f1", // indigo-500
  secondary: "#10b981", // emerald-500
  danger: "#f43f5e", // rose-500
  warning: "#f59e0b", // amber-500
  neutral: "#94a3b8", // slate-400
  grid: "#334155", // slate-700
  background: "#1e293b", // slate-800
  deterministic: "#06b6d4", // cyan-500
} as const;
