import React, { useMemo, useState, useEffect } from "react";
import {
  ComposedChart,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import {
  Maximize2,
  Minimize2,
  Layers,
  BarChart3,
  Activity,
  Eye,
  EyeOff,
  TrendingUp,
} from "lucide-react";
import { YearResult } from "../../types";
import { COLORS } from "../../constants";
import { formatCurrency } from "../../utils/format";
import CustomTooltip from "./CustomTooltip";

/**
 * Core Visualization Engine for the Monte Carlo Simulation.
 *
 * Features:
 * - Exponential Fan Chart (5th to 95th percentiles) using SVG glow filters.
 * - Dynamic Y-Axis (Linear to Log scale shift for massive multi-decade compound growth).
 * - "Path Dependency Scrubber": Allows users to natively interact with the fan chart,
 *   tracing the exact longitudinal sequence of returns (crashes, drawdowns) for
 *   any specific percentile outcome (1st through 99th).
 */
interface ResultsChartProps {
  data: YearResult[];
  retirementAge: number;
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

const ResultsChart: React.FC<ResultsChartProps> = ({
  data,
  retirementAge,
  percentilePaths,
  percentileDetails,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [viewMode, setViewMode] = useState<"netWorth" | "breakdown">(
    "netWorth",
  );
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPercentile, setScrubPercentile] = useState(50);
  const [isBandsVisible, setIsBandsVisible] = useState(true);
  const [isLogScale, setIsLogScale] = useState(false);
  const userOverrodeLogScale = React.useRef(false);

  // Auto-enable log scale on mount if the data is massive
  useEffect(() => {
    if (data.length > 0 && !userOverrodeLogScale.current) {
      const maxVal = Math.max(
        ...data.map((d) => Math.max(d.p90, d.deterministic)),
      );
      if (maxVal > 30_000_000) {
        setIsLogScale(true);
      } else {
        setIsLogScale(false);
      }
    }
  }, [data]);

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMaximized(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  // Sanitize Data
  const sanitizedData = useMemo(() => {
    const LOG_FLOOR = isLogScale ? 10000 : -10000000;

    return data.map((d, i) => {
      const newItem = {
        ...d,
      } as YearResult & {
        scrubPath?: number;
        rangeOuter?: [number, number];
        rangeInner?: [number, number];
      };

      if (isScrubbing && percentilePaths && percentilePaths[scrubPercentile]) {
        const scrubVal = percentilePaths[scrubPercentile][i] ?? 0;
        newItem.scrubPath = Math.max(scrubVal, LOG_FLOOR);
      }

      newItem.p10 = Math.max(d.p10, LOG_FLOOR);
      newItem.median = Math.max(d.median, LOG_FLOOR);
      newItem.p90 = Math.max(d.p90, LOG_FLOOR);
      newItem.deterministic = Math.max(d.deterministic, LOG_FLOOR);
      newItem.p5 = Math.max(d.p5, LOG_FLOOR);
      newItem.p25 = Math.max(d.p25, LOG_FLOOR);
      newItem.p75 = Math.max(d.p75, LOG_FLOOR);
      newItem.p95 = Math.max(d.p95, LOG_FLOOR);

      newItem.rangeOuter = [
        Math.max(d.p5, LOG_FLOOR),
        Math.max(d.p95, LOG_FLOOR),
      ];
      newItem.rangeInner = [
        Math.max(d.p25, LOG_FLOOR),
        Math.max(d.p75, LOG_FLOOR),
      ];

      newItem.detTaxable = Math.max(d.detTaxable, 0);
      newItem.detDeferred = Math.max(d.detDeferred, 0);
      newItem.detRoth = Math.max(d.detRoth, 0);

      return newItem;
    });
  }, [data, isScrubbing, scrubPercentile, percentilePaths, isLogScale]);

  const [yAxisMax, setYAxisMax] = useState<number | "auto">("auto");
  const previousViewModeRef = React.useRef(viewMode);
  const previousScaleRef = React.useRef(isLogScale);
  const previousBandsRef = React.useRef(isBandsVisible);

  // Debounced/cushioned Y-Axis auto-scalling to prevent jittering during slider tweaks
  useEffect(() => {
    if (sanitizedData.length === 0) return;

    let forceSnap = false;
    // Reset snap instantly if user completely changes view paradigm
    if (
      previousViewModeRef.current !== viewMode ||
      previousScaleRef.current !== isLogScale ||
      previousBandsRef.current !== isBandsVisible
    ) {
      forceSnap = true;
      previousViewModeRef.current = viewMode;
      previousScaleRef.current = isLogScale;
      previousBandsRef.current = isBandsVisible;
    }

    let currentMax = 0;
    for (let i = 0; i < sanitizedData.length; i++) {
      const d = sanitizedData[i];
      if (viewMode === "netWorth") {
        if (isBandsVisible && d.rangeOuter && d.rangeOuter[1] > currentMax)
          currentMax = d.rangeOuter[1];
        else if (!isBandsVisible && d.median > currentMax)
          currentMax = d.median;

        if (d.deterministic > currentMax) currentMax = d.deterministic;
        if (d.scrubPath && d.scrubPath > currentMax) currentMax = d.scrubPath;
      } else {
        const total =
          d.detTaxable + d.detDeferred + d.detRoth + (d.detHsa || 0);
        if (total > currentMax) currentMax = total;
      }
    }

    if (currentMax < 10) {
      setYAxisMax("auto");
      return;
    }

    const paddedMax = currentMax * 1.1; // 10% breathing room over the highest peak

    setYAxisMax((prev) => {
      if (forceSnap || prev === "auto") return paddedMax;

      // Only force an axis rescale if the new point breaches the ceiling,
      // or massively drops underneath it (to prevent scaling locking way too high if parameters shrink hugely)
      if (paddedMax > prev || paddedMax < prev * 0.6) {
        return paddedMax;
      }
      return prev;
    });
  }, [sanitizedData, viewMode, isLogScale, isBandsVisible]);

  return (
    <div
      className={`
        transition-all duration-300 ease-in-out flex flex-col
        ${
          isMaximized
            ? "fixed inset-0 z-50 bg-slate-950 p-6 md:p-10"
            : "h-[400px] lg:h-[500px] w-full bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg relative"
        }
      `}
    >
      <div className="flex justify-between items-start mb-4 px-2 shrink-0">
        <div>
          <h3
            className={`font-bold text-white ${isMaximized ? "text-2xl" : "text-lg"}`}
          >
            {viewMode === "netWorth"
              ? "Projected Net Worth"
              : "Baseline Account Breakdown"}
          </h3>
          <p className="text-xs text-slate-500 flex items-center gap-2 mt-1">
            Inflation Adjusted (Real Dollars)
            {viewMode === "netWorth" && isLogScale && (
              <span className="text-indigo-400 font-mono text-[10px] bg-indigo-500/10 px-1 rounded border border-indigo-500/20">
                LOG SCALE
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          {/* View Toggle */}
          <div
            className="flex bg-slate-800 rounded-lg p-1"
            role="tablist"
            aria-label="Chart view"
          >
            <button
              onClick={() => setViewMode("netWorth")}
              className={`p-1.5 rounded-md transition-all ${viewMode === "netWorth" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
              title="Net Worth Projection"
              role="tab"
              aria-selected={viewMode === "netWorth"}
            >
              <BarChart3 size={16} />
            </button>
            <button
              onClick={() => {
                setViewMode("breakdown");
                setIsScrubbing(false);
              }}
              className={`p-1.5 rounded-md transition-all ${viewMode === "breakdown" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
              title="Account Breakdown"
              role="tab"
              aria-selected={viewMode === "breakdown"}
            >
              <Layers size={16} />
            </button>
            {viewMode === "netWorth" && (
              <div className="w-px bg-slate-700 mx-1" />
            )}
            {viewMode === "netWorth" && (
              <button
                onClick={() => setIsScrubbing(!isScrubbing)}
                className={`p-1.5 rounded-md transition-all border ${isScrubbing ? "bg-rose-500/20 text-rose-400 border-rose-500/50" : "border-transparent text-slate-400 hover:text-white"}`}
                title="Interactive Path Scrubber"
              >
                <Activity size={16} />
              </button>
            )}
            {viewMode === "netWorth" && (
              <button
                onClick={() => {
                  setIsLogScale(!isLogScale);
                  userOverrodeLogScale.current = true;
                }}
                className={`p-1.5 rounded-md transition-all border ${isLogScale ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/50" : "border-transparent text-slate-400 hover:text-white"}`}
                title={
                  isLogScale
                    ? "Switch to Linear Scale"
                    : "Switch to Logarithmic Scale"
                }
              >
                <TrendingUp size={16} />
              </button>
            )}
            {viewMode === "netWorth" && (
              <button
                onClick={() => setIsBandsVisible(!isBandsVisible)}
                className={`p-1.5 rounded-md transition-all border ${!isBandsVisible ? "bg-slate-700 text-slate-300 border-slate-600" : "border-transparent text-slate-400 hover:text-white"}`}
                title={
                  isBandsVisible
                    ? "Hide Confidence Bands"
                    : "Show Confidence Bands"
                }
              >
                {isBandsVisible ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            )}
          </div>

          {/* Legend — visible on all sizes */}
          <div className="hidden sm:flex flex-wrap gap-4 text-xs font-bold justify-end border-l border-slate-800 pl-4 ml-2">
            {viewMode === "netWorth" ? (
              <>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-1 bg-cyan-500 rounded-full shadow-[0_0_5px_rgba(6,182,212,0.5)]"></div>{" "}
                  Baseline
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-1 bg-indigo-500 rounded-full"></div>{" "}
                  Median
                </div>
                {isBandsVisible && (
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-slate-700 border border-slate-600 rounded"></div>{" "}
                    5th-95th Percentile
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-indigo-500 rounded"></div> 401k
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-cyan-500 rounded"></div> Brokerage
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-emerald-500 rounded"></div> Roth
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-amber-500 rounded"></div> HSA
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="text-slate-400 hover:text-white hover:bg-slate-800 p-2 rounded-lg transition-colors"
            title={isMaximized ? "Minimize Graph" : "Maximize Graph"}
            aria-label={isMaximized ? "Minimize chart" : "Maximize chart"}
          >
            {isMaximized ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
        </div>
      </div>

      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          {viewMode === "netWorth" ? (
            <ComposedChart
              data={sanitizedData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorMedian" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={COLORS.primary}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={COLORS.primary}
                    stopOpacity={0}
                  />
                </linearGradient>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
                  <feComponentTransfer in="coloredBlur" result="softBlur">
                    <feFuncA type="linear" slope="0.7" />
                  </feComponentTransfer>
                  <feMerge>
                    <feMergeNode in="softBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={COLORS.grid}
                vertical={false}
                opacity={0.3}
              />

              <XAxis
                dataKey="age"
                tick={{ fontSize: 12, fill: COLORS.neutral }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={30}
              />

              <YAxis
                tickFormatter={(val) => formatCurrency(val)}
                tick={{ fontSize: 12, fill: COLORS.neutral }}
                tickLine={false}
                axisLine={false}
                width={60}
                scale={isLogScale ? "log" : "linear"}
                domain={[isLogScale ? 10000 : "auto", yAxisMax]}
              />

              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: COLORS.grid, strokeWidth: 1 }}
              />

              <ReferenceLine
                x={retirementAge}
                stroke={COLORS.warning}
                strokeDasharray="3 3"
                label={{
                  value: "Retire",
                  fill: COLORS.warning,
                  fontSize: 10,
                  position: "insideTopLeft",
                }}
              />

              {/* Sequence of Returns Risk: Fragility Zone */}
              <ReferenceArea
                x1={Math.max(sanitizedData[0]?.age || 0, retirementAge - 5)}
                x2={Math.min(
                  sanitizedData[sanitizedData.length - 1]?.age || 100,
                  retirementAge + 10,
                )}
                fill={COLORS.warning}
                fillOpacity={0.06}
              />

              {/* 1. Outer Range Fan (Bottom Layer) */}
              {isBandsVisible && (
                <Area
                  type="monotone"
                  dataKey="rangeOuter"
                  stroke="none"
                  fill="#94a3b8"
                  fillOpacity={0.1}
                  animationDuration={750}
                  name="5th-95th Percentile"
                />
              )}

              {/* 1.5. Inner Range Fan (Middle Layer) */}
              {isBandsVisible && (
                <Area
                  type="monotone"
                  dataKey="rangeInner"
                  stroke="none"
                  fill="#94a3b8"
                  fillOpacity={0.15}
                  animationDuration={750}
                  name="25th-75th Percentile"
                />
              )}

              {/* 2. Median Area (Middle Layer) */}
              <Area
                type="monotone"
                dataKey="median"
                stroke={COLORS.primary}
                strokeWidth={3}
                fill="url(#colorMedian)"
                name="Median"
                animationDuration={750}
              />

              {/* 3. Deterministic Line (Top Layer) */}
              <Line
                type="monotone"
                dataKey="deterministic"
                stroke={COLORS.deterministic}
                strokeWidth={isScrubbing ? 1.5 : 2.5}
                strokeOpacity={isScrubbing ? 0.4 : 0.9}
                dot={false}
                activeDot={{ r: 6, fill: COLORS.deterministic, stroke: "#fff" }}
                name="Baseline"
                filter={isScrubbing ? undefined : "url(#glow)"}
                animationDuration={750}
                isAnimationActive={true}
              />

              {/* 4. Scrubbed Path Line (Highlight Layer) */}
              {isScrubbing && (
                <Line
                  type="monotone"
                  dataKey="scrubPath"
                  stroke="#fb7185" // vibrant rose-400
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6, fill: "#fb7185", stroke: "#fff" }}
                  name={`${scrubPercentile}th Percentile Path`}
                  filter="url(#glow)"
                  animationDuration={0} // instant update while scrubbing
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          ) : (
            <AreaChart
              data={sanitizedData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={COLORS.grid}
                vertical={false}
                opacity={0.3}
              />
              <XAxis
                dataKey="age"
                tick={{ fontSize: 12, fill: COLORS.neutral }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={30}
              />
              <YAxis
                tickFormatter={(val) => formatCurrency(val)}
                tick={{ fontSize: 12, fill: COLORS.neutral }}
                tickLine={false}
                axisLine={false}
                width={60}
                domain={[0, yAxisMax === "auto" ? "auto" : yAxisMax]}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: COLORS.grid, strokeWidth: 1 }}
              />
              <ReferenceLine
                x={retirementAge}
                stroke={COLORS.warning}
                strokeDasharray="3 3"
              />

              {/* Sequence of Returns Risk: Fragility Zone */}
              <ReferenceArea
                x1={Math.max(sanitizedData[0]?.age || 0, retirementAge - 5)}
                x2={Math.min(
                  sanitizedData[sanitizedData.length - 1]?.age || 100,
                  retirementAge + 10,
                )}
                fill={COLORS.warning}
                fillOpacity={0.06}
              />

              <Area
                type="monotone"
                dataKey="detHsa"
                stackId="1"
                stroke={COLORS.warning}
                fill={COLORS.warning}
                fillOpacity={0.8}
                name="HSA"
                animationDuration={750}
              />
              <Area
                type="monotone"
                dataKey="detRoth"
                stackId="1"
                stroke={COLORS.secondary}
                fill={COLORS.secondary}
                fillOpacity={0.8}
                name="Roth"
                animationDuration={750}
              />
              <Area
                type="monotone"
                dataKey="detTaxable"
                stackId="1"
                stroke={COLORS.deterministic}
                fill={COLORS.deterministic}
                fillOpacity={0.8}
                name="Brokerage"
                animationDuration={750}
              />
              <Area
                type="monotone"
                dataKey="detDeferred"
                stackId="1"
                stroke={COLORS.primary}
                fill={COLORS.primary}
                fillOpacity={0.8}
                name="401k/Deferred"
                animationDuration={750}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Path Dependency Scrubber UI */}
      {viewMode === "netWorth" &&
        isScrubbing &&
        percentileDetails &&
        percentileDetails[scrubPercentile] && (
          <div className="mt-4 bg-slate-900 border border-slate-700/80 p-4 rounded-xl shadow-inner animate-in slide-in-from-bottom-2 shrink-0">
            <div className="flex flex-col sm:flex-row gap-5 items-center">
              <div className="flex-1 w-full flex flex-col justify-center">
                <div className="flex justify-between text-xs text-slate-400 mb-2 px-1">
                  <span>1st Percentile (Worst)</span>
                  <span className="text-rose-400 font-bold tracking-wide">
                    {scrubPercentile}th PERCENTILE PATH
                  </span>
                  <span>99th Percentile (Best)</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="99"
                  step="1"
                  value={scrubPercentile}
                  onChange={(e) => setScrubPercentile(parseInt(e.target.value))}
                  className="w-full accent-rose-500 bg-slate-800 h-2 rounded-lg appearance-none cursor-ew-resize border border-slate-700"
                />
              </div>
              <div className="sm:w-2/5 text-xs text-slate-300 border-l border-slate-700/80 pl-5 py-0.5">
                <span className="block text-slate-400 uppercase tracking-wider text-[10px] font-bold mb-1">
                  Path Metrics
                </span>
                <p className="leading-snug">
                  This exact sequence experienced{" "}
                  <span className="text-white font-bold">
                    {percentileDetails[scrubPercentile].crashes} crashes
                  </span>{" "}
                  (years dropping {">"}15%) and a maximum peak-to-trough
                  drawdown of{" "}
                  <span className="text-white font-bold">
                    {(
                      percentileDetails[scrubPercentile].maxDrawdown * 100
                    ).toFixed(1)}
                    %
                  </span>
                  .
                </p>
                {percentileDetails[scrubPercentile].depletionAge && (
                  <p className="mt-1.5 text-rose-400 font-bold bg-rose-500/10 inline-block px-2 py-0.5 rounded border border-rose-500/20">
                    Depleted at age{" "}
                    {percentileDetails[scrubPercentile].depletionAge}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default React.memo(ResultsChart);
