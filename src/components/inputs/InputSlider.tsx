import React from "react";
import Tooltip from "../ui/Tooltip";

interface InputSliderProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  type?: "range" | "number";
  tooltip?: string;
}

const InputSlider: React.FC<InputSliderProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "",
  type = "range",
  tooltip,
}) => {
  return (
    <div className="mb-5">
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center min-w-0">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide truncate">
            {label}
          </label>
          {tooltip && <Tooltip text={tooltip} />}
        </div>
        <div className="text-xs font-mono text-indigo-400 shrink-0 ml-2">
          {unit === "$"
            ? `$${value.toLocaleString()}`
            : `${value.toLocaleString()}${unit}`}
        </div>
      </div>

      {type === "range" ? (
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 focus:outline-none"
        />
      ) : (
        <input
          type="number"
          min={min}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none font-mono"
        />
      )}
    </div>
  );
};

export default React.memo(InputSlider);
