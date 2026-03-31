import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WindowPost {
  guestName: string | null;
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
  };
  members: { name: string | null; email: string }[];
  memberCount: number;
  myUserToken: string | null;
  windows: MomentWindow[];
  seedPosts: WindowPost[];
  todayPostCount: number;
  windowOpen: boolean;
  minutesLeft: number;
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

function parsePracticeDays(raw: string | string[] | null | undefined): string[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : null; } catch { return null; }
}

const TIME_OF_DAY_LABELS: Record<string, string> = {
  "early-morning": "early morning", "morning": "morning", "midday": "midday",
  "afternoon": "afternoon", "late-afternoon": "late afternoon", "evening": "evening", "night": "night",
};

// Convert a 24h hour to a friendly time-of-day label
function clockToTimeLabel(scheduledTime: string): string {
  const [h] = scheduledTime.split(":").map(Number);
  if (h < 6) return "early morning";
  if (h < 12) return "morning";
  if (h < 14) return "midday";
  if (h < 17) return "afternoon";
  if (h < 20) return "evening";
  return "night";
}

function scheduleLabel(frequency: string, scheduledTime: string, dayOfWeek?: string | null, practiceDays?: string[] | null, timeOfDay?: string | null): string {
  const todLabel = timeOfDay ? (TIME_OF_DAY_LABELS[timeOfDay] ?? timeOfDay) : clockToTimeLabel(scheduledTime);
  if (frequency === "daily") return `Every ${todLabel}`;
  if (frequency === "weekly") {
    if (practiceDays && practiceDays.length > 1) {
      const names = practiceDays.map(d => DAY_NAMES[d]?.slice(0, 3) ?? d).join(", ");
      return `${names} ${todLabel}`;
    }
    if (dayOfWeek) return `Every ${DAY_NAMES[dayOfWeek] ?? dayOfWeek} ${todLabel}`;
    return `Weekly ${todLabel}`;
  }
  return `Monthly ${todLabel}`;
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

// Next practice description — always uses friendly time-of-day words
function nextPracticeLabel(frequency: string, scheduledTime: string, dayOfWeek?: string | null, practiceDays?: string[] | null, timeOfDay?: string | null): string {
  const todLabel = timeOfDay ? (TIME_OF_DAY_LABELS[timeOfDay] ?? timeOfDay) : clockToTimeLabel(scheduledTime);
  const today = new Date().getDay(); // 0=Sun
  const pastTime = isPastScheduledTime(scheduledTime);

  if (frequency === "daily") {
    return pastTime ? `Tomorrow ${todLabel}` : `Today ${todLabel}`;
  }

  if (frequency === "weekly") {
    const days = practiceDays && practiceDays.length > 0 ? practiceDays : (dayOfWeek ? [dayOfWeek] : []);
    if (days.length === 0) return `Next practice ${todLabel}`;

    for (let i = 0; i <= 7; i++) {
      const checkDow = (today + i) % 7;
      const isDayMatch = days.some(d => DAY_DOW[d] === checkDow);
      if (isDayMatch) {
        if (i === 0 && !pastTime) return `Today ${todLabel}`;
        if (i === 1 || (i === 0 && pastTime)) return `Tomorrow ${todLabel}`;
        const name = Object.keys(DAY_DOW).find(k => DAY_DOW[k] === checkDow);
        return `${name ? DAY_NAMES[name] : "Next"} ${todLabel}`;
      }
    }
  }
  return `Next practice ${todLabel}`;
}

const STATUS_ICON: Record<string, string> = { bloom: "🌸", solo: "👤", wither: "🥀" };
const STATUS_LABEL: Record<string, string> = { bloom: "Bloomed", solo: "Solo", wither: "Withered" };
const STATUS_COLOR: Record<string, string> = { bloom: "text-[#6B8F71]", solo: "text-amber-600", wither: "text-rose-400/80" };

// ─── Window History Entry ─────────────────────────────────────────────────────

function WindowEntry({ win }: { win: MomentWindow }) {
  const date = parseISO(win.windowDate);
  const today = new Date().toISOString().slice(0, 10);
  const isToday = win.windowDate === today;
  return (
    <div className="flex gap-4 py-3 border-b border-border/30 last:border-0">
      <div className="w-20 shrink-0 pt-0.5">
        <p className="text-xs font-medium text-foreground/80">{isToday ? "Today" : format(date, "MMM d")}</p>
        <p className="text-[11px] text-muted-foreground/60">{format(date, "EEEE")}</p>
      </div>
      <div className="w-20 shrink-0 flex items-start gap-1.5 pt-0.5">
        <span className="text-base leading-none">{STATUS_ICON[win.status] ?? "·"}</span>
        <span className={`text-xs font-medium ${STATUS_COLOR[win.status] ?? "text-muted-foreground"}`}>
          {STATUS_LABEL[win.status] ?? win.status}
        </span>
      </div>
      <div className="flex-1">
        {win.posts.length === 0 ? (
          <p className="text-xs text-muted-foreground/50 italic">No one showed up</p>
        ) : (
          <div className="space-y-2">
            {win.posts.map((post, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-xs font-medium text-foreground/80 shrink-0 mt-0.5">
                  {(post.guestName ?? "Someone").split(" ")[0]}
                </span>
                {post.reflectionText && (
                  <p className="text-xs text-muted-foreground italic line-clamp-2">"{post.reflectionText}"</p>
                )}
                {post.isCheckin && !post.reflectionText && (
                  <span className="text-xs text-muted-foreground">✓ showed up</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

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
      setLocation("/moments");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/moments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
      setLocation("/moments");
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

  const { moment, members, memberCount, myUserToken, windows, seedPosts, todayPostCount } = data;
  const progress = goalProgress(moment.createdAt, moment.goalDays);

  const parsedPracticeDays = parsePracticeDays(moment.practiceDays);
  const isIntercession = moment.templateType === "intercession";
  const isSpiritual = SPIRITUAL_TEMPLATE_IDS.has(moment.templateType ?? "");
  const practiceDay = isTodayPracticeDay(moment.frequency, moment.dayOfWeek, parsedPracticeDays);
  const pastTime = isPastScheduledTime(moment.scheduledTime);
  const isOpenNow = isSpiritual ? (practiceDay && pastTime) : data.windowOpen;

  // Intercession: Pray button always accessible (prayer can be read any time; Amen only logs when window open)
  const postUrl = myUserToken
    ? (isIntercession || isOpenNow) ? `/moment/${moment.momentToken}/${myUserToken}` : null
    : null;

  // Label for action button — context-sensitive
  const actionLabel = isIntercession ? "Pray 🙏" : "Log 🌿";

  // Intention display
  const intentionDisplay = isIntercession
    ? (moment.intercessionTopic ?? moment.intention)
    : moment.intention;

  return (
    <Layout>
      <div className="pb-20 max-w-2xl mx-auto">

        {/* Back */}
        <button
          onClick={() => setLocation("/moments")}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-5 transition-colors"
        >
          ← Your practices
        </button>

        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-semibold text-foreground mb-1">{moment.name}</h1>

          {/* Intercession: "Praying for" — others: italic intention */}
          {isIntercession ? (
            <p className="text-sm text-[#6B8F71] mb-1.5">
              Praying for: {intentionDisplay}
            </p>
          ) : moment.intention ? (
            <p className="text-sm text-muted-foreground italic mb-1.5">"{moment.intention}"</p>
          ) : null}

          <p className="text-xs text-muted-foreground">
            {scheduleLabel(moment.frequency, moment.scheduledTime, moment.dayOfWeek, parsedPracticeDays, moment.timeOfDay)}
          </p>
        </div>

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

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-card border border-border/60 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{moment.currentStreak}</p>
            <p className="text-xs text-muted-foreground mt-1">🔥 Current streak</p>
          </div>
          <div className="bg-card border border-border/60 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{moment.longestStreak}</p>
            <p className="text-xs text-muted-foreground mt-1">⭐ Best streak</p>
          </div>
          <div className="bg-card border border-border/60 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{moment.totalBlooms}</p>
            <p className="text-xs text-muted-foreground mt-1">🌸 Blooms</p>
          </div>
        </div>

        {/* Goal Progress */}
        {moment.goalDays > 0 && (() => {
          const goalLabel =
            moment.goalDays === 3  ? "🌱 Three days together" :
            moment.goalDays === 7  ? "🌿 One week together" :
            moment.goalDays === 14 ? "🌸 Two weeks together" :
            `${moment.goalDays}-day goal`;
          const progressLabel =
            progress === 0   ? "Just planted" :
            progress < 50    ? "Taking root" :
            progress < 100   ? "Growing" :
            "🌾 Harvested";
          return (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                  {goalLabel}
                </span>
                <span className="text-xs text-muted-foreground">{progressLabel}</span>
              </div>
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-[#6B8F71] rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {moment.totalBlooms} practices together so far
              </p>
            </div>
          );
        })()}

        {/* Members */}
        <div className="mb-6">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Members</p>
          <div className="flex flex-wrap gap-2">
            {members.map((m, i) => (
              <span key={i} className="text-xs bg-secondary/50 border border-border/40 rounded-full px-3 py-1.5 text-foreground/80">
                {m.name ?? m.email}
              </span>
            ))}
          </div>
        </div>

        {/* Practice History */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">History</span>
            <div className="flex-1 h-px bg-border/40" />
            <span className="text-xs text-muted-foreground">{windows.length} practices</span>
          </div>

          {windows.length > 0 && (
            <div>
              {seedPosts.length > 0 && (
                <div className="mb-4 bg-[#F4F9F5] border border-[#6B8F71]/20 rounded-2xl px-4 py-3">
                  <p className="text-xs font-medium text-[#4a6b50] mb-2">🌱 Before the first window</p>
                  <div className="space-y-2">
                    {seedPosts.map((post, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-xs font-medium text-[#4a6b50] shrink-0">
                          {(post.guestName ?? "Someone").split(" ")[0]}
                        </span>
                        {post.reflectionText && (
                          <p className="text-xs text-[#4a6b50]/80 italic">"{post.reflectionText}"</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="bg-card border border-border/60 rounded-2xl px-4 divide-y divide-border/20">
                {windows.map(win => (
                  <WindowEntry key={win.id} win={win} />
                ))}
              </div>
            </div>
          )}
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
              {/* Leave / Archive */}
              <div className="flex items-start justify-between bg-card border border-border/60 rounded-2xl px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Leave this practice</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Removes it from your garden. History is preserved.</p>
                </div>
                <button
                  onClick={() => archiveMutation.mutate()}
                  disabled={archiveMutation.isPending}
                  className="shrink-0 ml-4 text-xs font-medium text-amber-700 border border-amber-300/60 rounded-full px-4 py-2 hover:bg-amber-50 transition-colors disabled:opacity-50 min-h-[36px]"
                >
                  {archiveMutation.isPending ? "Leaving…" : "Leave"}
                </button>
              </div>

              {/* Delete */}
              {!showDeleteConfirm ? (
                <div className="flex items-start justify-between bg-card border border-border/60 rounded-2xl px-5 py-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Delete this practice</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Permanently removes it and all history. Cannot be undone.</p>
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
                    This cannot be undone. All history, streaks, and reflections will be permanently removed.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isPending}
                      className="text-sm font-semibold text-white bg-rose-600 rounded-full px-5 py-2.5 hover:bg-rose-700 transition-colors disabled:opacity-50"
                    >
                      {deleteMutation.isPending ? "Deleting…" : "Yes, delete it"}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="text-sm text-rose-700 px-3 py-2.5 hover:text-rose-900 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </div>

      </div>
    </Layout>
  );
}
