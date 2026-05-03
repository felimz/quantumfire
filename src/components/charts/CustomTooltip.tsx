import React from "react";
import { TooltipProps } from "recharts";
import { YearResult } from "../../types";
import { formatCurrency } from "../../utils/format";

type CustomTooltipProps = TooltipProps<number, string> & {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: number;
};

const CustomTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  label,
}) => {
  if (!active || !payload?.length) return null;

  const data: YearResult = payload[0].payload;
  const isBreakdown = payload.some((p) => p.dataKey === "detDeferred");

  return (
    <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl shadow-2xl text-xs z-50 min-w-[220px]">
      <p className="font-bold text-slate-300 mb-3 font-mono text-sm border-b border-slate-800 pb-2">
        Age {label}
      </p>

      {isBreakdown ? (
        <>
          <div className="flex justify-between items-center mb-1">
            <span className="text-indigo-400 font-medium">401k/Deferred</span>
            <span className="text-white font-mono">
              {formatCurrency(data.detDeferred)}
            </span>
          </div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-cyan-400 font-medium">Brokerage</span>
            <span className="text-white font-mono">
              {formatCurrency(data.detTaxable)}
            </span>
          </div>
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-800">
            <span className="text-emerald-400 font-medium">Roth</span>
            <span className="text-white font-mono">
              {formatCurrency(data.detRoth)}
            </span>
          </div>
          {data.detHsa > 0 && (
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-800">
              <span className="text-amber-400 font-medium">HSA</span>
              <span className="text-white font-mono">
                {formatCurrency(data.detHsa)}
              </span>
            </div>
          )}
          <div
            className={`flex justify-between items-center pt-1 ${data.detHsa === 0 ? "border-t border-slate-800 mt-2" : ""}`}
          >
            <span className="text-slate-400 font-bold">Total (Base)</span>
            <span className="text-white font-mono font-bold">
              {formatCurrency(data.deterministic)}
            </span>
          </div>
        </>
      ) : (
        <>
          {/* Deterministic Baseline */}
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
              <span className="text-slate-400 font-medium">
                Baseline (Det.)
              </span>
            </div>
            <span className="text-cyan-500 font-mono font-bold">
              {formatCurrency(data.deterministic)}
            </span>
          </div>

          {/* Median */}
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
              <span className="text-slate-400 font-medium">Median</span>
            </div>
            <span className="text-indigo-400 font-mono font-bold">
              {formatCurrency(data.median)}
            </span>
          </div>

          {/* Range */}
          <div className="mt-3 pt-2 border-t border-slate-800">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-slate-500" />
              <span className="text-slate-400 font-medium">
                Range (10% - 90%)
              </span>
            </div>
            <div className="flex justify-between font-mono text-slate-500 pl-4">
              <span>{formatCurrency(data.p10)}</span>
              <span>-</span>
              <span>{formatCurrency(data.p90)}</span>
            </div>
          </div>
        </>
      )}

      {/* Unified Footer: Always show advanced data */}
      {data.detInflationMultiplier && (
        <div className="mt-3 pt-3 flex justify-between items-center border-t border-slate-800/50">
          <span className="text-slate-500 font-medium">Cum. Inflation</span>
          <span className="text-slate-400 font-mono text-[10px] bg-slate-800/50 px-1.5 py-0.5 rounded">
            {data.detInflationMultiplier.toFixed(3)}x
          </span>
        </div>
      )}
    </div>
  );
};

export default React.memo(CustomTooltip);
