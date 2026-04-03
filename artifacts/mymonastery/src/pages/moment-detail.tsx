import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { InviteStep } from "@/components/InviteStep";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WindowPost {
  guestName: string | null;
  reflectionText: string | null;
  isCheckin: boolean;
  loggedAt: string | null;
}

interface TodayLog {
  name: string;
  email: string;
  loggedAt: string | null;
  reflectionText: string | null;
  isCheckin: boolean;
}

interface MomentWindow {
  id: number;
  momentId: number;
  windowDate: string;
  status: string;
  postCount: number;
  closedAt: string | null;
  posts: WindowPost[];
}

interface MomentDetail {
  moment: {
    id: number;
    name: string;
    intention: string;
    frequency: string;
    scheduledTime: string;
    dayOfWeek?: string | null;
    windowMinutes: number;
    goalDays: number;
    currentStreak: number;
    longestStreak: number;
    totalBlooms: number;
    state: string;
    createdAt: string;
    momentToken: string;
    templateType: string | null;
    intercessionTopic: string | null;
    timezone?: string | null;
    practiceDays?: string | string[] | null;
    timeOfDay?: string | null;
    contemplativeDurationMinutes?: number | null;
    fastingFrom?: string | null;
    fastingIntention?: string | null;
    fastingFrequency?: string | null;
    fastingDate?: string | null;
    fastingDay?: string | null;
    fastingDayOfMonth?: number | null;
    commitmentDuration?: number | null;
    commitmentEndDate?: string | null;
    commitmentSessionsGoal?: number | null;
    commitmentSessionsLogged?: number | null;
    commitmentGoalTier?: number | null;
    commitmentTendFreely?: boolean | null;
    frequencyDaysPerWeek?: number | null;
  };
  members: { name: string | null; email: string }[];
  memberCount: number;
  myStreak: number;
  myUserToken: string | null;
  myPersonalTime: string | null;
  myPersonalTimezone: string | null;
  windows: MomentWindow[];
  seedPosts: WindowPost[];
  todayPostCount: number;
  windowOpen: boolean;
  minutesLeft: number;
  todayLogs: TodayLog[];
  isCreator: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(scheduledTime: string): string {
  const [h, m] = scheduledTime.split(":").map(Number);
  return new Date(0, 0, 0, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const DAY_NAMES: Record<string, string> = {
  MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday",
  FR: "Friday", SA: "Saturday", SU: "Sunday",
};

const DAY_DOW: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

const SPIRITUAL_TEMPLATE_IDS = new Set(["morning-prayer", "evening-prayer", "intercession", "contemplative", "fasting", "custom"]);

// ─── Progressive goal ladder ────────────────────────────────────────────────
const GOAL_LADDERS: Record<string, number[]> = {
  daily:  [7, 14, 30, 90],      // 7/week
  "3x":   [12, 18, 36, 72],     // 3x/week
  "2x":   [8, 12, 24, 48],      // 2x/week
  weekly: [4, 8, 12, 24],       // 1x/week
};

function getGoalLadder(frequency: string, daysPerWeek?: number | null): number[] {
  if (frequency === "daily") return GOAL_LADDERS.daily;
  if (daysPerWeek && daysPerWeek >= 3) return GOAL_LADDERS["3x"];
  if (daysPerWeek && daysPerWeek >= 2) return GOAL_LADDERS["2x"];
  return GOAL_LADDERS.weekly;
}

function getNextGoalInLadder(ladder: number[], currentGoal: number): number | null {
  const idx = ladder.indexOf(currentGoal);
  if (idx === -1) {
    // Find the next higher rung
    const next = ladder.find(g => g > currentGoal);
    return next ?? null;
  }
  return idx < ladder.length - 1 ? ladder[idx + 1] : null;
}

function goalLabel(sessions: number, frequency: string): string {
  if (frequency === "daily") return `${sessions} days`;
  return `${sessions} sessions`;
}

function nextGoalCard(nextGoal: number | null, frequency: string): { emoji: string; label: string; sub: string } | null {
  if (!nextGoal) return { emoji: "✨", label: "No end date", sub: "This is just what you do now" };
  if (nextGoal <= 14) return { emoji: "🌿", label: goalLabel(nextGoal, frequency), sub: "Keep the rhythm going" };
  if (nextGoal <= 30) return { emoji: "🌸", label: goalLabel(nextGoal, frequency), sub: "A real season together" };
  if (nextGoal <= 90) return { emoji: "🌳", label: goalLabel(nextGoal, frequency), sub: "Deep roots" };
  return { emoji: "✨", label: goalLabel(nextGoal, frequency), sub: "This is just what you do now" };
}

function parsePracticeDays(raw: string | string[] | null | undefined): string[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : null; } catch { return null; }
}

const TIME_OF_DAY_FALLBACK: Record<string, string> = {
  "early-morning": "early morning", "morning": "morning", "midday": "midday",
  "afternoon": "afternoon", "late-afternoon": "late afternoon", "evening": "evening", "night": "night",
};

function scheduleLabel(frequency: string, scheduledTime: string, dayOfWeek?: string | null, practiceDays?: string[] | null, timeOfDay?: string | null): string {
  // Old practices stored "00:00" — fall back to time-of-day label if available
  const timeStr = scheduledTime === "00:00" && timeOfDay
    ? TIME_OF_DAY_FALLBACK[timeOfDay] ?? formatTime(scheduledTime)
    : formatTime(scheduledTime);
  const prefix = scheduledTime === "00:00" && timeOfDay ? "" : "at ";
  if (frequency === "daily") return `Every day ${prefix}${timeStr}`;
  if (frequency === "weekly") {
    if (practiceDays && practiceDays.length > 1) {
      const names = practiceDays.map(d => DAY_NAMES[d]?.slice(0, 3) ?? d).join(", ");
      return `${names} ${prefix}${timeStr}`;
    }
    if (dayOfWeek) return `Every ${DAY_NAMES[dayOfWeek] ?? dayOfWeek} ${prefix}${timeStr}`;
    return `Weekly ${prefix}${timeStr}`;
  }
  return `Monthly ${prefix}${timeStr}`;
}

function goalProgress(createdAt: string, goalDays: number): number {
  const created = parseISO(createdAt);
  const now = new Date();
  const daysSince = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  return Math.min(100, Math.round((daysSince / goalDays) * 100));
}

// Is it currently past the scheduled time today? (client-side, user's local clock)
function isPastScheduledTime(scheduledTime: string): boolean {
  const [h, m] = scheduledTime.split(":").map(Number);
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
}

// Is today a practice day for this moment?
function isTodayPracticeDay(frequency: string, dayOfWeek?: string | null, practiceDays?: string[] | null): boolean {
  if (frequency === "daily") return true;
  if (frequency === "weekly") {
    const todayDow = new Date().getDay();
    if (practiceDays && practiceDays.length > 0) {
      return practiceDays.some(d => DAY_DOW[d] === todayDow);
    }
    if (dayOfWeek) return DAY_DOW[dayOfWeek] === todayDow;
  }
  return true;
}

// Next practice description — shows actual bell time
function nextPracticeLabel(frequency: string, scheduledTime: string, dayOfWeek?: string | null, practiceDays?: string[] | null, timeOfDay?: string | null): string {
  const timeStr = scheduledTime === "00:00" && timeOfDay
    ? TIME_OF_DAY_FALLBACK[timeOfDay] ?? formatTime(scheduledTime)
    : formatTime(scheduledTime);
  const prefix = scheduledTime === "00:00" && timeOfDay ? "" : "at ";
  const today = new Date().getDay(); // 0=Sun
  const pastTime = isPastScheduledTime(scheduledTime);

  if (frequency === "daily") {
    return pastTime ? `Tomorrow ${prefix}${timeStr}` : `Today ${prefix}${timeStr}`;
  }

  if (frequency === "weekly") {
    const days = practiceDays && practiceDays.length > 0 ? practiceDays : (dayOfWeek ? [dayOfWeek] : []);
    if (days.length === 0) return `Next practice ${prefix}${timeStr}`;

    for (let i = 0; i <= 7; i++) {
      const checkDow = (today + i) % 7;
      const isDayMatch = days.some(d => DAY_DOW[d] === checkDow);
      if (isDayMatch) {
        if (i === 0 && !pastTime) return `Today ${prefix}${timeStr}`;
        if (i === 1 || (i === 0 && pastTime)) return `Tomorrow ${prefix}${timeStr}`;
        const name = Object.keys(DAY_DOW).find(k => DAY_DOW[k] === checkDow);
        return `${name ? DAY_NAMES[name] : "Next"} ${prefix}${timeStr}`;
      }
    }
  }
  return `Next practice ${prefix}${timeStr}`;
}

const STATUS_ICON: Record<string, string> = { bloom: "🌸", solo: "👤", wither: "🥀" };
const STATUS_LABEL: Record<string, string> = { bloom: "Bloomed", solo: "Solo", wither: "Withered" };
const STATUS_COLOR: Record<string, string> = { bloom: "text-[#6B8F71]", solo: "text-amber-600", wither: "text-rose-400/80" };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MomentDetail() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const qc = useQueryClient();
  const [seedText, setSeedText] = useState("");
  const [showSeedForm, setShowSeedForm] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [invitePeople, setInvitePeople] = useState<{ name: string; email: string }[]>([]);
  // Bell editing removed — shared time, editable via Settings > Edit practice
  const [editingPractice, setEditingPractice] = useState(false);
  const [editName, setEditName] = useState("");
  const [editIntention, setEditIntention] = useState("");
  const [editGoalDays, setEditGoalDays] = useState(7);
  const [editScheduledTime, setEditScheduledTime] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: [`/api/moments/${id}`],
    queryFn: () => apiRequest<MomentDetail>("GET", `/api/moments/${id}`),
    enabled: !!user && !!id,
    refetchInterval: 30_000,
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/moments/${id}/seed-post`, {
      reflectionText: seedText.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/moments/${id}`] });
      setSeedText("");
      setShowSeedForm(false);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/moments/${id}/archive`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
      setLocation("/dashboard");
    },
  });

  const [deleteError, setDeleteError] = useState("");
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/moments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
      setLocation("/dashboard");
    },
    onError: (err: Error) => {
      setDeleteError(err.message || "Failed to delete. Try again.");
    },
  });

  const inviteMutation = useMutation({
    mutationFn: (people: { name: string; email: string }[]) =>
      apiRequest("POST", `/api/moments/${id}/invite`, { people }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/moments/${id}`] });
      setShowInvite(false);
      setInvitePeople([]);
    },
  });

  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  const removeMemberMutation = useMutation({
    mutationFn: (email: string) =>
      apiRequest("DELETE", `/api/moments/${id}/members/${encodeURIComponent(email)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/moments/${id}`] });
      setRemovingEmail(null);
    },
  });

  // Bell mutation removed — time is edited via the practice edit form

  const editMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/moments/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/moments/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
      setEditingPractice(false);
    },
  });

  const updateGoalMutation = useMutation({
    mutationFn: (payload: { commitmentSessionsGoal: number | null; commitmentTendFreely?: boolean }) =>
      apiRequest("PATCH", `/api/moments/${id}/goal`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/moments/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
    },
  });

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-3 pt-4">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-card border border-border animate-pulse" />)}
        </div>
      </Layout>
    );
  }

  if (!data) return null;

  const { moment, members, memberCount, myStreak, myUserToken, myPersonalTime, myPersonalTimezone, windows, seedPosts, todayPostCount, todayLogs, isCreator } = data;

  const parsedPracticeDays = parsePracticeDays(moment.practiceDays);
  const isIntercession = moment.templateType === "intercession";
  const isContemplative = moment.templateType === "contemplative";
  const isFasting = moment.templateType === "fasting";
  const isSpiritual = SPIRITUAL_TEMPLATE_IDS.has(moment.templateType ?? "");
  // Use the backend's computed windowOpen for all practices — it checks day-of-week + time window
  const isOpenNow = data.windowOpen;

  // Intercession: Pray button always accessible (prayer can be read any time; Amen only logs when window open)
  const postUrl = myUserToken
    ? (isIntercession || isOpenNow) ? `/moment/${moment.momentToken}/${myUserToken}` : null
    : null;

  // Label for action button — context-sensitive
  const actionLabel = isIntercession ? "Pray 🙏" : "Log 🌿";

  // Intention display — for intercession, show intercessionTopic if it differs from the practice name
  const intercessionLabel = moment.intercessionTopic ?? moment.intention;
  const showIntercessionLabel = isIntercession && !!intercessionLabel &&
    intercessionLabel.toLowerCase() !== moment.name.toLowerCase();
  const intentionDisplay = isIntercession
    ? intercessionLabel
    : moment.intention;

  return (
    <Layout>
      <div className="pb-20 max-w-2xl mx-auto">

        {/* Back */}
        <Link
          href="/moments"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-5 transition-colors"
        >
          ← Your practices
        </Link>

        {/* Header */}
        <div className="mb-5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold text-foreground mb-1">{moment.name}</h1>
            <button
              onClick={() => setShowInvite(true)}
              className="shrink-0 mt-0.5 text-xs font-medium text-[#6B8F71] border border-[#6B8F71]/40 rounded-full px-3 py-1.5 hover:bg-[#6B8F71]/8 transition-colors whitespace-nowrap"
            >
              + Invite 🌿
            </button>
          </div>

          {/* Intercession: "Praying for" — only when label differs from name; others: italic intention */}
          {showIntercessionLabel ? (
            <p className="text-sm text-[#6B8F71] mb-1.5">
              Praying for: {intentionDisplay}
            </p>
          ) : !isIntercession && moment.intention ? (
            <p className="text-sm text-muted-foreground italic mb-1.5">"{moment.intention}"</p>
          ) : null}

          <p className="text-xs text-muted-foreground">
            {scheduleLabel(moment.frequency, moment.scheduledTime, moment.dayOfWeek, parsedPracticeDays, moment.timeOfDay)}
          </p>

          {/* Bell removed — logging window is ±2 hours around scheduled time */}

          {/* Member names as tappable links + together count */}
          {members.length > 0 && (() => {
            const togetherCount = windows.filter(w => w.postCount >= 2).length;
            const isPrayer = ["intercession", "morning-prayer", "evening-prayer"].includes(moment.templateType ?? "");
            const togetherVerb = isPrayer ? "prayed" : "practiced";
            const MAX = 4;
            const shown = members.length <= MAX ? members : members.slice(0, MAX - 1);
            const extra = members.length > MAX ? members.length - (MAX - 1) : 0;
            return (
              <div className="mt-2 space-y-0.5">
                <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                  {shown.map((m, i) => (
                    <span key={m.email}>
                      <Link
                        href={`/people/${encodeURIComponent(m.email)}`}
                        className="text-sm text-muted-foreground/70 hover:text-primary transition-colors"
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        {(m.name ?? m.email).split(" ")[0]}
                      </Link>
                      {(i < shown.length - 1 || extra > 0) && <span className="text-muted-foreground/40"> ·</span>}
                    </span>
                  ))}
                  {extra > 0 && <span className="text-sm text-muted-foreground/50">+{extra} more</span>}
                </div>
                <p className="text-xs text-muted-foreground/50">
                  🤝 {togetherCount} {togetherCount === 1 ? "time" : "times"} {togetherVerb} together
                </p>
              </div>
            );
          })()}
        </div>

        {/* Contemplative Prayer — duration card */}
        {isContemplative && moment.contemplativeDurationMinutes && (
          <div className="mb-5 bg-[#F5F0FF] border border-[#8B7CF6]/25 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">🕯️</span>
            <div>
              <p className="text-sm font-semibold text-[#5B4B9A]">
                {moment.contemplativeDurationMinutes} minutes of silence together
              </p>
              <p className="text-xs text-[#5B4B9A]/70 mt-0.5">Everyone sits for the same length, wherever they are</p>
            </div>
          </div>
        )}

        {/* Fasting — what & why cards */}
        {isFasting && (
          <div className="mb-5 space-y-2">
            {moment.fastingFrom && (
              <div className="bg-[#F0F8F0] border border-[#6B8F71]/25 rounded-2xl px-4 py-3 flex items-start gap-3">
                <span className="text-xl mt-0.5">🌿</span>
                <div>
                  <p className="text-xs font-semibold text-[#4a6b50] uppercase tracking-wider mb-0.5">Fasting from</p>
                  <p className="text-sm text-[#3a5a40]">{moment.fastingFrom}</p>
                </div>
              </div>
            )}
            {moment.fastingIntention && (
              <div className="bg-[#FFF8EC] border border-[#C17F24]/25 rounded-2xl px-4 py-3 flex items-start gap-3">
                <span className="text-xl mt-0.5">🙏</span>
                <div>
                  <p className="text-xs font-semibold text-[#C17F24] uppercase tracking-wider mb-0.5">Intention</p>
                  <p className="text-sm text-[#8B5E1A]">{moment.fastingIntention}</p>
                </div>
              </div>
            )}
            {(moment.fastingFrequency || moment.fastingDate) && (
              <div className="bg-secondary/40 border border-border/60 rounded-2xl px-4 py-3 flex items-start gap-3">
                <span className="text-xl mt-0.5">📅</span>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">When</p>
                  <p className="text-sm text-foreground/80">
                    {moment.fastingFrequency === "specific" && moment.fastingDate
                      ? new Date(moment.fastingDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
                      : moment.fastingFrequency === "weekly" && moment.fastingDay
                        ? `Every ${moment.fastingDay.charAt(0).toUpperCase() + moment.fastingDay.slice(1)}`
                        : moment.fastingFrequency === "monthly" && moment.fastingDayOfMonth
                          ? `Monthly · the ${moment.fastingDayOfMonth}${["st","nd","rd"][((moment.fastingDayOfMonth % 100 - 11) % 10 - 1 + 3) % 3] ?? "th"}`
                          : ""}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Open Now Banner — only when actually open */}
        {isOpenNow ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 flex items-center justify-between bg-[#FFF8EC] border border-[#C17F24]/30 rounded-2xl px-4 py-3"
          >
            <div>
              <p className="text-sm font-semibold text-[#C17F24]">
                {isIntercession ? "🙏 Open today · Pray together" : "🌿 Open today"}
              </p>
              <p className="text-xs text-[#C17F24]/70 mt-0.5">
                {todayPostCount} of {memberCount} {isIntercession ? "have prayed" : "logged"}
              </p>
            </div>
            {postUrl && (
              <Link href={postUrl}>
                <span className="text-sm font-medium text-white bg-[#6B8F71] rounded-full px-4 py-2 hover:bg-[#5a7a60] transition-colors whitespace-nowrap">
                  {actionLabel}
                </span>
              </Link>
            )}
          </motion.div>
        ) : (
          /* Not open: next-practice card */
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 bg-card border border-border/60 rounded-2xl px-4 py-4 flex items-center justify-between"
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                Next {isIntercession ? "prayer" : "practice"}
              </p>
              <p className="text-base font-semibold text-foreground capitalize">
                {nextPracticeLabel(moment.frequency, moment.scheduledTime, moment.dayOfWeek, parsedPracticeDays, moment.timeOfDay)}
              </p>
            </div>
            {isIntercession && postUrl ? (
              <Link href={postUrl}>
                <span className="shrink-0 text-sm font-medium text-[#6B8F71] border border-[#6B8F71]/40 rounded-full px-4 py-2 hover:bg-[#6B8F71]/5 transition-colors cursor-pointer whitespace-nowrap">
                  Pray 🙏
                </span>
              </Link>
            ) : (
              <span className="text-2xl" aria-hidden>🌿</span>
            )}
          </motion.div>
        )}

        {/* Stats: Your streak / Group streak / Group best */}
        {(() => {
          const bloomThreshold = Math.max(2, Math.ceil(memberCount / 2));
          const todayBloomed = todayPostCount >= bloomThreshold && memberCount >= 2;
          const groupStreak = todayBloomed && moment.currentStreak === 0 ? 1 : moment.currentStreak;
          const groupBest = Math.max(groupStreak, moment.longestStreak);
          // Personal: if I've logged today and myStreak is 0, show optimistic 1
          const iLoggedToday = todayPostCount >= 1; // approximate — server sets myStreak accurately
          const displayMyStreak = myStreak > 0 ? myStreak : (iLoggedToday ? 1 : 0);
          return (
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-card border border-border/60 rounded-2xl p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{displayMyStreak}</p>
                <p className="text-xs text-muted-foreground mt-1">🙏 Your streak</p>
              </div>
              <div className="bg-card border border-border/60 rounded-2xl p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{groupStreak}</p>
                <p className="text-xs text-muted-foreground mt-1">🔥 Group streak</p>
              </div>
              <div className="bg-card border border-border/60 rounded-2xl p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{groupBest}</p>
                <p className="text-xs text-muted-foreground mt-1">⭐ Group best</p>
              </div>
            </div>
          );
        })()}

        {/* Progressive Goal Display */}
        {(() => {
          const sessionsGoal = moment.commitmentSessionsGoal ?? null;
          const sessionsLogged = moment.commitmentSessionsLogged ?? 0;
          const tendFreely = moment.commitmentTendFreely ?? false;
          const freq = moment.frequency;
          const daysPerWeek = moment.frequencyDaysPerWeek ?? null;
          const ladder = getGoalLadder(freq, daysPerWeek);
          const unitLabel = freq === "daily" ? "day" : "session";
          const unitLabelPlural = freq === "daily" ? "days" : "sessions";

          // Tend freely — minimal display
          if (tendFreely) {
            return (
              <div className="mb-6 text-center py-3">
                <p className="text-sm text-muted-foreground italic" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                  🌿 Tending freely · {sessionsLogged} {unitLabelPlural} together so far
                </p>
              </div>
            );
          }

          // No goal set (legacy practice or BCP without sessions goal)
          if (!sessionsGoal) {
            // Fall back to old goalDays display if available
            const dur = moment.commitmentDuration ?? moment.goalDays ?? 0;
            if (dur === 0) return null;
            const daysDone = Math.min(moment.currentStreak, dur);
            const progressPct = dur > 0 ? Math.min(100, (daysDone / dur) * 100) : 0;
            return (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                    {dur}-day commitment
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {progressPct >= 100 ? "🌾 Complete" : progressPct < 50 ? "Taking root" : "Growing"}
                  </span>
                </div>
                <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                  <motion.div className="h-full bg-[#6B8F71] rounded-full"
                    initial={{ width: 0 }} animate={{ width: `${daysDone > 0 ? Math.max(progressPct, 3) : 0}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">{daysDone} day{daysDone === 1 ? "" : "s"} together so far</p>
              </div>
            );
          }

          const goalHit = sessionsLogged >= sessionsGoal;
          const almostThere = !goalHit && (sessionsGoal - sessionsLogged) <= 3;
          const remaining = Math.max(0, sessionsGoal - sessionsLogged);
          const progressPct = Math.min(100, (sessionsLogged / sessionsGoal) * 100);

          // Goal hit — celebration state + next goal nudge
          if (goalHit) {
            const nextGoal = getNextGoalInLadder(ladder, sessionsGoal);
            const card = nextGoalCard(nextGoal, freq);
            const isOngoing = !nextGoal;

            return (
              <div className="mb-6">
                {/* Celebration */}
                <div className="text-center py-4 mb-4">
                  <p className="text-3xl mb-2">🌸</p>
                  <p className="text-lg font-semibold text-[#2C1A0E]" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                    You showed up {sessionsLogged} times together.
                  </p>
                  <p className="text-sm text-[#6B8F71] italic mt-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                    That's not nothing. That's a real thing you built.
                  </p>
                </div>

                {/* Next goal nudge */}
                {card && (
                  <div className="bg-card border border-border/60 rounded-2xl p-5 mb-3">
                    <p className="text-sm font-medium text-muted-foreground mb-3" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                      Ready to go further? 🌿
                    </p>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-2xl">{card.emoji}</span>
                      <div>
                        <p className="font-semibold text-[#2C1A0E]" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                          {card.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{card.sub}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => updateGoalMutation.mutate({
                        commitmentSessionsGoal: isOngoing ? null : nextGoal,
                        commitmentTendFreely: isOngoing,
                      })}
                      disabled={updateGoalMutation.isPending}
                      className="w-full py-3 rounded-xl bg-[#6B8F71] text-white font-semibold text-sm transition-all hover:bg-[#5a7a60] disabled:opacity-50"
                      style={{ fontFamily: "Space Grotesk, sans-serif" }}
                    >
                      {updateGoalMutation.isPending ? "Setting..."
                        : isOngoing ? "Keep going ✨"
                        : `Set this as your next goal 🌿`}
                    </button>
                    {!isOngoing && (
                      <button
                        onClick={() => updateGoalMutation.mutate({ commitmentSessionsGoal: null, commitmentTendFreely: true })}
                        className="w-full mt-2 py-2 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                        style={{ fontFamily: "Space Grotesk, sans-serif" }}
                      >
                        Tend freely for now ✨
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          }

          // Active goal — progress bar
          const barColor = almostThere ? "#C17F24" : "#6B8F71";
          return (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                  {goalLabel(sessionsGoal, freq)} goal
                </span>
                <span className={`text-xs ${almostThere ? "text-[#C17F24] font-medium" : "text-muted-foreground"}`}>
                  {almostThere ? "Almost there 🌸" : `${remaining} to go 🌿`}
                </span>
              </div>
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${almostThere ? "animate-[goal-pulse_2s_ease-in-out_infinite]" : ""}`}
                  style={{ backgroundColor: barColor }}
                  initial={{ width: 0 }}
                  animate={{ width: `${sessionsLogged > 0 ? Math.max(progressPct, 3) : 0}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {sessionsLogged} of {sessionsGoal} {unitLabelPlural} · {remaining} to go 🌿
              </p>
            </div>
          );
        })()}

        {/* ── LOG TIMELINE ─────────────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Log Timeline</span>
            <div className="flex-1 h-px bg-border/40" />
          </div>

          {/* TODAY — per-member status (only on practice days) */}
          {isTodayPracticeDay(moment.frequency, moment.dayOfWeek, parsedPracticeDays) && (
            <div className="mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">Today</p>
              <div className="bg-card border border-border/60 rounded-2xl divide-y divide-border/20 overflow-hidden">
                {todayLogs.map((log, i) => {
                  const firstName = (log.name || log.email || "?").split(" ")[0];
                  const initials = (log.name || log.email || "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
                  const loggedTime = log.loggedAt
                    ? new Date(log.loggedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()
                    : null;
                  return (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      {/* Avatar */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold ${
                        log.loggedAt
                          ? "bg-[#6B8F71]/15 text-[#4a6b50]"
                          : "bg-secondary/60 text-muted-foreground/50"
                      }`}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground/90">{firstName}</p>
                        {log.reflectionText && (
                          <p className="text-xs text-muted-foreground italic truncate">"{log.reflectionText}"</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        {loggedTime ? (
                          <p className="text-xs text-[#6B8F71] font-medium">
                            {isFasting
                              ? "Fasting · all day"
                              : ["intercession", "morning-prayer", "evening-prayer"].includes(moment.templateType ?? "")
                              ? `Prayed · ${loggedTime}`
                              : isContemplative
                              ? `In silence · ${loggedTime}`
                              : `Practiced · ${loggedTime}`}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground/40">Not yet 🌱</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* RECENT — last 5 windows with at least one post */}
          {(() => {
            const recentWindows = [...windows]
              .filter(w => w.posts.length > 0)
              .sort((a, b) => b.windowDate.localeCompare(a.windowDate))
              .slice(0, 5);
            if (recentWindows.length === 0) return (
              <p className="text-xs text-muted-foreground/50 italic text-center py-4">
                No practice sessions yet — be the first to log 🌿
              </p>
            );
            return (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">Recent</p>
                <div className="space-y-3">
                  {recentWindows.map(win => {
                    const date = parseISO(win.windowDate);
                    const today = new Date().toISOString().slice(0, 10);
                    const dateLabel = win.windowDate === today ? "Today" : format(date, "EEE, MMM d");
                    return (
                      <div key={win.id} className="bg-card border border-border/60 rounded-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/20">
                          <p className="text-xs font-semibold text-foreground/70">{dateLabel}</p>
                          <span className="text-xs text-muted-foreground/50">
                            {STATUS_ICON[win.status] ?? ""} {STATUS_LABEL[win.status] ?? win.status}
                          </span>
                        </div>
                        <div className="divide-y divide-border/20">
                          {win.posts.map((post, i) => {
                            const firstName = (post.guestName ?? "Someone").split(" ")[0];
                            const loggedTime = post.loggedAt
                              ? new Date(post.loggedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()
                              : null;
                            return (
                              <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                                <p className="text-xs font-semibold text-foreground/70 shrink-0 mt-0.5 w-16 truncate">{firstName}</p>
                                <div className="flex-1 min-w-0">
                                  {post.reflectionText ? (
                                    <p className="text-xs text-muted-foreground italic line-clamp-2">"{post.reflectionText}"</p>
                                  ) : post.isCheckin ? (
                                    <p className="text-xs text-muted-foreground">
                                      {isFasting
                                        ? "✓ fasted"
                                        : ["intercession", "morning-prayer", "evening-prayer"].includes(moment.templateType ?? "")
                                        ? "✓ prayed"
                                        : isContemplative
                                        ? "✓ sat"
                                        : "✓ practiced"}
                                    </p>
                                  ) : null}
                                </div>
                                {loggedTime && (
                                  <p className="text-[11px] text-muted-foreground/40 shrink-0">{loggedTime}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── Settings section — always visible on mobile ──────────────────── */}
        <div className="border-t border-border/30 pt-5">
          <button
            onClick={() => setShowManage(m => !m)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2 px-1 -mx-1 rounded-lg"
          >
            <span>⚙️</span>
            <span className="font-medium">Settings</span>
            <span className="text-xs opacity-50">{showManage ? "▲" : "▼"}</span>
          </button>

          {showManage && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="mt-4 space-y-3"
            >
              {/* Edit practice */}
              {!editingPractice ? (
                <div className="flex items-start justify-between bg-card border border-border/60 rounded-2xl px-5 py-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Edit practice</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Change name, intention, or goal.</p>
                  </div>
                  <button
                    onClick={() => {
                      setEditName(moment.name);
                      setEditIntention(moment.intention ?? "");
                      setEditGoalDays(moment.goalDays);
                      setEditScheduledTime(moment.scheduledTime);
                      setEditingPractice(true);
                    }}
                    className="shrink-0 ml-4 text-xs font-medium text-[#6B8F71] border border-[#6B8F71]/40 rounded-full px-4 py-2 hover:bg-[#6B8F71]/8 transition-colors min-h-[36px]"
                  >
                    Edit
                  </button>
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-card border border-[#6B8F71]/30 rounded-2xl px-5 py-4 space-y-4"
                >
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      maxLength={100}
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:border-[#6B8F71] focus:ring-2 focus:ring-[#6B8F71]/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Intention</label>
                    <textarea
                      value={editIntention}
                      onChange={e => setEditIntention(e.target.value)}
                      maxLength={500}
                      rows={2}
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:border-[#6B8F71] focus:ring-2 focus:ring-[#6B8F71]/20 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Goal (days)</label>
                    <input
                      type="number"
                      value={editGoalDays}
                      onChange={e => setEditGoalDays(Math.max(0, Math.min(365, parseInt(e.target.value) || 0)))}
                      min={0}
                      max={365}
                      className="w-24 border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:border-[#6B8F71] focus:ring-2 focus:ring-[#6B8F71]/20"
                    />
                  </div>
                  {!isFasting && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Scheduled time</label>
                      <input
                        type="time"
                        value={editScheduledTime}
                        onChange={e => setEditScheduledTime(e.target.value)}
                        className="border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:border-[#6B8F71] focus:ring-2 focus:ring-[#6B8F71]/20"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Everyone can log ±2 hours around this time.</p>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        const payload: Record<string, unknown> = {};
                        if (editName.trim() && editName !== moment.name) payload.name = editName.trim();
                        if (editIntention !== (moment.intention ?? "")) payload.intention = editIntention;
                        if (editGoalDays !== moment.goalDays) payload.goalDays = editGoalDays;
                        if (editScheduledTime && editScheduledTime !== moment.scheduledTime) payload.scheduledTime = editScheduledTime;
                        if (Object.keys(payload).length > 0) {
                          editMutation.mutate(payload);
                        } else {
                          setEditingPractice(false);
                        }
                      }}
                      disabled={editMutation.isPending || !editName.trim()}
                      className="text-sm font-semibold text-white bg-[#6B8F71] rounded-full px-5 py-2.5 hover:bg-[#5a7d60] transition-colors disabled:opacity-50"
                    >
                      {editMutation.isPending ? "Saving…" : "Save changes"}
                    </button>
                    <button
                      onClick={() => setEditingPractice(false)}
                      className="text-sm text-muted-foreground px-3 py-2.5 hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Members — creator can remove */}
              {isCreator && members.length > 1 && (
                <div className="bg-card border border-border/60 rounded-2xl px-5 py-4">
                  <p className="text-sm font-medium text-foreground mb-3">Members</p>
                  <div className="space-y-2">
                    {members.map(m => {
                      const isMe = m.email.toLowerCase() === user?.email?.toLowerCase();
                      const isRemoving = removingEmail === m.email;
                      return (
                        <div key={m.email} className="flex items-center justify-between py-1.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium shrink-0">
                              {(m.name ?? m.email).charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm text-foreground truncate">{m.name ?? m.email}{isMe ? " (you)" : ""}</p>
                              <p className="text-xs text-muted-foreground/60 truncate">{m.email}</p>
                            </div>
                          </div>
                          {!isMe && (
                            isRemoving ? (
                              <div className="flex items-center gap-2 shrink-0 ml-2">
                                <button
                                  onClick={() => removeMemberMutation.mutate(m.email)}
                                  disabled={removeMemberMutation.isPending}
                                  className="text-xs font-medium text-rose-600 hover:text-rose-700 transition-colors"
                                >
                                  {removeMemberMutation.isPending ? "Removing…" : "Confirm"}
                                </button>
                                <button
                                  onClick={() => setRemovingEmail(null)}
                                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setRemovingEmail(m.email)}
                                className="shrink-0 ml-2 text-xs text-muted-foreground/50 hover:text-rose-500 transition-colors px-2 py-1"
                                title={`Remove ${m.name ?? m.email}`}
                              >
                                ✕
                              </button>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Non-creator: Leave only */}
              {!isCreator && (
                <>
                  {!showLeaveConfirm ? (
                    <div className="flex items-start justify-between bg-card border border-border/60 rounded-2xl px-5 py-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Leave this practice</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Removes it from your garden. History is preserved.</p>
                      </div>
                      <button
                        onClick={() => setShowLeaveConfirm(true)}
                        className="shrink-0 ml-4 text-xs font-medium text-amber-700 border border-amber-300/60 rounded-full px-4 py-2 hover:bg-amber-50 transition-colors min-h-[36px]"
                      >
                        Leave
                      </button>
                    </div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4"
                    >
                      <p className="text-sm font-semibold text-amber-800 mb-1">Leave "{moment.name}"?</p>
                      <p className="text-xs text-amber-700/80 mb-4">
                        You'll no longer receive reminders or appear in this practice. You can always be re-invited.
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => archiveMutation.mutate()}
                          disabled={archiveMutation.isPending}
                          className="text-sm font-semibold text-white bg-amber-600 rounded-full px-5 py-2.5 hover:bg-amber-700 transition-colors disabled:opacity-50"
                        >
                          {archiveMutation.isPending ? "Leaving…" : "Yes, leave it"}
                        </button>
                        <button
                          onClick={() => setShowLeaveConfirm(false)}
                          className="text-sm text-amber-700 px-3 py-2.5 hover:text-amber-900 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}
                </>
              )}

              {/* Creator: Delete */}
              {isCreator && (
                <>
                  {!showDeleteConfirm ? (
                    <div className="flex items-start justify-between bg-card border border-border/60 rounded-2xl px-5 py-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Delete this practice</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Permanently removes it for everyone. Cannot be undone.</p>
                      </div>
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="shrink-0 ml-4 text-xs font-medium text-rose-600 border border-rose-300/60 rounded-full px-4 py-2 hover:bg-rose-50 transition-colors min-h-[36px]"
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-rose-50 border border-rose-200 rounded-2xl px-5 py-4"
                    >
                      <p className="text-sm font-semibold text-rose-800 mb-1">Delete "{moment.name}"?</p>
                      <p className="text-xs text-rose-700/80 mb-4">
                        This cannot be undone. All history, streaks, and reflections will be permanently removed for everyone.
                      </p>
                      {deleteError && (
                        <p className="text-xs text-rose-700 bg-rose-100 rounded-lg px-3 py-2 mb-3">{deleteError}</p>
                      )}
                      <div className="flex gap-3">
                        <button
                          onClick={() => { setDeleteError(""); deleteMutation.mutate(); }}
                          disabled={deleteMutation.isPending}
                          className="text-sm font-semibold text-white bg-rose-600 rounded-full px-5 py-2.5 hover:bg-rose-700 transition-colors disabled:opacity-50"
                        >
                          {deleteMutation.isPending ? "Deleting…" : "Yes, delete it"}
                        </button>
                        <button
                          onClick={() => { setShowDeleteConfirm(false); setDeleteError(""); }}
                          className="text-sm text-rose-700 px-3 py-2.5 hover:text-rose-900 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </div>

      </div>

      {/* ── Invite Sheet ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showInvite && (
          <>
            {/* Backdrop */}
            <motion.div
              key="invite-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setShowInvite(false)}
            />
            {/* Sheet */}
            <motion.div
              key="invite-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <div className="px-5 pt-4 pb-safe-bottom">
                {/* Handle */}
                <div className="w-10 h-1 bg-border/60 rounded-full mx-auto mb-4" />
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-semibold text-foreground">Invite to practice</h2>
                  <button
                    onClick={() => setShowInvite(false)}
                    className="text-muted-foreground hover:text-foreground text-xl leading-none p-1"
                  >
                    ×
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mb-5">
                  Add people to <span className="font-medium text-foreground">{moment.name}</span>
                </p>

                <InviteStep
                  type="practice"
                  onPeopleChange={setInvitePeople}
                />

                <div className="mt-5 pb-6">
                  <button
                    onClick={() => {
                      if (invitePeople.length > 0) inviteMutation.mutate(invitePeople);
                    }}
                    disabled={invitePeople.length === 0 || inviteMutation.isPending}
                    className={`w-full py-3.5 rounded-2xl text-sm font-semibold transition-colors ${
                      invitePeople.length > 0
                        ? "bg-[#6B8F71] text-white hover:bg-[#5a7a60]"
                        : "bg-secondary text-muted-foreground cursor-not-allowed"
                    }`}
                  >
                    {inviteMutation.isPending
                      ? "Inviting…"
                      : invitePeople.length === 0
                        ? "Choose someone to invite"
                        : invitePeople.length === 1
                          ? `Invite ${invitePeople[0].name} 🌿`
                          : `Invite ${invitePeople.length} people 🌿`}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Layout>
  );
}
