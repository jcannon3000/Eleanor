import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
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
}

const STATUS_ICONS: Record<string, string> = {
  bloom: "🌸", solo: "👤", wither: "🥀",
};

// ─── Moment Card ─────────────────────────────────────────────────────────────

function MomentCard({ moment }: { moment: MomentData }) {
  const memberNames = moment.members
    .slice(0, 3)
    .map(m => (m.name ?? m.email).split(" ")[0])
    .join(", ");
  const extraMembers = moment.members.length > 3 ? ` +${moment.members.length - 3}` : "";
  const nextWindow = !moment.windowOpen ? nextWindowDate(moment) : null;
  const lastStatus = moment.latestWindow?.status;

  return (
    <Link href={`/moments/${moment.id}`}>
      <div className={`relative flex rounded-2xl overflow-hidden border transition-all duration-200 ${
        moment.windowOpen
          ? "border-[#C17F24]/40 shadow-[0_0_16px_rgba(193,127,36,0.1)] bg-[#F5F5F0]"
          : "border-border/60 bg-[#F5F5F0] hover:shadow-md"
      }`}>
        {/* Sage left bar, amber when open */}
        <div className={`w-1 flex-shrink-0 ${moment.windowOpen ? "bg-[#C17F24]" : "bg-[#6B8F71]"}`} />
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between mb-1">
            <span className="text-base font-semibold text-foreground">{moment.name}</span>
            <div className="flex items-center gap-1.5 ml-2 shrink-0">
              {moment.windowOpen && (
                <span className="text-[11px] font-semibold text-[#C17F24] uppercase tracking-wide animate-pulse">Open</span>
              )}
              {lastStatus && !moment.windowOpen && (
                <span className="text-sm">{STATUS_ICONS[lastStatus] ?? ""}</span>
              )}
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-2 line-clamp-1 italic">"{moment.intention}"</p>

          <p className="text-xs text-muted-foreground mb-3">
            with {memberNames}{extraMembers}
          </p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {moment.currentStreak > 0 && (
                <span className="text-xs text-foreground/70">
                  🔥 {moment.currentStreak}{moment.longestStreak > moment.currentStreak ? ` · Best: ${moment.longestStreak}` : ""}
                </span>
              )}
              {moment.totalBlooms > 0 && (
                <span className="text-xs text-muted-foreground">🌸 {moment.totalBlooms}</span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {moment.windowOpen
                ? `${moment.minutesLeft} min left`
                : nextWindow
                  ? `Next: ${format(nextWindow, "EEE h:mm a")}`
                  : scheduleLabel(moment)}
            </span>
          </div>
        </div>
      </div>
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
            <h1 className="text-2xl font-semibold text-foreground">Shared Moments</h1>
            <p className="text-sm text-muted-foreground mt-1">Recurring micro-rituals with the people you love</p>
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
            <p className="text-foreground/70 mb-2 font-medium">No shared moments yet</p>
            <p className="text-sm text-muted-foreground mb-8">Plant a recurring moment with someone you love — no app needed on their end.</p>
            <Link
              href="/moment/new"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium shadow-[var(--shadow-warm-md)]"
            >
              🌿 Plant your first moment
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
                    <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-widest">Your moments</span>
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
