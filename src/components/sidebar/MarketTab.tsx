import React from "react";
import InputSlider from "../inputs/InputSlider";
import Tooltip from "../ui/Tooltip";
import ToggleSwitch from "../ui/ToggleSwitch";
import { SimulationParams } from "../../types";

interface MarketTabProps {
  params: SimulationParams;
  updateParam: <K extends keyof SimulationParams>(key: K, value: SimulationParams[K]) => void;
  mode: "simple" | "pro";
}

const MarketTab: React.FC<MarketTabProps> = ({ params, updateParam, mode }) => (
  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
    <div>
      <h3 className="text-white font-semibold mb-4 text-sm">Economic Assumptions</h3>
      <InputSlider
        label="Mean Return"
        value={parseFloat((params.meanReturn * 100).toFixed(1))}
        min={0}
        max={15}
        step={0.1}
        onChange={(v) => updateParam("meanReturn", v / 100)}
        unit="%"
        tooltip="The expected annual geometric return of the equity portfolio. Historical US market return (nominal) is ~10%. Lower this to stress-test your plan against prolonged weak markets."
      />
      <InputSlider
        label="Inflation"
        value={parseFloat((params.inflationRate * 100).toFixed(1))}
        min={0}
        max={10}
        step={0.1}
        onChange={(v) => updateParam("inflationRate", v / 100)}
        unit="%"
        tooltip="Base expected inflation rate. All expenses (outside fixed ones like a flat pension) grow by this rate annually. The long-term historical average is ~3%."
      />
      <InputSlider
        label="Volatility"
        value={parseFloat((params.volatility * 100).toFixed(1))}
        min={0}
        max={25}
        step={0.1}
        onChange={(v) => updateParam("volatility", v / 100)}
        unit="%"
        tooltip="Standard deviation of annual equity returns. Historical US market volatility is ~15-18%. Drives the spread of the Monte Carlo fan chart. Higher values require a lower withdrawal rate to survive sequence of returns risk."
      />
      <InputSlider
        label="Bond Allocation"
        value={parseFloat((params.bondAllocation * 100).toFixed(1))}
        min={0}
        max={80}
        step={5}
        onChange={(v) => updateParam("bondAllocation", v / 100)}
        unit="%"
        tooltip="Percentage of the portfolio held in bonds (fixed income). Lowers overall volatility but reduces expected returns. If Dynamic Glidepath is enabled, this becomes the target allocation at retirement age."
      />
    </div>

    {mode === "pro" && (
      <>
        <div className="h-px bg-slate-800 my-4" />

        {/* Advanced Portfolio & Glidepath */}
        <div>
          <h3 className="text-white font-semibold mb-4 text-sm">Advanced Portfolio Logic</h3>
          <InputSlider
            label="Bond Mean Return"
            value={parseFloat((params.bondMeanReturn * 100).toFixed(1))}
            min={0}
            max={8}
            step={0.1}
            onChange={(v) => updateParam("bondMeanReturn", v / 100)}
            unit="%"
            tooltip="Expected annual return of the bond portion. Bond volatility is currently hardcoded to 5% with a 0.2 correlation to equities."
          />
          <div className="flex items-center justify-between mt-4 mb-2 relative group">
            <span className="text-slate-400 text-xs inline-flex items-center">
              Dynamic Glidepath
              <Tooltip text="Linearly increases bond allocation from 0% start to your target Bond Allocation over the 15 years prior to Retirement Age (Target-Date Fund style)." />
            </span>
            <ToggleSwitch
              checked={params.glidepathEnabled}
              onChange={(v) => updateParam("glidepathEnabled", v)}
            />
          </div>
        </div>

        <div className="h-px bg-slate-800 my-4" />

        {/* Jump-Diffusion */}
        <div>
          <div className="flex items-center justify-between mb-3 relative group">
            <h3 className="text-white font-semibold text-sm inline-flex items-center">
              Merton Jump-Diffusion
              <Tooltip text="Injects sudden, Poisson-distributed market crashes into the geometric brownian motion. Better models the 'fat tails' and black swan events of real market distributions." />
            </h3>
            <ToggleSwitch
              checked={params.jumpDiffusionEnabled}
              onChange={(v) => updateParam("jumpDiffusionEnabled", v)}
            />
          </div>
          {params.jumpDiffusionEnabled && (
            <div className="space-y-3 border-l-2 border-indigo-500/30 pl-3 ml-1">
              <InputSlider
                label="Crash Intensity (λ)"
                value={parseFloat((params.jumpIntensity * 10).toFixed(1))}
                min={0}
                max={5}
                step={0.1}
                onChange={(v) => updateParam("jumpIntensity", v / 10)}
                unit="× 10⁻¹"
                tooltip="The Expected number of rare event 'jumps' per year. If set to 1.0 × 10⁻¹, that is roughly 1 crash per decade."
              />
              <InputSlider
                label="Avg Crash Magnitude"
                value={parseFloat((params.jumpMean * -100).toFixed(1))}
                min={5}
                max={50}
                step={1}
                onChange={(v) => updateParam("jumpMean", -(v / 100))}
                unit="%"
                tooltip="The average drop in portfolio value during a jump event (log-normal severity)."
              />
            </div>
          )}
        </div>

        <div className="h-px bg-slate-800 my-4" />

        {/* Clayton Copula */}
        <div>
          <div className="flex items-center justify-between mb-3 relative group">
            <h3 className="text-white font-semibold text-sm inline-flex items-center">
              Clayton Copula (Tail Dependence)
              <Tooltip text="Links stock and bond correlations asymmetrically. As the market falls, stocks and bonds move closer together (correlation approaches 1), defeating diversification exactly when you need it most." />
            </h3>
            <ToggleSwitch
              checked={params.copulaEnabled}
              onChange={(v) => updateParam("copulaEnabled", v)}
            />
          </div>
          {params.copulaEnabled && (
            <div className="border-l-2 border-indigo-500/30 pl-3 ml-1">
              <InputSlider
                label="Theta (θ)"
                value={params.copulaTheta}
                min={0.5}
                max={10}
                step={0.5}
                onChange={(v) => updateParam("copulaTheta", v)}
                tooltip="The intensity of the tail-dependence. Higher Theta means assets crash together far more violently."
              />
            </div>
          )}
        </div>

        <div className="h-px bg-slate-800 my-4" />

        {/* Stochastic Inflation */}
        <div>
          <div className="flex items-center justify-between mb-3 relative group">
            <h3 className="text-white font-semibold text-sm inline-flex items-center">
              Stochastic Inflation (OU)
              <Tooltip text="Models inflation as an Ornstein-Uhlenbeck process. Instead of a flat 3% every year, inflation wanders randomly but gets pulled back to the mean over time. Crucial for modeling 1970s-style stagflation spikes." />
            </h3>
            <ToggleSwitch
              checked={params.stochasticInflationEnabled}
              onChange={(v) => updateParam("stochasticInflationEnabled", v)}
            />
          </div>
          {params.stochasticInflationEnabled && (
            <div className="space-y-3 border-l-2 border-indigo-500/30 pl-3 ml-1">
              <InputSlider
                label="Reversion Speed (a)"
                value={params.inflationReversionSpeed}
                min={0.05}
                max={1}
                step={0.05}
                onChange={(v) => updateParam("inflationReversionSpeed", v)}
                tooltip="How quickly a high or low inflation 'shock' is pulled back to the baseline mean. Higher number = faster normalization (less sustained inflation)."
              />
              <InputSlider
                label="Volatility (σ)"
                value={parseFloat((params.inflationVolatility * 100).toFixed(1))}
                min={0.1}
                max={5}
                step={0.1}
                onChange={(v) => updateParam("inflationVolatility", v / 100)}
                unit="%"
                tooltip="The magnitude of the random shocks applied to the inflation rate each year."
              />
            </div>
          )}
        </div>
      </>
    )}
  </div>
);

export default MarketTab;
