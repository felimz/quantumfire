import React, { useState } from "react";
import { Layers } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useSimulationStore } from "../../store/useSimulationStore";
import LifeIncomeTab from "../sidebar/LifeIncomeTab";
import WealthSavingsTab from "../sidebar/WealthSavingsTab";
import StrategyTab from "../sidebar/StrategyTab";
import MarketTab from "../sidebar/MarketTab";

type Tab = "Life & Income" | "Wealth & Savings" | "Strategy" | "Market";
type DisclosureMode = "simple" | "pro";

/**
 * Sidebar Component (Tiered "Iceberg" Architecture)
 *
 * Implements a Progressive Disclosure UI to manage the high cognitive load of
 * the institutional Monte Carlo engine parameters.
 *
 * Modes:
 * 1. Simple: Core parameters only
 * 2. Pro: Full institutional control with advanced toggles
 *
 * Each tab's content is extracted into a standalone component for maintainability.
 */
interface SidebarProps {
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
}

const MODE_META: Record<
  DisclosureMode,
  { label: string; color: string; desc: string }
> = {
  simple: {
    label: "Simple",
    color: "text-emerald-400",
    desc: "Core parameters only",
  },
  pro: {
    label: "Pro",
    color: "text-indigo-400",
    desc: "Full institutional control",
  },
};

const Sidebar: React.FC<SidebarProps> = ({
  isMobileMenuOpen,
  setIsMobileMenuOpen,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>("Life & Income");
  const [mode, setMode] = useState<DisclosureMode>("pro");
  const { params, updateParam, updateStrategy } = useSimulationStore(
    useShallow((state) => ({
      params: state.params,
      updateParam: state.updateParam,
      updateStrategy: state.updateStrategy,
    })),
  );

  const tabs: Tab[] = [
    "Life & Income",
    "Wealth & Savings",
    "Strategy",
    "Market",
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-10 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Inputs */}
      <aside
        className={`
          w-full md:w-[380px] bg-slate-900 border-r border-slate-800 flex flex-col z-10
          ${isMobileMenuOpen ? "fixed inset-y-16 left-0 right-0 md:relative md:inset-auto" : "hidden md:flex"}
        `}
      >
        {/* ── Progressive Disclosure Mode Selector ── */}
        <div className="shrink-0 border-b border-slate-800/70 px-4 py-2.5 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Layers size={13} />
            <span>Complexity</span>
          </div>
          <div className="flex items-center gap-1 bg-slate-800 rounded-full p-0.5">
            {(Object.keys(MODE_META) as DisclosureMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150
                  ${
                    mode === m
                      ? `bg-slate-700 ${MODE_META[m].color}`
                      : "text-slate-500 hover:text-slate-300"
                  }`}
              >
                {MODE_META[m].label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-4 border-b border-slate-800 shrink-0 pt-2 px-1 gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`p-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider rounded-t-lg transition-colors flex items-center justify-center text-center leading-tight
                ${
                  activeTab === tab
                    ? "bg-slate-800 text-indigo-400 border-t-2 border-indigo-500"
                    : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
                }
              `}
              role="tab"
              aria-selected={activeTab === tab}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "Life & Income" && (
            <LifeIncomeTab params={params} updateParam={updateParam} mode={mode} />
          )}

          {activeTab === "Wealth & Savings" && (
            <WealthSavingsTab params={params} updateParam={updateParam} mode={mode} />
          )}

          {activeTab === "Strategy" && (
            <StrategyTab params={params} updateParam={updateParam} updateStrategy={updateStrategy} mode={mode} />
          )}

          {activeTab === "Market" && (
            <MarketTab params={params} updateParam={updateParam} mode={mode} />
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
