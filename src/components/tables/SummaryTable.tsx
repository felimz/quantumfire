import React, { useMemo } from "react";
import { Download, Printer } from "lucide-react";
import { YearResult } from "../../types";
import { formatCurrency } from "../../utils/format";

interface SummaryTableProps {
  data: YearResult[];
  retirementAge: number;
}

const SummaryTable: React.FC<SummaryTableProps> = ({ data, retirementAge }) => {
  const displayData = useMemo(() => {
    const copy = [...data];
    const bankruptIndex = copy.findIndex((d) => d.median <= 0);
    if (bankruptIndex !== -1) {
      return copy.slice(0, bankruptIndex + 1);
    }
    return copy;
  }, [data]);

  const handleExportCsv = () => {
    const headers = [
      "Age",
      "Salary",
      "Taxable",
      "401k/Deferred",
      "Roth",
      "HSA",
      "Total Baseline NW",
      "Gross Withdrawal",
      "Net Withdrawal (Spend)",
      "Est. Taxes Paid",
      "Median Stochastic NW",
      "Success Probability %",
    ];

    const rows = displayData.map((row) => {
      const isRetirementYear = row.age === retirementAge;
      const inflows = row.salary;
      const estTaxes = row.taxPaid;
      const netWith = Math.max(0, row.totalWithdrawal - row.taxPaid);

      return [
        row.age + (isRetirementYear ? " (RETIRE)" : ""),
        inflows,
        row.detTaxable,
        row.detDeferred,
        row.detRoth,
        row.detHsa || 0,
        row.deterministic,
        row.totalWithdrawal,
        netWith,
        estTaxes,
        row.median,
        (row.mortalityWeightedSuccessRate ?? row.survivalRate).toFixed(1) + "%",
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "quantumfire_projection.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg print-container">
      <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900 print-hidden">
        <div>
          <h3 className="text-lg font-bold text-white">Projection Summary</h3>
          <p className="text-xs text-slate-400">
            Median Outcomes (Real Dollars, except where noted)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white rounded-md transition-colors border border-slate-700 hover:border-slate-600"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-md transition-colors border border-indigo-500/30 hover:border-indigo-500"
          >
            <Printer className="w-4 h-4" />
            PDF Report
          </button>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[600px] overflow-y-auto print-expand">
        <table className="w-full text-left border-collapse table-fixed">
          <colgroup>
            <col className="w-[5%]" /> {/* Age */}
            <col className="w-[9%]" /> {/* Inflows */}
            <col className="w-[9%]" /> {/* Gross With */}
            <col className="w-[9%]" /> {/* Net With */}
            <col className="w-[8%]" /> {/* Taxes */}
            <col className="w-[10%]" /> {/* Taxable */}
            <col className="w-[10%]" /> {/* 401k/Def */}
            <col className="w-[10%]" /> {/* Roth */}
            <col className="w-[9%]" /> {/* HSA */}
            <col className="w-[11%]" /> {/* Median NW */}
            <col className="w-[10%]" /> {/* Success % */}
          </colgroup>
          <thead className="bg-slate-950 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                Age
              </th>
              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 text-right">
                Salary
              </th>
              <th className="p-4 text-xs font-bold text-rose-400 uppercase tracking-wider border-b border-slate-800 text-right bg-rose-950/20">
                Gross With.
              </th>
              <th className="p-4 text-xs font-bold text-rose-300 uppercase tracking-wider border-b border-slate-800 text-right bg-rose-950/20">
                Net With.
              </th>
              <th className="p-4 text-xs font-bold text-rose-500 uppercase tracking-wider border-b border-slate-800 text-right bg-rose-950/20">
                Taxes
              </th>
              <th className="p-4 text-xs font-bold text-cyan-400 uppercase tracking-wider border-b border-slate-800 text-right bg-cyan-950/20">
                Taxable
              </th>
              <th className="p-4 text-xs font-bold text-indigo-400 uppercase tracking-wider border-b border-slate-800 text-right bg-indigo-950/20">
                401k/Def
              </th>
              <th className="p-4 text-xs font-bold text-secondary uppercase tracking-wider border-b border-slate-800 text-right bg-indigo-950/20">
                Roth
              </th>
              <th className="p-4 text-xs font-bold text-amber-500 uppercase tracking-wider border-b border-slate-800 text-right bg-amber-950/10">
                HSA
              </th>
              <th className="p-4 text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 text-right">
                Median NW
              </th>
              <th className="p-4 text-xs font-bold text-emerald-400 uppercase tracking-wider border-b border-slate-800 text-right">
                Success %
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {displayData.map((row) => {
              const isRetirementYear = row.age === retirementAge;
              const inflows = row.salary;
              const grossWith = row.totalWithdrawal;
              const estTaxes = row.taxPaid;
              const netWith = Math.max(0, row.totalWithdrawal - row.taxPaid);
              const successPercent =
                row.mortalityWeightedSuccessRate ?? row.survivalRate;

              return (
                <tr
                  key={row.age}
                  className={`hover:bg-slate-800/80 transition-colors ${isRetirementYear ? "bg-amber-500/10 hover:bg-amber-500/20" : ""}`}
                >
                  <td className="p-4 text-sm font-mono text-slate-300">
                    {row.age}
                    {isRetirementYear && (
                      <span className="ml-2 text-[10px] bg-amber-500 text-slate-900 px-1.5 py-0.5 rounded font-bold">
                        RETIRE
                      </span>
                    )}
                  </td>

                  <td className="p-4 text-sm font-mono text-slate-400 text-right">
                    {inflows > 0 ? (
                      formatCurrency(inflows)
                    ) : (
                      <span className="text-slate-700">-</span>
                    )}
                  </td>

                  <td className="p-4 text-sm font-mono text-rose-400 text-right bg-rose-950/10">
                    {grossWith > 0 ? (
                      formatCurrency(grossWith)
                    ) : (
                      <span className="text-rose-900/50">-</span>
                    )}
                  </td>

                  <td className="p-4 text-sm font-mono text-rose-300 font-medium text-right bg-rose-950/10">
                    {netWith > 0 ? (
                      formatCurrency(netWith)
                    ) : (
                      <span className="text-rose-900/50">-</span>
                    )}
                  </td>

                  <td className="p-4 text-sm font-mono text-rose-500 text-right bg-rose-950/10">
                    {estTaxes > 0 ? (
                      formatCurrency(estTaxes)
                    ) : (
                      <span className="text-rose-900/50">-</span>
                    )}
                  </td>

                  <td className="p-4 text-sm font-mono text-cyan-400 text-right bg-cyan-950/10">
                    {row.detTaxable > 0 ? (
                      formatCurrency(row.detTaxable)
                    ) : (
                      <span className="text-cyan-900/40">-</span>
                    )}
                  </td>

                  <td className="p-4 text-sm font-mono text-indigo-400 text-right bg-indigo-950/10">
                    {row.detDeferred > 0 ? (
                      formatCurrency(row.detDeferred)
                    ) : (
                      <span className="text-indigo-900/40">-</span>
                    )}
                  </td>

                  <td className="p-4 text-sm font-mono text-secondary text-right bg-indigo-950/10">
                    {row.detRoth > 0 ? (
                      formatCurrency(row.detRoth)
                    ) : (
                      <span className="text-secondary/30">-</span>
                    )}
                  </td>

                  <td className="p-4 text-sm font-mono text-amber-500/80 text-right bg-amber-950/5">
                    {row.detHsa && row.detHsa > 0 ? (
                      formatCurrency(row.detHsa)
                    ) : (
                      <span className="text-amber-900/30">-</span>
                    )}
                  </td>

                  <td className="p-4 text-sm font-mono text-slate-200 font-bold text-right border-l border-slate-800">
                    {formatCurrency(row.median)}
                  </td>

                  <td
                    className={`p-4 text-sm font-mono font-bold text-right ${successPercent >= 90 ? "text-emerald-400" : successPercent >= 70 ? "text-amber-400" : "text-rose-500"}`}
                  >
                    {successPercent.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default React.memo(SummaryTable);
