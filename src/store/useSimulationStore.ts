import { create } from "zustand";
import { SimulationParams, MonteCarloResult } from "../types";
import { getParamsFromUrl, updateUrlWithParams } from "../utils/url";
import { runMonteCarlo } from "../engine";
import { DEFAULT_PARAMS } from "../constants";

interface SimulationState {
  params: SimulationParams;
  results: MonteCarloResult | null;
  isSimulating: boolean;
  numSimulations: number;
  isDemoMode: boolean;
  savedUserParams: SimulationParams | null;

  updateParam: <K extends keyof SimulationParams>(
    key: K,
    value: SimulationParams[K],
  ) => void;
  updateStrategy: (strategy: "replacement" | "percentage") => void;
  setResults: (results: MonteCarloResult) => void;
  setIsSimulating: (is: boolean) => void;
  setNumSimulations: (num: number) => void;
  toggleDemoMode: () => void;
  resetDefaults: () => void;
}

const NUM_SIMULATIONS = 20_000;
const AVERAGE_AMERICAN_PARAMS: Partial<SimulationParams> = {
  // Only fields that differ from DEFAULT_PARAMS for the "Average American" profile
  taxable: 20_000,
  deferred: 150_000,
  roth: 40_000,
  cashBuffer: 0,
  hsa: 0,
  salary: 70_000,
  salaryGrowth: 0.03,
  inflationRate: 0.03,
  stochasticInflationEnabled: false,
  contribution401k: 7_000,
  contributionRoth: 3_500,
  contributionBrokerage: 1_000,
  contributionHSA: 0,
  companyMatchRate: 0.04,
  companyDiscretionaryRate: 0,
  socialSecurityMonthly: 1_800,
  withdrawalStrategy: "percentage",
  retirementSpendReplacement: 0.8,
  initialWithdrawalRate: 0.04,
  taxAwareBracketFill: false,
  taxAwareBracketCap: 89075,
  proportionalWithdrawals: false,
  cashBufferEnabled: false,
  cashBufferTargetYield: 0.04,
  cashBufferEquityDropTrigger: -0.1,
  rothConversionEnabled: false,
  rothConversionAmount: 0,
  rothConversionEndAge: 72,
  meanReturn: 0.07,
  volatility: 0.15,
  jumpDiffusionEnabled: false,
  copulaEnabled: false,
  bondAllocation: 0.4,
  glidepathEnabled: false,
  glidepathTargetEquity: 0.6,
  advancedTaxEnabled: false,
  taxRateIncome: 0.12,
  taxRateCapGains: 0.15,
  stepUpInBasisEnabled: false,
  heirTaxRate: 0.0,
  retirementAge: 64,
};

const { params: rawInitialParams, isDemoMode: initialIsDemoMode } =
  getParamsFromUrl();
let initialParams = rawInitialParams;
let initialSavedParams: SimulationParams | null = null;

if (initialIsDemoMode) {
  initialSavedParams = { ...DEFAULT_PARAMS };
  initialParams = { ...rawInitialParams, ...AVERAGE_AMERICAN_PARAMS };
}

export const useSimulationStore = create<SimulationState>((set) => ({
  params: initialParams,
  // Start with null results — the coordinator will fire the initial simulation
  // via the Web Worker, keeping the main thread free for first paint.
  results: null,
  isSimulating: true, // Start in simulating state so the UI shows a loading skeleton
  numSimulations: NUM_SIMULATIONS,
  isDemoMode: initialIsDemoMode,
  savedUserParams: initialSavedParams,

  updateParam: <K extends keyof SimulationParams>(
    key: K,
    value: SimulationParams[K],
  ) =>
    set((state) => {
      const next = { ...state.params, [key]: value };

      if (key === "currentAge") {
        if (next.retirementAge <= next.currentAge) {
          next.retirementAge = next.currentAge + 1;
        }
        if (next.deathAge <= next.retirementAge) {
          next.deathAge = next.retirementAge + 1;
        }
      } else if (key === "retirementAge") {
        if (next.currentAge >= next.retirementAge) {
          next.currentAge = next.retirementAge - 1;
        }
        if (next.deathAge <= next.retirementAge) {
          next.deathAge = next.retirementAge + 1;
        }
      } else if (key === "deathAge") {
        if (next.retirementAge >= next.deathAge) {
          next.retirementAge = next.deathAge - 1;
        }
        if (next.currentAge >= next.retirementAge) {
          next.currentAge = next.retirementAge - 1;
        }
      }

      let nextIsDemoMode = state.isDemoMode;
      let nextSavedParams = state.savedUserParams;

      if (state.isDemoMode) {
        nextIsDemoMode = false;
        nextSavedParams = null;
      }

      updateUrlWithParams(next, nextIsDemoMode);

      return {
        params: next,
        isDemoMode: nextIsDemoMode,
        savedUserParams: nextSavedParams,
      };
    }),

  updateStrategy: (strategy) =>
    set((state) => {
      const next = { ...state.params, withdrawalStrategy: strategy };

      let nextIsDemoMode = state.isDemoMode;
      let nextSavedParams = state.savedUserParams;

      if (state.isDemoMode) {
        nextIsDemoMode = false;
        nextSavedParams = null;
      }

      updateUrlWithParams(next, nextIsDemoMode);

      return {
        params: next,
        isDemoMode: nextIsDemoMode,
        savedUserParams: nextSavedParams,
      };
    }),

  setResults: (results) => set({ results }),
  setIsSimulating: (isSimulating) => set({ isSimulating }),
  setNumSimulations: (num: number) => set({ numSimulations: num }),

  toggleDemoMode: () =>
    set((state) => {
      if (state.isDemoMode) {
        // Turning OFF Demo Mode -> Restore old params
        const restoreParams = state.savedUserParams ?? DEFAULT_PARAMS;
        updateUrlWithParams(restoreParams, false);
        return {
          isDemoMode: false,
          params: restoreParams,
          savedUserParams: null,
          results: runMonteCarlo(restoreParams, state.numSimulations),
        };
      } else {
        // Turning ON Demo Mode -> Stash current params, load averages
        const demoParams = { ...state.params, ...AVERAGE_AMERICAN_PARAMS };
        updateUrlWithParams(demoParams, true);
        return {
          isDemoMode: true,
          savedUserParams: state.params,
          params: demoParams,
          results: runMonteCarlo(demoParams, state.numSimulations),
        };
      }
    }),

  resetDefaults: () =>
    set((state) => {
      // Create a fresh copy of constants so object ref changes
      const freshDefaults = { ...DEFAULT_PARAMS };

      // We push the brand new defaults to URL, while explicitly dropping demo flags
      updateUrlWithParams(freshDefaults, false);

      return {
        params: freshDefaults,
        isDemoMode: false,
        savedUserParams: null,
        results: runMonteCarlo(freshDefaults, state.numSimulations),
      };
    }),
}));
