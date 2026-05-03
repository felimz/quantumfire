import React, { useState } from "react";
import {
  TrendingUp,
  Target,
  AlertOctagon,
  BarChart2,
  Flame,
  Activity,
} from "lucide-react";

import { useShallow } from "zustand/react/shallow";
import { useSimulationStore } from "../../store/useSimulationStore";
import { formatCurrency } from "../../utils/format";

import ResultsChart from "../charts/ResultsChart";
import TaxTorpedoChart from "../charts/TaxTorpedoChart";
import SensitivityHeatmap from "../charts/SensitivityHeatmap";
import MetricsCard from "../metrics/MetricsCard";
import SummaryTable from "../tables/SummaryTable";

type TabId = "overview" | "cashflow" | "stress";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: Tab[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "cashflow", label: "Cash Flow & Taxes", icon: Flame },
  { id: "stress", label: "Stress Testing", icon: BarChart2 },
];

/**
 * Main Content Control Center
 *
 * Orchestrates the visualization and analysis of the Monte Carlo simulation.
 * Tabbed architecture separates distinct analytical domains:
 * 1. Overview: Growth trajectories, fan charts, and top-line probabilistic KPIs.
 * 2. Cash Flow & Taxes: Deterministic mapping of withdrawal strategies and the progressive tax torpedo.
 * 3. Stress Testing: 2D Safe Withdrawal Rate heatmaps and system sensitivity metrics.
 */
const MainContent: React.FC = () => {
  const { params, results } = useSimulationStore(
    useShallow((state) => ({ params: state.params, results: state.results })),
  );
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Loading skeleton while initial simulation runs on the Web Worker
  if (!results) {
    return (
      <main className="flex-1 overflow-y-auto bg-slate-950 relative flex flex-col">
        <div className="shrink-0 border-b border-slate-800 bg-slate-900 px-4 lg:px-8">
          <div className="max-w-6xl mx-auto flex items-center gap-1 h-12">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  className="flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium text-slate-400"
                  disabled
                >
                  <Icon size={15} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Skeleton KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
                  <div className="h-4 w-24 bg-slate-800 rounded animate-pulse mb-3" />
                  <div className="h-8 w-20 bg-slate-800 rounded animate-pulse mb-2" />
                  <div className="h-3 w-32 bg-slate-800/50 rounded animate-pulse" />
                </div>
              ))}
            </div>
            {/* Skeleton Chart */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="h-4 w-48 bg-slate-800 rounded animate-pulse mb-4" />
              <div className="h-64 bg-slate-800/30 rounded-lg animate-pulse flex items-center justify-center">
                <div className="flex items-center gap-3 text-slate-600">
                  <div className="w-5 h-5 border-2 border-slate-600 border-t-indigo-400 rounded-full animate-spin" />
                  <span className="text-sm font-medium">Running 20,000 Monte Carlo paths...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-slate-950 relative flex flex-col">
      {/* Tab Bar */}
      <div className="shrink-0 border-b border-slate-800 bg-slate-900 px-4 lg:px-8">
        <div className="max-w-6xl mx-auto flex items-center gap-1 h-12">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-all duration-150 relative
                  ${
                    isActive
                      ? "text-indigo-400 bg-slate-950 border-t border-l border-r border-slate-800 -mb-px"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* ── TAB 1: OVERVIEW ── */}
          {activeTab === "overview" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricsCard
                  label="Mortality-Weighted Success"
                  value={`${results.mortalityWeightedSuccessRate?.toFixed(1) ?? results.successRate.toFixed(1)}%`}
                  icon={Target}
                  trend={
                    (results.mortalityWeightedSuccessRate ??
                      results.successRate) > 90
                      ? "positive"
                      : (results.mortalityWeightedSuccessRate ??
                            results.successRate) > 75
                        ? "neutral"
                        : "negative"
                  }
                  subtext={`Raw Success: ${results.successRate.toFixed(1)}%`}
                />
                <MetricsCard
                  label="Baseline Legacy (Det.)"
                  value={formatCurrency(results.deterministicTerminalWealth)}
                  icon={TrendingUp}
                  trend="positive"
                  subtext="Deterministic Model (No Volatility)"
                />
                <MetricsCard
                  label="Worst Case (10%)"
                  value={formatCurrency(results.worstCaseTerminalWealth)}
                  icon={AlertOctagon}
                  trend={
                    results.worstCaseTerminalWealth > 0
                      ? "positive"
                      : "negative"
                  }
                  subtext="Conservative Estimate"
                />
              </div>

              {/* Main Fan Chart */}
              <ResultsChart
                data={results.data}
                retirementAge={params.retirementAge}
                percentilePaths={results.percentilePaths}
                percentileDetails={results.percentileDetails}
              />

              {/* Summary Table */}
              <SummaryTable
                data={results.data}
                retirementAge={params.retirementAge}
              />
            </div>
          )}

          {/* ── TAB 2: CASH FLOW & TAXES ── */}
          {activeTab === "cashflow" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
                <h2 className="text-white font-bold text-base mb-1">
                  Cash Flow & Tax Analysis
                </h2>
                <p className="text-xs text-slate-400 max-w-2xl">
                  These analytical charts are computed directly from the
                  engine's tax models. They are not Monte Carlo outputs — they
                  show the structural tax mechanics that shape every retirement
                  path.
                </p>
              </div>
              <TaxTorpedoChart />
            </div>
          )}

          {/* ── TAB 3: STRESS TESTING ── */}
          {activeTab === "stress" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
                <h2 className="text-white font-bold text-base mb-1">
                  Stress Testing & Sensitivity
                </h2>
                <p className="text-xs text-slate-400 max-w-2xl">
                  Explore portfolio resilience across a matrix of withdrawal
                  rates and asset allocations. Each cell runs an independent
                  Monte Carlo simulation. Click "Generate Map" to begin (runs
                  ~32,000 paths).
                </p>
              </div>
              <SensitivityHeatmap />
            </div>
          )}
        </div>
      </div>
    </main>
  );
};

export default MainContent;
