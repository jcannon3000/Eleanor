import type { SlideType } from "./types";

interface ProgressBarProps {
  current: number;
  total: number;
  currentType: SlideType;
}

// Hidden on soil-background slides
const HIDDEN_TYPES: SlideType[] = ["opening", "closing"];

export function ProgressBar({ current, total, currentType }: ProgressBarProps) {
  if (HIDDEN_TYPES.includes(currentType)) return null;

  const pct = ((current + 1) / total) * 100;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: 3,
        background: "rgba(212,137,106,0.2)",
        zIndex: 100,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: "#D4896A",
          transition: "width 300ms ease",
        }}
      />
    </div>
  );
}
