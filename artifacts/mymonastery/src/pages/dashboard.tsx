import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { Plus, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useListRituals } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useGardenSocket } from "@/hooks/useGardenSocket";
import { useGardenLogToasts } from "@/hooks/useGardenLogs";
import { Layout } from "@/components/layout";
import { PresenceBar } from "@/components/PresenceBar";
import { GardenLogToasts } from "@/components/GardenLogToasts";
import { PrayerSection } from "@/components/prayer-section";
import { apiRequest } from "@/lib/queryClient";
import { milestoneLabel, milestoneProgress } from "@/lib/utils";
import { format, isToday, isTomorrow, isThisWeek, isPast, parseISO, addDays, startOfDay } from "date-fns";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isThisWeek(date)) return format(date, "EEEE");
  return format(date, "EEE, MMM d");
}

function nextMomentWindow(moment: {
  scheduledTime: string; frequency: string; dayOfWeek?: string | null;
}): Date {
  const now = new Date();
  const [h, m] = moment.scheduledTime.split(":").map(Number);

  if (moment.frequency === "daily") {
    const t = new Date(); t.setHours(h, m, 0, 0);
    if (t > now) return t;
    t.setDate(t.getDate() + 1);
    return t;
  }
  if (moment.frequency === "weekly" && moment.dayOfWeek) {
    const dayMap: Record<string, number> = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };
    const target = dayMap[moment.dayOfWeek] ?? 1;
    const t = new Date(); t.setHours(h, m, 0, 0);
    let diff = (target - t.getDay() + 7) % 7;
    if (diff === 0 && t <= now) diff = 7;
    t.setDate(t.getDate() + diff);
    return t;
  }
  // monthly fallback
  const t = new Date(); t.setHours(h, m, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 30);
  return t;
}

function formatTime(scheduledTime: string): string {
  const [h, m] = scheduledTime.split(":").map(Number);
  return new Date(0, 0, 0, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const GROWTH_LABELS: Record<string, string> = {
  on_track: "Blooming",
  overdue: "Needs tending",
  needs_scheduling: "Unscheduled",
  active: "Active",
  dormant: "Dormant",
  needs_water: "Needs water",
};

// ─── Card Components ──────────────────────────────────────────────────────────

function GatheringCard({ ritual, dim }: { ritual: any; dim: boolean }) {
  const next = ritual.nextMeetupDate ? parseISO(ritual.nextMeetupDate) : null;
  const isConfirmed = !!ritual.confirmedTime;
  const statusKey = ritual.status ?? "needs_scheduling";
  const growthLabel = GROWTH_LABELS[statusKey] ?? statusKey;

  return (
    <Link href={`/ritual/${ritual.id}`}>
      <div className={`relative flex rounded-2xl overflow-hidden border border-border/60 bg-[#F7F0E6] hover:shadow-md transition-all duration-200 ${dim ? "opacity-60" : ""}`}>
        {/* Amber left bar */}
        <div className="w-1 flex-shrink-0 bg-[#C17F24]" />
        <div className="flex-1 p-4">
          {/* Top row */}
          <div className="flex items-start justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-foreground leading-tight">{ritual.name}</span>
            </div>
            <span className="text-[11px] font-medium text-muted-foreground/70 bg-white/60 rounded-full px-2 py-0.5 border border-border/40 ml-2 shrink-0">
              {growthLabel}
            </span>
          </div>

          {/* Participants */}
          {ritual.participants && ritual.participants.length > 0 && (
            <p className="text-sm text-muted-foreground mb-2">
              with {ritual.participants.slice(0, 3).map((p: any) => (p.name || p.email || "").split(" ")[0]).join(", ")}
              {ritual.participants.length > 3 && ` +${ritual.participants.length - 3}`}
            </p>
          )}

          {/* Date/time */}
          {next && (
            <p className="text-sm text-foreground/80 mb-1">
              {dayLabel(next)} · {format(next, "h:mm a")}
              {ritual.location && <> · {ritual.location}</>}
            </p>
          )}

          {/* Status row */}
          <div className="flex items-center gap-3 mt-2">
            {isConfirmed ? (
              <span className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                Confirmed ✅
              </span>
            ) : (
              <span className="text-xs text-amber-700/80">Awaiting replies</span>
            )}
            {(ritual.streak ?? 0) > 0 && (
              <span className="text-xs text-muted-foreground">
                🔥 {ritual.streak} in a row
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

const TEMPLATE_EMOJI: Record<string, string> = {
  morning_prayer: "🌅",
  evening_prayer: "🌙",
  intercession: "🙏",
  breath_together: "🌬️",
  contemplative_sit: "🌿",
  walk_together: "🚶",
  morning_coffee: "☕",
  custom: "✨",
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
  commitmentSessionsGoal?: number | null;
  commitmentSessionsLogged?: number | null;
  commitmentTendFreely?: boolean | null;
}

const SPIRITUAL_TEMPLATE_IDS_MAIN = new Set(["morning-prayer", "evening-prayer", "intercession", "breath", "contemplative", "walk"]);

function SharedMomentCard({ moment, dim, pinned }: { moment: MomentData; dim: boolean; pinned?: boolean }) {
  const [, setLocation] = useLocation();
  const nextWindow = nextMomentWindow(moment);
  const memberNames = moment.members.slice(0, 3).map(m => (m.name ?? m.email).split(" ")[0]).join(", ");
  const extraMembers = moment.members.length > 3 ? ` +${moment.members.length - 3}` : "";
  const templateEmoji = TEMPLATE_EMOJI[moment.templateType ?? "custom"] ?? "✨";
  const bloomThreshold = Math.max(2, Math.ceil(moment.memberCount / 2));
  const todayBloomed = moment.todayPostCount >= bloomThreshold && moment.memberCount >= 2;
  const effectiveStreak = moment.currentStreak + (todayBloomed && moment.currentStreak === 0 ? 1 : 0);
  const sessionsGoal = moment.commitmentSessionsGoal ?? null;
  const sessionsLogged = moment.commitmentSessionsLogged ?? 0;
  const tendFreely = moment.commitmentTendFreely ?? false;
  const goalDays = moment.goalDays ?? 0;
  // Prefer session-based goal; fall back to old goalDays
  const hasSessionGoal = sessionsGoal !== null && sessionsGoal > 0 && !tendFreely;
  const hasGoal = hasSessionGoal || goalDays > 0;
  const mProgress = hasSessionGoal
    ? Math.min(sessionsLogged / sessionsGoal, 1)
    : goalDays > 0 ? Math.min(effectiveStreak, goalDays) / goalDays
    : milestoneProgress(moment.currentStreak);
  const mLabel = hasSessionGoal
    ? (sessionsLogged >= sessionsGoal ? `🌸 Goal reached!` : `🌿 ${sessionsLogged} of ${sessionsGoal}`)
    : tendFreely ? `🌿 Tending freely`
    : goalDays > 0 ? `🌿 Day ${effectiveStreak} of ${goalDays}`
    : milestoneLabel(moment.currentStreak);
  const isSpiritual = SPIRITUAL_TEMPLATE_IDS_MAIN.has(moment.templateType ?? "");

  return (
    <motion.div
      onClick={() => setLocation(`/moments/${moment.id}`)}
      whileHover={{ y: -1 }}
      className={`relative flex rounded-2xl overflow-hidden border transition-all duration-200 cursor-pointer ${
        pinned
          ? isSpiritual
            ? "border-[#6B8F71]/60 shadow-[0_0_18px_rgba(107,143,113,0.18)] bg-[#FDFCF8]"
            : "border-amber-400/60 shadow-[0_0_18px_rgba(193,127,36,0.18)] bg-[#FDFCF8]"
          : `border-[#c9b99a]/40 bg-[#FDFCF8] ${dim ? "opacity-55" : ""} hover:shadow-md`
      }`}>
      {/* Left accent bar */}
      <div className={`w-1.5 flex-shrink-0 ${
        pinned
          ? isSpiritual ? "bg-[#6B8F71] animate-pulse" : "bg-amber-400 animate-pulse"
          : "bg-[#6B8F71]"
      }`} />

      <div className="flex-1 p-4">
        {/* Top row: icon + name + window status */}
        <div className="flex items-start gap-2 mb-1">
          <span className="text-xl leading-none mt-0.5">{templateEmoji}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-base font-semibold text-[#2C1A0E] leading-snug">{moment.name}</span>
              {pinned && (
                isSpiritual ? (
                  <span className="text-[11px] font-bold text-[#6B8F71] uppercase tracking-wide shrink-0">
                    Practice day 🌿
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wide shrink-0 animate-pulse">
                    Open now
                  </span>
                )
              )}
            </div>
            <p className="text-xs text-[#6b5c4a]/70 mt-0.5">with {memberNames}{extraMembers}</p>
          </div>
        </div>

        {/* Time / status line */}
        {pinned ? (
          isSpiritual ? (
            <p className="text-sm text-[#6B8F71] font-medium mt-1 mb-2">
              {moment.todayPostCount} of {moment.memberCount} practiced today
            </p>
          ) : (
            <p className="text-sm text-amber-700 font-medium mt-1 mb-2">
              {moment.minutesLeft} min left · {moment.todayPostCount} of {moment.memberCount} posted
            </p>
          )
        ) : (
          <p className="text-xs text-[#6b5c4a]/60 mb-2">
            {isSpiritual
              ? nextWindow ? `Next practice: ${dayLabel(nextWindow)}` : moment.frequency
              : `${dayLabel(nextWindow)} · ${formatTime(moment.scheduledTime)}`
            }
          </p>
        )}

        {/* Intention (pinned) */}
        {pinned && moment.intention && (
          <p className="text-sm italic text-[#6b5c4a] font-serif mb-3">"{moment.intention}"</p>
        )}

        {/* Goal progress bar (pinned) — shows milestone progress toward 3/7/14 day goals */}
        {pinned && hasGoal && (
          <div className="mb-3">
            <div className="w-full h-1.5 bg-[#c9b99a]/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#6B8F71] rounded-full transition-all"
                style={{ width: `${Math.round(mProgress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Bottom row: milestone label + CTA */}
        <div className="flex items-center justify-between gap-2 mt-1">
          <div className="min-w-0 flex-1">
            {hasGoal ? (
              <div>
                <span className="text-[11px] text-[#6b5c4a]/80">{mLabel}</span>
              </div>
            ) : (
              moment.currentStreak > 0 && (
                <span className="text-[11px] text-[#6b5c4a]/70">
                  🌿 {moment.currentStreak} in a row
                </span>
              )
            )}
          </div>
          {pinned && moment.myUserToken && (
            <Link
              href={`/moment/${moment.momentToken}/${moment.myUserToken}`}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <span className="text-xs font-medium text-white bg-[#6B8F71] rounded-full px-3 py-1.5 hover:bg-[#5a7a60] transition-colors whitespace-nowrap shrink-0">
                {["intercession", "morning-prayer", "evening-prayer", "contemplative"].includes(moment.templateType ?? "") ? "Pray 🙏" : moment.templateType === "fasting" ? "Fast 🌿" : moment.templateType === "listening" ? "Listen 🎵" : "Show up →"}
              </span>
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── FAB ─────────────────────────────────────────────────────────────────────

function FAB() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-2 mb-1"
          >
            <Link href="/moment/new" onClick={() => setOpen(false)}>
              <div className="px-4 py-3 bg-card border border-[#6B8F71]/30 rounded-2xl shadow-lg hover:bg-[#6B8F71]/5 transition-colors whitespace-nowrap min-w-[210px]">
                <p className="text-sm font-semibold text-foreground">🌿 Plant a Practice</p>
                <p className="text-xs text-muted-foreground mt-0.5">For when you can't be together</p>
              </div>
            </Link>
            <Link href="/tradition/new" onClick={() => setOpen(false)}>
              <div className="px-4 py-3 bg-card border border-[#C17F24]/30 rounded-2xl shadow-lg hover:bg-[#C17F24]/5 transition-colors whitespace-nowrap min-w-[210px]">
                <p className="text-sm font-semibold text-foreground">🌱 Plant a Tradition</p>
                <p className="text-xs text-muted-foreground mt-0.5">To bring you together</p>
              </div>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-14 h-14 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
      >
        <motion.div animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }}>
          <Plus size={24} />
        </motion.div>
      </button>
    </div>
  );
}

// ─── Time anchor ─────────────────────────────────────────────────────────────

function TimeAnchor({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 my-4">
      <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-widest">{label}</span>
      <div className="flex-1 h-px bg-border/40" />
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { data: rituals, isLoading: ritualsLoading } = useListRituals({ ownerId: user?.id });
  const { data: momentsData, isLoading: momentsLoading } = useQuery<{ moments: MomentData[] }>({
    queryKey: ["/api/moments"],
    queryFn: () => apiRequest("GET", "/api/moments"),
    enabled: !!user,
  });

  // Build garden member emails (from both practices and traditions) for presence filtering
  const gardenEmails = useMemo(() => {
    const emails = new Set<string>();
    for (const m of momentsData?.moments ?? []) {
      for (const member of m.members) {
        if (member.email) emails.add(member.email);
      }
    }
    for (const r of rituals ?? []) {
      for (const p of (r.participants ?? []) as { email: string }[]) {
        if (p.email) emails.add(p.email);
      }
    }
    // Remove self
    if (user?.email) emails.delete(user.email);
    return emails;
  }, [momentsData, rituals, user?.email]);

  // Build moment IDs for log notification filtering
  const userMomentIds = useMemo(() => {
    return new Set((momentsData?.moments ?? []).map(m => m.id));
  }, [momentsData]);

  const { presentUsers, logEvents } = useGardenSocket(user, gardenEmails, userMomentIds);
  const { visibleToasts } = useGardenLogToasts(logEvents);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading) return null;
  if (!user) return null;

  const isLoading = ritualsLoading || momentsLoading;
  const moments: MomentData[] = momentsData?.moments ?? [];
  const gatherings = rituals ?? [];
  const myCircles = gatherings.filter(r => r.ownerId === user?.id);
  const invitedTraditions = gatherings.filter(r => r.ownerId !== user?.id);

  const today = new Date();
  const todayStr = format(today, "EEEE, d MMMM");
  const firstName = (user.name || user.email || "").split(" ")[0];

  // Compute what's happening this week
  const weekEnd = addDays(startOfDay(today), 7);
  const thisWeekGatherings = gatherings.filter(r => {
    if (!r.nextMeetupDate) return false;
    const d = parseISO(r.nextMeetupDate);
    return d >= today && d <= weekEnd;
  });
  const openNowMoments = moments.filter(m => m.windowOpen);
  const thisWeekMoments = moments.filter(m => {
    const nw = nextMomentWindow(m);
    return !m.windowOpen && nw >= today && nw <= weekEnd;
  });
  const thisWeekCount = thisWeekGatherings.length + openNowMoments.length + thisWeekMoments.length;

  // Sort upcoming gatherings
  const upcomingGatherings = gatherings
    .filter(r => r.nextMeetupDate && !isPast(parseISO(r.nextMeetupDate)))
    .sort((a, b) => parseISO(a.nextMeetupDate!).getTime() - parseISO(b.nextMeetupDate!).getTime());

  const unscheduledGatherings = gatherings.filter(r => !r.nextMeetupDate);

  // Sort upcoming moments (not open now)
  const upcomingMoments = moments
    .filter(m => !m.windowOpen)
    .sort((a, b) => nextMomentWindow(a).getTime() - nextMomentWindow(b).getTime());

  // Combine upcoming (next 7 days)
  type UpcomingItem =
    | { type: "gathering"; date: Date; data: (typeof gatherings)[0] }
    | { type: "moment"; date: Date; data: MomentData };

  const upcomingItems: UpcomingItem[] = [
    ...upcomingGatherings.slice(0, 5).map(r => ({
      type: "gathering" as const,
      date: parseISO(r.nextMeetupDate!),
      data: r,
    })),
    ...upcomingMoments.slice(0, 5).map(m => ({
      type: "moment" as const,
      date: nextMomentWindow(m),
      data: m,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const isEmpty = gatherings.length === 0 && moments.length === 0;

  return (
    <>
    <Layout>
      <div className="flex flex-col w-full pb-24">

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-widest mb-1">Eleanor 🌿</p>
            <h1 className="text-2xl font-semibold text-foreground">{todayStr}</h1>
            {!isLoading && !isEmpty && thisWeekCount > 0 && (
              <p className="text-sm text-muted-foreground mt-1">{thisWeekCount} thing{thisWeekCount !== 1 ? "s" : ""} happening this week</p>
            )}
          </div>
        </div>

        {/* ── Presence bar ── */}
        <PresenceBar users={presentUsers} />

        <div className="mt-3 mb-4 flex items-center gap-3">
          <Link href="/moments" className="text-xs text-muted-foreground/70 hover:text-foreground transition-colors flex items-center gap-1">
            🌿 Practices →
          </Link>
          <span className="text-muted-foreground/30 text-xs">·</span>
          <Link href="/tradition/new" className="text-xs text-muted-foreground/70 hover:text-foreground transition-colors flex items-center gap-1">
            🌱 Traditions →
          </Link>
        </div>

        <div className="mb-4 h-px bg-border/40" />

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-2xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : isEmpty ? (
          /* ── Empty state ── */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto py-16"
          >
            <div className="text-5xl mb-6">🌱</div>
            <p className="font-serif text-xl text-foreground/70 mb-2 leading-relaxed italic">
              "The rituals you tend now become<br />the traditions you'll remember."
            </p>
            <div className="mt-8 space-y-3 w-full">
              <Link href="/moment/new" className="block w-full text-left px-5 py-4 bg-primary text-primary-foreground rounded-2xl font-medium animate-glow-breathe transition-transform hover:-translate-y-0.5 active:translate-y-0 duration-200">
                <p className="font-semibold">🌿 Plant a Practice</p>
                <p className="text-xs opacity-80 mt-0.5">For when you can't be together</p>
              </Link>
              <Link href="/tradition/new" className="block w-full text-left px-5 py-4 bg-card text-foreground border border-[#C17F24]/30 rounded-2xl font-medium hover:bg-[#C17F24]/5 transition-all">
                <p className="font-semibold">🌱 Plant a Tradition</p>
                <p className="text-xs text-muted-foreground mt-0.5">To bring you together</p>
              </Link>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="space-y-1"
          >

            {/* ── NOW — pinned open windows ── */}
            {openNowMoments.length > 0 && (
              <>
                <TimeAnchor label="Open now" />
                <div className="space-y-3">
                  {openNowMoments.map(m => (
                    <SharedMomentCard key={m.id} moment={m} dim={false} pinned />
                  ))}
                </div>
              </>
            )}

            {/* ── COMING UP ── */}
            {upcomingItems.length > 0 && (
              <>
                <TimeAnchor label="Coming up" />
                <div className="space-y-3">
                  {upcomingItems.map(item =>
                    item.type === "gathering" ? (
                      <GatheringCard key={`g-${item.data.id}`} ritual={item.data} dim={false} />
                    ) : (
                      <SharedMomentCard key={`m-${item.data.id}`} moment={item.data} dim={false} />
                    )
                  )}
                </div>
              </>
            )}

            {/* ── UNSCHEDULED GATHERINGS ── */}
            {unscheduledGatherings.length > 0 && (
              <>
                <TimeAnchor label="Needs scheduling" />
                <div className="space-y-3">
                  {unscheduledGatherings.map(r => (
                    <GatheringCard key={`ug-${r.id}`} ritual={r} dim={false} />
                  ))}
                </div>
              </>
            )}

            {/* ── INVITED TRADITIONS ── */}
            {invitedTraditions.length > 0 && (
              <>
                <TimeAnchor label="Traditions you've joined" />
                <div className="space-y-3">
                  {invitedTraditions.map(r => {
                    const organizer = (r.participants as Array<{ name: string; email: string }>)?.[0];
                    return (
                      <Link key={`ic-${r.id}`} href={`/ritual/${r.id}`}>
                        <div className="relative flex rounded-2xl overflow-hidden border border-border/60 bg-[#EEF3EF] hover:shadow-md transition-all duration-200">
                          <div className="w-1 flex-shrink-0 bg-[#6B8F71]" />
                          <div className="flex-1 p-4">
                            <div className="flex items-start justify-between mb-1">
                              <span className="text-base font-semibold text-foreground leading-tight">{r.name}</span>
                              <span className="text-[11px] font-medium text-muted-foreground/70 bg-white/60 rounded-full px-2 py-0.5 border border-border/40 ml-2 shrink-0">Invited</span>
                            </div>
                            {organizer && (
                              <p className="text-sm text-muted-foreground mb-1">Organized by {(organizer.name || organizer.email || "").split(" ")[0]}</p>
                            )}
                            {r.nextMeetupDate && (
                              <p className="text-sm text-foreground/80">
                                {dayLabel(parseISO(r.nextMeetupDate))} · {format(parseISO(r.nextMeetupDate), "h:mm a")}
                                {(r as any).location && <> · {(r as any).location}</>}
                              </p>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}

          </motion.div>
        )}

        {/* Prayer Requests */}
        <PrayerSection />

        {/* FAB */}
        <FAB />
      </div>
    </Layout>

    {/* Garden log toast notifications */}
    <GardenLogToasts toasts={visibleToasts} />
    </>
  );
}
