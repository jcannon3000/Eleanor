import { motion } from "framer-motion";
import { Sprout } from "lucide-react";
import { clsx } from "clsx";

export function StreakBadge({ count, size = "md" }: { count: number; size?: "sm" | "md" | "lg" }) {
  const isMilestone = [4, 8, 12, 24, 52].includes(count);
  const hasStreak = count >= 2;

  if (!hasStreak) {
    return (
      <div className={clsx(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/50 text-muted-foreground border border-border/50",
        size === "sm" && "text-xs",
        size === "md" && "text-sm",
        size === "lg" && "text-base px-4 py-1.5"
      )}>
        <Sprout size={size === "sm" ? 12 : 14} className="opacity-60" />
        <span>Just planted</span>
      </div>
    );
  }

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full font-medium transition-all",
        isMilestone
          ? "bg-accent/10 text-accent border border-accent/20 shadow-[0_0_15px_rgba(196,115,90,0.15)]"
          : "bg-green-50 text-green-700 border border-green-200/70",
        size === "sm" && "text-xs px-2.5 py-0.5",
        size === "md" && "text-sm px-3 py-1",
        size === "lg" && "text-base px-4 py-1.5"
      )}
    >
      <motion.div
        animate={isMilestone ? {
          scale: [1, 1.2, 1],
          rotate: [0, -8, 8, 0]
        } : {}}
        transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
      >
        <Sprout size={size === "sm" ? 13 : size === "md" ? 15 : 17} strokeWidth={isMilestone ? 2.5 : 2} />
      </motion.div>
      <span>{count} weeks{isMilestone ? " in full bloom" : " growing"}</span>
      {isMilestone && <span className="ml-0.5 opacity-80">✦</span>}
    </motion.div>
  );
}
