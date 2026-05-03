import React, { useState } from "react";
import { Activity } from "lucide-react";
import Sidebar from "../components/layout/Sidebar";
import MainContent from "../components/layout/MainContent";
import { useShallow } from "zustand/react/shallow";
import { useSimulationStore } from "../store/useSimulationStore";

const App: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isSimulating, numSimulations, isDemoMode, toggleDemoMode } =
    useSimulationStore(
      useShallow((state) => ({
        isSimulating: state.isSimulating,
        numSimulations: state.numSimulations,
        isDemoMode: state.isDemoMode,
        toggleDemoMode: state.toggleDemoMode,
      })),
    );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 shrink-0 z-20">
        <div className="max-w-full px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600 w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
              <Activity size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-3">
              <span>
                Quantum<span className="text-indigo-500">Fire</span>
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-2 md:gap-4 mt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={useSimulationStore.getState().resetDefaults}
                className="text-[10px] px-3 py-1 rounded-full uppercase tracking-widest font-bold font-mono transition-colors border bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 hover:bg-slate-700 hover:border-slate-500"
                title="Reset to Baseline Defaults"
              >
                Reset
              </button>
              <button
                onClick={toggleDemoMode}
                className={`text-[10px] px-3 py-1 rounded-full uppercase tracking-widest font-bold font-mono transition-colors border ${
                  isDemoMode
                    ? "bg-rose-500/20 text-rose-400 border-rose-500/50 hover:bg-rose-500/30 hover:border-rose-400"
                    : "bg-indigo-500/10 text-indigo-400 border-indigo-500/30 hover:text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/50"
                }`}
                title={
                  isDemoMode
                    ? "Exit Demo Mode"
                    : "Load 'Average American' Default Parameters"
                }
              >
                {isDemoMode ? "Exit Demo" : "Demo"}
              </button>
            </div>
            <div className="hidden md:flex items-center gap-3 text-sm font-mono text-slate-500">
              <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-md border border-slate-700 shadow-sm transition-colors hover:border-slate-500 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/50">
                <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">
                  Runs:
                </span>
                <select
                  className="bg-transparent text-slate-200 font-medium outline-none cursor-pointer appearance-none pr-4 relative"
                  style={{
                    backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 0rem top 55%",
                    backgroundSize: "0.5rem auto",
                  }}
                  value={numSimulations}
                  onChange={(e) =>
                    useSimulationStore
                      .getState()
                      .setNumSimulations(Number(e.target.value))
                  }
                  aria-label="Number of Monte Carlo simulations"
                >
                  <option value={5000} className="bg-slate-900 border-none">
                    5,000 (Fast)
                  </option>
                  <option value={10000} className="bg-slate-900 border-none">
                    10,000
                  </option>
                  <option value={20000} className="bg-slate-900 border-none">
                    20,000 (Standard)
                  </option>
                  <option value={40000} className="bg-slate-900 border-none">
                    40,000 (Hi-Res)
                  </option>
                  <option value={100000} className="bg-slate-900 border-none">
                    100,000 (Stress)
                  </option>
                </select>
              </div>
              {isSimulating && (
                <span className="text-indigo-400 animate-pulse">
                  ● Calculating...
                </span>
              )}
            </div>
            <button
              className="md:hidden text-slate-400 p-2"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar
          isMobileMenuOpen={isMobileMenuOpen}
          setIsMobileMenuOpen={setIsMobileMenuOpen}
        />
        <MainContent />
      </div>
    </div>
  );
};

export default App;
