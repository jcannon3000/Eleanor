import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { milestoneLabel, milestoneProgress } from "@/lib/utils";
import { format, parseISO, addDays, startOfDay } from "date-fns";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(scheduledTime: string): string {
  const [h, m] = scheduledTime.split(":").map(Number);
  return new Date(0, 0, 0, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const DAY_NAMES: Record<string, string> = {
  MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday",
  FR: "Friday", SA: "Saturday", SU: "Sunday",
};

function scheduleLabel(m: MomentData): string {
  const time = formatTime(m.scheduledTime);
  if (m.frequency === "daily") return `Every day at ${time}`;
  if (m.frequency === "weekly" && m.dayOfWeek) return `Every ${DAY_NAMES[m.dayOfWeek] ?? m.dayOfWeek} at ${time}`;
  if (m.frequency === "weekly") return `Weekly at ${time}`;
  return `Monthly at ${time}`;
}

function nextWindowDate(m: MomentData): Date {
  const now = new Date();
  const [h, mi] = m.scheduledTime.split(":").map(Number);
  if (m.frequency === "daily") {
    const t = new Date(); t.setHours(h, mi, 0, 0);
    if (t > now) return t;
    t.setDate(t.getDate() + 1); return t;
  }
  if (m.frequency === "weekly" && m.dayOfWeek) {
    const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    const target = dayMap[m.dayOfWeek] ?? 1;
    const t = new Date(); t.setHours(h, mi, 0, 0);
    let diff = (target - t.getDay() + 7) % 7;
    if (diff === 0 && t <= now) diff = 7;
    t.setDate(t.getDate() + diff); return t;
  }
  const t = new Date(); t.setHours(h, mi, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 30);
  return t;
}

// ─── Types ────────────────────────────────────────────────────────────────────

const TEMPLATE_EMOJI: Record<string, string> = {
  "morning-prayer": "🌅",
  "evening-prayer": "🌙",
  morning_prayer: "🌅",
  evening_prayer: "🌙",
  intercession: "🙏",
  breath_together: "🌬️",
  contemplative_sit: "🌿",
  walk_together: "🚶",
  morning_coffee: "☕",
  custom: "✨",
  breath: "🌬️",
  contemplative: "🌿",
  walk: "🚶",
};

interface MomentData {
  id: number;
  name: string;
  intention: string;
  frequency: string;
  scheduledTime: string;
  dayOfWeek?: string | null;
  currentStreak: number;
  longestStreak: number;
  totalBlooms: number;
  state: string;
  memberCount: number;
  members: { name: string | null; email: string }[];
  todayPostCount: number;
  windowOpen: boolean;
  minutesLeft: number;
  momentToken: string;
  myUserToken: string | null;
  latestWindow: { status: string; postCount: number } | null;
  templateType?: string | null;
  goalDays?: number | null;
  frequencyType?: string | null;
  frequencyDaysPerWeek?: number | null;
  practiceDays?: string | null;
}

const SPIRITUAL_TEMPLATE_IDS_DASH = new Set(["morning-prayer", "evening-prayer", "intercession", "breath", "contemplative", "walk", "custom"]);
const BCP_TEMPLATE_IDS_DASH = new Set(["morning-prayer", "evening-prayer"]);

// ─── BCP week tracking helper ─────────────────────────────────────────────────
function bcpWeeksLabel(streak: number): string {
  if (streak < 7) return `${streak} day${streak !== 1 ? "s" : ""} prayed`;
  const weeks = Math.floor(streak / 7);
  return `${weeks} week${weeks !== 1 ? "s" : ""} together`;
}

// ─── Moment Card ─────────────────────────────────────────────────────────────

function MomentCard({ moment }: { moment: MomentData }) {
  const memberNames = moment.members
    .slice(0, 3)
    .map(m => (m.name ?? m.email).split(" ")[0])
    .join(", ");
  const extraMembers = moment.members.length > 3 ? ` +${moment.members.length - 3}` : "";
  const nextWindow = !moment.windowOpen ? nextWindowDate(moment) : null;
  const templateEmoji = TEMPLATE_EMOJI[moment.templateType ?? "custom"] ?? "✨";
  const hasGoal = (moment.goalDays ?? 0) > 0;
  const mLabel = milestoneLabel(moment.currentStreak);
  const mProgress = milestoneProgress(moment.currentStreak);
  const isSpiritual = SPIRITUAL_TEMPLATE_IDS_DASH.has(moment.templateType ?? "");
  const isBcp = BCP_TEMPLATE_IDS_DASH.has(moment.templateType ?? "");
  const bcpPage = moment.templateType === "morning-prayer" ? "75" : "115";
  const isMorning = moment.templateType === "morning-prayer";

  return (
    <Link href={`/moments/${moment.id}`}>
      <motion.div
        whileHover={{ y: -1 }}
        className={`relative flex rounded-2xl overflow-hidden border transition-all duration-200 ${
          moment.windowOpen
            ? isBcp
              ? isMorning
                ? "border-[#C8975A]/60 shadow-[0_0_18px_rgba(200,151,90,0.15)] bg-[#FDFCF8]"
                : "border-[#7B9EBE]/60 shadow-[0_0_18px_rgba(123,158,190,0.15)] bg-[#FDFCF8]"
              : isSpiritual
                ? "border-[#6B8F71]/60 shadow-[0_0_18px_rgba(107,143,113,0.18)] bg-[#FDFCF8]"
                : "border-amber-400/60 shadow-[0_0_18px_rgba(193,127,36,0.18)] bg-[#FDFCF8]"
            : "border-[#c9b99a]/40 bg-[#FDFCF8] hover:shadow-md"
        }`}>
        {/* Left accent bar */}
        <div className={`w-1.5 flex-shrink-0 ${
          moment.windowOpen
            ? isBcp
              ? isMorning ? "bg-[#C8975A] animate-pulse" : "bg-[#7B9EBE] animate-pulse"
              : isSpiritual ? "bg-[#6B8F71] animate-pulse" : "bg-amber-400 animate-pulse"
            : isBcp ? (isMorning ? "bg-[#C8975A]" : "bg-[#7B9EBE]") : "bg-[#6B8F71]"
        }`} />

        <div className="flex-1 p-4">
          {/* Top row */}
          <div className="flex items-start gap-2 mb-1">
            <span className="text-xl leading-none mt-0.5">{templateEmoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-base font-semibold text-[#2C1A0E] leading-snug">{moment.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isBcp && (
                    <span className="text-[10px] font-semibold text-[#6B8F71] bg-[#6B8F71]/10 border border-[#6B8F71]/20 px-2 py-0.5 rounded-full">
                      Daily Office
                    </span>
                  )}
                  {moment.windowOpen && (
                    isBcp ? (
                      <span className={`text-[11px] font-bold uppercase tracking-wide ${isMorning ? "text-[#C8975A]" : "text-[#7B9EBE]"}`}>
                        {isMorning ? "Morning 🌅" : "Evening 🌙"}
                      </span>
                    ) : isSpiritual ? (
                      <span className="text-[11px] font-bold text-[#6B8F71] uppercase tracking-wide">
                        Practice day 🌿
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wide animate-pulse">
                        Open now
                      </span>
                    )
                  )}
                </div>
              </div>
              <p className="text-xs text-[#6b5c4a]/70 mt-0.5">with {memberNames}{extraMembers}</p>
            </div>
          </div>

          {/* BCP page reference */}
          {isBcp && (
            <p className="text-xs text-[#6b5c4a]/70 font-medium mb-1.5">
              📖 Page {bcpPage} · {isMorning ? "Morning Prayer Rite II" : "Evening Prayer Rite II"}
            </p>
          )}

          {/* Intention (skip for BCP — page ref is more useful) */}
          {!isBcp && (
            <p className="text-sm italic text-[#6b5c4a]/80 font-serif mb-2 line-clamp-1">"{moment.intention}"</p>
          )}

          {/* Time info */}
          {moment.windowOpen ? (
            isBcp ? (
              <p className="text-sm font-medium mb-2" style={{ color: isMorning ? "#C8975A" : "#7B9EBE" }}>
                {moment.todayPostCount} of {moment.memberCount} prayed today
              </p>
            ) : isSpiritual ? (
              <p className="text-sm text-[#6B8F71] font-medium mb-2">
                {moment.todayPostCount} of {moment.memberCount} practiced today
              </p>
            ) : (
              <p className="text-sm text-amber-700 font-medium mb-2">
                {moment.minutesLeft} min left · {moment.todayPostCount} of {moment.memberCount} posted
              </p>
            )
          ) : (
            <p className="text-xs text-[#6b5c4a]/60 mb-2">
              {isBcp || isSpiritual
                ? nextWindow ? `Next practice: ${format(nextWindow, "EEE")}` : scheduleLabel(moment)
                : nextWindow ? `Next: ${format(nextWindow, "EEE h:mm a")}` : scheduleLabel(moment)
              }
            </p>
          )}

          {/* BCP streak / weeks together */}
          {isBcp ? (
            <div className="flex items-center gap-3">
              {moment.currentStreak > 0 && (
                <span className="text-[11px] text-[#6b5c4a]/70">
                  🌿 {bcpWeeksLabel(moment.currentStreak)}
                </span>
              )}
              {moment.todayPostCount > 0 && moment.memberCount > 1 && (
                <span className="text-[11px] text-[#6B8F71]/80">
                  · {moment.todayPostCount} of {moment.memberCount} this week
                </span>
              )}
            </div>
          ) : hasGoal ? (
            <div className="mt-1">
              <span className="text-[11px] text-[#6b5c4a]/80">{mLabel}</span>
              <div className="mt-1 w-full h-0.5 bg-[#c9b99a]/30 rounded-full overflow-hidden">
                <div className="h-full bg-[#6B8F71] rounded-full transition-all"
                  style={{ width: `${Math.round(mProgress * 100)}%` }} />
              </div>
            </div>
          ) : (
            moment.currentStreak > 0 && (
              <span className="text-[11px] text-[#6b5c4a]/70">🌿 {moment.currentStreak} in a row</span>
            )
          )}
        </div>
      </motion.div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MomentsDashboard() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["/api/moments"],
    queryFn: () => apiRequest<{ moments: MomentData[] }>("GET", "/api/moments"),
    enabled: !!user,
  });

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  const moments: MomentData[] = data?.moments ?? [];
  const openNow = moments.filter(m => m.windowOpen);
  const rest = moments.filter(m => !m.windowOpen);

  return (
    <Layout>
      <div className="pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <button onClick={() => setLocation("/dashboard")} className="text-xs text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1 transition-colors">
              ← Dashboard
            </button>
            <h1 className="text-2xl font-semibold text-foreground">Your practices 🌿</h1>
            <p className="text-sm text-muted-foreground italic mt-1">For the distance between gatherings</p>
          </div>
          <Link
            href="/moment/new"
            className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-primary-foreground rounded-full font-medium text-sm shadow-[var(--shadow-warm-md)] hover:shadow-[var(--shadow-warm-lg)] transition-all"
          >
            + Plant
          </Link>
        </div>

        <div className="my-5 h-px bg-border/40" />

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-28 rounded-2xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : moments.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <div className="text-4xl mb-4">🌱</div>
            <p className="text-foreground/70 mb-2 font-medium">No practices yet</p>
            <p className="text-sm text-muted-foreground mb-8">Plant a spiritual practice that you and someone you love do together — even across the distance.</p>
            <Link
              href="/moment/new"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium shadow-[var(--shadow-warm-md)]"
            >
              🌿 Plant your first practice
            </Link>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1">
            {openNow.length > 0 && (
              <>
                <div className="flex items-center gap-2 mb-3 mt-1">
                  <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-widest">Open now</span>
                  <div className="flex-1 h-px bg-border/40" />
                </div>
                <div className="space-y-3 mb-5">
                  {openNow.map(m => <MomentCard key={m.id} moment={m} />)}
                </div>
              </>
            )}

            {rest.length > 0 && (
              <>
                {openNow.length > 0 && (
                  <div className="flex items-center gap-2 mb-3 mt-2">
                    <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-widest">Your practices</span>
                    <div className="flex-1 h-px bg-border/40" />
                  </div>
                )}
                <div className="space-y-3">
                  {rest.map(m => <MomentCard key={m.id} moment={m} />)}
                </div>
              </>
            )}
          </motion.div>
        )}
      </div>
    </Layout>
  );
}
