import { useState } from "react";
import type { PresenceUser } from "@/hooks/usePresence";

function initials(name: string): string {
  return name
    .split(" ")
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const MAX_AVATARS = 4;

export function PresenceBar({ users }: { users: PresenceUser[] }) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  if (users.length === 0) return null;

  const shown = users.slice(0, MAX_AVATARS);
  const extra = users.length - MAX_AVATARS;

  return (
    <div className="flex items-center gap-2 py-2">
      <div className="flex -space-x-1.5">
        {shown.map(u => (
          <div
            key={u.user_id}
            className="relative"
            onMouseEnter={() => setHoveredId(u.user_id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={() => setHoveredId(h => h === u.user_id ? null : u.user_id)}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold presence-avatar"
              style={{
                backgroundColor: "#6B8F71",
                color: "#F7F0E6",
                animation: "presence-pulse 2s ease-in-out infinite",
              }}
            >
              {initials(u.display_name)}
            </div>
            {hoveredId === u.user_id && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 bg-[#2C1810] text-[#F7F0E6] text-xs rounded-lg whitespace-nowrap z-30 pointer-events-none">
                {u.display_name} is here {"\u{1F33F}"}
              </div>
            )}
          </div>
        ))}
      </div>
      {extra > 0 && (
        <span className="text-xs text-muted-foreground/60">
          and {extra} other{extra !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}
