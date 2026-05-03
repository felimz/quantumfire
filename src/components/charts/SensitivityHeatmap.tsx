import React, { useState, useRef, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSimulationStore } from "../../store/useSimulationStore";
import { Play } from "lucide-react";
import SimulationWorker from "../../engine/simulation.worker?worker";
import type { HeatmapRequest, HeatmapResult, HeatmapCell } from "../../engine/simulation.worker";

const SensitivityHeatmap: React.FC = () => {
  const { params } = useSimulationStore(
    useShallow((state) => ({ params: state.params })),
  );
  const [data, setData] = useState<HeatmapCell[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  // Define the matrix dimensions
  const withdrawalRates = [0.028, 0.03, 0.033, 0.035, 0.038, 0.04, 0.043];
  const bondAllocations = [0.0, 0.1, 0.2, 0.3, 0.5, 0.6, 0.7];

  const handleRun = useCallback(() => {
    setIsCalculating(true);
    setData([]);

    // Terminate any prior worker to avoid stale results
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    try {
      const worker = new SimulationWorker();
      workerRef.current = worker;

      worker.onmessage = (e: MessageEvent<HeatmapResult>) => {
        setData(e.data.data);
        setIsCalculating(false);
        worker.terminate();
        workerRef.current = null;
      };

      worker.onerror = (err) => {
        console.error("Heatmap worker error:", err);
        setIsCalculating(false);
        worker.terminate();
        workerRef.current = null;
      };

      const request: HeatmapRequest = {
        type: "heatmap",
        params,
        withdrawalRates,
        bondAllocations,
        numSimulations: 2000, // Fast 2k-path Monte Carlo (Total 98,000 paths)
      };
      worker.postMessage(request);
    } catch {
      console.warn("Web Workers not available for heatmap, falling back to main thread");
      // Fallback: import runMonteCarlo dynamically
      import("../../engine/monteCarlo").then(({ runMonteCarlo }) => {
        const results: HeatmapCell[] = [];
        for (const wr of withdrawalRates) {
          for (const bnd of bondAllocations) {
            const testParams = {
              ...params,
              initialWithdrawalRate: wr,
              bondAllocation: bnd,
              glidepathEnabled: false,
            };
            const simRes = runMonteCarlo(testParams, 2000);
            results.push({ x: bnd, y: wr, value: simRes.successRate });
          }
        }
        setData(results);
        setIsCalculating(false);
      });
    }
  }, [params]);

  return (
    <div className="w-full bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h3 className="font-bold text-white text-lg">
            Safe Withdrawal Rate Sensitivity
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Generates a 2D Heatmap of Monte Carlo success rates, varying Initial
            Withdrawal Rate against Bond Allocation. Runs 49 parallel scenarios
            (98,000 total paths) off the main thread to keep the UI responsive.
          </p>
        </div>

        <button
          onClick={handleRun}
          disabled={isCalculating}
          className="shrink-0 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          {isCalculating ? (
            <>
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              Calculating...
            </>
          ) : (
            <>
              <Play size={16} fill="currentColor" />
              Generate Map
            </>
          )}
        </button>
      </div>

      {data.length > 0 && (
        <div className="mt-6 border border-slate-800 rounded-lg overflow-hidden shadow-inner">
          {/* Header Row */}
          <div className="flex bg-slate-950 border-b border-slate-800">
            <div className="w-24 flex flex-col items-center justify-center p-2 text-[10px] text-slate-400 font-bold border-r border-slate-800 tracking-wider">
              <span>WITHDRAWAL</span>
              <span className="text-slate-600">vs</span>
              <span>BOND</span>
            </div>
            {bondAllocations.map((bnd) => (
              <div
                key={`header-${bnd}`}
                className="flex-1 text-center p-2 text-xs text-slate-300 font-bold border-r border-slate-800 last:border-r-0"
              >
                {Math.round(bnd * 100)}% Bonds
              </div>
            ))}
          </div>

          {/* Data Rows */}
          {(() => {
            const minVal =
              data.length > 0 ? Math.min(...data.map((d) => d.value)) : 0;
            const maxVal =
              data.length > 0 ? Math.max(...data.map((d) => d.value)) : 100;
            const range = Math.max(0.1, maxVal - minVal);

            return withdrawalRates.map((wr) => (
              <div
                key={`row-${wr}`}
                className="flex border-b border-slate-800 last:border-b-0"
              >
                {/* Left Header Column */}
                <div className="w-24 bg-slate-950 flex items-center justify-center p-2 text-xs text-indigo-400 font-bold border-r border-slate-800 font-mono">
                  {(wr * 100).toFixed(2)}% WR
                </div>

                {/* Heatmap Cells */}
                {bondAllocations.map((bnd) => {
                  const cell = data.find((d) => d.x === bnd && d.y === wr);
                  const val = cell ? cell.value : 0;

                  // Dynamic background coloring mapped strictly to the min/max range
                  const normalizedVal = (val - minVal) / range;
                  const hue = Math.floor(normalizedVal * 120); // 0 (red) to 120 (green)
                  const bgOpacity = 0.15 + normalizedVal * 0.25;

                  // Text mapped statically to the required ranges: < 70% (red), <= 80% (light red/pink), <= 90% (pinkish white), > 90% (white)
                  let textStyle = { color: "#ffffff" };
                  if (val < 70) {
                    textStyle = { color: "#f43f5e" }; // rose-500
                  } else if (val <= 90) {
                    // interpolate from #f43f5e (red) to #ffffff (white) between 70 and 90
                    const t = (val - 70) / 20;
                    const r = 244 + t * (255 - 244);
                    const g = 63 + t * (255 - 63);
                    const b = 94 + t * (255 - 94);
                    textStyle = {
                      color: `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`,
                    };
                  }

                  return (
                    <div
                      key={`cell-${wr}-${bnd}`}
                      className="flex-1 relative h-16 border-r border-slate-800 last:border-r-0 flex flex-col items-center justify-center group overflow-hidden"
                    >
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundColor: `hsla(${hue}, 80%, 50%, ${bgOpacity})`,
                        }}
                      ></div>

                      {/* Highlight strictly best cells */}
                      {val === 100 && (
                        <div className="absolute top-0 right-0 w-8 h-8 pointer-events-none">
                          <div className="absolute transform rotate-45 bg-emerald-400 text-[8px] font-bold text-slate-900 py-0.5 right-[-10px] top-[4px] w-[30px] text-center shadow">
                            ★
                          </div>
                        </div>
                      )}

                      <span
                        className="relative z-10 font-mono font-bold group-hover:scale-110 transition-transform"
                        style={textStyle}
                      >
                        {val.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
};

export default React.memo(SensitivityHeatmap);
