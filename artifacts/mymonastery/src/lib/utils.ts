import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function milestoneLabel(streak: number): string {
  if (streak < 3) return `🌱 Day ${streak + 1} of 3`;
  if (streak < 7) return `🌱✓  🌿 Day ${streak - 2} of 7`;
  if (streak < 14) return `🌱✓  🌿✓  🌸 Day ${streak - 6} of 14`;
  return `🌸 14 days — ready to renew`;
}

export function milestoneProgress(streak: number): number {
  if (streak < 3) return streak / 3;
  if (streak < 7) return (streak - 3) / 4;
  if (streak < 14) return (streak - 7) / 7;
  return 1;
}
