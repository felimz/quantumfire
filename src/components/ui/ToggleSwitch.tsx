import React from "react";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible label for screen readers */
  label?: string;
  /** Optional title tooltip */
  title?: string;
}

/**
 * Reusable toggle switch component.
 *
 * Extracted from the 12+ inline toggle implementations in the Sidebar
 * to eliminate ~180 lines of duplicated JSX.
 */
const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  title,
}) => (
  <button
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
      checked ? "bg-indigo-500" : "bg-slate-700"
    }`}
    role="switch"
    aria-checked={checked}
    title={title}
  >
    {label && <span className="sr-only">{label}</span>}
    <span
      aria-hidden="true"
      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
        checked ? "translate-x-4" : "translate-x-0"
      }`}
    />
  </button>
);

export default ToggleSwitch;
