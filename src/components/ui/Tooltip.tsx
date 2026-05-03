import React, { useState, useRef, useEffect, ReactPortal } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";

/**
 * Robust UI Tooltip using React Portals.
 *
 * Escapes hidden overflow boundaries (like the Sidebar scope) by rendering
 * directly into the `document.body` DOM level. Dynamic positioning relies
 * on `getBoundingClientRect` relative to the wrapper element, ensuring perfect
 * z-index stacking above complex UI trees.
 */
interface TooltipProps {
  text: string;
}

const Tooltip: React.FC<TooltipProps> = ({ text }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);

  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();

      // Calculate position (centering horizontally, placing above)
      // Tooltip width is 224px (w-56)
      let x = rect.left + rect.width / 2 - 112;
      const y = rect.top - 8; // 8px spacing above the icon

      // Basic bounds checking for screen edges
      if (x < 10) x = 10;
      if (x + 224 > window.innerWidth - 10) x = window.innerWidth - 234;

      setCoords({ x, y });
      setIsVisible(true);
    }
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  // Close tooltip on scroll (since it's fixed position)
  useEffect(() => {
    if (isVisible) {
      const handleScroll = () => setIsVisible(false);
      window.addEventListener("scroll", handleScroll, true);
      return () => window.removeEventListener("scroll", handleScroll, true);
    }
  }, [isVisible]);

  let portal: ReactPortal | null = null;

  if (isVisible && typeof document !== "undefined") {
    portal = createPortal(
      <div
        className="fixed z-9999 w-56 p-2.5 rounded-lg bg-slate-800 border border-slate-700 text-[11px] leading-relaxed text-slate-300 shadow-xl shadow-black/80 pointer-events-none transform -translate-y-full animate-in fade-in zoom-in-95 duration-150"
        style={{ left: `${coords.x}px`, top: `${coords.y}px` }}
        role="tooltip"
      >
        {text}
        {/* Simple downward pointing arrow indicator */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-t-[6px] border-t-slate-700 border-x-[6px] border-x-transparent" />
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-t-[5px] border-t-slate-800 border-x-[5px] border-x-transparent -mt-px" />
      </div>,
      document.body,
    );
  }

  return (
    <span
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="inline-flex items-center ml-1.5 cursor-help shrink-0"
    >
      <HelpCircle
        size={12}
        className={`transition-colors ${isVisible ? "text-slate-300" : "text-slate-600 hover:text-slate-400"}`}
      />
      {portal}
    </span>
  );
};

export default Tooltip;
