import React from "react";
import { LucideIcon } from "lucide-react";

interface MetricsCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  trend?: "positive" | "negative" | "neutral";
  subtext?: string;
}

const MetricsCard: React.FC<MetricsCardProps> = ({
  label,
  value,
  icon: Icon,
  trend,
  subtext,
}) => {
  const trendColors =
    trend === "positive"
      ? "text-emerald-400 bg-emerald-500/10"
      : trend === "negative"
        ? "text-rose-400 bg-rose-500/10"
        : "text-indigo-400 bg-indigo-500/10";

  return (
    <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-lg flex items-start space-x-4">
      <div className={`p-3 rounded-lg ${trendColors}`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          {label}
        </p>
        <h4 className="text-2xl font-bold text-white mt-1 font-mono">
          {value}
        </h4>
        {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
      </div>
    </div>
  );
};

export default React.memo(MetricsCard);
