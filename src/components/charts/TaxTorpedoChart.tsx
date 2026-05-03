import React, { useMemo } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceDot,
} from "recharts";
import { useShallow } from "zustand/react/shallow";
import { useSimulationStore } from "../../store/useSimulationStore";
import { calculateTaxes, calculateTaxableSS } from "../../engine/taxEngine";
import { formatCurrency } from "../../utils/format";
import { COLORS } from "../../constants";

interface DataPoint {
  withdrawal: number;
  taxableSS: number;
  totalTax: number;
  marginalRate: number;
  effectiveRate: number;
}

const TaxTorpedoChart: React.FC = () => {
  const { params } = useSimulationStore(
    useShallow((state) => ({ params: state.params })),
  );

  const data = useMemo(() => {
    const ssAnnual = params.socialSecurityMonthly * 12;
    // We'll hold pension/other income constant if they exist, but for the purest
    // torpedo visualization, we isolate IRA withdrawals vs SS.
    const pensionAnnual = params.pensionEnabled
      ? params.pensionMonthly * 12
      : 0;

    const points: DataPoint[] = [];
    const step = 2000; // $2k increments

    // Dynamically scale the x-axis based on the user's actual deferred balance,
    // assuming a max practical single-year withdrawal of ~10% of the balance,
    // bounded between $100k and $500k to maintain chart readability.
    const dynamicMax = Math.max(
      100_000,
      Math.min(500_000, params.deferred * 0.1),
    );
    const maxWithdrawal = Math.ceil(dynamicMax / 10000) * 10000; // Round to nearest 10k

    let prevWithdrawal = 0;
    let prevTax = 0;

    for (let w = 0; w <= maxWithdrawal; w += step) {
      const otherIncome = pensionAnnual + w;

      const taxableSS = calculateTaxableSS(ssAnnual, otherIncome);
      const ordinaryIncome = otherIncome + taxableSS;

      const taxRes = calculateTaxes(ordinaryIncome, 0);
      const totalTax = taxRes.ordinaryTax;

      let marginalRate = 0;
      if (w > 0) {
        const taxDelta = totalTax - prevTax;
        const incomeDelta = w - prevWithdrawal;
        marginalRate = incomeDelta > 0 ? (taxDelta / incomeDelta) * 100 : 0;
      }

      // Effective rate based on REAL cash flow (withdrawal + SS)
      const totalCashFlow = w + ssAnnual + pensionAnnual;
      const effectiveRate =
        totalCashFlow > 0 ? (totalTax / totalCashFlow) * 100 : 0;

      points.push({
        withdrawal: w,
        taxableSS,
        totalTax,
        marginalRate: Math.max(0, marginalRate),
        effectiveRate,
      });

      prevWithdrawal = w;
      prevTax = totalTax;
    }

    // Smooth out the first marginal point which is 0 due to 0 division/step
    if (points.length > 1) {
      points[0].marginalRate = points[1].marginalRate;
    }

    return points;
  }, [params]);

  // Find the exact tip of the torpedo (highest marginal rate)
  const maxMarginalPoint = useMemo(() => {
    let max = data[0];
    for (const p of data) {
      if (p.marginalRate > max.marginalRate) max = p;
    }
    return max;
  }, [data]);

  return (
    <div className="w-full h-[400px] bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg">
      <div className="mb-4">
        <h3 className="font-bold text-white text-lg">The "Tax Torpedo"</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-2xl">
          Visualizes the marginal tax spike that occurs when tax-deferred
          withdrawals (401k/IRA) force your Social Security benefits to become
          taxable. This dramatically increases your marginal rate.
        </p>
      </div>

      <div className="flex-1 w-full h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 20, right: 50, left: 20, bottom: 25 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={COLORS.grid}
              vertical={false}
              opacity={0.3}
            />
            <XAxis
              dataKey="withdrawal"
              tickFormatter={(val) => formatCurrency(val).replace(".00", "")}
              tick={{ fontSize: 12, fill: COLORS.neutral }}
              tickLine={false}
              axisLine={false}
              minTickGap={30}
              label={{
                value: "Assuming Additional 401k/IRA Withdrawal",
                position: "insideBottom",
                offset: -5,
                fill: COLORS.neutral,
                fontSize: 12,
              }}
            />

            {/* Left Y-Axis for Marginal/Effective % */}
            <YAxis
              yAxisId="left"
              tickFormatter={(val) => `${val}%`}
              tick={{ fontSize: 12, fill: COLORS.warning }}
              tickLine={false}
              axisLine={false}
              domain={[0, "auto"]}
              label={{
                value: "Tax Rate (%)",
                angle: -90,
                position: "insideLeft",
                fill: COLORS.warning,
                fontSize: 12,
                offset: 0,
              }}
            />

            {/* Right Y-Axis for Dollar Amounts */}
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(val) => formatCurrency(val).replace(".00", "")}
              tick={{ fontSize: 12, fill: COLORS.primary }}
              tickLine={false}
              axisLine={false}
              label={{
                value: "Taxable SS Benefit ($)",
                angle: 90,
                position: "insideRight",
                fill: COLORS.primary,
                fontSize: 12,
                offset: 0,
              }}
            />

            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                borderColor: "#1e293b",
                borderRadius: "8px",
              }}
              itemStyle={{ color: "#e2e8f0", fontSize: "12px" }}
              labelStyle={{
                color: "#94a3b8",
                fontSize: "12px",
                marginBottom: "8px",
              }}
              formatter={(value: number, name: string) => {
                if (name === "Marginal Rate" || name === "Effective Rate")
                  return [`${value.toFixed(1)}%`, name];
                return [formatCurrency(value), name];
              }}
              labelFormatter={(label: number) =>
                `401k Withdrawal: ${formatCurrency(label)}`
              }
            />

            <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />

            <Area
              yAxisId="right"
              type="monotone"
              dataKey="taxableSS"
              name="Taxable Social Security"
              fill={COLORS.secondary}
              stroke="none"
              fillOpacity={0.15}
              animationDuration={750}
            />

            {/* Effective Rate Line */}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="effectiveRate"
              name="Effective Rate"
              stroke={COLORS.primary}
              strokeWidth={2}
              dot={false}
              animationDuration={750}
            />

            {/* Marginal Rate Torpedo Line */}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="marginalRate"
              name="Marginal Rate"
              stroke={COLORS.warning}
              strokeWidth={3}
              dot={false}
              animationDuration={750}
            />

            <ReferenceDot
              yAxisId="left"
              x={maxMarginalPoint.withdrawal}
              y={maxMarginalPoint.marginalRate}
              r={5}
              fill={COLORS.warning}
              stroke="#fff"
              strokeWidth={2}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default React.memo(TaxTorpedoChart);
