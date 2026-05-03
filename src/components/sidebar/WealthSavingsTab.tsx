import React from "react";
import InputSlider from "../inputs/InputSlider";
import ToggleSwitch from "../ui/ToggleSwitch";
import { SimulationParams } from "../../types";

interface WealthSavingsTabProps {
  params: SimulationParams;
  updateParam: <K extends keyof SimulationParams>(key: K, value: SimulationParams[K]) => void;
  mode: "simple" | "pro";
}

const WealthSavingsTab: React.FC<WealthSavingsTabProps> = ({ params, updateParam, mode }) => (
  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
    <div>
      <h3 className="text-white font-semibold mb-4 text-sm">Current Balances</h3>
      <InputSlider
        label="401k Balance"
        value={params.deferred}
        min={0}
        max={2000000}
        step={1000}
        onChange={(v) => updateParam("deferred", v)}
        unit="$"
        type="number"
        tooltip="Your current pre-tax 401k/IRA balance. This is the tax-deferred bucket: growth and withdrawals are fully taxable as ordinary income. RMDs begin at age 73 and are modeled automatically."
      />
      <InputSlider
        label="Brokerage Balance"
        value={params.taxable}
        min={0}
        max={2000000}
        step={1000}
        onChange={(v) => updateParam("taxable", v)}
        unit="$"
        type="number"
        tooltip="After-tax brokerage account. Withdrawals trigger long-term or short-term capital gains tax depending on lot holding period. The HIFO (Highest-In-First-Out) lot tracking strategy minimizes tax drag."
      />

      {mode === "pro" && (
        <>
          <InputSlider
            label="Roth IRA Balance"
            value={params.roth}
            min={0}
            max={1000000}
            step={1000}
            onChange={(v) => updateParam("roth", v)}
            unit="$"
            type="number"
            tooltip="Your current Roth IRA balance. This grows and distributed completely tax-free. The simulation draws from Roth last (after taxable and deferred) to maximize tax-free compounding."
          />
          <InputSlider
            label="HSA Balance"
            value={params.hsa}
            min={0}
            max={200000}
            step={1000}
            onChange={(v) => updateParam("hsa", v)}
            unit="$"
            type="number"
            tooltip="Your current Health Savings Account balance. Triple tax-advantaged (pre-tax contributions, tax-free growth, tax-free out for medical expenses). The simulation depletes HSA before the investment waterfall for all healthcare and LTC costs."
          />
        </>
      )}
    </div>

    <div className="h-px bg-slate-800 my-4" />

    <div>
      <h3 className="text-white font-semibold mb-4 text-sm">Annual Contributions</h3>
      <InputSlider
        label="Employee 401k Contrib."
        value={params.contribution401k}
        min={0}
        max={75000}
        step={500}
        onChange={(v) => updateParam("contribution401k", v)}
        unit="$"
        type="number"
        tooltip="Annual employee pre-tax 401k contribution. 2026 limit is $24,500 ($32,500 if 50+). Compounds tax-deferred until withdrawal. Increases 401k balance and reduces taxable income during accumulation."
      />

      {mode === "pro" && (
        <div className="space-y-4 border-l-2 border-indigo-500/30 pl-3 ml-1 mb-6 mt-4">
          <InputSlider
            label="Employer Match"
            value={parseFloat((params.companyMatchRate * 100).toFixed(1))}
            min={0}
            max={15}
            step={0.5}
            onChange={(v) => updateParam("companyMatchRate", v / 100)}
            unit="%"
            tooltip="Percentage of your gross salary your employer contributes as a standard match."
          />
          <InputSlider
            label="Employer Discretionary"
            value={parseFloat((params.companyDiscretionaryRate * 100).toFixed(1))}
            min={0}
            max={15}
            step={0.5}
            onChange={(v) => updateParam("companyDiscretionaryRate", v / 100)}
            unit="%"
            tooltip="Additional profit-sharing or discretionary non-elective contributions the company makes yearly."
          />
        </div>
      )}

      {mode === "pro" && (
        <>
          <InputSlider
            label="Brokerage Contrib."
            value={params.contributionBrokerage}
            min={0}
            max={100000}
            step={500}
            onChange={(v) => updateParam("contributionBrokerage", v)}
            unit="$"
            type="number"
            tooltip="Additional annual savings deposited directly into the taxable brokerage account. No contribution limits. Gains are taxed as capital gains at withdrawal, not ordinary income, giving it a tax advantage over the 401k at higher income levels."
          />
          <InputSlider
            label="Roth IRA Contrib."
            value={params.contributionRoth}
            min={0}
            max={40000}
            step={500}
            onChange={(v) => updateParam("contributionRoth", v)}
            unit="$"
            type="number"
            tooltip="Annual Roth IRA or Roth 401k contribution made with after-tax dollars. 2026 limit is $7,500 ($8,600 if 50+). Grows and withdraws completely tax-free. Prefer Roth if you expect higher future tax rates."
          />
          <InputSlider
            label="HSA Contrib."
            value={params.contributionHSA}
            min={0}
            max={8750}
            step={50}
            onChange={(v) => updateParam("contributionHSA", v)}
            unit="$"
            type="number"
            tooltip="Annual Health Savings Account contribution. 2026 family limit is $8,750 ($4,400 individual). Triple tax-advantaged: pre-tax in, tax-free growth, tax-free out for medical expenses."
          />
        </>
      )}

      {mode === "pro" && <div className="h-px bg-slate-800 my-4" />}

      {mode === "pro" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold text-sm">Real Estate Downsize</h3>
            <ToggleSwitch
              checked={params.realEstateDownsizeEnabled}
              onChange={(v) => updateParam("realEstateDownsizeEnabled", v)}
            />
          </div>
          {params.realEstateDownsizeEnabled && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 border-l-2 border-indigo-500/30 pl-3 ml-1 mb-6">
              <InputSlider
                label="Downsize Age"
                value={params.realEstateDownsizeAge}
                min={55}
                max={90}
                step={1}
                onChange={(v) => updateParam("realEstateDownsizeAge", v)}
                type="number"
                tooltip="Age at which you sell your home and move to a smaller property or rental. Injected as a lump-sum into the taxable brokerage at that age."
              />
              <InputSlider
                label="Net Cash Proceeds"
                value={params.realEstateDownsizeNetProceeds}
                min={0}
                max={2000000}
                step={10000}
                onChange={(v) => updateParam("realEstateDownsizeNetProceeds", v)}
                unit="$"
                type="number"
                tooltip="Net after-tax cash released from the home sale (home equity minus selling costs and capital gains above the $500k exclusion). Immediately raises the withdrawal floor."
              />
            </div>
          )}

          <div className="h-px bg-slate-800 my-4" />

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold text-sm">Healthcare & LTC Shock</h3>
            <ToggleSwitch
              checked={params.ltcShockEnabled}
              onChange={(v) => updateParam("ltcShockEnabled", v)}
            />
          </div>
          {params.ltcShockEnabled && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 border-l-2 border-indigo-500/30 pl-3 ml-1">
              <InputSlider
                label="Lifetime Prob."
                value={parseFloat((params.ltcShockLifetimeProbability * 100).toFixed(1))}
                min={0}
                max={100}
                step={1}
                onChange={(v) => updateParam("ltcShockLifetimeProbability", v / 100)}
                unit="%"
                tooltip="Probability that a catastrophic LTC event occurs at all during this person's lifetime. The HHS estimates ~70% of people turning 65 will need some LTC, but a severe nursing-home stay is ~15%. This drives a stochastic binary event in each path."
              />
              <InputSlider
                label="Annual Cost"
                value={params.ltcShockAnnualCost}
                min={0}
                max={300000}
                step={5000}
                onChange={(v) => updateParam("ltcShockAnnualCost", v)}
                unit="$/yr"
                type="number"
                tooltip="Annual cost of the LTC event in today's dollars ($100k–$150k for full-time nursing care). Inflated at the healthcare inflation rate during the simulation. Paid through the standard withdrawal waterfall, with HSA preserved as a last resort."
              />
            </div>
          )}
        </>
      )}
    </div>
  </div>
);

export default WealthSavingsTab;
