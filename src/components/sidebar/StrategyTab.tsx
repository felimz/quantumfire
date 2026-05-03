import React from "react";
import InputSlider from "../inputs/InputSlider";
import Tooltip from "../ui/Tooltip";
import ToggleSwitch from "../ui/ToggleSwitch";
import { SimulationParams } from "../../types";

interface StrategyTabProps {
  params: SimulationParams;
  updateParam: <K extends keyof SimulationParams>(key: K, value: SimulationParams[K]) => void;
  updateStrategy: (strategy: "replacement" | "percentage") => void;
  mode: "simple" | "pro";
}

const StrategyTab: React.FC<StrategyTabProps> = ({ params, updateParam, updateStrategy, mode }) => (
  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
    <div>
      <h3 className="text-white font-semibold mb-4 text-sm">Retirement Spending</h3>

      <div className="flex bg-slate-800 rounded-lg p-1 mb-5" role="tablist">
        <button
          onClick={() => updateStrategy("percentage")}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            params.withdrawalStrategy === "percentage"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-400 hover:text-white"
          }`}
          role="tab"
          aria-selected={params.withdrawalStrategy === "percentage"}
        >
          Portfolio %
        </button>
        <button
          onClick={() => updateStrategy("replacement")}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            params.withdrawalStrategy === "replacement"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-400 hover:text-white"
          }`}
          role="tab"
          aria-selected={params.withdrawalStrategy === "replacement"}
        >
          Salary %
        </button>
      </div>

      {params.withdrawalStrategy === "replacement" ? (
        <InputSlider
          label="Replacement Rate"
          value={Math.round(params.retirementSpendReplacement * 100)}
          min={20}
          max={120}
          step={5}
          onChange={(v) => updateParam("retirementSpendReplacement", v / 100)}
          unit="% of Final Salary"
          tooltip="The fraction of your final working salary you plan to spend each year in retirement. Most planners use 70–80%. Higher earners often need less due to reduced payroll taxes and savings contributions."
        />
      ) : (
        <InputSlider
          label="Initial Withdrawal Rate"
          value={parseFloat((params.initialWithdrawalRate * 100).toFixed(1))}
          min={1}
          max={10}
          step={0.1}
          onChange={(v) => updateParam("initialWithdrawalRate", v / 100)}
          unit="%"
          tooltip="The classic '4% Rule' starting withdrawal. This dollar amount is set at retirement and inflation-adjusted each year. 4% has historically provided 30-year portfolio survival with high confidence. Lower means more safety; higher means more lifestyle."
        />
      )}

      {mode === "pro" && <div className="h-px bg-slate-800 my-4" />}

      {mode === "pro" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold text-sm inline-flex items-center">
              Tax-Aware Withdrawals
              <Tooltip text="Fidelity Alternate Strategy: Pre-drain 401k to fill low bracket and avoid RMD torpedo. Smooths taxes across retirement." />
            </h3>
            <ToggleSwitch
              checked={params.taxAwareBracketFill}
              onChange={(v) => updateParam("taxAwareBracketFill", v)}
            />
          </div>
          {params.taxAwareBracketFill && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 border-l-2 border-indigo-500/30 pl-3 ml-1 mb-4">
              <InputSlider
                label="Bracket Cap"
                value={params.taxAwareBracketCap}
                min={24800}
                max={550000}
                step={1000}
                onChange={(v) => updateParam("taxAwareBracketCap", v)}
                unit="$"
                type="number"
                tooltip="Maximum ordinary income you want to realize each year via 401k withdrawals. Set to the top of your target bracket: $211,400 (22% MFJ 2026), $105,700 (22% single), $512,450 (32% MFJ). The engine pre-drains the 401k up to this amount annually, converting net proceeds to Roth."
              />
              <p className="text-xs text-slate-500">
                Pre-drains the 401k up to this income threshold each year,
                converting excess to Roth. Smooths the Tax Torpedo.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between mb-4 mt-6">
            <div className="flex items-center gap-2">
              <h3 className="text-white font-semibold text-sm">Proportional Withdrawals</h3>
              <Tooltip text="Instead of draining accounts sequentially (Taxable -> Def -> Roth), withdraw from all buckets proportionally relative to their balances. Smoothes out brackets and reduces terminal tax bombs." />
            </div>
            <ToggleSwitch
              checked={params.proportionalWithdrawals}
              onChange={(v) => updateParam("proportionalWithdrawals", v)}
              title="Fidelity Alternate Strategy: Withdraw proportionally"
            />
          </div>

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold text-sm inline-flex items-center">
              Guyton-Klinger Guardrails
              <Tooltip text="Dynamic spending policy that adjusts your withdrawals based on portfolio performance. Prevents early portfolio depletion but causes fluctuating retirement income." />
            </h3>
            <ToggleSwitch
              checked={params.spendingPolicy === "guytonKlinger"}
              onChange={(v) =>
                updateParam("spendingPolicy", v ? "guytonKlinger" : "fixedReal")
              }
              label="Enable Guyton-Klinger Guardrails"
            />
          </div>

          {params.spendingPolicy === "guytonKlinger" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 border-l-2 border-indigo-500/30 pl-3 ml-1">
              <InputSlider
                label="Capital Preservation Rule (Cut Spend)"
                value={parseFloat(((params.gkCapitalPreservationThreshold - 1) * 100).toFixed(1))}
                min={0}
                max={50}
                step={5}
                onChange={(v) => updateParam("gkCapitalPreservationThreshold", 1 + v / 100)}
                unit="% over Init WR"
                tooltip="If the current withdrawal rate exceeds the initial rate by this %, spending is cut by the Adjustment Rate and the inflation adjustment is skipped. Typical: 20%. Prevents spending drift in bear markets."
              />
              <InputSlider
                label="Prosperity Rule (Raise Spend)"
                value={parseFloat(((1 - params.gkProsperityThreshold) * 100).toFixed(1))}
                min={0}
                max={50}
                step={5}
                onChange={(v) => updateParam("gkProsperityThreshold", 1 - v / 100)}
                unit="% under Init WR"
                tooltip="If the current withdrawal rate falls below the initial rate by this %, spending is raised by the Adjustment Rate. Typical: 20%. Allows lifestyle inflation in strong bull markets."
              />
              <InputSlider
                label="Adjustment Rate"
                value={parseFloat((params.gkAdjustmentRate * 100).toFixed(1))}
                min={1}
                max={20}
                step={1}
                onChange={(v) => updateParam("gkAdjustmentRate", v / 100)}
                unit="%"
                tooltip="The magnitude of each spending adjustment when a guardrail is triggered. 10% is standard. Applied symmetrically for cuts (Capital Preservation) and raises (Prosperity)."
              />
            </div>
          )}

          <div className="h-px bg-slate-800 my-4" />

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold text-sm inline-flex items-center">
              Roth Conversions (Gap Years)
              <Tooltip text="Convert funds from tax-deferred (401k) to tax-free (Roth) in early retirement years before RMDs begin. Paying taxes now at a low bracket prevents explosive RMDs later." />
            </h3>
            <ToggleSwitch
              checked={params.rothConversionEnabled}
              onChange={(v) => updateParam("rothConversionEnabled", v)}
              label="Enable Roth Conversions"
            />
          </div>

          {params.rothConversionEnabled && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 border-l-2 border-indigo-500/30 pl-3 ml-1">
              <InputSlider
                label="Annual Target (Today $)"
                value={params.rothConversionAmount}
                min={0}
                max={200000}
                step={5000}
                onChange={(v) => updateParam("rothConversionAmount", v)}
                unit="$ / yr"
                type="number"
                tooltip="The projected nominal amount to convert to Roth each year. The system pays the conversion taxes from your taxable brokerage bucket."
              />
              <InputSlider
                label="Stop Conversions At Age"
                value={params.rothConversionEndAge}
                min={55}
                max={90}
                step={1}
                onChange={(v) => updateParam("rothConversionEndAge", v)}
                tooltip="Age to cease Roth conversions. Usually set to when Social Security or RMDs begin, as tax brackets typically rise significantly at that point."
              />
            </div>
          )}

          <div className="h-px bg-slate-800 my-4" />

          <div className="flex items-center justify-between mb-4 relative group">
            <div>
              <h3 className="text-white font-semibold text-sm inline-flex items-center">
                Advanced Tax Engine
                <Tooltip text="Enables progressive tax brackets, Medicare IRMAA surcharges, Net Investment Income Tax (NIIT), and the complex Social Security taxation phase-in loop (the 'Tax Torpedo'). Tremendously increases simulation realism at the cost of computational speed." />
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Progressive brackets, NIIT, SS phase-in
              </p>
            </div>
            <ToggleSwitch
              checked={params.advancedTaxEnabled}
              onChange={(v) => updateParam("advancedTaxEnabled", v)}
            />
          </div>

          {!params.advancedTaxEnabled && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 border-l-2 border-indigo-500/30 pl-3 ml-1">
              <InputSlider
                label="Effective Income Tax"
                value={parseFloat((params.taxRateIncome * 100).toFixed(1))}
                min={0}
                max={50}
                step={0.5}
                onChange={(v) => updateParam("taxRateIncome", v / 100)}
                unit="%"
                tooltip="Flat percentage applied to ordinary income (salary, pensions, 401k withdrawals) when the Advanced Tax Engine is disabled."
              />
              <InputSlider
                label="LT Capital Gains Rate"
                value={parseFloat((params.taxRateCapGains * 100).toFixed(1))}
                min={0}
                max={30}
                step={0.5}
                onChange={(v) => updateParam("taxRateCapGains", v / 100)}
                unit="%"
                tooltip="Flat percentage applied to investment gains in the taxable brokerage account."
              />
            </div>
          )}
        </>
      )}
    </div>
  </div>
);

export default StrategyTab;
