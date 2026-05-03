import React from "react";
import InputSlider from "../inputs/InputSlider";
import ToggleSwitch from "../ui/ToggleSwitch";
import { SimulationParams } from "../../types";

interface LifeIncomeTabProps {
  params: SimulationParams;
  updateParam: <K extends keyof SimulationParams>(key: K, value: SimulationParams[K]) => void;
  mode: "simple" | "pro";
}

const LifeIncomeTab: React.FC<LifeIncomeTabProps> = ({ params, updateParam, mode }) => (
  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
    <div>
      <h3 className="text-white font-semibold mb-4 text-sm">Timeline</h3>
      <InputSlider
        label="Current Age"
        value={params.currentAge}
        min={20}
        max={70}
        onChange={(v) => updateParam("currentAge", v)}
        type="number"
        tooltip="Your age today. Sets the starting point of the simulation and determines how many accumulation years remain before retirement."
      />
      <InputSlider
        label="Retirement Age"
        value={params.retirementAge}
        min={params.currentAge + 1}
        max={80}
        onChange={(v) => updateParam("retirementAge", v)}
        type="number"
        tooltip="Age at which you stop earning salary and begin withdrawing from the portfolio. Earlier retirement means more years of draw-down and fewer years of compounding."
      />
    </div>

    {mode === "pro" && (
      <>
        <div className="h-px bg-slate-800 my-4" />
        <div>
          <h3 className="text-white font-semibold mb-4 text-sm">Advanced Timeline</h3>
          <InputSlider
            label="Death Age"
            value={params.deathAge}
            min={params.retirementAge + 1}
            max={100}
            onChange={(v) => updateParam("deathAge", v)}
            type="number"
            tooltip="Planning horizon — the age through which the simulation runs. Higher values stress-test longevity risk. A conservative planner often sets this to 95–100."
          />
        </div>
      </>
    )}

    <div className="h-px bg-slate-800 my-4" />

    <div>
      <h3 className="text-white font-semibold mb-4 text-sm">Income</h3>
      <InputSlider
        label="Salary"
        value={params.salary}
        min={50000}
        max={500000}
        step={1000}
        onChange={(v) => updateParam("salary", v)}
        unit="$"
        type="number"
        tooltip="Your current gross pre-tax annual salary. Used to calculate accumulated contributions and the replacement-rate spending target at retirement."
      />
      {mode === "pro" && (
        <InputSlider
          label="Salary Growth"
          value={parseFloat((params.salaryGrowth * 100).toFixed(1))}
          min={0}
          max={10}
          step={0.1}
          onChange={(v) => updateParam("salaryGrowth", v / 100)}
          unit="%"
          tooltip="Annual nominal wage growth (before inflation). Raises both your future salary and the final income used to compute the retirement spending target."
        />
      )}

      <div className="h-px bg-slate-800 my-4" />

      <h3 className="text-white font-semibold mb-4 text-sm">Social Security</h3>
      <InputSlider
        label="Expected SS Benefit"
        value={params.socialSecurityMonthly}
        min={0}
        max={6000}
        step={100}
        onChange={(v) => updateParam("socialSecurityMonthly", v)}
        unit="$/mo"
        type="number"
        tooltip="Your estimated monthly Social Security benefit in today's dollars. Check ssa.gov for your personal estimate. The simulation models the IRS phase-in where up to 85% becomes taxable income."
      />

      {mode === "pro" && (
        <>
          <InputSlider
            label="SS Claiming Age"
            value={params.socialSecurityAge}
            min={62}
            max={70}
            step={1}
            onChange={(v) => updateParam("socialSecurityAge", v)}
            type="number"
            tooltip="Age you claim SS benefits. Claiming early (62) permanently reduces benefits ~30%. Delaying to 70 grows them ~8%/yr in real terms. Interacts strongly with the Tax Torpedo — earlier claiming compounds RMD risk."
          />

          <div className="h-px bg-slate-800 my-4" />

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold text-sm">Pension Income</h3>
            <ToggleSwitch
              checked={params.pensionEnabled}
              onChange={(v) => updateParam("pensionEnabled", v)}
            />
          </div>
          {params.pensionEnabled && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 border-l-2 border-indigo-500/30 pl-3 ml-1">
              <InputSlider
                label="Monthly Pension"
                value={params.pensionMonthly}
                min={0}
                max={10000}
                step={100}
                onChange={(v) => updateParam("pensionMonthly", v)}
                unit="$/mo"
                type="number"
                tooltip="Fixed monthly payment from a defined-benefit plan (e.g., government pension, military retirement). The simulation treats this as inflation-adjusted income starting at your pension start age."
              />
              <InputSlider
                label="Start Age"
                value={params.pensionStartAge}
                min={50}
                max={75}
                step={1}
                onChange={(v) => updateParam("pensionStartAge", v)}
                type="number"
                tooltip="Age at which pension payments begin. Payments before Social Security age reduce the withdrawal burden on the portfolio during the early retirement years."
              />
            </div>
          )}
        </>
      )}
    </div>
  </div>
);

export default LifeIncomeTab;
